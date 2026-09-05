import 'server-only'

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { deductCredit } from '@/services/wallet.service'
import type { InspectionStep } from '@/lib/inspection/checks'
import {
  INSPECTION_RENEWAL_PERIOD_DAYS,
  addDays,
  decidePlanRenewal,
  intakePeriodKey,
} from '@/lib/inspection/plan-lifecycle'
import {
  INSPECTION_TERMS_VERSION,
  assertInspectionPricingDecided,
  renewChargeBaht,
  subscribeChargeBaht,
  upgradeChargeBaht,
} from '@/lib/inspection/pricing'
import { createDueRoundsForShop } from '@/services/inspection-round.service'
import { recomputeExpiryForPlanStep } from '@/services/inspection-result.service'

/**
 * inspection-plan.service.ts — วงจรชีวิตของแผนการตรวจสอบ (feature 00060 · T4)
 *
 * ครอบ: สมัคร · เปลี่ยนขั้น · ยกเลิก · ต่ออายุ/สิ้นสุด · โควตารับสมัคร · บันทึกความยินยอม
 *
 * 🛑 การตัดสินใจทั้งหมดของไฟล์นี้เป็นเรื่อง **เงินของร้าน** ไม่ใช่การแสดงผล — ผิดแล้วร้าน
 *    เสียเงินโดยไม่ได้บริการ หรือได้บริการโดยไม่เสียเงิน และทั้งสองทางร้านจะรู้ตัวช้ามาก
 *    เพราะไม่มีอะไรบนหน้าจอฟ้อง
 */

export type InspectionPlanErrorCode =
  | 'SHOP_NOT_FOUND'
  | 'NOT_LODGING_SHOP'
  | 'NOT_SHOP_OWNER'
  | 'NOT_SHOP_MEMBER'
  | 'TERMS_NOT_ACCEPTED'
  | 'INTAKE_QUOTA_FULL'
  | 'INTAKE_NOT_OPEN'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_NOT_ACTIVE'
  | 'PLAN_ALREADY_EXISTS'
  | 'PLAN_ALREADY_CANCELED'
  | 'STEP_UNCHANGED'
  | 'INVALID_STEP_TRANSITION'

export class InspectionPlanError extends Error {
  readonly code: InspectionPlanErrorCode
  constructor(code: InspectionPlanErrorCode) {
    super(code)
    this.code = code
    this.name = 'InspectionPlanError'
  }
}

type Tx = Prisma.TransactionClient

/**
 * ด่านสิทธิ์ + ด่านประเภทร้าน
 *
 * 🛑 **OWNER เท่านั้น — `ShopMember.role='ADMIN'` ไม่ผ่าน** (FR-INS-001) เพราะการกดปุ่มนี้
 *    คือการผูกพันค่าใช้จ่ายรายเดือนของเจ้าของกิจการ ไม่ใช่งานปฏิบัติการประจำวัน
 *
 * 🛑 ด่านต้องอยู่ที่ service ไม่ใช่แค่ซ่อนปุ่ม — เส้นทาง REST เปิดให้ยิงตรงได้เสมอ
 */
async function assertOwnerOfLodgingShop(client: Tx, shopId: string, userId: string): Promise<void> {
  const shop = await client.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: { userId: true, vertical: true },
  })
  if (shop === null) throw new InspectionPlanError('SHOP_NOT_FOUND')
  // 🛑 ลำดับนี้ผูกกับสัญญาใน API.md §4.2 — `NOT_LODGING` ต้องมาก่อน `NOT_OWNER` เพื่อให้ร้าน
  //    ประเภทอื่นที่ยิงตรงเข้ามาได้คำตอบที่ตรงกับความจริงเสมอ (ประเภทร้านเป็นข้อมูลสาธารณะอยู่แล้ว
  //    การตอบ NOT_OWNER ก่อนจะทำให้เจ้าของร้านประเภทอื่นไล่หาสาเหตุผิดทาง)
  if (shop.vertical !== 'LODGING') throw new InspectionPlanError('NOT_LODGING_SHOP')
  if (shop.userId !== userId) throw new InspectionPlanError('NOT_SHOP_OWNER')
}

