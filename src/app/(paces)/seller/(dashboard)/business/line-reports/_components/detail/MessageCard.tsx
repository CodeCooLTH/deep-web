'use client'

/**
 * MessageCard — การ์ด "ข้อความที่ส่งเข้ากลุ่ม" (แทน MetricsCard + PreviewCard) · feature 00070 EXT-12 · สไตล์การ์ดขาวโค้งมน
 *
 * Base: docs/superpowers/specs/2026-10-05-line-report-rounded-card-mockup.html (.msg-grid / .state-note / .kvrow)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card + .card-body)
 *   + theme/paces/Admin/TS/src/app/(admin)/widgets/statistics/components/Stat.tsx (แผ่นไอคอน)
 *   + ./DetailActionBar.tsx (next/link ปุ่มนำทาง) · ./PreviewCard.tsx (seg รายวัน/รายเดือน)
 *
 * พรีวิวใช้ buildPreviewContents(effectiveTemplate) ตัวเดียวกับหน้าจัดข้อความ = composer เดียวกับที่ส่งจริง แสดงเต็ม (ไม่ย่อ)
 * ทุกแถวสรุปเป็นลิงก์ไปหน้าจัดข้อความ · ปุ่ม "จัดข้อความ" เป็น outline (primary ของหน้า = ส่งทดสอบ) · มือถือย้ายเป็นปุ่ม primary เต็มกว้างใต้รายการ
 * ความยาว = measureTemplate ตัวเดียวกับเกจในหน้าจัดข้อความ (เปอร์เซ็นต์ของเพดาน LINE)
 */
