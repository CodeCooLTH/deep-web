import { prisma } from "@/lib/prisma";
import type { Prisma, Product } from "@prisma/client";
import { deductCredit } from "@/services/wallet.service";
import { WALLET_REASON } from "@/lib/inventory-addon";
import { PIN_SLOT_PRICE } from "@/lib/pin-products";

// Pin Products (feature 00013) — pin/unpin/buy business logic
// SSOT: docs/20 - Features/00013 - Pin Products/{SRS,SDS,API}.md

export class PinProductNotFoundError extends Error {
  constructor() {
    super("PRODUCT_NOT_FOUND");
    this.name = "PinProductNotFoundError";
  }
}

export class PinProductInactiveError extends Error {
  constructor() {
    super("PRODUCT_NOT_ACTIVE");
    this.name = "PinProductInactiveError";
  }
}

export class NoPinSlotError extends Error {
  constructor() {
    super("NO_PIN_SLOT");
    this.name = "NoPinSlotError";
  }
}

export interface PinState {
  pinSlots: number;
  pinnedCount: number;
}

export interface PinResult {
  product: Product;
  pinState: PinState;
}

/** countPinned — helper: จำนวนสินค้าที่ปักหมุดอยู่ของร้าน (ไม่กรอง isActive — ณ จุดที่เรียกใน
 *  service นี้ auto-unpin ที่ product.service รับประกันว่า inactive จะไม่มี pinnedAt ค้าง) */
async function countPinned(client: Prisma.TransactionClient, shopId: string): Promise<number> {
  return client.product.count({ where: { shopId, pinnedAt: { not: null } } });
}

/**
 * pinProduct — ปักหมุดสินค้า (ต้องมี slot ว่าง)
 * TD-001: row-lock Shop (SELECT ... FOR UPDATE) บรรทัดแรกสุดใน $transaction ก่อนนับ pinnedCount
 * เทียบ pinSlots — cap เป็น cross-row aggregate ข้าม Product หลายแถว ใช้ conditional-updateMany
 * แบบ wallet ไม่ได้ (write-skew ภายใต้ READ COMMITTED)
 *
 * @throws PinProductNotFoundError - ไม่พบสินค้า/ไม่ใช่ของร้านนี้
 * @throws PinProductInactiveError - สินค้า isActive=false
 * @throws NoPinSlotError - pinnedCount >= pinSlots (client ควรเปิด dialog ซื้อ slot แทน)
 */
export async function pinProduct(shopId: string, productId: string): Promise<PinResult> {
  return prisma.$transaction(async (tx) => {
    // TD-001 row-lock — mutex ต่อร้าน serialize pin/unpin/buy concurrent ทั้งหมด
    await tx.$queryRaw`SELECT id FROM "Shop" WHERE id = ${shopId} FOR UPDATE`;

    const product = await tx.product.findFirst({ where: { id: productId, shopId } });
    if (!product) throw new PinProductNotFoundError();
    if (!product.isActive) throw new PinProductInactiveError();

    const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { pinSlots: true } });

    // idempotent — ปักหมุดอยู่แล้ว คืนค่าเดิม ไม่นับซ้ำ/ไม่ error
    if (product.pinnedAt) {
      const pinnedCount = await countPinned(tx, shopId);
      return { product, pinState: { pinSlots: shop.pinSlots, pinnedCount } };
    }

    const pinnedCount = await countPinned(tx, shopId);
    if (pinnedCount >= shop.pinSlots) throw new NoPinSlotError();

    // conditional updateMany (แทน update ตรง ๆ) — กัน TOCTOU: findFirst ข้างบนไม่ได้ row-lock
    // Product (row-lock อยู่ที่ Shop เท่านั้น) ถ้าสินค้าถูก deactivate/ลบระหว่างนี้ (concurrent
    // request คนละ transaction) ต้อง fail แทนที่จะปักหมุด/สินค้า inactive ค้าง pinnedAt
    const result = await tx.product.updateMany({
      where: { id: productId, shopId, isActive: true },
      data: { pinnedAt: new Date() },
    });
    if (result.count === 0) throw new PinProductInactiveError();
    const updated = await tx.product.findUniqueOrThrow({ where: { id: productId } });

    return { product: updated, pinState: { pinSlots: shop.pinSlots, pinnedCount: pinnedCount + 1 } };
  });
}

/**
 * unpinProduct — ยกเลิกปักหมุด ฟรีเสมอ ไม่มีเงื่อนไข slot, idempotent
 * @throws PinProductNotFoundError - ไม่พบสินค้า/ไม่ใช่ของร้านนี้
 */
