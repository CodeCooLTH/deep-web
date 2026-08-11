import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveChatScope } from "@/lib/chat-scope";
import { countUnreadSpamConversations } from "@/services/chat.service";
import { sessionUserId } from "@/lib/session-user";

// feature 00018 — badge จำนวนสแปมที่ยังไม่อ่านบนแท็บ "สแปม" (user สั่ง 2026-07-31)
// แยกเป็น endpoint เบา ๆ ไม่ยัดลง response ของ list เพราะ list ถูกเรียกทุกครั้งที่เปลี่ยน
// ตัวกรอง/เลื่อนโหลดต่อ ส่วนตัวเลขนี้เปลี่ยนเฉพาะตอนมีข้อความใหม่ หรือกดสแปม/เอาออกจากสแปม
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scope = await resolveChatScope({
    user: {
      id: userId,
      activeShopId: ((session.user as { activeShopId?: string | null }).activeShopId as string | null | undefined) ?? null,
    },
  });
  if (!scope) return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });

  // feature 00037 — นับข้ามร้านตามขอบเขตเดียวกับรายการ ไม่งั้น badge สแปมกับรายการสแปมไม่ตรงกัน
  const count = await countUnreadSpamConversations(scope.shopIds);
  return NextResponse.json({ count }, { headers: NO_STORE_HEADERS });
}
