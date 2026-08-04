'use client'

/**
 * OrderDetailClient — client shell ของหน้ารายละเอียดคำสั่งซื้อ (seller), T11 wiring
 *
 * ทำไมต้องมี client wrapper: `onAction` ของ StatusHero/OrderActionBar ต้องเป็นฟังก์ชันจริง
 * (fetch/Swal/clipboard/modal state) — page.tsx เป็น RSC ส่งฟังก์ชันข้ามขอบเขต Server→Client
 * ไม่ได้ (ไม่ใช่ Server Action) จึงต้องมี component เดียวที่เป็นเจ้าของ handler ทั้งหมด แล้ว
 * ส่ง `children` (grid เนื้อหา — OrderFactsCard/OrderReviewCard/ShippingActivity) เข้ามาจาก
 * page.tsx ตรง ๆ เพื่อให้ subtree นั้นยัง render จาก RSC ได้เหมือนเดิม ไม่ลากเข้า client bundle
 * โดยไม่จำเป็น (pattern "server component ผ่าน children เข้า client component")
 *
 * actionSet (T5 contract): คำนวณครั้งเดียวที่นี่ (`getOrderActionSet`) ใช้กับ
 * `OrderActionBar variant="bottom"` ตรง ๆ — ส่วน StatusHero (T7) คำนวณชุดเดียวกันซ้ำภายในตัวเอง
 * จาก props ชุดเดียวกัน (status/fulfillmentMode/shipmentSource) เพราะ StatusHero.tsx ยังไม่มี
 * ช่องรับ `actionSet` จากภายนอก (ดู comment หัวไฟล์ StatusHero.tsx ที่อธิบายเหตุผลไว้แล้ว) —
 * เป็น pure function รับ input เดียวกัน ผลลัพธ์จึงเป็นชุดเดียวกันเป๊ะ ไม่ใช่การตัดสินใจคนละที่
 * (ถ้าจะให้ตรงตัวอักษร "เรียกครั้งเดียว" 100% ต้องแก้ StatusHero ให้รับ actionSet prop — รายงาน
 * ไว้ให้ Controller ตัดสินใจ ไม่ได้แก้ไฟล์ของ T7 เอง)
 *
 * onAction: ยกพฤติกรรมจริงจาก SendSmsButton.tsx / CopyLinkButton.tsx / CancelOrderButton.tsx /
 * OrderCopyLink.tsx เดิม (confirm text, endpoint, toast message เหมือนเดิมทุกตัวอักษร) —
 * ปุ่มเดิมเหล่านี้ไม่ได้ถูกลบ (ยังใช้อยู่ที่อื่น เช่น orders list) แค่ไม่ได้ mount เป็น <button>
 * ในหน้านี้อีกต่อไป (ปุ่มตอนนี้มาจาก OrderActionBar/getOrderActionSet แทน — ActionItem generic
 * ที่ไม่รู้จัก business logic ของแต่ละ key)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import type { OrderStatus } from '@/lib/order-display'
import type { ShipmentContextJson } from '@/lib/iship/context'
import OrderActionBar from '@/components/safepay/OrderActionBar'
import StatusHero from './StatusHero'
import ShipmentEntryModal from './ShipmentEntryModal'
import { getOrderActionSet } from './order-action-set'
import type { ShipmentSource } from './order-action-set'

// map HTTP status → validation message (HTML) — เหมือน smsErrorMessage() ใน SendSmsButton.tsx เป๊ะ
function smsErrorMessage(status: number): string {
  switch (status) {
    case 402:
      return 'ยอดเงินไม่พอ — <a href="/wallet" class="underline">เติมเงิน</a>'
    case 429:
      return 'ส่ง SMS บ่อยเกินไป กรุณารอสักครู่'
    case 422:
      return 'ยังไม่มีเบอร์ผู้ซื้อในคำสั่งซื้อนี้ — ส่ง SMS ไม่ได้ ให้คัดลอกลิงก์ส่งทางแชทแทน'
    default:
      return 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่'
  }
}

export interface OrderDetailClientProps {
  // ── StatusHero passthrough (T7 props) ──────────────────────────────────────
  publicToken: string
  shortCode: string | null
  status: string
  type: string
  createdAtISO: string
  fulfillmentMode: string
  isFromAuction: boolean
  totalAmount: number
  paymentMethod: string | null
  slipFileId: string | null
  shipmentSource: ShipmentSource

  // ── ShipmentEntryModal (T9) ──────────────────────────────────────────────
  ishipContext: ShipmentContextJson | null
  hasIshipShipment: boolean
  /** เลขพัสดุ/ขนส่งปัจจุบัน (MANUAL) — prefill ตอน mode='edit' + payload ของ copy-tracking */
  trackingNo: string | null
  provider: string | null

  /** ที่อยู่จัดส่งรวมเป็นบรรทัดเดียว (สำหรับ copy-address) — null = ไม่มีที่อยู่ให้คัดลอก */
  addressText: string | null

  /** grid เนื้อหา (OrderFactsCard/OrderReviewCard/ShippingActivity) — ส่งมาจาก page.tsx (RSC)
      ตรง ๆ ผ่าน children เพื่อให้ subtree นั้นยัง server-render ได้ ไม่ลากเข้า client bundle */
  children: React.ReactNode
}

