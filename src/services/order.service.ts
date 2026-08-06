import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toFileUrl } from "@/lib/file-url";
import { evaluateBadges, evaluateSellerBadgesForShop } from "@/services/badge.service";
import { deductStockForOrderItems, restockFromCancelledOrder } from "@/services/inventory-stock.service";
import { normalizePhone } from "@/lib/phone";
import { findOrCreateCustomer } from "@/services/customer.service";
import { isCancelReason } from "@/lib/lodging";
import { deriveShippingStage } from "@/lib/order-stage";
import { resolvePaymentSync } from "@/lib/iship/payment-sync";
import { formatOrderNo } from "@/lib/order-no";
import { recordOrderEvent } from "@/services/order-event.service";
import { orderDateRejectReason } from "@/lib/order-date-window";
import {
  attachAppointmentInTx,
  computeAppointmentDeposit,
  resolveResourceForOrder,
} from "@/services/appointment.service";

// State machine ใหม่ตาม OMS redesign spec §2
// PENDING = สถานะเริ่มต้นทุก order; CONFIRMED = terminal สำเร็จ (ไม่มี COMPLETED)
// CANCELLED = terminal ยกเลิก
export const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["SHIPPED", "CONFIRMED", "CANCELLED"],
  SHIPPED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: [],
  CANCELLED: [],
};

function assertTransition(currentStatus: string, newStatus: string) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(`Invalid transition: ${currentStatus} → ${newStatus}`);
  }
}

/**
 * feature 00017 — การจองต้องยืนยันโดยเจ้าของที่พักเท่านั้น (TFR-006)
 *
 * IMPORTANT: confirmOrder เดิมอนุญาตให้ "ผู้ซื้อ" เป็นคนกดยืนยัน ถ้าไม่กัน type=BOOKING
 * ผู้จองจะกดยืนยันการจองของตัวเองได้โดยไม่ต้องโอนเงินเลย แล้วได้ใบจองฟรี
 * การจองยืนยันผ่าน confirmBooking() ใน booking.service เท่านั้น
 */
export class BookingConfirmViaShopError extends Error {
  constructor() { super("BOOKING_CONFIRM_VIA_SHOP"); this.name = "BookingConfirmViaShopError"; }
}

// FR-6.5: order ที่ต้องจัดส่งต้องมีที่อยู่จัดส่ง — throw นี้ให้ route map เป็น 400
export class ShippingAddressRequiredError extends Error {
  constructor() { super("SHIPPING_ADDRESS_REQUIRED"); this.name = "ShippingAddressRequiredError"; }
}

// SECURITY FIX (feature 00016 Unit 3 + ปิด pre-existing vuln feature 00009) —
// productId ที่ client ส่งมาต้องเป็นของ shopId นี้เท่านั้น ไม่งั้น attacker (seller ร้านคู่แข่ง)
// เอา productId จากหน้าร้าน public /b/[slug] ของร้านอื่นมาสร้าง order ในร้านตัวเองได้ ผลคือ
// 1) cost snapshot ของคู่แข่งรั่วเข้า OrderItem.cost → เห็นใน P&L cogs ของ attacker (feature 00016)
// 2) deductStockForOrderItems ตัด stock จริงของคู่แข่งได้ (feature 00009 pre-existing)
// fail-closed: reject ทั้ง order ถ้ามี productId ใดไม่ใช่ของร้านนี้ (ไม่ silent-fallback เป็น
// custom item เพราะ productId ผิด shop คือ malicious/malformed input ชัดเจน — UI จริงไม่เคยส่งแบบนี้)
export class ProductNotInShopError extends Error {
  constructor() { super("PRODUCT_NOT_IN_SHOP"); this.name = "ProductNotInShopError"; }
}

/**
 * feature 00033 — วันที่คำสั่งซื้อที่ส่งมาอยู่นอกช่วง 90 วันย้อนหลัง / 7 วันล่วงหน้า
 * ตรวจที่ service ด้วย ไม่ใช่เชื่อ Valibot อย่างเดียว: caller ฝั่ง server (เช่น iShip import)
 * เรียก createOrder ตรง ๆ ไม่ผ่าน schema ของ route
 */
export class OrderDateOutOfWindowError extends Error {
  constructor() {
    super("ORDER_DATE_OUT_OF_WINDOW")
    this.name = "OrderDateOutOfWindowError"
  }
}

// charset เดียวกับ sms-code.service (ตัด 0/O/1/I) — 8 ตัว = 32^8 ≈ 1.1e12 (40-bit)
const SHORT_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** สร้างรหัสสั้นถาวรสำหรับ copy/share link (default 8 ตัว). ดู spec §4 */
export function genShortCode(len = 8): string {
  const bytes = randomBytes(len);
  let code = "";
  for (let i = 0; i < len; i++) code += SHORT_CHARSET[bytes[i] % 32];
  return code;
}

