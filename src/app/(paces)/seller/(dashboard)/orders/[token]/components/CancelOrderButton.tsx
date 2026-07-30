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
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'

export interface CancelOrderButtonProps {
  publicToken: string
  status: string
  /** className เพิ่มเติม — optional, ไม่กระทบ caller เดิม (default undefined) */
  className?: string
}

export default function CancelOrderButton({ publicToken, status, className }: CancelOrderButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // แสดงเฉพาะ PENDING หรือ SHIPPED — terminal state ไม่ต้องยกเลิก
  if (status !== 'PENDING' && status !== 'SHIPPED') return null

  const handleCancel = async () => {
    const ok = await pacesConfirm.danger('ยกเลิกคำสั่งซื้อนี้?', 'สินค้าจะถูกคืนเข้าสต็อก · ลิงก์ที่ส่งให้ผู้ซื้อจะใช้ไม่ได้ · ย้อนกลับไม่ได้', {
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/cancel`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'ยกเลิกคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่')
      }
      pacesToast.success('ยกเลิกคำสั่งซื้อแล้ว')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ยกเลิกคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่'
      pacesToast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={loading}
      // ลดน้ำหนักจาก "ปุ่มขอบแดงเต็มความกว้าง" → text button เล็ก
      // เดิม action ที่ใช้น้อยที่สุดและย้อนกลับไม่ได้ กลับได้พื้นที่มากที่สุดในหน้า
      // และบนมือถือไปนั่งอยู่ใต้ปุ่ม "ปิด" ของ ShipForm พอดี = กดพลาดง่าย
      className={`btn btn-sm text-danger hover:bg-danger/10 inline-flex items-center gap-1.5 text-xs font-medium disabled:opacity-60 min-h-11${className ? ` ${className}` : ''}`}
    >
      {loading ? 'กำลังยกเลิก...' : 'ยกเลิกคำสั่งซื้อ'}
    </button>
  )
}
