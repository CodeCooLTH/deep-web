import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { CreateOrderSchema, OrderAppointmentSchema } from "@/lib/validations";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { createOrder, getOrdersByShop, getOrdersByBuyer, ShippingAddressRequiredError, ProductNotInShopError } from "@/services/order.service";
import { OutOfStockError } from "@/services/inventory-stock.service";
import { requireActiveShop } from "@/lib/shop-context";

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
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) return NextResponse.json([]);

  const orders = await getOrdersByShop(active.shop.id, status);
  return NextResponse.json(orders);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) return NextResponse.json({ error: "No shop" }, { status: 404 });
  if (active.locked) return NextResponse.json({ error: "SHOP_LOCKED" }, { status: 403 });
  const shop = active.shop;

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = v.safeParse(CreateOrderSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // ครอบ try-catch: เดิมไม่มี → exception ใด ๆ จาก createOrder ถูก Next กลืน
  // เป็น 500 ตัวเปล่า วินิจฉัยไม่ได้ (B9 transient ตอน OMS cutover พิสูจน์ปัญหานี้).
  // log server-side ให้เห็น + ตอบ structured ให้ client.
  // feature 00024 — วันนัดที่แนบมา (ไม่บังคับ). ไม่ส่งมา = เส้นทางเดิมทุกประการ (BR-RSV-04)
  // parse แยกจาก CreateOrderSchema เพื่อไม่ให้ blast radius ไปโดน caller เดิมของ schema นั้น
  let appointment: { resourceId: string; start: Date; end: Date } | undefined;
  const rawAppointment = (body as { appointment?: unknown })?.appointment;
  if (rawAppointment !== undefined && rawAppointment !== null) {
    const ap = v.safeParse(OrderAppointmentSchema, rawAppointment);
    if (!ap.success) {
      return NextResponse.json({ error: "ข้อมูลวันนัดไม่ถูกต้อง" }, { status: 400 });
    }
    const start = new Date(ap.output.start);
    const end = new Date(ap.output.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "ข้อมูลวันนัดไม่ถูกต้อง" }, { status: 400 });
    }
    appointment = { resourceId: ap.output.resourceId, start, end };
  }

  try {
    const order = await createOrder(shop.id, { ...parsed.output, appointment });
    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    // feature 00024 — error ของโดเมนนัดหมายต้องมี catch ครอบที่นี่ มิฉะนั้นตกเป็น 500
    // (บทเรียน feedback_service_error_route_mapping)
    const appointmentMapped = appointmentErrorResponse(e);
    if (appointmentMapped) return appointmentMapped;
    if (e instanceof ShippingAddressRequiredError) {
      return NextResponse.json(
        { error: "ออเดอร์ที่ต้องจัดส่งต้องระบุที่อยู่จัดส่ง (ที่อยู่ / จังหวัด / รหัสไปรษณีย์)" },
        { status: 400 },
      );
    }
    // SECURITY: productId ที่ client ส่งมาไม่ใช่ของร้านนี้ (cross-shop) — fail-closed 400
    if (e instanceof ProductNotInShopError) {
      return NextResponse.json(
        { error: "พบสินค้าที่ไม่ใช่ของร้านนี้ในคำสั่งซื้อ" },
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
