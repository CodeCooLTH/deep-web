'use client'

/**
 * OverviewCard — การ์ด ② ภาพรวมห้องแชท: 2 ช่องเด่น (รอคำตอบ/เกินเวลาตอบ) + แถวรอง 6 แถวพร้อมปุ่ม ⓘ แบบกางใต้แถว
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (card + card-header เส้นประ)
 *   + theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductStats.tsx (ค่า text-xl font-semibold)
 *   + รูป disclosure ⓘ จาก src/app/(paces)/seller/(dashboard)/reports/agents/components/MetricGlossary.tsx (aria-expanded ไม่ใช้ title=)
 *
 * ตัวเลขไม่ครบต้องบอก (partial-data-must-be-labeled-or-filled): ไม่มีข้อมูล = "—" ห้าม 0 ·
 * ป้ายนับไม่ครบเห็นตลอด ไม่ซ่อนใน ⓘ (มือถือไม่มี hover)
 */
import Link from 'next/link'
import { useId, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatResponseDuration } from '@/lib/agent-performance'
import { fmtInt } from '@/lib/chat-desk/page-model'
import type { DeskDaily, DeskSummary } from '@/lib/chat-desk/types'

type RowKey = 'online' | 'free' | 'talking' | 'closed' | 'first' | 'avg'

// นิยามตาม BRD §9 / BR-CD-12,13 — ใช้คำ "ตอบจากนอกระบบ" ตามมติ Controller ข้อ 5
const GLOSSARY: Record<RowKey, string> = {
  online:
    'สมาชิกที่เปิดหน้าแชทของร้านนี้อยู่ตอนนี้ นับต่อคน เปิดหลายแท็บนับเป็น 1 คน. ใครที่ตอบจากแอป Messenger หรือ Business Suite โดยไม่ได้เปิดหน้าแชทของ Deep จะไม่ถูกนับ และผู้ที่เปิดแค่หน้าโต๊ะแชทก็ไม่ถูกนับ',
  free: 'สมาชิกที่ออนไลน์และตอนนี้ไม่มีแชทในมือ (ระบบยังไม่มีการมอบแชท จึงไม่มีโควตาต่อคน)',
  talking: 'ห้องที่ร้านเพิ่งตอบภายใน 3 นาที ที่โต๊ะแอดมินกับโต๊ะตอบจากนอกระบบ. ไม่นับ Meta AI และบอท',
  closed: 'ห้องที่ปิดงานตั้งแต่ 00:00 น. วันนี้ (เวลาไทย) และยังปิดอยู่. ห้องที่ลูกค้าทักกลับมาแล้วไม่นับ',
  first:
    'เวลาตั้งแต่ข้อความแรกของลูกค้าถึงคำตอบแรกของคน (ไม่นับบอทและบรรทัดระบบ) ของวันนี้ ตรงกับรายงานผลงานแอดมิน นับเฉพาะคำตอบที่ระบุตัวคนได้',
  avg: 'เวลารอเฉลี่ยของการตอบแต่ละครั้งของวันนี้ ตรงกับรายงานผลงานแอดมิน และปิดช่วงรอด้วยคำตอบของคนที่ระบุตัวได้เท่านั้น. ต่างจาก "รอคำตอบ" ที่ถือว่าคำตอบทุกแบบ (รวมตอบจากนอกระบบ) คือตอบแล้ว',
}

export type OverviewCardProps = {
  summary: DeskSummary
  /** null = ยังไม่มีข้อมูล */
  daily: DeskDaily | null
  /** มีตัวกรองทำงานอยู่ → 4 แถวรายวันเป็นของ "ทั้งร้าน" (SDS TD-13) */
  filtered: boolean
}

