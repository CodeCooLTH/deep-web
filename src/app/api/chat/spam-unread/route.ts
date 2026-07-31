import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { countUnreadSpamConversations } from "@/services/chat.service";

// feature 00018 — badge จำนวนสแปมที่ยังไม่อ่านบนแท็บ "สแปม" (user สั่ง 2026-07-31)
// แยกเป็น endpoint เบา ๆ ไม่ยัดลง response ของ list เพราะ list ถูกเรียกทุกครั้งที่เปลี่ยน
// ตัวกรอง/เลื่อนโหลดต่อ ส่วนตัวเลขนี้เปลี่ยนเฉพาะตอนมีข้อความใหม่ หรือกดสแปม/เอาออกจากสแปม
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const ctx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId: ((session.user as { activeShopId?: string | null }).activeShopId as string | null | undefined) ?? null,
    },
  });
  if (!ctx) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  const count = await countUnreadSpamConversations(ctx.shopId);
  return NextResponse.json({ count }, { headers: NO_STORE_HEADERS });
}
