/**
 * tests/setup.ts — Prisma client ของชุดเทส + กติกาความปลอดภัยของข้อมูล
 *
 * IMPORTANT: Hard Rule 13 (CLAUDE.md) — ห้ามมีคำสั่งลบข้อมูลแบบไม่ scope ในไฟล์เทส
 * เด็ดขาด ไม่มีข้อยกเว้น ไม่มี env flag ปลดล็อก
 *
 * ทำไมถึงเข้มขนาดนี้: dev DB = prod DB ตัวเดียวกัน (Supabase แชร์ — ดู CLAUDE.md
 * "Current State Snapshots" 2026-06-07) คำสั่งล้างตารางแบบไม่มีเงื่อนไขบน User/Shop/Order
 * คือคำสั่งลบข้อมูลลูกค้าจริงทั้งฐาน ที่รอแค่ให้ใครสัก connection ชี้ถูกที่
 *
 * ของเดิมกันด้วย denylist (เช็คว่า DATABASE_URL มีคำว่า "supabase") ซึ่งพลาดได้ถ้า
 * host เปลี่ยนหรือต่อผ่าน proxy — ตอนนี้เปลี่ยนเป็น allowlist และถอดคำสั่งล้างทั้งฐาน
 * ออกจริง ไม่ใช่แค่กันตอนรัน
 */
import { PrismaClient } from "@prisma/client";

const dbUrl = process.env.DATABASE_URL ?? "";

// Allowlist (fail-closed) — ผ่านเฉพาะ Postgres บนเครื่องตัวเอง
// ไม่ใช่ denylist: อะไรที่ไม่ได้ระบุว่าปลอดภัย ถือว่าอันตรายไว้ก่อน
const isLocalDb =
  /^postgres(ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(
    dbUrl,
  );

if (dbUrl && !isLocalDb) {
  throw new Error(
    "[tests/setup] DATABASE_URL ไม่ได้ชี้ไปที่ Postgres บนเครื่องตัวเอง — ชุดเทสนี้ห้ามรันบน DB ที่แชร์กับ prod\n" +
      "รันด้วย local Docker Postgres เท่านั้น: npx dotenv -e .env -- npx vitest\n" +
      "ดู CLAUDE.md Hard Rule 13 + docs/conventions/test-db-safety.md",
  );
}

export const prisma = new PrismaClient();

/**
 * ล้างข้อมูลที่เทส "สร้างเอง" เท่านั้น — scope ด้วย id ที่ส่งเข้ามาเสมอ
 *
 * IMPORTANT: ห้ามเพิ่ม branch ที่ล้างแบบไม่มีเงื่อนไขเข้ามาในฟังก์ชันนี้ (Hard Rule 13)
 * hook `.claude/hooks/test-db-guard.sh` block ตอนเขียนอยู่แล้ว แต่กติกาสำคัญกว่าเครื่องมือ
 *
 * ลบตามลำดับ dependency เพื่อไม่ให้ชน FK — ลูกก่อนแม่เสมอ
 */
export async function deleteTestData(scope: {
  userIds?: string[];
  shopIds?: string[];
}): Promise<void> {
  const userIds = scope.userIds ?? [];
  const shopIds = scope.shopIds ?? [];
  if (userIds.length === 0 && shopIds.length === 0) return;

  if (shopIds.length > 0) {
    const orderIds = (
      await prisma.order.findMany({
        where: { shopId: { in: shopIds } },
        select: { id: true },
      })
    ).map((o) => o.id);

    if (orderIds.length > 0) {
      await prisma.review.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.shipmentTracking.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
  }

  if (userIds.length > 0) {
    await prisma.trustScoreHistory.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userBadge.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.verificationRecord.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.authAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

/**
 * @deprecated เดิมล้างทั้งฐานแบบไม่มีเงื่อนไข — ถูกถอดออกตาม Hard Rule 13
 *
 * ไฟล์เทสที่ยังเรียกอยู่จะ fail ทันทีพร้อมข้อความนี้ **โดยตั้งใจ** — ดังกว่าการปล่อย
 * ให้ผ่านเงียบ ๆ แล้วเสี่ยงลบข้อมูลจริง ต้องแก้ให้เก็บ id ที่ตัวเองสร้างแล้วเรียก
 * deleteTestData({ userIds, shopIds }) แทน
 */
export async function cleanDatabase(): Promise<never> {
  throw new Error(
    "[tests/setup] cleanDatabase() ถูกถอดออกแล้ว — ล้างทั้งฐานแบบไม่ scope ผิด Hard Rule 13\n" +
      "แก้เป็น: เก็บ id ที่เทสสร้าง แล้วเรียก deleteTestData({ userIds, shopIds })\n" +
      "ดู CLAUDE.md Hard Rule 13 + docs/conventions/test-db-safety.md",
  );
}
