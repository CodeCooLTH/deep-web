// One-off backfill — รัน evaluateBadges + evaluateSignupYearBadge ให้ user ที่มีอยู่
// เหตุ: evaluateBadges รันเฉพาะตอน trigger (order confirm/review/verify/signup).
// user/shop ที่ seed มาก่อนมี badge หรือก่อนเพิ่ม P1 → ยังไม่ถูก evaluate.
// idempotent: awardBadge = upsert UserBadge (sticky) — รันซ้ำปลอดภัย.
// รัน: npx dotenv -e .env.local -- npx tsx scripts/backfill-badges.ts
import { PrismaClient } from "@prisma/client";
import { evaluateBadges, evaluateSignupYearBadge } from "@/services/badge.service";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, username: true, isShop: true } });
  console.log(`backfill: ${users.length} users`);
  for (const u of users) {
    // SIGNUP_YEAR (audience ANY) — ทุก user
    await evaluateSignupYearBadge(u.id).catch((e) => console.error(`  signupYear ${u.username}:`, e.message));
    // achievement/verification (seller scope) — เฉพาะ user ที่เป็นร้าน
    if (u.isShop) {
      await evaluateBadges(u.id, "SELLER").catch((e) => console.error(`  evalBadges ${u.username}:`, e.message));
    }
    const cnt = await prisma.userBadge.count({ where: { userId: u.id } });
    console.log(`  ${u.username} (shop=${u.isShop}) → ${cnt} badges`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
