import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { intakePeriodKey, nextIntakePeriodKey } from '@/lib/inspection/plan-lifecycle'
import type { InspectionStep } from '@/lib/inspection/checks'
import { renewOrLapseInspectionPlan, seedIntakeQuota } from '@/services/inspection-plan.service'
import { runAutomaticStep1Checks } from '@/services/inspection-auto-check.service'
import { countOverdueRounds, createDueRoundsForShop } from '@/services/inspection-round.service'

// งานที่ 3 มีต้นทุนโตตามจำนวนร้านและจำนวนที่พัก — 10 วิ ของ Hobby ไม่พอแน่นอน (SRS TFR-008)
export const maxDuration = 60

/**
 * GET /api/cron/inspection-lifecycle — แผนการตรวจสอบร้าน (feature 00060 · T8)
 *
 * 🛑 **นี่คือกลไกที่ทำให้คำว่า "ตรวจสอบอย่างต่อเนื่อง" เป็นความจริง ไม่ใช่คำโฆษณา** (TD-017)
 *    ถ้า cron นี้ไม่ทำงาน ระบบจะยัง **ถูกทุกบรรทัด ไม่มี error สักตัว** แล้วป้ายของร้านที่จ่ายเงิน
 *    ต่อเนื่องจะร่วงทีละข้อตามอายุผล โดยไม่มีใครถูกส่งไปตรวจ — ความล้มเหลวชนิดที่ไม่มี log
 *    ไม่มีใครรายงาน และกว่าจะมีคนโยงกลับถึงต้นเหตุก็ผ่านไป 6-12 เดือน
 *
 * 5 งานตามลำดับ (SRS TFR-008) — ลำดับสำคัญ ห้ามสลับ:
 *   1+2. ต่ออายุ / เริ่มนับผ่อนผัน / พ้นสถานะ  (อยู่ใน renewOrLapseInspectionPlan ตัวเดียว)
 *   3.   ข้อตรวจอัตโนมัติของขั้นที่ 1
 *   4.   เปิดรอบตรวจล่วงหน้าของขั้น 2-4 — 🛑 ต้องหลังงานที่ 3 เพราะมันอ่าน expiresAt ที่งานที่ 3
 *        เพิ่งเลื่อน ถ้าสลับจะเปิดรอบให้ข้อที่เพิ่งถูกยืนยันไปเมื่อกี้
 *   5.   สร้างแถวโควตาของเดือนถัดไป
 *
 * 🛑 **ไม่มีงาน "ไล่อัปเดตสถานะที่หมดอายุ"** — "รอตรวจซ้ำ" คำนวณตอนอ่านเสมอ (TFR-003)
 *    ถ้ามีใครเพิ่มงานแบบนั้นเข้ามา แปลว่ามีคอลัมน์สถานะซ้ำเกิดขึ้นแล้วที่ไหนสักแห่ง ต้องถอดออก
 */
