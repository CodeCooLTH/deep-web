import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelFailedOutboundMessage, sendOutboundReaction } from "@/services/channel-chat.service";
import { GraphApiError } from "@/lib/facebook/graph";

/**
 * DELETE /api/chat/conversations/[id]/messages/[messageId]
 * — ร้านกด "ยกเลิกการส่งข้อความ" บนบับเบิลที่ยิงออกไม่สำเร็จ (user สั่ง 2026-08-02)
 *
 * ขอบเขตแคบมากโดยตั้งใจ: service ลบได้เฉพาะแถว deliveryStatus='FAILED' ของฝั่งร้านเท่านั้น
 * (ดู cancelFailedOutboundMessage) — route นี้จึงไม่ใช่ "ลบข้อความ" ทั่วไป และห้ามขยายให้เป็น
 * โดยไม่คิดเรื่อง unsend/หลักฐานในเธรดให้จบก่อน
 *
 * ไม่ derive senderRole จาก subdomain เหมือน POST เพราะไม่ได้สร้างข้อความใหม่ — สิทธิ์ตัดสิน
 * จาก canAccessShop ของเธรดใน service ชั้นเดียว
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const { id, messageId } = await params;

  try {
    await cancelFailedOutboundMessage({
      conversationId: id,
      messageId,
      actorUserId: userId,
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "CONVERSATION_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });
    }
    if (msg === "MESSAGE_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบข้อความนี้" }, { status: 404 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }, { status: 403 });
    }
    if (msg === "MESSAGE_NOT_CANCELLABLE") {
      // ยกเลิกได้เฉพาะข้อความที่ยิงออกไม่สำเร็จ — ที่ส่งถึงลูกค้าแล้วต้องใช้ unsend ของ Meta
      return NextResponse.json(
        { error: "ยกเลิกได้เฉพาะข้อความที่ส่งไม่สำเร็จเท่านั้น" },
        { status: 409 },
      );
    }
    console.error("[DELETE /api/chat/conversations/[id]/messages/[messageId]]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

/**
 * POST /api/chat/conversations/[id]/messages/[messageId]/ — ร้านกดรีแอ็กชันใส่ข้อความ
 * (user สั่ง 2026-08-03 "reaction ข้อความด้วย")
 *
 * body: { emoji: string | null }  — null = ถอนรีแอ็กชันออก
 *
 * รับ emoji เป็น UTF-8 ตรง ๆ ตามที่ Send API ต้องการ แต่ต้องกันความยาว: client ส่งอะไรมาก็ได้
 * และค่านี้ถูกเก็บลง DB + ยิงต่อให้ Meta — จำกัดที่ 8 อักขระพอสำหรับอิโมจิที่มี ZWJ/skin tone
 * (ธงชาติ/ครอบครัวยาวได้ถึง 7-8) แต่ไม่พอให้ยัดข้อความทั้งประโยคมาเป็น "รีแอ็กชัน"
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const { id, messageId } = await params;

  let emoji: string | null = null;
  try {
    const body = (await request.json()) as { emoji?: unknown };
    if (body.emoji !== null && body.emoji !== undefined) {
      if (typeof body.emoji !== "string" || body.emoji.length === 0 || body.emoji.length > 8) {
        return NextResponse.json({ error: "รีแอ็กชันไม่ถูกต้อง" }, { status: 400 });
      }
      emoji = body.emoji;
    }
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const result = await sendOutboundReaction({
      conversationId: id,
      messageId,
      emoji,
      actorUserId: userId,
    });
    return NextResponse.json({ ok: true, emoji: result.emoji });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "CONVERSATION_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });
    }
    if (msg === "MESSAGE_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบข้อความนี้" }, { status: 404 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }, { status: 403 });
    }
    if (msg === "MESSAGE_DELETED") {
      return NextResponse.json({ error: "ข้อความนี้ถูกลบไปแล้ว" }, { status: 409 });
    }
    if (msg === "CHANNEL_INACTIVE") {
      return NextResponse.json({ error: "ช่องทางนี้ยังไม่ได้เชื่อมต่อ" }, { status: 409 });
    }
    if (msg === "MESSAGE_NOT_ON_CHANNEL") {
      // ข้อความที่ยังไม่ถึง Meta (ส่งไม่สำเร็จ) ไม่มี mid ให้ผูกรีแอ็กชัน
      return NextResponse.json({ error: "ข้อความนี้ยังส่งไม่ถึงลูกค้า กดรีแอ็กชันไม่ได้" }, { status: 409 });
    }
    if (e instanceof GraphApiError) {
      // Meta ปฏิเสธ — ส่งเหตุผลจริงต่อให้ร้านเห็น (pattern เดียวกับการส่งข้อความ)
      return NextResponse.json({ error: `Facebook ปฏิเสธรีแอ็กชัน: ${(e as GraphApiError).message}` }, { status: 502 });
    }
    console.error("[POST /api/chat/conversations/[id]/messages/[messageId]]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
