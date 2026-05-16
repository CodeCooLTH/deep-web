import { prisma } from "@/lib/prisma";
import { evaluateBadges } from "@/services/badge.service";

export const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "COMPLETED", "CANCELLED"],
  SHIPPED: ["COMPLETED"],
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
  return prisma.order.create({
    data: {
      shopId,
      type: data.type,
      totalAmount,
      items: { create: data.items },
    },
    include: { items: true },
  });
}

export async function confirmOrder(publicToken: string, buyerContact: string, buyerUserId?: string) {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order) throw new Error("Order not found");
  // เบอร์ต้องตรงกับที่ seller ใส่ไว้ตอนสร้าง หรือถ้า order ยังว่าง buyer
  // รายแรกเป็นคน claim (เก็บ buyerContact ตอน transition CREATED → CONFIRMED)
  if (order.buyerContact && order.buyerContact !== buyerContact) {
    throw new Error("Phone ไม่ตรงกับคำสั่งซื้อนี้");
  }
  assertTransition(order.status, "CONFIRMED");
  return prisma.order.update({
    where: { publicToken },
    data: { status: "CONFIRMED", buyerContact, buyerUserId },
  });
}

/**
 * Lock screen check — ตรวจเบอร์ที่ buyer กรอกว่าตรงกับ order หรือไม่
 * ไม่เปลี่ยน state. ใช้ก่อนเข้าหน้า order detail
 *
 * Return true ถ้า:
 * - order.buyerContact ตรงกับ phone ที่กรอก (กรณี confirmed แล้ว หรือ seller pre-set)
 * - order.buyerContact ยังว่าง + order status = CREATED (first-time unlock; phone จะถูก claim ตอน confirm)
 */
export async function checkOrderPhone(publicToken: string, phone: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    select: { buyerContact: true, status: true },
  });
  if (!order) return false;
  if (order.buyerContact) return order.buyerContact === phone;
  return order.status === "CREATED";
}

export async function shipOrder(publicToken: string, data: { provider: string; trackingNo: string }) {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order) throw new Error("Order not found");
  // Type guard — เฉพาะ PHYSICAL ที่มี SHIPPED state (PRD section 4 state machine)
  // UI gate ที่ OrderActions.tsx ป้องกันไว้แต่ต้องกัน bypass ผ่าน API direct ด้วย
  // TODO(P3): เปลี่ยนจาก order.type → order.fulfillmentMode เพื่อรองรับ
  //   sub-box (SUBSCRIPTION + SHIPPED override). ดู spec
  //   docs/superpowers/specs/2026-05-10-product-types-capability-design.md section 5
  if (order.type !== "PHYSICAL") {
    throw new Error(`Only PHYSICAL orders can be shipped (this order is ${order.type})`);
  }
  assertTransition(order.status, "SHIPPED");
  return prisma.$transaction(async (tx) => {
    await tx.shipmentTracking.create({
      data: { orderId: order.id, provider: data.provider, trackingNo: data.trackingNo },
    });
    return tx.order.update({ where: { publicToken }, data: { status: "SHIPPED" } });
  });
}

export async function completeOrder(publicToken: string) {
  const order = await prisma.order.findUnique({ where: { publicToken }, include: { shop: true } });
  if (!order) throw new Error("Order not found");
  assertTransition(order.status, "COMPLETED");
  const updated = await prisma.order.update({ where: { publicToken }, data: { status: "COMPLETED" } });
  // Post-operation recalc เป็น best-effort — ถ้า dev pool timeout หรือ error
  // อื่นใน badges/trust-score ไม่ควร fail order completion (ข้อมูลหลัก save
  // แล้ว). Log ให้เห็นชัดถ้าล้ม. Pattern เดียวกับ createReview
  try {
    await evaluateBadges(order.shop.userId);
  } catch (err) {
    console.error(
      `[order] post-complete recalc ล้มเหลวสำหรับ shop owner ${order.shop.userId}; order ${updated.publicToken} persisted but trust/badges อาจไม่ update`,
      err,
    );
  }
  return updated;
}

export async function cancelOrder(publicToken: string) {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order) throw new Error("Order not found");
  assertTransition(order.status, "CANCELLED");
  return prisma.order.update({ where: { publicToken }, data: { status: "CANCELLED" } });
}

export async function getOrderByToken(publicToken: string) {
  return prisma.order.findUnique({
    where: { publicToken },
    include: {
      items: true,
      shop: { include: { user: { select: { id: true, displayName: true, username: true, trustScore: true, userBadges: { include: { badge: true } } } } } },
      shipmentTracking: true,
      review: true,
    },
  });
}

export async function getOrdersByShop(shopId: string, status?: string) {
  return prisma.order.findMany({
    where: { shopId, ...(status ? { status } : {}) },
    include: { items: true, shipmentTracking: true, review: true },
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