import Link from 'next/link'
import { useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { blockTitle } from '@/app/(paces)/seller/(fullscreen)/business/line-reports/[groupId]/template/lib/block-meta'
import { gaugeState } from '@/app/(paces)/seller/(fullscreen)/business/line-reports/[groupId]/template/lib/gauge-state'
import { buildPreviewContents } from '@/app/(paces)/seller/(fullscreen)/business/line-reports/[groupId]/template/lib/preview-data'
import { orderWordFor } from '@/lib/line-report/order-word'
import { previewState, type PreviewKind } from '@/lib/line-report/settings-guards'
import { measureTemplate } from '@/lib/line-report/template-size'
import type { GroupDetailDto } from '@/services/line-report-group.service'
import { cn } from '@/utils/helpers'
import FlexBubbleView from '../FlexBubbleView'
import CardHead, { GroupLabel, Plate, ROUND_CARD } from '../CardHead'

const SEG = 'min-h-11 rounded-md px-3 py-1 text-xs font-medium transition-colors lg:min-h-8'

function KvRow({ href, label, sub, value }: { href: string; label: string; sub?: string; value: string }) {
  return (
    <Link href={href} className="hover:bg-default-100 flex min-h-14 items-center gap-3 px-4 py-2 text-start">
      <span className="min-w-0 flex-1">
        <span className="text-default-900 block text-sm">{label}</span>
        {sub && <span className="text-default-700 block truncate text-xs">{sub}</span>}
      </span>
      <span className="text-default-900 shrink-0 text-sm tabular-nums">{value}</span>
      <Icon icon="chevron-right" className="text-default-500 size-4 shrink-0" aria-hidden="true" />
    </Link>
  )
}

export default function MessageCard({ group, canEdit, serverNowIso }: { group: GroupDetailDto; canEdit: boolean; serverNowIso: string }) {
  const [view, setView] = useState<PreviewKind>('DAILY')
  const { dailyEnabled, monthlyEnabled } = group.settings
  const { kind, dailyDisabled, monthlyDisabled } = previewState(view, { dailyEnabled, monthlyEnabled }, group.cycle !== null)
  const cycleStart = group.cycle?.startIso
  const cycleEnd = group.cycle?.endIso
  const { shops, effectiveTemplate } = group
  const { word } = orderWordFor(shops)

  const contents = useMemo(
    () =>
      buildPreviewContents({
        template: effectiveTemplate,
        shops: shops.map((s) => ({ id: s.shopId, name: s.name, vertical: s.vertical, state: s.state })),
        kind,
        monthlyEnabled,
        cycle: cycleStart && cycleEnd ? { startIso: cycleStart, endIso: cycleEnd } : null,
        serverNowIso,
      }),
    [effectiveTemplate, shops, kind, monthlyEnabled, cycleStart, cycleEnd, serverNowIso],
  )
  const gauge = useMemo(() => {
    const m = measureTemplate(effectiveTemplate)
    return gaugeState(m.bytes, m.limit, effectiveTemplate.blocks.some((b) => b.type === 'chart_trend' || b.type === 'chart_compare'))
  }, [effectiveTemplate])

  const href = `/business/line-reports/${group.id}/template`
  const label = canEdit ? 'จัดข้อความ' : 'ดูข้อความที่ตั้งไว้'
  const custom = group.template !== null
  const blocks = effectiveTemplate.blocks
  const charts = blocks.flatMap((b) => (b.type === 'chart_trend' ? ['แนวโน้ม 7 วัน'] : b.type === 'chart_compare' ? ['เทียบรายร้าน'] : []))
  return (
    <section className={ROUND_CARD} aria-labelledby="h-msg">
      <div className="card-body">
        <CardHead icon="message-2" title="ข้อความที่ส่งเข้ากลุ่ม" headingId="h-msg" desc="แบบที่บอทใช้ส่งรายงานทุกรอบ ทั้งอัตโนมัติและเมื่อมีคนพิมพ์คำสั่ง">
          <Link href={href} className="btn border-primary text-primary hover:bg-primary hidden min-h-11 items-center gap-1.5 border hover:text-white sm:inline-flex lg:min-h-0">
            <Icon icon="layout-list" className="text-base" aria-hidden="true" />
            {label}
          </Link>
        </CardHead>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">
            <div className="border-default-300 flex items-center gap-3 rounded-xl border p-3">
              <Plate icon={custom ? 'adjustments' : 'template'} tone={custom ? 'info' : 'mute'} small />
              <div className="min-w-0 text-xs">
                <b className="text-default-900 block text-sm">{custom ? 'จัดเองแล้ว' : 'ใช้แบบมาตรฐานอยู่'}</b>
                <span className="text-default-700">{custom ? 'รายงานรอบถัดไปจะใช้แบบที่คุณจัด' : 'เลือกบล็อก เพิ่มข้อความถึงทีม หรือใส่กราฟได้ที่ “จัดข้อความ”'}</span>
              </div>
            </div>

            <GroupLabel>สรุปแบบข้อความ</GroupLabel>
            <div className="border-default-300 divide-default-300 divide-y rounded-xl border">
              <KvRow href={href} label="ชื่อรายงาน" value={effectiveTemplate.title ?? 'ชื่อมาตรฐาน'} />
              <KvRow href={href} label="บล็อกที่ส่ง" sub={blocks.map((b) => blockTitle(b.type, word)).join(' · ')} value={`${blocks.length} บล็อก`} />
              <KvRow href={href} label="กราฟ" value={charts.length > 0 ? charts.join(' · ') : 'ไม่มี'} />
              <KvRow href={href} label="ความยาวข้อความ" sub="ถ้าเกินที่ LINE รับได้ ระบบตัดกราฟก่อนตัวเลขหลัก" value={`${gauge.percent}%`} />
            </div>
            <Link href={href} className="btn bg-primary hover:bg-primary-hover mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-white sm:hidden">
              <Icon icon="layout-list" className="text-base" aria-hidden="true" />
              {label}
            </Link>
          </div>

          <div className="min-w-0 lg:col-span-2">
            <div className="mb-2 flex min-h-11 items-center justify-between gap-2">
              <span className="text-default-900 text-xs font-semibold">ตัวอย่าง</span>
              <div className="bg-light inline-flex flex-none rounded-lg p-0.5" role="radiogroup" aria-label="ชนิดตัวอย่าง">
                {(['DAILY', 'MONTHLY'] as const).map((k) => {
                  const disabled = k === 'DAILY' ? dailyDisabled : monthlyDisabled
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={kind === k}
                      disabled={disabled}
                      onClick={() => setView(k)}
                      className={cn(SEG, kind === k ? 'bg-card text-default-900 shadow-sm' : 'text-default-700 hover:text-default-900', disabled && 'opacity-50')}
                    >
                      {k === 'DAILY' ? 'รายวัน' : 'รายเดือน'}
                    </button>
                  )
                })}
              </div>
            </div>
            <FlexBubbleView className="rounded-xl" contents={contents} caption="ตัวเลขในตัวอย่างเป็นค่าสมมุติ ข้อความจริงใช้ยอดของร้านที่เลือก" />
          </div>
        </div>
      </div>
    </section>
  )
}
