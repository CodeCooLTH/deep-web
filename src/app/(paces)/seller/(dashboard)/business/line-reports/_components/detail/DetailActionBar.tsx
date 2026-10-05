'use client'

/**
 * DetailActionBar — action-bar ของหน้ากลุ่ม: ซ้าย `‹` + ป้ายสถานะ · ขวา `⋯` → "ส่งทดสอบ" (primary ขวาสุด) · ตัวนับ/เหตุใต้บาร์ชิดขวา
 *
 * Base: docs/conventions/seller-action-placement.md §2 (ลำดับ ⋯ → secondary → PRIMARY, sticky ใต้ topbar)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (.btn primary + disabled)
 *   + src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx (ปุ่ม ⋯ ผ่าน GroupMenu)
 *
 * boolean/ข้อความทั้งหมดมาจาก presenter (`canTest`/`testBlockedReason`/`testsLeft`) ที่ผู้เรียกคำนวณแล้ว — ที่นี่ render อย่างเดียว
 * ส่งทดสอบไม่มี confirm (seller-action-placement §3.1: ขั้นสุดท้ายของ flow ที่ตั้งใจเดินมาเอง + ปุ่มเขียนผลลัพธ์ตรง ๆ) · กำลังส่ง = spinner + disabled ล็อกกดซ้ำ
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import type { GroupBadge } from '@/lib/line-report/presenter'
import { TEST_SEND_DAILY_LIMIT } from '@/lib/line-report/presenter'
import GroupStatusBadge from '../GroupStatusBadge'
import GroupMenu from './GroupMenu'

export default function DetailActionBar({
  badge,
  groupId,
  groupName,
  canTest,
  blockedReason,
  testsLeft,
  sending,
  busy,
  onTest,
}: {
  badge: GroupBadge
  groupId: string
  groupName: string
  canTest: boolean
  /** null = กดได้ (จาก testBlockedReason) */
  blockedReason: string | null
  testsLeft: number
  /** กำลังยิง POST /test → spinner */
  sending: boolean
  /** ล็อกปุ่มชั่วคราว: กำลังส่ง ∨ มีค่าที่ autosave ยังไม่บันทึก (ทดสอบต้องใช้ค่าที่บันทึกแล้ว) */
  busy: boolean
  onTest: () => void
}) {
  const helpId = 'line-report-test-help'
  return (
    <>
      {/* ตำแหน่ง sticky ลอกจาก reports/products/components/ProductSalesClient.tsx:243 — <lg ใต้ SellerMobileHeader (4.25rem + safe-area, z-20 เท่ากัน ไม่ทับ) · lg ใต้ topbar ตาม Sidenav
          z-20 ไม่ใช่ z-10: `.btn` มี z-10 ในตัว (เทส paces-sticky-z-index) */}
      <div
        className="bg-body-bg sticky top-[calc(4.25rem+env(safe-area-inset-top))] z-20 mb-2 flex items-center gap-2 py-2 lg:top-(--topbar-height)" /* carve-out HR7: ความสูงหัวแอป + safe-area ไม่มี token ในธีม */
      >
        <Link
          href="/business/line-reports"
          aria-label="กลับไปรายการกลุ่ม"
          className="btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 min-w-11 border"
        >
          <Icon icon="chevron-left" className="size-4" aria-hidden="true" />
        </Link>
        <GroupStatusBadge badge={badge} />
        <span className="flex-1" />
        <GroupMenu groupId={groupId} groupName={groupName} />
        <button
          type="button"
          onClick={onTest}
          disabled={!canTest || busy}
          aria-describedby={helpId}
          className="btn bg-primary hover:bg-primary-hover inline-flex min-h-11 items-center gap-1.5 text-white lg:min-h-0"
        >
          <Icon icon={sending ? 'loader-2' : 'send'} className={`text-base ${sending ? 'animate-spin' : ''}`} aria-hidden="true" />
          ส่งทดสอบ
        </button>
      </div>
      <p id={helpId} className="text-default-700 mb-3 text-right text-xs">
        {blockedReason ?? `เหลือ ${testsLeft} จาก ${TEST_SEND_DAILY_LIMIT} ครั้งวันนี้`}
      </p>
    </>
  )
}