export async function createOrder(shopId: string, data: {
  items: { productId?: string; name: string; description?: string; qty: number; price: number }[];
  type: string;
  // Phase B — optional fields เพิ่มใน B0 migration; ทั้งหมด nullable ใน DB
  buyerContact?: string;
  buyerName?: string;
  paymentMethod?: string;
  salesChannel?: string;
  internalNote?: string;
  discount?: number;
  vatRate?: number;
  vatAmount?: number;
  shippingAddress?: {
    line1?: string;
    subdistrict?: string;
    district?: string;
    province?: string;
    postcode?: string;
    note?: string;
  };
  // feature 00018 (user request 2026-07-24): ถ้าออเดอร์นี้สร้างจากเธรดแชท ให้ผูก ExternalContact
  // ของเธรดเข้ากับ Customer (walk-in ที่ match จากเบอร์) ทันที — แชท/แท็บคำสั่งซื้อจะเห็นออเดอร์เลย
  // ไม่ต้องรอ buyer login. link ระดับ walk-in Customer นี้ upgrade เป็น full customer ตอน login ต่อได้
  conversationId?: string;
  // feature 00024 — วันเข้าใช้บริการ (โหมด A: ร้านเลือกวันให้เลยตอนสร้างออเดอร์)
  // ไม่ส่งมา = ออเดอร์เดินเส้นทางเดิมทุกประการ ฟิลด์นัดเป็น NULL ทั้งหมด (BR-RSV-04)
  // depositAmount = ยอดมัดจำที่ร้านกรอกเอง (FR-RSV-12) ไม่ส่งมา = คำนวณจากค่าเริ่มต้นของทรัพยากร
  appointment?: {
    resourceId: string;
    start: Date;
    end: Date;
    depositAmount?: string | null;
  };
  /**
   * คนที่กดสร้างออเดอร์นี้ (2026-08-04) — route เป็นคนส่ง session.user.id เข้ามา
   *
   * ไม่ส่งมา = ไม่มีคนกด (ระบบออกให้เอง) เก็บเป็น NULL ห้ามเดาว่าเป็นเจ้าของร้าน
   * หน้า "ประวัติคำสั่งซื้อ" อ่านค่านี้ NULL แล้วแสดงคำว่า "ระบบ"
   */
  createdByUserId?: string | null;
  /**
   * feature 00033 — วันที่/เวลาที่ลูกค้าสั่ง (ไม่ใช่เวลาที่คีย์เข้าระบบ)
   *
   * ไม่ส่งมา = เส้นทางเดิมทุกประการ (คอลัมน์ได้ @default(now()) ของ Postgres)
   * ส่งมา = ทับ createdAt ซึ่งพา "เลขออเดอร์" (formatOrderNo คิดจากปี/เดือนของค่านี้)
   * และ "ลำดับในรายการ" (keyset createdAt DESC) ไปด้วยทั้งชุด — ตั้งใจตามมติ D-1
   *
   * รับ `Date | string` (ไม่ใช่แค่ Date): CreateOrderSchema (Task 5) ส่ง ISO string ออกจาก
   * Valibot parse แล้ว route ยัง spread `parsed.output` ตรง ๆ เข้าฟังก์ชันนี้ (route/updateOrder
   * เดินสายจริงเป็นงาน Task 8 — ที่นี่กันพังไว้ก่อนด้วยการ normalize เป็น Date ตัวเดียวข้างล่าง)
   */
  createdAt?: Date | string;
}) {
  // feature 00024 — ตรวจตัวกั้นฟีเจอร์ + โหลดทรัพยากร "ก่อน" เปิด transaction
  // ทำนอก tx เพราะเป็นการอ่านล้วนและอาจโยน 403/404 ซึ่งไม่ควรกินรอบ retry ของ shortCode
  const appointmentResource = data.appointment
    ? await resolveResourceForOrder(shopId, data.appointment.resourceId)
    : null;

  // feature 00033 — เวลาจริงที่ "มีคนกดสร้าง" จับไว้ครั้งเดียวตั้งแต่ต้น
  // ใช้กับ OrderEvent.occurredAt เสมอ ห้ามใช้ order.createdAt ซึ่งย้อนหลังได้แล้ว
  const keyedInAt = new Date();

  // normalize เป็น Date ตัวเดียว — data.createdAt รับได้ทั้ง Date (caller ภายในระบบ) และ
  // ISO string (ผ่าน Valibot parse จาก route) ใช้ตัวแปรนี้แทน data.createdAt ตลอดฟังก์ชัน
  const orderCreatedAt =
    data.createdAt instanceof Date ? data.createdAt : data.createdAt ? new Date(data.createdAt) : undefined;

  if (orderCreatedAt) {
    const ms = orderCreatedAt.getTime();
    if (orderDateRejectReason(ms, keyedInAt.getTime()) !== null) {
      throw new OrderDateOutOfWindowError();
    }
  }

  // ปัดเศษ 2 ตำแหน่งเพื่อไม่ให้เกิด float tail ก่อนส่งเข้า Decimal(12,2) column
  // (เช่น 0.1+0.2 = 0.30000000000000004 → ปัด → 0.30)
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  // subtotal = ราคารวมก่อนหัก discount + บวก vat
  const subtotal = round2(data.items.reduce((sum, item) => sum + item.qty * item.price, 0));
  // totalAmount = subtotal - discount + vatAmount (ตาม spec B1)
  const totalAmount = round2(subtotal - (data.discount ?? 0) + (data.vatAmount ?? 0));

  // คำนวณ order-level fulfillmentMode ตาม spec §2:
  // SHIPPED ถ้ามี item ใด ๆ ที่ต้องจัดส่ง (product.fulfillmentMode=SHIPPED หรือ
  // item พิมพ์เอง productId=null แล้ว order.type=PHYSICAL)
  // มิฉะนั้น NO_SHIPPING
  const productIds = data.items
    .map((i) => i.productId)
    .filter((id): id is string => !!id);

  let fulfillmentMode = "NO_SHIPPING";

  // ตรวจ item ที่ไม่มี productId (พิมพ์เอง) ก่อน — ถ้า order.type=PHYSICAL → SHIPPED
  const hasManualPhysicalItem = data.items.some(
    (i) => !i.productId && data.type === "PHYSICAL",
  );
  if (hasManualPhysicalItem) {
    fulfillmentMode = "SHIPPED";
  }

  // SECURITY: validate ownership ของ productId ทุกตัวที่ client ส่งมา (item.productId truthy)
  // ต้องรันก่อน DB query ใด ๆ ที่ใช้ productId (รวม shippedProduct lookup ด้านล่าง) — กัน
  // information oracle (fulfillmentMode ของ product ร้านอื่นรั่วผ่าน error-message ต่างกัน) และปิด
  // cost/stock leak. read-only เลยไม่ต้องอยู่ใน tx, และเลี่ยงเช็คซ้ำทุก attempt retry.
  // Quick-Create item ที่ไม่มี productId ข้ามจุดนี้ไปสร้างใหม่ในร้านตัวเองเหมือนเดิม (ไม่ต้อง validate)
  if (productIds.length > 0) {
    const ownedProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, shopId },
      select: { id: true },
    });
    const ownedIds = new Set(ownedProducts.map((p) => p.id));
    const hasForeignProduct = productIds.some((id) => !ownedIds.has(id));
    if (hasForeignProduct) throw new ProductNotInShopError();
  }

  // ตรวจ product จริงจาก DB — ถ้ามี product ใดที่ fulfillmentMode=SHIPPED → SHIPPED
  // (ถึงจุดนี้ productIds ทุกตัวเป็นของ shopId นี้แล้ว — ผ่าน ownership validation ด้านบน)
  if (fulfillmentMode !== "SHIPPED" && productIds.length > 0) {
    const shippedProduct = await prisma.product.findFirst({
      where: { id: { in: productIds }, shopId, fulfillmentMode: "SHIPPED" },
      select: { id: true },
    });
    if (shippedProduct) {
      fulfillmentMode = "SHIPPED";
    }
  }

  // FR-6.5: ออเดอร์ที่ต้องจัดส่ง (SHIPPED) ต้องมีที่อยู่ครบขั้นต่ำ (line1 + จังหวัด + รหัสไปรษณีย์)
  // enforce ที่ service layer (single source) — กัน API-direct call ที่ข้าม form
  // ยกเว้น salesChannel = STOREFRONT (ขายหน้าร้าน) — ผู้ซื้อรับสินค้าที่ร้าน ไม่ต้องมีที่อยู่จัดส่ง
  if (fulfillmentMode === "SHIPPED" && data.salesChannel !== "STOREFRONT") {
    const a = data.shippingAddress;
    const hasEssentials = !!(a?.line1?.trim() && a?.province?.trim() && a?.postcode?.trim());
    if (!hasEssentials) throw new ShippingAddressRequiredError();
  }

  // SECURITY: validate ownership ของ productId ทุกตัวที่ client ส่งมา (item.productId truthy)
  // ก่อนเข้า retry-loop — read-only เลยไม่ต้องอยู่ใน tx, และเลี่ยงเช็คซ้ำทุก attempt retry
  // (Quick-Create item ที่ไม่มี productId ข้ามจุดนี้ไปสร้างใหม่ในร้านตัวเองเหมือนเดิม — ไม่ต้อง validate)
  if (productIds.length > 0) {
    const ownedProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, shopId },
      select: { id: true },
    });
    const ownedIds = new Set(ownedProducts.map((p) => p.id));
    const hasForeignProduct = productIds.some((id) => !ownedIds.has(id));
    if (hasForeignProduct) throw new ProductNotInShopError();
  }

  // shortCode: generate + retry ถ้าชน @unique (โอกาสชน 5 รอบติด ≈ 0). spec §4.2
  // orderDataBase ไม่รวม items แล้ว (เดิมมี items: { create: data.items } ตรงนี้) —
  // ย้ายการ build items ไปทำใน retry loop เพื่อแนบ stockDeducted ต่อ item (Inventory Add-on)
  // feature 00024 — ยอดมัดจำของนัด (FR-RSV-12) คำนวณครั้งเดียวที่นี่แล้ว snapshot ลงออเดอร์
  // ออเดอร์ที่ไม่มีนัด = undefined → คอลัมน์เป็น NULL เหมือนเดิมทุกประการ (BR-RSV-52)
  const appointmentDeposit = appointmentResource
    ? computeAppointmentDeposit({
        resource: appointmentResource,
        totalAmount: new Prisma.Decimal(totalAmount),
        override: data.appointment?.depositAmount,
      })
    : undefined;

  const orderDataBase = {
    shopId,
    type: data.type,
    totalAmount,
    depositAmount: appointmentDeposit,
    fulfillmentMode,
    buyerContact: data.buyerContact ?? undefined,
    buyerName: data.buyerName ?? undefined,
    paymentMethod: data.paymentMethod ?? undefined,
    salesChannel: data.salesChannel ?? undefined,
    internalNote: data.internalNote ?? undefined,
    discount: data.discount ?? undefined,
    vatRate: data.vatRate ?? undefined,
    vatAmount: data.vatAmount ?? undefined,
    shippingAddress: data.shippingAddress ?? undefined,
    // ไม่ส่งมา = ระบบออกออเดอร์เอง เก็บ NULL (ห้าม fallback เป็นเจ้าของร้าน — จะกลายเป็นบันทึกเท็จ)
    createdByUserId: data.createdByUserId ?? undefined,
    // ไม่ส่งมา = undefined → Prisma ไม่ใส่คอลัมน์นี้ใน INSERT → @default(now()) ทำงานตามเดิม
    createdAt: orderCreatedAt ?? undefined,
  };

  // [!] TD-001 (SDS §3.5): retry loop ต้องครอบ $transaction ทั้งก้อน ไม่ใช่อยู่ข้างในเดียว
  // ทำไม: ถ้า tx.order.create throw P2002 (ชน shortCode) ครั้งแรก Postgres จะ mark
  // ทั้ง transaction เป็น aborted ("current transaction is aborted") — attempt ถัดไปที่พยายาม
  // retry อยู่ใน tx เดิมจะ fail ทันทีด้วย aborted-transaction error ไม่ใช่ retry จริง
  // แก้โดยเปิด $transaction ใหม่ทั้งก้อนทุก attempt (รวม stock-deduct ด้วย — ปลอดภัยเพราะ
  // attempt ที่ fail จะ rollback หมดอัตโนมัติ, attempt ถัดไป re-read stock สดใหม่)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Inventory Add-on hook — 1 indexed lookup, short-circuit สำหรับ shop ที่ไม่มี
        // entitlement ACTIVE (ส่วนใหญ่) → ไม่ query product/stock เพิ่มเลย (zero regression)
        const entitlement = await tx.inventoryEntitlement.findUnique({
          where: { shopId },
          select: { status: true },
        });
        // BREAKING (00009 S-3/S-5) — deductStockForOrderItems คืน Map<productId,{qty,resultingQty,name}>
        // แทน Set<productId> เดิม (เพื่อรู้ resultingQty ต่อ product สำหรับ insert StockMovement ด้านล่าง)
        // Quick Create — custom item (พิมพ์ชื่อเอง ไม่มี productId) → auto-create Product
        // เพื่อให้สินค้าที่พิมพ์ในออเดอร์ขึ้นในแคตตาล็อกครั้งถัดไป; dedup by shopId+name (ชื่อซ้ำ = reuse ไม่สร้างซ้ำ).
        // sequential (ไม่ Promise.all) — Prisma interactive tx ไม่รองรับ parallel query
        const resolvedItems: typeof data.items = [];
        for (const item of data.items) {
          const name = item.name.trim();
          if (item.productId || !name) {
            resolvedItems.push(item);
            continue;
          }
          const existing = await tx.product.findFirst({ where: { shopId, name }, select: { id: true } });
          const productId =
            existing?.id ??
            (
              await tx.product.create({
                data: {
                  shopId,
                  name,
                  price: item.price,
                  type: data.type,
                  fulfillmentMode: data.type === "PHYSICAL" ? "SHIPPED" : "NO_SHIPPING",
                  ...(item.description ? { description: item.description } : {}),
                },
                select: { id: true },
              })
            ).id;
          resolvedItems.push({ ...item, productId });
        }

        const deductions =
          entitlement?.status === "ACTIVE"
            ? await deductStockForOrderItems(tx, resolvedItems) // throw OutOfStockError = rollback attempt นี้
            : new Map<string, { qty: number; resultingQty: number; name: string }>();

        // feat 00016 (TFR-002/TD-003) — cost snapshot: batch query Product.cost ครั้งเดียว
        // หลัง resolve items ครบ (รวม Quick-Create auto-created product) ก่อน order.create
        // เพื่อให้ auto-created product ที่ไม่มี cost ตั้งไว้ได้ null จาก costMap โดยธรรมชาติ
        const costLookupProductIds = resolvedItems
          .map((item) => item.productId)
          .filter((id): id is string => !!id);
        // defense-in-depth: scope ด้วย shopId แม้ pre-validation ข้างบนจะการันตีแล้วว่า
        // client-supplied productId เป็นของร้านนี้ทั้งหมด (Quick-Create productId ก็เป็นของ
        // shopId นี้เสมออยู่แล้วเพราะเพิ่ง tx.product.create ด้วย shopId เดียวกัน)
        const costRows =
          costLookupProductIds.length > 0
            ? await tx.product.findMany({
                where: { id: { in: costLookupProductIds }, shopId },
                select: { id: true, cost: true },
              })
            : [];
        const costMap = new Map(costRows.map((p) => [p.id, p.cost]));

        const itemsCreateData = resolvedItems.map((item) => ({
          ...item,
          stockDeducted: item.productId && deductions.has(item.productId) ? item.qty : null,
          cost: item.productId ? (costMap.get(item.productId) ?? null) : null,
        }));

        // feat 00014 — ผูก Customer กลางด้วยเบอร์ (dedup + cross-shop identity); email/ว่าง/เบอร์ผิด → null
        const custPhone = data.buyerContact ? normalizePhone(data.buyerContact) : null;
        const customerId = custPhone ? await findOrCreateCustomer(tx, custPhone) : null;

        const order = await tx.order.create({
          data: {
            ...orderDataBase,
            customerId: customerId ?? undefined,
            items: { create: itemsCreateData },
            shortCode: genShortCode(),
          },
          include: { items: true },
        });

        // orderNo (user 2026-07-25): เลขคำสั่งซื้ออ่านง่าย = DP + ปีพ.ศ. + เดือน + publicToken 8 หลัก
        // set หลัง create เพราะต้องใช้ publicToken/createdAt ที่ DB สร้าง (deterministic — ไม่ retry/lock)
        const orderNo = formatOrderNo(order.publicToken, order.createdAt);
        await tx.order.update({ where: { id: order.id }, data: { orderNo } });
        order.orderNo = orderNo;

        // feature 00031 — ประวัติคำสั่งซื้อ: เขียนใน tx เดียวกับการสร้างเสมอ
        // actor = คนที่กดสร้าง (null = ระบบออกเอง — ห้าม fallback เป็นเจ้าของร้าน)
        //
        // feature 00033 — occurredAt = "เวลาที่มีคนกดสร้าง" ไม่ใช่ "วันที่ลูกค้าสั่ง"
        // เดิมส่ง order.createdAt ซึ่งบังเอิญถูกเพราะสองค่านี้เคยเท่ากันเสมอ. ประวัติคือหลักฐาน
        // ว่าใครทำอะไรเมื่อไหร่ — ย้อนตามค่าที่ผู้ใช้กรอกได้เมื่อไหร่ ก็เลิกเป็นหลักฐานเมื่อนั้น
        // ลงวันที่เอง = ค่าที่ส่งมาต่างจากเวลาที่กด (ไม่ส่งมาเลย = ไม่ใช่การลงย้อนหลัง)
        const isBackdated =
          !!orderCreatedAt && orderCreatedAt.getTime() !== keyedInAt.getTime();

        await recordOrderEvent(tx, {
          orderId: order.id,
          type: "ORDER_CREATED",
          actorUserId: data.createdByUserId ?? null,
          occurredAt: keyedInAt,
          // ใส่ orderedAt เฉพาะออเดอร์ที่ลงวันที่เอง — ออเดอร์ปกติ meta ว่างเหมือนเดิมทุกประการ
          ...(isBackdated ? { meta: { orderedAt: order.createdAt.toISOString() } } : {}),
        });

        // feature 00018 (user request 2026-07-24) — ผูกเธรดแชทเข้ากับ Customer ทันทีเมื่อสร้างจากแชท
        // เงื่อนไข: มี conversationId + ได้ customerId (มีเบอร์) เท่านั้น. scope ownership ด้วย shopId ใน
        // WHERE (กันผูกเธรดของร้านอื่น) + updateMany เฉพาะแถวที่ externalContact ยังไม่ผูก (customerId=null)
        // — ไม่ทับของเดิมถ้า buyer login แล้ว upgrade ไป full customer ไว้ก่อนหน้า (login ชนะ manual)
        if (data.conversationId && customerId) {
          const conv = await tx.conversation.findFirst({
            where: { id: data.conversationId, shopId },
            select: { externalContactId: true },
          });
          if (conv?.externalContactId) {
            await tx.externalContact.updateMany({
              where: { id: conv.externalContactId, customerId: null },
              data: { customerId },
            });
          }
        }

        // NEW (00009 S-5) — StockMovement record-always (ทุก package, ไม่ gate ที่นี่)
        // insert หลัง order.create สำเร็จ เพราะต้องใช้ order.id เป็น refId
        for (const [productId, d] of deductions) {
          await tx.stockMovement.create({
            data: {
              shopId,
              productId,
              productName: d.name,
              delta: -d.qty,
              resultingQty: d.resultingQty,
              source: "ORDER_DEDUCT",
              refId: order.id,
              note: null,
              actorUserId: null,
            },
          });
        }

        // feature 00024 — ผูกวันนัดเข้ากับออเดอร์ที่เพิ่งสร้าง (โหมด A, FR-RSV-03)
        //
        // IMPORTANT: ต้องทำ "หลัง" tx.order.create โดยที่ create ยังไม่ใส่ฟิลด์นัด (SDS D-07)
        // เหตุผล: การจัดสรรที่นั่งอาจชน EXCLUDE แล้วต้องลองที่นั่งถัดไป ถ้าใส่ที่นั่งไปตั้งแต่
        // INSERT จะต้องสร้างออเดอร์ใหม่ทั้งใบเพื่อ retry (id/orderNo/publicToken ถูกใช้ไปแล้ว)
        //
        // ถ้าเต็มทุกที่นั่ง AppointmentSlotFullError จะถูกโยนออกไป → ทั้ง transaction rollback
        // → ออเดอร์ไม่ถูกสร้างเลย ซึ่งถูกต้อง: ร้านตั้งใจสร้างออเดอร์พร้อมนัด ไม่ใช่ออเดอร์เปล่า
        if (appointmentResource && data.appointment) {
          await attachAppointmentInTx(tx, {
            orderId: order.id,
            resource: appointmentResource,
            start: data.appointment.start,
            end: data.appointment.end,
          });
        }

        return order;
      });
    } catch (e) {
      // P2002 = unique violation (ชน shortCode) → regenerate retry (tx ใหม่ทั้งก้อน); error อื่น
      // (รวม OutOfStockError) throw ทันทีไม่ retry
      const isUnique =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (isUnique && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("SHORT_CODE_COLLISION"); // unreachable ในทางปฏิบัติ
}

// แก้ไขคำสั่งซื้อไม่พบ / แก้ไม่ได้ (user request 2026-07-25 — edit order ใน modal)
export class OrderNotFoundError extends Error {
  constructor() { super("OrderNotFoundError"); this.name = "OrderNotFoundError"; }
}
export class OrderNotEditableError extends Error {
  constructor() { super("OrderNotEditableError"); this.name = "OrderNotEditableError"; }
}

/**
 * updateOrder — แก้ไขคำสั่งซื้อเต็มรูป (user request 2026-07-25: แก้ใน modal ไม่ต้องสลับจอ)
 *
 * mirror createOrder ทั้งการคำนวณ (subtotal/total/fulfillmentMode), validation (ownership productId,
 * shipping-required), resolve items (Quick-Create auto-product), stock (deduct), cost snapshot,
 * customer link — บวก "reverse สต็อกของ items เดิม" ก่อน (restockFromCancelledOrder) แล้วลบ+สร้างใหม่
 *
 * ⚠ stock-sensitive: reverse+deduct อยู่ใน transaction เดียว — ถ้า deduct ใหม่ OutOfStock → rollback
 * ทั้งก้อน (reverse ถูก undo ด้วย). แก้ CANCELLED ไม่ได้ (สต็อกคืนไปแล้ว — แก้=งง)
 */
export async function updateOrder(
  shopId: string,
  publicToken: string,
  data: Parameters<typeof createOrder>[1],
  // feature 00031 — คนที่กดแก้ไข (optional เพื่อไม่ให้ผู้เรียกเดิมพัง; ไม่ส่ง = "ระบบ")
  actorUserId?: string | null,
) {
  // feature 00033 — เวลาจริงที่กดแก้ (ใช้กับ occurredAt ของ event ทุกตัวในรอบนี้)
  const editedAt = new Date();

  // normalize เป็น Date ตัวเดียว — เหมือน createOrder เป๊ะ: data.createdAt รับได้ทั้ง Date
  // (caller ภายในระบบ) และ ISO string (ผ่าน Valibot parse จาก route)
  const orderCreatedAt =
    data.createdAt instanceof Date ? data.createdAt : data.createdAt ? new Date(data.createdAt) : undefined;

  if (orderCreatedAt) {
    const ms = orderCreatedAt.getTime();
    if (orderDateRejectReason(ms, editedAt.getTime()) !== null) {
      throw new OrderDateOutOfWindowError();
    }
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const subtotal = round2(data.items.reduce((sum, item) => sum + item.qty * item.price, 0));
  const totalAmount = round2(subtotal - (data.discount ?? 0) + (data.vatAmount ?? 0));

  const productIds = data.items.map((i) => i.productId).filter((id): id is string => !!id);

  // fulfillmentMode (เหมือน createOrder)
  let fulfillmentMode = "NO_SHIPPING";
  if (data.items.some((i) => !i.productId && data.type === "PHYSICAL")) fulfillmentMode = "SHIPPED";

  // ownership ของ productId (read-only, นอก tx)
  if (productIds.length > 0) {
    const owned = await prisma.product.findMany({ where: { id: { in: productIds }, shopId }, select: { id: true } });
    const ownedIds = new Set(owned.map((p) => p.id));
    if (productIds.some((id) => !ownedIds.has(id))) throw new ProductNotInShopError();
  }
  if (fulfillmentMode !== "SHIPPED" && productIds.length > 0) {
    const shipped = await prisma.product.findFirst({
      where: { id: { in: productIds }, shopId, fulfillmentMode: "SHIPPED" },
      select: { id: true },
    });
    if (shipped) fulfillmentMode = "SHIPPED";
  }
  // FR-6.5 shipping required (เหมือน createOrder)
  if (fulfillmentMode === "SHIPPED" && data.salesChannel !== "STOREFRONT") {
    const a = data.shippingAddress;
    if (!(a?.line1?.trim() && a?.province?.trim() && a?.postcode?.trim())) throw new ShippingAddressRequiredError();
  }

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findFirst({
      where: { publicToken, shopId },
      // ฟิลด์เพิ่มจาก id/status ใช้นับ changedCount ของ ORDER_EDITED (feature 00031) เท่านั้น
      select: {
        id: true, status: true, type: true, totalAmount: true, buyerContact: true,
        buyerName: true, paymentMethod: true, salesChannel: true, internalNote: true,
        discount: true, vatRate: true, vatAmount: true, shippingAddress: true,
        createdAt: true, publicToken: true,
        items: { select: { productId: true, name: true, description: true, qty: true, price: true } },
      },
    });
    if (!existing) throw new OrderNotFoundError();
    // แก้ได้เฉพาะ PENDING — ตรงกับกฎที่ UI ใช้อยู่แล้วทุกที่ (OrderActions/OrderCardMenu: canEdit = PENDING)
    // เดิมบล็อกแค่ CANCELLED ทำให้โมดัลแก้ไขในแชท (ซึ่งไม่ได้ gate สถานะเลย) แก้ออเดอร์ที่
    // SHIPPED/CONFIRMED ได้ = รื้อ OrderItem ทิ้งสร้างใหม่ + reverse/deduct สต็อก ทั้งที่ผู้ซื้อ
    // รับของและรีวิวไปแล้ว → ประวัติไม่ตรงกับของที่ส่งจริง และ trust score อ้างอิงข้อมูลที่ถูกเปลี่ยนย้อนหลัง
    if (existing.status !== "PENDING") throw new OrderNotEditableError();

    const entitlement = await tx.inventoryEntitlement.findUnique({ where: { shopId }, select: { status: true } });
    const inventoryActive = entitlement?.status === "ACTIVE";

    // 1) reverse สต็อกของ items เดิม (เฉพาะที่เคยตัด) — คืนก่อนลบ item ทิ้ง
    if (inventoryActive) await restockFromCancelledOrder(tx, shopId, existing.id);
    // 2) ลบ items เดิมทั้งหมด (จะสร้างชุดใหม่)
    await tx.orderItem.deleteMany({ where: { orderId: existing.id } });

    // 3) resolve items (Quick-Create) — เหมือน createOrder
    const resolvedItems: typeof data.items = [];
    for (const item of data.items) {
      const name = item.name.trim();
      if (item.productId || !name) { resolvedItems.push(item); continue; }
      const found = await tx.product.findFirst({ where: { shopId, name }, select: { id: true } });
      const pid = found?.id ?? (await tx.product.create({
        data: {
          shopId, name, price: item.price, type: data.type,
          fulfillmentMode: data.type === "PHYSICAL" ? "SHIPPED" : "NO_SHIPPING",
          ...(item.description ? { description: item.description } : {}),
        },
        select: { id: true },
      })).id;
      resolvedItems.push({ ...item, productId: pid });
    }

    // 4) deduct สต็อกใหม่ (throw OutOfStock = rollback ทั้งก้อน รวม reverse ข้างบน)
    const deductions = inventoryActive
      ? await deductStockForOrderItems(tx, resolvedItems)
      : new Map<string, { qty: number; resultingQty: number; name: string }>();

    // 5) cost snapshot (เหมือน createOrder)
    const costIds = resolvedItems.map((i) => i.productId).filter((id): id is string => !!id);
    const costRows = costIds.length > 0
      ? await tx.product.findMany({ where: { id: { in: costIds }, shopId }, select: { id: true, cost: true } })
      : [];
    const costMap = new Map(costRows.map((p) => [p.id, p.cost]));
    const itemsCreateData = resolvedItems.map((item) => ({
      ...item,
      stockDeducted: item.productId && deductions.has(item.productId) ? item.qty : null,
      cost: item.productId ? (costMap.get(item.productId) ?? null) : null,
    }));

    // 6) customer link — relink เฉพาะเมื่อมีเบอร์ (ไม่มีเบอร์ = ไม่แตะ customerId เดิม กัน unlink ไม่ตั้งใจ)
    const custPhone = data.buyerContact ? normalizePhone(data.buyerContact) : null;
    const customerId = custPhone ? await findOrCreateCustomer(tx, custPhone) : null;

    // 7) update order + สร้าง items ชุดใหม่
    const order = await tx.order.update({
      where: { id: existing.id },
      data: {
        type: data.type,
        totalAmount,
        fulfillmentMode,
        buyerContact: data.buyerContact ?? null,
        buyerName: data.buyerName ?? null,
        paymentMethod: data.paymentMethod ?? null,
        salesChannel: data.salesChannel ?? null,
        internalNote: data.internalNote ?? null,
        discount: data.discount ?? null,
        vatRate: data.vatRate ?? null,
        vatAmount: data.vatAmount ?? null,
        shippingAddress: data.shippingAddress ?? Prisma.DbNull,
        ...(custPhone ? { customerId } : {}),
        items: { create: itemsCreateData },
      },
      include: { items: true },
    });

    // 8) StockMovement ของ deduction ใหม่ (เหมือน createOrder)
    for (const [productId, d] of deductions) {
      await tx.stockMovement.create({
        data: {
          shopId, productId, productName: d.name, delta: -d.qty, resultingQty: d.resultingQty,
          source: "ORDER_DEDUCT", refId: order.id, note: null, actorUserId: null,
        },
      });
    }

    // feature 00033 — เปลี่ยนวันที่คำสั่งซื้อ
    // I-6 (re-review #2) — เทียบระดับ "นาที" ไม่ใช่มิลลิวินาที เพราะ UI ส่งค่าจาก
    // datetime-local ที่ตัดวินาที/มิลลิวินาทีทิ้งเสมอ แต่ existing.createdAt (จาก now() ตอนสร้าง
    // ออเดอร์) แทบไม่เคยลงท้ายด้วยวินาที/มิลลิวินาทีเป็นศูนย์พอดี — ถ้าเทียบระดับ ms ตรง ๆ
    // caller ที่ echo createdAt เดิมกลับมา (ไม่ผ่าน dirtyFields gate แบบฟอร์มปัจจุบัน เช่น
    // แอปมือถือ/client ใหม่ในอนาคต) จะเห็นว่า "ต่างกัน" ทั้งที่ผู้ใช้ไม่ได้ตั้งใจเปลี่ยนวันที่เลย
    const toMinuteMs = (d: Date) => Math.floor(d.getTime() / 60_000) * 60_000;
    if (orderCreatedAt && toMinuteMs(orderCreatedAt) !== toMinuteMs(existing.createdAt)) {
      // เลขออเดอร์คิดจากปี/เดือนของ createdAt — ต้อง recompute พร้อมกันในทรานแซกชันเดียว
      // ไม่งั้นคอลัมน์ orderNo ค้างเดือนเก่า ขณะที่หน้าจอคำนวณสดแล้วโชว์เดือนใหม่
      // → ผู้ใช้ค้นด้วยเลขที่เห็นบนจอแล้วไม่เจอ (@@index([orderNo]))
      const recomputedOrderNo = formatOrderNo(existing.publicToken, orderCreatedAt);
      await tx.order.update({
        where: { id: existing.id },
        data: {
          createdAt: orderCreatedAt,
          orderNo: recomputedOrderNo,
        },
      });
      // I-3 (2026-08-06) — `order` ถูก select ไว้ "ก่อน" update นี้ (บรรทัดด้านบน) จึงยังถือ
      // createdAt/orderNo เก่าอยู่ในหน่วยความจำ ถ้าไม่ sync กลับ ค่าที่ return ให้ route (แล้ว
      // PATCH ตอบกลับ client) จะเป็นค่าเก่าทั้งที่ DB อัปเดตแล้ว — mutate object เดิม ไม่ refetch
      order.createdAt = orderCreatedAt;
      order.orderNo = recomputedOrderNo;

      // occurredAt = เวลาจริงที่กดแก้ ไม่ใช่วันที่ใหม่ที่กรอก (Global Constraint)
      await recordOrderEvent(tx, {
        orderId: existing.id,
        type: "ORDER_DATE_CHANGED",
        actorUserId: actorUserId ?? null,
        occurredAt: editedAt,
        meta: {
          orderedAtFrom: existing.createdAt.toISOString(),
          orderedAtTo: orderCreatedAt.toISOString(),
        },
      });
    }

    // 9) feature 00031 — ORDER_EDITED ใน tx เดียวกัน. changedCount นับจากค่าที่ต่างจริง
    // (เทียบ scalar ต่อ field + รายการสินค้าเป็น 1 หน่วย) — ไม่ส่งค่าจริงเข้า meta (กัน PII)
    const numEq = (a: Prisma.Decimal | number | null | undefined, b: number | null | undefined) => {
      const av = a == null ? null : Number(a);
      const bv = b == null ? null : b;
      return av === bv;
    };
    const strEq = (a: string | null | undefined, b: string | null | undefined) =>
      (a ?? null) === (b ?? null);
    // I-5 (feature 00033 re-review #1) — itemKey เดิมเทียบแค่ name/qty/price ทำให้แก้
    // "รายละเอียดสินค้า" (description) หรือสลับ productId (ที่ name/qty/price เท่ากันพอดี)
    // แล้ว changedCount = 0 → ไม่มี ORDER_EDITED เลย ทั้งที่ผู้ซื้อเห็นการเปลี่ยนแปลงจริง
    // ต้องครอบทั้ง description และ productId ด้วย
    const itemKey = (
      items: {
        name: string;
        qty: number;
        price: number | Prisma.Decimal;
        description?: string | null;
        productId?: string | null;
      }[],
    ) =>
      JSON.stringify(
        items.map((i) => [i.name.trim(), i.qty, Number(i.price), i.description ?? null, i.productId ?? null]),
      );
    const changedCount = [
      strEq(existing.type, data.type),
      numEq(existing.totalAmount, totalAmount),
      strEq(existing.buyerContact, data.buyerContact),
      strEq(existing.buyerName, data.buyerName),
      strEq(existing.paymentMethod, data.paymentMethod),
      strEq(existing.salesChannel, data.salesChannel),
      strEq(existing.internalNote, data.internalNote),
      numEq(existing.discount, data.discount),
      numEq(existing.vatRate, data.vatRate),
      numEq(existing.vatAmount, data.vatAmount),
      JSON.stringify(existing.shippingAddress ?? null) === JSON.stringify(data.shippingAddress ?? null),
      itemKey(existing.items) === itemKey(data.items),
    ].filter((same) => !same).length;
    // I-4 (2026-08-06) — แก้เฉพาะวันที่อย่างเดียว (ฟิลด์อื่นเหมือนเดิมทุกตัว) ทำให้ changedCount = 0
    // ถ้ายังเขียน ORDER_EDITED อยู่ ไทม์ไลน์จะขึ้น "แก้ไขคำสั่งซื้อ" ลอย ๆ ซ้อนกับ ORDER_DATE_CHANGED
    // ที่เพิ่งบันทึกไปด้านบน โดยไม่มีบรรทัดรองบอกว่าแก้อะไร — ข้ามการเขียน event นี้ไปเลยเมื่อไม่มี
    // อะไรเปลี่ยนจริงนอกจากวันที่
    if (changedCount > 0) {
      await recordOrderEvent(tx, {
        orderId: order.id,
        type: "ORDER_EDITED",
        actorUserId: actorUserId ?? null,
        meta: { changedCount },
      });
    }

    return order;
  });
}