export default function OrderDetailClient({
  publicToken,
  shortCode,
  status,
  type,
  createdAtISO,
  fulfillmentMode,
  isFromAuction,
  totalAmount,
  paymentMethod,
  slipFileId,
  shipmentSource,
  ishipContext,
  hasIshipShipment,
  trackingNo,
  provider,
  addressText,
  children,
}: OrderDetailClientProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')

  // T5 — ชุดเดียวสำหรับแถบล่าง <1024 (ดู comment หัวไฟล์: StatusHero คำนวณชุดเดียวกันซ้ำภายในตัวเอง)
  const actionSet = getOrderActionSet({
    status: status as OrderStatus,
    fulfillmentMode,
    shipmentSource,
  })

  // คัดลอกข้อความ/ลิงก์ — Base: CopyLinkButton.tsx handleCopy (fallback execCommand สำหรับ HTTP context)
  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    pacesToast.success(successMessage)
  }

  // Base: SendSmsButton.tsx handleOpenDialog — confirm+fetch ใน flow เดียว (Swal preConfirm),
  // error ค้าง dialog ผ่าน showValidationMessage. RC-8: ไม่ส่ง buyerContact ใด ๆ จาก client
  const handleSendSms = async () => {
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: 'ส่งลิงก์ทาง SMS?',
      text: 'ระบบจะส่งลิงก์คำสั่งซื้อทาง SMS ให้ผู้ซื้อ และหัก ฿1 จากกระเป๋าเงินของคุณ',
      showCancelButton: true,
      confirmButtonText: 'ส่ง SMS',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async () => {
        try {
          const res = await fetch(`/api/orders/${publicToken}/send-sms`, { method: 'POST' })
          if (res.ok) return true
          Swal.showValidationMessage(smsErrorMessage(res.status))
          return false
        } catch {
          Swal.showValidationMessage('ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่')
          return false
        }
      },
    })
    if (result.isConfirmed && result.value === true) {
      pacesToast.success('ส่ง SMS แล้ว ฿1 ถูกหักจากยอดเงิน')
    }
  }

  // Base: CancelOrderButton.tsx handleCancel — confirm → POST → toast → refresh
  // T14 (เพิ่ม): ของเดิมใช้ข้อความ "สินค้าจะถูกคืนเข้าสต็อก" ชุดเดียวทุกสถานะ — ไม่จริงเมื่อ
  // status==='SHIPPED' (ของออกจากร้านไปแล้ว จะคืนสต็อกไม่ได้จริง ๆ) แยกข้อความตามสถานะแทน
  const handleCancelOrder = async () => {
    const cancelDetail =
      status === 'SHIPPED'
        ? 'สินค้าถูกส่งออกไปแล้ว ระบบจะไม่คืนเข้าสต็อกอัตโนมัติ · ลิงก์ที่ส่งให้ผู้ซื้อจะใช้ไม่ได้ · ย้อนกลับไม่ได้'
        : 'สินค้าจะถูกคืนเข้าสต็อก · ลิงก์ที่ส่งให้ผู้ซื้อจะใช้ไม่ได้ · ย้อนกลับไม่ได้'
    const ok = await pacesConfirm.danger(
      'ยกเลิกคำสั่งซื้อนี้?',
      cancelDetail,
      { confirmButtonText: 'ยืนยันยกเลิก', cancelButtonText: 'ไม่ใช่ตอนนี้' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'ยกเลิกคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('ยกเลิกคำสั่งซื้อแล้ว')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ยกเลิกคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่'
      pacesToast.error(message)
    }
  }

  // ปุ่ม action ทั้งหมดของหน้านี้ (StatusHero inline/stuck + OrderActionBar variant="bottom") วิ่งเข้า
  // handler เดียวนี้ผ่าน key จาก order-action-set.ts — ดูตาราง key → พฤติกรรมในรายงาน T11
  const handleAction = (key: string) => {
    switch (key) {
      case 'send-sms':
        void handleSendSms()
        return
      case 'report-tracking':
        setModalMode('create')
        setModalOpen(true)
        return
      case 'edit-tracking':
        setModalMode('edit')
        setModalOpen(true)
        return
      case 'copy-link': {
        // Base: OrderCopyLink.tsx — shortCode (สั้น) ก่อน fallback publicToken
        const url = `${resolveBuyerBaseUrl()}/o/${shortCode || publicToken}`
        void copyText(url, 'คัดลอกลิงก์แล้ว')
        return
      }
      case 'copy-tracking':
        if (trackingNo) void copyText(trackingNo, 'คัดลอกเลขพัสดุแล้ว')
        return
      case 'copy-address':
        if (addressText) void copyText(addressText, 'คัดลอกที่อยู่จัดส่งแล้ว')
        return
      case 'edit-order':
        router.push(`/orders/${publicToken}/edit`)
        return
      case 'cancel-order':
        void handleCancelOrder()
        return
      default:
        return
    }
  }

  return (
    <>
      <StatusHero
        publicToken={publicToken}
        shortCode={shortCode}
        status={status}
        type={type}
        createdAtISO={createdAtISO}
        fulfillmentMode={fulfillmentMode}
        isFromAuction={isFromAuction}
        totalAmount={totalAmount}
        paymentMethod={paymentMethod}
        slipFileId={slipFileId}
        shipmentSource={shipmentSource}
        onAction={handleAction}
      />

      {/* grid เนื้อหา — ส่งมาจาก page.tsx (RSC) ผ่าน children, mt-base คั่นจากหัวหน้า (token เดิม) */}
      <div className="mt-base">{children}</div>

      {/* แถบล่างเป็น 2 แถวเมื่อมีทั้งปุ่มหลักและปุ่มรอง (สถานะ PENDING) จึงสูงกว่าที่
          `.seller-mobile-shell .page-content main` เว้นไว้ (5rem = เผื่อ SellerBottomNav 64px)
          — เติมช่องว่างเฉพาะกรณีนั้น ไม่ไปแก้ค่ากลางซึ่งใช้ร่วมกับทุกหน้า seller */}
      {actionSet.primary && actionSet.ghosts.length > 0 && (
        <div className="h-14 lg:hidden" aria-hidden="true" />
      )}

      {/* <1024 เท่านั้น (className ภายในมี lg:hidden) — CANCELLED คืน null เอง (design §3) */}
      <OrderActionBar variant="bottom" actionSet={actionSet} onAction={handleAction} />

      <ShipmentEntryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        // โมดัลไม่ router.refresh() เอง (ยกเว้น branch iShip ที่มีของตัวเองอยู่ก่อนแล้ว) — หน้าเป็นคนสั่ง
        onSuccess={() => router.refresh()}
        orderToken={publicToken}
        mode={modalMode}
        ishipContext={ishipContext}
        hasIshipShipment={hasIshipShipment}
        initialTrackingNo={trackingNo}
        initialProvider={provider}
      />
    </>
  )
}
