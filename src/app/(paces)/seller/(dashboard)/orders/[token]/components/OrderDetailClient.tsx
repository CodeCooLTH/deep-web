'use client'

/**
 * OrderDetailClient — client shell ของหน้ารายละเอียดคำสั่งซื้อ (seller), T11 wiring
 *
 * ทำไมต้องมี client wrapper: `onAction` ของ StatusHero/OrderActionBar ต้องเป็นฟังก์ชันจริง
 * (fetch/Swal/clipboard/modal state) — page.tsx เป็น RSC ส่งฟังก์ชันข้ามขอบเขต Server→Client
 * ไม่ได้ (ไม่ใช่ Server Action) จึงต้องมี component เดียวที่เป็นเจ้าของ handler ทั้งหมด แล้ว
 * ส่ง `children` (grid เนื้อหา — OrderFactsCard/OrderReviewCard) เข้ามาจาก
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
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import type { OrderStatus } from '@/lib/order-display'
import type { OrderVocab } from '@/lib/seller-menu'
import type { ShipmentContextJson } from '@/lib/iship/context'
import OrderActionBar from '@/components/safepay/OrderActionBar'
import dynamic from 'next/dynamic'
import StatusHero from './StatusHero'
import OrderProgressStepper from './OrderProgressStepper'
import { getOrderActionSet } from './order-action-set'
import type { ShipmentSource } from './order-action-set'

/**
 * โมดัลแจ้งเลขพัสดุ = โค้ดก้อนใหญ่ที่สุดของหน้านี้ (ฟอร์ม iShip + แผงเลือกพัสดุ + หน้าสถานะ +
 * แผงค้นที่อยู่ + react-select) แต่มันเริ่มต้นด้วยสถานะ "ปิด" เสมอ — Impeccable optimize
 * 2026-08-04 วัดจาก build จริงว่าทั้งทรีนี้เดินทางมากับ first-load ของทุกครั้งที่เปิดหน้า
 * ทั้งที่ร้านจะกดเปิดมันหรือไม่ก็ได้
 *
 * ssr:false ปลอดภัยเพราะเป็นโมดัลที่เปิดจากการกดปุ่มเท่านั้น ไม่มีอะไรใน first paint
 * และต้อง render แบบมีเงื่อนไข (ไม่ใช่ปล่อยให้ตัวมันคืน null เอง) ไม่งั้น chunk จะถูกโหลด
 * ทันทีที่ component เข้า tree ซึ่งเท่ากับไม่ได้แยกอะไรเลย
 */
const ShipmentEntryModal = dynamic(() => import('./ShipmentEntryModal'), { ssr: false })

// map HTTP status → validation message (HTML) — เหมือน smsErrorMessage() ใน SendSmsButton.tsx เป๊ะ
function smsErrorMessage(status: number, orderNoun: string): string {
  switch (status) {
    case 402:
      return 'ยอดเงินไม่พอ — <a href="/wallet" class="underline">เติมเงิน</a>'
    case 429:
      return 'ส่ง SMS บ่อยเกินไป กรุณารอสักครู่'
    case 422:
      return `ยังไม่มีเบอร์ลูกค้าใน${orderNoun}นี้ — ส่ง SMS ไม่ได้ ให้คัดลอกลิงก์ส่งทางแชทแทน`
    default:
      return 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่'
  }
}

export interface OrderDetailClientProps {
  /** คลังคำผันตามประเภทกิจการ (feature 00030) — คำนวณที่ RSC ที่รู้จัก shop.vertical */
  vocab: OrderVocab
  /**
   * ออเดอร์นี้เคยตัดสต็อกจริงไหม (มี OrderItem.stockDeducted != null อย่างน้อย 1 รายการ)
   * ใช้ตัดสินว่ากล่องยืนยันยกเลิกพูดเรื่องคืนสต็อกได้หรือไม่ — ห้าม derive จาก vertical
   */
  hasDeductedStock: boolean
  // ── StatusHero passthrough (T7 props) ──────────────────────────────────────
  publicToken: string
  shortCode: string | null
  status: string
  type: string
  createdAtISO: string
  fulfillmentMode: string
  isFromAuction: boolean
  /** ช่องทางการขายของออเดอร์ — ส่งต่อให้ StatusHero โชว์โลโก้แบรนด์ในแถวหัว */
  salesChannel: string | null
  /** ชื่อผู้ซื้อที่ resolve แล้วฝั่ง server — ส่งต่อให้ StatusHero ตรง ๆ */
  buyerLabel: string
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

