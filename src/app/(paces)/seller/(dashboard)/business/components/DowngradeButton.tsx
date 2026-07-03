'use client'

/**
 * DowngradeButton — ปุ่ม "ดาวน์เกรด" บนการ์ด tier ต่ำกว่าปัจจุบัน เมื่อ subscription ACTIVE (Design Spec §5b)
 *
 * Base: src/app/(paces)/seller/(dashboard)/inventory/components/SubscribeButton.tsx (Swal preConfirm+fetch flow)
 *   + theme/paces/Admin/TS/src/app/auth/split/sign-in/page.tsx (checkbox markup: `form-checkbox` class)
 *   + API.md §6 sequence diagram (Downgrade Preview + Confirm) — logic client เช็ค
 *     "จำนวน business ที่ active (ไม่ถูกล็อก) > โควตาใหม่" (ธุรกิจที่ locked อยู่แล้วไม่กินโควตา active
 *     จึงไม่นับ — กัน selection modal ค้าง disabled เมื่อ unlocked < max)
 *
 * 2 flow ตาม design spec:
 * - ไม่เกินโควตาใหม่ → confirm ธรรมดา → POST {tier, keepShopIds: []}
 * - เกินโควตาใหม่ → selection modal (checkbox html) เลือก keepShopIds ให้ครบ newTier.maxBusinesses เป๊ะ
 *   (ปุ่มยืนยัน disabled จนเลือกครบ ผ่าน didOpen listener ต่อ Swal.getConfirmButton()/getPopup())
 *   ธุรกิจที่ถูกล็อกอยู่แล้วแสดงในลิสต์แบบ disabled — เลือกเก็บไม่ได้ (มันไม่ได้ "active" อยู่แล้ว)
 */

import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { escapeHtml } from '@/lib/html-escape'
import type { BusinessPackageTier } from '@/lib/business-package'

export interface DowngradeBusinessItem {
  shopId: string
  shopName: string
  locked: boolean
}

export interface DowngradeButtonProps {
  tier: BusinessPackageTier
  tierLabel: string
  maxBusinesses: number | null
  /** ธุรกิจที่ owner เป็นเจ้าของทั้งหมด (kind=BUSINESS, deletedAt=null) รวมที่ถูกล็อกอยู่แล้ว */
  ownedBusinesses: DowngradeBusinessItem[]
}

function downgradeErrorMessage(status: number, code: string | undefined): string {
  if (status === 400 && code === 'KEEP_SELECTION_EXCEEDS_QUOTA') return 'เลือกธุรกิจเกินโควตาใหม่'
  if (status === 400 && code === 'INVALID_SHOP_SELECTION') return 'รายการที่เลือกไม่ถูกต้อง'
  if (status === 409 && code === 'SUBSCRIPTION_NOT_ACTIVE') return 'สถานะแพ็กเกจไม่พร้อมดาวน์เกรด'
  if (status === 409 && code === 'NOT_A_DOWNGRADE') return 'เลือก tier ที่ต่ำกว่าปัจจุบันเท่านั้น'
  return 'ดาวน์เกรดไม่สำเร็จ กรุณาลองใหม่'
}

async function submitDowngrade(
  tier: BusinessPackageTier,
  keepShopIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch('/api/business/downgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, keepShopIds }),
    })
    if (res.ok) return { ok: true }
    const body = await res.json().catch(() => ({}))
    return { ok: false, message: downgradeErrorMessage(res.status, body?.error) }
  } catch {
    return { ok: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }
  }
}

