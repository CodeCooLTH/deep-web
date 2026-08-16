'use client'

/**
 * OrderProgressBar — แถบสถานะออเดอร์ใต้หัวเธรด (งาน Order Progress 2026-08-05)
 *
 * มือถือ/แท็บเล็ต (<1280px) เท่านั้น — จอ ≥1280px (xl) มี CustomerPanel persistent ที่เห็น
 * การ์ดออเดอร์พร้อม timeline อยู่แล้ว แถบนี้จะซ้ำ (breakpoint ต้องตรงกับ `xl:block` ของ
 * CustomerPanel ใน page.tsx เสมอ — เคยมีบทเรียน iPad Pro 1024-1279 ตกหล่นทั้งสองทาง)
 *
 * ยุบเป็นค่าตั้งต้นเสมอ ไม่จำสถานะกาง (เหมือน ThreadStatusBar): แถบนี้เป็นทางลัดดูสถานะ
 * ไม่ใช่ alert — โทน primary ไม่ใช่ warning/danger
 *
 * Base: ./ThreadStatusBar.tsx (โครงยุบ/กาง + truncate + badge +N + ปุ่มย่อ)
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { completionWarning, computeOrderMoneyFromSerialized } from '@/lib/order-payment'
import { chatMoneySummary, chatOrderActions } from '@/lib/chat-order-actions'
import { ARRIVAL_MODE_META, resolveArrivalMode } from '@/lib/arrival-mode'
import RecordPaymentSheet from '../../../_components/RecordPaymentSheet'
import StartWalkInSheet from '../../../_components/StartWalkInSheet'
import { markServedFlow } from '../../../_components/mark-served'
import { formatDateTime } from '@/lib/format-date'
import { courierLogoUrl } from '@/lib/iship/courier'
import { SHIPPING_STAGE_LABEL } from '@/lib/order-stage'
import { filterActiveOrders, orderShippingStage, STAGE_CHIP_CLS } from '@/lib/chat-order-progress'
import {
  filterActiveServiceOrders,
  serviceProgressStage,
  SERVICE_STAGE_CHIP_META,
} from '@/lib/chat-service-progress'
import { appointmentRangeText } from '@/lib/appointment-summary'
import AppointmentSummarySheet from '../../../_components/AppointmentSummarySheet'
import ShipmentStepper from '../../../_components/ShipmentStepper'
import { useDraftOrders } from '../../../_components/DraftOrderProvider'
import type { CustomerPanelOrder } from './CustomerPanel'
import type { ShopVertical } from '@/lib/lodging'

/**
 * 🛑 สูตร "ช่วงเวลานัดเป็นข้อความ" ย้ายไป `@/lib/appointment-summary::appointmentRangeText`
 * แล้ว (2026-08-11) เพราะการ์ดสรุปนัดที่ส่งเข้าแชทต้องใช้คำชุดเดียวกันเป๊ะ — เลขเดียวกันที่ถูก
 * เรียกคนละแบบในสองหน้าจอไม่มี tsc/build ตัวไหนฟ้อง เพราะทั้งคู่ "ถูก" ในตัวเอง (HR16)
 * มีเทส [blocker] ตรึงไว้ว่าสองที่ต้องคืนสตริงเดียวกัน — ห้ามก็อปสูตรกลับมาไว้ที่นี่
 */

/** เลขที่แสดงของออเดอร์ — module scope เพื่อให้ทั้ง component และ `orderProgressChip` ใช้ตัวเดียวกัน */
const displayNo = (o: CustomerPanelOrder) => o.orderNo || o.token.slice(0, 8).toUpperCase()

/**
 * สรุปสำหรับ "ชิป" ใน ThreadChipStrip — คืน null เมื่อไม่มีออเดอร์ที่ยังไม่จบงาน
 *
 * 🛑 อยู่ไฟล์เดียวกับแถบโดยตั้งใจ (HR16): ก่อนหน้านี้คำบนบรรทัดยุบถูกประกอบในตัว component
 * ถ้าปล่อยให้ผู้เรียกประกอบคำเอง จะกลายเป็นสองที่ที่ตอบคำถามเดียวกัน ("ออเดอร์นี้ถึงขั้นไหน")
 * แล้วเพี้ยนจากกันได้โดยไม่มี tsc/เทสตัวไหนฟ้อง — เกณฑ์ทั้งหมดยังมาจาก lib ชุดเดิม
 * (`filterActiveOrders`/`orderShippingStage`/`SERVICE_STAGE_CHIP_META`) ไม่ได้เขียนเงื่อนไขใหม่
 */
