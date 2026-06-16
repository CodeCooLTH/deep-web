/**
 * CancelOrderButton — ปุ่มยกเลิกออเดอร์ (แยกจาก OrderActions; OrderSummary เป็น RSC)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 * (logic extract จาก OrderActions ซึ่งตัวมันเอง Base จาก theme file นี้)
 *
 * copy handleCancel logic จาก OrderActions:
 *   confirm → POST /api/orders/{token}/cancel → toast.success → router.refresh; error → toast.error
 * render เฉพาะ status=PENDING หรือ SHIPPED
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'

export interface CancelOrderButtonProps {
  publicToken: string
  status: string
}

export default function CancelOrderButton({ publicToken, status }: CancelOrderButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // แสดงเฉพาะ PENDING หรือ SHIPPED — terminal state ไม่ต้องยกเลิก
  if (status !== 'PENDING' && status !== 'SHIPPED') return null

  const handleCancel = async () => {
    if (!confirm('ยืนยันการยกเลิกออเดอร์นี้?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/cancel`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'ไม่สามารถยกเลิกออเดอร์ได้')
      }
      toast.success('ยกเลิกแล้ว')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถยกเลิกออเดอร์ได้'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={loading}
      className="btn border border-danger text-danger hover:bg-danger/10 px-4 py-2 text-sm font-medium disabled:opacity-60 w-full"
    >
      {loading ? 'กำลังยกเลิก...' : 'ยกเลิกออเดอร์'}
    </button>
  )
}
