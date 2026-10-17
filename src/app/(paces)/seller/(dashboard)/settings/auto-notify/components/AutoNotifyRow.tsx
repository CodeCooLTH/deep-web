'use client'

/**
 * แถวจังหวะส่งอัตโนมัติ 1 แถว (feature 00078 T17)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/reports/components/ReportSettingsForm.tsx (li + form-switch)
 *   theme: theme/paces/Admin/TS/src/app/(admin)/forms/elements/components/ChecksRadioSwitches.tsx
 *
 * renderEditAction / editor = ช่องเสียบของ T18 (ตัวแก้ข้อความ) — ไม่ส่ง = ไม่มีปุ่มแก้
 */
import type { ReactNode } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

export interface AutoNotifyRowProps {
  kind: string
  label: string
  icon: string
  checked: boolean
  /** ล็อกสวิตช์นี้ตัวเดียว (กำลังบันทึก) */
  pending: boolean
  canEdit: boolean
  /** บรรทัดแรกของเทมเพลตที่แก้เอง · null = ใช้ข้อความตั้งต้น */
  customFirstLine: string | null
  onToggle: (next: boolean) => void
  renderEditAction?: () => ReactNode
  editor?: ReactNode
}

export default function AutoNotifyRow(p: AutoNotifyRowProps) {
  const t = useT().autoNotify
  const note = p.kind === 'TRACKING' ? t.trackingNote : p.kind === 'SERVICE_CLOSED' ? t.closedNote : null
  const id = `an-sw-${p.kind}`
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <Icon icon={p.icon} className="text-default-500 mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="text-default-900 text-sm font-medium">
            {p.label}
          </label>
          {note && <p className="text-default-600 mt-0.5 text-xs">{note}</p>}
          <div className="mt-1 flex items-center gap-2">
            <p className="text-default-700 min-w-0 flex-1 truncate text-xs">{p.customFirstLine ?? t.useDefaultText}</p>
            {p.renderEditAction?.()}
          </div>
        </div>
        <input
          id={id}
          type="checkbox"
          className="form-switch mt-0.5 shrink-0"
          checked={p.checked}
          disabled={!p.canEdit || p.pending}
          aria-describedby={p.canEdit ? undefined : 'an-ro'}
          aria-busy={p.pending || undefined}
          onChange={(e) => p.onToggle(e.target.checked)}
        />
      </div>
      {p.editor}
    </li>
  )
}
