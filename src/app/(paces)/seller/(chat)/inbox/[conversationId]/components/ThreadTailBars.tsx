'use client'

/**
 * ThreadTailBars — แถบยุบ 2 แถบปักท้ายเธรด เหนือช่องพิมพ์ (แบบ B2 · user เคาะ 2026-08-15/16)
 *
 * ═══ ทำไมต้องมี ═══
 * ก่อนหน้านี้คำเตือน (0–7 อัน) + สถานะออเดอร์ อยู่รวมกันใน `ThreadChipStrip` ใต้หัวเธรด
 * ซึ่งบนมือถือมี 2 อาการที่ user เจอเองจากจอจริง:
 *   1. ชิปถูก `max-w-52` + `truncate` ตัดจนไร้ความหมาย ("ห้องนี้กำลังใช้ทดสอบ Dee...")
 *   2. ของที่ต้องลงมืออยู่ **บนสุดของจอ** ไกลจากนิ้วที่กำลังพิมพ์ตอบลูกค้า
 * B2 ย้ายลงมาปักท้าย แล้วให้ประโยคเต็มอยู่ในแผงที่กางขึ้นมา
 *
 * 🛑 **แยกเป็น 2 แถบ ห้ามยุบรวมกัน** — user สั่งตรง ๆ ("ไม่ต้องเอาพวกข้อมูลคำสั่งซื้อ
 * หรือรูปอะไรไปรวม") และ `OrderProgressBar.tsx` เขียนไว้เองว่าแถบออเดอร์ "เป็นทางลัด
 * ดูสถานะ **ไม่ใช่ alert** — โทน primary ไม่ใช่ warning/danger" ⇒ ยุบรวมเมื่อไหร่คือ
 * พาพัสดุไปอยู่กองเดียวกับ "token ตาย" ซึ่งโค้ดจริงตั้งใจเลี่ยงมาตั้งแต่ต้น
 *
 * 🛑 **ทั้งสองแถบเปิดเป็น slide-up sheet เหมือนกัน** (user สั่ง 2026-08-16: "เวลาเรากดพวกนี้
 * เราให้มันเป็น slide modal up หมดเลยดีป่ะ จะได้ไปในทิศทางเดียวกัน")
 * รอบแรกแถบพัสดุกาง **ในหน้า** ส่วนแถบสถานะเป็น sheet ⇒ ปุ่มสองอันที่วางติดกัน หน้าตาเหมือนกัน
 * แต่กดแล้วได้คนละท่า ซึ่งเป็นสิ่งที่ผู้ใช้ต้องจำเพิ่มโดยไม่ได้อะไรกลับมา. การกางในหน้ายัง
 * ดันความสูงท้ายจอให้เปลี่ยนไปมาด้วย (ข้อที่ B2 ตั้งใจแก้ตั้งแต่ต้น)
 *
 * Base: ./OrderProgressBar.tsx (โครงยุบ/กาง + badge จำนวน + aria-expanded + ยุบเป็นค่าตั้งต้น
 *       ไม่จำสถานะกาง) · ปุ่ม/badge/สีจาก Paces token ล้วน (HR7)
 */

import { useState, type ReactNode } from 'react'
import Icon from '@/components/wrappers/Icon'
// วันที่/เวลาทั้งระบบต้องผ่านตัวนี้เท่านั้น (พ.ศ. + tz ไทย) — docs/conventions/date-format.md
import { formatDateTime } from '@/lib/format-date'
// ท่าเปิดจากล่างอันเดียวของทั้งห้องแชท — ดูเหตุผลในหัวไฟล์นั้น
import ChatBottomSheet from './ChatBottomSheet'
// ไทม์ไลน์ "สถานะล่าสุด" — ตัวเดียวกับที่หน้า /orders ใช้ (ดูเหตุผลใน ShipmentTraceList)
import ShipmentTraceSection from './ShipmentTraceSection'

/** รายการคำเตือน — โครงเดียวกับ ThreadStatusItem ของ ThreadChipStrip (ไม่ได้นิยามใหม่) */
export interface TailStatusItem {
  key: string
  tone: 'danger' | 'warning' | 'info'
  icon: string
  short: string
  detail: ReactNode
  action?: ReactNode
}

/**
 * โทนของแถบสถานะ = โทนที่ "แรงที่สุด" ที่ยังมีอยู่ ไม่ใช่ของตัวแรกใน array
 * (array เรียงตามลำดับความสำคัญที่ caller กำหนด ซึ่งบังเอิญตรงกันเกือบตลอด แต่ไม่รับประกัน —
 *  ถ้าอ่านจากตัวแรกแล้ววันหนึ่ง caller สลับลำดับ แถบจะเปลี่ยนสีโดยไม่มีอะไรฟ้อง)
 */
function strongestTone(items: TailStatusItem[]): 'danger' | 'warning' | 'info' {
  if (items.some((i) => i.tone === 'danger')) return 'danger'
  if (items.some((i) => i.tone === 'warning')) return 'warning'
  return 'info'
}

