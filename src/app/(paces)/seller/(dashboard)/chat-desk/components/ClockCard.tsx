'use client'

/**
 * ClockCard — การ์ด ① หัวร้าน: ชื่อร้าน (สลับได้ถ้ามีหลายร้าน) · นาฬิกา · อัปเดตล่าสุด · ป้ายความสด · ปุ่มดึงใหม่
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (card)
 * นาฬิกา tick ใน component นี้เอง (useSecondTick) — การ์ดอื่นไม่ต้อง re-render ทุกวินาที
 * ไม่มีจุดเขียว "สด" (เขียวสงวนไว้ให้การยืนยัน) ใช้ข้อความเวลาอัปเดต + ป้ายเมื่อเก่า/ขาดการเชื่อมต่อ
 */
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { freshnessOf } from '@/lib/chat-desk/page-model'
import { formatTime } from '@/lib/format-date'
import { useSecondTick } from './desk-hooks'
import ShopSwitcher, { type ShopOption } from './ShopSwitcher'

export type ClockCardProps = {
  shopName: string
  shops: ShopOption[]
  shopId: string
  onShopChange: (id: string) => void
  /** epoch ms ที่ได้ข้อมูลสำเร็จล่าสุด */
  lastUpdatedAt: number | null
  onRefresh: () => void
}

export default function ClockCard({ shopName, shops, shopId, onShopChange, lastUpdatedAt, onRefresh }: ClockCardProps) {
  const nowSec = useSecondTick()
  const [spinning, setSpinning] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const ageSec = nowSec && lastUpdatedAt ? Math.max(0, nowSec - lastUpdatedAt / 1000) : 0
  const fresh = freshnessOf(ageSec)

  return (
    <div className="card">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="bg-primary/15 text-primary-ink grid size-8 shrink-0 place-items-center rounded-md">
            <Icon icon="building-store" width={16} height={16} aria-hidden="true" />
          </span>
          {shops.length > 1 ? (
            <ShopSwitcher shops={shops} value={shopId} onChange={onShopChange} className="min-w-0 flex-1" />
          ) : (
            <span className="text-default-900 min-w-0 flex-1 truncate text-sm font-semibold" title={shopName}>
              {shopName}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <div className="text-default-900 text-2xl leading-none font-bold tabular-nums">{nowSec ? formatTime(nowSec * 1000) : '--:--:--'}</div>
            <div className="text-default-700 mt-1 text-xs">
              อัปเดตล่าสุด <span className="tabular-nums">{lastUpdatedAt ? formatTime(lastUpdatedAt) : '—'}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="ดึงข้อมูลใหม่"
            onClick={() => {
              onRefresh()
              setSpinning(true)
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(() => setSpinning(false), 800)
            }}
            className="btn btn-icon bg-light text-default-900 rounded-md"
          >
            <Icon icon="refresh" className={`text-lg ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
        {fresh === 'old' && (
          <p role="status" className="bg-warning/15 text-warning-ink mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
            <Icon icon="clock" width={12} height={12} aria-hidden="true" />
            ข้อมูลเก่า {Math.round(ageSec)} วินาที กำลังลองใหม่
          </p>
        )}
        {fresh === 'lost' && (
          <p role="status" className="bg-danger/15 text-danger-ink mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
            <Icon icon="alert-triangle" width={12} height={12} aria-hidden="true" />
            เชื่อมต่อไม่ได้
          </p>
        )}
      </div>
    </div>
  )
}