// feature 00015 (TFR-011/TD-004) — ownership authorization error เดียวสำหรับ
// confirm/cancel/slip ทุกจุด: route แม็ปเป็น 403 (ไม่ echo ข้อความ ownership ดิบ)
export class OrderOwnershipError extends Error {
  constructor() {
    super("OrderOwnershipError");
    this.name = "OrderOwnershipError";
  }
}

export async function confirmOrder(publicToken: string, buyerUserId: string) {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    include: { shop: true },
  });
  if (!order) throw new Error("Order not found");
  // feature 00017 (TFR-006): ปฏิเสธการจองเสมอ — วางก่อน ownership check เพราะ
  // ต่อให้เป็นเจ้าของการจองจริงก็ยืนยันเองไม่ได้ ต้องให้เจ้าของที่พักตรวจสลิปก่อน
  if (order.type === "BOOKING") throw new BookingConfirmViaShopError();
  // TD-004: authorization ย้ายมาที่ session+ownership ล้วน — Access Gate
  // (order-access.service.ts) รับประกันแล้วว่า order.buyerUserId ตรงกับ
  // session ก่อนที่ buyer จะเห็นปุ่ม confirm; ไม่ใช้ phone-contact parity อีกต่อไป
  if (order.buyerUserId !== buyerUserId) {
    throw new OrderOwnershipError();
  }
  // CONFIRMED รับจาก PENDING หรือ SHIPPED (VALID_TRANSITIONS ครอบคลุมทั้งสอง)
  assertTransition(order.status, "CONFIRMED");
  // ไม่เขียน buyerContact/buyerUserId ที่นี่อีกต่อไป — ทั้งคู่ถูก set ที่ต้นทาง
  // (createOrder) หรือ claim-time (guaranteeOrderLink) แล้วก่อนหน้านี้
  // feature 00031 — BUYER_CONFIRMED ใน tx เดียวกับการ mark CONFIRMED
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.order.update({
      where: { publicToken },
      data: { status: "CONFIRMED" },
    });
    await recordOrderEvent(tx, {
      orderId: u.id,
      type: "BUYER_CONFIRMED",
      actorUserId: buyerUserId,
    });
    return u;
  });
  // Post-confirm recalc เป็น best-effort — ถ้า dev pool timeout หรือ error
  // อื่นใน badges/trust-score ไม่ควร fail confirmation (ข้อมูลหลัก save
  // แล้ว). Log ให้เห็นชัดถ้าล้ม. Pattern เดียวกับ createReview
  // (ย้ายมาจาก completeOrder เดิม — terminal ใหม่คือ CONFIRMED ไม่ใช่ COMPLETED)
  try {
    // 00008 P5-2: business shop มี seller-badge แยกต่อร้าน (shopId=order.shop.id); personal เดิม
    // ยัง user-level (shopId NULL) — evaluateBadges คงเดิมเป๊ะ
    if (order.shop.kind === "BUSINESS") {
      await evaluateSellerBadgesForShop({ id: order.shop.id, userId: order.shop.userId, kind: order.shop.kind });
    } else {
      await evaluateBadges(order.shop.userId);
    }
  } catch (err) {
    console.error(
      `[order] post-confirm recalc ล้มเหลวสำหรับ shop owner ${order.shop.userId}; order ${updated.publicToken} persisted but trust/badges อาจไม่ update`,
      err,
    );
  }
  // BUYER-side badge eval — จำเป็นสำหรับ Auction Completer (AUCTION_WON_COMPLETED
  // ต้อง order=CONFIRMED); ตอน settle order ยังไม่ CONFIRMED จึงต้อง re-eval ที่จุดนี้.
  // gate ด้วย auctionId: BUYER-audience badge ทุกใบปัจจุบันเป็น auction badge ล้วน
  // (First/Active Bidder, First Winner, Winner's Circle, Completer) → order ที่ไม่ใช่
  // auction ไม่มี buyer badge ให้ประเมิน — ข้ามเพื่อไม่เพิ่ม DB round-trip บน checkout
  // path ของ order ทั่วไป. best-effort + แยก try/catch ไม่ให้ล้มกระทบ SELLER eval
  if (updated.buyerUserId && updated.auctionId) {
    try {
      await evaluateBadges(updated.buyerUserId, "BUYER");
    } catch (err) {
      console.error(
        `[order] post-confirm buyer badge eval ล้มเหลวสำหรับ buyer ${updated.buyerUserId}; order ${updated.publicToken} persisted`,
        err,
      );
    }
  }
  return updated;
}


