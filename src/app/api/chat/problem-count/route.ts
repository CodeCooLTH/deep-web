import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveChatScope } from "@/lib/chat-scope";
import { conversationIdsByShipmentState } from "@/services/chat.service";

// feature 00022 — จำนวนบทสนทนาที่พัสดุมีปัญหา สำหรับชิปกรองในรายการแชท
//
// แยกจาก response ของ list เพราะนับ "ทั้งร้าน" ไม่ใช่นับจากแถวที่โหลดมา — รายการเป็น
// cursor pagination ทีละ 20 ถ้านับจากที่โหลดมาแล้ว ตัวเลขจะผิดทันทีที่มีเคสอยู่หน้าถัดไป
// (pattern เดียวกับ /api/chat/spam-unread ด้วยเหตุผลเดียวกัน)
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const scope = await resolveChatScope({
    user: {
      id: userId,
      activeShopId:
        ((session.user as { activeShopId?: string | null }).activeShopId as
          | string
          | null
          | undefined) ?? null,
    },
  });
  if (!scope) {
    return NextResponse.json({ error: "ไม่พบร้านที่กำลังใช้งาน" }, { status: 404 });
  }

  // feature 00037 — ชิป "พัสดุมีปัญหา" ต้องนับตามขอบเขตเดียวกับรายการที่ชิปนั้นกรอง
  const ids = await conversationIdsByShipmentState(scope.shopIds, "problem");
  return NextResponse.json({ count: ids.length }, { headers: NO_STORE_HEADERS });
}