export default function OverviewCard({ summary, daily, filtered }: OverviewCardProps) {
  const uid = useId()
  const [open, setOpen] = useState<RowKey | null>(null)
  const dailyOk = daily?.status === 'OK' ? daily : null
  const dash = '—'

  const rows: { key: RowKey; icon: string; label: string; value: string; wholeShop?: boolean }[] = [
    { key: 'online', icon: 'users', label: 'ออนไลน์', value: summary.online === null ? dash : `${summary.online}/${summary.chatters}` },
    { key: 'free', icon: 'user', label: 'ว่างรับแชท', value: summary.free === null ? dash : String(summary.free) },
    { key: 'talking', icon: 'messages', label: 'กำลังคุย', value: String(summary.talking) },
    { key: 'closed', icon: 'circle-check', label: 'ปิดงานวันนี้', value: dailyOk ? fmtInt(dailyOk.resolvedToday) : dash, wholeShop: true },
    { key: 'first', icon: 'clock-play', label: 'ตอบแรกเฉลี่ย', value: formatResponseDuration(dailyOk?.firstResponseAvgSec), wholeShop: true },
    { key: 'avg', icon: 'hourglass', label: 'รอเฉลี่ย', value: formatResponseDuration(dailyOk?.responseAvgSec), wholeShop: true },
  ]
  const outside = dailyOk?.unattributedReplyCount ?? 0

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">ภาพรวมห้องแชท</span>
      </div>
      <div className="divide-default-300 grid grid-cols-2 divide-x border-b border-dashed border-default-300">
        <div className="p-3">
          <div className="text-default-700 flex items-center gap-1 text-xs">
            <Icon icon="clock" width={13} height={13} aria-hidden="true" />
            รอคำตอบ
          </div>
          <div className="text-default-900 mt-0.5 text-xl font-bold tabular-nums">
            {summary.awaitingCapped ? `${fmtInt(summary.waiting)}+` : fmtInt(summary.waiting)}
          </div>
        </div>
        <div className="p-3">
          <div className="text-default-700 flex items-center gap-1 text-xs">
            <Icon icon="alert-triangle" width={13} height={13} aria-hidden="true" />
            เกินเวลาตอบ
          </div>
          {/* แดงเฉพาะเมื่อ > 0 — 0 เป็นสีหมึกปกติ (ไม่ใช่เขียว: "ไม่มีเกิน" ไม่ใช่ "ยืนยันแล้ว") */}
          <div className={`mt-0.5 text-xl font-bold tabular-nums ${summary.overdue > 0 ? 'text-danger-ink' : 'text-default-900'}`}>
            {fmtInt(summary.overdue)}
          </div>
        </div>
      </div>
      {summary.awaitingCapped && <p className="text-warning-ink px-3 pt-2 text-xs">แสดง 200 ห้องที่รอนานสุด</p>}

      <ul className="divide-default-200 divide-y px-3">
        {rows.map((r) => {
          const panelId = `${uid}-${r.key}`
          const isOpen = open === r.key
          return (
            <li key={r.key} className="py-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Icon icon={r.icon} width={16} height={16} className="text-default-400 shrink-0" aria-hidden="true" />
                <span className="text-default-700 min-w-0">
                  {r.label}
                  {filtered && r.wholeShop && <span className="text-default-400 ms-1 text-xs">· ทั้งร้าน</span>}
                </span>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  aria-label={`คำอธิบาย ${r.label}`}
                  onClick={() => setOpen(isOpen ? null : r.key)}
                  className="text-default-400 hover:text-primary shrink-0"
                >
                  <Icon icon="info-circle" width={15} height={15} aria-hidden="true" />
                </button>
                <span className="text-default-900 ms-auto font-semibold tabular-nums">{r.value}</span>
              </div>
              <p id={panelId} hidden={!isOpen} className="text-default-700 bg-default-100 mt-1.5 rounded-md p-2 text-xs leading-relaxed">
                {GLOSSARY[r.key]}
              </p>
            </li>
          )
        })}
      </ul>

      <div className="space-y-1 px-3 pt-1 pb-3">
        {summary.online === null && (
          <p className="text-warning-ink flex gap-1 text-xs">
            <Icon icon="alert-circle" width={14} height={14} className="mt-px shrink-0" aria-hidden="true" />
            <span>ตรวจสถานะออนไลน์ไม่ได้ตอนนี้</span>
          </p>
        )}
        {daily?.status === 'UNAVAILABLE' && (
          <p className="text-warning-ink flex gap-1 text-xs">
            <Icon icon="alert-circle" width={14} height={14} className="mt-px shrink-0" aria-hidden="true" />
            <span>ตัวเลขของวันนี้โหลดไม่ได้ตอนนี้</span>
          </p>
        )}
        {outside > 0 && (
          <p className="text-warning-ink flex gap-1 text-xs">
            <Icon icon="alert-circle" width={14} height={14} className="mt-px shrink-0" aria-hidden="true" />
            <span>นับเฉพาะคำตอบที่ระบุได้ว่าใครตอบ · ไม่รวมคำตอบจากนอกระบบ {fmtInt(outside)} ข้อความ</span>
          </p>
        )}
        <Link href="/reports/agents" className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-medium">
          ดูรายงานผลงานแอดมิน
          <Icon icon="arrow-right" width={13} height={13} aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
