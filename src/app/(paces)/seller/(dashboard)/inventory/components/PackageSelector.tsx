'use client'

/**
 * PackageSelector — เลือกแพ็กเกจ Deep Stock (BASIC ฿199 / PRO ฿599) สำหรับ subscribe/reactivate ครั้งแรก
 * (feat 00009 S-15, FR-DSP-03/07)
 *
 * Base:
 *   - grid การ์ด: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx
 *     (card > card-body p-7.5 text-center > title/subtitle/price(text-4xl)/feature-tick ul)
 *   - Sweet Alerts confirm-fetch flow: src/app/(paces)/seller/(dashboard)/inventory/components/SubscribeButton.tsx
 *     + ReactivateButton.tsx (ทั้ง handleOpenDialog — preConfirm fetch + showValidationMessage error + router.refresh())
 *   - LOCKED banner markup + FEATURES เดิม: src/app/(paces)/seller/(dashboard)/inventory/components/InventoryGate.tsx:41-58
 *   - selected tint: notifications/components/NotificationTimeline.tsx:156 (unread row = bg-primary/5)
 *   - badge ริบบิ้นมุมการ์ด: theme .../ecommerce/(products)/products-grid/components/ProductCard.tsx
 *     ("badge badge-label ... absolute start-0 top-0 m-5" ปรับสี/ตำแหน่งเป็น "แนะนำ")
 *
 * Adaptations vs pricing/page.tsx (HR7 — คง .card/badge/token, ไม่มี arbitrary value):
 *   - grid ลดจาก 4 col → 2 col (grid-cols-1 md:grid-cols-2 gap-base) เพราะมี 2 แพ็กเกจ ไม่ใช่ 4 แผน
 *   - ตัด `text-[40px]` arbitrary → ใช้ text-4xl token (เหมือน InventoryGate.tsx เดิมทำไว้แล้ว)
 *   - ตัด `!bg-primary` เต็มการ์ดแบบ popular-plan ทิ้ง (spec S-15: พื้นการ์ดขาวเสมอ) — ใช้ selected state
 *     (border-2 border-primary + bg-primary/5) แทนการไฮไลต์แผนแนะนำ
 *   - การ์ด theme เดิม static (แค่ display) → ปรับเป็น clickable (role="button" + onClick/onKeyDown) เพื่อ selection
 *   - CTA จาก "ต่อการ์ด" (theme, Link ไปหน้าอื่น) → "เดียวรวมท้าย" ตาม spec S-15 (disabled จนกว่าจะเลือก)
 *
 * ⚠️ Icon note (spec เตือน): InventoryGate.tsx เดิมใช้ icon="tabler-alert-triangle" (prefix ซ้อน ผิด เพราะ
 * Icon wrapper prepend "tabler:" ให้เองแล้ว) — ไฟล์นี้แก้เป็น icon="alert-triangle" (ตรงกับที่ใช้ทั่วโปรเจกต์
 * เช่น SellerErrorState.tsx, AuctionForm.tsx, OnboardingModal.tsx ฯลฯ)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import { PACKAGE_PRICE, PACKAGE_LABEL_TH, type InventoryPackage } from '@/lib/inventory-addon'

export interface PackageSelectorProps {
  mode: 'subscribe' | 'reactivate'
  /** วันเวลาที่ถูกล็อก — parent format มาแล้ว (formatDateTime); ใช้เฉพาะ mode='reactivate', null ถ้าไม่มี */
  lockedAt?: string | null
}

// BASIC feature list — Base: InventoryGate.tsx FEATURES const เดิม (4 ข้อ) + เพิ่ม "ปรับสต็อกเอง" ตาม UX spec S-15
// (TFR-DSP-01 / Design Decision #2: Manual Adjustment ใช้ได้ทั้ง BASIC/PRO — ห้ามเอาไปเป็นจุดขาย Pro)
const BASIC_FEATURES = [
  'ตัดสต็อกอัตโนมัติทุกครั้งที่มี order ใหม่',
  'คืนสต็อกอัตโนมัติเมื่อยกเลิก',
  'ป้องกันขายเกินสต็อกที่มีจริง',
  'ปรับสต็อกเอง',
  'เก็บข้อมูลสต็อกไว้แม้ถูกล็อก',
]

