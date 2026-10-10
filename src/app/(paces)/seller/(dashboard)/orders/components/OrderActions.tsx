'use client'

/**
 * OrderActions — ชุดปุ่ม action ต่อ 1 ออเดอร์ (centralized) ใช้ทั้ง card (mobile) + table (desktop)
 *
 * จุดประสงค์: source เดียวของ order actions → เพิ่ม/แก้ปุ่มที่นี่ที่เดียว ได้ทั้ง 2 view
 *
 * variant:
 *  - 'table' (desktop) → ปุ่มชัดเรียง [ดู] [แก้ไข] [SMS] [QR] [copy] icon-only (ไม่มี ⋮ — user req 2026-06-15)
 *  - 'table-grid' (desktop, ตารางแบบแถวจัดกลุ่ม 2026-08-06) → ปุ่มชุดเดียวกันเป๊ะ แต่จัดเป็นกริด 3 คอลัมน์
 *      เพราะเรียงแถวเดียวกินความกว้าง 209px = คอลัมน์ที่กว้างที่สุดในตาราง (วัดจริงบน prod)
 *      กริด 3x2 เหลือ ~106px โดย **ปุ่มยังเห็นครบทุกตัว ไม่ต้องมีเมนู ⋮** — กฎ 2026-06-15 ยังอยู่ครบ
 *  - 'card'  (mobile)  → [SMS][QR][copy][⋮] icon-only (SMS=ปุ่มหลักน้ำเงินทึบ; ⋮=ดู/แก้ไข/ยกเลิก ใน OrderCardMenu)
 *
 * action ทั้งหมดนิยามที่นี่ที่เดียว — เพิ่มปุ่มใหม่ = แก้ component นี้ ได้ทั้ง 2 view
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import SendSmsButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/SendSmsButton'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import type { OrderRow } from './data'
import OrderCardMenu from './OrderCardMenu'
import QrCodeButton from './QrCodeButton'
import { canEditOrder } from '@/lib/order-display'
import { useViewerCan } from './OrderViewerRoles'

export type OrderActionsVariant = 'card' | 'table' | 'table-grid'

interface OrderActionsProps {
  /** ชื่อของสิ่งนั้นตามประเภทกิจการ (feature 00030) — ส่งต่อลง OrderCardMenu */
  orderNoun?: string
  /** คำของร้านบริการ (ส่งเฉพาะ SERVICE_QUEUE) ใช้ใน QR/SMS · ไม่ส่ง = คำเดิมของร้านขายของ */
  serviceVocab?: { noun: string; buyerNoun: string }

  order: OrderRow
  onCancelRequest: (token: string) => void
  variant: OrderActionsVariant
}

const ICON_BTN = 'btn btn-icon border-default-300 text-default-700 hover:bg-default-100'

