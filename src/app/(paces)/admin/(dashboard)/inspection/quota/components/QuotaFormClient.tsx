'use client'

/**
 * QuotaFormClient — form-input ตัวเลขโควตาต่อขั้น + ปุ่มบันทึก (feature 00060 · T13 · API §4.10-4.11)
 *
 * Base: `_forms.css` (`form-input`) + `.card` — ไม่มี theme page เฉพาะสำหรับหน้าโควตา (ร่างสั้น
 * ตาม UX Design Spec Surface D) ยึด primitive ตาม §4/§7 ของ paces-component-reference.md
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { INSPECTION_STEP_LABEL_TH, type InspectionStep } from '@/lib/inspection/checks'

type QuotaRow = { step: InspectionStep; capacity: number; used: number; remaining: number; seeded: boolean }

type Props = {
  initialYear: number
  initialMonth: number
  initialQuotas: QuotaRow[]
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export default function QuotaFormClient({ initialYear, initialMonth, initialQuotas }: Props) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [quotas, setQuotas] = useState(initialQuotas)
  const [capacityInputs, setCapacityInputs] = useState<Record<number, string>>(() =>
    Object.fromEntries(initialQuotas.map((q) => [q.step, String(q.capacity)])),
  )
  const [savingStep, setSavingStep] = useState<number | null>(null)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [notes, setNotes] = useState<Record<number, string>>({})

  const loadMonth = async (y: number, m: number) => {
    setLoadingMonth(true)
    try {
      const res = await fetch(`/api/admin/inspection/quota?year=${y}&month=${m}`)
      const data = (await res.json().catch(() => null)) as { quotas: QuotaRow[] } | { message?: string } | null
      if (!res.ok || data === null || !('quotas' in data)) {
        pacesToast.error((data as { message?: string } | null)?.message ?? 'โหลดโควตาไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      setYear(y)
      setMonth(m)
      setQuotas(data.quotas)
      setCapacityInputs(Object.fromEntries(data.quotas.map((q) => [q.step, String(q.capacity)])))
      setNotes({})
    } finally {
      setLoadingMonth(false)
    }
  }

  const shiftMonth = (delta: number) => {
    let y = year
    let m = month + delta
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    void loadMonth(y, m)
  }

  const saveStep = async (step: InspectionStep) => {
    const raw = capacityInputs[step] ?? ''
    const capacity = Number(raw)
    if (!Number.isInteger(capacity) || capacity < 0) {
      pacesToast.error('โควตาต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป')
      return
    }
    setSavingStep(step)
    try {
      const res = await fetch('/api/admin/inspection/quota', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ year, month, step, capacity }),
      })
      const data = (await res.json().catch(() => null)) as
        | { capacity: number; used: number; remaining: number; overCommitted: boolean; nextMonthCapacity: number | null }
        | { message?: string }
        | null
      if (!res.ok || data === null || !('capacity' in data)) {
        pacesToast.error((data as { message?: string } | null)?.message ?? 'บันทึกโควตาไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      setQuotas((qs) =>
        qs.map((q) => (q.step === step ? { ...q, capacity: data.capacity, used: data.used, remaining: data.remaining, seeded: true } : q)),
      )
      const noteParts: string[] = []
      if (data.overCommitted) noteParts.push('รับไปแล้วเกินเพดานใหม่นี้ — เดือนนี้ปิดรับเพิ่มทันที')
      noteParts.push(
        data.nextMonthCapacity === null
          ? 'เดือนถัดไปยังไม่มีโควตาตั้งไว้ (แก้แยกต่างหาก)'
          : `เดือนถัดไปตั้งไว้ที่ ${data.nextMonthCapacity} (การแก้ครั้งนี้ไม่ย้อนไปถึง)`,
      )
      setNotes((n) => ({ ...n, [step]: noteParts.join(' · ') }))
      pacesToast.success(`บันทึกโควตาขั้น${INSPECTION_STEP_LABEL_TH[step]}แล้ว`)
    } finally {
      setSavingStep(null)
    }
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between gap-2">
        <h4 className="card-title">โควตารับสมัครรายเดือน</h4>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftMonth(-1)} disabled={loadingMonth} className="btn btn-icon btn-sm border border-default-300 text-default-800">
            <Icon icon="chevron-left" className="size-4" aria-hidden="true" />
          </button>
          <span className="min-w-32 text-center text-sm font-semibold text-default-800">
            {THAI_MONTHS[month - 1]} {year}
          </span>
          <button type="button" onClick={() => shiftMonth(1)} disabled={loadingMonth} className="btn btn-icon btn-sm border border-default-300 text-default-800">
            <Icon icon="chevron-right" className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="card-body space-y-4">
        {quotas.map((q) => (
          <div key={q.step} className="flex flex-col gap-2 border-b border-dashed border-default-200 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-default-900">{INSPECTION_STEP_LABEL_TH[q.step]}</p>
              {/* 🛑 "เหลือรับ 0" ที่แปลว่า **ยังไม่ได้ตั้งโควตา** ต้องไม่แสดงเหมือน 0 ที่แปลว่า **เต็ม**
                  — ฝั่งร้านแยกสองอย่างนี้ไว้แล้ว แต่จอที่ใช้ *แก้* ปัญหากลับยุบเป็นเลขเดียวกัน
                  ซึ่งเป็นเคสที่คอมเมนต์ใน `api/seller/inspection/_shared.ts` เตือนไว้เองตรง ๆ */}
              <p className="mt-0.5 text-xs text-default-500">
                {q.seeded
                  ? `รับไปแล้ว ${q.used} ราย · เหลือรับ ${q.remaining} ราย`
                  : 'ยังไม่เปิดรับสมัครเดือนนี้ (ยังไม่ได้ตั้งโควตา)'}
              </p>
              {notes[q.step] && <p className="mt-1 text-2xs text-warning-ink">{notes[q.step]}</p>}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={capacityInputs[q.step] ?? ''}
                onChange={(e) => setCapacityInputs((c) => ({ ...c, [q.step]: e.target.value }))}
                className="form-input form-input-sm w-24 text-end"
                aria-label={`โควตาขั้น${INSPECTION_STEP_LABEL_TH[q.step]}`}
              />
              <button
                type="button"
                disabled={savingStep === q.step}
                onClick={() => void saveStep(q.step)}
                className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {savingStep === q.step ? <Icon icon="loader-2" className="size-4 animate-spin" aria-hidden="true" /> : 'บันทึก'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
