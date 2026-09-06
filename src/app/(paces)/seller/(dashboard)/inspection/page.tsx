/**
 * แผนการตรวจสอบ — ฝั่งร้าน (feature 00060 · T12, Surface B ของ UX-Design-Spec.md)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx (โครงหน้า + การ์ดขั้น)
 *   ผ่าน src/app/(paces)/seller/(dashboard)/verification/page.tsx ที่ re-source มาแล้ว
 *   (PageBreadcrumb + card สรุปสถานะ + แถวการ์ดขั้น — โครงเดียวกับที่หน้านี้ต้องการ)
 *
 * Design Spec: docs/20 - Features/00060 - Shop Inspection Plan/UX-Design-Spec.md §Surface B (165-254)
 *
 * IMPORTANT: หน้านี้เป็น server component และต้อง gate ด้วย vertical เอง — การซ่อนเมนู
 * ไม่ใช่การควบคุมสิทธิ์ ร้านที่ไม่ใช่ LODGING พิมพ์ URL ตรงต้องถูกปฏิเสธ (BR-LODG-03,
 * มิเรอร์ pattern เดียวกับ src/app/(paces)/seller/(dashboard)/rooms/page.tsx)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { requireActiveShop } from '@/lib/shop-context'
import { getInspectionForOwner } from '@/services/inspection-owner.service'
import { InspectionPlanError } from '@/services/inspection-plan.service'
import { shouldHidePayments } from '@/lib/app-shell-server'
import SellerErrorState from '../_shared/SellerErrorState'
import { serializeOwnerInspectionView } from './components/serialize'
import PlanStatusCard from './components/PlanStatusCard'
import StepLadder from './components/StepLadder'
import InspectionChecklistSection from './components/InspectionChecklistSection'
import RoundTimeline from './components/RoundTimeline'

export const metadata: Metadata = { title: 'แผนการตรวจสอบ' }

export default async function InspectionPage() {
  const session = await getServerSession(authOptions)
  // 🛑 "มี session" ≠ "รู้ว่าเป็นใคร" — ใช้ sessionUserId() เท่านั้น ห้าม cast session.user.id เอง
  //    (docs/conventions/session-exists-is-not-identity.md)
  const userId = sessionUserId(session)
  if (userId === null) return null // layout redirect guard handles unauthenticated

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null

  // gate ระดับหน้า — notFound() แทน 403 page เพื่อไม่บอกใบ้ว่า route นี้มีอยู่จริงสำหรับร้านที่
  // ไม่ควรเข้าถึง (ลด information disclosure) — ตรงกับ service เอง (assertOwnerOfLodgingShop
  // ก็ throw NOT_LODGING_SHOP) แต่ตัดจบเร็วที่ระดับหน้าให้ข้อความ 404 คงเส้นคงวา
  if (active.shop.vertical !== 'LODGING') notFound()

  let view
  try {
    view = await getInspectionForOwner({
      shopId: active.shop.id,
      userId,
      roomId: null,
      now: new Date(),
    })
  } catch (e) {
    // 🛑 "ไม่มีสิทธิ์" ไม่ใช่ "ผิดพลาดชั่วคราว" — เดิม catch เดียวกลืนทุกอย่างแล้วบอกให้ "ลองโหลด
    //    ใหม่อีกครั้ง" ⇒ เชิญให้ผู้ใช้กดวนสิ่งที่ไม่มีวันสำเร็จ (คลาสเดียวกับบทเรียน iShip
    //    2026-08-06 ที่จัด "เครดิตไม่พอ" เป็น error ที่ retry ได้)
    const code = e instanceof InspectionPlanError ? e.code : null
    if (code === 'NOT_SHOP_MEMBER' || code === 'NOT_SHOP_OWNER' || code === 'SHOP_NOT_FOUND') {
      notFound()
    }
    return (
      <>
        <PageBreadcrumb title="แผนการตรวจสอบ" />
        <SellerErrorState
          title="โหลดข้อมูลแผนการตรวจสอบไม่สำเร็จ"
          message="เกิดข้อผิดพลาดชั่วคราว ลองโหลดใหม่อีกครั้ง"
          retryHref="/inspection"
        />
      </>
    )
  }

  const data = serializeOwnerInspectionView(view)
  /* 🛑 App Store 3.1.1 — ในแอปผู้ขาย (WebView) ห้ามมีคำเชิญให้จ่ายเงินนอกระบบของ Apple
     หน้านี้ขาย "แผนการตรวจสอบ" จึงต้องซ่อนทั้งปุ่มสมัคร/อัปเกรดและคำแนะนำให้เติมเงิน
     — สถานะและผลตรวจยังแสดงครบ (เป็นข้อมูล ไม่ใช่การขาย) แพตเทิร์นเดียวกับหน้า /wallet
     ที่ยังโชว์ยอดคงเหลือแต่ซ่อนปุ่มเติมเงิน · ด่านนี้ถูกบังคับด้วยเทส [blocker]
     `no-payment-entry-in-app.test.ts` ซึ่งจับหน้านี้ได้ทันทีหลัง rebase */
  const hidePayments = await shouldHidePayments()

  return (
    <>
      <PageBreadcrumb title="แผนการตรวจสอบ" />
      <p className="text-default-400 -mt-2 mb-6 text-sm">
        จ่ายค่าแรงให้ Deep ไปตรวจสอบร้านคุณต่อเนื่อง ผลตรวจที่ผ่านจะแสดงบนโปรไฟล์สาธารณะของร้าน
      </p>

      <div className="space-y-base">
        <PlanStatusCard plan={data.plan} canManage={data.canManage} hidePayments={hidePayments} />

        <StepLadder plan={data.plan} canManage={data.canManage} intake={data.intake} hidePayments={hidePayments} />

        <InspectionChecklistSection
          plan={data.plan}
          shopResults={data.shopResults}
          roomResults={data.roomResults}
          pendingRounds={data.pendingRounds}
        />

        <RoundTimeline timeline={data.timeline} pendingRounds={data.pendingRounds} />
      </div>
    </>
  )
}
