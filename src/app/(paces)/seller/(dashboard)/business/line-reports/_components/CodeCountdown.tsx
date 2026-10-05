'use client'

/**
 * CodeCountdown — นับถอยหลังอายุโค้ดผูกกลุ่ม `mm:ss` (ใช้ร่วม E1 รายการ + E2 wizard)
 *
 * Base: ไม่พบ theme match (addendum E §9 ข้อ 3) — ใช้ `.badge` (theme/paces/.../ui/badges/page.tsx) + setInterval
 *
 * 🛑 hydration: render แรก = `--:--` (ไม่อ่านนาฬิกา) แล้วค่อยนับหลัง mount — server กับ client อ่านเวลาคนละวินาที
 * ถ้าเรนเดอร์ตัวเลขตั้งแต่แรกจะ mismatch · ไม่ใช้ aria-live ระหว่างนับ (อ่านทุกวินาทีรบกวน screen reader)
 */
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatCountdown, isExpired } from '@/lib/line-report/countdown'

type Props = {
  /** ISO เวลาหมดอายุ */
  expiresAt: string
  /** ข้อความนำหน้าตัวเลข เช่น "รอผูก · โค้ดใช้ได้อีก " (ต้องมีช่องว่างท้ายเอง) */
  prefix?: string
  /** แสดงเมื่อหมดอายุ */
  expiredText?: string
  /** `badge` = ป้ายเหลือง (wizard) · `text` = ข้อความล้วน (แถวในรายการ) */
  variant?: 'text' | 'badge'
  /** เรียกครั้งเดียวเมื่อนับถึงศูนย์ (E2 ใช้หยุด poll) */
  onExpire?: () => void
}

export default function CodeCountdown({
  expiresAt,
  prefix = 'ใช้ได้อีก ',
  expiredText = 'โค้ดหมดอายุแล้ว',
  variant = 'text',
  onExpire,
}: Props) {
  const [now, setNow] = useState<number | null>(null)
  const onExpireRef = useRef(onExpire)
  const firedRef = useRef(false)

  useEffect(() => {
    onExpireRef.current = onExpire
  })

  useEffect(() => {
    firedRef.current = false
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (isExpired(expiresAt, t) && !firedRef.current) {
        firedRef.current = true
        onExpireRef.current?.()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const expired = now !== null && isExpired(expiresAt, now)
  const label = now === null ? `${prefix}--:--` : expired ? expiredText : `${prefix}${formatCountdown(Date.parse(expiresAt) - now)}`

  if (variant === 'badge') {
    return (
      <span
        role="timer"
        className={`badge inline-flex items-center gap-1 tabular-nums ${expired ? 'bg-default-100 text-default-700' : 'bg-warning/15 text-warning-ink'}`}
      >
        <Icon icon="clock" className="text-sm" aria-hidden="true" />
        {label}
      </span>
    )
  }
  return (
    <span role="timer" className="tabular-nums">
      {label}
    </span>
  )
}
