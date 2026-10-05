'use client'

/**
 * MessageCard — การ์ด "ข้อความที่ส่งเข้ากลุ่ม" (แทน MetricsCard + PreviewCard) · feature 00070 EXT-12 · spec §2.4
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card + .card-header)
 *   + ./PreviewCard.tsx (seg รายวัน/รายเดือน + FlexBubbleView — โครงเดียวกัน)
 *   + ./DetailActionBar.tsx (next/link ปุ่มนำทาง)
 *
 * พรีวิวใช้ buildPreviewContents(effectiveTemplate) ตัวเดียวกับหน้าจัดข้อความ = composer เดียวกับที่ส่งจริง
 * chip: template ใน DB เป็น null (หรือเสียจนถอยเป็นมาตรฐาน) = "ใช้แบบมาตรฐานอยู่" · ปุ่มเป็น outline เพราะ primary ของหน้า = "ส่งทดสอบ"
 */
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { buildPreviewContents } from '@/app/(paces)/seller/(fullscreen)/business/line-reports/[groupId]/template/lib/preview-data'
import { previewState, type PreviewKind } from '@/lib/line-report/settings-guards'
import type { GroupDetailDto } from '@/services/line-report-group.service'
import { cn } from '@/utils/helpers'
import FlexBubbleView from '../FlexBubbleView'

const SEG = 'min-h-11 rounded-md px-3 py-1 text-xs font-medium transition-colors lg:min-h-8'

export default function MessageCard({ group, canEdit, serverNowIso }: { group: GroupDetailDto; canEdit: boolean; serverNowIso: string }) {
  const [view, setView] = useState<PreviewKind>('DAILY')
  const { dailyEnabled, monthlyEnabled } = group.settings
  const { kind, dailyDisabled, monthlyDisabled } = previewState(view, { dailyEnabled, monthlyEnabled }, group.cycle !== null)
  const cycleStart = group.cycle?.startIso
  const cycleEnd = group.cycle?.endIso
  const { shops, effectiveTemplate } = group

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

  const custom = group.template !== null
  return (
    <section className="card order-3 lg:sticky lg:top-36">
      <div className="card-header flex flex-wrap items-center justify-between gap-2">
        <h5 className="card-title">ข้อความที่ส่งเข้ากลุ่ม</h5>
        <Link
          href={`/business/line-reports/${group.id}/template`}
          className="btn border-primary text-primary hover:bg-primary min-h-11 border hover:text-white lg:min-h-0"
        >
          {canEdit ? 'จัดข้อความ' : 'ดูข้อความที่ตั้งไว้'}
        </Link>
      </div>
      <div className="card-body">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className={cn('badge', custom ? 'bg-info/15 text-info-ink' : 'bg-default-200/60 text-default-700')}>{custom ? 'จัดเองแล้ว' : 'ใช้แบบมาตรฐานอยู่'}</span>
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
        <FlexBubbleView contents={contents} caption="ตัวอย่าง ตัวเลขจริงมาจากข้อมูลของร้านที่เลือก" />
      </div>
    </section>
  )
}
