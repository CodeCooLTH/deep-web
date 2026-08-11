#!/usr/bin/env tsx
/**
 * recalc-business-trust-score — คำนวณ trust score ของร้าน BUSINESS ใหม่ทุกร้าน
 *
 * ทำไมต้องมี: `413cafb3` แก้ให้ระดับยืนยันของร้าน BUSINESS นับ L1 ของเจ้าของร้านด้วย
 * (ก่อนหน้านั้นกรอง `shopId` ล้วน จึงไม่เคยเห็นแถว L1 ที่เขียน `shopId=null` เสมอ)
 * ⇒ ทุกร้าน BUSINESS เสียคะแนนส่วน verification 10 คะแนนมาตลอด
 *
 * แต่ `recalculateShopTrustScore` ทำงานเฉพาะตอนมี trigger (ออเดอร์/รีวิว/เหรียญ) คะแนนที่เก็บไว้
 * จึงไม่ขยับเองจนกว่าจะมีออเดอร์ใบถัดไป — สคริปต์นี้คือตัวไล่เก็บให้ครบในรอบเดียว
 *
 * 🛑 ปลอดภัยเพราะ `recalculateShopTrustScore` เป็น **monotonic** — เขียนด้วย
 *    `Math.max(shop.trustScore, computed)` เสมอ คะแนนจึงมีแต่เท่าเดิมหรือขึ้น ไม่มีทางลด
 *    (ถ้าวันหนึ่งมีคนถอด monotonic ออก สคริปต์นี้จะกลายเป็นตัวลดคะแนนร้านทั้งระบบทันที)
 *
 * 🛑 ต้องปักหมุด URL ในคำสั่งตรง ๆ ห้ามพึ่ง `.env.local` (Hard Rule 14) — ตัวสคริปต์ไม่โหลด
 *    dotenv เอง อ่านจาก env ที่ผู้เรียกส่งมาเท่านั้น เพื่อให้ "ชี้ฐานไหน" อ่านออกจากบรรทัดคำสั่ง
 *
 *   DATABASE_URL="postgresql://..." DIRECT_URL="postgresql://..." npx tsx scripts/recalc-business-trust-score.ts
 *
 * ใส่ `--dry-run` เพื่อดูว่าจะเปลี่ยนอะไรบ้างโดยไม่เขียน
 */
import { PrismaClient } from "@prisma/client";
import { recalculateShopTrustScore } from "../src/services/trust-score.service";

const DRY = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ต้องส่ง DATABASE_URL มาในคำสั่ง (ห้ามพึ่ง .env.local — Hard Rule 14)");
    process.exit(1);
  }
  // แสดงปลายทางให้เห็นก่อนทำอะไร (ซ่อนรหัสผ่าน) — ตัวยืนยันด้วยตาว่ากำลังยิงฐานไหน
  console.log("ปลายทาง:", process.env.DATABASE_URL.replace(/:[^:@]*@/, ":***@").slice(0, 70));
  console.log(DRY ? "โหมด: dry-run (ไม่เขียน)" : "โหมด: เขียนจริง");

  const prisma = new PrismaClient();
  try {
    const shops = await prisma.shop.findMany({
      where: { kind: "BUSINESS", deletedAt: null },
      select: { id: true, shopName: true, trustScore: true },
      orderBy: { shopName: "asc" },
    });
    console.log(`\nร้าน BUSINESS ที่ยังใช้งานอยู่ ${shops.length} ร้าน\n`);

    for (const s of shops) {
      if (DRY) {
        console.log(`  · ${s.shopName} — ปัจจุบัน ${s.trustScore} (dry-run ไม่คำนวณ)`);
        continue;
      }
      const after = await recalculateShopTrustScore(s.id);
      const delta = after - s.trustScore;
      console.log(
        `  ${delta > 0 ? "↑" : "="} ${s.shopName} — ${s.trustScore} → ${after}` +
          (delta > 0 ? `  (+${delta})` : "  (เท่าเดิม)"),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