/**
 * จองสิทธิ์โควตารับสมัคร 1 ที่ แบบ atomic (TFR-007)
 *
 * 🛑 **ห้ามอ่านมาเทียบใน TypeScript แล้วค่อยเขียน** — `if (used < capacity) update` เป็น race
 *    ที่รับเกินโควตาได้จริงในนาทีที่มีคนกดพร้อมกัน ซึ่งแปลว่าทีมตรวจรับงานเกินกำลังโดยที่
 *    ตัวเลขบนแผงแอดมินยังบอกว่าไม่เกิน
 *
 * 🛑 `count === 0` **ยังไม่บอกว่าเพราะอะไร** — ต้องอ่านต่อเพื่อแยก "เต็มแล้ว" ออกจาก
 *    "ยังไม่เปิดรับ" เพราะวันที่ทีมลืมตั้งโควตา ทุกขั้นจะขึ้นว่าเต็มทั้งที่ยังไม่มีใครสมัคร
 *    สักคน แล้วจะไม่มีใครเอะใจไปสืบต่อ (คำที่ฟังขึ้นสมบูรณ์คือคำที่ปิดการสืบสวน)
 *    การ SELECT นี้เกิด **หลัง** updateMany ล้มแล้วเท่านั้น จึงไม่ใช่ read-then-write
 */
export async function claimIntakeSlot(client: Tx, periodYearMonth: string, step: InspectionStep): Promise<void> {
  // เทียบสองคอลัมน์ในแถวเดียวกัน (`usedCount < capacity`) — Prisma query builder เขียนไม่ได้
  // ตรง ๆ และการอ่าน capacity มาเทียบใน TS ก่อนคือ race ที่กฎข้อนี้มีไว้ป้องกันพอดี
  const updated = await client.$executeRaw`
    UPDATE "InspectionIntakeQuota"
       SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
     WHERE "periodYearMonth" = ${periodYearMonth}
       AND "step" = ${step}
       AND "usedCount" < "capacity"`
  if (updated > 0) return

  const quota = await client.inspectionIntakeQuota.findUnique({
    where: { periodYearMonth_step: { periodYearMonth, step } },
    select: { id: true },
  })
  throw new InspectionPlanError(quota === null ? 'INTAKE_NOT_OPEN' : 'INTAKE_QUOTA_FULL')
}

/**
 * ตั้งโควตาของเดือน/ขั้นหนึ่ง — idempotent (มีแถวแล้วไม่แตะ)
 *
 * 🛑 **ห้าม upsert แบบเขียนทับ `capacity`** เพราะ cron รันทุกวัน ถ้าเขียนทับ ค่าที่แอดมิน
 *    ปรับด้วยมือระหว่างเดือนจะถูกดีดกลับทุกคืนโดยไม่มีใครเห็น (และ `usedCount` ที่นับไปแล้ว
 *    จะกลายเป็นตัวเลขที่เทียบกับเพดานคนละตัวกับที่แอดมินตั้งใจ)
 */
export async function seedIntakeQuota(input: {
  periodYearMonth: string
  step: InspectionStep
  capacity: number
}): Promise<{ created: boolean }> {
  const existing = await prisma.inspectionIntakeQuota.findUnique({
    where: { periodYearMonth_step: { periodYearMonth: input.periodYearMonth, step: input.step } },
    select: { id: true },
  })
  if (existing !== null) return { created: false }
  await prisma.inspectionIntakeQuota.create({
    data: { periodYearMonth: input.periodYearMonth, step: input.step, capacity: input.capacity, usedCount: 0 },
  })
  return { created: true }
}

