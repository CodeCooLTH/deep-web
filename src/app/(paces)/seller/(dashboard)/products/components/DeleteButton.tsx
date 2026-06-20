'use client'

import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'

interface DeleteButtonProps {
  productId: string
}

export default function DeleteButton({ productId }: DeleteButtonProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    const ok = await pacesConfirm.danger('ลบสินค้านี้?', 'สินค้าจะถูกลบถาวร · ย้อนกลับไม่ได้', {
      confirmButtonText: 'ลบสินค้า',
    })
    if (!ok) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? 'ลบสินค้าไม่สำเร็จ')
        return
      }
      pacesToast.success('ลบสินค้าแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="btn btn-icon btn-sm border border-danger/30 bg-danger/5 hover:bg-danger/10 text-danger disabled:opacity-60"
      title="ลบสินค้า"
    >
      {isDeleting ? (
        <Icon icon="mdi:loading" width={14} height={14} className="animate-spin" />
      ) : (
        <Icon icon="mdi:trash-can-outline" width={14} height={14} />
      )}
    </button>
  )
}
