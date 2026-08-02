import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cancelFailedOutboundMessage } from "@/services/channel-chat.service";

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
