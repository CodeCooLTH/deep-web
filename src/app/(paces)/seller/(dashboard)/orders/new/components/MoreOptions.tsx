'use client'

/**
 * MoreOptions — เนื้อ "เพิ่มเติม" ของ quick create: ส่วนลด / VAT / หมายเหตุ (ไม่ collapse — อยู่ใน section ปกติ)
 * (แท็ก = ตัดออก — FormValues ไม่มี field tag; mockup โชว์เป็นตัวอย่าง)
 * padding อยู่ที่ <section> ใน QuickForm — wrapper นี้จัดแค่ grid
 */

import { useController } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import type { FormValues } from './OrderCreateForm'

interface Props {
  control: Control<FormValues>
}

export default function MoreOptions({ control }: Props) {
  const { field: discount } = useController({ control, name: 'discount' })
  const { field: vatRate } = useController({ control, name: 'vatRate' })
  const { field: note } = useController({ control, name: 'internalNote', defaultValue: '' })

  const numChange =
    (onChange: (v: number | undefined) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value === '' ? undefined : Number(e.target.value))

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="mo-discount" className="form-label">ส่วนลด (บาท)</label>
        <input
          id="mo-discount"
          type="number"
          inputMode="decimal"
          min={0}
          placeholder="0"
          className="form-input"
          value={discount.value ?? ''}
          onChange={numChange(discount.onChange)}
          onBlur={discount.onBlur}
        />
      </div>
      <div>
        <label htmlFor="mo-vat" className="form-label">VAT (%)</label>
        <input
          id="mo-vat"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          placeholder="0"
          className="form-input"
          value={vatRate.value ?? ''}
          onChange={numChange(vatRate.onChange)}
          onBlur={vatRate.onBlur}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="mo-note" className="form-label">หมายเหตุ</label>
        <input
          id="mo-note"
          type="text"
          placeholder="เช่น ลูกค้าขอส่งวันจันทร์"
          aria-describedby="mo-note-hint"
          className="form-input"
          value={note.value ?? ''}
          onChange={note.onChange}
          onBlur={note.onBlur}
        />
        {/* คำรับประกันความเป็นส่วนตัวต้องอยู่ตลอด ไม่ใช่ใน placeholder ที่หายทันทีที่พิมพ์ตัวแรก —
            ผู้ขายที่กำลังจะพิมพ์เรื่องภายในต้องเห็นมันตอนกำลังพิมพ์ ไม่ใช่ตอนช่องยังว่าง */}
        <p id="mo-note-hint" className="mt-1 text-xs text-default-500">
          ลูกค้าไม่เห็นข้อความนี้
        </p>
      </div>
    </div>
  )
}
