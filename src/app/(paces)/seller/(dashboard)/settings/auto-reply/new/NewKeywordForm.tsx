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
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'

export default function NewKeywordForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)


  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/shops/auto-reply/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ name: name.trim() }),
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


        <div className="border-default-200 bg-default-50 rounded border border-dashed p-3">
          <p className="text-default-600 text-sm">
            สร้างแล้วจะอยู่สถานะ "ไม่ใช้งาน" ก่อนเสมอ — ใส่คำตรวจจับกับคำตอบให้ครบ
            แล้วค่อยเลือกว่าจะทดสอบกับแชทที่ระบุ หรือให้ตอบลูกค้าจริง
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
