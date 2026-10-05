/**
 * ReportLockedState — E1 "ยังไม่มีแพ็กเกจและยังไม่เคยมีกลุ่ม" (การ์ดเดียว + ตัวอย่างข้อความ) · RSC
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card/.card-body)
 * + src/app/(paces)/seller/(dashboard)/business/components/LockedStateBanner.tsx (icon + ข้อความ + CTA)
 *
 * CTA มาจาก presenter `lockedCta(shell, reason)` — null (Android: ซ่อนการจ่ายเงินและไม่มี IAP) = ไม่มีปุ่ม ไม่มีราคา ไม่มีลิงก์
 * อธิบายอย่างเดียว (App Store 3.1.1) · แพ็กเกจที่เคยมีแต่หมด (มีกลุ่มอยู่) ไม่ใช้คอมโพเนนต์นี้ — ใช้ ReportBanner เหนือรายการ
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import type { LockedCta } from '@/lib/line-report/presenter'
import SampleBubble from './SampleBubble'

export default function ReportLockedState({ cta, now }: { cta: LockedCta | null; now: Date }) {
  return (
    <div className="card mb-base">
      <div className="card-body grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <span className="bg-light text-default-700 mb-3 inline-flex size-10 items-center justify-center rounded-lg">
            <Icon icon="lock" className="text-xl" aria-hidden="true" />
          </span>
          <h5 className="text-default-800 mb-1.5 text-md font-semibold">รายงานยอดเข้ากลุ่ม LINE ใช้ได้กับแพ็กเกจธุรกิจ</h5>
          <p className="text-default-700 mb-4 text-sm">
            สรุปยอดขายและจำนวนรายการของร้านคุณเข้ากลุ่ม LINE ของทีมทุกวันหรือทุกเดือน เลือกได้ว่ากลุ่มไหนเห็นร้านไหน
          </p>
          {cta ? (
            <Link href={cta.href} className="btn bg-primary hover:bg-primary-hover inline-flex w-full items-center justify-center text-white sm:w-auto">
              {cta.label}
            </Link>
          ) : (
            <p className="text-default-700 mb-0 text-sm">รายงานเข้ากลุ่ม LINE เป็นฟีเจอร์ของบัญชีธุรกิจ บัญชีนี้ยังไม่ได้เปิดใช้</p>
          )}
        </div>
        <SampleBubble now={now} />
      </div>
    </div>
  )
}
