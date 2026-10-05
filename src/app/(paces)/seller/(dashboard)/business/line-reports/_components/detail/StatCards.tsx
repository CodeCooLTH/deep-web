/**
 * StatCards — การ์ดตัวเลข 3 ใบบนหน้าตั้งค่ากลุ่ม (รอบถัดไป · ร้านในกลุ่ม · ส่งทดสอบเหลือ) · feature 00070 EXT
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/statistics/components/Stat.tsx (card → card-body → ไอคอน + ตัวเลข + ป้าย)
 *   + docs/superpowers/specs/2026-10-05-line-report-rounded-card-mockup.html (.stat)
 * ข้อมูลจริงจาก DTO `getGroupDetail` เท่านั้น: nextSendAt · shops[].state · test.remaining/limit
 * 🛑 ตัดใบ "ส่งแล้ววันนี้" — DTO ส่ง deliveries แค่ 10 ครั้งล่าสุด (ไม่ครอบทั้งวัน) และไม่มีจำนวนรอบต่อวันที่แน่ชัด จึงไม่เดาตัวเลข
 * "นับใหม่ทุกวัน" ตรวจแล้ว: testQuotaWhere นับแถว TEST ตั้งแต่ต้นวันปฏิทินไทย (thaiTodayBounds) — ทุกแถวไม่ว่าสถานะ
 */
import type { ReactNode } from 'react'
import { Plate, ROUND_CARD, type PlateTone } from '../CardHead'
import { formatDayMonthTH, formatTimeHM } from '@/lib/format-date'
import type { GroupDetailDto } from '@/services/line-report-group.service'
import { cn } from '@/utils/helpers'

function Stat({ icon, tone, label, value, unit, foot, footClass, className }: { icon: string; tone: PlateTone; label: string; value: ReactNode; unit?: string; foot: string; footClass: string; className?: string }) {
  return (
    <div className={cn(ROUND_CARD, className)}>
      <div className="card-body">
        <div className="text-default-700 mb-2 flex items-center gap-2 text-xs">
          <Plate icon={icon} tone={tone} small />
          {label}
        </div>
        <div className="text-default-900 text-xl font-semibold tabular-nums sm:text-2xl">
          {value}
          {unit && <small className="text-default-700 ms-1 text-xs font-normal">{unit}</small>}
        </div>
        <div className={cn('mt-1 text-xs', footClass)}>{foot}</div>
      </div>
    </div>
  )
}

export default function StatCards({ group }: { group: GroupDetailDto }) {
  const ok = group.shops.filter((s) => s.state === 'OK').length
  const out = group.shops.length - ok
  const next = group.nextSendAt
  return (
    <div className="mb-base grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Stat
        icon="clock"
        tone="primary"
        label="รอบถัดไป"
        value={next ? formatTimeHM(next) : '-'}
        unit={next ? 'น.' : undefined}
        foot={next ? formatDayMonthTH(next) : 'ยังไม่มีรอบส่ง'}
        footClass="text-primary-ink"
      />
      <Stat
        icon="building-store"
        tone={out > 0 ? 'warning' : 'mute'}
        label="ร้านในกลุ่ม"
        value={group.shops.length}
        unit="ร้าน"
        foot={out > 0 ? `${out} ร้านถูกล็อกหรือถูกลบ · ไม่ถูกรวม` : 'ทุกร้านถูกรวมในรายงาน'}
        footClass={out > 0 ? 'text-warning-ink' : 'text-default-700'}
      />
      <Stat
        icon="flask"
        tone="info"
        label="ส่งทดสอบเหลือ"
        value={group.test.remaining}
        unit={`/ ${group.test.limit} ครั้ง`}
        foot="นับใหม่ทุกวัน ตามปฏิทินไทย"
        footClass="text-default-700"
      />
    </div>
  )
}
