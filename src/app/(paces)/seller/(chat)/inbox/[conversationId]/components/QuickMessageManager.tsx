'use client'

/**
 * QuickMessageManager — modal จัดการข้อความสำเร็จรูป (CRUD) — feature 00018 composer improvement #2
 *
 * Shell: copy pattern จาก (dashboard)/dashboard/components/SalesChartSheet.tsx
 *   (fixed inset-0 flex, header title+close, ESC ปิด, role="dialog") — centered modal บน desktop
 *   (items-center justify-center + card max-w) / เกือบเต็มจอบนมือถือ
 * Form field: Base theme/paces form/elements (form-input/form-label/textarea) — Paces primitive (HR7)
 * ปุ่มลบ = pacesConfirm (Sweet Alerts — Hard Rule 8 confirm dialog)
 * upload รูป: reuse POST /api/upload (คืน {fileId}) เหมือน composer แนบรูป
 *
 * ข้อความสำเร็จรูปผูกระดับร้าน — ทุกคนในร้านเห็น/แก้ชุดเดียวกัน (ผลตัดสินผู้ใช้ 2026-07-23)
 */
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'

// client-side type (ไม่ import service — เลี่ยง prisma เข้า client bundle)
export type QuickMessage = {
  id: string
  title: string
  category: string | null
  body: string
  imageFileId: string | null
  createdAt: string
}

type Props = {
  items: QuickMessage[]
  onClose: () => void
  onChanged: () => void // ให้ parent refetch หลังสร้าง/แก้/ลบ
}

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
const IMAGE_MAX = 5 * 1024 * 1024

