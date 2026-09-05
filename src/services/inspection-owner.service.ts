import 'server-only'

import { prisma } from '@/lib/prisma'
import { InspectionPlanError } from '@/services/inspection-plan.service'
import { intakePeriodKey, nextIntakeOpensAt } from '@/lib/inspection/plan-lifecycle'
import {
  availableIntakeSteps,
  buildOwnerInspectionSections,
  type OwnerInspectionSections,
  type OwnerResultRow,
  type OwnerRoundRow,
} from '@/lib/inspection/owner-view'
import type { InspectionStep } from '@/lib/inspection/checks'

/**
 * inspection-owner.service.ts — มุมมองของฝั่งร้าน (feature 00060 · T9)
 *
 * 🛑 ทุกอย่างที่นี่ผูกกับ `shopId` ที่ผู้เรียก **พิสูจน์สิทธิ์แล้ว** — ห้ามรับ `shopId` จาก client
 *    ที่ route (route ต้อง derive จาก active shop ของ session) รับเมื่อไรผู้ขาย A อ่านสถานะ
 *    แผนของผู้ขาย B ได้ทันที
 *
 * 🛑 คนละมุมกับ `inspection-public.service.ts` โดยสิ้นเชิง — ที่นี่ **ร้านเห็นของตัวเองครบ**
 *    รวมถึงข้อที่ `FAIL` และรอบที่ยังไม่ปิด (คิว "รอผู้ตรวจเข้าตรวจ") ซึ่งฝั่งสาธารณะห้ามเห็น
 *    ⇒ ห้ามเอา DTO ของไฟล์นี้ไปใช้ต่อในหน้าโปรไฟล์สาธารณะไม่ว่ากรณีใด
 */

export type OwnerInspectionView = OwnerInspectionSections & {
  plan: {
    step: InspectionStep
    status: 'ACTIVE' | 'LAPSED'
    termsAcceptedAt: Date | null
    lapsedReason: string | null
    effectiveAt: Date | null
  } | null
  canManage: boolean
  intake: { stepAvailable: InspectionStep[]; nextOpenAt: Date | null }
}

/**
 * ด่านของ GET — เปิดให้ทั้ง OWNER และ `ShopMember(role='ADMIN')` (AC-INS-02-2: ADMIN ดูได้ กดไม่ได้)
 * 🛑 ลำดับเดียวกับ endpoint ที่เขียนข้อมูล: ประเภทร้านก่อน แล้วค่อยสิทธิ์
 */
async function resolveShopAccess(shopId: string, userId: string): Promise<{ isOwner: boolean }> {
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: { userId: true, vertical: true },
  })
  if (shop === null) throw new InspectionPlanError('SHOP_NOT_FOUND')
  if (shop.vertical !== 'LODGING') throw new InspectionPlanError('NOT_LODGING_SHOP')
  if (shop.userId === userId) return { isOwner: true }

  const member = await prisma.shopMember.findUnique({
    where: { shopId_userId: { shopId, userId } },
    select: { role: true },
  })
  if (member === null) throw new InspectionPlanError('NOT_SHOP_MEMBER')
  return { isOwner: false }
}

/** ขั้นที่เปิดรับสมัครเดือนนี้ + วันที่รอบถัดไปจะเปิด (AC-INS-09-2 ต้องรู้ตั้งแต่เปิดหน้า) */
export async function getIntakeAvailability(now: Date): Promise<{
  stepAvailable: InspectionStep[]
  nextOpenAt: Date | null
}> {
  const quotas = await prisma.inspectionIntakeQuota.findMany({
    where: { periodYearMonth: intakePeriodKey(now) },
    select: { step: true, capacity: true, usedCount: true },
  })
  return { stepAvailable: availableIntakeSteps(quotas), nextOpenAt: nextIntakeOpensAt(now) }
}

export async function getInspectionForOwner(input: {
  shopId: string
  userId: string
  roomId?: string | null
  now: Date
}): Promise<OwnerInspectionView> {
  const { shopId, userId, roomId = null, now } = input
  const { isOwner } = await resolveShopAccess(shopId, userId)

  const [plan, rooms, results, rounds, intake] = await Promise.all([
    prisma.inspectionPlan.findUnique({
      where: { shopId },
      select: { step: true, status: true, termsAcceptedAt: true, lapsedReason: true, canceledAt: true, nextRenewalAt: true },
    }),
    prisma.room.findMany({
      where: { shopId, ...(roomId === null ? {} : { id: roomId }) },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.inspectionResult.findMany({
      where: { shopId, ...(roomId === null ? {} : { OR: [{ roomId: null }, { roomId }] }) },
      select: {
        id: true,
        checkKey: true,
        roomId: true,
        roundId: true,
        outcome: true,
        checkedAt: true,
        lastConfirmedAt: true,
        expiresAt: true,
        invalidatedAt: true,
      },
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.inspectionRound.findMany({
      where: { shopId },
      select: {
        id: true,
        roomId: true,
        step: true,
        method: true,
        assignedAt: true,
        completedAt: true,
        inspectorDisplayName: true,
        // 🛑 ห้าม select `suspectedFraudNote` เด็ดขาด — เป็นข้อสงสัยที่ยังไม่ถูกตัดสิน
        //    ร้านเห็นเมื่อไรคือการกล่าวหา และหลักฐานถูกทำลายได้ก่อนใครจะไปตรวจ
      },
      orderBy: { assignedAt: 'desc' },
    }),
    getIntakeAvailability(now),
  ])

  const sections = buildOwnerInspectionSections({
    rooms,
    results: results as OwnerResultRow[],
    rounds: rounds as OwnerRoundRow[],
    now,
  })

  return {
    ...sections,
    plan:
      plan === null
        ? null
        : {
            step: plan.step as InspectionStep,
            status: plan.status,
            termsAcceptedAt: plan.termsAcceptedAt,
            // 🛑 `lapsedReason` ถูกเขียนตั้งแต่ตอนร้านกดยกเลิก (ก่อนสิ้นรอบบิล) แต่ฝั่งอ่าน
            //    เปิดเผยเฉพาะตอนที่แผน LAPSED จริงแล้วเท่านั้น (API §4.1) — ระหว่างนั้นสิ่งที่
            //    ร้านต้องรู้คือ "จะสิ้นสุดเมื่อไร" ซึ่งอยู่ที่ effectiveAt ไม่ใช่เหตุผล
            lapsedReason: plan.status === 'LAPSED' ? plan.lapsedReason : null,
            effectiveAt: plan.canceledAt === null ? null : plan.nextRenewalAt,
          },
    canManage: isOwner,
    intake,
  }
}