export async function GET(request: Request) {
  // 🛑 env ว่าง = ปฏิเสธ ห้ามปล่อยให้เทียบกับสตริง "Bearer undefined" แล้วผ่าน
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // เวลาเดียวทั้งรอบ — ร้านที่รันตอนต้นรอบกับท้ายรอบต้องถูกตัดสินด้วยเส้นเวลาเดียวกัน
  const now = new Date()

  const plans = await prisma.inspectionPlan.findMany({
    where: { status: 'ACTIVE' },
    select: { shopId: true, step: true },
  })

  let renewed = 0
  let grace = 0
  let lapsed = 0
  let autoCheckedShops = 0
  let resultRowsWritten = 0
  let resultRowsChanged = 0
  let roundsScheduled = 0
  let errors = 0

  for (const plan of plans) {
    // ความล้มเหลวของร้านหนึ่งต้องไม่ทำให้ทั้งรอบหยุด (รูปแบบเดียวกับ inventory-renewal)
    try {
      const step = plan.step as InspectionStep

      const renewal = await renewOrLapseInspectionPlan(plan.shopId, now)
      if (renewal.action === 'RENEWED') renewed += 1
      else if (renewal.action === 'GRACE_STARTED') grace += 1
      else if (renewal.action === 'LAPSED') lapsed += 1

      // 🛑 ร้านที่พ้นสถานะไปแล้วในรอบนี้ ไม่ตรวจต่อและไม่เปิดรอบใหม่ — ประวัติเดิมยังอยู่ครบ
      //    (AC-INS-27-3) แต่การตรวจหยุดตามการจ่ายเงิน ไม่ใช่ตรวจให้ฟรีต่อไปเรื่อย ๆ
      if (renewal.action === 'LAPSED') continue

      const auto = await runAutomaticStep1Checks({ shopId: plan.shopId, planStep: step, now })
      autoCheckedShops += 1
      resultRowsWritten += auto.recorded
      resultRowsChanged += auto.changed

      roundsScheduled += await prisma.$transaction((tx) =>
        createDueRoundsForShop(tx, { shopId: plan.shopId, planStep: step, now }),
      )
    } catch (e) {
      errors += 1
      console.error(`[cron/inspection-lifecycle] shopId=${plan.shopId} error:`, e)
    }
  }

  const quota = await seedNextMonthQuota(now)
  // 🛑 ตัวชี้วัดงานค้างต้องอยู่ใน response ด้วย — แผงแอดมินยังต้องมีคนเปิดดู แต่ log อ่านย้อนหลังได้
  const overdueRounds = await countOverdueRounds(now)

  return NextResponse.json({
    plans: plans.length,
    renewed,
    grace,
    lapsed,
    autoCheckedShops,
    resultRowsWritten,
    resultRowsChanged,
    roundsScheduled,
    quota,
    overdueRounds,
    errors,
  })
}

/**
 * งานที่ 5 — สร้างแถวโควตาของเดือนถัดไปโดย **คัดลอก capacity ของเดือนปัจจุบัน**
 *
 * 🛑 ระบบ fail-closed โดยตั้งใจ (ไม่มีแถวโควตา = ปิดรับสมัคร) ซึ่งถูกในแง่ความปลอดภัย แต่แปลว่า
 *    ถ้าทีมลืมสร้างแถวของเดือนใหม่ ทุกขั้นจะปิดรับเงียบ ๆ ทันทีที่ขึ้นเดือน ไม่มี error
 *    ไม่มีการแจ้งเตือน รายได้หายไปเฉย ๆ จนกว่าจะมีคนสังเกต
 *
 * 🛑 เดือนปัจจุบันไม่มีแถวเลย = **ไม่มีอะไรให้คัดลอก ห้ามเดา capacity เอง** — คืน
 *    `sourceMissing: true` ให้เห็นจาก log แทน (ตัวเลขที่เดาขึ้นมาเองจะกลายเป็นเพดานที่
 *    ไม่มีใครตั้งใจ แล้วไม่มีใครรู้ว่ามันมาจากไหน)
 */
async function seedNextMonthQuota(now: Date): Promise<{
  period: string
  created: number
  sourceMissing: boolean
}> {
  const period = nextIntakePeriodKey(now)
  const current = await prisma.inspectionIntakeQuota.findMany({
    where: { periodYearMonth: intakePeriodKey(now) },
    select: { step: true, capacity: true },
  })
  if (current.length === 0) return { period, created: 0, sourceMissing: true }

  let created = 0
  for (const row of current) {
    // seedIntakeQuota เป็น idempotent และ **ไม่เขียนทับ capacity ที่แอดมินปรับไว้เอง**
    const r = await seedIntakeQuota({
      periodYearMonth: period,
      step: row.step as InspectionStep,
      capacity: row.capacity,
    })
    if (r.created) created += 1
  }
  return { period, created, sourceMissing: false }
}

// Vercel Cron ยิง GET เสมอ — คง POST ไว้สำหรับ manual trigger (export แค่ POST = 405 เงียบ ๆ)
export const POST = GET
