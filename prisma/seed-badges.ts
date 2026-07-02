/**
 * seed-badges.ts — badge-only reseed (idempotent, ไม่ destructive)
 *
 * ทำไมแยกจาก seed.ts: main() ของ seed.ts seed admin/test-user/mock order ต่อจาก badge
 * → รันทั้งก้อนใส่ shared Supabase (dev=prod) = pollute prod. สคริปต์นี้รันเฉพาะ
 * badge upsert (keyed by nameEN — idempotent, ไม่ลบ/ไม่แตะ UserBadge ที่ user ได้ไปแล้ว)
 * ใช้เมื่อเพิ่ม badge row ใหม่ใน badge-seed-data.ts แล้วต้อง apply เข้า DB
 *
 * รัน: dotenv -e .env.local -- npx tsx prisma/seed-badges.ts   (Supabase dev/prod)
 * (ต้องขอ user ยืนยันก่อนรันกับ .env.local — touch prod DB; ดู memory prisma_migration_env_targets)
 */
import { PrismaClient } from "@prisma/client";
import { defaultBadges } from "./badge-seed-data";

const prisma = new PrismaClient();

async function main() {
  let created = 0;
  let updated = 0;
  for (const badge of defaultBadges) {
    const existing = await prisma.badge.findUnique({ where: { nameEN: badge.nameEN } });
    await prisma.badge.upsert({
      where: { nameEN: badge.nameEN },
      update: {
        name: badge.name,
        icon: badge.icon,
        type: badge.type,
        audience: badge.audience,
        criteria: badge.criteria,
        imageUrl: badge.imageUrl ?? null,
      },
      create: {
        name: badge.name,
        nameEN: badge.nameEN,
        icon: badge.icon,
        type: badge.type,
        audience: badge.audience,
        criteria: badge.criteria,
        imageUrl: badge.imageUrl ?? null,
      },
    });
    if (existing) updated++;
    else {
      created++;
      console.log(`  + created: ${badge.nameEN} (${badge.name})`);
    }
  }
  console.log(`Badge reseed สำเร็จ — total ${defaultBadges.length} (created ${created}, updated ${updated})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