/* class เต็มคำทุกตัว — Tailwind สแกนซอร์สแบบข้อความ ประกอบสตริง `bg-${tone}` จะไม่ถูกสร้าง
   (กติกาเดียวกับ TONE_CLS ใน ThreadChipStrip / STAGE_DOT ใน ShipmentStepper)
   🛑 พื้นสีต้องคู่กับ `-ink` เสมอ: สีเต็มบนพื้นจาง 15% ตกเกณฑ์คอนทราสต์ทุกโทน (warning 1.53:1) */
const BAR_CLS = {
  danger: 'bg-danger/15 text-danger-ink',
  warning: 'bg-warning/15 text-warning-ink',
  info: 'bg-info/15 text-info-ink',
} as const
const BADGE_CLS = {
  danger: 'bg-danger/25 text-danger-ink',
  warning: 'bg-warning/25 text-warning-ink',
  info: 'bg-info/25 text-info-ink',
} as const

/**
 * แถบพัสดุ/สถานะออเดอร์ — กดแล้วเปิด sheet ที่มี `detail` ก้อนเดิมของ OrderProgressBar
 * (ไม่ได้ประกอบเนื้อหาใหม่ — คำและไอคอนยังมาจาก `orderProgressChip()` ที่เดียวตาม HR16)
 */
