'use client'

/**
 * ChannelPaymentSelect — section "ช่องทางการขาย + การชำระเงิน" ของ quick create (< lg)
 * 2 selrow (label + chip[icon+ค่า+chevron]) แตะ → OptionPickerSheet; tablet (sm:) = 2 คอลัมน์
 * Base: mockup 2026-07-06-quick-create-order.html (.selrow/.selgrid) + OptionPickerSheet
 * ดาว ตั้ง default → localStorage (deep.default.salesChannel/paymentMethod) — อ่านคืนตอน mount ที่ OrderCreateForm
 */

import { useState, useEffect } from 'react'
import { useController } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import OptionPickerSheet, { type PickerOption } from './OptionPickerSheet'
// SSOT ของตัวเลือก — ต้องเป็นชุดเดียวกับเดสก์ท็อป (ดูเหตุผลใน order-options.ts)
import { CHANNEL_OPTIONS, PAYMENT_OPTIONS, labelOf } from './order-options'
import { SALES_CHANNEL_LOGO } from '@/lib/sales-channel-logo'
import type { FormValues } from './OrderCreateForm'

// MVP: 4 ช่องทาง + 3 ชำระเงิน (ตาม mockup). OTHER/PROMPTPAY/CARD ปรับผ่าน desktop POS / order detail

export const DEFAULT_CHANNEL_KEY = 'deep.default.salesChannel'
export const DEFAULT_PAYMENT_KEY = 'deep.default.paymentMethod'

interface Props {
  control: Control<FormValues>
  /**
   * compact = อยู่ในโมดัลสร้างออเดอร์ในแชท (w-96 แคบ) — บังคับ single column ทุก viewport
   * เดิม sm:grid-cols-2 อิง viewport 640px ไม่รู้ว่าโมดัลแคบ → บน desktop บีบ 2 คอลัมน์จน chip
   * "เก็บเงินปลายทาง" ล้นขอบ + label ทับ chip (user report 2026-07-24)
   */
  compact?: boolean
  /**
   * ล็อกช่องทางการขายตามเธรดที่กำลังคุยอยู่ (user 2026-08-10: "คุยใน Facebook ช่องทางก็ต้องเป็น
   * เฟสบุ๊ค จะเปลี่ยนเป็นหน้าร้านก็จะงง ๆ นะ") — คำนวณที่ DraftOrderProvider ที่เดียว
   * ไม่ล็อก: เธรด Deep (ลูกค้าอาจมาจากช่องทางอื่นแล้วมาคุยต่อในแอป) · โหมดแก้ไขออเดอร์เดิม ·
   * หน้า /orders/new เต็มจอที่ไม่มีเธรด
   */
  channelLocked?: boolean
}

/**
 * ไอคอนหน้าชื่อช่องทาง — โลโก้แบรนด์จริงถ้ามีไฟล์ (Facebook/Instagram/LINE) ไม่งั้นถอยไป tabler
 *
 * ทำไมไม่ใช้ tabler อย่างเดียวให้จบ: `brand-line` ของ tabler เป็นกรอบข้อความเปล่า ๆ ไม่ใช่โลโก้ LINE
 * ผู้ขายอ่านไม่ออกว่าเป็นช่องทางไหนถ้าไม่อ่านตัวหนังสือ (user ทัก 2026-08-10 "icon ไม่สวย")
 * ขณะที่รายการแชท/ลิสต์ออเดอร์ใช้โลโก้จริงมาตั้งแต่ 2026-07-23 แล้ว — จอเดียวกันควรพูดภาษาเดียวกัน
 *
 * โลโก้แบรนด์ไม่ย้อมสีตามสถานะ (สี = ตัวตน) ส่วน tabler fallback ยังเป็น text-primary ตามเดิม
 */
function ChannelMark({ value }: { value: string | undefined }) {
  const logo = value ? SALES_CHANNEL_LOGO[value] : undefined
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" className="size-4 shrink-0 rounded-sm" />
  }
  const opt = CHANNEL_OPTIONS.find((o) => o.value === value)
  return opt ? <Icon icon={opt.icon} className="size-4 text-primary" /> : null
}