  // ── OrderProgressStepper (แถบสถานะเต็มความกว้างใต้หัวการ์ด) ───────────────
  /** เวลาที่ออเดอร์ถูกแตะล่าสุด — ใช้เป็นเวลาของขั้นที่ตรงกับสถานะปัจจุบัน */
  updatedAtISO: string
  /**
   * สถานะฝั่งขนส่ง iShip ('delivered' | 'picked_up' | ...) — null = ไม่มีพัสดุ iShip
   * มีผลเฉพาะออเดอร์ COD: ส่งถึงมือผู้ซื้อแล้ว = ขนส่งเก็บเงินให้แล้ว แม้ผู้ซื้อยังไม่กดยืนยันรับของ
   */
  carrierStatus: string | null
  /** ออเดอร์เก็บเงินปลายทางที่ร้านยังไม่ได้กดว่าได้เงิน → มีปุ่ม "ได้รับเงินปลายทางแล้ว" */
  isCodUnpaid: boolean

  /** grid เนื้อหา (OrderFactsCard/OrderReviewCard) — ส่งมาจาก page.tsx (RSC)
      ตรง ๆ ผ่าน children เพื่อให้ subtree นั้นยัง server-render ได้ ไม่ลากเข้า client bundle */
  children: React.ReactNode
}

