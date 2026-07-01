/**
 * AuctionResultCard — สรุปผลของประมูลที่จบแล้ว (ended/unsold/cancelled)
 *
 * Base: docs/system/ui-guideline/paces-component-reference.md §7 `card border-s-3 border-{color}`
 *   (accent card pattern — ใช้แล้วหลายจุดในโปรเจกต์ เช่น ShopForm.tsx L171, OnboardingModal.tsx L804)
 *
 * ended   = success accent + ผู้ชนะ + ราคาสุดท้าย + ปุ่ม "ดูคำสั่งซื้อ" (ถ้ามี orderId)
 * unsold  = warning accent + ราคาสูงสุดที่ได้ + เหตุผล (ไม่มีผู้เสนอราคา / ไม่ถึง reserve)
 * cancelled = muted (default) accent + เวลาที่ยกเลิก
 *
 * PII: แสดงแค่ `bidder` displayName (public field ตาม SDS §7.2 ข้อ 4) — ไม่มี phone/email/bidderId
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'

type Props = {
  status: 'ended' | 'unsold' | 'cancelled'
  currentPrice: number
  hasReserve: boolean
  winnerDisplayName: string | null
  orderId: string | null
  cancelledAt: string | null
}

const ACCENT: Record<Props['status'], { border: string; icon: string; iconCls: string }> = {
  ended: { border: 'border-success', icon: 'trophy', iconCls: 'text-success' },
  unsold: { border: 'border-warning', icon: 'alert-triangle', iconCls: 'text-warning' },
  cancelled: { border: 'border-default-300', icon: 'circle-x', iconCls: 'text-default-400' },
}

export default function AuctionResultCard({
  status,
  currentPrice,
  hasReserve,
  winnerDisplayName,
  orderId,
  cancelledAt,
}: Props) {
  const accent = ACCENT[status]

  return (
    <div className={`card border-s-3 ${accent.border}`}>
      <div className="card-body flex items-start gap-3">
        <Icon icon={accent.icon} className={`text-2xl ${accent.iconCls} shrink-0`} />
        <div className="min-w-0 flex-1">
          {status === 'ended' && (
            <>
              <h5 className="mb-1.25 text-default-900">ประมูลสำเร็จ</h5>
              <p className="text-default-500 mb-0.5 text-sm">
                ผู้ชนะ: <span className="font-medium text-default-800">{winnerDisplayName ?? '—'}</span>
              </p>
              <p className="text-default-500 mb-3 text-sm">
                ราคาสุดท้าย:{' '}
                <span className="tabular-nums font-semibold text-default-800">
                  ฿{currentPrice.toLocaleString('th-TH')}
                </span>
              </p>
              {orderId && (
                <Link
                  href={`/orders/${orderId}`}
                  className="btn bg-primary text-white hover:bg-primary-hover text-sm"
                >
                  <Icon icon="receipt" className="size-4" />
                  ดูคำสั่งซื้อ
                </Link>
              )}
            </>
          )}

          {status === 'unsold' && (
            <>
              <h5 className="mb-1.25 text-default-900">ขายไม่ออก — ไม่มีผู้ชนะ</h5>
              <p className="text-default-500 mb-0 text-sm">
                ราคาสูงสุดที่ได้:{' '}
                <span className="tabular-nums font-semibold text-default-800">
                  ฿{currentPrice.toLocaleString('th-TH')}
                </span>
              </p>
              {hasReserve && (
                <p className="text-default-400 mb-0 text-xs">ไม่ถึงราคาขั้นต่ำที่ยอมขาย (Reserve) ที่ตั้งไว้</p>
              )}
            </>
          )}

          {status === 'cancelled' && (
            <>
              <h5 className="mb-1.25 text-default-900">ประมูลถูกยกเลิก</h5>
              <p className="text-default-400 mb-0 text-sm">
                {cancelledAt ? formatDateTime(cancelledAt) : '—'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