// Pro-exclusive จริง 4 รายการ (UX spec ข้อ 9: Low-stock Alert / Movement History / CSV / lowStockThreshold เท่านั้น)
const PRO_EXCLUSIVE_FEATURES = [
  'แจ้งเตือนสต็อกใกล้หมด',
  'ประวัติการเคลื่อนไหว',
  'นำเข้า-ส่งออก CSV',
  'ตั้งเกณฑ์แจ้งเตือนต่อสินค้า',
]

// endpoint + copy ต่อ mode (subscribe vs reactivate) — ตาม API.md §4.1/§4.3
const MODE_CONFIG = {
  subscribe: {
    endpoint: '/api/inventory/subscribe',
    ctaVerb: 'สมัครแพ็กเกจนี้',
    confirmTitle: (label: string) => `สมัคร ${label}?`,
    confirmText: (price: number) => `ระบบจะหักเครดิต ฿${price} จากกระเป๋าเงินของคุณทันที และเริ่มรอบใช้งาน 30 วัน`,
    confirmButtonText: (price: number) => `สมัคร ฿${price}`,
    successToast: (label: string) => `สมัคร ${label} สำเร็จ`,
    insufficientCreditLink: 'เติมเครดิตก่อนสมัคร',
    conflictMessage: 'สมัครใช้งานอยู่แล้ว',
  },
  reactivate: {
    endpoint: '/api/inventory/reactivate',
    ctaVerb: 'เปิดใช้งานอีกครั้ง',
    confirmTitle: (label: string) => `เปิดใช้งานอีกครั้ง (${label})?`,
    confirmText: (price: number) => `ระบบจะหักเครดิต ฿${price} และเปิดใช้งานทันที ข้อมูลสต็อกเดิมของคุณยังอยู่ครบ`,
    confirmButtonText: (price: number) => `เปิดใช้งาน ฿${price}`,
    successToast: (label: string) => `เปิดใช้งาน ${label} อีกครั้งสำเร็จ`,
    insufficientCreditLink: 'เติมเครดิตก่อนเปิดใช้อีกครั้ง',
    conflictMessage: 'บัญชีนี้ไม่ได้ถูกล็อก',
  },
} as const

// map HTTP status → validation message — Base: SubscribeButton.tsx/ReactivateButton.tsx (subscribeErrorMessage/reactivateErrorMessage รวมเป็นฟังก์ชันเดียว mode-aware)
function errorMessage(mode: 'subscribe' | 'reactivate', status: number): string {
  const cfg = MODE_CONFIG[mode]
  switch (status) {
    case 402:
      return `เครดิตไม่พอ — <a href="/wallet" class="underline">${cfg.insufficientCreditLink}</a>`
    case 409:
      return cfg.conflictMessage
    default:
      return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

export default function PackageSelector({ mode, lockedAt = null }: PackageSelectorProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<InventoryPackage | null>(null)
  const cfg = MODE_CONFIG[mode]

  const handleConfirm = async () => {
    if (!selected) return
    const label = PACKAGE_LABEL_TH[selected]
    const price = PACKAGE_PRICE[selected]

    // Base: SubscribeButton.tsx/ReactivateButton.tsx handleOpenDialog ทั้งฟังก์ชัน
    // (Swal.fire preConfirm+showLoaderOnConfirm+allowOutsideClick — confirm+fetch flow เดียว, error ค้าง dialog)
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: cfg.confirmTitle(label),
      text: cfg.confirmText(price),
      showCancelButton: true,
      confirmButtonText: cfg.confirmButtonText(price),
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      // preConfirm: ยิง POST พร้อม { package } ระหว่าง dialog ค้าง; error → showValidationMessage (dialog ไม่ปิด)
      preConfirm: async () => {
        try {
          const res = await fetch(cfg.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ package: selected }),
          })
          if (res.ok) return true
          Swal.showValidationMessage(errorMessage(mode, res.status))
          return false
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value === true) {
      pacesToast.success(cfg.successToast(label))
      router.refresh()
    }
  }

  return (
    <div>
      {/* LOCKED banner — Base: InventoryGate.tsx:41-58 (origin: WalletCard.tsx:42-52 error-banner block) */}
      {mode === 'reactivate' && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-start text-sm font-medium text-danger"
        >
          <Icon icon="alert-triangle" className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
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

      <h3 className="mb-4 text-center text-xl font-bold">เลือกแพ็กเกจที่ใช่สำหรับร้านคุณ</h3>

      <div className="grid grid-cols-1 gap-base md:grid-cols-2">
        <PackageCard
          pkg="BASIC"
          selected={selected === 'BASIC'}
          onSelect={() => setSelected('BASIC')}
          features={BASIC_FEATURES}
        />
        <PackageCard
          pkg="PRO"
          selected={selected === 'PRO'}
          onSelect={() => setSelected('PRO')}
          features={PRO_EXCLUSIVE_FEATURES}
          isPro
        />
      </div>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected}
          aria-label={cfg.ctaVerb}
          className="btn inline-flex w-full items-center justify-center gap-1.5 bg-primary text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-10"
        >
          {selected ? `${cfg.ctaVerb} ฿${PACKAGE_PRICE[selected]}` : cfg.ctaVerb}
        </button>
      </div>

      {mode === 'reactivate' && (
        <p className="mt-4 text-center text-sm font-medium text-default-500">ข้อมูลสต็อกเดิมยังอยู่ครบ</p>
      )}
    </div>
  )
}