export default function OrderActions({ order, onCancelRequest, variant, orderNoun, serviceVocab }: OrderActionsProps) {
  const isTerminal = order.status === 'CONFIRMED' || order.status === 'CANCELLED'
  // O3 แก้ไข · O7 ส่ง SMS — ผู้ดูที่ไม่มีสิทธิ์ไม่เห็นปุ่ม (ผู้เปิดบิล: ปุ่มแก้ไขแสดงเฉพาะบิลบริการ — หน้าแก้ไขเช็คสถานะชำระเป็นรายใบอีกชั้น)
  const viewerCanEdit = useViewerCan('O3')
  const canSms = useViewerCan('O7')
  const canEdit = canEditOrder(order.status) && viewerCanEdit && !order.editLocked

  // copy link: ใช้ shortCode (สั้น) fallback publicToken; ลิงก์ภายใน /orders/ คงใช้ publicToken
  const copyCode = order.shortCode || order.publicToken
  const [url, setUrl] = useState(`/o/${copyCode}`)
  useEffect(() => {
    setUrl(`${resolveBuyerBaseUrl()}/o/${copyCode}`)
  }, [copyCode])

  // ── desktop (table): button group [ดู][แก้ไข][SMS][copy] icon-only, ไม่มี ⋮ ──
  // button group ตาม theme ui/buttons: inline-flex + rounded-*-none + -ms-px (ปุ่มเชื่อมกัน)
  // ดู=ตัวแรก (rounded-e-none), copy=ตัวสุดท้าย (rounded-s-none), กลาง rounded-none
  // กริด: ปุ่มไม่เชื่อมกันแล้ว (คนละแถว) จึงมีขอบมนของตัวเองทุกใบ ไม่ใช้ -ms-px/rounded-*-none
  if (variant === 'table-grid') {
    /**
     * button group แบบตาราง — ปุ่มชิดกัน มีเส้นคั่นบาง ๆ อยู่ในกรอบมนอันเดียว
     * (user ส่งภาพตัวอย่างมา 2026-08-06)
     *
     * วิธี: ให้กล่องนอกเป็นสีเส้น แล้วเปิดช่องว่างระหว่างช่อง 1px (`gap-px`) — สีของกล่อง
     * จะโผล่ออกมาเป็นเส้นคั่นเอง ปุ่มข้างในทาสีขาวทับ · ทำแบบนี้เพราะ Tailwind ไม่มี
     * variant "ตัวสุดท้ายของแถว" ให้ตัดขอบทีละใบ และจำนวนปุ่มไม่คงที่ (แก้ไขได้เฉพาะ
     * PENDING, SMS เฉพาะที่ยังไม่จบ) การไล่ขอบด้วยมือจะพังทันทีที่จำนวนเปลี่ยน
     *
     * จำนวนคอลัมน์ปรับตามจำนวนปุ่มจริง: ตรึง 3 คอลัมน์แล้วเจอ 4 ปุ่มจะได้ 3+1 ตัวเดียว
     * ห้อยบรรทัดล่าง ดูเหมือนของหลุด (user เจอบน prod 2026-08-06)
     */
    const cell = 'btn btn-icon rounded-none border-0 bg-white text-default-700 hover:bg-default-100'
    const buttons = [
      <Link key="view" href={`/orders/${order.publicToken}`} aria-label="ดูรายละเอียด" className={cell}>
        <Icon icon="eye" className="text-base" />
      </Link>,
      canEdit ? (
        <Link key="edit" href={`/orders/${order.publicToken}/edit`} aria-label="แก้ไข" className={cell}>
          <Icon icon="pencil" className="text-base" />
        </Link>
      ) : null,
      !isTerminal && canSms ? (
        <SendSmsButton serviceVocab={serviceVocab} key="sms" publicToken={order.publicToken} iconOnly className="rounded-none border-0 bg-white" />
      ) : null,
      <QrCodeButton orderWord={serviceVocab?.noun} key="qr" order={order} className="rounded-none border-0 bg-white" />,
      <CopyLinkButton key="copy" value={url} label="คัดลอกลิงก์" iconOnly className="rounded-none border-0 bg-white" />,
    ].filter(Boolean)

    return (
      <div
        className={`bg-default-300 border-default-300 grid w-fit gap-px overflow-hidden rounded-lg border ${
          buttons.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
        }`}
      >
        {buttons}
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className="flex justify-start">
        <div className="inline-flex">
          <Link href={`/orders/${order.publicToken}`} aria-label="ดูรายละเอียด" className={`${ICON_BTN} rounded-e-none`}>
            <Icon icon="eye" className="text-base" />
          </Link>
          {canEdit && (
            <Link href={`/orders/${order.publicToken}/edit`} aria-label="แก้ไข" className={`${ICON_BTN} -ms-px rounded-none`}>
              <Icon icon="pencil" className="text-base" />
            </Link>
          )}
          {!isTerminal && canSms && (
            <SendSmsButton serviceVocab={serviceVocab} publicToken={order.publicToken} iconOnly className="-ms-px rounded-none" />
          )}
          <QrCodeButton orderWord={serviceVocab?.noun} order={order} className="-ms-px rounded-none" />
          <CopyLinkButton value={url} label="คัดลอกลิงก์" iconOnly className="-ms-px rounded-s-none" />
        </div>
      </div>
    )
  }

  // ── mobile (card): [SMS][QR][copy][⋮] icon-only — SMS=ปุ่มหลักน้ำเงินทึบ ──
  return (
    <div className="flex items-center justify-end gap-1.5">
      {!isTerminal && canSms && (
        <SendSmsButton serviceVocab={serviceVocab} publicToken={order.publicToken} iconOnly emphasis="primary" className="min-h-11 min-w-11" />
      )}
      <QrCodeButton orderWord={serviceVocab?.noun} order={order} className="min-h-11 min-w-11" />
      <CopyLinkButton value={url} label="คัดลอกลิงก์" iconOnly className="min-h-11 min-w-11" />
      <OrderCardMenu
        token={order.publicToken}
        status={order.status}
        editLocked={order.editLocked}
        onCancelRequest={onCancelRequest}
        orderNoun={orderNoun}
      />
    </div>
  )
}
