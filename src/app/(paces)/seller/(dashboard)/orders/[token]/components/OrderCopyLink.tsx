'use client'

/**
 * OrderCopyLink — wrapper resolve buyer URL แล้วส่ง value ให้ CopyLinkButton
 *
 * เหตุผล: CopyLinkButton (generalized) รับ value: string โดยตรง ไม่ resolve URL เอง
 * แต่ OrderSummary เป็น server component — ใช้ window ไม่ได้
 * wrapper นี้จึงทำหน้าที่ resolve buyer base URL ฝั่ง client แล้ว forward ให้ CopyLinkButton
 *
 * resolveBuyerBaseUrl: ย้ายไป src/lib/buyer-url.ts แล้ว (canonical single source)
 */

import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { useEffect, useState } from 'react'
import CopyLinkButton from './CopyLinkButton'

interface OrderCopyLinkProps {
  publicToken: string
}

export default function OrderCopyLink({ publicToken }: OrderCopyLinkProps) {
  // SSR-safe: เริ่มด้วย relative path แล้ว hydrate เป็น full URL
  const [buyerUrl, setBuyerUrl] = useState(`/o/${publicToken}`)

  useEffect(() => {
    setBuyerUrl(`${resolveBuyerBaseUrl()}/o/${publicToken}`)
  }, [publicToken])

  return (
    <CopyLinkButton
      value={buyerUrl}
      label="คัดลอกลิงก์"
      showPreview
    />
  )
}