/**
 * บันทึกความยินยอมหนึ่งครั้ง — **แหล่งความจริงของการรับทราบเงื่อนไข** (TD-019)
 *
 * 🛑 `InspectionPlan.termsAcceptedAt` เป็นแค่ค่าอ่านเร็วของครั้งล่าสุด ช่องเดียวเก็บได้แค่
 *    ครั้งเดียว แต่ AC-INS-10-3 บังคับให้รับทราบซ้ำทุกครั้งที่มีการชำระเงิน ⇒ ถ้าเก็บแค่ช่องนั้น
 *    จะพิสูจน์ย้อนหลังไม่ได้ว่าร้านรับทราบตอนจ่ายรอบไหน ซึ่งเป็นหลักฐานที่ต้องใช้พอดี
 *    ตอนร้านทักท้วงเรื่อง "ค่าตรวจไม่คืน"
 *
 * 🛑 ต้องเก็บ `priceSnapshotBaht` ด้วย เพราะคำถามตอนพิพาทคือ **"วันนั้นเขาเห็นอะไร"**
 *    ไม่ใช่ "ตอนนี้เขียนว่าอะไร"
 */
async function recordTermsAcceptance(
  client: Tx,
  input: { shopId: string; step: InspectionStep; priceSnapshotBaht: number; now: Date },
): Promise<void> {
  await client.inspectionTermsAcceptance.create({
    data: {
      shopId: input.shopId,
      acceptedAt: input.now,
      step: input.step,
      priceSnapshotBaht: input.priceSnapshotBaht,
      termsVersion: INSPECTION_TERMS_VERSION,
    },
  })
}

export type SubscribeInspectionPlanInput = {
  shopId: string
  userId: string
  step: InspectionStep
  termsAccepted: boolean
  now: Date
}

/**
 * สมัครแผน — ทรานแซกชันเดียวครอบ โควตา + ความยินยอม + เครดิต + แผน + รอบตรวจ (TFR-006)
 *
 * 🛑 **ลำดับ "จองโควตาก่อนหักเงิน" ห้ามสลับเด็ดขาด** — ถ้าหักเงินสำเร็จแล้วโควตาเต็ม
 *    ร้านเสียเงินโดยไม่ได้บริการ และการคืนเงินขัดกับกฎ "ไม่คืนเงิน" ที่เราเขียนไว้เอง
 *    กลายเป็นทางตันที่ต้องแก้ด้วยมือทีละราย
 *    (ทรานแซกชันช่วย rollback ได้ก็จริง แต่ลำดับที่ถูกคือด่านชั้นที่สองที่ไม่พึ่งพา
 *     ความถูกต้องของ transaction isolation)
 *
 * 🛑 ร้านที่ `LAPSED` แล้วสมัครใหม่ = **อัปเดตแถวเดิม ห้ามแตะ `InspectionRound`/`InspectionResult`
 *    เดิม** (AC-INS-27-3) ประวัติคือสิ่งที่เขาจ่ายเงินซื้อมา
 */
export type InspectionAcceptance = {
  acceptedAt: Date
  termsVersion: string
  priceSnapshotBaht: number
}

export type SubscribeInspectionPlanResult = {
  planId: string
  step: InspectionStep
  termsAcceptedAt: Date
  acceptance: InspectionAcceptance
  roundsCreated: number
}

