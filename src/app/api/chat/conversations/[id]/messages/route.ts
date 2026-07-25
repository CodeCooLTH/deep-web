import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubdomain } from "@/lib/subdomain";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { fileIdExt } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { getMessages, sendMessage, type SenderRole } from "@/services/chat.service";
import { sendOutboundMessage } from "@/services/channel-chat.service";
import { getProductsByIds } from "@/services/product.service";
import { SendChatMessageSchema, ChatMessagesQuerySchema } from "@/lib/validations";
import { CHAT_RATE_LIMIT_MAX, CHAT_RATE_LIMIT_WINDOW_MS } from "@/lib/chat-constants";

// นามสกุลไฟล์ที่ยอมรับสำหรับ chat IMAGE — subset แคบกว่า lib/storage ALLOWED_TYPES กลาง
// (ตัด application/pdf ออก ดู SRS TFR-CHAT-05); เทียบกับ CHAT_IMAGE_ALLOWED_TYPES ใน chat-constants.ts
const CHAT_IMAGE_ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"];

function mapChatServiceError(e: unknown, context: string) {
  if (e instanceof Error && e.message === "CONVERSATION_NOT_FOUND") {
    return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });
  }
  if (e instanceof Error && e.message === "FORBIDDEN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }, { status: 403 });
  }
  if (e instanceof Error && e.message === "SHOP_NOT_FOUND") {
    // defense เท่านั้น — ไม่ควรเกิดจริง (FK CASCADE) ดู chat.service.ts sendMessage
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
  }
  if (e instanceof Error && e.message === "PRODUCT_NOT_IN_SHOP") {
    // extension #1 Chat Product Context Card — cross-shop injection guard (FR-CTX-07)
    return NextResponse.json({ error: "ไม่พบสินค้านี้ในร้านค้านี้" }, { status: 400 });
  }
  if (e instanceof Error && e.message === "WINDOW_CLOSED") {
    // feature 00018: เกิน 24 ชม. นับจากข้อความล่าสุดของลูกค้า — Meta ไม่ให้ส่ง
    return NextResponse.json(
      { error: "เกิน 24 ชั่วโมงนับจากข้อความล่าสุดของลูกค้า — ส่งข้อความไม่ได้จนกว่าลูกค้าจะทักมาใหม่" },
      { status: 409 },
    );
  }
  if (e instanceof Error && e.message === "NOT_EXTERNAL_CHANNEL") {
    return NextResponse.json({ error: "ช่องทางของบทสนทนานี้ไม่ถูกต้อง" }, { status: 400 });
  }
  if (e instanceof Error && e.message === "CHANNEL_NOT_ACTIVE") {
    // feature 00018 (S-4): token ตายแล้ว (ถูก markChannelTokenInvalid) หรือร้านถอดการเชื่อมต่อไปแล้ว
    // — สาเหตุชัดเจนและแก้ได้เอง (ไปเชื่อม Page ใหม่) ไม่ใช่ generic 500
    return NextResponse.json(
      { error: "การเชื่อมต่อกับช่องทางนี้หมดอายุ กรุณาเชื่อม Facebook Page ใหม่อีกครั้ง" },
      { status: 409 },
    );
  }
  if (e instanceof Error && e.message.startsWith("SEND_FAILED")) {
    return NextResponse.json(
      { error: "ส่งข้อความไปยังช่องทางภายนอกไม่สำเร็จ กรุณาลองใหม่" },
      { status: 502 },
    );
  }
  console.error(`[${context}]`, e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
}

