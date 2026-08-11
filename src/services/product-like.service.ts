import { prisma } from "@/lib/prisma";

/**
 * ถูกใจสินค้าบนหน้าร้านสาธารณะ
 * CR: docs/20 - Features/00035 - Shop Page Builder/EXTENSIONS-2026-08-11-product-likes.md
 *
 * 🛑 นี่คือ **SSOT เดียวของการเขียน `Product.likeCount`** — ห้ามมีที่อื่น update คอลัมน์นี้
 * เพราะตัวนับกับจำนวนแถวใน `ProductLike` ต้องตรงกันเสมอ (BR-LIKE-04) ถ้าเพี้ยนแล้วจะเพี้ยน
 * ถาวรโดยไม่มีอะไรฟ้อง — ไม่มี query ไหนในระบบเทียบสองค่านี้ให้
 */

export type ToggleLikeResult = { liked: boolean; likeCount: number };

/**
 * กดถูกใจ / ยกเลิก — สลับสถานะตาม `deviceKey` (BR-LIKE-02)
 *
 * คืน `null` เมื่อสินค้าไม่มีอยู่หรือปิดขาย (BR-LIKE-05) ให้ route แปลงเป็น 404
 *
 * 🛑 ทั้งสองทางเขียนในทรานแซกชันเดียว — แถวใน `ProductLike` กับตัวนับบน `Product` ต้องขยับ
 * พร้อมกันหรือไม่ขยับเลย
 *
 * 🛑 ตอนกดถูกใจใช้ `create` แล้วดัก P2002 ไม่ใช่ "เช็คก่อนแล้วค่อยเขียน" — ระหว่าง SELECT กับ
 * INSERT ยังมีช่องให้กดรัวจากอุปกรณ์เดียวกันแทรกได้ ความถูกต้องต้องอยู่ที่ `@@unique` เสมอ
 * (docs/conventions/insert-then-catch-logs-every-error.md — แพตเทิร์นนี้ทำให้ Postgres เขียน
 *  ERROR ลง log ทุกครั้งที่ชน แต่ที่นี่การชนคือเคสหายาก ไม่ใช่ทางปกติ จึงไม่เป็นต้นทุนที่ต้องกังวล)
 */
export async function toggleProductLike(
  productId: string,
  deviceKey: string,
): Promise<ToggleLikeResult | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
    select: { id: true },
  });
  if (!product) return null;

  const existing = await prisma.productLike.findUnique({
    where: { productId_deviceKey: { productId, deviceKey } },
    select: { id: true },
  });

  if (existing) {
    const [, updated] = await prisma.$transaction([
      prisma.productLike.delete({ where: { id: existing.id } }),
      prisma.product.update({
        where: { id: productId },
        // 🛑 กันติดลบที่ตัวเลขที่จะเขียน ไม่ใช่พึ่งว่า "แถวมีอยู่จริงเลยลดได้" — ถ้าตัวนับเคยเพี้ยน
        // มาก่อน (เช่นมีคน seed ข้อมูลมือ) การลดแบบ decrement จะพาไปติดลบแล้วหน้าจอโชว์ -1
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      }),
    ]);
    const safe = Math.max(0, updated.likeCount);
    if (safe !== updated.likeCount) {
      await prisma.product.update({ where: { id: productId }, data: { likeCount: safe } });
    }
    return { liked: false, likeCount: safe };
  }

  try {
    const [, updated] = await prisma.$transaction([
      prisma.productLike.create({ data: { productId, deviceKey } }),
      prisma.product.update({
        where: { id: productId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      }),
    ]);
    return { liked: true, likeCount: updated.likeCount };
  } catch {
    // ชน unique = อุปกรณ์นี้กดไปแล้วระหว่างที่คำขอนี้กำลังทำงาน — สถานะสุดท้ายคือ "ถูกใจแล้ว"
    // อ่านยอดล่าสุดกลับไปแทนการโยน error ให้ผู้ใช้เห็น (เขากดสำเร็จจริง แค่ซ้ำ)
    const current = await prisma.product.findUnique({
      where: { id: productId },
      select: { likeCount: true },
    });
    return { liked: true, likeCount: current?.likeCount ?? 0 };
  }
}

/**
 * สินค้าที่อุปกรณ์นี้เคยกดถูกใจไว้ — ใช้ตอนเรนเดอร์หน้าเพื่อให้หัวใจขึ้นทึบตั้งแต่แรก
 *
 * รับ productIds มาเป็นชุดเดียว (ไม่ใช่ถามทีละใบ) เพราะหน้าหนึ่งมีการ์ดได้ 12+ ใบ
 */
export async function getLikedProductIds(
  productIds: string[],
  deviceKey: string | null,
): Promise<Set<string>> {
  if (!deviceKey || productIds.length === 0) return new Set();
  const rows = await prisma.productLike.findMany({
    where: { productId: { in: productIds }, deviceKey },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}