export default function DowngradeButton({ tier, tierLabel, maxBusinesses, ownedBusinesses }: DowngradeButtonProps) {
  const router = useRouter()

  const handleClick = async () => {
    // นับเฉพาะธุรกิจที่ยัง active (ไม่ถูกล็อก) — ธุรกิจที่ locked อยู่แล้วไม่กินโควตา active
    // (ถ้าใช้ totalOwned รวม locked จะเข้า selection modal ทั้งที่ unlocked < max → confirm ค้าง disabled ถาวร)
    const activeBusinesses = ownedBusinesses.filter((b) => !b.locked)
    const activeCount = activeBusinesses.length

    // ไม่เกินโควตาใหม่ (หรือ tier ใหม่ไม่จำกัด) → confirm ธรรมดา, keepShopIds ว่าง
    if (maxBusinesses === null || activeCount <= maxBusinesses) {
      const result = await Swal.fire({
        buttonsStyling: false,
        icon: 'question',
        title: `ดาวน์เกรดเป็น ${tierLabel}?`,
        text: 'ธุรกิจปัจจุบันของคุณทั้งหมดยังใช้งานได้ตามปกติ (ไม่มีเครดิตหักตอนนี้ — เริ่มมีผลรอบถัดไป)',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันดาวน์เกรด',
        cancelButtonText: 'ยกเลิก',
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !Swal.isLoading(),
        customClass: {
          confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
          cancelButton: 'btn bg-light hover:text-default-800 mt-2',
        },
        preConfirm: async () => {
          const r = await submitDowngrade(tier, [])
          if (!r.ok) {
            Swal.showValidationMessage(r.message)
            return false
          }
          return true
        },
      })
      if (result.isConfirmed && result.value === true) {
        pacesToast.success(`ดาวน์เกรดเป็น ${tierLabel} สำเร็จ`)
        router.refresh()
      }
      return
    }

    // เกินโควตาใหม่ → selection modal เลือก keepShopIds ให้ครบ maxBusinesses เป๊ะ
    const max = maxBusinesses
    const listHtml = ownedBusinesses
      .map((b) => {
        const name = escapeHtml(b.shopName)
        if (b.locked) {
          return `<label class="flex items-center gap-2.5 py-1.5 opacity-50">
            <input type="checkbox" class="form-checkbox" disabled />
            <span>${name} <span class="badge bg-danger/15 text-danger ms-1">ถูกล็อกอยู่แล้ว</span></span>
          </label>`
        }
        return `<label class="flex items-center gap-2.5 py-1.5">
          <input type="checkbox" class="form-checkbox downgrade-keep-checkbox" value="${b.shopId}" />
          <span>${name}</span>
        </label>`
      })
      .join('')

    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'warning',
      title: `เลือกธุรกิจที่จะเก็บไว้ (สูงสุด ${max} จาก ${activeCount})`,
      html: `<div class="text-start">${listHtml}</div>`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันดาวน์เกรด',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      // didOpen: ผูก confirm button ให้ disabled จนเลือกครบ max เป๊ะ (Design Spec §5b)
      didOpen: () => {
        const confirmBtn = Swal.getConfirmButton()
        confirmBtn?.setAttribute('disabled', 'true')
        const checkboxes = Swal.getPopup()?.querySelectorAll<HTMLInputElement>('.downgrade-keep-checkbox')
        const updateState = () => {
          const checkedCount =
            Swal.getPopup()?.querySelectorAll<HTMLInputElement>('.downgrade-keep-checkbox:checked').length ?? 0
          if (checkedCount === max) confirmBtn?.removeAttribute('disabled')
          else confirmBtn?.setAttribute('disabled', 'true')
        }
        checkboxes?.forEach((cb) => cb.addEventListener('change', updateState))
      },
      preConfirm: async () => {
        const checked = Swal.getPopup()?.querySelectorAll<HTMLInputElement>('.downgrade-keep-checkbox:checked')
        const keepShopIds = checked ? Array.from(checked).map((el) => el.value) : []
        if (keepShopIds.length !== max) {
          Swal.showValidationMessage(`ต้องเลือกให้ครบ ${max} ธุรกิจ`)
          return false
        }
        const r = await submitDowngrade(tier, keepShopIds)
        if (!r.ok) {
          Swal.showValidationMessage(r.message)
          return false
        }
        return true
      },
    })

    if (result.isConfirmed && result.value === true) {
      pacesToast.success(`ดาวน์เกรดเป็น ${tierLabel} สำเร็จ`)
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`ดาวน์เกรดเป็น ${tierLabel}`}
      className="btn bg-light text-default-700 hover:bg-default-100 w-full inline-flex items-center justify-center gap-1.5"
    >
      <Icon icon="chevron-down" className="text-base" aria-hidden="true" />
      ดาวน์เกรด
    </button>
  )
}
