import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubdomain } from "@/lib/subdomain";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { fileIdExt } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { getMessages, sendMessage, type SenderRole } from "@/services/chat.service";
import { sendOutboundMessage, syncMissingMessagesFromMeta, type SendFailedError } from "@/services/channel-chat.service";
import { getProductsByIds } from "@/services/product.service";
import { pushNewChatMessage } from "@/services/seller-push.service";
import { SendChatMessageSchema, ChatMessagesQuerySchema } from "@/lib/validations";
import {
  CHAT_RATE_LIMIT_MAX,
  CHAT_RATE_LIMIT_MAX_SHOP,
  CHAT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/chat-constants";
import { describeSendFailure } from "@/lib/chat-send-failure";
import { EXT_TO_MIME } from "@/lib/attachment-mime";
import {
  attachmentKind,
  checkChannelSupport,
  sanitizeAttachmentName,
  type AttachmentKind,
} from "@/lib/chat-attachment";

// ชนิดข้อความที่ "มีไฟล์แนบ" — ตรวจกฎชุดเดียวกันหมด (2026-08-02 multi-attachment)
// เดิมมีแต่ IMAGE ที่ตรวจด้วย allow-list นามสกุลรูปตายตัว (CHAT_IMAGE_ALLOWED_EXT) — ถอดออกแล้ว
// เพราะกฎย้ายไปอยู่ที่ checkChannelSupport ซึ่งรู้ทั้งชนิดไฟล์และช่องทางปลายทาง
const ATTACHMENT_TYPES = ["IMAGE", "VIDEO", "AUDIO", "FILE"] as const;
function isAttachmentType(t: string): t is AttachmentKind {
  return (ATTACHMENT_TYPES as readonly string[]).includes(t);
}

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
    // feature 00018: หมดหน้าต่างที่ Meta ให้ส่ง — ครอบทั้งเกิน 24 ชม. (เมื่อยังไม่เปิด HUMAN_AGENT)
    // และเกิน 7 วัน (เมื่อเปิดแล้ว) จึงไม่ระบุตัวเลขในข้อความ ปล่อยให้แถบในเธรดบอกรายละเอียดแทน
    // — แถบนั้นรู้ว่าร้านได้ permission human_agent หรือยัง ส่วน route นี้ไม่รู้
    return NextResponse.json(
      { error: "หมดเวลาที่ Meta อนุญาตให้ส่งข้อความในเธรดนี้ — ต้องรอให้ลูกค้าทักเข้ามาใหม่" },
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
    // service โยนเป็น "SEND_FAILED: <ข้อความดิบของ Meta>" — แปลเป็นไทยก่อนส่งให้ร้าน
    // (user report 2026-08-02) เดิมตอบ "กรุณาลองใหม่" ทุกกรณี ซึ่งเป็นคำแนะนำที่ผิดกับ #551
    // (ลูกค้าปิดรับข้อความ — กดกี่ครั้งก็ไม่ผ่าน) ร้านจะกดซ้ำเปล่า ๆ แล้วโทษระบบ
    const { message } = describeSendFailure(e.message.replace(/^SEND_FAILED:\s*/, ""));
    // แนบแถวที่บันทึกไว้แล้วกลับไปด้วย (2026-08-03) — ส่งไม่ผ่าน ≠ ไม่ได้บันทึก
    // client ต้องเอาไปแทนบับเบิล optimistic ของตัวเอง ไม่งั้นข้อความเดียวขึ้นสองอันจนกว่าจะ refresh
    const saved = (e as SendFailedError).savedMessage;
    return NextResponse.json({ error: message, savedMessage: saved ?? null }, { status: 502 });
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
    // เติมข้อความที่ webhook ไม่เคยส่งมา (ตอบกลับอัตโนมัติของ Meta — ดู syncMissingMessagesFromMeta)
    // ทำก่อน getMessages เพื่อให้ข้อความที่เพิ่งเติมโผล่ในรอบเดียวกันเลย ไม่ต้องรอ poll รอบหน้า
    // เฉพาะการโหลดหน้าแรก (ไม่มี cursor) — เลื่อนดูประวัติย้อนหลังไม่ต้อง sync ซ้ำ
    // ฟังก์ชันไม่ throw และมี throttle ในตัว จึงไม่ต้องห่อ try เพิ่มและไม่ถ่วงทุกครั้งที่ poll
    if (!parsed.output.cursor) {
      await syncMissingMessagesFromMeta(id);
    }

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
            orderNo: true,
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
          orderNo: o.orderNo, // เลขคำสั่งซื้อ DP… (user 2026-07-25)
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

    // reply quote (feature 00018 Phase 3) — ดึง body/ผู้ส่งของข้อความที่ถูกตอบทับมาแสดง quote.
    // replyToMid: ช่องทางนอก = externalMessageId (Meta mid); DEEP = id ภายใน (ไม่มี mid) → match ทั้งคู่.
    // batch fetch กัน N+1, scope conversationId เดียวกัน
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
            where: {
              conversationId: id,
              OR: [{ externalMessageId: { in: replyMids } }, { id: { in: replyMids } }],
            },
            select: { id: true, externalMessageId: true, body: true, type: true, senderRole: true },
          })
        : [];
    const repliedMap = new Map<string, { body: string | null; senderRole: "BUYER" | "SHOP" }>();
    for (const r of repliedRows) {
      // ข้อความสื่อ/การ์ด (body=null) → แสดง label แทนช่องว่างใน quote
      const label =
        r.body ??
        ({
          IMAGE: "[รูปภาพ]",
          VIDEO: "[วิดีโอ]",
          AUDIO: "[ข้อความเสียง]",
          FILE: "[ไฟล์แนบ]",
          ORDER: "[คำสั่งซื้อ]",
          PRODUCT: "[สินค้า]",
        }[r.type] ?? null);
      const entry = { body: label, senderRole: r.senderRole as "BUYER" | "SHOP" };
      if (r.externalMessageId) repliedMap.set(r.externalMessageId, entry);
      repliedMap.set(r.id, entry);
    }

    // ผู้ส่งฝั่งร้าน (user 2026-08-02) — avatar ท้ายบับเบิลต้องบอกว่า "ใครในทีมเป็นคนตอบ"
    // ไม่ใช่โลโก้เพจเหมือนกันหมด. ร้านที่มีพนักงานหลายคนย้อนดูไม่ได้เลยว่าใครตอบข้อความไหน
    //
    // senderUserId = null คือข้อความที่มาทาง webhook (echo ของสิ่งที่ส่งจาก Messenger/Business
    // Suite โดยตรง หรือบอทตอบ) — ไม่มี "คน" ให้แสดง จึงตกไปใช้รูปเพจตามเดิม
    //
    // batch fetch กัน N+1; ไม่ select อะไรเกินชื่อ+รูป (ผู้ดูเป็นสมาชิกร้านเดียวกันอยู่แล้ว
    // แต่ไม่มีเหตุผลให้ email/เบอร์ของเพื่อนร่วมทีมหลุดลง flight payload)
    const senderIds = Array.from(
      new Set(
        result.items
          .filter((m) => m.senderRole === "SHOP" && m.senderUserId)
          .map((m) => m.senderUserId as string),
      ),
    );
    const senderRows =
      senderIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: senderIds } },
            select: { id: true, displayName: true, avatar: true },
          })
        : [];
    const senderMap = new Map(
      senderRows.map((u) => [u.id, { name: u.displayName, avatar: u.avatar }]),
    );

    const items = result.items.map((m) => ({
      ...m,
      // null = ไม่มีคนส่ง (webhook/บอท) → UI แสดงรูปเพจ; มีค่า = แสดงรูปคนนั้น + ชื่อตอน hover
      sender:
        m.senderRole === "SHOP" && m.senderUserId ? senderMap.get(m.senderUserId) ?? null : null,
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
/**
 * แนบผู้ส่ง (คนในทีมร้าน) ให้ข้อความที่เพิ่งสร้าง — ให้ shape ตรงกับ GET ซึ่ง enrich `sender` มาแล้ว
 * (user 2026-08-02: avatar ท้ายบับเบิลต้องบอกว่าใครเป็นคนตอบ)
 *
 * ถ้าไม่แนบ บับเบิลที่เพิ่งส่งจะแสดงรูปเพจอยู่พักหนึ่งแล้วเปลี่ยนเป็นรูปคนตอน refetch รอบถัดไป
 * ซึ่งอ่านเหมือนระบบสลับตัวตนของผู้ส่งเอง. PK lookup ครั้งเดียวต่อการส่ง 1 ข้อความ
 */
async function withSender<T extends { senderUserId: string | null }>(message: T, userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, avatar: true },
  });
  return { ...message, sender: u ? { name: u.displayName, avatar: u.avatar } : null };
}

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

  // derive senderRole จาก subdomain — ห้ามรับจาก client (SRS §10)
  // ต้อง derive ก่อน rate-limit เพราะเพดานแยกตามบทบาท (ดูบล็อกถัดไป)
  const host = request.headers.get("host") || "";
  const senderRole: SenderRole = getSubdomain(host) === "seller" ? "SHOP" : "BUYER";

  // per-user chat-send rate-limit — ชั้นที่ 2 แยกจาก global per-IP ของ proxy.ts (API.md §6)
  //
  // เพดานแยกตามบทบาท (2026-08-02): เจตนาเดิมของ BR-CHAT-07 คือกัน "buyer สแปมร้าน"
  // (PRD 00011 ตาราง Risks) แต่พอ multi-attachment ทำให้ 1 ไฟล์ = 1 ข้อความ ร้านที่แนบไฟล์
  // รวดเดียวหลายสิบไฟล์จะโดนกฎที่ตั้งมากันลูกค้า เล่นงานตัวเอง — ผ่อนเฉพาะฝั่งร้านจึงไม่ได้
  // ลดการป้องกันที่ตั้งใจไว้แต่แรกเลย. key ยังเป็น per-user เหมือนเดิม
  const rateMax = senderRole === "SHOP" ? CHAT_RATE_LIMIT_MAX_SHOP : CHAT_RATE_LIMIT_MAX;
  if (!checkApiRateLimit(`chat-send:${userId}`, rateMax, CHAT_RATE_LIMIT_WINDOW_MS)) {
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
  const {
    type,
    body: text,
    imageUrl,
    attachmentName: rawAttachmentName,
    attachmentSize,
    productRefId,
    orderRefToken,
    replyToMessageId,
  } = parsed.output;

  try {
    // feature 00018: เธรดช่องทางนอกต้องส่งออกผ่าน Graph API ไม่ใช่เขียน DB ตรง ๆ
    //
    // ต้อง fetch ก่อน validate (2026-08-02): กฎของไฟล์แนบขึ้นกับช่องทางปลายทาง —
    // .docx ส่ง Messenger ได้แต่ส่ง IG ไม่ได้ จึงตัดสินไม่ได้เลยถ้ายังไม่รู้ว่าเธรดนี้ช่องทางไหน
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: { channel: true, shopId: true },
    });

    // conditional-required — Valibot schema เดียวไม่ครอบทุกกรณี (SendChatMessageSchema comment)
    if (type === "TEXT") {
      if (!text || text.trim().length === 0) {
        return NextResponse.json({ error: "กรุณากรอกข้อความ" }, { status: 400 });
      }
    } else if (isAttachmentType(type)) {
      if (!imageUrl) {
        return NextResponse.json({ error: "กรุณาแนบไฟล์" }, { status: 400 });
      }
      // server-side re-check — กัน client ยิง fileId ของไฟล์ที่ไม่ควรส่ง (เช่น .pdf จาก L3 KYC
      // หรือไฟล์รันได้) เข้ามาตรง ๆ โดยไม่ผ่าน /api/chat/upload
      //
      // WARNING: size ที่ใช้ตรงนี้มาจาก client จึงเป็นแค่ตัวกรองเชิงประสบการณ์ (ให้ error สวย)
      // เพดานขนาดตัวจริงบังคับที่ /api/chat/upload ซึ่งเห็นไฟล์จริง + bucket cap 25MB อีกชั้น
      const ext = fileIdExt(imageUrl).toLowerCase();
      const mime = EXT_TO_MIME[ext] ?? "";
      const check = checkChannelSupport(conv?.channel ?? "DEEP", {
        kind: attachmentKind(mime, ext),
        mime,
        ext,
        size: attachmentSize ?? 0,
      });
      if (!check.ok) {
        return NextResponse.json({ error: check.reason }, { status: 400 });
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

    // sanitize ซ้ำที่ server — ชื่อนี้ไปโผล่ใน Content-Disposition ตอนดาวน์โหลด (header injection)
    const attachmentName = rawAttachmentName ? sanitizeAttachmentName(rawAttachmentName) : null;

    // reply/quote (user 2026-07-25): resolve ข้อความที่ตอบทับ → replyToMid ที่จะเก็บ/ส่ง.
    // ช่องทางนอก = externalMessageId (Meta mid, ต้องมีจึง reply_to ได้); DEEP = id ภายใน (ไม่มี mid).
    let replyToMid: string | null = null;
    if (replyToMessageId) {
      const replied = await prisma.chatMessage.findFirst({
        where: { id: replyToMessageId, conversationId: id },
        select: { id: true, externalMessageId: true },
      });
      if (replied) {
        replyToMid =
          conv && conv.channel !== "DEEP" ? (replied.externalMessageId ?? null) : replied.id;
      }
    }

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
        return NextResponse.json(await withSender(sent, userId));
      }
      const sent = await sendOutboundMessage({
        conversationId: id,
        actorUserId: userId,
        text: text ?? undefined, // TEXT = ข้อความ, ไฟล์แนบ = caption (optional)
        attachment: isAttachmentType(type)
          ? { fileId: imageUrl!, kind: type, name: attachmentName, size: attachmentSize ?? null }
          : undefined,
        replyToMid, // reply/quote — ส่ง reply_to:{mid} ให้ Meta (best-effort) + เก็บ quote ฝั่งเรา
      });
      return NextResponse.json(await withSender(sent, userId));
    }

    const message = await sendMessage({
      conversationId: id,
      senderUserId: userId,
      senderRole,
      type,
      body: type === "PRODUCT" || type === "ORDER" ? null : text ?? null, // TEXT = ข้อความหลัก, ไฟล์แนบ = caption, PRODUCT/ORDER = null
      imageUrl: isAttachmentType(type) ? imageUrl ?? null : null,
      attachmentName: isAttachmentType(type) ? attachmentName : null,
      attachmentSize: isAttachmentType(type) ? attachmentSize ?? null : null,
      productRefId: type === "PRODUCT" ? productRefId ?? null : null,
      orderRefToken: type === "ORDER" ? orderRefToken ?? null : null,
      replyToMid, // reply/quote (DEEP) — id ของข้อความที่ตอบทับ
    });

    // Push เข้าแอปผู้ขาย เมื่อ "ผู้ซื้อ" เป็นคนส่ง (แชท DEEP ในแอป/เว็บผู้ซื้อ)
    //
    // hook ที่ route ไม่ใช่ใน chat.service.sendMessage โดยตั้งใจ: seller-push.service import
    // getConversationToastPreview จาก chat.service อยู่แล้ว ถ้าให้ chat.service เรียกกลับมาก็จะ
    // เป็น circular import ทันที — route เป็นชั้นบนสุด จึงเรียกได้ทางเดียวไม่มีวงกลม
    //
    // ต้องอ่าน shopId ของเธรดเอง (sendMessage คืน ChatMessageView ซึ่งไม่มี shopId) — query เล็ก
    // และอยู่หลังจากงานหลักสำเร็จแล้ว. void + service กลืน error เอง = ส่งไม่ได้ก็ไม่ทำให้การส่ง
    // ข้อความล้มตาม (ข้อความถูกบันทึกไปแล้วตอนนี้)
    if (senderRole === "BUYER") {
      void prisma.conversation
        .findUnique({ where: { id }, select: { shopId: true } })
        .then((c) => (c ? pushNewChatMessage({ shopId: c.shopId, conversationId: id }) : undefined))
        .catch(() => {});
    }

    return NextResponse.json(await withSender(message, userId));
  } catch (e: unknown) {
    return mapChatServiceError(e, "POST /api/chat/conversations/[id]/messages");
  }
}