export async function shipOrder(
  publicToken: string,
  data: { provider: string; trackingNo: string },
  // feature 00031 — คนที่กดแจ้งจัดส่ง (optional เพื่อไม่ให้ผู้เรียกเดิมพัง)
  actorUserId?: string | null,
) {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order) throw new Error("Order not found");
  // Guard ใช้ fulfillmentMode แทน order.type (spec §2 ship guard)
  // รองรับ sub-box และ product type อื่น ๆ ที่อาจ override fulfillmentMode
  if (order.fulfillmentMode !== "SHIPPED") {
    throw new Error("ออเดอร์นี้ไม่ต้องจัดส่ง");
  }
  assertTransition(order.status, "SHIPPED");
  return prisma.$transaction(async (tx) => {
    await tx.shipmentTracking.create({
      data: { orderId: order.id, provider: data.provider, trackingNo: data.trackingNo },
    });
    // feature 00031 — TRACKING_ADDED ใน tx เดียวกัน; provider = ชื่อขนส่งที่ร้านกรอกเอง (ไม่ใช่ PII)
    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "TRACKING_ADDED",
      actorUserId: actorUserId ?? null,
      meta: { provider: data.provider },
    });
    return tx.order.update({ where: { publicToken }, data: { status: "SHIPPED" } });
  });
}