/**
 * GET /api/chat/conversations/[id]/messages — ประวัติข้อความ cursor-paginated (ใหม่→เก่า)
 * ownership verify ใน service (assertParticipant) — ไม่ trust caller
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const { searchParams } = request.nextUrl;
  const rawTake = searchParams.get("take");
  const input = {
    cursor: searchParams.get("cursor") ?? undefined,
    take: rawTake === null ? undefined : Number(rawTake),
  };
  const parsed = v.safeParse(ChatMessagesQuerySchema, input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const result = await getMessages(id, userId, {
      cursor: parsed.output.cursor,
      take: parsed.output.take,
    });

    // extension #1 Chat Product Context Card (S-18) — enrich ข้อความ type='PRODUCT' ด้วย productCard
    // (additive เท่านั้น ไม่แตะ ChatMessageView core); batch fetch กัน N+1
    const productIds = Array.from(
      new Set(
        result.items
          .filter((m) => m.type === "PRODUCT" && m.productRefId)
          .map((m) => m.productRefId as string),
      ),
    );
    const products = productIds.length > 0 ? await getProductsByIds(productIds) : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    // การ์ดออเดอร์/ใบเสนอราคาในแชท (user 2026-07-24) — enrich ข้อความ type='ORDER' ด้วย orderCard
    // (additive เหมือน productCard). token ถูก verify ตอนส่งแล้วว่าเป็นของร้านในเธรดนี้ (sendMessage
    // ORDER guard) จึง live-join ตาม token ได้ตรง ๆ; ลบ order จริง → ไม่พบใน map = null (แสดง empty)
    const orderTokens = Array.from(
      new Set(result.items.filter((m) => m.type === "ORDER" && m.orderRefToken).map((m) => m.orderRefToken as string)),
    );
    const orderRows = orderTokens.length > 0
      ? await prisma.order.findMany({
          where: { publicToken: { in: orderTokens } },
          // user 2026-07-25: การ์ดต้องมีรายการสินค้าข้างใน (ชื่อ/จำนวน/ราคา/รูป) + จำนวนรวม + ยอดสุทธิ
          select: {
            publicToken: true,
            status: true,
            totalAmount: true,
            items: {
              select: { name: true, qty: true, price: true, product: { select: { images: true } } },
            },
          },
        })
      : [];
    const orderMap = new Map(
      orderRows.map((o) => [
        o.publicToken,
        {
          token: o.publicToken,
          status: o.status,
          totalAmount: o.totalAmount.toFixed(2),
          items: o.items.map((it) => ({
            name: it.name,
            qty: it.qty,
            price: it.price.toFixed(2),
            // Product.images = Json (array of fileId) → cast; custom line (productId null) = null
            imageFileId: (it.product?.images as string[] | undefined)?.[0] ?? null,
          })),
        },
      ]),
    );

    // reply quote (feature 00018 Phase 3) — ดึง body/ผู้ส่งของข้อความที่ถูกตอบทับ (replyToMid =
    // externalMessageId) มาแสดง quote. batch fetch กัน N+1, scope conversationId เดียวกัน
    const replyMids = Array.from(
      new Set(
        result.items
          .map((m) => (m as { replyToMid?: string | null }).replyToMid)
          .filter((x): x is string => !!x),
      ),
    );
    const repliedRows =
      replyMids.length > 0
        ? await prisma.chatMessage.findMany({
            where: { externalMessageId: { in: replyMids }, conversationId: id },
            select: { externalMessageId: true, body: true, senderRole: true },
          })
        : [];
    const repliedMap = new Map(
      repliedRows.map((r) => [r.externalMessageId as string, { body: r.body, senderRole: r.senderRole as "BUYER" | "SHOP" }]),
    );

    const items = result.items.map((m) => ({
      ...m,
      replyTo: (() => {
        const rmid = (m as { replyToMid?: string | null }).replyToMid;
        return rmid ? repliedMap.get(rmid) ?? null : null;
      })(),
      productCard:
        m.type === "PRODUCT" && m.productRefId && productMap.has(m.productRefId)
          ? (() => {
              const p = productMap.get(m.productRefId!)!;
              // isActive=false ยัง join ได้ (FR-CTX-08 "หยุดขายแล้ว" ตัดสินใจที่ UI); ลบจริง (ไม่พบใน map) = null
              return { id: p.id, name: p.name, price: p.price, imageFileId: p.images[0] ?? null, isActive: p.isActive };
            })()
          : null,
      orderCard: m.type === "ORDER" && m.orderRefToken ? orderMap.get(m.orderRefToken) ?? null : null,
    }));

    // externalReadAt — watermark "ลูกค้าอ่านถึงเวลานี้" (feature 00018 read receipt)
    // bug fix 2026-07-23 (user report: "อ่านแล้วแต่ไม่ขึ้นว่าอ่านแล้ว"): ค่านี้เดิมส่งลง UI ทาง
    // server prop ของ page.tsx เท่านั้น = อ่านครั้งเดียวตอนเปิดหน้า. read event ของ Meta มาทีหลัง
    // ทาง webhook และ **ไม่ได้ insert ChatMessage** จึงไม่ทริกเกอร์ realtime broadcast → client
    // ไม่มีทางรู้เลยจนกว่าจะรีโหลดหน้าเอง. ส่งมากับ GET นี้ด้วยเพื่อให้ refetch รอบถัดไป (realtime/
    // focus/poll) อัปเดตป้าย "ส่งแล้ว → อ่านแล้ว" ได้เอง
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { externalReadAt: true },
    });
    return NextResponse.json({
      items,
      nextCursor: result.nextCursor,
      externalReadAt: conv?.externalReadAt ? conv.externalReadAt.toISOString() : null,
    });
  } catch (e: unknown) {
    return mapChatServiceError(e, "GET /api/chat/conversations/[id]/messages");
  }
}

/**
 * POST /api/chat/conversations/[id]/messages — ส่งข้อความ TEXT/IMAGE/PRODUCT
 *
 * ทำไม senderRole derive จาก subdomain ไม่รับจาก client body:
 * route รู้ context ของตัวเองอยู่แล้ว (seller.* = SHOP, main = BUYER) — SDS §3.3.
 * service ยัง verify ซ้ำอีกชั้น (กัน client ปลอม แม้ derive ถูกที่ route แล้ว)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const { id } = await params;

  // per-user chat-send rate-limit — ชั้นที่ 2 แยกจาก global per-IP ของ proxy.ts (API.md §6)
  if (!checkApiRateLimit(`chat-send:${userId}`, CHAT_RATE_LIMIT_MAX, CHAT_RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = v.safeParse(SendChatMessageSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }
  const { type, body: text, imageUrl, productRefId, orderRefToken } = parsed.output;

  // conditional-required — Valibot schema เดียวไม่ครอบทุกกรณี (SendChatMessageSchema comment)
  if (type === "TEXT") {
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "กรุณากรอกข้อความ" }, { status: 400 });
    }
  } else if (type === "IMAGE") {
    if (!imageUrl) {
      return NextResponse.json({ error: "กรุณาแนบรูปภาพ" }, { status: 400 });
    }
    // server-side re-check ประเภทไฟล์ — กัน client หลุดผ่านมาด้วย fileId ของไฟล์ที่ไม่ใช่รูป (เช่น .pdf จาก L3 KYC)
    const ext = fileIdExt(imageUrl).toLowerCase();
    if (!CHAT_IMAGE_ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: "รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp)" }, { status: 400 });
    }
  } else if (type === "PRODUCT") {
    // extension #1 Chat Product Context Card (S-18)
    if (!productRefId) {
      return NextResponse.json({ error: "กรุณาระบุสินค้า" }, { status: 400 });
    }
  } else {
    // type === "ORDER" — การ์ดออเดอร์/ใบเสนอราคาในแชท (user 2026-07-24)
    if (!orderRefToken) {
      return NextResponse.json({ error: "กรุณาระบุออเดอร์" }, { status: 400 });
    }
  }

  // derive senderRole จาก subdomain — ห้ามรับจาก client (SRS §10)
  const host = request.headers.get("host") || "";
  const senderRole: SenderRole = getSubdomain(host) === "seller" ? "SHOP" : "BUYER";

  try {
    // feature 00018: เธรดช่องทางนอกต้องส่งออกผ่าน Graph API ไม่ใช่เขียน DB ตรง ๆ
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { channel: true, shopId: true },
    });
    if (conv && conv.channel !== "DEEP") {
      // PRODUCT (การ์ดสินค้า) ยังไม่รองรับบนช่องทางนอก
      if (type === "PRODUCT") {
        return NextResponse.json({ error: "ช่องทางนี้ยังไม่รองรับการ์ดสินค้า" }, { status: 400 });
      }
      // ORDER (การ์ดคำสั่งซื้อ, user 2026-07-25): ลูกค้าฝั่ง Messenger/IG ได้ "ลิงก์" ผ่าน Meta แต่ฝั่งเรา
      // เก็บเป็น type=ORDER → ร้านเห็นเป็นการ์ด (ร้านอยู่ในระบบเรา = การ์ด). verify order-in-shop ที่นี่
      if (type === "ORDER") {
        const order = await prisma.order.findFirst({
          where: { publicToken: orderRefToken!, shopId: conv.shopId },
          select: { totalAmount: true, items: { select: { name: true }, take: 1 } },
        });
        if (!order) {
          return NextResponse.json({ error: "ไม่พบคำสั่งซื้อนี้ในร้าน" }, { status: 400 });
        }
        const base = (process.env.NEXT_PUBLIC_BUYER_URL || "https://deepthailand.app").replace(/\/+$/, "");
        const orderTitle = order.items[0]?.name ?? "คำสั่งซื้อ";
        const orderTotal = `฿${Number(order.totalAmount).toLocaleString("th-TH")}`;
        const linkText = `คำสั่งซื้อ: ${orderTitle}\nยอดสุทธิ ${orderTotal}\n${base}/o/${orderRefToken}`;
        const sent = await sendOutboundMessage({
          conversationId: id,
          actorUserId: userId,
          text: linkText, // ลูกค้าได้ลิงก์นี้
          orderRefToken: orderRefToken!, // ฝั่งเราเก็บเป็นการ์ด
        });
        return NextResponse.json(sent);
      }
      const sent = await sendOutboundMessage({
        conversationId: id,
        actorUserId: userId,
        text: text ?? undefined, // TEXT = ข้อความ, IMAGE = caption (optional)
        imageFileId: type === "IMAGE" ? imageUrl! : undefined,
      });
      return NextResponse.json(sent);
    }

    const message = await sendMessage({
      conversationId: id,
      senderUserId: userId,
      senderRole,
      type,
      body: type === "PRODUCT" || type === "ORDER" ? null : text ?? null, // TEXT = ข้อความหลัก, IMAGE = caption, PRODUCT/ORDER = null
      imageUrl: type === "IMAGE" ? imageUrl ?? null : null,
      productRefId: type === "PRODUCT" ? productRefId ?? null : null,
      orderRefToken: type === "ORDER" ? orderRefToken ?? null : null,
    });
    return NextResponse.json(message);
  } catch (e: unknown) {
    return mapChatServiceError(e, "POST /api/chat/conversations/[id]/messages");
  }
}
