'use client'

/**
 * WhoSection — ① "ทักใคร": สถานะการขาย + แท็กของร้าน (Select2 หลายค่า) + วิธีนับแท็ก (โผล่เมื่อเลือก ≥2 แท็ก) — mockup ส่วน 3
 * แท็กที่ถูกลบ (`missing`) ค้างเป็นชิป warning "xxx (ถูกลบแล้ว)" + บรรทัดผลกระทบ จนกว่าผู้ใช้เอาออก (UX §2.2)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/select/components/Select2.tsx (isMulti · isClearable) ผ่าน SfbSelect
 *   + theme: .../apps/ecommerce/(products)/product-add/components/ProductInformation.tsx (grid md:grid-cols-2 · form-label)
 */
import Link from 'next/link'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import type { SalesStageKey } from '@/lib/sales-follow-bot/constants'
import type { Draft, DraftTag } from '@/lib/sales-follow-bot/ui'
import Segmented from './Segmented'
import SfbSelect from './SfbSelect'

type Opt = { value: string; label: string; missing?: boolean }

export default function WhoSection({
  draft,
  onChange,
  stages,
  tags,
  error,
}: {
  draft: Draft
  onChange: (fn: (d: Draft) => Draft) => void
  stages: readonly { key: SalesStageKey; label: string }[]
  tags: readonly { key: string; name: string }[]
  error: string | null
}) {
  const t = useT().salesFollowBot
  const stageLabel = (k: SalesStageKey, fallback?: string) => t.stageLabel[k] ?? fallback ?? k
  const stageOpts: Opt[] = stages.map((s) => ({ value: s.key, label: stageLabel(s.key, s.label) }))
  const tagOpts: Opt[] = tags.map((x) => ({ value: x.key, label: x.name }))
  const tagValue: Opt[] = draft.tags.map((x) => ({ value: x.key, label: x.missing ? fmt(t.tagGoneChip, { name: x.name }) : x.name, missing: x.missing }))
  const missing = draft.tags.filter((x) => x.missing).map((x) => x.name)
  const errId = error ? 'sfb-cond-err' : undefined

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="sfb-stage" className="form-label text-sm">
            {t.stageFieldLabel}
          </label>
          <SfbSelect
            inputId="sfb-stage"
            isMulti
            isClearable
            aria-invalid={error ? true : undefined}
            aria-describedby={errId}
            placeholder={t.stagePlaceholder}
            noOptionsMessage={() => t.noOptions}
            options={stageOpts}
            value={draft.salesStatuses.map((k) => ({ value: k, label: stageLabel(k) }))}
            onChange={(v: unknown) => onChange((d) => ({ ...d, salesStatuses: ((v as readonly Opt[] | null) ?? []).map((o) => o.value as SalesStageKey) }))}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="sfb-tags" className="form-label text-sm">
              {t.tagFieldLabel}
            </label>
            <Link href="/settings/tags" className="text-primary-ink -my-3 inline-flex min-h-11 items-center gap-1 text-xs font-medium lg:my-0 lg:min-h-0">
              {t.manageTags}
              <Icon icon="external-link" aria-hidden="true" />
            </Link>
          </div>
          <SfbSelect
            inputId="sfb-tags"
            isMulti
            isClearable
            aria-invalid={error ? true : undefined}
            aria-describedby={errId}
            placeholder={t.tagPlaceholder}
            noOptionsMessage={() => (tags.length === 0 ? t.noTags : t.noOptions)}
            options={tagOpts}
            value={tagValue}
            classNames={{ multiValue: (s: { data: unknown }) => ((s.data as Opt).missing ? 'sfb-chip-gone' : '') }}
            onChange={(v: unknown) =>
              onChange((d) => {
                const prev = new Map(d.tags.map((x) => [x.key, x]))
                const next: DraftTag[] = ((v as readonly Opt[] | null) ?? []).map((o) => prev.get(o.value) ?? { key: o.value, name: o.label, missing: false })
                return { ...d, tags: next }
              })
            }
          />
          {missing.length > 0 && (
            <p className="text-warning-ink mt-1 flex items-start gap-1 text-xs">
              <Icon icon="alert-triangle" className="mt-0.5 shrink-0" aria-hidden="true" />
              {fmt(draft.tagMatch === 'ALL' ? t.tagGoneAll : t.tagGoneAny, { names: missing.join(', ') })}
            </p>
          )}
        </div>
      </div>
      {draft.tags.length >= 2 && (
        <div className="mt-3">
          <Segmented
            name="sfb-tag-match"
            ariaLabel={t.tagMatchAria}
            compact
            value={draft.tagMatch}
            onChange={(v) => onChange((d) => ({ ...d, tagMatch: v }))}
            options={[
              { value: 'ANY', label: t.tagMatchAny },
              { value: 'ALL', label: t.tagMatchAll },
            ]}
          />
        </div>
      )}
      {error && (
        <p id="sfb-cond-err" role="alert" className="text-danger-ink mt-2 flex items-start gap-1 text-xs">
          <Icon icon="alert-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
