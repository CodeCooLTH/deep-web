/**
 * seed-badges.ts — badge-only reseed (idempotent, ไม่ destructive)
 *
 * ทำไมแยกจาก seed.ts: main() ของ seed.ts seed admin/test-user/mock order ต่อจาก badge
 * → รันทั้งก้อนใส่ฐานจริง = pollute ข้อมูล. สคริปต์นี้รันเฉพาะ badge upsert
 * (keyed by nameEN — idempotent, ไม่ลบ/ไม่แตะ UserBadge ที่ user ได้ไปแล้ว)
 *
 * 🛑 **สคริปต์นี้ไปไม่ถึง prod และไม่เคยไปถึงอีกแล้ว** (ตรวจ 2026-08-21)
 * `package.json` ผูกมันกับ `.env.local` ซึ่งชี้ `localhost:5434` ตั้งแต่แยกฐาน dev/prod (2026-08)
 * ⇒ มันจะรายงาน `created`/`updated` สำเร็จอย่างสวยงาม **โดยทำกับฐาน dev เท่านั้น**
 * ถ้าใครใช้มันเพื่อ "นำเหรียญขึ้น prod" จะไม่มีอะไรเกิดขึ้นเลยและไม่มี error ให้ใครเห็น
 * (เหตุการณ์เดียวกับเหรียญประมูล 6 ใบที่เคยอยู่แต่ในโค้ด)
 *
 * **เหรียญใบใหม่ขึ้น prod ได้ทางเดียวคือ SQL ใน migration** — `prisma migrate deploy` ที่
 * `vercel.json` รันตอน build จะพามันขึ้นเองพร้อม deploy ไม่มีทางลืม
 * ดู `docs/20 - Features/00052 - Badge & Achievement v2/DATABASE.md` §5.5
 *
 * รัน (ฐาน local เท่านั้น): npm run seed:badges
 */
import { PrismaClient } from "@prisma/client";

import { BADGE_FAMILY_REGISTRY, resolveBadgeFamily } from "../src/lib/badge-family";
import { defaultBadges } from "./badge-seed-data";

const prisma = new PrismaClient();

/**
 * derive คุณสมบัติตระกูลของเหรียญจาก `src/lib/badge-family.ts` ซึ่งเป็น SSOT
 *
 * 🛑 **ห้ามก็อปค่าเหล่านี้ลงไป `badge-seed-data.ts`** — นั่นคือการสร้างสำเนาที่สองของ allow-list
 * ที่หลุดจากต้นฉบับได้โดยไม่มีอะไรฟ้อง (Hard Rule 16) · ไฟล์ seed ถือเฉพาะสิ่งที่เป็นของเหรียญ
 * ใบนั้นจริง ๆ (ชื่อ · ไอคอน · เกณฑ์ · อาร์ตเวิร์ก) ส่วน "มันอยู่ตระกูลไหน ขั้นเท่าไร" เป็นของ registry
 */
function taxonomyOf(nameEN: string) {
  const mapped = resolveBadgeFamily(nameEN);
  if (!mapped) {
    // เหรียญที่ไม่มีในทะเบียน = แคตตาล็อกกับ registry หลุดจากกัน ⇒ หยุด ไม่ใช่ seed ค่าเดา
    // (เทส [blocker] `badge-family.test.ts` จับได้ก่อนถึงตรงนี้อยู่แล้ว — นี่คือด่านที่สอง)
    throw new Error(
      `[seed-badges] เหรียญ "${nameEN}" ไม่มีในทะเบียนตระกูล (src/lib/badge-family.ts) — ` +
        `เพิ่มเหรียญใหม่ต้องประกาศตระกูลและขั้นก่อนเสมอ`,
    );
  }
  const def = BADGE_FAMILY_REGISTRY[mapped.family];
  const surface = def.surfaceByTier[mapped.tier];
  if (!surface) {
    throw new Error(
      `[seed-badges] เหรียญ "${nameEN}" อ้างขั้น ${mapped.tier} ของตระกูล ${mapped.family} ` +
        `ซึ่งตระกูลนั้นไม่ได้ประกาศไว้`,
    );
  }
  return {
    family: mapped.family,
    tier: mapped.tier,
    surface,
    ownerScope: def.ownerScope,
    verticals: def.verticals,
  };
}

async function main() {
  let created = 0;
  let updated = 0;
  for (const badge of defaultBadges) {
    const taxonomy = taxonomyOf(badge.nameEN);
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
        ...taxonomy,
      },
      create: {
        name: badge.name,
        nameEN: badge.nameEN,
        icon: badge.icon,
        type: badge.type,
        audience: badge.audience,
        criteria: badge.criteria,
        imageUrl: badge.imageUrl ?? null,
        ...taxonomy,
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
