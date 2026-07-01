'use client'

/**
 * AuctionMeta — บรรทัด meta ต่อสถานะ (ใช้ร่วม AuctionRow มือถือ + AuctionDataTable คอลัมน์ "เวลา")
 *   - live: countdown เหลือเวลา (AuctionCountdown)
 *   - scheduled: วันที่เปิดประมูล
 *   - draft: "ยังไม่เผยแพร่"
 *   - ended: ปิดเมื่อ (วันที่)
 *   - unsold: "ราคาไม่ถึงขั้นต่ำ"
 *   - cancelled: "ยกเลิกแล้ว"
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersTable.tsx
 * (คอลัมน์ "วันที่/เวลา" pattern — icon + text ขนาด text-sm/text-xs)
 */

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import AuctionCountdown from '../../_shared/AuctionCountdown'
import type { AuctionStatus } from './data'

type Props = {
  status: AuctionStatus
  endTimeMs: number
  startTimeMs: number | null
}

export default function AuctionMeta({ status, endTimeMs, startTimeMs }: Props) {
  // ขนาดเดียวกันทั้งการ์ดมือถือ/ตาราง desktop — text-xs (ตรงกับ mockup .auc-meta ~11.5px)
  const textCls = 'text-xs'
  const iconCls = 'text-xs'

  if (status === 'live') {
    return (
      <span className={`inline-flex items-center gap-1 ${textCls} text-default-500`}>
        <Icon icon="clock" className={`${iconCls} text-default-400`} />
        เหลือ <AuctionCountdown endTimeMs={endTimeMs} />
      </span>
    )
  }
  if (status === 'scheduled') {
    return (
      <span className={`inline-flex items-center gap-1 ${textCls} text-default-500`}>
        <Icon icon="calendar" className={`${iconCls} text-default-400`} />
        เปิด {formatDateTime(startTimeMs)}
      </span>
    )
  }
  if (status === 'draft') {
    return (
      <span className={`inline-flex items-center gap-1 ${textCls} text-default-400`}>
        <Icon icon="pencil" className={iconCls} />
        ยังไม่เผยแพร่
      </span>
    )
  }
  if (status === 'unsold') {
    return (
      <span className={`inline-flex items-center gap-1 ${textCls} text-warning`}>
        <Icon icon="alert-triangle" className={iconCls} />
        ราคาไม่ถึงขั้นต่ำ
      </span>
    )
  }
  if (status === 'cancelled') {
    return (
      <span className={`inline-flex items-center gap-1 ${textCls} text-default-400`}>
        <Icon icon="x" className={iconCls} />
        ยกเลิกแล้ว
      </span>
    )
  }
  // ended
  return (
    <span className={`inline-flex items-center gap-1 ${textCls} text-default-500`}>
      <Icon icon="circle-check" className={iconCls} />
      ปิดเมื่อ {formatDateTime(endTimeMs)}
    </span>
  )
}
