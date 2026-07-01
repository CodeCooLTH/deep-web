import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { CreateOrderSchema } from "@/lib/validations";
import { createOrder, getOrdersByShop, getOrdersByBuyer, ShippingAddressRequiredError } from "@/services/order.service";
import { OutOfStockError } from "@/services/inventory-stock.service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role"); // "seller" or "buyer"
  const status = searchParams.get("status") || undefined;

  if (role === "buyer") {
    const orders = await getOrdersByBuyer(userId);
    return NextResponse.json(orders);
  }

  // Default: seller orders
  const shop = await prisma.shop.findUnique({ where: { userId } });
  if (!shop) return NextResponse.json([]);

  const orders = await getOrdersByShop(shop.id, status);
  return NextResponse.json(orders);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const shop = await prisma.shop.findUnique({ where: { userId } });
  if (!shop) return NextResponse.json({ error: "No shop" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = v.safeParse(CreateOrderSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // ครอบ try-catch: เดิมไม่มี → exception ใด ๆ จาก createOrder ถูก Next กลืน
  // เป็น 500 ตัวเปล่า วินิจฉัยไม่ได้ (B9 transient ตอน OMS cutover พิสูจน์ปัญหานี้).
  // log server-side ให้เห็น + ตอบ structured ให้ client.
  try {
    const order = await createOrder(shop.id, parsed.output);
    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    if (e instanceof ShippingAddressRequiredError) {
      return NextResponse.json(
        { error: "ออเดอร์ที่ต้องจัดส่งต้องระบุที่อยู่จัดส่ง (ที่อยู่ / จังหวัด / รหัสไปรษณีย์)" },
        { status: 400 },
      );
    }
    // Inventory Add-on (feature 00003) — hard-stop สินค้าหมดสต็อก (FR-INV-11) → 400 พร้อมชื่อสินค้า
    // (order.service createOrder throws OutOfStockError จาก inventory-stock.service; ตัด/สร้าง rollback แล้ว)
    if (e instanceof OutOfStockError) {
      return NextResponse.json(
        { error: `สินค้าหมดสต็อก: ${e.productNames.join(", ")}` },
        { status: 400 },
      );
    }
    console.error("[POST /api/orders] createOrder failed", e);
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  }
}
