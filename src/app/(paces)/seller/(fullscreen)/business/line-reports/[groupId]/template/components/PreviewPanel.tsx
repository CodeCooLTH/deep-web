'use client'

/**
 * PreviewPanel — คอลัมน์ "ตัวอย่างในกลุ่ม LINE": seg รายวัน/รายเดือน + FlexBubbleView จาก composer ตัวเดียวกับที่ส่งจริง
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/line-reports/_components/detail/PreviewCard.tsx (seg + bubble)
 *   + ../../_components/FlexBubbleView.tsx (ไม่แก้ — T11d จะเพิ่ม span/กราฟ)
 * ข้อมูลตัวอย่างเป็นกรณียาวสุด + ธงจาก `draft` — บล็อกข้อความที่ยังว่างถูกตัดก่อนเข้า composer (กัน throw) ใน buildPreviewContents
 */
import { useMemo } from 'react'
import FlexBubbleView from '@/app/(paces)/seller/(dashboard)/business/line-reports/_components/FlexBubbleView'
import { previewState, type PreviewKind } from '@/lib/line-report/settings-guards'
import type { SampleShopInput } from '@/lib/line-report/preview-sample'
import type { TemplateV1 } from '@/lib/line-report/template'
import { buildPreviewContents } from '../lib/preview-data'
import SegControl from './SegControl'

const CAPTION = 'ตัวอย่างด้วยชื่อร้านยาวและยอดหลักล้าน · การตัดบรรทัดในกลุ่มอาจต่างเล็กน้อย'

export default function PreviewPanel({
  template,
  shops,
  kind,
  onKind,
  settings,
  cycle,
  serverNowIso,
}: {
  template: TemplateV1
  shops: readonly SampleShopInput[]
  kind: PreviewKind
  onKind: (k: PreviewKind) => void
  settings: { dailyEnabled: boolean; monthlyEnabled: boolean }
  cycle: { startIso: string; endIso: string } | null
  serverNowIso: string
}) {
  const st = previewState(kind, settings, cycle !== null)
  const cycleStart = cycle?.startIso
  const cycleEnd = cycle?.endIso
  const contents = useMemo(
    () =>
      buildPreviewContents({
        template,
        shops,
        kind: st.kind,
        monthlyEnabled: settings.monthlyEnabled,
        cycle: cycleStart && cycleEnd ? { startIso: cycleStart, endIso: cycleEnd } : null,
        serverNowIso,
      }),
    [template, shops, st.kind, settings.monthlyEnabled, cycleStart, cycleEnd, serverNowIso],
  )
  return (
    <section aria-label="ตัวอย่างในกลุ่ม LINE">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-default-900 mb-0 text-sm font-semibold">ตัวอย่างในกลุ่ม LINE</h2>
        <SegControl
          label="ชนิดตัวอย่าง"
          value={st.kind}
          onChange={onKind}
          options={[
            { value: 'DAILY', label: 'รายวัน', disabled: st.dailyDisabled },
            { value: 'MONTHLY', label: 'รายเดือน', disabled: st.monthlyDisabled },
          ]}
        />
      </div>
      <FlexBubbleView contents={contents} caption={CAPTION} />
    </section>
  )
}
