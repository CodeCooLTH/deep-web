/**
 * WalletCard — balance card full-width + ปุ่มเปิด TopUpRequestModal
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersStatCard.tsx
 * (card > card-body > flex justify-between + value display + icon — โครง balance card ตรงกัน)
 *
 * Adaptations vs OrdersStatCard:
 * - single card (ไม่ใช่ grid ของ stat cards หลาย ๆ ตัว)
 * - value = ยอดเครดิต SMS (฿) แทน count stat
 * - icon row อยู่บน, label + badge row อยู่ล่าง → คง 2-row layout เดิมจาก OrdersStatCard
 * - เพิ่ม SMS estimate row ใต้ตัวเลข (แทน CountUp ใช้ toLocaleString ตรง ๆ — ไม่มี CountUp wrapper ใน deps)
 * - เพิ่ม low-balance chip (warning badge) เมื่อ balance > 0 && ≤ 10
 * - เพิ่ม hasError banner แทนการ silent ฿0 (financial trust — seller ต้องรู้เมื่อโหลดข้อมูลล้มเหลว)
 * - action button (ซื้อเครดิต SMS) + TopUpRequestModal state
 *
 * ทำไม 'use client': ปุ่ม "ซื้อเครดิต SMS" เปิด TopUpRequestModal ซึ่งใช้ React state
 * ถ้าทำ server component จะส่ง onClick ข้าม RSC boundary ไม่ได้
 * — แยก WalletCard ออกมาเป็น client ส่วนน้อย ให้ page.tsx เป็น RSC ต่อไปได้
 */
'use client'

import Icon from '@/components/wrappers/Icon'
import { useState } from 'react'
import TopUpRequestModal from './TopUpRequestModal'

type WalletCardProps = {
  balance: number
  lowBalance: boolean
  /** true เมื่อ service throw ขณะโหลด — แสดง error banner แทน balance ปลอม */
  hasError?: boolean
}

export default function WalletCard({ balance, lowBalance, hasError = false }: WalletCardProps) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="card">
        <div className="card-body">
          {/* ─── Error banner — โชว์เมื่อ service throw (financial trust) ───────── */}
          {hasError && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
            >
              <Icon icon="tabler-alert-triangle" className="size-5 shrink-0" aria-hidden="true" />
              <span>โหลดข้อมูลเครดิตไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง</span>
            </div>
          )}

          {/* ─── Row 1: value + icon (โครงจาก OrdersStatCard mb-5 flex justify-between) ─── */}
          <div className="mb-5 flex w-full items-center justify-between gap-3">
            <div>
              {/* balance number — ซ่อนเมื่อ hasError เพราะ ฿0 ที่แสดงจะเป็นค่าปลอม */}
              {hasError ? (
                <h3 className="text-xl font-bold text-default-400" aria-label="ไม่ทราบยอดเครดิต">
                  —
                </h3>
              ) : (
                <h3
                  className="text-xl font-bold text-dark"
                  aria-label={`ยอดเครดิต ${balance} บาท`}
                >
                  ฿{balance.toLocaleString('th-TH')}
                </h3>
              )}
              {/* SMS estimate — ซ่อนเมื่อ hasError */}
              {!hasError && (
                <p className="mt-0.5 text-sm text-default-400">
                  ≈ {balance.toLocaleString('th-TH')} SMS
                </p>
              )}
            </div>

            {/* icon circle — โครงตรงจาก OrdersStatCard (size-9 rounded-full flex items-center justify-center) */}
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/15">
              <Icon icon="tabler-message" className="size-5.5 text-primary" aria-hidden="true" />
            </div>
          </div>

          {/* ─── Row 2: label + action (โครงจาก OrdersStatCard flex items-center justify-between) ─── */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase text-default-500">
                ยอดเครดิต SMS
              </span>

              {/* Low-balance chip — แสดงเมื่อ balance > 0 && ≤ 10 (OQ-9)
                  ใช้ badge pattern เดียวกับ OrdersStatCard change badge */}
              {!hasError && lowBalance && (
                <span
                  role="status"
                  aria-live="polite"
                  className="badge bg-warning/15 text-warning inline-flex items-center gap-1"
                >
                  <Icon icon="tabler-alert-triangle" className="size-3.5 shrink-0" aria-hidden="true" />
                  เครดิตเหลือน้อย
                </span>
              )}
            </div>

            {/* action button — ซื้อเครดิต SMS */}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 text-sm"
            >
              <Icon icon="tabler-credit-card" className="size-4" aria-hidden="true" />
              ซื้อเครดิต SMS
            </button>
          </div>
        </div>
      </div>

      {/* TopUpRequestModal — open/close controlled ด้วย React state */}
      <TopUpRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          // หลัง submit สำเร็จ: ปิด modal เฉย ๆ (page refresh จะดึงข้อมูลใหม่)
          // router.refresh() ไม่ได้ทำที่นี่เพราะ TopUpRequest เป็น PENDING
          // — ยังไม่มี balance เปลี่ยน ไม่ต้อง refresh
          setModalOpen(false)
        }}
      />
    </>
  )
}
