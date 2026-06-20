/**
 * Approve/reject actions for a verification record (PRD FR-10.3).
 *
 * Base: src/app/(paces)/seller/(dashboard)/verification/components/VerificationForm.tsx
 *       (same paces card + fetch + pacesToast submit pattern).
 *
 * Calls PATCH /api/admin/verifications/[id] with { status, rejectedReason? }.
 * On success: toast + router.push('/verifications').
 */
'use client'

import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'

type Props = {
  recordId: string
  /** True เมื่อ admin กำลังดู verification record ของตัวเอง (self-review guard). */
  isSelfRecord?: boolean
}

export default function ReviewActions({ recordId, isSelfRecord = false }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (isSelfRecord) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm flex items-start gap-2">
        <Icon icon="tabler:alert-triangle" className="text-warning text-lg shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold">ไม่สามารถตรวจสอบคำขอของตนเอง</strong>{' '}
          เพื่อป้องกันผลประโยชน์ทับซ้อน admin อื่นต้องเป็นผู้อนุมัติ/ปฏิเสธ record นี้
        </div>
      </div>
    )
  }

  async function submit(body: { status: 'APPROVED' | 'REJECTED'; rejectedReason?: string }) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/verifications/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? 'บันทึกการตรวจสอบไม่สำเร็จ')
        return
      }
      pacesToast.success(
        body.status === 'APPROVED' ? 'อนุมัติคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว',
      )
      router.push('/verifications')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      pacesToast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleApprove() {
    if (submitting) return
    void submit({ status: 'APPROVED' })
  }

  function handleReject() {
    if (submitting) return
    const trimmed = reason.trim()
    if (trimmed.length < 4) {
      pacesToast.error('กรุณากรอกเหตุผลที่ปฏิเสธอย่างน้อย 4 ตัวอักษร')
      return
    }
    void submit({ status: 'REJECTED', rejectedReason: trimmed })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="text-dark text-sm font-semibold">การตรวจสอบ</h4>
      </div>

      <div className="card-body space-y-4">
        {mode === 'idle' ? (
          <>
            <p className="text-default-500 text-sm">
              ตรวจสอบเอกสารแล้ว เลือกผลการตรวจสอบด้านล่าง หากอนุมัติระบบจะอัปเดตระดับการยืนยันและคำนวณ Trust Score ใหม่อัตโนมัติ
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={handleApprove}
                disabled={submitting}
                className="btn bg-success hover:bg-success-hover inline-flex items-center gap-2 px-5 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Icon icon="mdi:loading" width={16} height={16} className="animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <Icon icon="mdi:check-circle-outline" width={16} height={16} />
                    อนุมัติ
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMode('rejecting')}
                disabled={submitting}
                className="btn bg-danger hover:bg-danger-hover inline-flex items-center gap-2 px-5 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                <Icon icon="mdi:close-circle-outline" width={16} height={16} />
                ปฏิเสธ
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="rejectedReason" className="form-label">
                เหตุผลที่ปฏิเสธ<span className="text-danger"> *</span>
              </label>
              <textarea
                id="rejectedReason"
                rows={4}
                className="form-textarea"
                placeholder="เช่น เอกสารไม่ชัด / ข้อมูลไม่ตรงกับบัตรประชาชน / ขาดเอกสารจดทะเบียน"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
              />
              <p className="text-default-400 mt-1 text-xs">
                ข้อความนี้จะแสดงให้ผู้ส่งคำขอเห็น เพื่อให้แก้ไขก่อนส่งใหม่
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={handleReject}
                disabled={submitting}
                className="btn bg-danger hover:bg-danger-hover inline-flex items-center gap-2 px-5 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Icon icon="mdi:loading" width={16} height={16} className="animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <Icon icon="mdi:send-outline" width={16} height={16} />
                    ยืนยันการปฏิเสธ
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('idle')
                  setReason('')
                }}
                disabled={submitting}
                className="btn border-default-300 bg-card text-default-700 hover:bg-default-50 border px-5 py-2.5"
              >
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
