import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { claimConversationControl } from "@/services/channel-chat.service";

/**
 * POST /api/chat/conversations/[id]/thread-control — ขอสิทธิ์คุมเธรดคืนจากเอเจนต์ AI ของ Meta
 *
 * ที่มา (บั๊ก prod 2026-08-26): ปุ่ม "ตอบเอง" ในห้องแชทเป็น client gate ล้วน ๆ มาตั้งแต่วันแรก —
 * กดแล้วช่องพิมพ์เปิด แต่ไม่มีอะไรวิ่งไปหา Meta เลย ผู้ขายจึงพิมพ์เสร็จแล้วไปเจอ
 * `(#10) another app is controlling this thread` ทุกครั้ง route นี้คือตัวที่ทำให้ปุ่มนั้นทำงานจริง
 *
 * body ว่างเสมอ — ทุกอย่างที่ต้องใช้ (เพจ/PSID/สิทธิ์) resolve จาก conversation id ฝั่ง server
 * **ห้ามรับ pageId/PSID จาก client** ไม่งั้นจะกลายเป็นช่องยิงคำสั่ง handover ใส่เพจร้านอื่น
 *
 * 🛑 คืน `outcome` สามค่า ไม่ใช่ ok:boolean — `REQUESTED` แปลว่า "ส่งคำขอไปแล้ว ยังไม่รู้ผล"
 * ซึ่งไม่ใช่ทั้งสำเร็จและล้มเหลว หน้าจอต้องพูดคนละอย่างกับอีกสองค่า (ดู claimThreadControl)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  // "มี session" ≠ "รู้ว่าเป็นใคร" — ดู src/lib/session-user.ts
  const userId = sessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const result = await claimConversationControl({ conversationId: id, actorUserId: userId });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "CONVERSATION_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบบทสนทนา" }, { status: 404 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }, { status: 403 });
    }
    // สองอันนี้ต่างกันจริง: อันแรก "ช่องทางนี้ไม่มีแนวคิดเจ้าของเธรด" อันหลัง "เพจหลุดการเชื่อมต่อ"
    if (msg === "NOT_EXTERNAL_CHANNEL" || msg === "CHANNEL_NOT_SUPPORTED") {
      return NextResponse.json({ error: "ช่องทางนี้ไม่มีการสลับสิทธิ์ดูแลแชท" }, { status: 400 });
    }
    if (msg === "CHANNEL_INACTIVE") {
      return NextResponse.json(
        { error: "การเชื่อมต่อกับช่องทางนี้หมดอายุ — เชื่อมเพจใหม่อีกครั้ง" },
        { status: 409 },
      );
    }
    console.error("[POST /api/chat/conversations/[id]/thread-control]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