export function orderProgressChip({
  orders,
  vertical,
}: {
  orders: CustomerPanelOrder[]
  vertical: ShopVertical
}): { icon: string; short: string; count: number } | null {
  const isService = vertical === 'SERVICE_QUEUE'
  const active = isService ? filterActiveServiceOrders(orders) : filterActiveOrders(orders)
  if (active.length === 0) return null

  const head = active[0]
  const headServiceStage = serviceProgressStage(head)
  const headMeta = headServiceStage === 'DONE' ? null : SERVICE_STAGE_CHIP_META[headServiceStage]
  const headStage = orderShippingStage(head)
  const label = isService
    ? (headMeta?.label ?? '')
    : headStage === 'DONE'
      ? ''
      : SHIPPING_STAGE_LABEL[headStage]

  return {
    // ไอคอนต้องบอกแกนของร้าน — รถบรรทุกกับร้านที่ไม่เคยส่งของคือสัญลักษณ์ที่พูดผิดเรื่อง
    icon: isService ? (headMeta?.icon ?? 'calendar-event') : 'truck-delivery',
    short: label ? `${displayNo(head)} · ${label}` : displayNo(head),
    count: active.length,
  }
}

export default function OrderProgressBar({
  orders,
  vertical,
  conversationId,
  customerName,
  channel,
  customerAvatar,
  pageAvatarUrl,
  shopId,
  variant = 'bar',
}: {
  orders: CustomerPanelOrder[]
  /**
   * ประเภทร้านของเธรดนี้ — ตัดสินว่าแถบนี้จะไล่แกนไหน (feature 00024 / user report 2026-08-08)
   *
   * SERVICE_QUEUE ไล่ "นัดถึงขั้นไหน" · ที่เหลือไล่ "ของอยู่ไหน" — แต่ละร้านมีแกนเสริมได้
   * แกนเดียว จึงไม่มีทางชนกันบนจอเดียว (เจตนาที่ appointment-stage.ts เขียนไว้ตั้งแต่ 00036)
   */
  vertical: ShopVertical
  conversationId: string
  customerName: string
  channel: string
  customerAvatar: string | null
  /** รูปเพจของเธรด — badge มุม avatar ในหน้าต่าง/ชิปที่ย่อไว้ (user สั่ง 2026-08-07) */
  pageAvatarUrl: string | null
  /**
   * ร้านของเธรดนี้ (feature 00050) — ส่งต่อเป็น `?shopId=` ให้ทุก API ที่ปุ่มในการ์ดยิง
   *
   * 🛑 ห้ามปล่อยให้ server เดาจาก `activeShopId`: เธรดของร้าน B เปิดได้ขณะ active อยู่ร้าน A
   * (BR-UNI-07) ⇒ ปุ่มจะ "หาไม่เจอ" แล้วกดกี่ครั้งก็ไม่ผ่าน (บทเรียน iShip retry 2026-08-06)
   */
  shopId: string | null
  /**
   * 'bar' (เดิม) = แถบยุบ/กางของตัวเอง · 'detail' = เนื้อหาที่กางแล้วล้วน ๆ ไม่มีแถบ ไม่มีปุ่มย่อ
   *
   * 'detail' เกิดขึ้นตอนยุบ 3 แถบใต้หัวเธรดเป็นแถวชิปเดียว (2026-08-14) — `ThreadChipStrip`
   * เป็นเจ้าของการยุบ/กาง/ปุ่มย่อ/ระยะขอบแทน ตัวนี้จึงเหลือหน้าที่เดียวคือ "การ์ดออเดอร์"
   * 🛑 ห้ามใส่ `xl:hidden` ในโหมดนี้ — คนตัดสินว่าจะโผล่ที่จอไหนคือ strip (ที่เดียว)
   */
  variant?: 'bar' | 'detail'
}) {
  const [open, setOpen] = useState(false)
  /** token ของนัดที่กำลังเปิดชีต "ส่งสรุปนัด" (ส่วนขยาย 00024 2026-08-11) — null = ปิด
   *  เก็บเป็น token ไม่ใช่ boolean เพราะแถบกางแสดงได้หลายใบพร้อมกัน */
  const [apptToken, setApptToken] = useState<string | null>(null)
  /** token ของใบที่กำลังเปิดชีตรับเงิน (feature 00050) — เหตุผลเดียวกับ apptToken */
  const [payToken, setPayToken] = useState<string | null>(null)
  /** token ของใบที่กำลังบันทึกผลนัด — ปิดปุ่มเฉพาะใบนั้น ไม่ใช่ทั้งแถบ */
  const [markingToken, setMarkingToken] = useState<string | null>(null)
  /** token ของใบที่กำลังเปิดชีต "เริ่มงานเลย" (feature 00050) */
  const [walkInToken, setWalkInToken] = useState<string | null>(null)
  const { openDraft } = useDraftOrders()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const isService = vertical === 'SERVICE_QUEUE'


  /** ข้อมูลเงินเปลี่ยน → ให้ server ส่งออเดอร์ชุดใหม่ลงมา (ตัวเลขบนการ์ดมาจาก server เสมอ) */
  const refresh = () => startTransition(() => router.refresh())

  /** ปิดผลนัด — ตรรกะ/คำ/การแปล error อยู่ที่ `markServedFlow` ที่เดียว (ใช้ร่วมกับแผงขวา) */
  async function markServed(token: string, label: string, warning: string | null) {
    setMarkingToken(token)
    try {
      if (await markServedFlow({ orderToken: token, shopId, label, outstandingWarning: warning })) {
        refresh()
      }
    } finally {
      setMarkingToken(null)
    }
  }

  /**
   * "ยังไม่จบงาน" — คนละเกณฑ์ตามแกนของร้าน ห้ามเขียนเงื่อนไขซ้ำที่นี่ทั้งสองทาง
   *
   * ร้านคิวงานเคยถูกตัดสินด้วยแกนขนส่งด้วย ซึ่งไม่ใช่แค่ป้ายผิด — ออเดอร์บริการไม่มีวันเป็น
   * DONE เลยเพราะไม่มีพัสดุให้เดินหน้า มันจึงค้างอยู่ในแถบนี้ตลอดกาล
   */
  const active = isService ? filterActiveServiceOrders(orders) : filterActiveOrders(orders)

  const head = active[0]
  const headStage = head ? orderShippingStage(head) : 'DONE'
  const headServiceStage = head ? serviceProgressStage(head) : 'DONE'
  const headMeta = headServiceStage === 'DONE' ? null : SERVICE_STAGE_CHIP_META[headServiceStage]
  const headLabel = isService
    ? (headMeta?.label ?? '')
    : headStage === 'DONE'
      ? ''
      : SHIPPING_STAGE_LABEL[headStage]

  /**
   * ใบที่กำลังเปิดชีตรับเงิน — derive จาก `payToken` ไม่เก็บ money ซ้อนไว้ใน state
   *
   * 🛑 ถ้าเก็บ `money` ลง state ตอนกดปุ่ม มันจะค้างเป็นภาพนิ่ง ณ วินาทีที่กด: `router.refresh()`
   * ส่งตัวเลขชุดใหม่ลงมาแล้วแต่ชีตยังโชว์ของเก่า ⇒ เพื่อนร่วมทีมบันทึกเงินพร้อมกันแล้วยอดค้าง
   * บนชีตไม่ตรงกับบนการ์ดในจอเดียวกัน (`stored-flag-vs-owner-truth.md` — ภาพนิ่ง ≠ ความจริงปัจจุบัน)
   */
  const walkInOrder = walkInToken ? active.find((o) => o.token === walkInToken) : undefined
  const payOrder = payToken ? active.find((o) => o.token === payToken) : undefined
  const payMoney = payOrder
    ? {
        token: payOrder.token,
        label: displayNo(payOrder),
        money: computeOrderMoneyFromSerialized({
          totalAmount: payOrder.totalAmount,
          depositAmount: payOrder.depositAmount ?? null,
          payments: payOrder.payments,
        }),
      }
    : null

  if (active.length === 0) return null

  // ข้อความ/พฤติกรรมชุดเดียวกับปุ่มคัดลอกในโมดัลพัสดุ (ShipmentStatusView.handleCopy) —
  // clipboard ต้องการ https บน dev ที่ไม่ใช่ https จะล้มเหลว ต้องบอกตามตรงไม่ใช่เงียบ
  async function copyTracking(trackingNo: string) {
    try {
      await navigator.clipboard.writeText(trackingNo)
      pacesToast.success('คัดลอกเลขติดตามแล้ว')
    } catch {
      pacesToast.warning('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกด้วยตัวเอง')
    }
  }

  // แตะการ์ดใบไหน → หน้าต่างพัสดุเดิม (ย่อได้ ค้างข้ามห้อง) — กลไกเดียวกับปุ่มพัสดุใน
  // CustomerPanel ไม่เปิดโมดัลแบบใหม่ (จะได้มีวิธีเดียว พฤติกรรมเดียว)
  const openShipment = (token: string) =>
    openDraft({
      conversationId,
      customerName,
      channel,
      customerAvatar,
      pageAvatarUrl,
      kind: 'SHIPMENT',
      shipmentOrderToken: token,
    })

  return (
    /**
     * 🛑 ชีตต้องอยู่ **นอก** `xl:hidden` — `display:none` ที่บรรพบุรุษระงับ `position:fixed` ของลูกด้วย
     * แต่ `useLockBodyScroll` ทำงานจาก effect จึงไม่รู้เรื่อง ⇒ เปิดชีตที่ <1280px แล้วหมุน/ขยายจอ
     * เป็น ≥1280px = ชีตหายจากจอ แต่ `apptToken` ยังตั้งอยู่และ body ยังถูกล็อก scroll
     * (Esc ยังปิดได้เพราะ listener อยู่ระดับ document แต่แตะปิดไม่ได้เลย)
     */
    <>
      {/* ชีตเดียวกับอีก 2 จุดเรียก — render ครั้งเดียวนอกลูป (การ์ดในลิสต์แชร์กันได้
          เพราะเปิดได้ทีละใบอยู่แล้ว) ชีตขอข้อมูลเองจาก token ไม่รับ prop ที่มี PII */}
      {apptToken && (
        <AppointmentSummarySheet
          open
          onClose={() => setApptToken(null)}
          orderToken={apptToken}
        />
      )}
      {/* ชีตรับเงิน — เหตุผลเดียวกับชีตด้านบน: อยู่นอก `xl:hidden` และ render ครั้งเดียวนอกลูป
          หา money ของใบที่เปิดจาก token (เปิดได้ทีละใบอยู่แล้ว) ⇒ ไม่ต้องถือ state ซ้อน */}
      {/* เริ่มงาน walk-in — ใบที่ยังไม่มีเวลาเริ่มยังไม่มีที่ยืนในตารางงานเลย (BR-SQ-21) */}
      {walkInOrder && (
        <StartWalkInSheet
          open
          onClose={() => setWalkInToken(null)}
          orderToken={walkInOrder.token}
          orderLabel={displayNo(walkInOrder)}
          shopId={shopId}
          onStarted={refresh}
        />
      )}
      {payMoney && (
        <RecordPaymentSheet
          open
          onClose={() => setPayToken(null)}
          orderToken={payMoney.token}
          orderLabel={payMoney.label}
          shopId={shopId}
          money={payMoney.money}
          onChanged={refresh}
        />
      )}
      <div className={variant === 'detail' ? '' : 'px-4 pt-4 xl:hidden'}>
      {open || variant === 'detail' ? (
        <div className="space-y-2">
          {/* เกิน ~4 ใบให้เลื่อนในตัวเอง — แถบกางห้ามดันเธรดจนข้อความหายทั้งจอ */}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {active.map((o) => {
              const stage = orderShippingStage(o)
              const svcStage = serviceProgressStage(o)
              const svcMeta = svcStage === 'DONE' ? null : SERVICE_STAGE_CHIP_META[svcStage]
              const sh = o.shipment
              const logo = courierLogoUrl(sh?.courierCode, sh?.courierName)
              const courierLabel = sh?.courierName ?? sh?.courierCode ?? 'ขนส่ง'
              const deposit = Number(o.depositAmount ?? 0)
              /**
               * เงินของใบนี้ — คำนวณจาก SSOT ตัวเดียว ห้ามบวกเองในการ์ด (HR16)
               * คิดเฉพาะร้านบริการ: ร้านอื่นยังไม่มีปุ่มเรื่องเงินในแชท (AC-SQ-07)
               */
              const money = isService
                ? computeOrderMoneyFromSerialized({
                    totalAmount: o.totalAmount,
                    depositAmount: o.depositAmount ?? null,
                    payments: o.payments,
                  })
                : null
              /**
               * วิธีเข้ารับบริการ (หัวหน้าถาม 2026-08-15: *"อยากรู้ว่าคนนี้เข้ามารับบริการยังไง"*)
               * derive จาก serviceStart เทียบ createdAt — ไม่มีคอลัมน์ใหม่ ตอบข้อมูลเก่าได้ทันที
               */
              const arrival = isService
                ? resolveArrivalMode({ serviceStart: o.serviceStart ?? null, createdAt: o.createdAt })
                : null
              const payActions =
                money !== null
                  ? chatOrderActions({
                      orderStatus: o.status,
                      appointmentStatus: o.appointmentStatus ?? null,
                      hasAppointment: Boolean(o.serviceStart),
                      money,
                    })
                  : []
              return (
                /* การ์ดเป็น <div> + แผ่นลิงก์คลุมทั้งใบ ไม่ใช่ <button> ก้อนเดียวเหมือนเดิม —
                   ปุ่มคัดลอกเลขพัสดุอยู่ข้างใน ปุ่มซ้อนปุ่มเป็น HTML ที่ใช้ไม่ได้จริง
                   Base (โครง stretched-link + relative z-10 บนปุ่มจริง):
                   src/app/(paces)/seller/(dashboard)/orders/components/OrderCard.tsx:148 */
                <div
                  key={o.id}
                  className="border-default-200 bg-card relative rounded-lg border px-3 py-2.5"
                >
                  {/**
                    * ไม่มีแผ่นลิงก์คลุมทั้งใบสำหรับร้านคิวงาน — ออเดอร์บริการไม่มีพัสดุ
                    * การกดแล้วเปิดหน้าต่างพัสดุเปล่าจะแย่กว่าไม่มีอะไรให้กด
                    *
                    * 🛑 อัปเดต 2026-08-16: คอมเมนต์เดิมเขียนว่า "ร้านคิวงานไม่มีหน้าต่างให้เปิด"
                    * ซึ่ง **ไม่จริงแล้ว** — `openDraft({ editOrderToken })` เปิดฟอร์มแก้ไขใบเดิม
                    * ในหน้าต่างลอยได้ตั้งแต่มี `editOrderToken` (แผงขวาเดสก์ท็อปใช้อยู่จริง)
                    * ที่ขาดคือ *ปุ่มบนมือถือ* ไม่ใช่ความสามารถ ⇒ อยู่ในแถวปุ่มด้านล่างแล้ว
                    * (หัวหน้าสั่ง 2026-08-15: *"และต้องจัดการสินค้าได้ด้วย"*)
                    */}
                  {!isService && (
                    <button
                      type="button"
                      onClick={() => openShipment(o.token)}
                      aria-label={`ดูรายละเอียดพัสดุของคำสั่งซื้อ ${displayNo(o)}`}
                      // แผ่นนี้เป็น absolute ส่วนเนื้อการ์ดเป็น static — ของที่ position: static จะถูก
                      // แผ่นนี้ทับไว้ทั้งหมด คลิกตรงไหนของการ์ดก็เข้าแผ่นนี้ (จึงห้ามใส่ relative ให้
                      // เนื้อหา ยกเว้นปุ่มคัดลอกที่ต้องกดได้จริง = relative z-10)
                      // พื้น hover ต้องโปร่ง (bg-default-500/5) ไม่ใช่สีทึบ ไม่งั้นมันบังเนื้อการ์ดตอน hover
                      className="hover:bg-default-500/5 active:bg-default-500/10 absolute inset-0 rounded-lg transition-colors"
                    />
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-default-900 text-xs font-bold tabular-nums">{displayNo(o)}</span>
                    {isService
                      ? svcMeta && (
                          <span className={`${svcMeta.cls} rounded px-1.5 py-0.5 text-2xs font-medium`}>
                            {svcMeta.label}
                          </span>
                        )
                      : stage !== 'DONE' && (
                          <span className={`${STAGE_CHIP_CLS[stage]} rounded px-1.5 py-0.5 text-2xs font-medium`}>
                            {SHIPPING_STAGE_LABEL[stage]}
                          </span>
                        )}
                    {/**
                      * ชิป "วิธีเข้ารับบริการ" — ตอบคำถามหัวหน้า *"อยากรู้ว่าคนนี้เข้ามารับยังไง"*
                      *
                      * 🛑 แสดงเฉพาะตอนที่ **มีอะไรให้รู้จริง** — "จองล่วงหน้า" เป็นค่าปกติของร้านจอง
                      * ติดป้ายทุกใบจะกลายเป็นเสียงรบกวนที่ตาข้ามไปเอง แล้ววันที่มีใบ "ยังไม่ระบุเวลา"
                      * (ซึ่งเป็นใบที่ต้องลงมือ) ป้ายนั้นก็จะถูกข้ามไปด้วย
                      */}
                    {arrival && arrival !== 'BOOKED' && (
                      <span
                        className={`${ARRIVAL_MODE_META[arrival].cls} inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-2xs font-medium`}
                        title={ARRIVAL_MODE_META[arrival].hint}
                      >
                        <Icon icon={ARRIVAL_MODE_META[arrival].icon} className="text-2xs" aria-hidden="true" />
                        {ARRIVAL_MODE_META[arrival].label}
                      </span>
                    )}
                    <span className="text-primary ms-auto text-xs font-bold">
                      ฿{Number(o.totalAmount).toLocaleString('th-TH')}
                    </span>
                  </div>

                  {isService ? (
                    <>
                      {/* มัดจำ — บรรทัดข้อมูลเฉย ๆ **ไม่ใช่ขั้นของ timeline และห้ามเป็นสีเขียว**
                          ค่านี้คือ "ข้อตกลง" ไม่ใช่เงินที่เข้าแล้ว (เงินจริงอยู่ที่ตาราง OrderPayment ตั้งแต่ feature 00050
                          — BR-RSV-49/50 ตั้งใจไม่กั้นคิวด้วยมัดจำ ไม่มี flow แนบสลิปแบบบ้านพัก)
                          ถ้าทำเป็นขั้นที่ติ๊กถูกได้ จะเป็นป้ายที่อ้างสิ่งที่ระบบไม่รู้ — คลาสเดียวกับ
                          "รอเลขพัสดุ" ที่เรากำลังแก้อยู่นี่เอง */}
                      {/* "มัดจำที่ตกลงไว้" ไม่ใช่ "มัดจำ" เฉย ๆ — คำหลังอ่านได้ทั้ง "เก็บแล้ว"
                          และ "ต้องเก็บ" และเมื่อวางใต้ยอดรวมกับวันนัดซึ่งเป็นข้อเท็จจริงที่เกิดแล้ว
                          น้ำหนักจะเอนไปทาง "เก็บแล้ว" ซึ่งเป็นคนละเรื่องกับยอดที่ตกลงไว้ (BR-SQ-02) */}
                      {deposit > 0 && (
                        <p className="text-default-700 mb-0 mt-1.5 text-xs">
                          มัดจำที่ตกลงไว้ ฿{deposit.toLocaleString('th-TH')}
                        </p>
                      )}
                      {/**
                       * บรรทัด "เงินที่รับจริง" — **บรรทัดใหม่ ไม่ใช่การเปลี่ยนความหมายของบรรทัดบน**
                       *
                       * บรรทัดบนติดป้ายให้ `Order.depositAmount` ซึ่งคือ *ข้อตกลง* และความหมายของมัน
                       * ไม่เปลี่ยนเลยแม้ระบบจะรู้เรื่องเงินที่รับแล้ว (BR-SQ-02) — สองบรรทัดนี้ตอบ
                       * คนละคำถาม จึงต้องอยู่คู่กัน ไม่ใช่แทนกัน
                       *
                       * สีตามสถานะ: ครบแล้ว = success · ยังค้าง = warning-ink บนพื้นโปร่ง
                       * (ไม่ใช้จุดสีเปล่า ๆ — non-text ต้องการ 3:1 ซึ่งเคยตกมาแล้วที่ชิปเวลา 00024)
                       */}
                      {money && (
                        <p
                          className={`mb-0 mt-1.5 flex items-center gap-1.5 text-xs font-medium ${
                            money.fullyPaid ? 'text-success-ink' : 'text-warning-ink'
                          }`}
                        >
                          <Icon
                            icon={money.fullyPaid ? 'circle-check' : 'cash-banknote'}
                            className="shrink-0 text-sm"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">{chatMoneySummary(money)}</span>
                        </p>
                      )}
                      {o.serviceStart ? (
                        <div className="text-default-900 mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                          <Icon
                            icon={svcMeta?.icon ?? 'calendar-event'}
                            className="text-default-700 shrink-0 text-base"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 truncate">
                            {appointmentRangeText(o.serviceStart, o.serviceEnd)}
                          </span>
                        </div>
                      ) : (
                        /* walk-in — ไม่มีนัดผูก (BR-RSV-04 เดินเส้นทางปกติทุกอย่าง)
                           เลี่ยงคำว่า "รอ…" เพราะไม่มีอะไรกำลังจะมาถึง มันแค่ไม่มีนัด

                           "สร้างเมื่อ" ไม่ใช่ "สั่งซื้อเมื่อ" — สาขานี้เป็นของร้าน SERVICE_QUEUE
                           เท่านั้น และ ORDER_VOCAB.SERVICE_QUEUE.dateLabel ตัดสินไปแล้วว่าคอลัมน์
                           createdAt ของร้านประเภทนี้เรียกว่า "วันที่สร้าง" (ร้านคิวงานเปิดบิลตอน
                           ลูกค้ามาถึงหน้าร้าน ไม่มีการ "สั่งซื้อ" มาก่อน) — คำนี้คือสิ่งที่ user
                           ทักมาตรง ๆ ในคอมมิตนี้ว่าร้านบริการไม่ควรถูกพูดด้วยภาษาการซื้อของ */
                        <p className="text-default-700 mb-0 mt-1 text-2xs">
                          ไม่มีนัด — สร้างเมื่อ {formatDateTime(new Date(o.createdAt))}
                        </p>
                      )}
                      {/**
                       * ส่งสรุปนัดเข้าแชท (ส่วนขยาย 00024, 2026-08-11)
                       *
                       * คอมเมนต์ด้านบนของการ์ดใบนี้เขียนไว้เองว่ามันเป็นการ์ด "อ่านอย่างเดียว"
                       * เพราะยังไม่มีอะไรให้กด — นี่คือสิ่งที่ให้กด. ยังไม่ใส่แผ่นลิงก์คลุมทั้งใบ
                       * (DraftKind ยังไม่มีชนิดของนัด) ปุ่มนี้จึงเป็นทางเดียวที่กดได้ในการ์ด
                       *
                       * เฉพาะใบที่ "มีนัดจริง" — walk-in ไม่มีนัดให้สรุป (BR-RSV-04)
                       */}
                      {/**
                       * แถวปุ่ม — รายการปุ่มมาจาก `chatOrderActions()` ที่เดียว (feature 00050)
                       *
                       * 🛑 `HANDLER` เป็น `Record<ChatOrderActionKey, …>` โดยตั้งใจ: เพิ่มปุ่มใหม่
                       * ในไลบรารีแล้วลืมต่อสายที่นี่ = `tsc` แดงทันที ไม่ใช่ปุ่มที่หายเงียบ ๆ
                       *
                       * 🛑 `REQUEST_DEPOSIT` ชี้ไปที่ **ชีตสรุปนัดตัวเดิม** ไม่ได้สร้างทางส่งใหม่ —
                       * การ์ดสรุปนัดมีบรรทัด "มัดจำที่ตกลงไว้" อยู่ในนั้นแล้ว (`appointment-summary.ts`)
                       * การทำตัวส่งที่สองสำหรับเรื่องเดียวกันคือที่ที่คำสองชุดจะเพี้ยนจากกัน (HR16)
                       * ⇒ ปุ่ม "ส่งสรุปนัด" เดิมจึงถูกกลืนเข้าแถวนี้ ไม่ได้อยู่ซ้ำเป็นใบที่สอง
                       */}
                      {(payActions.length > 0 || o.serviceStart || isService) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {payActions.map((a) => {
                            const HANDLER: Record<typeof a.key, () => void> = {
                              START_WALK_IN: () => setWalkInToken(o.token),
                              REQUEST_DEPOSIT: () => setApptToken(o.token),
                              RECORD_PAYMENT: () => setPayToken(o.token),
                              MARK_SERVED: () =>
                                void markServed(
                                  o.token,
                                  displayNo(o),
                                  money ? completionWarning(money) : null,
                                ),
                            }
                            const busy = a.key === 'MARK_SERVED' && markingToken === o.token
                            return (
                              <button
                                key={a.key}
                                type="button"
                                onClick={HANDLER[a.key]}
                                disabled={busy}
                                aria-label={`${a.label} — ${displayNo(o)}`}
                                className={`btn min-h-11 flex-1 basis-32 items-center justify-center gap-1 disabled:opacity-60 ${
                                  a.primary
                                    ? 'bg-primary hover:bg-primary-hover text-white'
                                    : 'bg-primary/10 text-primary-ink hover:bg-primary/20'
                                }`}
                              >
                                <Icon
                                  icon={busy ? 'loader-2' : a.icon}
                                  className={`text-sm ${busy ? 'animate-spin' : ''}`}
                                  aria-hidden="true"
                                />
                                {a.label}
                              </button>
                            )
                          })}
                          {/**
                            * แก้ไขรายการในบิล — หัวหน้าสั่ง *"ต้องจัดการสินค้าได้ด้วย"*
                            *
                            * เปิด **ฟอร์มเดิม** (`OrderCreateForm` ในหน้าต่างลอย) ที่แผงขวา
                            * เดสก์ท็อปใช้อยู่แล้ว ไม่ได้สร้างทางแก้ไขเส้นที่สอง — ยอดรวมเปลี่ยน
                            * แล้วยอดค้างคำนวณใหม่เองเพราะทุกจออ่านจาก `computeOrderMoney`
                            * ตัวเดียว (BR-SQ-31)
                            */}
                          <button
                            type="button"
                            onClick={() =>
                              openDraft({
                                conversationId,
                                customerName,
                                channel,
                                customerAvatar,
                                pageAvatarUrl,
                                editOrderToken: o.token,
                              })
                            }
                            aria-label={`แก้ไขรายการของ ${displayNo(o)}`}
                            className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 flex-1 basis-32 gap-1"
                          >
                            <Icon icon="edit" className="text-sm" aria-hidden="true" />
                            แก้ไขรายการ
                          </button>
                          {/* ส่งสรุปนัด — คงไว้ตามเดิมเมื่อไม่มีปุ่ม "แจ้งมัดจำ" มาแทน
                              (ปุ่มเดียวกัน คำเดียวกัน ไม่ใช่สองใบบนการ์ดเดียว) */}
                          {o.serviceStart && !payActions.some((a) => a.key === 'REQUEST_DEPOSIT') && (
                            <button
                              type="button"
                              onClick={() => setApptToken(o.token)}
                              aria-label={`ส่งสรุปนัดของ ${displayNo(o)} เข้าแชท`}
                              className="btn bg-primary/10 text-primary-ink hover:bg-primary/20 min-h-11 flex-1 basis-32 gap-1"
                            >
                              <Icon icon="calendar-check" className="text-sm" aria-hidden="true" />
                              ส่งสรุปนัด
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : sh?.status != null ? (
                    <>
                      {/* หัวพัสดุ — ยกมาทั้งบล็อกจากการ์ดออเดอร์ในบับเบิล ซึ่งคือจอที่ user ชี้ว่า
                          "ให้เหมือนแบบนี้" (2026-08-07): โลโก้ขนส่ง · ชื่อขนส่งตัวเล็ก · เลขพัสดุ
                          ตัวหนา + ปุ่มคัดลอก. สองการ์ดนี้แสดงของชิ้นเดียวกันคนละที่ ต้องหน้าตาเดียวกัน
                          Base: src/app/(paces)/seller/(chat)/_components/OrderCardView.tsx:141-164 */}
                      <div className="mt-2 flex items-center gap-2">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logo}
                            alt={courierLabel}
                            className="size-8.5 shrink-0 rounded-lg object-contain"
                          />
                        ) : (
                          <span className="bg-default-100 text-default-700 flex size-8.5 shrink-0 items-center justify-center rounded-lg">
                            <Icon icon="truck-delivery" className="text-base" aria-hidden="true" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="text-default-700 block truncate text-2xs">{courierLabel}</span>
                          <span className="text-default-900 block truncate text-xs font-bold tabular-nums">
                            {sh.trackingNo ?? '—'}
                          </span>
                        </span>
                        {sh.trackingNo && (
                          // z-10: ยกขึ้นเหนือแผ่นลิงก์ที่คลุมทั้งใบ ไม่งั้นกดแล้วได้หน้าต่างพัสดุแทน
                          <button
                            type="button"
                            onClick={() => void copyTracking(sh.trackingNo!)}
                            aria-label={`คัดลอกเลขพัสดุ ${sh.trackingNo}`}
                            title="คัดลอกเลขพัสดุ"
                            className="btn btn-sm btn-icon text-default-700 hover:bg-default-100 relative z-10 shrink-0"
                          >
                            <Icon icon="copy" className="text-base" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <ShipmentStepper
                          shipmentStatus={sh.status}
                          carrierStatus={sh.carrierStatus ?? null}
                          size="sm"
                          showNotice={false}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-default-700 mb-0 mt-1 text-2xs">
                      ไม่มีหมายเลขพัสดุ — สั่งซื้อเมื่อ {formatDateTime(new Date(o.createdAt))}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          {variant === 'detail' ? null : (
          <button
            type="button"
            onClick={() => setOpen(false)}
            /* aria-expanded: แถบนี้เป็น disclosure (ยุบ/กาง) แต่เดิมไม่เคยประกาศสถานะเลย
               ผู้ใช้ screen reader จึงได้ยินแค่ "ปุ่ม ย่อสถานะออเดอร์" โดยไม่รู้ว่าตอนนี้
               กางอยู่หรือยุบอยู่ และกดแล้วจะได้อะไร (WCAG 4.1.2 Name, Role, Value) */
            aria-expanded={open}
            className="text-default-700 hover:text-default-700 flex items-center gap-1 text-xs font-medium"
          >
            <Icon icon="chevron-up" className="text-sm" />
            {isService ? 'ย่อสถานะการให้บริการ' : 'ย่อสถานะออเดอร์'}
          </button>
          )}
        </div>
      ) : (
        <div className="bg-primary/15 text-primary-ink flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
          {/* ไอคอนต้องบอกแกนของร้าน — รถบรรทุกกับร้านที่ไม่เคยส่งของคือสัญลักษณ์ที่พูดผิดเรื่อง
              (ใช้ไอคอนจาก SERVICE_STAGE_CHIP_META ชุดเดียวกับชิป จะได้ไม่มีวันเพี้ยนจากกัน) */}
          <Icon
            icon={isService ? (headMeta?.icon ?? 'calendar-event') : 'truck-delivery'}
            className="shrink-0 text-lg"
            aria-hidden="true"
          />
          {/* min-w-0 + truncate: คงความสูง 1 บรรทัดเสมอ — รายละเอียดเต็มอยู่ในตัวกาง */}
          <span className="min-w-0 flex-1 truncate">
            {displayNo(head)} · {headLabel}
          </span>
          {active.length > 1 && (
            <span className="bg-card/60 shrink-0 rounded px-1.5 text-xs font-semibold">+{active.length - 1}</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={
              isService
                ? active.length > 1
                  ? `ดูสถานะการให้บริการทั้ง ${active.length} รายการ`
                  : 'ดูรายละเอียดสถานะการให้บริการ'
                : active.length > 1
                  ? `ดูสถานะออเดอร์ทั้ง ${active.length} รายการ`
                  : 'ดูรายละเอียดสถานะออเดอร์'
            }
            title="ดูรายละเอียด"
            /* คู่กับปุ่ม "ย่อ…" ในสาขากางข้างบน — ปุ่มเดียวกันในเชิงหน้าที่ ต้องประกาศสถานะ
               เหมือนกัน (WCAG 4.1.2) */
            aria-expanded={open}
            className="hover:bg-card/50 -m-1 flex shrink-0 items-center rounded p-1"
          >
            <Icon icon="chevron-down" className="text-base" />
          </button>
        </div>
      )}
      </div>
    </>
  )
}
