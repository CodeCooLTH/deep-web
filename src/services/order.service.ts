import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateBadges } from "@/services/badge.service";
import { deductStockForOrderItems, restockFromCancelledOrder } from "@/services/inventory-stock.service";

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

// FR-6.5: order ที่ต้องจัดส่งต้องมีที่อยู่จัดส่ง — throw นี้ให้ route map เป็น 400
export class ShippingAddressRequiredError extends Error {
  constructor() { super("SHIPPING_ADDRESS_REQUIRED"); this.name = "ShippingAddressRequiredError"; }
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

  // ตรวจ product จริงจาก DB — ถ้ามี product ใดที่ fulfillmentMode=SHIPPED → SHIPPED
  if (fulfillmentMode !== "SHIPPED" && productIds.length > 0) {
    const shippedProduct = await prisma.product.findFirst({
      where: { id: { in: productIds }, fulfillmentMode: "SHIPPED" },
      select: { id: true },
    });
    if (shippedProduct) {
      fulfillmentMode = "SHIPPED";
    }
  }

  // FR-6.5: ออเดอร์ที่ต้องจัดส่ง (SHIPPED) ต้องมีที่อยู่ครบขั้นต่ำ (line1 + จังหวัด + รหัสไปรษณีย์)
  // enforce ที่ service layer (single source) — กัน API-direct call ที่ข้าม form
  if (fulfillmentMode === "SHIPPED") {
    const a = data.shippingAddress;
    const hasEssentials = !!(a?.line1?.trim() && a?.province?.trim() && a?.postcode?.trim());
    if (!hasEssentials) throw new ShippingAddressRequiredError();
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
        const deductedIds =
          entitlement?.status === "ACTIVE"
            ? await deductStockForOrderItems(tx, data.items) // throw OutOfStockError = rollback attempt นี้
            : new Set<string>();

        const itemsCreateData = data.items.map((item) => ({
          ...item,
          stockDeducted: item.productId && deductedIds.has(item.productId) ? item.qty : null,
        }));

        return tx.order.create({
          data: { ...orderDataBase, items: { create: itemsCreateData }, shortCode: genShortCode() },
          include: { items: true },
        });
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

export async function confirmOrder(publicToken: string, buyerContact: string, buyerUserId?: string) {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    include: { shop: true },
  });
  if (!order) throw new Error("Order not found");
  // เบอร์ต้องตรงกับที่ seller ใส่ไว้ตอนสร้าง หรือถ้า order ยังว่าง buyer
  // รายแรกเป็นคน claim (เก็บ buyerContact ตอน transition → CONFIRMED)
  if (order.buyerContact && order.buyerContact !== buyerContact) {
    throw new Error("Phone ไม่ตรงกับคำสั่งซื้อนี้");
  }
  // CONFIRMED รับจาก PENDING หรือ SHIPPED (VALID_TRANSITIONS ครอบคลุมทั้งสอง)
  assertTransition(order.status, "CONFIRMED");
  const updated = await prisma.order.update({
    where: { publicToken },
    data: { status: "CONFIRMED", buyerContact, buyerUserId },
  });
  // Post-confirm recalc เป็น best-effort — ถ้า dev pool timeout หรือ error
  // อื่นใน badges/trust-score ไม่ควร fail confirmation (ข้อมูลหลัก save
  // แล้ว). Log ให้เห็นชัดถ้าล้ม. Pattern เดียวกับ createReview
  // (ย้ายมาจาก completeOrder เดิม — terminal ใหม่คือ CONFIRMED ไม่ใช่ COMPLETED)
  try {
    await evaluateBadges(order.shop.userId);
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

/**
 * Lock screen check — ตรวจเบอร์ที่ buyer กรอกว่าตรงกับ order หรือไม่
 * ไม่เปลี่ยน state. ใช้ก่อนเข้าหน้า order detail
 *
 * Return true ถ้า:
 * - order.buyerContact ตรงกับ phone ที่กรอก (กรณี confirmed แล้ว หรือ seller pre-set)
 * - order.buyerContact ยังว่าง + order status = PENDING (first-time unlock; phone จะถูก claim ตอน confirm)
 */
export async function checkOrderPhone(publicToken: string, phone: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    select: { buyerContact: true, status: true },
  });
  if (!order) return false;
  if (order.buyerContact) return order.buyerContact === phone;
  // สถานะ PENDING = order ยังไม่มี buyer claim → อนุญาต phone unlock ครั้งแรก
  return order.status === "PENDING";
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

export async function cancelOrder(publicToken: string, initiator: "seller" | "buyer") {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order) throw new Error("Order not found");
  // reject cancel หลัง CONFIRMED (terminal สำเร็จ ยกเลิกไม่ได้)
  assertTransition(order.status, "CANCELLED");
  // Inventory Add-on hook — restock ตามประวัติจริงของ order (stockDeducted != null)
  // ไม่เช็คสถานะ entitlement ปัจจุบันเลย (BR-INV-12: order ที่ตัดสต็อกไปตอน entitlement ยัง
  // ACTIVE ต้องได้คืนสต็อกตอน cancel แม้ entitlement จะหลุด ACTIVE ไปแล้วก็ตาม)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { publicToken },
      data: { status: "CANCELLED", cancelInitiator: initiator },
    });
    await restockFromCancelledOrder(tx, order.id);
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
      buyer: { select: { id: true, displayName: true, username: true } },
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
      buyer: { select: { id: true, displayName: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * attachSlip — buyer แนบ fileId ของสลิปโอนเงินเข้า order
 *
 * ทำไม: แยกเป็น service เพื่อให้ route handler (S-4) เรียกได้โดยไม่ต้อง
 * duplicate contact-parity guard และ status guard
 * contact param เป็น optional เพราะ SMS-unlock path ทำ auth ระดับ route แล้ว
 * (route ส่ง contact เฉพาะเมื่อ buyer กรอกเบอร์เอง ไม่ใช่ SMS-unlock)
 */
export async function attachSlip(publicToken: string, fileId: string, contact?: string) {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order) throw new Error("Order not found");
  // contact parity — mirror confirmOrder lines ~107-111
  // ทำไม: กัน buyer คนอื่นแอบแนบสลิปทับ (ถ้า order ล็อกเบอร์ไว้แล้ว)
  if (order.buyerContact && contact && order.buyerContact !== contact) {
    throw new Error("เบอร์ไม่ตรงกับคำสั่งซื้อนี้");
  }
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