// การ์ดเดี่ยว (BASIC/PRO) — Base: pricing/page.tsx card markup; ปรับเป็น clickable (theme เดิม static display เฉย ๆ)
function PackageCard({
  pkg,
  selected,
  onSelect,
  features,
  isPro = false,
}: {
  pkg: InventoryPackage
  selected: boolean
  onSelect: () => void
  features: string[]
  isPro?: boolean
}) {
  const price = PACKAGE_PRICE[pkg]
  const label = PACKAGE_LABEL_TH[pkg]

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'card relative h-full cursor-pointer rounded-md transition-colors',
        // selected tint — Base: NotificationTimeline.tsx:156 (bg-primary/5) + border-2 border-primary (spec S-15)
        // พื้นการ์ดขาวเสมอ — ห้าม !bg-primary เต็มการ์ดแบบ theme popular-plan (Design Decision #26)
        selected ? 'border-2 border-primary bg-primary/5' : 'border border-default-200',
      )}
    >
      {/* badge "แนะนำ" — Base: theme ProductCard.tsx ("badge badge-label ... absolute start-0 top-0 m-5") ปรับตำแหน่ง/สี */}
      {isPro && <span className="badge badge-label absolute end-0 top-0 m-4 bg-primary text-2xs text-white">แนะนำ</span>}

      <div className="card-body p-7.5 text-center">
        {/* selected indicator — spec S-15: icon circle-check เมื่อเลือก */}
        {selected && <Icon icon="circle-check" className="mb-2 text-2xl text-primary" aria-hidden="true" />}

        <h3 className="mb-1.25 text-xl font-bold">{label}</h3>
        <p className="text-default-400">{isPro ? 'ทุกความสามารถ + เครื่องมือขั้นสูง' : 'จัดการสต็อกสินค้าอัตโนมัติ'}</p>

        <div className="my-7.5">
          <h1 className="text-4xl font-bold">฿{price}</h1>
          <small className="text-default-400 text-sm">/เดือน</small>
        </div>

        <ul className="space-y-2.5 text-start">
          {isPro && (
            <li className="flex items-center gap-3 font-semibold">
              <Icon icon="check" className="shrink-0 text-sm text-success" aria-hidden="true" />
              ทุกอย่างใน Deep Stock
            </li>
          )}
          {features.map((feature) => (
            <li className="flex items-center gap-3" key={feature}>
              <Icon icon="check" className="shrink-0 text-sm text-success" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
