/**
 * Backfill Order.shortCode ให้ order เก่าที่ยัง null (รันครั้งเดียวหลัง migrate Task 1).
 * รัน: npx tsx prisma/backfill-order-shortcode.ts -e .env.local
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { genShortCode } from "../src/services/order.service";

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.order.findMany({
    where: { shortCode: null },
    select: { id: true },
  });
  console.log(`[backfill] order ที่ต้องเติม shortCode: ${targets.length}`);

  let done = 0;
  for (const { id } of targets) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await prisma.order.update({ where: { id }, data: { shortCode: genShortCode() } });
        done++;
        break;
      } catch (e) {
        const isUnique =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
        if (isUnique && attempt < 4) continue;
        throw e;
      }
    }
  }
  console.log(`[backfill] เติมสำเร็จ ${done}/${targets.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
