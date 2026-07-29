'use client'

/**
 * NewKeywordForm — ฟอร์มสร้างกลุ่มคำ (feature 00023, S-13)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *   (`form-input` + label + helper text) และ ChecksRadioSwitches.tsx สำหรับ form-select
 *
 * toast ใช้ pacesToast เท่านั้น (Hard Rule 9)
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

const MATCH_TYPE_OPTIONS = [
  {
    value: 'CONTAINS',
    label: 'มีคำอยู่ในประโยค',
    hint: 'ลูกค้าพิมพ์ "สนใจครับ ราคาเท่าไหร่" ก็เข้ากลุ่มที่มีคำว่า "สนใจ" — ใช้ได้กับกรณีทั่วไปที่สุด',
  },
  {
    value: 'EXACT',
    label: 'ตรงทั้งข้อความ',
    hint: 'ลูกค้าต้องพิมพ์ตรงคำเป๊ะเท่านั้น เหมาะกับคำสั้นที่ถ้าใช้แบบอื่นจะไปดักคำถามอื่น',
  },
  {
    value: 'STARTS_WITH',
    label: 'ขึ้นต้นด้วยคำ',
    hint: 'ใช้เมื่อคำนั้นมักอยู่ต้นประโยคเสมอ',
  },
]

export default function NewKeywordForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [matchType, setMatchType] = useState('CONTAINS')
  const [busy, setBusy] = useState(false)

  const selectedHint = MATCH_TYPE_OPTIONS.find((o) => o.value === matchType)?.hint ?? ''

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/shops/auto-reply/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ name: name.trim(), matchType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'สร้างไม่สำเร็จ')
      pacesToast.success('สร้างกลุ่มคำแล้ว — ขั้นต่อไปใส่คำตรวจจับและคำตอบ')
      router.push(`/settings/auto-reply/${data.id}`)
    } catch (err) {
      pacesToast.error(err instanceof Error ? err.message : 'สร้างไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="card-header">
        <h5 className="text-default-800 text-base font-semibold">กลุ่มคำใหม่</h5>
      </div>
      <div className="card-body space-y-4">
        <div>
          <label htmlFor="kw-name" className="text-default-700 mb-1 block text-sm font-medium">
            ชื่อกลุ่มคำ
          </label>
          <input
            id="kw-name"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="เช่น สนใจสินค้า, ถามราคา, ถามเก็บปลายทาง"
            required
          />
          <p className="text-default-500 mt-1 text-xs">
            ชื่อนี้ใช้เรียกในหน้าตั้งค่าเท่านั้น ลูกค้าไม่เห็น
          </p>
        </div>

        <div>
          <label htmlFor="kw-match" className="text-default-700 mb-1 block text-sm font-medium">
            รูปแบบการตรวจจับ
          </label>
          <select
            id="kw-match"
            className="form-select"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
          >
            {MATCH_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-default-500 mt-1 text-xs">{selectedHint}</p>
        </div>

        <div className="border-default-200 bg-default-50 rounded border border-dashed p-3">
          <p className="text-default-600 text-sm">
            สร้างแล้วจะยังไม่ทำงานทันที — ต้องใส่คำตรวจจับและคำตอบก่อน แล้วจึงเปิดใช้งาน
          </p>
        </div>
      </div>
      <div className="card-footer flex items-center justify-end gap-2">
        <Link href="/settings/auto-reply" className="btn btn-soft-default">
          ยกเลิก
        </Link>
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? (
            <Icon icon="loader-2" className="me-1 animate-spin" aria-hidden="true" />
          ) : (
            <Icon icon="plus" className="me-1" aria-hidden="true" />
          )}
          สร้างแล้วไปตั้งค่าต่อ
        </button>
      </div>
    </form>
  )
}
