import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessShop } from "@/lib/shop-context";
import { resolveDispute, NoOpenDisputeError } from "@/services/order-dispute.service";

/** ผลของการปิดเรื่อง — allow-list ไม่ใช่รับสตริงอะไรก็ได้ */
const OUTCOMES = ["RESOLVED_DELIVERED", "RESOLVED_CANCELLED", "RESOLVED_OTHER"] as const;

/**
 * POST /api/orders/[token]/dispute/resolve — ปิดเรื่องที่ผู้ซื้อแจ้งไว้
 * feature 00039
 *
 * 🛑 ปิดเรื่อง ≠ ออเดอร์สำเร็จ — แค่ปลดธง แล้วให้กติกา 7 วันเดินต่อตามปกติ
 * ถ้าครบกำหนดแล้ว รอบถัดไปของ cron จะปิดให้เอง
 *
 * สิทธิ์: ทีมงานร้านเท่านั้น (ผู้ซื้อเปิดเรื่องได้ แต่ปิดเองไม่ได้ ไม่งั้นธงจะไร้ความหมาย)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { shopId: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (!sessionUserId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!(await canAccessShop(order.shopId, sessionUserId))) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ปิดเรื่องนี้" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const raw = typeof body?.outcome === "string" ? body.outcome : null;
  const outcome = raw && (OUTCOMES as readonly string[]).includes(raw) ? raw : "RESOLVED_OTHER";

  try {
    const result = await resolveDispute(token, { outcome, actorUserId: sessionUserId });
    return NextResponse.json({ disputeResolvedAt: result.disputeResolvedAt.toISOString() });
  } catch (err) {
    if (err instanceof NoOpenDisputeError) {
      return NextResponse.json({ error: "ไม่มีเรื่องที่เปิดค้างอยู่" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "ปิดเรื่องไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
