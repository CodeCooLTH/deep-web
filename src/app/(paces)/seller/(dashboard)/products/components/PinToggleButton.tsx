'use client'

/**
 * PinToggleButton — ปุ่มปักหมุด/ยกเลิกปักหมุดสินค้า (feature 00013 Pin Products)
 *
 * Base: DeleteButton.tsx (ทั้งไฟล์ — per-row client fetch + loading state + pacesToast)
 *   + SubscribeButton.tsx (Swal.fire preConfirm buy-flow — ใช้ pattern เดียวกันตอนต้องซื้อ pin slot ฿99)
 *
 * Flow (ตาม safepay-ux design spec §Pin toggle logic):
 *   - ปักหมุดอยู่แล้ว (pinnedAt !== null) → POST .../unpin ตรง (ฟรีเสมอ ไม่มีเงื่อนไข slot)
 *   - ยังไม่ปักหมุด + มีสล็อตว่าง (pinnedCount < pinSlots) → POST .../pin ตรง
 *     ถ้าเจอ 409 NO_PIN_SLOT (สล็อตถูกใช้ไปแล้วโดย concurrent request/tab อื่น — race กับ
 *     pinnedCount ฝั่ง client ที่อาจ stale) → fallback เปิด Swal ซื้อสล็อต
 *   - ยังไม่ปักหมุด + สล็อตเต็มแล้ว (pinnedCount >= pinSlots) → เปิด Swal ซื้อสล็อตทันที (ไม่ลองยิง pin ก่อน)
 *   - isActive=false → disable ปุ่ม ไม่ผูก onClick เลย (กันกด error 400 PRODUCT_NOT_ACTIVE ตั้งแต่ต้น)
 */

import Icon from '@/components/wrappers/Icon'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'

export interface PinChangeResult {
  productId: string
  pinnedAt: string | null
  pinSlots: number
  pinnedCount: number
}

interface PinToggleButtonProps {
  productId: string
  pinnedAt: string | null
  isActive: boolean
  pinSlots: number
  pinnedCount: number
  onChange: (result: PinChangeResult) => void
  /** desktop = btn-sm ปกติ (คอลัมน์ตาราง); mobile = touch target 44px (mobileCard trailing action) */
  variant?: 'desktop' | 'mobile'
}

// map HTTP status ตอนซื้อสล็อต → ข้อความ validation ใน Swal dialog (แสดงผ่าน showValidationMessage — dialog ไม่ปิด)
function buySlotErrorMessage(status: number): string {
  switch (status) {
    case 402:
      return 'ยอดเงินไม่พอ — <a href="/wallet" class="underline">เติมเงินก่อนซื้อสล็อต</a>'
    case 403:
      return 'ร้านถูกล็อก ไม่สามารถทำรายการนี้ได้'
    case 400:
      return 'สินค้านี้ปิดใช้งานอยู่ ไม่สามารถปักหมุดได้'
    default:
      return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

export default function PinToggleButton({
  productId,
  pinnedAt,
  isActive,
  pinSlots,
  pinnedCount,
  onChange,
  variant = 'desktop',
}: PinToggleButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const isPinned = pinnedAt !== null

  const openBuySlotDialog = async () => {
    // Base: SubscribeButton.handleOpenDialog — confirm + fetch ใน flow เดียว, error ค้าง dialog ผ่าน showValidationMessage
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: 'ปักหมุดสินค้านี้?',
      html: `สล็อตปักหมุดของคุณเต็มแล้ว (${pinnedCount}/${pinSlots}) ต้องซื้อสล็อตเพิ่มถาวร ฿99 เพื่อปักหมุดสินค้านี้ (ชำระครั้งเดียว ไม่มีการคืนเงิน ไม่มีวันหมดอายุ)`,
      showCancelButton: true,
      confirmButtonText: 'ซื้อสล็อต ฿99',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      // preConfirm: ยิง POST ระหว่าง dialog ค้าง; ถ้า error → showValidationMessage (dialog ไม่ปิด)
      preConfirm: async () => {
        try {
          const res = await fetch('/api/seller/pin-slots/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId }),
          })
          if (res.ok) return res.json()
          Swal.showValidationMessage(buySlotErrorMessage(res.status))
          return false
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value) {
      onChange(result.value as PinChangeResult)
      pacesToast.success('ปักหมุดสินค้าแล้ว')
      router.refresh()
    }
  }

  const handleClick = async () => {
    if (!isActive || isLoading) return

    // ปักหมุดอยู่แล้ว → unpin ตรง (ฟรีเสมอ ไม่มีเงื่อนไข slot)
    if (isPinned) {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/seller/products/${productId}/unpin`, { method: 'POST' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          pacesToast.error(data?.error ?? 'ยกเลิกปักหมุดไม่สำเร็จ')
          return
        }
        onChange(data as PinChangeResult)
        pacesToast.success('ยกเลิกปักหมุดแล้ว')
        router.refresh()
      } catch {
        pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
      } finally {
        setIsLoading(false)
      }
      return
    }

    // สล็อตเต็มแล้ว (client state) → เปิด Swal ซื้อสล็อตทันที ไม่ต้องลองยิง pin ก่อน
    if (pinnedCount >= pinSlots) {
      await openBuySlotDialog()
      return
    }

    // มีสล็อตว่าง → pin ตรง
    setIsLoading(true)
    let needsBuyDialog = false
    try {
      const res = await fetch(`/api/seller/products/${productId}/pin`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409) {
          // fallback: สล็อตถูกใช้ไปแล้วโดย concurrent request อื่นก่อนที่ request นี้จะถึง server
          // ห้าม return ตรงนี้ — ต้องตกไปเปิด Swal ซื้อสล็อตหลัง finally (needsBuyDialog)
          needsBuyDialog = true
        } else {
          pacesToast.error(data?.error ?? 'ปักหมุดไม่สำเร็จ')
        }
      } else {
        onChange(data as PinChangeResult)
        pacesToast.success('ปักหมุดสินค้าแล้ว')
        router.refresh()
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setIsLoading(false)
    }
    if (needsBuyDialog) await openBuySlotDialog()
  }

  const pinnedClass = 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
  const unpinnedClass = 'border-default-300 text-default-800 hover:border-default-400'
  const sizeClass = variant === 'mobile' ? '!size-11 min-h-0' : ''

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isActive || isLoading}
      title={!isActive ? 'เปิดใช้งานสินค้าก่อนจึงปักหมุดได้' : isPinned ? 'ยกเลิกปักหมุด' : 'ปักหมุดสินค้า'}
      aria-label={isPinned ? 'ยกเลิกปักหมุด' : 'ปักหมุดสินค้า'}
      className={cn(
        'btn btn-icon btn-sm border',
        isPinned ? pinnedClass : unpinnedClass,
        !isActive && 'opacity-50 cursor-not-allowed',
        sizeClass,
      )}
    >
      {isLoading ? (
        <Icon icon="mdi:loading" className="text-base animate-spin" />
      ) : (
        <Icon icon={isPinned ? 'tabler:pin-filled' : 'tabler:pin'} className="text-base" />
      )}
    </button>
  )
}
