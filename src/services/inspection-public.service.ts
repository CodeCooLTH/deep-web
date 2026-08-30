import 'server-only'

import { prisma } from '@/lib/prisma'
import { isInspectionCheckKey, type InspectionStep } from '@/lib/inspection/checks'
import type { InspectionResultRow } from '@/lib/inspection/result-status'
import { toPublicInspectionView, type PublicInspectionView } from '@/lib/inspection/public-view'

/**
 * inspection-public.service.ts — ข้อมูลตรวจสอบสำหรับ **หน้าโปรไฟล์สาธารณะ** (feature 00060 · T7)
 *
 * 🛑 หลักการของไฟล์นี้: หลักฐานปิดต้อง **ไม่ออกจากฐานข้อมูลตั้งแต่แรก** ไม่ใช่ดึงมาแล้วกรอง
 *    ทีหลัง — หน้าโปรไฟล์อยู่ใต้ client layout ทุกค่าที่ข้ามเส้น RSC ถูก serialize ลง HTML
 *    เสมอแม้ไม่ถูก render ⇒ อะไรที่ไม่ได้ตั้งใจให้สาธารณะเห็น ห้าม select ออกมาเลย
 *
 * 🛑 คอลัมน์ที่ห้าม select ในไฟล์นี้เด็ดขาด: `suspectedFraudNote` (ข้อสงสัยที่ยังไม่ถูก
 *    ตัดสิน การเปิดเผยคือการกล่าวหา) · `invalidatedReason`/`note` (บันทึกภายในของผู้ตรวจ)
 *    · หลักฐานที่ `visibility='PRIVATE'` (กรองใน WHERE ไม่ใช่ใน JS)
 */

/** 3 คำสั่งคงที่ ไม่ว่าร้านจะมีที่พักกี่หลัง — ห้ามวน query ต่อหลัง (NFR N+1) */
export async function getInspectionForPublicProfile(
  shopId: string,
  now: Date,
): Promise<PublicInspectionView | null> {
  const plan = await prisma.inspectionPlan.findUnique({
    where: { shopId },
    select: { step: true, status: true },
  })
  if (!plan) return null

  const [rawResults, rooms, rawRounds] = await Promise.all([
    prisma.inspectionResult.findMany({
      where: { shopId },
      // 🛑 เรียงให้ตรงกับ latestResultPerCheck() เป๊ะ — checkedAt DESC, id DESC
      //    ถ้าสองฝั่งเรียงไม่เหมือนกัน ป้ายกับไทม์ไลน์จะไม่ตรงกันแบบสุ่มโดยไม่มีอะไรฟ้อง
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, checkKey: true, roomId: true, outcome: true,
        checkedAt: true, lastConfirmedAt: true, expiresAt: true, invalidatedAt: true,
        // ห้ามเพิ่ม note / invalidatedReason ที่นี่ — เป็นบันทึกภายในของผู้ตรวจ
      },
    }),
    prisma.room.findMany({
      where: { shopId, showOnProfile: true },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.inspectionRound.findMany({
      // 🛑 กรองรอบที่ยังไม่เสร็จออกใน WHERE — คิว "รอผู้ตรวจเข้าตรวจ" เป็นข้อมูลภายใน
      //    (AC-INS-17-2) ถ้าดึงมาแล้วค่อยกรองใน JS มันจะอยู่ใน payload ระหว่างทาง
      where: { shopId, completedAt: { not: null } },
      select: {
        id: true, step: true, completedAt: true, inspectorDisplayName: true,
        // ห้าม select suspectedFraudNote เด็ดขาด
        evidence: {
          // กรองที่ฐานข้อมูล ไม่ใช่ใน JS — หลักฐานปิดต้องไม่ออกมาเลยแม้แต่แถวเดียว
          where: { visibility: 'PUBLIC' },
          select: { visibility: true, fileId: true, lat: true, lng: true },
        },
      },
      orderBy: { completedAt: 'desc' },
    }),
  ])

  const results: InspectionResultRow[] = rawResults.flatMap((r) =>
    // คีย์ที่ไม่รู้จัก (ถูกถอดออกจาก SSOT ภายหลัง) = ข้ามไป ให้ถูกมองว่า "ยังไม่มีข้อมูล"
    isInspectionCheckKey(r.checkKey) ? [{ ...r, checkKey: r.checkKey }] : [],
  )

  return toPublicInspectionView({
    plan: { step: plan.step as InspectionStep, active: plan.status === 'ACTIVE' },
    results,
    rooms,
    rounds: rawRounds.map((r) => ({
      ...r,
      step: r.step as InspectionStep,
      evidence: r.evidence.map((e) => ({
        visibility: e.visibility,
        fileId: e.fileId,
        lat: e.lat === null ? null : Number(e.lat),
        lng: e.lng === null ? null : Number(e.lng),
      })),
    })),
    now,
  })
}
