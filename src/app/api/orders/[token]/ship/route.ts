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
  ShipmentTrackingExistsError,
} from "@/services/order.service";
import { prisma } from "@/lib/prisma";
import { canAccessShopWith } from "@/lib/shop-capability";
import { sessionUserId } from "@/lib/session-user";
import { translateInvalidTransition } from "@/lib/chat-shipment-panel";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  // สมาชิกร้านเจ้าของออเดอร์ (owner หรือ BUSINESS admin) — เดิมเช็ค shop.userId ตรง ๆ
  // ทำให้ admin ที่ถูกเชิญแจ้งเลขพัสดุไม่ได้ (คลาสเดียวกับบั๊ก cancel/แชท ดู canAccessShop)
  const order = await prisma.order.findUnique({ where: { publicToken: token }, include: { shop: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404, headers: NO_STORE });
  if (!(await canAccessShopWith(order.shopId, userId, 'S1'))) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(ShipOrderSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });

  try {
    const updated = await shipOrder(token, parsed.output, userId);
    return NextResponse.json(updated, { headers: NO_STORE });
  } catch (err: any) {
    if (err instanceof ShipmentTrackingExistsError) return NextResponse.json({ error: 'บันทึกเลขพัสดุไว้แล้ว ใช้ "แก้ไขเลขพัสดุ" แทน' }, { status: 409, headers: NO_STORE });
    // สองแท็บ/สองคนกดพร้อมกันได้ข้อความอังกฤษดิบจาก assertTransition — แปลงที่ route ไม่แตะ service
    return NextResponse.json({ error: translateInvalidTransition(err?.message) ?? "ไม่สามารถแจ้งจัดส่งได้" }, { status: 400, headers: NO_STORE });
  }
}

// PATCH /api/orders/[token]/ship — S-12: แก้เลขพัสดุ/ผู้ให้บริการหลังกด "แจ้งจัดส่ง" ไปแล้ว
// (update อย่างเดียว ไม่แตะ order.status · รับ PENDING รอจัดส่ง และ SHIPPED)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  // สมาชิกร้านเจ้าของออเดอร์ (เหมือน POST เดิมเป๊ะ)
  const order = await prisma.order.findUnique({ where: { publicToken: token }, include: { shop: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404, headers: NO_STORE });
  if (!(await canAccessShopWith(order.shopId, userId, 'S1'))) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });

  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(ShipOrderSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: NO_STORE });

  try {
    const updated = await updateShipmentTracking(token, parsed.output, userId);
    return NextResponse.json(updated, { headers: NO_STORE });
  } catch (err: any) {
    // ส่งเฉพาะรหัสคงที่ — ไม่ echo err.message ดิบ (อาจหลุดข้อความภายใน)
    // 00080 TD-007 — รับแก้ได้ทั้ง PENDING/SHIPPED แล้ว เหลือแต่ปิด/ยกเลิก
    if (err instanceof OrderNotShippedError) return NextResponse.json({ error: "แก้เลขพัสดุไม่ได้ ออเดอร์นี้ปิดหรือยกเลิกแล้ว" }, { status: 409, headers: NO_STORE });
    if (err instanceof ShipmentTrackingNotFoundError) return NextResponse.json({ error: "ไม่พบข้อมูลเลขพัสดุของออเดอร์นี้" }, { status: 404, headers: NO_STORE });
    if (err instanceof IShipManagedShipmentError) return NextResponse.json({ error: "พัสดุนี้สร้างผ่าน iShip แก้เลขด้วยมือไม่ได้" }, { status: 409, headers: NO_STORE });
    console.error("[ship] PATCH ล้มเหลว", err);
    return NextResponse.json({ error: "ไม่สามารถแก้ข้อมูลการจัดส่งได้" }, { status: 400, headers: NO_STORE });
  }
}
