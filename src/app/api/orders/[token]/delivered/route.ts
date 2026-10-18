import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { markManualDelivered, ManualDeliveryNotAllowedError } from "@/services/order.service";
import { prisma } from "@/lib/prisma";
import { canAccessShopWith } from "@/lib/shop-capability";
import { sessionUserId } from "@/lib/session-user";

// POST /api/orders/[token]/delivered — 00080 "ส่งสำเร็จ" กำลังจัดส่ง → สำเร็จ (ส่งเองเท่านั้น · idempotent)
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  // ดูร้านจากออเดอร์ ไม่เชื่อ shopId จาก client
  const order = await prisma.order.findUnique({ where: { publicToken: token }, select: { shopId: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404, headers: NO_STORE });
  if (!(await canAccessShopWith(order.shopId, userId, 'S1'))) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });

  try {
    return NextResponse.json(await markManualDelivered(token, order.shopId, userId), { headers: NO_STORE });
  } catch (err) {
    // ข้อความของ error ชนิดนี้เป็นไทยที่ตั้งใจให้ผู้ใช้เห็น — ตัวอื่นไม่ echo (อาจหลุดข้อความภายใน)
    if (err instanceof ManualDeliveryNotAllowedError) return NextResponse.json({ error: err.message }, { status: 409, headers: NO_STORE });
    console.error("[delivered] ล้มเหลว", err);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ ลองกดอีกครั้ง" }, { status: 500, headers: NO_STORE });
  }
}
