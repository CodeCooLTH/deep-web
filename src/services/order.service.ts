import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateBadges, evaluateSellerBadgesForShop } from "@/services/badge.service";
import { deductStockForOrderItems, restockFromCancelledOrder } from "@/services/inventory-stock.service";
import { normalizePhone } from "@/lib/phone";
import { findOrCreateCustomer } from "@/services/customer.service";
import { isCancelReason } from "@/lib/lodging";

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
}) {
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
  const orderDataBase = {
    shopId,
    type: data.type,
    totalAmount,
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
  };

  // 🛑 TD-001 (SDS §3.5): retry loop ต้องครอบ $transaction ทั้งก้อน ไม่ใช่อยู่ข้างในเดียว
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
  const updated = await prisma.order.update({
    where: { publicToken },
    data: { status: "CONFIRMED" },
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


export async function shipOrder(publicToken: string, data: { provider: string; trackingNo: string }) {
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
    return tx.order.update({ where: { publicToken }, data: { status: "SHIPPED" } });
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
      shipmentTracking: true,
      review: true,
    },
  });
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
      review: true,
      // buyer: registered user ที่ยืนยัน order — ใช้แสดงชื่อลูกค้าใน seller order list
      // คัดลอก select เดียวกับ getOrderForShop (additive — ไม่ break caller เดิม)
      buyer: { select: { id: true, displayName: true, username: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
  });
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