// S-12 — seller พิมพ์เลขพัสดุผิดหลังกด "แจ้งจัดส่ง" แล้วแก้ไม่ได้ (shipOrder ใช้ไม่ได้ซ้ำ:
// assertTransition(SHIPPED→SHIPPED) throw + shipmentTracking.orderId unique ทำให้ create ซ้ำไม่ได้)
// ต้องยกเลิกทั้งใบเพื่อแก้เลขเดิม — updateShipmentTracking() คือ "update อย่างเดียว ไม่แตะ status"
export class OrderNotShippedError extends Error {
  constructor() { super("ORDER_NOT_SHIPPED"); this.name = "OrderNotShippedError"; }
}
export class ShipmentTrackingNotFoundError extends Error {
  constructor() { super("SHIPMENT_TRACKING_NOT_FOUND"); this.name = "ShipmentTrackingNotFoundError"; }
}
// feature 00022 — เลขพัสดุที่มาจาก iShip เป็น system-generated (courier ยืนยันแล้ว) ห้าม
// เขียนทับด้วยมือ; defensive แม้ UI จะซ่อนปุ่มแก้ไขไปแล้วสำหรับออเดอร์ที่มี OrderShipment ที่ active
export class IShipManagedShipmentError extends Error {
  constructor() { super("ISHIP_MANAGED_SHIPMENT"); this.name = "IShipManagedShipmentError"; }
}

/**
 * updateShipmentTracking — แก้ไขเลขพัสดุ/ผู้ให้บริการ MANUAL (ShipmentTracking) หลัง SHIPPED แล้ว
 * (S-12). ต่างจาก shipOrder(): ไม่เรียก assertTransition, ไม่แตะ order.status, ไม่ create แถวใหม่
 * (update แถวเดิมที่ orderId unique อยู่แล้ว) — update-only เพื่อแก้พิมพ์ผิดโดยไม่ต้องยกเลิกทั้งใบ
 *
 * แยก MANUAL (ShipmentTracking, orderId unique, seller กรอกเอง) vs iShip (OrderShipment,
 * orderId ไม่ unique — มีได้หลาย attempt, ระบบสร้าง/อัปเดตเอง) คนละ model กันเด็ดขาด:
 * shipOrder()/updateShipmentTracking() เขียนเฉพาะ ShipmentTracking; iShip flow (create-shipment
 * ฯลฯ) เขียนเฉพาะ OrderShipment — ไม่มีจุดไหนใน iShip flow เขียนลง ShipmentTracking (ดู comment
 * ที่ getOrderByToken บรรทัด ~636) จึงเชื่อได้ว่า 2 model ไม่ทับกัน. ถ้าออเดอร์มี OrderShipment ที่
 * ไม่ CANCELLED อยู่ (= ship ผ่าน iShip) กันการแก้ MANUAL ทับด้วย IShipManagedShipmentError
 */
export async function updateShipmentTracking(
  publicToken: string,
  data: { provider: string; trackingNo: string },
  // feature 00031 — คนที่แก้เลขพัสดุ (optional เพื่อไม่ให้ผู้เรียกเดิมพัง)
  actorUserId?: string | null,
) {
  // scope ในคำสั่งเดียว (order + shipmentTracking + iShip shipments ที่ยัง active) แทนการ
  // findUnique แล้วค่อย query เพิ่มทีหลัง — ownership ของ order ถูก route เช็คมาก่อนแล้ว (S-C7)
  const order = await prisma.order.findFirst({
    where: { publicToken },
    include: {
      shipmentTracking: true,
      shipments: { where: { status: { not: "CANCELLED" } }, select: { id: true } },
    },
  });
  if (!order) throw new Error("Order not found");
  if (order.status !== "SHIPPED") throw new OrderNotShippedError();
  if (!order.shipmentTracking) throw new ShipmentTrackingNotFoundError();
  if (order.shipments.length > 0) throw new IShipManagedShipmentError();

  // feature 00031 — การแก้เลข/ขนส่งคือการ "แจ้งเลขพัสดุ" รอบใหม่ของออเดอร์เดิม
  // บันทึกเป็น TRACKING_ADDED ใน tx เดียวกัน (ค่าใหม่คือความจริงล่าสุดที่ผู้ซื้อจะได้เห็น)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.shipmentTracking.update({
      where: { orderId: order.id },
      data: { provider: data.provider, trackingNo: data.trackingNo },
    });
    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "TRACKING_ADDED",
      actorUserId: actorUserId ?? null,
      meta: { provider: data.provider },
    });
    return updated;
  });
}

export class CancelReasonRequiredError extends Error {
  constructor() { super("CANCEL_REASON_REQUIRED"); this.name = "CancelReasonRequiredError"; }
}
export class InvalidCancelReasonError extends Error {
  constructor() { super("INVALID_CANCEL_REASON"); this.name = "InvalidCancelReasonError"; }
}

/**
 * cancelOrder — พารามิเตอร์ที่ 3 (reason) optional เพื่อไม่ให้ผู้เรียกเดิมพัง
 *
 * feature 00017 (BR-LODG-36/37) — กติกาเฉพาะการจอง:
 *   เจ้าของกดยกเลิก → reason บังคับ (เจ้าของยกเลิกได้ทั้งกรณีผู้จองผิดและร้านผิดเอง
 *                      ถ้าไม่ถาม ระบบแยกไม่ออกและผู้จองอาจติดประวัติทั้งที่ไม่ได้ทำอะไรผิด)
 *   ผู้จองกดยกเลิกเอง → ระบบตั้ง BUYER_REQUESTED ให้ (initiator มาจาก session อยู่แล้ว
 *                      จึงระบุตัวผู้ยกเลิกได้แน่นอน ไม่ต้องถามซ้ำ)
 *   ออเดอร์ที่ไม่ใช่การจอง → ละเว้น reason ทำงานเหมือนเดิมทุกประการ
 */
