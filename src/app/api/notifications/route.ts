import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { NotificationsQuerySchema } from "@/lib/validations";
import { listNotifications, getUnreadNotificationCount } from "@/services/notification.service";

/**
 * GET /api/notifications — bell notification บนเว็บ (buyer+seller, NextAuth session)
 * ปิด FLAG-3 ของ feat 00011 Deep Chat — web version ของ /api/app/notifications (mobile)
 *
 * อ่าน Notification table เดียวกัน (kind="chat_message"/"badge_earned") cursor-paginated
 * ด้วย createdAt ของรายการสุดท้ายที่เห็น (pattern getStockMovementHistory)
 */
export async function GET(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  // 2. parse query params ด้วย Valibot (searchParams ไม่ใช่ JSON body — manual parse)
  const { searchParams } = request.nextUrl;
  const rawTake = searchParams.get("take");
  const input = {
    cursor: searchParams.get("cursor") ?? undefined,
    take: rawTake === null ? undefined : Number(rawTake),
  };
  const parsed = v.safeParse(NotificationsQuerySchema, input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 3. list + unread count (userId จาก session เท่านั้น — ห้ามรับจาก client)
  const [result, unreadCount] = await Promise.all([
    listNotifications(userId, { cursor: parsed.output.cursor, take: parsed.output.take }),
    getUnreadNotificationCount(userId),
  ]);

  return NextResponse.json({
    items: result.items,
    nextCursor: result.nextCursor,
    unreadCount,
  });
}
