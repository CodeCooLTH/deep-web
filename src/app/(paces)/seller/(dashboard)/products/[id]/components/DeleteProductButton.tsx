'use client'

import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'react-toastify'

interface Props {
  productId: string
}

export default function DeleteProductButton({ productId }: Props) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm('ต้องการลบสินค้านี้ใช่หรือไม่?')) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error ?? 'ลบสินค้าไม่สำเร็จ')
        return
      }
      toast.success('ลบสินค้าแล้ว')
      router.push('/products')
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="btn bg-danger text-white hover:bg-danger-hover inline-flex items-center gap-1.5 disabled:opacity-60"
    >
      {isDeleting ? (
        <Icon icon="tabler:loader-2" className="text-base animate-spin" />
      ) : (
        <Icon icon="tabler:trash" className="text-base" />
      )}
      ลบสินค้า
    </button>
  )
}
