'use client'

/**
 * OrderCopyLink — resolve buyer URL แล้วส่ง value ให้ CopyLinkButton.
 * ใช้ shortCode (สั้น) ถ้ามี ไม่งั้น fallback publicToken (order เก่าก่อน backfill). spec §6
 */

import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { useEffect, useState } from 'react'
import CopyLinkButton from './CopyLinkButton'

interface OrderCopyLinkProps {
  publicToken: string
  /** short-code 8 ตัว; ถ้า null/undefined → ใช้ publicToken */
  shortCode?: string | null
  /** forward ไปยัง CopyLinkButton — default true (behavior เดิม; caller อื่นไม่กระทบ) */
  showPreview?: boolean
}

export default function OrderCopyLink({ publicToken, shortCode, showPreview = true }: OrderCopyLinkProps) {
  const code = shortCode || publicToken
  const [buyerUrl, setBuyerUrl] = useState(`/o/${code}`)

  useEffect(() => {
    setBuyerUrl(`${resolveBuyerBaseUrl()}/o/${code}`)
  }, [code])

  return (
    <CopyLinkButton
      value={buyerUrl}
      label="คัดลอกลิงก์"
      showPreview={showPreview}
    />
  )
}
