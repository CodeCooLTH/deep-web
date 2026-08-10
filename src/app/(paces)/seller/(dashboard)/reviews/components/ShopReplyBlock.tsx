'use client'

/**
 * ShopReplyBlock — คำตอบของร้านต่อรีวิว 1 ใบ (feature 00041, BR-BOE-21/22)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (.btn primitive)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (.badge primitive)
 * Base (in-repo precedent): src/app/(paces)/seller/(chat)/inbox/comments/PrivateReplyModal.tsx
 *   (form-textarea + ตัวนับตัวอักษร + สถานะ overLimit)
 *
 * มี 3 สถานะในตัวเดียว: ยังไม่ตอบ / กำลังพิมพ์ / ตอบแล้ว
 *
 * 🛑 ไม่มี badge "ตอบแล้ว" สีเขียว — Verified-Means-Green สงวนเขียวไว้กับข้อเท็จจริงที่ระบบ
 * ยืนยันได้ ส่วน "ร้านตอบไปแล้ว" พิสูจน์ตัวเองด้วยคำตอบที่แสดงอยู่ตรงนั้น (show, don't tell)
 * — แพตเทิร์นเดียวกับ `/inbox/comments` ที่ HUMAN_ANSWERED ก็ไม่มี badge สำเร็จ
 *
 * 🛑 ไม่ใส่ `maxLength` ตัดดิบที่ textarea — ผู้ใช้วางข้อความยาวมาแล้วโดนตัดหางทิ้งเงียบ ๆ
 * จะไม่รู้ตัวว่าอะไรหายไป ให้พิมพ์เกินได้แล้วบล็อกที่ปุ่มบันทึกแทน (กติกาเดียวกับ PrivateReplyModal)
 */

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'

/** ต้องตรงกับ ReplyToReviewSchema ฝั่ง server — เกินนี้ API ปฏิเสธ 400 */
const MAX_REPLY_LENGTH = 1000

type Props = {
  orderToken: string
  reply: { comment: string; repliedAtISO: string } | null
  /** เปิดฟอร์มอยู่ไหม — ยกขึ้นไปไว้ที่ตารางเพื่อบังคับให้เปิดได้ทีละแถว */
  editing: boolean
  onOpen: () => void
  onClose: () => void
  /**
   * 🛑 ดราฟต์เก็บที่ตาราง ไม่ใช่ state ในนี้ — สองเหตุผลที่คนละเรื่องกัน:
   * 1. เปิดแถวอื่น/สลับแท็บ/เปลี่ยนหน้า ทำให้แถวเดิมถูก unmount ⇒ ถ้าเก็บในนี้ ข้อความที่พิมพ์
   *    ค้างไว้จะหายเงียบ ๆ ไม่มี error ไม่มี toast แยกไม่ออกจาก "แอปกินข้อความที่พิมพ์ไป"
   * 2. เดสก์ท็อป (hidden lg:block) กับมือถือ (lg:hidden) render แถวเดียวกัน "พร้อมกันทั้งคู่"
   *    ⇒ ถ้าเก็บในนี้จะได้ดราฟต์คนละชุด แล้วหมุนจอข้าม 1024px จะสลับไปอีกชุดกลางคัน
   */
  draft: string
  onDraftChange: (value: string) => void
  /** มือถือให้ปุ่มเต็มความกว้าง + tap target ใหญ่ขึ้น */
  compact?: boolean
}

