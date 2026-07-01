/**
 * InventoryGate — pricing card gate สำหรับสถานะ NOT_SUBSCRIBED / LOCKED ของ Inventory Add-on
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx
 * (single pricing card: card > card-body p-7.5 text-center > title/subtitle/price/feature-tick ul > CTA area px-15 pt-3.75 pb-7.5)
 * + Base: src/app/(paces)/seller/(dashboard)/wallet/components/WalletCard.tsx:42-52
 * (error-banner block: role="alert" aria-live="assertive" + rounded-lg border-danger/20 bg-danger/10 + tabler-alert-triangle icon — ใช้สำหรับ LOCKED state)
 *
 * Adaptations vs pricing/page.tsx:
 * - 1 card เดี่ยว (mx-auto max-w-md) ไม่ใช่ grid 4 แผน — feature มีแผนเดียวคงที่ ฿199 (BR-INV-01)
 * - ตัด `!bg-primary` เต็มการ์ดแบบ popular-plan ทิ้ง — พื้นการ์ดขาวเสมอ, primary น้ำเงินอยู่ที่ CTA เท่านั้น
 * - ตัด `text-[40px]` arbitrary → แทนด้วย token `text-4xl` (ใช้จริงใน theme สำหรับตัวเลขใหญ่ เช่น CountdownTimer/dashboard finance)
 * - Adaptations vs WalletCard error-banner: ข้อความเปลี่ยนเป็น "ถูกล็อกเพราะเครดิตไม่พอ" + lockedAt (ถ้ามี);
 *   เพิ่ม note "ข้อมูลสต็อกเดิมยังอยู่ครบ" ใต้ feature list (design decision: สร้างความมั่นใจว่าไม่เสียข้อมูล)
 * - เป็น server component ล้วน (ไม่มี state ของตัวเอง) — embed SubscribeButton/ReactivateButton (client) ตาม status
 */

import Icon from '@/components/wrappers/Icon'
import SubscribeButton from './SubscribeButton'
import ReactivateButton from './ReactivateButton'

export interface InventoryGateProps {
  status: 'NOT_SUBSCRIBED' | 'LOCKED'
  /** วันเวลาที่ถูกล็อก — parent format มาแล้ว (formatDateTime), null ถ้าไม่มี */
  lockedAt: string | null
}

// feature list — คงที่ทั้ง 2 สถานะ (BR-INV-01: แผนเดียว flat ฿199)
const FEATURES = [
  'ตัดสต็อกอัตโนมัติทุกครั้งที่มี order ใหม่',
  'คืนสต็อกอัตโนมัติเมื่อยกเลิก',
  'ป้องกันขายเกินสต็อกที่มีจริง',
  'เก็บข้อมูลสต็อกไว้แม้ถูกล็อก',
]

export default function InventoryGate({ status, lockedAt }: InventoryGateProps) {
  return (
    <div className="card h-full rounded-md mx-auto max-w-md">
      <div className="card-body p-7.5 text-center">
        {/* ─── LOCKED banner — Base: WalletCard.tsx:42-52 error-banner block ───── */}
        {status === 'LOCKED' && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-start text-sm font-medium text-danger"
          >
            <Icon icon="tabler-alert-triangle" className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              ถูกล็อกเพราะเครดิตไม่พอ
              {lockedAt && (
                <>
                  <br />
                  ล็อกเมื่อ {lockedAt}
                </>
              )}
            </span>
          </div>
        )}

        <h3 className="mb-1.25 text-xl font-bold">Inventory Add-on</h3>
        <p className="text-default-400">จัดการสต็อกสินค้าอัตโนมัติ</p>

        <div className="my-7.5">
          <h1 className="text-4xl font-bold">฿199</h1>
          <small className="text-default-400 text-sm">/เดือน</small>
        </div>

        <ul className="space-y-2.5 text-start">
          {FEATURES.map((feature, i) => (
            <li className="flex items-center gap-3" key={i}>
              <Icon icon="check" className="text-success text-sm shrink-0" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>

        {status === 'LOCKED' && (
          <p className="mt-5 text-sm font-medium text-default-500">ข้อมูลสต็อกเดิมยังอยู่ครบ</p>
        )}
      </div>

      <div className="px-15 pt-3.75 pb-7.5">
        {status === 'NOT_SUBSCRIBED' ? <SubscribeButton /> : <ReactivateButton />}
      </div>
    </div>
  )
}