export default function ChannelPaymentSelect({ control, compact = false, channelLocked = false }: Props) {
  const [openSheet, setOpenSheet] = useState<'channel' | 'payment' | null>(null)
  const [defaults, setDefaults] = useState<{ channel: string | null; payment: string | null }>({
    channel: null,
    payment: null,
  })

  const { field: channelField } = useController({ control, name: 'salesChannel', defaultValue: 'STOREFRONT' })
  const { field: paymentField } = useController({ control, name: 'paymentMethod', defaultValue: 'CASH' })

  // แสดง ดาว เต็มตามค่า default ที่ตั้งไว้ (client only)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setDefaults({
      channel: localStorage.getItem(DEFAULT_CHANNEL_KEY),
      payment: localStorage.getItem(DEFAULT_PAYMENT_KEY),
    })
  }, [])

  const setDefault = (kind: 'channel' | 'payment', value: string) => {
    localStorage.setItem(kind === 'channel' ? DEFAULT_CHANNEL_KEY : DEFAULT_PAYMENT_KEY, value)
    setDefaults((d) => ({ ...d, [kind]: value }))
  }

  const pmOpt = PAYMENT_OPTIONS.find((o) => o.value === paymentField.value)

  return (
    <>
      <div
        className={
          compact
            ? 'divide-y divide-default-100' // โมดัลแคบ: single column เสมอ (ไม่พึ่ง viewport sm:)
            : 'divide-y divide-default-100 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:divide-y-0'
        }
      >
        {/* ช่องทางการขาย — ล็อกแล้วเป็น <div> ไม่ใช่ <button disabled>:
            disabled ของ Paces สื่อว่า "ตอนนี้กดไม่ได้ เดี๋ยวกดได้" (เช่นฟอร์มยังกรอกไม่ครบ) คนละความหมาย
            กับ "ค่านี้ผูกกับเธรด ไม่มีทางกดได้ในบริบทนี้" — และ <div> ไม่กินโฟกัสคีย์บอร์ดโดยไม่มีอะไรให้ทำ
            สิ่งที่บอกว่าแถวนี้แก้ไม่ได้คือ "ไม่มีกรอบชิป + ไม่มี chevron" เทียบกับแถวการชำระเงินที่อยู่ติดกัน
            บวกบรรทัดอธิบายใต้แถว — ไม่ใช่การย้อมเทา (user เคาะ 2026-08-10) */}
        {channelLocked ? (
          <div className="py-2.5">
            <div className="flex w-full items-center gap-3">
              <span className="w-28 shrink-0 text-sm font-semibold text-default-700">ช่องทางการขาย</span>
              {/* user เคาะ 2026-08-10: "ไม่อยากให้เทา ๆ อยากให้เป็นเหมือน Text เลย มี icon ให้เรียบร้อย"
                  → ไม่มีกรอบ/ไม่มีพื้น/ไม่มีกุญแจ อ่านเป็นค่าปกติของแถว (สีเดียวกับค่าที่กดได้)
                  ตัวที่บอกว่าแก้ไม่ได้คือ "ไม่มี chevron" + บรรทัดอธิบายใต้แถว ไม่ใช่การย้อมเทา */}
              <span className="ms-auto inline-flex items-center gap-1.5 text-sm font-semibold text-default-800">
                <ChannelMark value={channelField.value} />
                {labelOf(CHANNEL_OPTIONS, channelField.value) || '—'}
              </span>
            </div>
            {/* บอกเหตุผล ไม่ใช่บอกข้อห้าม — "ไม่สามารถแก้ไขได้" ไม่ได้ช่วยให้เข้าใจว่าทำไม */}
            <p className="mt-1 mb-0 text-xs text-default-400">ล็อกตามช่องทางที่ลูกค้าทักมา</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpenSheet('channel')}
            className="flex w-full items-center gap-3 py-2.5 text-left"
          >
            <span className="w-28 shrink-0 text-sm font-semibold text-default-700">ช่องทางการขาย</span>
            <span className="ms-auto inline-flex items-center gap-1.5 rounded-lg min-h-11 lg:min-h-0 border border-default-300 px-2.5 py-1.5 text-sm font-semibold text-default-800">
              <ChannelMark value={channelField.value} />
              {labelOf(CHANNEL_OPTIONS, channelField.value) || '—'}
              <Icon icon="chevron-down" className="size-4 text-default-400" />
            </span>
          </button>
        )}
        {/* การชำระเงิน */}
        <button
          type="button"
          onClick={() => setOpenSheet('payment')}
          className="flex w-full items-center gap-3 py-2.5 text-left"
        >
          <span className="w-28 shrink-0 text-sm font-semibold text-default-700">การชำระเงิน</span>
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-lg min-h-11 lg:min-h-0 border border-default-300 px-2.5 py-1.5 text-sm font-semibold text-default-800">
            {pmOpt && <Icon icon={pmOpt.icon} className="size-4 text-primary" />}
            {labelOf(PAYMENT_OPTIONS, paymentField.value) || '—'}
            <Icon icon="chevron-down" className="size-4 text-default-400" />
          </span>
        </button>
      </div>

      <OptionPickerSheet
        open={openSheet === 'channel'}
        title="ช่องทางการขาย"
        options={CHANNEL_OPTIONS}
        value={channelField.value}
        defaultValue={defaults.channel}
        onSelect={(v) => {
          channelField.onChange(v)
          setOpenSheet(null)
        }}
        onSetDefault={(v) => setDefault('channel', v)}
        onClose={() => setOpenSheet(null)}
      />
      <OptionPickerSheet
        open={openSheet === 'payment'}
        title="การชำระเงิน"
        options={PAYMENT_OPTIONS}
        value={paymentField.value}
        defaultValue={defaults.payment}
        onSelect={(v) => {
          paymentField.onChange(v)
          setOpenSheet(null)
        }}
        onSetDefault={(v) => setDefault('payment', v)}
        onClose={() => setOpenSheet(null)}
      />
    </>
  )
}