export async function cancelOrder(
  publicToken: string,
  initiator: "seller" | "buyer",
  reason?: string,
  // feature 00031 — คนที่กดยกเลิก (guest buyer = null เป็นค่าปกติ ไม่ใช่ข้อยกเว้น)
  actorUserId?: string | null,
) {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order) throw new Error("Order not found");

  let cancelReason: string | undefined;
  if (order.type === "BOOKING") {
    if (initiator === "buyer") {
      cancelReason = "BUYER_REQUESTED";
    } else {
      if (!reason) throw new CancelReasonRequiredError();
      if (!isCancelReason(reason)) throw new InvalidCancelReasonError();
      cancelReason = reason;
    }
  }
  // reject cancel หลัง CONFIRMED (terminal สำเร็จ ยกเลิกไม่ได้)
  assertTransition(order.status, "CANCELLED");
  // Inventory Add-on hook — restock ตามประวัติจริงของ order (stockDeducted != null)
  // ไม่เช็คสถานะ entitlement ปัจจุบันเลย (BR-INV-12: order ที่ตัดสต็อกไปตอน entitlement ยัง
  // ACTIVE ต้องได้คืนสต็อกตอน cancel แม้ entitlement จะหลุด ACTIVE ไปแล้วก็ตาม)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { publicToken },
      data: { status: "CANCELLED", cancelInitiator: initiator, cancelReason },
    });
    // BREAKING (00009 S-3/S-5) — restockFromCancelledOrder เพิ่ม param shopId (สำหรับ StockMovement.shopId)
    await restockFromCancelledOrder(tx, order.shopId, order.id);
    // feature 00031 — ORDER_CANCELLED ใน tx เดียวกัน; initiatorRole ไว้แสดง "ยกเลิกโดยฝั่งไหน"
    // ตอนไม่รู้ตัวคน (guest buyer)
    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "ORDER_CANCELLED",
      actorUserId: actorUserId ?? null,
      meta: { initiatorRole: initiator },
    });
    return updated;
  });
}

export async function getOrderByToken(publicToken: string) {
  return prisma.order.findUnique({
    where: { publicToken },
    include: {
      // เพิ่ม product.images เพื่อ resolve imageUrl ต่อ item (S-1 T1)
      // pattern เดียวกับ getOrdersByShop ที่ทำ items: { include: { product: { select: { images: true } } } }
      items: { include: { product: { select: { images: true } } } },
      // feature 00017 — relation nullable: ออเดอร์สินค้าได้ room = null ไม่กระทบอะไร
      room: { select: { name: true } },
      // feature 00024 — ชื่อทรัพยากรสำหรับการ์ดนัดบนหน้าออเดอร์สาธารณะ (FR-RSV-05)
      // relation nullable เช่นกัน: ออเดอร์ที่ไม่มีนัดได้ null ไม่กระทบเส้นทางเดิม
      // select แค่ name — ไม่ดึงความจุ/มัดจำเริ่มต้นมาเพราะลูกค้าไม่ต้องเห็นค่าตั้งค่าของร้าน
      serviceResource: { select: { name: true } },
      shop: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              username: true,
              trustScore: true,
              // เพิ่ม avatar เพื่อแสดง shop owner avatar ใน V1 UI (S-1 T1)
              avatar: true,
              userBadges: { include: { badge: true } },
            },
          },
        },
      },
      // buyer: registered user ที่ยืนยัน order — ใช้แสดง displayName ใน seller view
      // additive include — caller เดิมที่ไม่ใช้ buyer ไม่กระทบ
      buyer: { select: { id: true, displayName: true, username: true, avatar: true } },
      shipmentTracking: true,
      // feature 00022 — พัสดุ iShip ที่ยังใช้งานอยู่ (ถ้ามี) ใช้เป็น fallback ของเลขติดตาม
      // เมื่อร้านยังไม่ได้กด "แจ้งจัดส่ง" ด้วยตัวเอง — ผู้ซื้อจะได้ไม่ต้องรอ
      // ห้ามเขียนลง ShipmentTracking แทน: orderId เป็น unique และ shipOrder() สร้างแถวนั้น
      // พร้อมเปลี่ยนสถานะออเดอร์ในทรานแซกชันเดียว ถ้าเราชิงสร้างไว้ก่อน ปุ่มแจ้งจัดส่ง
      // ของร้านจะชน P2002 ใช้ไม่ได้อีกเลย
      shipments: {
        where: { status: 'CREATED' },
        select: { trackingNo: true, courierName: true, courierCode: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      review: true,
    },
  });
}

// DAL pattern: กรอง ownership ตั้งแต่ query layer เพื่อกัน RSC flight-data leak
// (redirect-after-fetch ไม่เพียงพอเพราะ Next.js serialize object ก่อน redirect throw)
export async function getOrderForShop(publicToken: string, shopId: string) {
  return prisma.order.findFirst({
    where: { publicToken, shopId },
    include: {
      // เพิ่ม product.images เพื่อ resolve imageUrl thumbnail → OrderSummary (theme fidelity)
      items: {
        include: {
          product: { select: { images: true } },
        },
      },
      shop: { include: { user: { select: { id: true, displayName: true, username: true, trustScore: true, userBadges: { include: { badge: true } } } } } },
      // buyer: เพิ่ม avatar เพื่อแสดง avatar ใน CustomerDetails (theme fidelity)
      // additive — ไม่ break caller เดิม
      buyer: { select: { id: true, displayName: true, username: true, avatar: true } },
      // คนที่กดสร้างออเดอร์ (2026-08-04) — หน้า "ประวัติคำสั่งซื้อ" แสดงชื่อ+รูปแทนคำว่า "ระบบ"
      // select แคบ ๆ เฉพาะที่ต้องโชว์: ห้ามดึง phone/email มาด้วย หน้านี้อยู่ใต้ client layout
      // ทุก field ที่ include จะถูก serialize เข้า flight payload เสมอ (feedback_rsc_pii_neutralize_at_source)
      createdBy: { select: { id: true, displayName: true, username: true, avatar: true } },
      // คนที่กดยืนยันรับเงินปลายทาง — การ์ด COD แสดง "รับเมื่อ ... โดย ..." ให้ตามตัวได้ว่าใครกด
      // (กดผิดแล้วใบหลุดจากกอง "รอเงิน COD" เงียบ ๆ ต้องรู้ว่าถามใคร) select แคบเหมือน createdBy
      codReceivedBy: { select: { id: true, displayName: true, username: true } },
      shipmentTracking: true,
      review: true,
    },
  });
}

/**
 * setCodReceived — บันทึก/ล้าง "ร้านได้รับเงินเก็บปลายทางแล้ว"
 *
 * ตั้งใจไม่แตะ Order.status เลย: การได้เงินเป็นคนละแกนกับสถานะคำสั่งซื้อ (ผู้ซื้อยืนยันรับของ
 * ยังเป็นเงื่อนไขเดียวที่ทำให้ออเดอร์ CONFIRMED และมีผลต่อ Trust Score) — ถ้าให้ปุ่มนี้ไปปิด
 * ออเดอร์ด้วย ร้านจะปิดการขายแทนผู้ซื้อได้ ซึ่งเป็นการปลอมคำยืนยัน
 *
 * ล้างค่าได้ (clear) เพราะกดผิดใบเป็นเรื่องที่เกิดจริง และไม่มีอะไรเสียหายถาวรจากการย้อน —
 * ต่างจาก CONFIRMED ที่เป็นสถานะปลายทางจึงย้อนไม่ได้
 */
export async function setCodReceived(
  orderId: string,
  actorUserId: string | null,
  opts?: { clear?: boolean },
) {
  return prisma.order.update({
    where: { id: orderId },
    data: opts?.clear
      ? { codReceivedAt: null, codReceivedByUserId: null }
      : { codReceivedAt: new Date(), codReceivedByUserId: actorUserId },
    select: { id: true, codReceivedAt: true },
  });
}

/**
 * settleCodFromCarrier — ขนส่งโอนเงินเก็บปลายทางเข้าร้านแล้ว (BR-ISHIP-45..48, 2026-08-06)
 *
 * เรียกจากรอบ sync ของ iShip เมื่อพบ `settlement_at` ครั้งแรกของพัสดุใบหนึ่ง
 * ผู้เรียกเป็นคน "จอง" สิทธิ์ประมวลผลด้วยการเขียน OrderShipment.codSettledAt แบบมีเงื่อนไข
 * มาแล้ว — ที่นี่จึงไม่ต้องกันซ้ำอีกชั้น
 *
 * ทำไมกล้ายืนยันแทนผู้ซื้อ (กลับกฎ BR-ISHIP-41 เดิม, user เคาะ 2026-08-06):
 * COD ที่ขนส่งโอนเงินแล้วคือห่วงโซ่หลักฐานครบสามท่อน — ส่งถึง → ผู้ซื้อจ่ายเงินสดจริง →
 * ขนส่งโอนเข้าบัญชีร้าน ยืนยันโดยบุคคลที่สามที่ไม่มีส่วนได้เสียกับคะแนนของร้าน
 * แข็งแรงกว่าปุ่มที่ผู้ซื้อกด (ปุ่มไม่มีเงินค้ำ ใครถือลิงก์ก็กดได้) และการปลอมเส้นทางนี้
 * ต้องจ่ายค่าส่ง + ค่าธรรมเนียม COD จริงทุกใบ
 *
 * คืน true เมื่อคำสั่งซื้อถูกยืนยันอัตโนมัติจริงในครั้งนี้
 */