export function ShipmentTailBar({
  short,
  icon,
  count,
  detail,
  courierLogo,
  courierName,
  toneCls,
  shipmentId,
}: {
  short: string
  icon: string
  count: number
  detail: ReactNode
  /** path โลโก้ขนส่งจาก `courierLogoUrl()` — null = ยังไม่มีไฟล์/ยังไม่มีพัสดุ ให้ใช้ไอคอนแทน */
  courierLogo?: string | null
  courierName?: string | null
  /**
   * 🛑 คลาสโทนของ **ขั้นพัสดุ** — ต้องส่งมาจาก `STAGE_CHIP_CLS[orderShippingStage(order)]`
   * (SSOT เดียวกับชิปในรายการแชท/ตัวกรอง `?stage=`) ห้ามตัดสินโทนเองที่นี่
   *
   * ทำไมถึงสำคัญ: รอบแรกผม hardcode เป็น `bg-info/15` ทุกกรณี ⇒ ใบที่ขึ้นว่า **"พัสดุมีปัญหา"**
   * ถูกวาดด้วยสีฟ้า "ข้อมูล" และ "รอเงิน COD" ก็ฟ้าเหมือนกัน — สีบอกคนละเรื่องกับคำที่เขียนอยู่
   * บนแถบเดียวกัน (user เจอเองบนเครื่อง 2026-08-16). ไม่มี gate ไหนจับได้เพราะคลาสถูกทุกตัวอักษร
   */
  toneCls?: string
  /**
   * OrderShipment.id ของใบที่แถบพูดถึง — มีเฉพาะพัสดุที่เปิดผ่าน iShip
   * null/undefined (ร้านแจ้งเลขเอง) → ไม่ render บล็อกไทม์ไลน์เลย ไม่ใช่ render แล้วว่าง
   */
  shipmentId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [status, orderNo] = splitChipShort(short)

  return (
    <>
      {/**
       * ═══ แถบยุบ (re-design 2026-08-16 ตามที่ user สั่ง) ═══
       * ของเดิม: `[ไอคอน] DP25690845D77E10 · พัสดุมีปัญหา    ⌃` บนพื้นฟ้าเสมอ — เสีย 3 อย่าง
       *   1. **สีขัดกับคำ** — "พัสดุมีปัญหา" อยู่บนพื้น info (แก้ด้วย `toneCls` แล้ว)
       *   2. **เลขออเดอร์ 16 ตัวอักษรนำหน้า** ทั้งที่สิ่งที่ผู้ขายกวาดตาหาคือ "มีอะไรต้องทำไหม"
       *      ส่วนเลขออเดอร์เป็นตัวระบุที่อ่านทีหลัง (และแทบไม่มีใครจำได้จากการกวาดตา)
       *   3. โลโก้ขนส่งสีเหลืองบนพื้นฟ้าจม — ต้องมีแผ่นขาวรองเสมอ
       */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`border-default-200 flex w-full items-center gap-2.5 border-t px-4 py-2.5 text-start text-sm ${toneCls ?? BAR_CLS.info}`}
      >
        {/* โลโก้ขนส่ง — bg-card รองเสมอ เพราะโลโก้ขนส่งไทยหลายเจ้าเป็นสีอ่อน (Flash เหลือง,
            ไปรษณีย์ขาว) วางบนพื้นสี /15 แล้วจมหายทั้งใบ */}
        {courierLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={courierLogo}
            alt={courierName ?? ''}
            className="bg-card ring-card size-6 shrink-0 rounded object-contain p-0.5 ring-1"
          />
        ) : (
          <Icon icon={icon} className="shrink-0 text-base" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{status}</span>
          {orderNo && <span className="ms-1.5 opacity-70">{orderNo}</span>}
        </span>
        {count > 1 && <span className={`badge shrink-0 rounded-full ${BADGE_CLS.info}`}>{count}</span>}
        <Icon icon="chevron-up" className="shrink-0 text-base opacity-70" aria-hidden="true" />
      </button>

      {open && (
        <ChatBottomSheet
          title={count > 1 ? `สถานะพัสดุ (${count})` : 'สถานะพัสดุ'}
          icon="truck-delivery"
          onClose={() => setOpen(false)}
          /**
           * capture phase: ต้องชิงก่อน `OrderProgressBar` เพราะการ์ดออเดอร์ในนั้นเป็น
           * **แผ่นลิงก์ `absolute inset-0` คลุมทั้งใบ** (OrderProgressBar.tsx:209) ⇒ ถ้าไม่ชิง
           * กดตรงไหนของการ์ดก็เปิดหน้าต่างพัสดุ ไม่มีทางปิด sheet ด้วยการกดการ์ดได้
           * user สั่ง 2026-08-16: "กดที่ card ให้ collapsed แทน การกดเปิด order"
           *
           * แยก "แผ่นลิงก์" ออกจาก "ปุ่มจริง" ด้วย `position` ที่คำนวณแล้ว ไม่ใช่เทียบข้อความ
           * ใน aria-label (ซึ่งพังทันทีที่มีคนแก้คำ): แผ่นคลุม = absolute · ปุ่มที่ตั้งใจให้กดได้
           * ยกตัวขึ้นมาเป็น `relative z-10` เสมอ (เช่น ปุ่มคัดลอกเลขพัสดุ) → ปล่อยให้ทำงานตามเดิม
           */
          onContentClickCapture={(e) => {
            const el = (e.target as HTMLElement).closest('button,a,input,textarea,select')
            if (el && getComputedStyle(el).position !== 'absolute') return
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
          }}
        >
          {detail}
          {shipmentId && <ShipmentTraceSection key={shipmentId} shipmentId={shipmentId} />}
        </ChatBottomSheet>
      )}
    </>
  )
}

/**
 * แถบสถานะห้องแชท — ยุบเหลือบรรทัดเดียว + จำนวน · แตะแล้วเปิด sheet ตัวเดียวกับแถบพัสดุ
 * 🛑 ใน sheet มี **สถานะล้วน** ห้ามเอาออเดอร์/คลังไฟล์/ที่มาของแชทมาใส่ (user สั่งตรง ๆ)
 */
export function StatusTailBar({ items }: { items: TailStatusItem[] }) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null
  const tone = strongestTone(items)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`border-default-200 flex w-full items-center gap-2 border-t px-4 py-2.5 text-start text-sm font-semibold ${BAR_CLS[tone]}`}
      >
        <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">สถานะห้องแชท</span>
        <span className={`badge shrink-0 rounded-full ${BADGE_CLS[tone]}`}>{items.length}</span>
        <Icon icon="chevron-up" className="shrink-0 text-base opacity-70" aria-hidden="true" />
      </button>

      {open && (
        <ChatBottomSheet
          title={`สถานะห้องแชท (${items.length})`}
          icon="alert-triangle"
          onClose={() => setOpen(false)}
        >
          {/* `detail` คือ JSX ก้อนเดิมของแต่ละคำเตือน ยกมาทั้งดุ้น ไม่แก้เนื้อใน —
              กติกาเดียวกับ ThreadChipStrip (ที่นั่นกางได้ทีละอัน ที่นี่กางครบทุกอันใน sheet เดียว
              เพราะพื้นที่มีพอ และ user ขอ "ดู list ได้") */}
          <ul className="list-none ps-0">
            {items.map((it) => (
              <li key={it.key}>{it.detail}</li>
            ))}
          </ul>
        </ChatBottomSheet>
      )}
    </>
  )
}

/**
 * แยก `"{เลขออเดอร์} · {สถานะ}"` ที่ `orderProgressChip()` ประกอบไว้ ออกเป็น [สถานะ, เลขออเดอร์]
 * เพื่อ **สลับลำดับการอ่าน** โดยไม่แตะสูตรคำใน OrderProgressBar (HR16 — คำยังมาจากที่เดียว
 * ที่นี่แค่จัดลำดับการแสดงผล ไม่ได้ตั้งคำใหม่)
 *
 * ไม่มี ` · ` (เช่น ร้านคิวงานที่คืนเลขเปล่า ๆ) → คืนทั้งก้อนเป็น "สถานะ" ไม่มีส่วนที่สอง
 */
function splitChipShort(short: string): [string, string | null] {
  const i = short.indexOf(' · ')
  if (i === -1) return [short, null]
  return [short.slice(i + 3), short.slice(0, i)]
}
