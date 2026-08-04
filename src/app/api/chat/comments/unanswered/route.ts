import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { countUnansweredForShop } from "@/services/page-comment.service";

// feature 00029 — badge จำนวนความคิดเห็นที่ยังไม่ตอบบนแท็บ "ความคิดเห็น" (user สั่ง 2026-08-04)
// เดิมตัวเลขมาจาก RSC ของหน้า /inbox/comments เท่านั้น → ตอนอยู่แท็บ "ข้อความ" จึงไม่เห็นเลย
// ต้องกดเข้าไปถึงจะรู้ว่ามีค้าง ซึ่งกลับหัวกับหน้าที่ของ badge
//
// แยกเป็น endpoint เบา ๆ (แบบเดียวกับ /api/chat/spam-unread) ไม่ยัดลง response ของรายการแชท
// เพราะรายการถูกยิงทุกครั้งที่เปลี่ยนตัวกรอง/โหลดเพิ่ม ส่วนตัวเลขนี้เปลี่ยนเฉพาะตอนมีคอมเมนต์ใหม่
// หรือร้านตอบไป
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const ctx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId:
        ((session.user as { activeShopId?: string | null }).activeShopId as string | null | undefined) ?? null,
    },
  });
  if (!ctx) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  const count = await countUnansweredForShop({ shopId: ctx.shopId, actorUserId: userId });
  return NextResponse.json({ count }, { headers: NO_STORE_HEADERS });
}