export async function subscribeInspectionPlan(
  input: SubscribeInspectionPlanInput,
): Promise<SubscribeInspectionPlanResult> {
  const { shopId, userId, step, termsAccepted, now } = input
  if (!termsAccepted) throw new InspectionPlanError('TERMS_NOT_ACCEPTED')
  assertInspectionPricingDecided()

  const amount = subscribeChargeBaht(step)

  return prisma.$transaction(async (tx) => {
    await assertOwnerOfLodgingShop(tx, shopId, userId)

    // 🛑 มีแผนที่ยัง ACTIVE อยู่แล้ว = สมัครซ้ำไม่ได้ (409) — ถ้าปล่อยผ่าน `upsert` ข้างล่างจะ
    //    รีเซ็ตรอบบิลแล้วเก็บเงินรอบใหม่ทับของที่ร้านจ่ายไปแล้ว โดยหน้าจอขึ้นว่าสำเร็จทุกประการ
    //    ร้านที่ LAPSED แล้วกลับมาสมัครใหม่ยังผ่านได้ตามเดิม (เป็นการเริ่มรอบใหม่จริง)
    const existing = await tx.inspectionPlan.findUnique({ where: { shopId }, select: { status: true } })
    if (existing?.status === 'ACTIVE') {
      throw new InspectionPlanError('PLAN_ALREADY_EXISTS')
    }

    // 1) โควตาก่อนเสมอ
    await claimIntakeSlot(tx, intakePeriodKey(now), step)

    // 2) ความยินยอม — เขียนก่อนหักเงิน หักไม่ผ่านก็ rollback ไปพร้อมกัน
    await recordTermsAcceptance(tx, { shopId, step, priceSnapshotBaht: amount, now })

    // 3) เงิน (โยน INSUFFICIENT_CREDIT ออกไปตรง ๆ ตามสัญญาเดิมของ wallet.service)
    await deductCredit(shopId, amount, shopId, `ค่าแผนการตรวจสอบ ขั้นที่ ${step}`, 'INSPECTION_PLAN', tx)

    // 4) แผน
    const plan = await tx.inspectionPlan.upsert({
      where: { shopId },
      create: {
        shopId,
        step,
        status: 'ACTIVE',
        activatedAt: now,
        currentPeriodStart: now,
        nextRenewalAt: addDays(now, INSPECTION_RENEWAL_PERIOD_DAYS),
        termsAcceptedAt: now,
      },
      update: {
        step,
        status: 'ACTIVE',
        activatedAt: now,
        currentPeriodStart: now,
        nextRenewalAt: addDays(now, INSPECTION_RENEWAL_PERIOD_DAYS),
        termsAcceptedAt: now,
        // 🛑 ต้องล้างร่องรอยของรอบที่แล้วให้ครบทุกช่อง — เหลือค้างช่องใดช่องหนึ่ง
        //    แผนใหม่จะถูก cron ตัดสินด้วยข้อมูลของแผนเก่า (เช่น graceUntil ที่หมดอายุแล้ว
        //    ⇒ LAPSE ทันทีในคืนแรกทั้งที่เพิ่งจ่ายเงินมา)
        canceledAt: null,
        graceUntil: null,
        lapsedAt: null,
        lapsedReason: null,
      },
      select: { id: true },
    })

    // 5) เปิดรอบตรวจให้ทันที ไม่ต้องรอ cron รอบถัดไป (ร้านเพิ่งจ่ายเงิน)
    const roundsCreated = await createDueRoundsForShop(tx, { shopId, planStep: step, now })

    // คืนหลักฐานการรับทราบกลับไปด้วย — เป็นสิ่งเดียวที่แยก "บันทึกหลักฐานสำเร็จ" ออกจาก
    // "หักเงินสำเร็จแต่หลักฐานหาย" ได้จากฝั่ง client (API §4.2)
    return {
      planId: plan.id,
      step,
      termsAcceptedAt: now,
      acceptance: { acceptedAt: now, termsVersion: INSPECTION_TERMS_VERSION, priceSnapshotBaht: amount },
      roundsCreated,
    }
  })
}

export type ChangeInspectionPlanStepInput = {
  shopId: string
  userId: string
  toStep: InspectionStep
  termsAccepted: boolean
  now: Date
  /**
   * 🛑 `true` = ปฏิเสธการลดขั้นด้วย `INVALID_STEP_TRANSITION` — endpoint `/upgrade` ส่งค่านี้เสมอ
   *    (API §4.3: ห้าม implement การลดขั้นแบบเงียบผ่าน endpoint อัปเกรด เพราะการลดขั้นมีผล
   *     ต่อสิ่งที่ผู้ซื้อเห็นบนโปรไฟล์ทันที และยังไม่มีมติเรื่องส่วนต่าง)
   *    ตรวจ **ในทรานแซกชัน** ไม่ใช่ให้ route อ่านขั้นปัจจุบันมาเทียบก่อนเรียก — อ่านก่อนเรียก
   *    คือ TOCTOU ที่ผลลัพธ์คือเก็บเงินผิดจำนวน
   */
  upgradeOnly?: boolean
}

