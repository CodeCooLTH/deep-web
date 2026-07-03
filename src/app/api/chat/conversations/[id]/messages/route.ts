import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSubdomain } from "@/lib/subdomain";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { fileIdExt } from "@/lib/storage";
import { getMessages, sendMessage, type SenderRole } from "@/services/chat.service";
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
    return NextResponse.json(result);
  } catch (e: unknown) {
    return mapChatServiceError(e, "GET /api/chat/conversations/[id]/messages");
  }
}

/**
 * POST /api/chat/conversations/[id]/messages — ส่งข้อความ TEXT/IMAGE
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
  const { type, body: text, imageUrl } = parsed.output;

  // conditional-required — Valibot schema เดียวไม่ครอบทั้ง 2 กรณี (SendChatMessageSchema comment)
  if (type === "TEXT") {
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "กรุณากรอกข้อความ" }, { status: 400 });
    }
  } else {
    if (!imageUrl) {
      return NextResponse.json({ error: "กรุณาแนบรูปภาพ" }, { status: 400 });
    }
    // server-side re-check ประเภทไฟล์ — กัน client หลุดผ่านมาด้วย fileId ของไฟล์ที่ไม่ใช่รูป (เช่น .pdf จาก L3 KYC)
    const ext = fileIdExt(imageUrl).toLowerCase();
    if (!CHAT_IMAGE_ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: "รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp)" }, { status: 400 });
    }
  }

  // derive senderRole จาก subdomain — ห้ามรับจาก client (SRS §10)
  const host = request.headers.get("host") || "";
  const senderRole: SenderRole = getSubdomain(host) === "seller" ? "SHOP" : "BUYER";

  try {
    const message = await sendMessage({
      conversationId: id,
      senderUserId: userId,
      senderRole,
      type,
      body: text ?? null, // TEXT = ข้อความหลัก, IMAGE = caption (optional)
      imageUrl: type === "IMAGE" ? imageUrl ?? null : null,
    });
    return NextResponse.json(message);
  } catch (e: unknown) {
    return mapChatServiceError(e, "POST /api/chat/conversations/[id]/messages");
  }
}
