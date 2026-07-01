'use client'

/**
 * ConsoleHead — thumb + ชื่อ + status badge + action cluster (console header, ไม่ใช่ immersive hero)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx
 *   (card shell + card-body p-7.5 + thumb pattern) ผสม status badge จาก
 *   src/app/(paces)/seller/(dashboard)/auctions/components/AuctionRow.tsx (STATUS_BADGE_CLASS + pulse dot)
 *
 * action cluster ต่อ state (UI-DESIGN-SPEC §3 Detail/Manage):
 *   - live      → [จบก่อนเวลา] [แชร์ลิงก์]
 *   - draft     → [แก้ไข] [เผยแพร่]
 *   - scheduled → [แก้ไข] [ยกเลิก]
 *   - ended/unsold/cancelled → ไม่มี (result card ด้านล่างรับหน้าที่แทน)
 *
 * "แชร์ลิงก์": ยังไม่มีหน้า buyer web สาธารณะสำหรับ auction (buyer bidding = Deep-App mobile เท่านั้น
 * ใน MVP, buyer web = Phase 2 ตาม UI-DESIGN-SPEC "Buyer view") — ปุ่มนี้จึงแจ้ง toast แทนการ copy
 * ลิงก์ที่ยังไม่มีปลายทางจริง (กัน Hard Rule 6 "ไม่ปล่อย demo ค้าง"/ลิงก์ตาย)
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { STATUS_BADGE_CLASS, STATUS_LABEL, type AuctionStatus } from '../../components/data'
import { useAuctionActions } from './useAuctionActions'

type Props = {
  id: string
  title: string
  imageUrl: string
  status: AuctionStatus
}

export default function ConsoleHead({ id, title, imageUrl, status }: Props) {
  const { endEarly, endingEarly, cancel, cancelling, publish, publishing } = useAuctionActions(id)

  const thumbSrc = imageUrl.startsWith('http') ? imageUrl : `/api/files/${imageUrl}`

  const handleShare = () => {
    pacesToast.info('ลิงก์แชร์สาธารณะจะพร้อมใช้งานเมื่อเปิดตัวหน้าประมูลบนเว็บ (เร็ว ๆ นี้)')
  }

  return (
    <div className="card">
      <div className="card-body flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7.5">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- imageUrl อาจเป็น external URL/storage key เหมือน AuctionRow.tsx */}
          <img
            src={thumbSrc}
            alt={title}
            className="size-14 shrink-0 rounded-lg border border-default-200 bg-default-100 object-cover"
          />
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[status]}`}
            >
              {status === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-success" />}
              {STATUS_LABEL[status]}
            </span>
            <h4 className="mt-1 truncate text-base text-default-900 sm:text-lg">{title}</h4>
          </div>
        </div>

        {/* action cluster ต่อ state */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {status === 'live' && (
            <>
              <button
                type="button"
                onClick={endEarly}
                disabled={endingEarly}
                className="btn bg-danger text-white hover:bg-danger-hover text-sm disabled:opacity-60"
              >
                <Icon icon="player-stop" className="size-4" />
                {endingEarly ? 'กำลังจบประมูล...' : 'จบก่อนเวลา'}
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="btn border border-default-300 text-default-700 hover:bg-default-100 text-sm"
              >
                <Icon icon="share" className="size-4" />
                แชร์ลิงก์
              </button>
            </>
          )}

          {status === 'draft' && (
            <>
              <Link
                href={`/auctions/${id}/edit`}
                className="btn border border-default-300 text-default-700 hover:bg-default-100 text-sm"
              >
                <Icon icon="pencil" className="size-4" />
                แก้ไข
              </Link>
              <button
                type="button"
                onClick={publish}
                disabled={publishing}
                className="btn bg-primary text-white hover:bg-primary-hover text-sm disabled:opacity-60"
              >
                <Icon icon="send" className="size-4" />
                {publishing ? 'กำลังเผยแพร่...' : 'เผยแพร่'}
              </button>
            </>
          )}

          {status === 'scheduled' && (
            <>
              <Link
                href={`/auctions/${id}/edit`}
                className="btn border border-default-300 text-default-700 hover:bg-default-100 text-sm"
              >
                <Icon icon="pencil" className="size-4" />
                แก้ไข
              </Link>
              <button
                type="button"
                onClick={cancel}
                disabled={cancelling}
                className="btn border border-danger text-danger hover:bg-danger/15 text-sm disabled:opacity-60"
              >
                <Icon icon="x" className="size-4" />
                {cancelling ? 'กำลังยกเลิก...' : 'ยกเลิก'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