export type ChangeInspectionPlanStepResult = {
  previousStep: InspectionStep
  step: InspectionStep
  termsAcceptedAt: Date | null
  acceptance: InspectionAcceptance | null
  roundsCreated: number
}

/**
 * เปลี่ยนขั้น — ขึ้นและลงใช้เส้นทางเดียวกันแต่คนละกติกา (TFR-019)
 *
 * **ขึ้นขั้น:** จองโควตาของขั้นใหม่ → ความยินยอม → เก็บส่วนต่าง → อัปเดตขั้น → คำนวณอายุผล
 * ที่มีอยู่ใหม่ → เปิดรอบของข้อที่ยังไม่มีผล
 *
 * **ลงขั้น:** ไม่คิดเงิน ไม่ใช้โควตา ไม่ต้องรับทราบเงื่อนไขใหม่ (ไม่มีการชำระเงิน)
 * 🛑 **ห้ามลบผลตรวจของขั้นที่สูงกว่า** — ผลเดิมจะทยอยกลายเป็น "รอตรวจซ้ำ" เองเมื่อเลยกำหนด
 *    ซึ่งเป็นพฤติกรรมที่ถูกอยู่แล้วโดยไม่ต้องเขียนโค้ดพิเศษ
 *
 * 🛑 **รอบบิลไม่ถูกรีเซ็ตทั้งสองทิศ** (`nextRenewalAt` เดิมคงอยู่) — รีเซ็ตเมื่อไหร่
 *    การอัปเกรดกลางรอบจะกลายเป็นการเก็บค่าเดือนสองครั้งในเดือนเดียว
 */
export async function changeInspectionPlanStep(
  input: ChangeInspectionPlanStepInput,
): Promise<ChangeInspectionPlanStepResult> {
  const { shopId, userId, toStep, termsAccepted, now, upgradeOnly = false } = input

  return prisma.$transaction(async (tx) => {
    await assertOwnerOfLodgingShop(tx, shopId, userId)

    const plan = await tx.inspectionPlan.findUnique({
      where: { shopId },
      select: { step: true, status: true },
    })
    if (plan === null) throw new InspectionPlanError('PLAN_NOT_FOUND')
    if (plan.status !== 'ACTIVE') throw new InspectionPlanError('PLAN_NOT_ACTIVE')

    const fromStep = plan.step as InspectionStep
    if (fromStep === toStep) throw new InspectionPlanError('STEP_UNCHANGED')
    if (upgradeOnly && toStep < fromStep) throw new InspectionPlanError('INVALID_STEP_TRANSITION')

    let acceptance: InspectionAcceptance | null = null
    if (toStep > fromStep) {
      if (!termsAccepted) throw new InspectionPlanError('TERMS_NOT_ACCEPTED')
      assertInspectionPricingDecided()
      const amount = upgradeChargeBaht(fromStep, toStep)

      await claimIntakeSlot(tx, intakePeriodKey(now), toStep)
      await recordTermsAcceptance(tx, { shopId, step: toStep, priceSnapshotBaht: amount, now })
      acceptance = { acceptedAt: now, termsVersion: INSPECTION_TERMS_VERSION, priceSnapshotBaht: amount }
      // ส่วนต่างเป็น 0 ได้ตามสูตร (ยังไม่มีมติ) — deductCredit ปฏิเสธ amount<=0 ⇒ ข้ามการหักเงิน
      if (amount > 0) {
        await deductCredit(shopId, amount, shopId, `ปรับขั้นแผนการตรวจสอบเป็นขั้นที่ ${toStep}`, 'INSPECTION_PLAN', tx)
      }
    }

    await tx.inspectionPlan.update({
      where: { shopId },
      data: { step: toStep, termsAcceptedAt: toStep > fromStep ? now : undefined },
    })

    // อายุผลตรวจบางข้อผูกกับขั้นของแผน (ขั้น 4 ตรวจซ้ำถี่ขึ้น) ⇒ ผลที่มีอยู่ต้องคิดวันหมดอายุใหม่
    await recomputeExpiryForPlanStep(tx, shopId, toStep)

    const roundsCreated = toStep > fromStep
      ? await createDueRoundsForShop(tx, { shopId, planStep: toStep, now })
      : 0

    return {
      previousStep: fromStep,
      step: toStep,
      termsAcceptedAt: acceptance === null ? null : now,
      acceptance,
      roundsCreated,
    }
  })
}

