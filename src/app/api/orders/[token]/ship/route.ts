import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { ShipOrderSchema } from "@/lib/validations";
import {
  shipOrder,
  updateShipmentTracking,
  OrderNotShippedError,
  ShipmentTrackingNotFoundError,
  IShipManagedShipmentError,
} from "@/services/order.service";
import { prisma } from "@/lib/prisma";
import { canAccessShop } from "@/lib/shop-context";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // สมาชิกร้านเจ้าของออเดอร์ (owner หรือ BUSINESS admin) — เดิมเช็ค shop.userId ตรง ๆ
  // ทำให้ admin ที่ถูกเชิญแจ้งเลขพัสดุไม่ได้ (คลาสเดียวกับบั๊ก cancel/แชท ดู canAccessShop)
  const userId = (session.user as any).id;
  const order = await prisma.order.findUnique({ where: { publicToken: token }, include: { shop: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!(await canAccessShop(order.shopId, userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = v.safeParse(ShipOrderSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const updated = await shipOrder(token, parsed.output, userId);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

// PATCH /api/orders/[token]/ship — S-12: แก้เลขพัสดุ/ผู้ให้บริการหลังกด "แจ้งจัดส่ง" ไปแล้ว
// (update อย่างเดียว ไม่แตะ order.status — ต่างจาก POST ที่ transition PENDING→SHIPPED)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // สมาชิกร้านเจ้าของออเดอร์ (เหมือน POST เดิมเป๊ะ)
  const userId = (session.user as any).id;
  const order = await prisma.order.findUnique({ where: { publicToken: token }, include: { shop: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!(await canAccessShop(order.shopId, userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = v.safeParse(ShipOrderSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const updated = await updateShipmentTracking(token, parsed.output, userId);
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err instanceof OrderNotShippedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ShipmentTrackingNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof IShipManagedShipmentError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 400 });
  }
}
