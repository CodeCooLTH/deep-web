'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Paces toast (Hard Rule 9 — admin ใช้ pacesToast เท่านั้น)
import { pacesToast } from '@/lib/paces-toast'
import Icon from '@/components/wrappers/Icon'

const ReviewActions = ({ id, status }: { id: string; status: string }) => {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (status !== 'PENDING') {
    return (
      <p className="text-default-500 text-sm">
        รายงานนี้ถูก{status === 'APPROVED' ? 'อนุมัติ' : 'ปฏิเสธ'}แล้ว
      </p>
    )
  }

  const submit = async (newStatus: 'APPROVED' | 'REJECTED') => {
    if (newStatus === 'REJECTED' && reason.trim().length < 3) {
      pacesToast.warning('กรุณาระบุเหตุผลที่ปฏิเสธ')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/scam-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, rejectedReason: reason.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        pacesToast.error(d.error ?? 'ดำเนินการไม่สำเร็จ')
        return
      }
      pacesToast.success(newStatus === 'APPROVED' ? 'อนุมัติรายงานแล้ว' : 'ปฏิเสธรายงานแล้ว')
      router.push('/scam-reports')
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="form-input"
        rows={2}
        placeholder="เหตุผล (จำเป็นเมื่อปฏิเสธ)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-3">
        <button
          disabled={busy}
          onClick={() => submit('APPROVED')}
          className="btn bg-success hover:bg-success/90 inline-flex items-center gap-1.5 text-white disabled:opacity-60"
        >
          <Icon icon="circle-check" className="text-base" /> อนุมัติ
        </button>
        <button
          disabled={busy}
          onClick={() => submit('REJECTED')}
          className="btn bg-danger hover:bg-danger/90 inline-flex items-center gap-1.5 text-white disabled:opacity-60"
        >
          <Icon icon="x" className="text-base" /> ปฏิเสธ
        </button>
      </div>
    </div>
  )
}

export default ReviewActions
