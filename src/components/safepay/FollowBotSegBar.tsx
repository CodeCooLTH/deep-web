/**
 * FollowBotSegBar — แถบแบ่งช่องตามจำนวนรอบของบอทติดตาม (00095 UX §21) ใช้ร่วม: แคปซูลในแถวกล่องแชท + กล่องรายละเอียดของชิปหัวห้อง
 * ดึงออกจาก FollowBotCapsule เพื่อให้สองที่หน้าตาเหมือนกัน (ห้าม copy)
 * `label` มี = เป็น progressbar ที่อ่านออกเสียงได้ · ไม่มี = ตกแต่งล้วน (aria-hidden) ใช้เมื่อข้อความข้างเคียงบอกเลขรอบอยู่แล้ว
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx (role=progressbar + aria-valuenow/min/max, ช่องสูง h-0.75/h-1.25 ท่า bg-default-100)
 */
import { capsuleSegments, type CapsuleSegment } from '@/lib/follow-bot-ui'

const SEG_CLS: Record<CapsuleSegment, { normal: string; warn: string }> = {
  sent: { normal: 'bg-primary', warn: 'bg-warning' },
  next: { normal: 'bg-primary/30', warn: 'bg-warning/15' },
  rest: { normal: 'bg-default-200', warn: 'bg-default-200' },
}

export default function FollowBotSegBar({
  sentRounds,
  totalRounds,
  awaitingShop,
  label,
}: {
  sentRounds: number
  totalRounds: number
  awaitingShop: boolean
  label?: string
}) {
  const segs = capsuleSegments(sentRounds, totalRounds)
  if (segs.length === 0) return null
  const sent = segs.filter((s) => s === 'sent').length
  const a11y = label
    ? ({ role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': segs.length, 'aria-valuenow': sent, 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const)
  return (
    <span {...a11y} className="flex items-center gap-0.75">
      {segs.map((s, i) => (
        <i key={i} className={`block h-1.5 w-4.5 rounded-full ${SEG_CLS[s][awaitingShop ? 'warn' : 'normal']}`} />
      ))}
    </span>
  )
}