/**
 * OWNER กดยกเลิก — **ตั้ง `canceledAt` เท่านั้น ไม่แตะ `status`** (AC-INS-26-3)
 *
 * 🛑 การยกเลิกมีผลตอนสิ้นรอบบิล ไม่ใช่ทันที — ร้านจ่ายค่ารอบนี้ไปแล้ว การตัดป้ายทันที
 *    คือการยึดบริการที่เขาซื้อไปแล้วคืน การเปลี่ยนเป็น LAPSED เกิดที่ cron เมื่อถึง
 *    `nextRenewalAt` พร้อม `lapsedReason='OWNER_CANCELLED'`
 */
export type CancelInspectionPlanResult = {
  /** เวลาที่แผนจะกลายเป็น LAPSED = สิ้นรอบบิลปัจจุบัน */
  effectiveAt: Date
  lapsedReason: 'OWNER_CANCELLED'
}

export async function cancelInspectionPlan(input: {
  shopId: string
  userId: string
  now: Date
}): Promise<CancelInspectionPlanResult> {
  const { shopId, userId, now } = input
  return prisma.$transaction(async (tx) => {
    await assertOwnerOfLodgingShop(tx, shopId, userId)
    const plan = await tx.inspectionPlan.findUnique({
      where: { shopId },
      select: { status: true, canceledAt: true, nextRenewalAt: true },
    })
    if (plan === null) throw new InspectionPlanError('PLAN_NOT_FOUND')
    if (plan.status !== 'ACTIVE') throw new InspectionPlanError('PLAN_NOT_ACTIVE')
    if (plan.canceledAt !== null) throw new InspectionPlanError('PLAN_ALREADY_CANCELED')

    await tx.inspectionPlan.update({
      where: { shopId },
      // 🛑 เขียน `lapsedReason` ตั้งแต่ตอนแจ้งยกเลิก ไม่ใช่ปล่อยให้ตัวตัดรอบบิลเดาเอาตอนสิ้นรอบ
      //    (API §4.4) — สองค่านี้แยกกันด้วย *เจตนา* ไม่ใช่ *อาการ*: ถ้าไม่บันทึกตอนนี้ cron
      //    จะเห็นแค่ "แผนนี้ไม่ต่ออายุ" แล้วเขียน RENEWAL_FAILED ให้คนที่ตั้งใจเลิก =
      //    บอกร้านว่าเขาค้างชำระทั้งที่เขาไม่ได้ค้าง
      //    🛑 ค่านี้ยัง **ไม่ถูกเปิดเผยฝั่งอ่าน** จนกว่า status จะเป็น LAPSED จริง (API §4.1)
      data: { canceledAt: now, lapsedReason: 'OWNER_CANCELLED' },
    })
    return { effectiveAt: plan.nextRenewalAt, lapsedReason: 'OWNER_CANCELLED' }
  })
}

/**
 * ต่ออายุ/เริ่มผ่อนผัน/สิ้นสุด สำหรับแผนเดียว — cron เรียกทีละแผน (TFR-008 งาน 1-2)
 *
 * การ **ตัดสิน** อยู่ที่ `decidePlanRenewal()` (ฟังก์ชันบริสุทธิ์ มีเทสของตัวเอง) ที่นี่แค่ **ทำ**
 *
 * 🛑 ถามเครดิตด้วยการ **ลองหักจริงในทรานแซกชัน** ไม่ใช่อ่านยอดมาเทียบก่อน — ยอดที่อ่านมา
 *    ใช้ตัดสินใจแล้วค่อยหัก คือ read-then-write ที่ race กับการใช้เครดิตของฟีเจอร์อื่น
 *    (ค่าส่ง iShip · SMS) ซึ่งเดินอยู่ตลอดเวลาในบัญชีเดียวกัน
 */
