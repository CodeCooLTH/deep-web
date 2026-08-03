/**
 * backfill-badges-trust.ts — ประเมิน badge + คำนวณ trust score ย้อนหลังให้ทุก user/shop
 *
 * ทำไมต้องมี: badge กับ trust score ถูกคำนวณ "ตอนมี event" (ยืนยันออเดอร์/รีวิว/ยืนยันตัวตน)
 * เท่านั้น. หลังเหตุการณ์ 2026-07-31 ที่ฐาน prod ถูกล้าง ตาราง Badge ว่างเปล่าอยู่ช่วงหนึ่ง
 * event ที่เกิดในช่วงนั้นจึงไม่มี badge ให้มอบ และ trustScore ค้างที่ 0
 * (ดู memory project_prod_db_wipe_20260731)
 *
 * ปลอดภัย: additive ล้วน — award badge ที่เข้าเกณฑ์ + เขียน trustScore ใหม่
 * ไม่มี deleteMany/DROP/TRUNCATE ใด ๆ (Hard Rule 13/14) และ idempotent รันซ้ำได้
 *
 * notify:false — badge ที่ backfill ไม่ควรยิง notification ย้อนหลังใส่ผู้ใช้รัวเป็นสิบใบ
 * (badge.service.ts รองรับ opts.notify มาตั้งแต่แรกสำหรับกรณี backfill/seed)
 *
 * รัน: DATABASE_URL=... DIRECT_URL=... npx tsx scripts/backfill-badges-trust.ts
 */
import { PrismaClient } from '@prisma/client'
import {
  evaluateBadges,
  evaluateSellerBadgesForShop,
  evaluateSignupYearBadge,
} from '../src/services/badge.service'
import {
  recalculateTrustScore,
  recalculateShopTrustScore,
} from '../src/services/trust-score.service'

const prisma = new PrismaClient()

async function main() {
  const before = {
    userBadges: await prisma.userBadge.count(),
    badges: await prisma.badge.count(),
  }
  console.log(`ก่อนเริ่ม: Badge ${before.badges} รายการ, UserBadge ${before.userBadges} ใบ`)
  if (before.badges === 0) {
    console.error('[หยุด] ตาราง Badge ว่าง — ต้องรัน seed:badges ก่อน ไม่งั้น backfill ไม่มีอะไรให้มอบ')
    process.exit(1)
  }

  const users = await prisma.user.findMany({ select: { id: true, username: true } })
  console.log(`\n── ผู้ใช้ ${users.length} คน ──`)
  for (const u of users) {
    try {
      await evaluateSignupYearBadge(u.id, { notify: false })
      // เรียกทั้ง 2 audience: SELLER→['SELLER','ANY'], BUYER→['BUYER','ANY']
      await evaluateBadges(u.id, 'SELLER', { notify: false })
      await evaluateBadges(u.id, 'BUYER', { notify: false })
      const score = await recalculateTrustScore(u.id)
      const owned = await prisma.userBadge.count({ where: { userId: u.id } })
      console.log(`  ${u.username}: trustScore=${score}, badge=${owned} ใบ`)
    } catch (e) {
      console.error(`  ✗ ${u.username}:`, e instanceof Error ? e.message : e)
    }
  }

  const shops = await prisma.shop.findMany({ select: { id: true, userId: true, kind: true, shopName: true } })
  console.log(`\n── ร้าน ${shops.length} ร้าน ──`)
  for (const s of shops) {
    try {
      // BUSINESS → award ผูก shopId ของตัวเอง; PERSONAL → evaluateBadges ครอบไปแล้วข้างบน
      if (s.kind === 'BUSINESS') {
        await evaluateSellerBadgesForShop({ id: s.id, userId: s.userId, kind: s.kind }, { notify: false })
      }
      const score = await recalculateShopTrustScore(s.id)
      console.log(`  ${s.shopName} (${s.kind}): trustScore=${score}`)
    } catch (e) {
      console.error(`  ✗ ${s.shopName}:`, e instanceof Error ? e.message : e)
    }
  }

  const after = await prisma.userBadge.count()
  console.log(`\nเสร็จ: UserBadge ${before.userBadges} → ${after} (มอบเพิ่ม ${after - before.userBadges} ใบ)`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