export default function OrderDetailClient({
  vocab,
  hasDeductedStock,
  publicToken,
  shortCode,
  status,
  type,
  createdAtISO,
  fulfillmentMode,
  isFromAuction,
  salesChannel,
  buyerLabel,
  totalAmount,
  paymentMethod,
  slipFileId,
  shipmentSource,
  ishipContext,
  hasIshipShipment,
  trackingNo,
  provider,
  addressText,
  updatedAtISO,
  carrierStatus,
  isCodUnpaid,
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
    orderNoun: vocab.noun,
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
    // โหลดตรงนี้แทน import บนหัวไฟล์ — ปุ่มนี้อยู่ใน ⋮ ผู้ใช้ส่วนใหญ่ไม่ได้กดทุกครั้งที่เปิดหน้า
    const Swal = (await import('sweetalert2')).default
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: 'ส่งลิงก์ทาง SMS?',
      text: `ระบบจะส่งลิงก์${vocab.noun}ทาง SMS ให้ลูกค้า และหัก ฿1 จากกระเป๋าเงินของคุณ`,
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
          Swal.showValidationMessage(smsErrorMessage(res.status, vocab.noun))
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
    /**
     * 00030 D-1 — ข้อความต้องตรงกับสิ่งที่ระบบทำจริง
     *
     * เดิมแยกด้วย `status === 'SHIPPED'` แล้วบอกว่า "ระบบจะไม่คืนเข้าสต็อกอัตโนมัติ" ซึ่งเป็นเท็จ:
     * `cancelOrder` (order.service.ts) เรียก `restockFromCancelledOrder` **โดยไม่ดูสถานะเลย** และ
     * ตัวมันเองกรองด้วย `stockDeducted != null` อย่างเดียว (inventory-stock.service.ts) — ออเดอร์
     * ที่ส่งไปแล้วแต่เคยตัดสต็อกจึงถูกคืนสต็อกจริง ตรงข้ามกับที่ข้อความบอก
     *
     * เงื่อนไขที่ถูกคือ hasDeductedStock ตัวเดียว ไม่เกี่ยวกับ status
     * (ว่าการคืนสต็อกให้ออเดอร์ที่ส่งของออกไปแล้ว *ควร* เกิดขึ้นไหม เป็นคำถามเชิงธุรกิจคนละเรื่อง
     *  — ยังไม่แก้ในรอบนี้ บันทึกไว้เป็นหนี้)
     */
    const linkClause = 'ลิงก์ที่ส่งให้ลูกค้าจะใช้ไม่ได้ · ย้อนกลับไม่ได้'
    const cancelDetail = hasDeductedStock
      ? `สินค้าจะถูกคืนเข้าสต็อก · ${linkClause}`
      : linkClause
    const ok = await pacesConfirm.danger(
      `ยกเลิก${vocab.noun}นี้?`,
      cancelDetail,
      { confirmButtonText: 'ยืนยันยกเลิก', cancelButtonText: 'ไม่ใช่ตอนนี้' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || `ยกเลิก${vocab.noun}ไม่สำเร็จ กรุณาลองใหม่`)
      }
      pacesToast.success(`ยกเลิก${vocab.noun}แล้ว`)
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `ยกเลิก${vocab.noun}ไม่สำเร็จ กรุณาลองใหม่`
      pacesToast.error(message)
    }
  }

  /**
   * ยืนยันก่อนกด เพราะมันคือการบันทึกข้อเท็จจริงทางการเงิน — กดพลาดแล้วใบนั้นจะหลุดออกจาก
   * กอง "รอเงิน COD" ไปเงียบ ๆ ทั้งที่ยังไม่ได้เงิน ซึ่งเป็นความผิดพลาดที่ตามเก็บยากที่สุด
   * (ย้อนได้ผ่าน DELETE ของ endpoint เดียวกัน แต่ต้องรู้ตัวก่อนว่ากดผิด)
   */
  const handleCodReceived = async () => {
    const ok = await pacesConfirm.question(
      'ยืนยันว่าได้รับเงินปลายทางแล้ว?',
      'ระบบจะบันทึกว่าร้านได้รับเงินของคำสั่งซื้อนี้แล้ว และใบนี้จะออกจากกอง "รอเงิน COD" บนหน้าแรก',
      { confirmButtonText: 'ได้รับเงินแล้ว', cancelButtonText: 'ยังไม่ได้รับ' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${publicToken}/cod-received`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('บันทึกแล้วว่าได้รับเงินปลายทาง')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
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
      case 'cod-received':
        void handleCodReceived()
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
        orderNoun={vocab.noun}
        publicToken={publicToken}
        shortCode={shortCode}
        status={status}
        type={type}
        createdAtISO={createdAtISO}
        fulfillmentMode={fulfillmentMode}
        isFromAuction={isFromAuction}
        salesChannel={salesChannel}
        buyerLabel={buyerLabel}
        totalAmount={totalAmount}
        paymentMethod={paymentMethod}
        slipFileId={slipFileId}
        shipmentSource={shipmentSource}
        onAction={handleAction}
      />

      {/* แถบสถานะเต็มความกว้าง คั่นระหว่างหัวการ์ดกับเนื้อหา (user 2026-08-04) — ตอบคำถาม
          "ตอนนี้ไปถึงไหนแล้ว" ในบรรทัดเดียว โดยลำดับขั้นแตกตาม COD/โอนเงิน (src/lib/order-progress.ts)
          ไม่ผ่าน children เพราะ derive จาก props ที่ client shell ถืออยู่แล้วทั้งหมด ไม่ต้องข้าม
          server boundary และไม่มี PII เพิ่ม (status/fulfillmentMode/paymentMethod/ยอดเงิน) */}
      <div className="mt-base">
        <OrderProgressStepper
          status={status}
          fulfillmentMode={fulfillmentMode}
          paymentMethod={paymentMethod}
          slipFileId={slipFileId}
          totalAmount={totalAmount}
          carrierStatus={carrierStatus}
          createdAtISO={createdAtISO}
          updatedAtISO={updatedAtISO}
        />
      </div>

      {/* grid เนื้อหา — ส่งมาจาก page.tsx (RSC) ผ่าน children, mt-base คั่นจากหัวหน้า (token เดิม) */}
      <div className="mt-base">{children}</div>

      {/* <1024 เท่านั้น (className ภายในมี lg:hidden) — CANCELLED คืน null เอง (design §3) */}
      <OrderActionBar variant="bottom" actionSet={actionSet} onAction={handleAction} />

      {/* mount เฉพาะตอนเปิด — ถ้าปล่อยไว้ใน tree ตลอดแล้วให้ตัวมันคืน null เอง
          chunk ที่แยกออกไปจะถูกโหลดทันทีที่หน้า mount = ไม่ได้แยกอะไรเลย */}
      {modalOpen && (
        <ShipmentEntryModal
          open
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
      )}
    </>
  )
}
