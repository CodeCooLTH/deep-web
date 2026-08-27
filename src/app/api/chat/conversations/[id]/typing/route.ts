import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { notifyTyping } from "@/services/channel-chat.service";

/**
 * POST /api/chat/conversations/[id]/typing — บอกลูกค้าว่าร้านกำลังพิมพ์
 *
 * body ว่าง — เพจ/ผู้รับ resolve จาก conversation id ฝั่ง server (เหตุผลเดียวกับ thread-control:
 * รับจาก client = ช่องยิง sender_action ใส่เพจร้านอื่น)
 *
 * 🛑 **ตอบ 200 เสมอแม้ไม่ได้ยิงจริง** — client เรียกทุกครั้งที่ผู้ขายพิมพ์ ถ้าตอบ 4xx/5xx
 * เมื่อ throttle ทำงานหรือช่องทางไม่รองรับ (LINE/DEEP ซึ่งเป็นเรื่องปกติ) console ของผู้ขาย
 * จะเต็มไปด้วยสีแดงตลอดเวลาที่พิมพ์ และ error tracker จะกลบเรื่องจริงที่ควรเห็น
 * `sent` ในผลลัพธ์บอกว่ายิงจริงไหม (ไว้เทส/สืบ ไม่ใช่ให้ UI ตัดสินใจอะไร)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  // "มี session" ≠ "รู้ว่าเป็นใคร" — ดู src/lib/session-user.ts
  const userId = sessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  // notifyTyping ไม่ throw เลย (ของประดับ) — ไม่ต้องมี try/catch ซ้อนที่นี่
  const sent = await notifyTyping({ conversationId: id, actorUserId: userId });
  return NextResponse.json({ sent });
}
