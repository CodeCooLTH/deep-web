import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as v from "valibot";
import { CreateOrderSchema, OrderAppointmentSchema } from "@/lib/validations";
import { appointmentErrorResponse } from "@/lib/appointment-api";
import { createOrder, getOrdersByShop, getOrdersByBuyer, ShippingAddressRequiredError, ProductNotInShopError, OrderDateOutOfWindowError } from "@/services/order.service";
import { OutOfStockError } from "@/services/inventory-stock.service";
import { requireActiveShop, requireShopForWrite } from "@/lib/shop-context";
import { prisma } from "@/lib/prisma";
import { ORDER_DATE_OUT_OF_WINDOW_MESSAGE } from "@/lib/order-date-window";

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

  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  /**
   * ร้านปลายทางของการสร้างครั้งนี้ (feature 00037 AC-06-6 — user report prod 2026-08-11)
   *
   * `shopId` = ร้านของ "ร่าง" ที่ฟอร์มถืออยู่ ซึ่งคือร้านเจ้าของเธรด **ไม่ใช่ร้านที่ active**
   * ในกล่องแชทรวมหลายร้าน สองค่านี้ต่างกันได้ตลอดเวลาโดยตั้งใจ (BR-UNI-07) — ก่อนหน้านี้
   * route นี้รู้จักแต่ร้าน active ออเดอร์ที่คีย์จากเธรดของอีกร้านจึงลงผิดร้านเงียบ ๆ
   *
   * parse แยกจาก CreateOrderSchema โดยตั้งใจ (แบบเดียวกับ appointment ข้างล่าง): schema ก้อนนั้น
   * ใช้ร่วมกับ PATCH ซึ่ง "ย้ายร้านของออเดอร์เดิม" ไม่ใช่สิ่งที่ทำได้ — ถ้าใส่คีย์นี้ลงไปในนั้น
   * วันหนึ่งจะมีคนเชื่อว่ามันมีผลที่ฝั่ง PATCH ด้วย
   */
  const rawShopId = (body as { shopId?: unknown })?.shopId;
  let requestedShopId: string | undefined;
  if (rawShopId !== undefined && rawShopId !== null) {
    const sid = v.safeParse(v.pipe(v.string(), v.uuid()), rawShopId);
    if (!sid.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    requestedShopId = sid.output;
  }

  const resolved = await requireShopForWrite(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
    requestedShopId,
  );
  if (!resolved.ok) {
    // fail-closed: ระบุร้านมาแล้วเข้าไม่ถึง = ปฏิเสธ ห้ามถอยไปสร้างในร้านที่ active
    return resolved.reason === "FORBIDDEN"
      ? NextResponse.json({ error: "SHOP_FORBIDDEN", message: "คุณไม่มีสิทธิ์สร้างรายการในร้านนี้" }, { status: 403 })
      : NextResponse.json({ error: "No shop" }, { status: 404 });
  }
  const active = resolved.target;
  if (active.locked) return NextResponse.json({ error: "SHOP_LOCKED" }, { status: 403 });
  const shop = active.shop;

  const parsed = v.safeParse(CreateOrderSchema, body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  /**
   * AC-06-6 — ร่างที่ผูกกับร้านหนึ่ง แต่เธรดที่อ้างมาเป็นของอีกร้าน = ปฏิเสธ ไม่ใช่เดาว่าจะเข้าร้านไหน
   *
   * scope ด้วย "ร้านที่ผู้ใช้เข้าถึงได้" ไม่ใช่ร้านปลายทาง — ต้องแยก "เธรดของอีกร้าน" (ผิดจริง
   * ต้องบอก) ออกจาก "ไม่มีเธรดนี้แล้ว" (ลบไปแล้ว/ของคนอื่น) ซึ่งคงพฤติกรรมเดิมคือสร้างต่อได้
   * โดยไม่ผูกลูกค้า — ตรงกับที่ createOrder ทำอยู่ (findThreadContact scope ด้วย shopId ใน WHERE)
   */
  if (parsed.output.conversationId) {
    const userId = (session.user as { id: string }).id;
    // scope สิทธิ์อยู่ใน WHERE ผ่าน relation filter — ไม่ใช่ดึงมาแล้วค่อยเทียบ (feedback_rsc_dal_authz)
    // ตั้งใจไม่เรียก listAccessibleShopIds(): requireShopForWrite เพิ่งตรวจ membership ไปแล้ว
    // การถามซ้ำเป็น round trip ที่ไม่ได้ความรู้ใหม่ — ที่นี่ต้องการแค่ "เธรดนี้อยู่ในร้านที่ฉันเข้าถึงได้ไหม"
    const conv = await prisma.conversation.findFirst({
      where: {
        id: parsed.output.conversationId,
        shop: { OR: [{ userId }, { members: { some: { userId } } }] },
      },
      select: { shopId: true },
    });
    if (conv && conv.shopId !== shop.id) {
      return NextResponse.json(
        { error: "DRAFT_SHOP_MISMATCH", message: "ร่างนี้เป็นของอีกร้าน บันทึกไม่ได้ — ปิดแล้วเปิดใหม่จากในเธรดอีกครั้ง" },
        { status: 409 },
      );
    }
  }

  // ครอบ try-catch: เดิมไม่มี → exception ใด ๆ จาก createOrder ถูก Next กลืน
  // เป็น 500 ตัวเปล่า วินิจฉัยไม่ได้ (B9 transient ตอน OMS cutover พิสูจน์ปัญหานี้).
  // log server-side ให้เห็น + ตอบ structured ให้ client.
  // feature 00024 — วันนัดที่แนบมา (ไม่บังคับ). ไม่ส่งมา = เส้นทางเดิมทุกประการ (BR-RSV-04)
  // parse แยกจาก CreateOrderSchema เพื่อไม่ให้ blast radius ไปโดน caller เดิมของ schema นั้น
  let appointment:
    | { resourceId: string; start: Date; end: Date; depositAmount?: string | null }
    | undefined;
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
    appointment = {
      resourceId: ap.output.resourceId,
      start,
      end,
      depositAmount: ap.output.depositAmount ?? null,
    };
  }

  try {
    // คนที่กดสร้างคือเจ้าของ session นี้ — เอามาจาก session ฝั่ง server เท่านั้น ห้ามรับจาก body
    // (ไม่งั้นใครก็ยิงระบุชื่อคนอื่นเป็นคนสร้างได้) มิเรอร์วิธีเดียวกับ otp-for-password ใน feat 00026
    const createdByUserId = (session.user as { id?: string }).id ?? null;
    const order = await createOrder(shop.id, { ...parsed.output, appointment, createdByUserId });
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
    // feature 00033 — วันที่นอกช่วงที่ยอมรับ (ด่านที่สองต่อจาก Valibot; caller ฝั่ง server
    // ที่เรียก createOrder ตรง ๆ ไม่ผ่าน schema จึงมาโผล่ที่นี่ได้)
    if (e instanceof OrderDateOutOfWindowError) {
      return NextResponse.json({ error: ORDER_DATE_OUT_OF_WINDOW_MESSAGE }, { status: 400 });
    }
    console.error("[POST /api/orders] createOrder failed", e);
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  }
}
