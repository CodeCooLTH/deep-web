import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { MarkNotificationReadSchema } from "@/lib/validations";
import { markNotificationRead, markAllNotificationsRead } from "@/services/notification.service";
import { getSubdomain } from "@/lib/subdomain";

/**
 * POST /api/notifications/read — ทำเครื่องหมายอ่านแล้ว (web bell, NextAuth session)
 *
 * body { id?: string } — มี id: mark เฉพาะรายการนั้น (ownership กันแก้ของคนอื่น
 * ด้วย updateMany where {id, userId}); ไม่มี id: mark ทั้งหมดของ user เป็นอ่านแล้ว
 */
export async function POST(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  // 2. parse body ด้วย Valibot
  const body = await request.json().catch(() => ({}));
  const parsed = v.safeParse(MarkNotificationReadSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 3. mark เฉพาะรายการ หรือ mark ทั้งหมด (userId จาก session เท่านั้น)
  if (parsed.output.id) {
    await markNotificationRead(userId, parsed.output.id);
  } else {
    // shopId จาก body ใช้แค่ "แคบลง" — where ยังผูก userId จาก session เสมอ จึงแตะของคนอื่นไม่ได้
    // 00086: "อ่านทั้งหมด" ฝั่งผู้ซื้อแตะเฉพาะแจ้งเตือนส่วนตัว — ไม่กินแจ้งเตือนของร้านที่เจ้าของยังไม่ได้เห็น
    const personalOnly = getSubdomain(request.headers.get("host") ?? "") !== "seller";
    await markAllNotificationsRead(userId, { shopId: parsed.output.shopId, personalOnly });
  }

  return NextResponse.json({ ok: true });
}
