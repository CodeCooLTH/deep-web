import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { countUnreadConversations } from "@/services/chat.service";
import { countUnansweredForShop } from "@/services/page-comment.service";

// feature 00029 — ตัวเลขบน 2 แท็บของกล่องข้อความ: "ข้อความ" (เธรดยังไม่อ่าน) + "ความคิดเห็น"
// (คอมเมนต์ยังไม่ตอบ) — user สั่ง 2026-08-04
//
// รวมเป็น endpoint เดียวไม่ใช่แยก 2 ตัว เพราะผู้เรียกคือ InboxTabs ซึ่งต้องใช้ทั้งคู่พร้อมกันเสมอ
// แยกกัน = 2 round-trip + 2 แคช + 2 จังหวะ refresh ที่เพี้ยนจากกันได้ (แท็บหนึ่งสดอีกแท็บค้าง)
//
// แยกจาก response ของรายการแชท (แบบเดียวกับ /api/chat/spam-unread) เพราะรายการถูกยิงทุกครั้งที่
// เปลี่ยนตัวกรอง/โหลดเพิ่ม ส่วนตัวเลขนี้เปลี่ยนเฉพาะตอนมีของใหม่เข้าหรือร้านอ่าน/ตอบไป
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

  // ตัวใดตัวหนึ่งล้มไม่ควรทำให้อีกตัวหายไปจากจอ — badge เป็นข้อมูลเสริม ตกไปเป็น 0 ดีกว่า 500 ทั้งก้อน
  const [unread, unanswered] = await Promise.all([
    countUnreadConversations(ctx.shopId).catch(() => 0),
    countUnansweredForShop({ shopId: ctx.shopId, actorUserId: userId }).catch(() => 0),
  ]);

  return NextResponse.json({ unread, unanswered }, { headers: NO_STORE_HEADERS });
}