export async function renewOrLapseInspectionPlan(shopId: string, now: Date): Promise<
  { action: 'NOOP' } | { action: 'RENEWED' } | { action: 'GRACE_STARTED' } | { action: 'LAPSED'; reason: string }
> {
  const plan = await prisma.inspectionPlan.findUnique({
    where: { shopId },
    select: { step: true, status: true, nextRenewalAt: true, canceledAt: true, graceUntil: true },
  })
  if (plan === null) throw new InspectionPlanError('PLAN_NOT_FOUND')

  const step = plan.step as InspectionStep
  const amount = renewChargeBaht(step)

  // ไม่ถึงรอบ / ยกเลิกแล้ว ตัดสินได้โดยไม่ต้องแตะเงินเลย — ถามเครดิตเฉพาะตอนที่คำตอบมีผลต่อการตัดสิน
  const dry = decidePlanRenewal({
    status: plan.status,
    nextRenewalAt: plan.nextRenewalAt,
    canceledAt: plan.canceledAt,
    graceUntil: plan.graceUntil,
    hasEnoughCredit: false,
    now,
  })
  if (dry.kind === 'NOOP') return { action: 'NOOP' }
  if (dry.kind === 'LAPSE' && dry.reason === 'OWNER_CANCELLED') {
    await prisma.inspectionPlan.update({
      where: { shopId },
      data: { status: 'LAPSED', lapsedAt: now, lapsedReason: 'OWNER_CANCELLED' },
    })
    return { action: 'LAPSED', reason: 'OWNER_CANCELLED' }
  }

  let charged = false
  try {
    await prisma.$transaction(async (tx) => {
      await deductCredit(shopId, amount, shopId, `ต่ออายุแผนการตรวจสอบ ขั้นที่ ${step}`, 'INSPECTION_PLAN', tx)
      await tx.inspectionPlan.update({
        where: { shopId },
        data: {
          lastRenewalAt: now,
          currentPeriodStart: now,
          nextRenewalAt: addDays(now, INSPECTION_RENEWAL_PERIOD_DAYS),
          graceUntil: null,
        },
      })
    })
    charged = true
  } catch (err) {
    // 🛑 กลืนเฉพาะ "เครดิตไม่พอ" — error อื่น (DB ล่ม/ข้อมูลผิดรูป) ต้องโยนต่อ ไม่งั้นคืนที่ฐาน
    //    มีปัญหา ระบบจะตีความว่าร้านทุกรายเครดิตไม่พอแล้วเริ่มนับผ่อนผันให้ทั้งกระดาน
    if (!(err instanceof Error) || err.message !== 'INSUFFICIENT_CREDIT') throw err
  }
  if (charged) return { action: 'RENEWED' }

  const decision = decidePlanRenewal({
    status: plan.status,
    nextRenewalAt: plan.nextRenewalAt,
    canceledAt: plan.canceledAt,
    graceUntil: plan.graceUntil,
    hasEnoughCredit: false,
    now,
  })
  if (decision.kind === 'START_GRACE') {
    await prisma.inspectionPlan.update({ where: { shopId }, data: { graceUntil: decision.graceUntil } })
    return { action: 'GRACE_STARTED' }
  }
  if (decision.kind === 'LAPSE') {
    await prisma.inspectionPlan.update({
      where: { shopId },
      data: { status: 'LAPSED', lapsedAt: now, lapsedReason: decision.reason },
    })
    return { action: 'LAPSED', reason: decision.reason }
  }
  return { action: 'NOOP' }
}

/** อ่านแผนของร้าน — ผู้เรียกฝั่งหน้าจอ/API ใช้ตัวนี้ ห้าม query ตรง */
export async function getInspectionPlan(shopId: string) {
  return prisma.inspectionPlan.findUnique({
    where: { shopId },
    select: {
      id: true,
      step: true,
      status: true,
      lapsedReason: true,
      canceledAt: true,
      graceUntil: true,
      activatedAt: true,
      currentPeriodStart: true,
      nextRenewalAt: true,
      lastRenewalAt: true,
      lapsedAt: true,
      termsAcceptedAt: true,
    },
  })
}
