/**
 * โมดัล "สั่งงานใหม่" — จุดเดียวที่ใบงานเกิดขึ้นได้ (FR-CC-02: งานมาจาก user สั่งเท่านั้น)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/PipelinePage.tsx (โมดัลเพิ่มการ์ด)
 * 🛑 controlled div ไม่ใช่ Preline `hs-overlay` (แพตเทิร์นมาตรฐานของโปรเจกต์) ⇒ **ต้องเรียก
 *    `useLockBodyScroll` เอง** เพราะการล็อกที่เคยได้ฟรีจาก `HSOverlay.open()` หายไปพร้อมการแปลง
 *    (docs/conventions/overlay-scroll-lock.md — พลาดพร้อมกันมาแล้ว 11 ใบ)
 */

'use client'

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

type Props = {
  onClose: () => void
  onCreated: (created: { number: number; url: string }) => void
}

export default function NewTaskModal({ onClose, onCreated }: Props) {
  useLockBodyScroll(true)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !saving

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/command-center/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        // ข้อความจาก server เป็นภาษาไทยอยู่แล้ว — แสดงตรง ๆ ดีกว่าแทนที่ด้วยคำกลาง ๆ
        setError(body?.error ?? 'สั่งงานไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      onCreated(body)
    } catch {
      setError('สั่งงานไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-default-900/50 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        className="card max-h-full w-full max-w-lg overflow-y-auto overscroll-contain sm:mx-4">
        <div className="card-header flex-nowrap items-center justify-between">
          <h5 id="new-task-title" className="card-title">
            สั่งงานใหม่
          </h5>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="btn btn-icon btn-sm text-default-500">
            <Icon icon="x" className="size-4" />
          </button>
        </div>

        <div className="p-4">
          <label htmlFor="task-title" className="mb-1 block text-sm text-default-700">
            หัวข้องาน
          </label>
          <input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="เช่น แก้บั๊กหน้าแรกโหลดช้า"
            className="form-input mb-4 w-full"
          />

          <label htmlFor="task-desc" className="mb-1 block text-sm text-default-700">
            รายละเอียด
          </label>
          <textarea
            id="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={6}
            placeholder="อธิบายสิ่งที่ต้องการให้ละเอียดเท่าที่ทำได้ — ขั้นวางแผนจะอ่านจากตรงนี้อย่างเดียว"
            className="form-input w-full"
          />

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-danger/15 p-3">
              <Icon icon="alert-circle" className="mt-0.5 size-4 shrink-0 text-danger-ink" />
              <p className="text-sm text-danger-ink">{error}</p>
            </div>
          )}
        </div>

        <div className="card-header flex-nowrap justify-end gap-2 border-t border-default-200">
          <button type="button" onClick={onClose} className="btn border border-default-300 bg-card text-default-700 hover:bg-default-50" disabled={saving}>
            ยกเลิก
          </button>
          <button type="button" onClick={submit} className="btn bg-primary text-white hover:bg-primary-hover" disabled={!canSubmit}>
            {saving ? 'กำลังสั่งงาน…' : 'สั่งงาน'}
          </button>
        </div>
      </div>
    </div>
  )
}
