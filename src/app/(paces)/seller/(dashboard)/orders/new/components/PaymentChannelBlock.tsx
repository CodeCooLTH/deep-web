/**
 * PaymentChannelBlock — BLOCK 2 "การชำระเงิน & ช่องทาง" + ส่วนลด/VAT
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx (+ custom/_forms.css); structure per docs/mockups/seller-orders/create.html BLOCK 2 (+ discount/VAT per user-approved addition 2026-05-17)
 *
 * card/card-header/card-body, form-label, form-input, form-select, form-textarea,
 * input-group, input-group-text ล้วนมาจาก _forms.css ของ Paces.
 * RHF contract: รับ control + errors จาก parent (B7) — ห้าม call useForm ที่นี่.
 */
'use client'

import { useController } from 'react-hook-form'
import type { Control, FieldErrors } from 'react-hook-form'
import Select from '@/components/wrappers/Select'

// ─── Options (mirror ค่าที่ใช้ใน OrderCreateForm.tsx) ─────────────────────────

const CHANNEL_OPTIONS = [
  { value: 'STOREFRONT', label: 'หน้าร้าน' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'LINE', label: 'Line' },
  { value: 'TIKTOK', label: 'TikTok / TikTok Shop' },
  { value: 'OTHER', label: 'อื่นๆ' },
]

const PAYMENT_OPTIONS = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'TRANSFER', label: 'โอนเงิน' },
  { value: 'PROMPTPAY', label: 'พร้อมเพย์' },
  { value: 'CARD', label: 'บัตรเครดิต/เดบิต' },
  { value: 'COD', label: 'เก็บปลายทาง' },
  { value: 'OTHER', label: 'อื่นๆ' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentChannelBlock({ control, errors }: Props) {
  // ── ช่องทางการขาย ──────────────────────────────────────────────────────────
  const { field: channelField } = useController({ control, name: 'salesChannel' })

  // ── วิธีชำระเงิน ────────────────────────────────────────────────────────────
  const { field: paymentField } = useController({ control, name: 'paymentMethod' })

  // ── ส่วนลด (฿) — เก็บเป็น number | undefined ────────────────────────────────
  const { field: discountField } = useController({ control, name: 'discount' })

  // ── VAT (%) — เก็บเป็น number | undefined; B7 แปลงเป็น decimal ตอน submit ────
  const { field: vatRateField } = useController({ control, name: 'vatRate' })

  // ── หมายเหตุภายใน ───────────────────────────────────────────────────────────
  const { field: noteField } = useController({ control, name: 'internalNote' })

  return (
    <div className="card">
      {/* card-header ตาม mockup BLOCK 2 */}
      <div className="card-header">
        <h2 className="flex items-center gap-2 font-semibold text-dark">
          {/* step chip — Tailwind utilities เท่านั้น ไม่ใช้ <style> และไม่ hardcode สี hex */}
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            2
          </span>
          การชำระเงิน &amp; ช่องทาง
        </h2>
      </div>

      {/* card-body: 2-col grid ตาม mockup BLOCK 2 */}
      <div className="card-body grid gap-4 sm:grid-cols-2">

        {/* ── ช่องทางการขาย ──────────────────────────────────────────────────── */}
        <div>
          <label htmlFor="pay-channel" className="form-label">
            ช่องทางการขาย
          </label>
          {/* Select wrapper (react-select) ตาม OrderCreateForm channel pattern บรรทัด 362-378 */}
          <Select
            inputId="pay-channel"
            className="select2 react-select"
            classNamePrefix="react-select"
            isSearchable={false}
            isClearable
            options={CHANNEL_OPTIONS}
            value={CHANNEL_OPTIONS.find((o) => o.value === channelField.value) ?? null}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={(opt: any) => channelField.onChange(opt?.value || undefined)}
            onBlur={channelField.onBlur}
            placeholder="เลือกช่องทาง"
          />
        </div>

        {/* ── วิธีชำระเงิน ──────────────────────────────────────────────────── */}
        <div>
          <label htmlFor="pay-method" className="form-label">
            วิธีชำระเงิน
          </label>
          <Select
            inputId="pay-method"
            className="select2 react-select"
            classNamePrefix="react-select"
            isSearchable={false}
            isClearable
            options={PAYMENT_OPTIONS}
            value={PAYMENT_OPTIONS.find((o) => o.value === paymentField.value) ?? null}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={(opt: any) => paymentField.onChange(opt?.value || undefined)}
            onBlur={paymentField.onBlur}
            placeholder="เลือกวิธีชำระเงิน"
          />
        </div>

        {/* ── ส่วนลด (฿) — prefix adornment ตาม OrderCreateForm บรรทัด 662-671 ── */}
        <div>
          <label htmlFor="pay-discount" className="form-label">
            ส่วนลด (฿)
          </label>
          <div className="input-group">
            <span className="input-group-text">฿</span>
            <input
              id="pay-discount"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              placeholder="0.00"
              className="form-input"
              value={discountField.value ?? ''}
              onChange={(e) =>
                discountField.onChange(e.target.value === '' ? undefined : Number(e.target.value))
              }
              onBlur={discountField.onBlur}
              ref={discountField.ref}
            />
          </div>
          {errors.discount?.message && (
            <p className="text-danger mt-1 text-sm">{String(errors.discount.message)}</p>
          )}
        </div>

        {/* ── VAT (%) — suffix hint + helper text ──────────────────────────── */}
        <div>
          <label htmlFor="pay-vat" className="form-label">
            VAT (%)
          </label>
          <div className="input-group">
            <input
              id="pay-vat"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              placeholder="0"
              className="form-input"
              value={vatRateField.value ?? ''}
              onChange={(e) =>
                vatRateField.onChange(e.target.value === '' ? undefined : Number(e.target.value))
              }
              onBlur={vatRateField.onBlur}
              ref={vatRateField.ref}
            />
            <span className="input-group-text">%</span>
          </div>
          {/* helper text — ไม่ใช่ error; แสดงเสมอ */}
          <p className="mt-1 text-xs text-default-400">กรอกเป็นเปอร์เซ็นต์ เช่น 7 = VAT 7%</p>
          {errors.vatRate?.message && (
            <p className="text-danger mt-1 text-sm">{String(errors.vatRate.message)}</p>
          )}
        </div>

        {/* ── หมายเหตุภายใน — full width ─────────────────────────────────── */}
        <div className="sm:col-span-2">
          <label htmlFor="pay-note" className="form-label">
            หมายเหตุภายใน
          </label>
          {/* form-textarea จาก _forms.css */}
          <textarea
            id="pay-note"
            rows={2}
            placeholder="มองเห็นเฉพาะร้านค้า ไม่แสดงให้ผู้ซื้อ"
            className="form-textarea"
            value={noteField.value ?? ''}
            onChange={noteField.onChange}
            onBlur={noteField.onBlur}
            ref={noteField.ref}
          />
        </div>

      </div>
    </div>
  )
}
