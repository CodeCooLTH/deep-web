'use client'

/**
 * MoreOptions — เนื้อ "เพิ่มเติม" (collapsible) ของ quick create: ส่วนลด / VAT / หมายเหตุ
 * (แท็ก = ตัดออก — FormValues ไม่มี field tag; mockup โชว์เป็นตัวอย่าง)
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
    <div className="grid gap-3 px-4 pb-3 sm:grid-cols-2 md:px-8">
      <div>
        <label className="form-label">ส่วนลด (บาท)</label>
        <input
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
        <label className="form-label">VAT (%)</label>
        <input
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
        <label className="form-label">หมายเหตุ</label>
        <input
          type="text"
          placeholder="โน้ตภายใน (ไม่แสดงให้ลูกค้า)"
          className="form-input"
          value={note.value ?? ''}
          onChange={note.onChange}
          onBlur={note.onBlur}
        />
      </div>
    </div>
  )
}