export async function settleCodFromCarrier(input: {
  orderId: string;
  /** เวลาที่ขนส่งแจ้งว่าเงินเข้า (แปลงเขตเวลาแล้ว) */
  settledAt: Date;
  /** ยอด COD ที่ขนส่งแจ้ง — ใช้แสดงในไทม์ไลน์ */
  codAmount: number;
}): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      codReceivedAt: true,
      auctionId: true,
      buyerUserId: true,
      publicToken: true,
      shop: { select: { id: true, userId: true, kind: true } },
    },
  });
  if (!order) return false;
  // ไม่ตรวจ order.paymentMethod ที่นี่โดยเจตนา (user เคาะ 2026-08-06): ผู้เรียกพิสูจน์มาแล้ว
  // ว่า **พัสดุ** ใบนี้เก็บเงินปลายทางจริงและขนส่งโอนเงินแล้ว ซึ่งเป็นหลักฐานที่แข็งแรงกว่า
  // ข้อความที่ร้านพิมพ์ไว้ในช่องวิธีชำระเงิน (พบค่าจริงบน prod ทั้ง COD/CASH/TRANSFER/
  // "พร้อมเพย์ 081-xxx") — ใบ TH140290UGSM3H เก็บเงินปลายทาง ฿360 จริงแต่บันทึกเป็น "CASH"
  // ถ้ากรองด้วย paymentMethod ใบแบบนี้จะไม่มีวันถูกปิดงานให้เลย
  //
  // ทางกันไม่ให้พลาดฝั่งต้นทางอยู่ที่ resolvePaymentSync (lib/iship/payment-sync.ts)
  // ซึ่งปรับ paymentMethod ให้ตรงพัสดุตั้งแต่ตอนเปิด/ผูกพัสดุแล้ว

  await prisma.$transaction(async (tx) => {
    // ไม่ทับค่าที่ร้านกดไว้ก่อน (BR-ISHIP-48) — ใครมาก่อนได้ก่อน
    if (!order.codReceivedAt) {
      await tx.order.update({
        where: { id: order.id },
        // codReceivedByUserId เว้น null โดยเจตนา = "ระบบ" ตามที่หน้าจอตีความอยู่แล้ว
        data: { codReceivedAt: input.settledAt, codReceivedByUserId: null },
      });
    }
    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "COD_SETTLED",
      actorUserId: null,
      occurredAt: input.settledAt,
      meta: { amount: input.codAmount },
    });
  });

  // conditional update — ยกเลิกแล้วห้ามปลุกกลับ (BR-ISHIP-46) และผู้ซื้อ/ร้านที่กดยืนยัน
  // ไปเสี้ยววินาทีก่อนต้องไม่ถูกเขียนทับ (count=0 = มีคนอื่นทำไปแล้ว ไม่ใช่ความผิดพลาด)
  const advanced = await prisma.order.updateMany({
    where: { id: order.id, status: { in: ["PENDING", "SHIPPED"] } },
    data: { status: "CONFIRMED" },
  });
  if (advanced.count === 0) return false;

  await recordOrderEvent(prisma, {
    orderId: order.id,
    type: "SYSTEM_CONFIRMED",
    actorUserId: null,
    occurredAt: input.settledAt,
  });

  // recalc ชุดเดียวกับ confirmOrder เป๊ะ — best-effort ตาม pattern เดิม (ล้มแล้วไม่ย้อนสถานะ
  // เพราะข้อมูลหลักบันทึกแล้ว) BR-ISHIP-44: ไม่มีสูตรพิเศษสำหรับใบที่ระบบยืนยันเอง
  try {
    if (order.shop.kind === "BUSINESS") {
      await evaluateSellerBadgesForShop(order.shop);
    } else {
      await evaluateBadges(order.shop.userId);
    }
  } catch (err) {
    console.error(
      `[order] post-auto-confirm recalc ล้มเหลวสำหรับ shop owner ${order.shop.userId}; order ${order.publicToken} persisted`,
      err,
    );
  }
  if (order.buyerUserId && order.auctionId) {
    try {
      await evaluateBadges(order.buyerUserId, "BUYER");
    } catch (err) {
      console.error(
        `[order] post-auto-confirm buyer badge eval ล้มเหลวสำหรับ buyer ${order.buyerUserId}; order ${order.publicToken} persisted`,
        err,
      );
    }
  }
  return true;
}

/**
 * syncOrderPaymentToParcel — ให้วิธีชำระเงินของคำสั่งซื้อตรงกับพัสดุที่เปิดจริง
 *
 * user สั่ง 2026-08-06: "ถ้าเลือกเปิดพัสดุ iShip เป็น COD แต่คำสั่งซื้อไม่ใช่ COD
 * ก็แจ้งเตือนเปลี่ยนให้เลย สะดวก"
 *
 * คืนข้อความที่ต้องบอกร้าน (null = ไม่มีอะไรต้องบอก) — ผู้เรียกเป็นคนตัดสินว่าจะแสดงยังไง
 * ตัวตัดสินใจอยู่ใน resolvePaymentSync ซึ่ง pure และเทสแยกได้
 */
export async function syncOrderPaymentToParcel(
  orderId: string,
  parcelCodAmount: number,
  actorUserId: string | null,
): Promise<{ kind: "changed" | "warning"; message: string } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, paymentMethod: true },
  });
  if (!order) return null;

  const decision = resolvePaymentSync({
    orderPaymentMethod: order.paymentMethod,
    parcelCodAmount,
  });
  if (decision.action === "NONE") return null;
  if (decision.action === "WARN_NO_COD") return { kind: "warning", message: decision.message };

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { paymentMethod: "COD" } });
    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "PAYMENT_METHOD_SYNCED",
      actorUserId,
      meta: { amount: decision.codAmount, paymentFrom: decision.from },
    });
  });
  return { kind: "changed", message: decision.message };
}