const ShopReplyBlock = ({
  orderToken,
  reply,
  editing,
  onOpen,
  onClose,
  draft,
  onDraftChange,
  compact = false,
}: Props) => {
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const trimmed = draft.trim()
  const overLimit = trimmed.length > MAX_REPLY_LENGTH

  const handleSave = async () => {
    if (!trimmed || overLimit) return

    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${orderToken}/review/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: trimmed }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        // ข้อความจาก API บอกเหตุผลจริง (403 ไม่มีสิทธิ์ / 404 ไม่พบรีวิว) — ใช้ก่อน fallback เสมอ
        pacesToast.error(data?.error || 'บันทึกคำตอบไม่สำเร็จ ลองใหม่อีกครั้ง')

        return
      }

      pacesToast.success('บันทึกคำตอบแล้ว')
      onClose()
      router.refresh()
    } catch {
      // เน็ตหลุด/ยิงไม่ออก — ฟอร์มยังเปิดค้างพร้อมข้อความที่พิมพ์ไว้ ไม่เสียงานที่พิมพ์มา
      pacesToast.error('บันทึกคำตอบไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const ok = await pacesConfirm.danger(
      'ลบคำตอบนี้?',
      'คำตอบจะหายจากหน้าที่ลูกค้าเห็นทันที และกู้คืนไม่ได้',
      { confirmButtonText: 'ลบคำตอบ', cancelButtonText: 'ยกเลิก' },
    )
    if (!ok) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/orders/${orderToken}/review/reply`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        pacesToast.error(data?.error || 'ลบคำตอบไม่สำเร็จ ลองใหม่อีกครั้ง')

        return
      }

      pacesToast.success('ลบคำตอบแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('ลบคำตอบไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setDeleting(false)
    }
  }

  // ── สถานะ 2: กำลังพิมพ์ ──────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="border-primary bg-primary/5 mt-2.5 rounded-e-md border-s-3 p-2.5">
        <p className="text-primary mb-1.5 text-xs font-semibold">คำตอบร้าน</p>
        <textarea
          className="form-textarea w-full"
          rows={3}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="พิมพ์คำตอบถึงลูกค้า..."
          disabled={saving}
          autoFocus
        />
        {/* 🛑 มือถือ: ตัวนับขึ้นบรรทัดของตัวเอง + ปุ่มสูง 44px
            `btn-sm` = ~31.5px ต่ำกว่าเกณฑ์นิ้ว และสองปุ่มนี้คือปุ่มที่ต้องกดจริงเพื่อบันทึกคำตอบ
            — สาขา editing เดิมไม่อ่าน `compact` เลยทั้งที่อีกสองสาขาอ่าน */}
        <div className={`mt-1.5 gap-2 ${compact ? 'flex flex-col' : 'flex items-center justify-between'}`}>
          <span className={`text-xs tabular-nums ${overLimit ? 'text-danger-ink' : 'text-default-400'}`}>
            {trimmed.length.toLocaleString('th-TH')} / {MAX_REPLY_LENGTH.toLocaleString('th-TH')}
          </span>
          <div className={`flex items-center gap-2 ${compact ? 'w-full' : ''}`}>
            <button
              type="button"
              className={`btn bg-light ${compact ? 'min-h-11 flex-1 justify-center' : 'btn-sm'}`}
              onClick={onClose}
              disabled={saving}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className={`btn bg-primary hover:bg-primary-hover text-white ${compact ? 'min-h-11 flex-1 justify-center' : 'btn-sm'}`}
              onClick={handleSave}
              disabled={saving || !trimmed || overLimit}
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกคำตอบ'}
            </button>
          </div>
        </div>
        {/* 🛑 ที่เดียวที่ระบบเคยยอมรับว่าคำตอบนี้เป็นสาธารณะ คือตอน "ลบ" — บอกตอนกำลังจะเอาคืน
            แต่ไม่บอกตอนกำลังจะพูด. Deep ตั้งอยู่บนความน่าเชื่อถือที่ร้านเขียนเองไม่ได้ และหน้านี้
            คือที่เดียวที่ร้านเขียนลงบันทึกสาธารณะได้ — มักเขียนตอนกำลังโมโหรีวิว 1 ดาวพอดี */}
        <p className="text-default-500 mt-1.5 flex items-start gap-1 text-xs">
          <Icon icon="eye" className="mt-0.5 shrink-0 text-sm" />
          ลูกค้าจะเห็นคำตอบนี้ในหน้าคำสั่งซื้อของเขา
        </p>
        {overLimit && (
          <p className="text-danger-ink mt-1 text-xs">
            ยาวเกิน {MAX_REPLY_LENGTH.toLocaleString('th-TH')} ตัวอักษร กรุณาตัดให้สั้นลงก่อนบันทึก
          </p>
        )}
      </div>
    )
  }

  // ── สถานะ 3: ตอบแล้ว ─────────────────────────────────────────────────────
  if (reply) {
    return (
      <div className="border-primary bg-primary/5 mt-2.5 rounded-e-md border-s-3 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-primary text-xs font-semibold">ร้านตอบกลับ</p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="แก้ไขคำตอบ"
              onClick={onOpen}
              disabled={deleting}
              className={`btn btn-icon text-default-500 hover:text-default-800 ${compact ? 'size-11' : 'btn-sm'}`}
            >
              <Icon icon="pencil" className="text-base" />
            </button>
            <button
              type="button"
              aria-label="ลบคำตอบ"
              onClick={handleDelete}
              disabled={deleting}
              className={`btn btn-icon text-default-500 hover:text-danger ${compact ? 'size-11' : 'btn-sm'}`}
            >
              <Icon icon="trash" className="text-base" />
            </button>
          </div>
        </div>
        <p className="text-default-700 text-sm whitespace-pre-wrap">{reply.comment}</p>
        <p className="text-default-400 mt-1 text-xs">ตอบเมื่อ {formatDateTime(reply.repliedAtISO)}</p>
      </div>
    )
  }

  // ── สถานะ 1: ยังไม่ตอบ ────────────────────────────────────────────────────
  return (
    <div className={`mt-2.5 flex items-center gap-2.5 ${compact ? 'flex-col items-stretch' : ''}`}>
      <span className="badge bg-danger/15 text-danger-ink self-start">ยังไม่ตอบ</span>
      <button
        type="button"
        onClick={onOpen}
        className={`btn btn-sm bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 ${
          compact ? 'min-h-11 w-full justify-center' : ''
        }`}
      >
        <Icon icon="message-2" className="text-base" />
        ตอบกลับรีวิวนี้
      </button>
    </div>
  )
}

export default ShopReplyBlock
