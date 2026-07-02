'use client'

/**
 * AuctionConsoleActionBar — sticky bottom action bar (mobile เท่านั้น, lg:hidden)
 *
 * Base: docs/mockups/auction/seller-auction-v1.html Frame3 `.f-footer` (L717-721)
 *   — bar ล่างจอ ปุ่ม action หลักของ console; desktop ใช้ cluster ใน ConsoleHead แทน (hidden lg:flex)
 *   ปุ่มยึด Paces `btn` primitive เดียวกับ ConsoleHead (reuse useAuctionActions)
 *
 * ⚠️ mockup มีปุ่ม "ต่อเวลา" (manual extend) — ระบบ **ไม่มี** endpoint นั้น (ต่อเวลา = auto anti-snipe
 *   เท่านั้น) → ตัดออกตาม skill mockup-to-nextjs (ไม่ทำปุ่มตาย). แสดงเฉพาะ action ที่มีจริงต่อ status
 *
 * fixed bottom + safe-area = ข้อยกเว้น Hard Rule 7 (Paces ไม่มี token ให้ — เขียน comment กำกับ)
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { useAuctionActions } from './useAuctionActions'
import type { AuctionStatus } from '../../components/data'

type Props = {
  id: string
  status: AuctionStatus
}

export default function AuctionConsoleActionBar({ id, status }: Props) {
  const { endEarly, endingEarly, cancel, cancelling, publish, publishing, share } = useAuctionActions(id)

  // terminal (ended/unsold/cancelled) = ไม่มี action → ไม่แสดง bar
  if (status === 'ended' || status === 'unsold' || status === 'cancelled') return null

  return (
    // fixed bottom + safe-area (HR7 exception — Paces ไม่มี token safe-area)
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-default-200 bg-white p-3 lg:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      {status === 'live' && (
        <>
          <button
            type="button"
            onClick={share}
            aria-label="แชร์ลิงก์"
            className="btn shrink-0 border border-default-300 text-default-700 hover:bg-default-100"
          >
            <Icon icon="share" className="size-5" />
          </button>
          <button
            type="button"
            onClick={endEarly}
            disabled={endingEarly}
            className="btn flex-1 bg-danger text-white hover:bg-danger-hover disabled:opacity-60"
          >
            <Icon icon="player-stop" className="size-4" />
            {endingEarly ? 'กำลังจบประมูล...' : 'จบก่อนเวลา'}
          </button>
        </>
      )}

      {status === 'draft' && (
        <>
          <Link
            href={`/auctions/${id}/edit`}
            className="btn shrink-0 border border-default-300 text-default-700 hover:bg-default-100"
          >
            <Icon icon="pencil" className="size-4" />
            แก้ไข
          </Link>
          <button
            type="button"
            onClick={publish}
            disabled={publishing}
            className="btn flex-1 bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
          >
            <Icon icon="send" className="size-4" />
            {publishing ? 'กำลังเผยแพร่...' : 'เผยแพร่'}
          </button>
        </>
      )}

      {status === 'scheduled' && (
        <>
          <button
            type="button"
            onClick={cancel}
            disabled={cancelling}
            className="btn shrink-0 border border-danger text-danger hover:bg-danger/15 disabled:opacity-60"
          >
            <Icon icon="x" className="size-4" />
            {cancelling ? 'กำลังยกเลิก...' : 'ยกเลิก'}
          </button>
          <Link
            href={`/auctions/${id}/edit`}
            className="btn flex-1 bg-primary text-white hover:bg-primary-hover"
          >
            <Icon icon="pencil" className="size-4" />
            แก้ไขประมูล
          </Link>
        </>
      )}
    </div>
  )
}