export default function QuickMessageManager({ items, onClose, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [body, setBody] = useState('')
  const [imageFileId, setImageFileId] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isEditing = editingId !== null
  const canSave = title.trim().length > 0 && (body.trim().length > 0 || imageFileId !== null)

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setCategory('')
    setBody('')
    setImageFileId(null)
    setImagePreview(null)
  }

  function startEdit(qm: QuickMessage) {
    setEditingId(qm.id)
    setTitle(qm.title)
    setCategory(qm.category ?? '')
    setBody(qm.body)
    setImageFileId(qm.imageFileId)
    setImagePreview(qm.imageFileId ? `/api/files/${qm.imageFileId}` : null)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!IMAGE_ACCEPT.split(',').includes(file.type)) {
      pacesToast.error('รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp, gif)')
      return
    }
    if (file.size > IMAGE_MAX) {
      pacesToast.error('ไฟล์รูปต้องไม่เกิน 5MB')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('upload failed')
      const data: { fileId: string } = await res.json()
      setImageFileId(data.fileId)
      setImagePreview(`/api/files/${data.fileId}`)
    } catch {
      pacesToast.error('อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        category: category.trim() || null,
        body: body,
        imageFileId,
      }
      const url = isEditing ? `/api/chat/quick-messages/${editingId}` : '/api/chat/quick-messages'
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        pacesToast.error(d?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      pacesToast.success(isEditing ? 'แก้ไขข้อความสำเร็จรูปแล้ว' : 'เพิ่มข้อความสำเร็จรูปแล้ว')
      resetForm()
      onChanged()
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(qm: QuickMessage) {
    const ok = await pacesConfirm.danger('ลบข้อความสำเร็จรูป', `ต้องการลบ "${qm.title}" หรือไม่?`, {
      confirmButtonText: 'ลบ',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/chat/quick-messages/${qm.id}`, { method: 'DELETE' })
      if (!res.ok) {
        pacesToast.error('ลบไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      pacesToast.success('ลบแล้ว')
      if (editingId === qm.id) resetForm()
      onChanged()
    } catch {
      pacesToast.error('ลบไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-label="จัดการข้อความสำเร็จรูป"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="card bg-card flex max-h-full w-full flex-col rounded-b-none sm:max-w-lg sm:rounded-lg">
        {/* header */}
        <div className="card-header flex items-center justify-between">
          <h5 className="mb-0 flex items-center gap-2 text-base">
            <Icon icon="message-2-bolt" className="text-primary text-lg" />
            จัดการข้อความสำเร็จรูป
          </h5>
          <button type="button" onClick={onClose} className="btn btn-icon border-default-300" aria-label="ปิด">
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 grow overflow-y-auto p-4">
          {/* ── form (เพิ่ม/แก้) ── */}
          <div className="border-default-200 mb-4 rounded-lg border p-3">
            <p className="text-default-700 mb-3 text-sm font-semibold">
              {isEditing ? 'แก้ไขข้อความสำเร็จรูป' : 'เพิ่มข้อความสำเร็จรูป'}
            </p>

            <div className="mb-3">
              <label className="form-label">หัวข้อ</label>
              <input
                type="text"
                className="form-input"
                placeholder="เช่น ทักทาย, แจ้งเลขพัสดุ"
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">หมวด (ไม่บังคับ)</label>
              <input
                type="text"
                className="form-input"
                placeholder="เช่น การจัดส่ง, ราคา"
                value={category}
                maxLength={40}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">ข้อความ</label>
              <textarea
                className="form-input min-h-24"
                placeholder="พิมพ์เนื้อหาข้อความสำเร็จรูป..."
                value={body}
                maxLength={2000}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            {/* รูปแนบ (ไม่บังคับ) */}
            <div className="mb-3">
              <label className="form-label">รูปแนบ (ไม่บังคับ)</label>
              {imagePreview ? (
                <div className="flex items-center gap-2">
                  <div className="border-default-200 relative size-16 overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="รูปแนบ" className="size-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImageFileId(null)
                      setImagePreview(null)
                    }}
                    className="btn btn-sm border-default-300"
                  >
                    <Icon icon="trash" className="me-1" /> ลบรูป
                  </button>
                </div>
              ) : (
                <label className="btn btn-sm border-default-300 cursor-pointer">
                  <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={handleUpload} disabled={uploading} />
                  <Icon icon={uploading ? 'loader-2' : 'photo-plus'} className={`me-1 ${uploading ? 'animate-spin' : ''}`} />
                  {uploading ? 'กำลังอัปโหลด...' : 'เพิ่มรูป'}
                </label>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || saving}
                className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
              >
                <Icon icon={saving ? 'loader-2' : 'check'} className={`me-1 ${saving ? 'animate-spin' : ''}`} />
                {isEditing ? 'บันทึกการแก้ไข' : 'เพิ่ม'}
              </button>
              {isEditing && (
                <button type="button" onClick={resetForm} className="btn border-default-300">
                  ยกเลิก
                </button>
              )}
            </div>
          </div>

          {/* ── list ── */}
          <p className="text-default-500 mb-2 text-2xs font-semibold">
            ทั้งหมด {items.length} รายการ
          </p>
          {items.length === 0 ? (
            <div className="text-default-400 py-6 text-center text-sm">ยังไม่มีข้อความสำเร็จรูป</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((qm) => (
                <li key={qm.id} className="border-default-200 flex items-start gap-3 rounded-lg border p-3">
                  {qm.imageFileId && (
                    <div className="border-default-200 size-10 shrink-0 overflow-hidden rounded border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${qm.imageFileId}`} alt="" className="size-full object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 grow">
                    <div className="flex items-center gap-2">
                      <p className="text-default-800 mb-0 truncate text-sm font-semibold">{qm.title}</p>
                      {qm.category && <span className="badge bg-default-100 text-default-500 text-2xs shrink-0">{qm.category}</span>}
                    </div>
                    {qm.body && <p className="text-default-500 mb-0 mt-0.5 line-clamp-2 text-xs">{qm.body}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => startEdit(qm)} className="btn btn-sm btn-icon border-default-300" aria-label="แก้ไข">
                      <Icon icon="pencil" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(qm)}
                      className="btn btn-sm btn-icon border-default-300 text-danger"
                      aria-label="ลบ"
                    >
                      <Icon icon="trash" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
