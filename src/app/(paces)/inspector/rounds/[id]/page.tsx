/**
 * /inspector/rounds/[id] — บันทึกผลตรวจของรอบเดียว (feature 00060 · T13 · UX Design Spec Surface C)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/[id]/page.tsx pattern (RSC detail
 *   wrapper, service-direct DAL) — โครงเดียวกับ `/inspector` (list) และหน้า admin อื่นในรีโปนี้
 *
 * 🛑 ด่านความเป็นเจ้าของรอบต้องมาก่อนเสมอ — เรียก `assertRoundAssignedTo()` เอง (แยกจาก
 * `getRoundDetailForInspector()`) เพราะ payload ของฟังก์ชันหลังไม่มีฟิลด์ `completedAt` ให้ตัดสิน
 * ว่ารอบนี้ถูกปิดไปแล้วหรือยัง (ช่องว่างที่มีอยู่ก่อนใน service — แก้ไม่ได้ที่นี่ เพราะ
 * `src/services/inspection-round.service.ts` เป็นไฟล์ต้องห้ามของ task นี้) — ทั้งสองฟังก์ชัน
 * ตรวจ ownership ซ้ำกันได้ ไม่ผิดอะไร (idempotent read)
 */
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  InspectionRoundError,
  assertRoundAssignedTo,
  getRoundDetailForInspector,
} from '@/services/inspection-round.service'
import { INSPECTION_STEP_LABEL_TH, type InspectionStep } from '@/lib/inspection/checks'
import { requireInspectorPage } from '../../_shared'
import InspectorHeader from '../../_components/InspectorHeader'
import RoundResultForm from './_components/RoundResultForm'
import ReadOnlyClosedRound from './_components/ReadOnlyClosedRound'

export const metadata: Metadata = { title: 'บันทึกผลตรวจ' }

type PageProps = { params: Promise<{ id: string }> }

export default async function InspectorRoundPage({ params }: PageProps) {
  const { id } = await params
  const { userId } = await requireInspectorPage()

  let closed = false
  try {
    const round = await assertRoundAssignedTo(id, userId)
    closed = round.completedAt !== null
  } catch (e) {
    // ROUND_NOT_ASSIGNED_TO_YOU (ไม่ใช่ของคุณ/ไม่มีอยู่จริง — รวมเป็นคำตอบเดียวโดยตั้งใจ
    // ตาม `/api/inspector/_shared.ts` เพื่อกันเดา id ไล่แล้วรู้ว่ารอบไหนมีอยู่จริงบ้าง)
    if (e instanceof InspectionRoundError) return notFound()
    throw e
  }

  const detail = await getRoundDetailForInspector(id, userId)

  // `Room.images` เก็บเป็น `Json` array ของ fileId (ไม่ใช่ URL ตรง) — มิเรอร์ pattern เดียวกับ
  // `RoomList.tsx` ฝั่งร้าน (`/api/files/{fileId}`) ไม่ประดิษฐ์ทางเข้าไฟล์ใหม่
  const listingImages: string[] = Array.isArray(detail.room?.listingImages)
    ? detail.room.listingImages.filter((v): v is string => typeof v === 'string').map((fileId) => `/api/files/${fileId}`)
    : []

  if (closed) {
    return (
      <>
        <InspectorHeader title="บันทึกผลตรวจ" showBack />
        <ReadOnlyClosedRound
          shopName={detail.shop.shopName}
          roomName={detail.room?.name ?? null}
          stepLabel={INSPECTION_STEP_LABEL_TH[detail.round.step as InspectionStep]}
          checks={detail.checks}
        />
      </>
    )
  }

  return (
    <>
      <InspectorHeader title="บันทึกผลตรวจ" showBack />
      <RoundResultForm
        roundId={id}
        shopName={detail.shop.shopName}
        room={
          detail.room === null
            ? null
            : {
                id: detail.room.id,
                name: detail.room.name,
                listingImages,
                declaredMaxGuests: detail.room.declaredMaxGuests,
                declaredFacilities: detail.room.declaredFacilities,
              }
        }
        method={detail.round.method}
        stepLabel={INSPECTION_STEP_LABEL_TH[detail.round.step as InspectionStep]}
        checks={detail.checks}
        initialFraudNote={detail.suspectedFraudNote}
      />
    </>
  )
}