export async function unpinProduct(shopId: string, productId: string): Promise<PinResult> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, shopId } });
    if (!product) throw new PinProductNotFoundError();

    const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { pinSlots: true } });

    if (!product.pinnedAt) {
      // idempotent — ไม่ได้ปักหมุดอยู่แล้ว คืนค่าปัจจุบัน
      const pinnedCount = await countPinned(tx, shopId);
      return { product, pinState: { pinSlots: shop.pinSlots, pinnedCount } };
    }

    const updated = await tx.product.update({
      where: { id: productId },
      data: { pinnedAt: null },
    });
    const pinnedCount = await countPinned(tx, shopId);

    return { product: updated, pinState: { pinSlots: shop.pinSlots, pinnedCount } };
  });
}

/**
 * buyPinSlotAndPin — ซื้อ slot ฿99 (หัก SellerWallet) และปักหมุด productId ในธุรกรรมเดียว (atomic)
 * ทุก step commit/rollback พร้อมกัน — เครดิตไม่พอ = rollback ทั้งหมด ไม่หัก/ไม่เพิ่ม slot/ไม่ปักหมุด
 *
 * @throws PinProductNotFoundError - ไม่พบสินค้า/ไม่ใช่ของร้านนี้
 * @throws PinProductInactiveError - สินค้า isActive=false
 * @throws Error("INSUFFICIENT_CREDIT") - balance < 99 (จาก wallet.service::deductCredit)
 */
export async function buyPinSlotAndPin(shopId: string, productId: string): Promise<PinResult> {
  return prisma.$transaction(async (tx) => {
    // TD-001 row-lock — บรรทัดแรกสุด กัน race กับ pin/unpin/buy พร้อมกันของร้านเดียวกัน
    await tx.$queryRaw`SELECT id FROM "Shop" WHERE id = ${shopId} FOR UPDATE`;

    const product = await tx.product.findFirst({ where: { id: productId, shopId } });
    if (!product) throw new PinProductNotFoundError();
    if (!product.isActive) throw new PinProductInactiveError();

    // idempotent ต่อ double-charge — productId ปักหมุดอยู่แล้ว (UI ล้าหลัง) → คืน state ไม่หักซ้ำ
    if (product.pinnedAt) {
      const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { pinSlots: true } });
      const pinnedCount = await countPinned(tx, shopId);
      return { product, pinState: { pinSlots: shop.pinSlots, pinnedCount } };
    }

    // deductCredit throw "INSUFFICIENT_CREDIT" ถ้า balance < 99 → rollback ทั้ง tx (ไม่มี partial state)
    await deductCredit(
      shopId,
      PIN_SLOT_PRICE,
      productId,
      "ซื้อสล็อตปักหมุดสินค้า",
      WALLET_REASON.PIN_SLOT,
      tx,
    );

    const updatedShop = await tx.shop.update({
      where: { id: shopId },
      data: { pinSlots: { increment: 1 } },
      select: { pinSlots: true },
    });
    // conditional updateMany — กัน TOCTOU เดียวกับ pinProduct: สินค้าถูก deactivate/ลบระหว่าง
    // deductCredit/shop.update กำลังรัน (Product ไม่ถูก row-lock, row-lock อยู่ที่ Shop เท่านั้น)
    // count===0 → throw → rollback ทั้ง tx (คืนเงิน + ไม่เพิ่ม slot ค้าง — กัน "เสียเงินฟรี")
    const result = await tx.product.updateMany({
      where: { id: productId, shopId, isActive: true },
      data: { pinnedAt: new Date() },
    });
    if (result.count === 0) throw new PinProductInactiveError();
    const updatedProduct = await tx.product.findUniqueOrThrow({ where: { id: productId } });
    const pinnedCount = await countPinned(tx, shopId);

    return { product: updatedProduct, pinState: { pinSlots: updatedShop.pinSlots, pinnedCount } };
  });
}

/**
 * getPinnedProducts — สินค้าที่ปักหมุดของร้าน เรียง pinnedAt desc (FR-PIN-06)
 * ไม่มี take — โซนปักหมุดแสดงทุกชิ้นที่ปักหมุด (bound โดย pinSlots อยู่แล้ว)
 */
export async function getPinnedProducts(shopId: string) {
  return prisma.product.findMany({
    where: { shopId, isActive: true, pinnedAt: { not: null } },
    orderBy: { pinnedAt: "desc" },
    include: { tags: true },
  });
}

/** getPinState — {pinSlots, pinnedCount} ปัจจุบันของร้าน (สำหรับ render ปุ่ม/indicator ฝั่ง UI) */
export async function getPinState(shopId: string): Promise<PinState> {
  const [shop, pinnedCount] = await Promise.all([
    prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { pinSlots: true } }),
    prisma.product.count({ where: { shopId, pinnedAt: { not: null } } }),
  ]);
  return { pinSlots: shop.pinSlots, pinnedCount };
}
