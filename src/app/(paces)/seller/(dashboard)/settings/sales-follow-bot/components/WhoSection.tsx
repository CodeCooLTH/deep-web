'use client'

/**
 * WhoSection — ① "เงื่อนไขการเริ่มติดตาม": ตัวสร้างกฎแบบแถว (FR-FA-8)
 * "ติดตามห้องที่ตรง [ทุกข้อ|ข้อใดข้อหนึ่ง]" แล้วแต่ละแถว = [สถานะการขาย|แท็ก] [เป็น|ไม่ใช่ · ไม่มี|มีข้อใดข้อหนึ่ง|มีครบทุกแท็ก] [ค่า…] ✕ · + เพิ่มเงื่อนไข · สรุปเป็นประโยค
 * แท็กที่ถูกลบ (`missing`) ค้างเป็นชิป warning "xxx (ถูกลบแล้ว)" + บรรทัดเตือน + ปุ่ม "เอาออกจากบอท" จนกว่าผู้ใช้เอาออก (UX §2.2)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/select/components/Select2.tsx (isMulti · isClearable) ผ่าน SfbSelect
 *   + theme: .../apps/ecommerce/(products)/product-add/components/ProductInformation.tsx (form-label · grid)
 */
import Link from 'next/link'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { CONDITION_MATCHES, MAX_RULES, STAGE_OPS, TAG_OPS, type ConditionMatch, type StageOp, type TagOp } from '@/lib/sales-follow-bot/conditions'
import type { SalesStageKey } from '@/lib/sales-follow-bot/constants'
import { canAddRule, emptyRule, goneTagNames, removeGoneTags, ruleSentence, type Draft, type DraftRule, type DraftTag } from '@/lib/sales-follow-bot/ui'
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
  const gone = goneTagNames(draft)
  const errId = error ? 'sfb-cond-err' : undefined
  const matchLabel = (m: ConditionMatch) => (m === 'ALL' ? t.matchAll : t.matchAny)
  const opLabel: Record<StageOp | TagOp, string> = { is: t.opIs, is_not: t.opIsNot, has_any: t.opHasAny, has_all: t.opHasAll, has_none: t.opHasNone }
  const fieldLabel = (f: 'stage' | 'tag') => (f === 'stage' ? t.ruleFieldStage : t.ruleFieldTag)
  const setRule = (uid: string, fn: (r: DraftRule) => DraftRule) => onChange((d) => ({ ...d, rules: d.rules.map((r) => (r.uid === uid ? fn(r) : r)) }))
  const sentence = ruleSentence(draft.rules, draft.conditionMatch, { and: t.andWord, or: t.orWord, not: t.sentNot, hasTag: t.sentHasTag, noTag: t.sentNoTag }, (k) => stageLabel(k))

  return (
    <div>
      <div className="text-default-800 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        <label htmlFor="sfb-match">{t.ruleHead}</label>
        <div className="min-w-36">
          <SfbSelect
            inputId="sfb-match"
            isSearchable={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={errId}
            options={CONDITION_MATCHES.map((m) => ({ value: m, label: matchLabel(m) }))}
            value={{ value: draft.conditionMatch, label: matchLabel(draft.conditionMatch) }}
            onChange={(o: unknown) => onChange((d) => ({ ...d, conditionMatch: (o as { value: ConditionMatch } | null)?.value ?? d.conditionMatch }))}
          />
        </div>
        <Link href="/settings/tags" className="text-primary-ink ms-auto inline-flex min-h-11 items-center gap-1 text-xs font-medium lg:min-h-0">
          {t.manageTags}
          <Icon icon="external-link" aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-3 space-y-2">
        {draft.rules.map((r, i) => {
          const isTag = r.field === 'tag'
          const ops = (isTag ? TAG_OPS : STAGE_OPS) as readonly (StageOp | TagOp)[]
          const value: Opt[] =
            r.field === 'tag'
              ? r.values.map((x) => ({ value: x.key, label: x.missing ? fmt(t.tagGoneChip, { name: x.name }) : x.name, missing: x.missing }))
              : r.values.map((k) => ({ value: k, label: stageLabel(k) }))
          return (
            <li key={r.uid} className="flex flex-wrap items-start gap-2">
              <div className="w-32 shrink-0">
                <SfbSelect
                  inputId={`sfb-rule-${i}-field`}
                  aria-label={fmt(t.ruleFieldAria, { n: i + 1 })}
                  isSearchable={false}
                  options={(['stage', 'tag'] as const).map((f) => ({ value: f, label: fieldLabel(f) }))}
                  value={{ value: r.field, label: fieldLabel(r.field) }}
                  onChange={(o: unknown) => {
                    const f = (o as { value: 'stage' | 'tag' } | null)?.value
                    // เปลี่ยนชนิด = ค่าเดิมใช้ต่อไม่ได้ (สถานะ ↔ แท็ก) เริ่มแถวใหม่แต่คง uid ไว้
                    if (f && f !== r.field) setRule(r.uid, (x) => ({ ...emptyRule(f), uid: x.uid }))
                  }}
                />
              </div>
              <div className="w-44 shrink-0">
                <SfbSelect
                  inputId={`sfb-rule-${i}-op`}
                  aria-label={fmt(t.ruleOpAria, { n: i + 1 })}
                  isSearchable={false}
                  options={ops.map((o) => ({ value: o, label: opLabel[o] }))}
                  value={{ value: r.op, label: opLabel[r.op] }}
                  onChange={(o: unknown) => {
                    const op = (o as { value: StageOp | TagOp } | null)?.value
                    if (op) setRule(r.uid, (x) => ({ ...x, op }) as DraftRule)
                  }}
                />
              </div>
              <div className="min-w-0 flex-1 basis-60">
                <SfbSelect
                  inputId={`sfb-rule-${i}-values`}
                  aria-label={fmt(t.ruleValuesAria, { n: i + 1 })}
                  isMulti
                  isClearable
                  aria-invalid={error ? true : undefined}
                  aria-describedby={errId}
                  placeholder={isTag ? t.tagPlaceholder : t.stagePlaceholder}
                  noOptionsMessage={() => (isTag && tags.length === 0 ? t.noTags : t.noOptions)}
                  options={isTag ? tagOpts : stageOpts}
                  value={value}
                  classNames={{ multiValue: (s: { data: unknown }) => ((s.data as Opt).missing ? 'sfb-chip-gone' : '') }}
                  onChange={(v: unknown) => {
                    const picked = (v as readonly Opt[] | null) ?? []
                    setRule(r.uid, (x) => {
                      if (x.field === 'stage') return { ...x, values: picked.map((o) => o.value as SalesStageKey) }
                      const prev = new Map(x.values.map((y) => [y.key, y]))
                      return { ...x, values: picked.map((o): DraftTag => prev.get(o.value) ?? { key: o.value, name: o.label, missing: false }) }
                    })
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => onChange((d) => ({ ...d, rules: d.rules.filter((x) => x.uid !== r.uid) }))}
                aria-label={fmt(t.ruleRemoveAria, { n: i + 1 })}
                className="text-default-700 hover:bg-default-100 inline-flex size-11 shrink-0 items-center justify-center rounded lg:size-9"
              >
                <Icon icon="x" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          id="sfb-rule-add"
          disabled={!canAddRule(draft)}
          onClick={() => onChange((d) => ({ ...d, rules: [...d.rules, emptyRule('stage')] }))}
          className="text-primary-ink inline-flex min-h-11 items-center gap-1 text-sm font-medium disabled:opacity-50 lg:min-h-0"
        >
          <Icon icon="plus" aria-hidden="true" />
          {t.addRule}
        </button>
        {!canAddRule(draft) && <span className="text-default-700 text-xs">{fmt(t.rulesFull, { max: MAX_RULES })}</span>}
      </div>

      {sentence && (
        <p className="text-default-800 bg-default-100 mt-3 flex items-start gap-2 rounded px-3 py-2 text-sm">
          <Icon icon="list-check" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">{t.ruleSummaryLabel}</span> {sentence}
          </span>
        </p>
      )}

      {gone.length > 0 && (
        <div className="text-warning-ink mt-2 flex flex-wrap items-center gap-x-2 text-xs">
          <span className="inline-flex items-center gap-1">
            <Icon icon="alert-triangle" className="shrink-0" aria-hidden="true" />
            {fmt(t.tagGoneLine, { names: gone.join(', ') })}
          </span>
          <button type="button" onClick={() => onChange(removeGoneTags)} className="text-primary-ink inline-flex min-h-11 items-center font-medium underline lg:min-h-0">
            {t.tagRemoveGone}
          </button>
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
