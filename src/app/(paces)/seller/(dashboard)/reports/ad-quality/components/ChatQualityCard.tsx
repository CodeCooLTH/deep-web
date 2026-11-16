'use client'

/**
 * ChatQualityCard — คุณภาพแชท (Meta): แถบแบ่งช่องไล่ แชท → คุยต่อ ≥2 → ≥3 → ตอบกลับ → ปิดการขาย + กล่องเตือนบล็อก (F-05…F-09 ที่ระดับยอดรวม)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx (แถวแถบ `h-1.25 bg-default-100` แบ่งช่อง — ผ่าน SegRow ใน reports/ad-revenue/components/DashBits.tsx)
 * user อนุมัติม็อกอัพ 2026-11-16: ตัดวงกลม radial ออก
 * 🛑 ตัวหารของ 4 แถวบน = แชท (Meta) · แถว "ปิดการขาย" = คำสั่งซื้อ ÷ แชทเข้าร้าน (closeRatePct ตัวเดียวกับ KPI — คนละตัวหาร จึงกำกับ "แชทเข้าร้าน")
 *   ค่า >100% แสดงตามจริง (แถบ clamp) · ไม่มีค่า = ไม่วาดแถว · บล็อกเป็นสัญญาณลบ แยกเป็นกล่องเตือน ไม่เป็นแถบที่ "เต็มได้"
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { SegRow, type SegTone } from '../../ad-revenue/components/DashBits'
import { fmtInt, type QualityTotals } from './data'

type Close = { orders: number; chats: number; pct: number | null }

export default function ChatQualityCard({ totals, close }: { totals: QualityTotals; close?: Close }) {
  const t = useT().adQuality
  const r = totals.rates
  const rows: { key: string; label: string; value: string; pct: number; tone: SegTone }[] = []
  if (totals.chatsMeta !== null) rows.push({ key: 'chat', label: t.chatMeta, value: fmtInt(totals.chatsMeta), pct: 100, tone: 'primary' })
  for (const [k, label] of [['depth2', t.rate2], ['depth3', t.rate3], ['replied', t.rateReplied]] as const) {
    const g = r[k]
    if (g.pct !== null && g.num !== null) rows.push({ key: k, label, value: fmtInt(g.num), pct: g.pct, tone: 'primary' })
  }
  if (close && close.pct !== null) rows.push({ key: 'close', label: t.rateClose, value: fmtInt(close.orders), pct: close.pct, tone: 'success' })
  const b = r.block

  return (
    <div className="card h-full min-w-0">
      <div className="card-header"><h4 className="card-title">{t.qualityTitle}</h4></div>
      <div className="card-body flex flex-col gap-3.5">
        {rows.map((x) => (
          <SegRow key={x.key} label={x.label} value={x.value} pct={x.pct} tone={x.tone} />
        ))}
        {b.num !== null && b.pct !== null && (
          <p className="bg-warning/15 text-warning-ink mb-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
            <Icon icon="ban" className="shrink-0 text-base" aria-hidden="true" />
            {fmt(t.blockLine, { k: fmtInt(b.num), p: b.pct.toFixed(1) })}
          </p>
        )}
      </div>
    </div>
  )
}
