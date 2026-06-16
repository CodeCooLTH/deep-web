/**
 * Approve/reject actions for a top-up request (SMS-Wallet feature, FR-6.3/D2).
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/components/IssueDetailModal.tsx
 *       (action block — card + submit pattern; same theme ancestor as in-proj precedent
 *        src/app/(paces)/admin/(dashboard)/verifications/[id]/ReviewActions.tsx)
 *
 * ADAPT — API ต่างจาก verifications:
 *   approve: POST /api/admin/topups/{id}/approve — ไม่มี body
 *   reject:  POST /api/admin/topups/{id}/reject  — body { reason: string }
 *   (verifications ใช้ PATCH single endpoint + status field)
 *
 * RC-7: isSelfRecord=true → ซ่อนปุ่มทั้งหมด + แสดง banner (server-gated อยู่แล้ว — UI เป็นชั้นแรก)
 * RC-8: ไม่รับ/log PII ใด ๆ — prop มีแค่ topupId+isSelfRecord
 */
'use client'

import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'

type Props = {
  topupId: string
  /** คำนวณ server-side: admin.id === record.shop.userId — ห้าม approve/reject ของตัวเอง (RC-7) */
  isSelfRecord: boolean
}

export default function TopUpReviewActions({ topupId, isSelfRecord }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // RC-7 self-block: ซ่อนปุ่มทั้งหมด + แสดง banner เตือน
  if (isSelfRecord) {
    return (
      <div
        role="alert"
        className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm flex items-start gap-2"
      >
        <Icon icon="tabler:alert-triangle" className="text-warning text-lg shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold">ไม่สามารถดำเนินการคำขอของร้านตัวเอง</strong>{' '}
          — admin อื่นต้องเป็นผู้อนุมัติ/ปฏิเสธ
        </div>
      </div>
    )
  }

  async function handleApprove() {
    if (submitting) return
    setSubmitting(true)
    try {
      // approve: POST ไม่มี body (ต่างจาก verifications PATCH)
      const res = await fetch(`/api/admin/topups/${topupId}/approve`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 409) {
          pacesToast.error('คำขอนี้ถูกดำเนินการไปแล้ว')
        } else if (res.status === 403) {
          pacesToast.error('ไม่มีสิทธิ์ดำเนินการคำขอนี้')
        } else {
          pacesToast.error((data as { error?: string })?.error ?? 'อนุมัติไม่สำเร็จ กรุณาลองใหม่')
        }
        return
      }
      pacesToast.success('อนุมัติคำขอเติมเครดิตแล้ว')
      router.push('/topups')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (submitting) return
    const trimmed = reason.trim()
    if (trimmed.length < 1) {
      pacesToast.error('กรุณากรอกเหตุผลที่ปฏิเสธ')
      return
    }
    setSubmitting(true)
    try {
      // reject: POST + body { reason } (ต่างจาก verifications PATCH { status, rejectedReason })
      const res = await fetch(`/api/admin/topups/${topupId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 409) {
          pacesToast.error('คำขอนี้ถูกดำเนินการไปแล้ว')
        } else if (res.status === 403) {
          pacesToast.error('ไม่มีสิทธิ์ดำเนินการคำขอนี้')
        } else {
          pacesToast.error((data as { error?: string })?.error ?? 'ปฏิเสธไม่สำเร็จ กรุณาลองใหม่')
        }
        return
      }
      pacesToast.success('ปฏิเสธคำขอเติมเครดิตแล้ว')
      router.push('/topups')
      router.refresh()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
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
              ตรวจสอบสลิปแล้ว เลือกผลการตรวจสอบด้านล่าง หากอนุมัติระบบจะเติมเครดิตให้ร้านค้าอัตโนมัติ
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              {/* approve 1-click ไม่มี confirm dialog — Controller decision LOCKED */}
              <button
                type="button"
                onClick={() => void handleApprove()}
                disabled={submitting}
                aria-busy={submitting}
                className="btn bg-success hover:bg-success-hover inline-flex items-center gap-2 px-5 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Icon icon="tabler:loader-2" width={16} height={16} className="animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <Icon icon="tabler:circle-check" width={16} height={16} />
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
                <Icon icon="tabler:x" width={16} height={16} />
                ปฏิเสธ
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="rejectReason" className="form-label">
                เหตุผลที่ปฏิเสธ<span className="text-danger"> *</span>
              </label>
              <textarea
                id="rejectReason"
                rows={4}
                aria-required="true"
                className="form-textarea"
                placeholder="เช่น สลิปไม่ชัด / จำนวนไม่ตรง"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                maxLength={500}
              />
              <p className="text-default-400 mt-1 text-xs">
                ข้อความนี้จะแสดงให้เจ้าของร้านทราบ (1–500 ตัวอักษร)
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={() => void handleReject()}
                disabled={submitting || reason.trim().length < 1}
                aria-busy={submitting}
                className="btn bg-danger hover:bg-danger-hover inline-flex items-center gap-2 px-5 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Icon icon="tabler:loader-2" width={16} height={16} className="animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <Icon icon="tabler:send" width={16} height={16} />
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
