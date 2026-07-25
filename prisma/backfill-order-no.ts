/**
 * Backfill Order.orderNo ให้ order เก่าที่ยัง null (รันครั้งเดียวหลัง migrate order_no).
 * รัน: dotenv -e .env.local -- npx tsx prisma/backfill-order-no.ts
 *
 * deterministic: orderNo = DP + ปีพ.ศ. + เดือน(เวลาไทย) + publicToken 8 หลัก — ไม่มี counter/race
 * ใช้ formatOrderNo ตัวเดียวกับ createOrder เพื่อให้ตรรกะ (โดยเฉพาะ timezone) ตรงกันเป๊ะ
 */
import { PrismaClient } from "@prisma/client";
import { formatOrderNo } from "../src/lib/order-no";

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.order.findMany({
    where: { orderNo: null },
    select: { id: true, publicToken: true, createdAt: true },
  });
  console.log(`[backfill] order ที่ต้องเติม orderNo: ${targets.length}`);

  let done = 0;
  for (const o of targets) {
    const orderNo = formatOrderNo(o.publicToken, o.createdAt);
    await prisma.order.update({ where: { id: o.id }, data: { orderNo } });
    done++;
  }
  console.log(`[backfill] เติมสำเร็จ ${done}/${targets.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