export async function getOrdersByShop(shopId: string, status?: string) {
  return prisma.order.findMany({
    where: { shopId, ...(status ? { status } : {}) },
    include: {
      // items: เพิ่ม product.images เพื่อ resolve imageUrl → /api/files/{id} ใน OrderCard (F2)
      // pattern เดียวกับ new/page.tsx L67 ที่ resolve image จาก p.images[0]
      items: {
        include: {
          product: { select: { images: true } },
        },
      },
      shipmentTracking: true,
      // พัสดุใบล่าสุดที่ยัง active — หน้ารายการใช้จัด "กองงานตามสถานะพัสดุ" (deriveShippingStage)
      // take:1 + select แคบ ๆ เพื่อไม่ให้ payload บวมทั้งที่ต้องการแค่ carrierStatus
      shipments: {
        where: { status: "CREATED", isDryRun: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          // id: ต้องมี ไม่งั้นหน้ารายการยิงถามสถานะจาก iShip ไม่ได้ (ต้องใช้ใน
          // /api/seller/iship/shipments/[id]/traces) — เคยลืมแล้วการ์ด hover ขึ้นแต่
          // ส่วน "การเดินทางล่าสุด" หายทั้งหมดโดยไม่มี error (user เจอ 2026-08-06)
          id: true,
          carrierStatus: true,
          // 2 ช่องนี้ซ้ำกับ where ด้านบนโดยตั้งใจ — countsAsRevenue() (lib/order-revenue.ts) ตรวจ
          // เงื่อนไขเองอีกชั้นเพื่อให้ผลตรงกับ revenueOrderWhere เป๊ะ ไม่ต้องเชื่อว่า caller กรองมาแล้ว
          status: true,
          isDryRun: true,
          // แถวออเดอร์ต้องเห็นเลขพัสดุ + ขนส่งเจ้าไหน + เปิดผ่านแพลตฟอร์มไหน (user สั่ง 2026-08-04)
          trackingNo: true,
          courierCode: true,
          courierName: true,
          provider: true,
        },
      },
      review: true,
      // buyer: registered user ที่ยืนยัน order — ใช้แสดงชื่อลูกค้าใน seller order list
      // คัดลอก select เดียวกับ getOrderForShop (additive — ไม่ break caller เดิม)
      buyer: { select: { id: true, displayName: true, username: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * getOrdersByCustomer — ออเดอร์ของลูกค้าคนหนึ่งในร้าน แบบแบ่งหน้า (feature 00018 orders tab + lazy load)
 * cursor = createdAt ISO ของแถวสุดท้ายที่เห็น (keyset createdAt desc — ออเดอร์ต่อลูกค้ามีไม่มาก).
 * serialize Decimal/Date ก่อนคืน (ข้าม RSC/JSON boundary) — ตรง shape CustomerPanelOrder เป๊ะ
 */
export async function getOrdersByCustomer(
  shopId: string,
  customerId: string,
  opts: { cursor?: string; take?: number; bookingOnly?: boolean } = {},
): Promise<{
  items: {
    id: string;
    token: string;
    status: string;
    fulfillmentMode: string;
    totalAmount: string;
    createdAt: string;
    checkIn: string | null;
    checkOut: string | null;
    items: { name: string; qty: number; price: string; imageFileId: string | null }[];
    /** พัสดุ iShip ที่ยังใช้งานอยู่ (feature 00022) — null = ยังไม่เปิดพัสดุ */
    shipment: { trackingNo: string | null; courierName: string | null } | null;
  }[];
  nextCursor: string | null;
}> {
  const take = Math.min(opts.take ?? 20, 50);
  const rows = await prisma.order.findMany({
    where: {
      shopId,
      customerId,
      ...(opts.bookingOnly ? { type: "BOOKING" } : {}),
      ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1, // +1 เพื่อรู้ว่ามีหน้าถัดไปไหม
    select: {
      id: true,
      publicToken: true,
      orderNo: true,
      status: true,
      fulfillmentMode: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      checkIn: true,
      checkOut: true,
      // Order Progress (2026-08-05) — ให้แถบสถานะในแชทแยก AWAITING_COD ได้
      paymentMethod: true,
      codReceivedAt: true,
      // การ์ด right panel แสดงเหมือนในแชท (user 2026-07-25): ชื่อ/จำนวน/ราคา/รูปสินค้า
      items: { select: { name: true, qty: true, price: true, product: { select: { images: true } } } },
      // feature 00022 — พอรู้ว่ามีพัสดุแล้วหรือยัง ปุ่มบนการ์ดจะได้บอกล่วงหน้าว่ากดแล้วเจออะไร
      // เอามาพร้อมออเดอร์ ไม่ใช่ให้การ์ดแต่ละใบยิง API ถามเอง (ลิสต์ 20 ใบ = 20 คำขอ)
      // status/carrierStatus/courierCode เพิ่ม 2026-08-05: ให้ stepper + โลโก้ในการ์ด render ได้
      shipments: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { trackingNo: true, courierName: true, courierCode: true, status: true, carrierStatus: true },
      },
    },
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;
  return {
    items: items.map((o) => ({
      id: o.id,
      token: o.publicToken,
      orderNo: o.orderNo,
      status: o.status,
      fulfillmentMode: o.fulfillmentMode,
      totalAmount: o.totalAmount.toString(),
      createdAt: o.createdAt.toISOString(),
      statusAt: o.updatedAt.toISOString(),
      checkIn: o.checkIn ? o.checkIn.toISOString() : null,
      checkOut: o.checkOut ? o.checkOut.toISOString() : null,
      paymentMethod: o.paymentMethod,
      codReceivedAt: o.codReceivedAt ? o.codReceivedAt.toISOString() : null,
      items: o.items.map((it) => ({
        name: it.name,
        qty: it.qty,
        price: it.price.toFixed(2),
        imageFileId: (it.product?.images as string[] | undefined)?.[0] ?? null,
      })),
      shipment: o.shipments[0]
        ? {
            trackingNo: o.shipments[0].trackingNo,
            courierName: o.shipments[0].courierName,
            courierCode: o.shipments[0].courierCode,
            status: o.shipments[0].status,
            carrierStatus: o.shipments[0].carrierStatus,
          }
        : null,
    })),
    nextCursor,
  };
}

/**
 * attachSlip — buyer แนบ fileId ของสลิปโอนเงินเข้า order
 *
 * feature 00015 (TFR-011/TD-004) — ตัด contact-parity ออก ownership check
 * (session.user.id === order.buyerUserId) ทำที่ route ก่อนเรียก service แล้ว
 */
export async function attachSlip(publicToken: string, fileId: string) {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order) throw new Error("Order not found");
  // status guard — slip แนบได้เฉพาะ PENDING เท่านั้น (ยังรอดำเนินการ)
  // CONFIRMED/CANCELLED/SHIPPED = terminal หรือ transit ที่ไม่ต้องการสลิปแล้ว
  if (order.status !== "PENDING") {
    throw new Error("แนบสลิปได้เฉพาะคำสั่งซื้อที่รอดำเนินการ");
  }
  return prisma.order.update({ where: { publicToken }, data: { slipFileId: fileId } });
}

/**
 * setAccessUrl — seller ตั้ง URL เข้าถึง digital content ของ order
 *
 * ทำไม: แยกเป็น service เพื่อให้ route handler (S-5) ทำ ownership check
 * ผ่าน shopOwnerId โดยตรง แทนที่จะ duplicate findUnique + shop.userId check
 * ไม่มี status guard — seller ตั้งได้ทุก status (ตาม spec S-5)
 */
export async function setAccessUrl(publicToken: string, url: string, shopOwnerId: string) {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    include: { shop: true },
  });
  if (!order) throw new Error("Order not found");
  // ownership guard — กัน seller อื่นมา set accessUrl ทับ
  if (order.shop.userId !== shopOwnerId) throw new Error("Forbidden");
  return prisma.order.update({ where: { publicToken }, data: { accessUrl: url } });
}

/**
 * getOrderStatusCounts — นับจำนวน order ต่อ status สำหรับ Command Center timeline
 *
 * ทำไม: ใช้ groupBy เดียว ไม่ query ซ้ำหลายครั้ง;
 * normalize ให้ 4 bucket เสมอ (status ที่ไม่มีใน DB = 0)
 * เพื่อกัน UI ต้อง handle undefined
 *
 * Status ที่ project ใช้จริง (จาก VALID_TRANSITIONS): PENDING, SHIPPED, CONFIRMED, CANCELLED
 * (schema ใช้ String ไม่ใช่ enum — ค่าตรงกับ 4 bucket ที่ต้องการพอดี ไม่ต้อง map)
 */
export async function getOrderStatusCounts(
  shopId: string,
): Promise<{ PENDING: number; SHIPPED: number; CONFIRMED: number; CANCELLED: number }> {
  const rows = await prisma.order.groupBy({
    by: ['status'],
    where: { shopId },
    _count: { id: true },
  })

  // normalize — status ที่ไม่มีใน result ให้เป็น 0
  const map: Record<string, number> = {}
  for (const row of rows) {
    map[row.status] = row._count.id
  }

  return {
    PENDING:   map['PENDING']   ?? 0,
    SHIPPED:   map['SHIPPED']   ?? 0,
    CONFIRMED: map['CONFIRMED'] ?? 0,
    CANCELLED: map['CANCELLED'] ?? 0,
  }
}

/**
 * getShippingStageCounts — ตัวนับ 4 ช่องของ "สถานะคำสั่งซื้อ" บน Command Center (ร้าน ONLINE_SALES)
 * user สั่ง 2026-08-04 ให้เปลี่ยนจาก [รอดำเนินการ/กำลังจัดส่ง/สำเร็จ/ยกเลิก] ซึ่งเป็นสถานะ "การขาย"
 * มาเป็นสถานะ "ของอยู่ไหน" ที่ร้านขายออนไลน์ต้องลงมือทำจริงในแต่ละวัน
 *
 * [สำคัญ] นับด้วย deriveShippingStage ตัวเดียวกับที่หน้า /orders ใช้กรอง — เดิมเขียนเป็น CASE ใน SQL
 * ซึ่งเร็วกว่าแต่แปลว่ามีนิยาม 2 ชุด (SQL นับ / TS กรอง) วันหนึ่งจะกดไทล์ที่บอก 5 แล้วเข้าไปเจอ 4 ใบ
 * โดยไม่มีอะไรเตือน. โหลดแถวมาแล้วนับใน TS แทน — ปริมาณรับได้เพราะหน้า /orders เองก็ดึงออเดอร์
 * ทั้งร้านมาอยู่แล้ว และ query นี้ select แค่ 3 คอลัมน์
 *
 * พัสดุที่นับ = ใบล่าสุดต่อออเดอร์ที่ยัง active (status='CREATED') และไม่ใช่ของทดสอบ
 * (isDryRun=false ตาม BR-ISHIP-60/61 ที่สั่งไว้ว่าต้องกันออกจากสถิติทุกชนิด)
 */
export async function getShippingStageCounts(shopId: string): Promise<{
  AWAITING_PARCEL: number
  AWAITING_PICKUP: number
  SHIPPING: number
  AWAITING_COD: number
  PROBLEM: number
}> {
  const rows = await prisma.order.findMany({
    where: { shopId, status: { not: "CANCELLED" } },
    select: {
      status: true,
      // ไทล์ "รอเงิน COD" ต้องรู้ว่าใบนี้เก็บเงินปลายทางไหม และร้านกดว่าได้เงินแล้วหรือยัง
      paymentMethod: true,
      codReceivedAt: true,
      shipments: {
        where: { status: "CREATED", isDryRun: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { carrierStatus: true },
      },
    },
  });

  const counts = { AWAITING_PARCEL: 0, AWAITING_PICKUP: 0, SHIPPING: 0, AWAITING_COD: 0, PROBLEM: 0 };
  for (const o of rows) {
    const stage = deriveShippingStage({
      status: o.status,
      carrierStatus: o.shipments[0]?.carrierStatus ?? null,
      hasShipment: o.shipments.length > 0,
      paymentMethod: o.paymentMethod,
      codReceivedAt: o.codReceivedAt,
    });
    if (stage !== "DONE") counts[stage] += 1;
  }
  return counts;
}

export async function getOrdersByBuyer(userId: string) {
  return prisma.order.findMany({
    where: { buyerUserId: userId },
    include: {
      items: true,
      shop: { include: { user: { select: { username: true, displayName: true } } } },
      review: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * สรุปออเดอร์แบบ "ปลอดภัยพอจะโชว์ก่อน login" — ใช้ที่หน้า /auth/sign-in เมื่อผู้ซื้อถูก
 * redirect มาจากลิงก์ออเดอร์ เพื่อให้เห็นว่ากำลังจะเข้าถึงคำสั่งซื้อใบไหน จากร้านไหน
 * ก่อนตัดสินใจเลือกช่องทางเข้าสู่ระบบ
 *
 * ขอบเขตข้อมูล (user ตัดสิน 2026-07-25 — ตัวเลือก "ข"): ชื่อร้าน + เลขออเดอร์ + ยอดรวม
 * + วันที่เท่านั้น
 *
 * ห้ามเพิ่ม field ที่เป็น PII ของคนเด็ดขาด (buyerName/buyerContact/shippingAddress) และ
 * ห้ามเพิ่มรายการสินค้า — ผู้เรียกคือผู้ใช้ที่ "ยังไม่ผ่านการยืนยันตัวตน" เป็นเพียงคนที่ถือ
 * ลิงก์อยู่ในมือ ซึ่งอาจเป็นคนที่ได้ลิงก์ต่อมาก็ได้
 *
 * ข้อแลกเปลี่ยนที่รับไว้แล้ว: การคืนค่า (ไม่ใช่ null) เท่ากับยืนยันกลาย ๆ ว่า token นี้มี
 * ออเดอร์จริง — แลกกับการที่ผู้ซื้อมั่นใจว่ากดลิงก์ถูกใบก่อนยอมล็อกอิน
 */
export async function getOrderSummaryForSignIn(publicToken: string) {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    select: {
      publicToken: true,
      totalAmount: true,
      createdAt: true,
      shop: {
        select: {
          id: true,
          shopName: true,
          logo: true,
          coverImage: true,
          createdAt: true,
          user: { select: { id: true, username: true, trustScore: true } },
          // ช่องทางที่ร้านเชื่อมไว้ — ผู้ซื้อเพิ่งคุยกับเพจนี้อยู่ในแชทเมื่อครู่
          // เอาเฉพาะ ACTIVE: เพจที่ถอดออกแล้วไม่ใช่หลักฐานว่าติดต่อร้านได้
          channels: {
            where: { status: "ACTIVE" },
            select: { provider: true, name: true, avatarUrl: true },
          },
        },
      },
    },
  });
  if (!order) return null;

  const shopId = order.shop.id;
  const ownerId = order.shop.user.id;

  const [orderStats, ratingAgg, approvedVerifications, latestReview] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { shopId },
      _count: { _all: true },
    }),
    prisma.review.aggregate({
      where: { order: { shopId } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.verificationRecord.findMany({
      where: { userId: ownerId, status: "APPROVED" },
      select: { level: true },
    }),
    // รีวิวล่าสุดที่ "มีข้อความจริง" — ข้อความจากคนซื้อจริงหนึ่งอันน่าเชื่อกว่าค่าเฉลี่ยลอย ๆ
    // ไม่มีรีวิวที่เขียนข้อความ → null → UI ซ่อนบล็อกไปเลย ไม่แต่งคำชมขึ้นมาเอง
    prisma.review.findFirst({
      where: { order: { shopId }, comment: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { rating: true, comment: true, createdAt: true },
    }),
  ]);

  const confirmedCount = orderStats.find((s) => s.status === "CONFIRMED")?._count._all ?? 0;
  const cancelledCount = orderStats.find((s) => s.status === "CANCELLED")?._count._all ?? 0;
  const settled = confirmedCount + cancelledCount;
  const completionRate = settled > 0 ? Math.round((confirmedCount / settled) * 100) : null;

  const maxVerifyLevel = approvedVerifications.length
    ? Math.max(...approvedVerifications.map((v) => v.level))
    : 0;

  return {
    publicToken: order.publicToken,
    totalAmount: Number(order.totalAmount),
    createdAtIso: order.createdAt.toISOString(),

    shopName: order.shop.shopName,
    shopUsername: order.shop.user.username,
    logo: toFileUrl(order.shop.logo),
    coverImage: toFileUrl(order.shop.coverImage),
    shopCreatedAtIso: order.shop.createdAt.toISOString(),
    trustScore: order.shop.user.trustScore,
    maxVerifyLevel,

    // สถิติ: ส่ง null เมื่อยังไม่มีประวัติ ให้ UI ซ่อนทั้งแถบแทนการโชว์เลขศูนย์
    // การโชว์ "0 ออเดอร์" หรือแต่งตัวเลขให้ดูดีคือสิ่งที่ระบบนี้ตั้งใจกำจัด
    completedOrders: confirmedCount > 0 ? confirmedCount : null,
    completionRate,
    avgRating: ratingAgg._count._all > 0 ? Number(ratingAgg._avg.rating?.toFixed(1)) : null,
    reviewCount: ratingAgg._count._all,

    channels: order.shop.channels.map((c) => ({
      provider: c.provider,
      name: c.name,
      // avatarUrl ของเพจมาจาก Graph API เป็น URL เต็มอยู่แล้ว แต่ผ่าน toFileUrl ไว้กันกรณี
      // ถูกมิเรอร์ลง storage ภายหลัง
      avatarUrl: toFileUrl(c.avatarUrl),
    })),

    latestReview: latestReview
      ? {
          rating: latestReview.rating,
          comment: latestReview.comment as string,
          createdAtIso: latestReview.createdAt.toISOString(),
        }
      : null,
  };
}
