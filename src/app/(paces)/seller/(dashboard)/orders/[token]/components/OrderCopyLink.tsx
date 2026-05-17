'use client'

/**
 * OrderCopyLink — wrapper얇 resolve buyer URL แล้วส่ง value ให้ CopyLinkButton
 *
 * เหตุผล: CopyLinkButton (generalized) รับ value: string โดยตรง ไม่ resolve URL เอง
 * แต่ OrderSummary เป็น server component — ใช้ window ไม่ได้
 * wrapper นี้จึงทำหน้าที่ resolve buyer base URL ฝั่ง client แล้ว forward ให้ CopyLinkButton
 */

import { useEffect, useState } from 'react'
import CopyLinkButton from './CopyLinkButton'

// Logic เดียวกับ CustomerTable.resolveBuyerBaseUrl
// resolve buyer base URL ณ runtime: ใช้ env หรือ strip "seller." prefix จาก window.location.host
function resolveBuyerBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BUYER_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location
    // Seller อยู่บน `seller.<buyerHost>` — ตัด prefix ออกเพื่อได้ buyer domain
    const buyerHost = host.replace(/^seller\./, '')
    return `${protocol}//${buyerHost}`
  }
  return 'https://deepthailand.app'
}

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
