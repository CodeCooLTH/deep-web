'use client'

/**
 * PendingGrid — ห่อกริดการ์ดให้จาง + aria-busy ขณะเปลี่ยนช่วง/เพจ (ท่าเดียวกับ AdSalesClient ของ /reports/ads · ใช้ PendingContext ตัวเดียวกัน)
 * Base: src/app/(paces)/seller/(dashboard)/reports/ads/components/AdSalesClient.tsx
 */
import { cn } from '@/utils/helpers'
import { useAdReportPending } from '../../ads/components/PendingContext'

export default function PendingGrid({ children }: { children: React.ReactNode }) {
  const { pending } = useAdReportPending()
  return <div className={cn('transition-opacity', pending && 'opacity-60')} aria-busy={pending}>{children}</div>
}
