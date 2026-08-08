import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessShop } from "@/lib/shop-context";
import {
  openDispute,
  OrderAlreadyClosedError,
  DISPUTE_NOTE_MAX,
} from "@/services/order-dispute.service";

/**
 * POST /api/orders/[token]/dispute — ผู้ซื้อแจ้งว่ายังไม่ได้รับของ / ของไม่ตรง
 * feature 00039 (BR-OSM-03)
 *
 * ไม่เปลี่ยนสถานะคำสั่งซื้อ — ติดธงที่หยุด "การปิดงานอัตโนมัติ" เท่านั้น
 *
 * สิทธิ์: ผู้ซื้อเจ้าของใบนี้ (session.user.id === order.buyerUserId)
 * ทีมงานร้านก็เปิดแทนได้ (เคสลูกค้าโทรมาแจ้ง) — บันทึกผู้กระทำไว้ในประวัติเสมอ
 * 🛑 ตรวจสิทธิ์ที่นี่ ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { shopId: true, buyerUserId: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (!sessionUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isBuyerOwner = sessionUserId === order.buyerUserId;
  const isSellerMember = await canAccessShop(order.shopId, sessionUserId);
  if (!isBuyerOwner && !isSellerMember) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แจ้งปัญหาคำสั่งซื้อนี้" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note : null;
  if (note && note.length > DISPUTE_NOTE_MAX) {
    return NextResponse.json(
      { error: `รายละเอียดยาวเกิน ${DISPUTE_NOTE_MAX} ตัวอักษร` },
      { status: 400 },
    );
  }

  try {
    const result = await openDispute(token, { note, actorUserId: sessionUserId });
    return NextResponse.json({ disputeOpenedAt: result.disputeOpenedAt.toISOString() });
  } catch (err) {
    if (err instanceof OrderAlreadyClosedError) {
      return NextResponse.json(
        { error: "คำสั่งซื้อนี้ปิดจบไปแล้ว แจ้งปัญหาไม่ได้" },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "แจ้งปัญหาไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
