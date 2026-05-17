import { prisma } from "@/lib/prisma";
import { evaluateBadges } from "@/services/badge.service";

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

export async function createOrder(shopId: string, data: {
  items: { productId?: string; name: string; description?: string; qty: number; price: number }[];
  type: string;
}) {
  const totalAmount = data.items.reduce((sum, item) => sum + item.qty * item.price, 0);

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

  return prisma.order.create({
    data: {
      shopId,
      type: data.type,
      totalAmount,
      fulfillmentMode,
      items: { create: data.items },
    },
    include: { items: true },
  });
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
  return prisma.order.update({
    where: { publicToken },
    data: { status: "CANCELLED", cancelInitiator: initiator },
  });
}

export async function getOrderByToken(publicToken: string) {
  return prisma.order.findUnique({
    where: { publicToken },
    include: {
      items: true,
      shop: { include: { user: { select: { id: true, displayName: true, username: true, trustScore: true, userBadges: { include: { badge: true } } } } } },
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
      items: true,
      shop: { include: { user: { select: { id: true, displayName: true, username: true, trustScore: true, userBadges: { include: { badge: true } } } } } },
      // buyer: registered user ที่ยืนยัน order — ใช้แสดง displayName ใน seller order detail
      // additive include — ไม่ break caller เดิม
      buyer: { select: { id: true, displayName: true, username: true } },
      shipmentTracking: true,
      review: true,
    },
  });
}

export async function getOrdersByShop(shopId: string, status?: string) {
  return prisma.order.findMany({
    where: { shopId, ...(status ? { status } : {}) },
    include: {
      items: true,
      shipmentTracking: true,
      review: true,
      // buyer: registered user ที่ยืนยัน order — ใช้แสดงชื่อลูกค้าใน seller order list
      // คัดลอก select เดียวกับ getOrderForShop (additive — ไม่ break caller เดิม)
      buyer: { select: { id: true, displayName: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });
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
