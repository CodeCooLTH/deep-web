'use client'

import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'

interface Props {
  productId: string
  /** PRODUCT_VOCAB.itemSingular — ร้านบริการ = "รายการ" (default = คำเดิม) */
  itemSingular?: string
}

export default function DeleteProductButton({ productId, itemSingular = 'สินค้า' }: Props) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    const ok = await pacesConfirm.danger(`ลบ${itemSingular}นี้?`, `${itemSingular}จะถูกลบถาวร · ย้อนกลับไม่ได้`, {
      confirmButtonText: `ลบ${itemSingular}`,
    })
    if (!ok) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? `ลบ${itemSingular}ไม่สำเร็จ`)
        return
      }
      pacesToast.success(`ลบ${itemSingular}แล้ว`)
      router.push('/products')
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
      className="btn bg-danger text-white hover:bg-danger-hover inline-flex items-center gap-1.5 disabled:opacity-60"
    >
      {isDeleting ? (
        <Icon icon="tabler:loader-2" className="text-base animate-spin" />
      ) : (
        <Icon icon="tabler:trash" className="text-base" />
      )}
      ลบ{itemSingular}
    </button>
  )
}
