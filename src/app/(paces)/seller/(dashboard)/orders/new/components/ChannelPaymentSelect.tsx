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
import type { FormValues } from './OrderCreateForm'

// MVP: 4 ช่องทาง + 3 ชำระเงิน (ตาม mockup). OTHER/PROMPTPAY/CARD ปรับผ่าน desktop POS / order detail
const CHANNEL_OPTIONS: PickerOption[] = [
  { value: 'STOREFRONT', label: 'หน้าร้าน', icon: 'building-store' },
  { value: 'FACEBOOK', label: 'Facebook', icon: 'brand-facebook' },
  { value: 'LINE', label: 'LINE', icon: 'brand-line' },
  { value: 'TIKTOK', label: 'TikTok', icon: 'brand-tiktok' },
]
const PAYMENT_OPTIONS: PickerOption[] = [
  { value: 'CASH', label: 'เงินสด', icon: 'cash' },
  { value: 'TRANSFER', label: 'โอนเงิน', icon: 'building-bank' },
  { value: 'COD', label: 'เก็บเงินปลายทาง', icon: 'truck-delivery' },
]

export const DEFAULT_CHANNEL_KEY = 'deep.default.salesChannel'
export const DEFAULT_PAYMENT_KEY = 'deep.default.paymentMethod'

interface Props {
  control: Control<FormValues>
}

export default function ChannelPaymentSelect({ control }: Props) {
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

  const chOpt = CHANNEL_OPTIONS.find((o) => o.value === channelField.value)
  const pmOpt = PAYMENT_OPTIONS.find((o) => o.value === paymentField.value)

  return (
    <>
      <div className="divide-y divide-default-100 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:divide-y-0">
        {/* ช่องทางการขาย */}
        <button
          type="button"
          onClick={() => setOpenSheet('channel')}
          className="flex w-full items-center gap-3 py-2.5 text-left"
        >
          <span className="w-28 shrink-0 text-sm font-semibold text-default-700">ช่องทางการขาย</span>
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-default-300 px-2.5 py-1.5 text-sm font-semibold text-default-800">
            {chOpt && <Icon icon={chOpt.icon} className="size-4 text-primary" />}
            {chOpt?.label ?? '—'}
            <Icon icon="chevron-down" className="size-4 text-default-400" />
          </span>
        </button>
        {/* การชำระเงิน */}
        <button
          type="button"
          onClick={() => setOpenSheet('payment')}
          className="flex w-full items-center gap-3 py-2.5 text-left"
        >
          <span className="w-28 shrink-0 text-sm font-semibold text-default-700">การชำระเงิน</span>
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-default-300 px-2.5 py-1.5 text-sm font-semibold text-default-800">
            {pmOpt && <Icon icon={pmOpt.icon} className="size-4 text-primary" />}
            {pmOpt?.label ?? '—'}
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
