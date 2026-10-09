'use client'

/**
 * AiSuggestInline — คำตอบแนะนำ AI แบบอัตโนมัติ (Typhoon) เหนือช่องพิมพ์ (00019-ext)
 *
 * presentational ล้วน: ไม่ fetch เอง (state/ฮุกอยู่ที่ useAutoSuggest) ไม่ branch ก่อน hook
 * แยกจาก AiSuggestPanel (Gemini) โดยตั้งใจเพื่อให้ diff ของ Gemini = 0
 * ไม่มีกรอบ/การ์ด/สีเขียว (คำแนะนำยังไม่ได้ตรวจ ≠ verified) ตาม UX spec 2026-10-09
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (dropup + auto-close:outside)
 *       ui/placeholders/page.tsx (skeleton) · form/elements/components/InputTextfieldType.tsx (form-input)
 */
import { useId, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import {
  AUTO_SUGGEST_NOTE_MAX,
  type AutoSuggestFeedback,
  type AutoSuggestFeedbackReason,
} from '@/lib/ai-suggest-auto-types'

export type AiSuggestInlineProps = {
  view: 'thinking' | 'ready'
  /** ข้อความคำแนะนำ (ใช้ตอน ready) */
  suggestion: string
  feedback: AutoSuggestFeedback | null
  /** เหตุผลที่เลือกไว้แล้ว (เฉพาะ DOWN) */
  reason: AutoSuggestFeedbackReason | null
  /** ความเห็นที่บันทึกสำเร็จแล้ว ('' = ยังไม่มี) */
  savedNote: string
  /** กำลังสร้างใหม่ (ผลเก่ายังค้างอยู่ → แสดง skeleton แทนข้อความ) */
  regenerating: boolean
  onPick: (text: string) => void
  onLike: () => void
  onDislike: () => void
  onReason: (reason: AutoSuggestFeedbackReason | null) => void
  onNote: (note: string) => void
  onRegenerate: () => void
  onDismiss: () => void
}

// สีแยกออกจาก ICON_BTN: Tailwind ตัดสิน text-* ที่ชนกันด้วยลำดับใน stylesheet ไม่ใช่ลำดับใน class
// ปุ่มที่ "เลือกแล้ว" จึงต้องได้ text-primary ตัวเดียว ไม่ใช่ซ้อนกับ text-default-700
const ICON_BTN = 'hover:bg-default-100 flex size-11 lg:size-7 items-center justify-center rounded'
const ICON_IDLE = 'text-default-700 hover:text-default-900'

export default function AiSuggestInline(p: AiSuggestInlineProps) {
  const t = useT().inbox
  const menuId = useId()
  const [draft, setDraft] = useState(p.savedNote)
  const thinking = p.view === 'thinking'
  const busy = thinking || p.regenerating

  const reasons: { key: AutoSuggestFeedbackReason; label: string }[] = [
    { key: 'WRONG_INFO', label: t.aiSuggestReasonWrongInfo },
    { key: 'OFF_TOPIC', label: t.aiSuggestReasonOffTopic },
    { key: 'BAD_TONE', label: t.aiSuggestReasonBadTone },
    { key: 'LENGTH', label: t.aiSuggestReasonLength },
  ]
  const trimmed = draft.trim()
  const noteSaved = trimmed !== '' && trimmed === p.savedNote

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between gap-2">
        <span role="status" className="text-default-700 flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Icon icon="sparkles" className="text-sm" />
          {thinking ? t.aiSuggestThinking : t.aiSuggestLabel}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {/* invisible (ไม่ใช่ unmount) กันปุ่มขวาขยับ + ให้ Preline ผูก dropdown ไว้ก่อนผู้ใช้แตะ */}
          <button
            type="button"
            className={`${ICON_BTN} ${thinking ? 'invisible' : ''} ${p.feedback === 'UP' ? 'text-primary' : ICON_IDLE}`}
            aria-label={t.aiSuggestLike}
            title={t.aiSuggestLike}
            aria-pressed={p.feedback === 'UP'}
            onClick={p.onLike}
          >
            <Icon icon={p.feedback === 'UP' ? 'thumb-up-filled' : 'thumb-up'} className="text-base" />
          </button>

          {/* [--auto-close:outside] [--placement:top-end] = ตัวเลือก Preline จาก theme/paces ui/dropdowns/page.tsx:905 (HR7) */}
          <div className={`hs-dropdown relative inline-flex [--auto-close:outside] [--placement:top-end] ${thinking ? 'invisible' : ''}`}>
            <button
              id={menuId}
              type="button"
              className={`hs-dropdown-toggle ${ICON_BTN} ${p.feedback === 'DOWN' ? 'text-primary' : ICON_IDLE}`}
              aria-label={t.aiSuggestDislike}
              title={t.aiSuggestDislike}
              aria-pressed={p.feedback === 'DOWN'}
              aria-haspopup="menu"
              aria-expanded="false"
              onClick={p.onDislike}
            >
              <Icon icon={p.feedback === 'DOWN' ? 'thumb-down-filled' : 'thumb-down'} className="text-base" />
            </button>
            <div
              className="hs-dropdown-menu min-w-60 sm:min-w-72"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby={menuId}
            >
              <h6 className="text-default-800 px-2.75 py-2 font-semibold">{t.aiSuggestFeedbackTitle}</h6>
              {reasons.map((r) => {
                const on = p.reason === r.key
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    className={`dropdown-item min-h-11 w-full justify-between lg:min-h-0 ${on ? 'font-medium' : ''}`}
                    onClick={() => p.onReason(on ? null : r.key)}
                  >
                    {r.label}
                    {on && <Icon icon="check" className="text-primary text-base" />}
                  </button>
                )
              })}
              <div className="dropdown-divider" />
              <div className="flex flex-col gap-1 px-2.75 pb-2">
                <input
                  type="text"
                  className="form-input min-h-11 lg:min-h-0"
                  maxLength={AUTO_SUGGEST_NOTE_MAX}
                  value={draft}
                  placeholder={t.aiSuggestNotePlaceholder}
                  aria-label={t.aiSuggestNoteAria}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="text-default-700 text-2xs flex items-start justify-between gap-2">
                  <span>{t.aiSuggestNoteHint}</span>
                  <span className="tabular-nums">
                    {draft.length}/{AUTO_SUGGEST_NOTE_MAX}
                  </span>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 text-white sm:min-h-0"
                    disabled={trimmed === '' || noteSaved}
                    onClick={() => p.onNote(trimmed)}
                  >
                    {noteSaved && <Icon icon="check" className="text-base" />}
                    {noteSaved ? t.aiSuggestNoteSaved : t.aiSuggestNoteSend}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={`${ICON_BTN} ${ICON_IDLE}`}
            aria-label={t.aiSuggestRegenerate}
            title={t.aiSuggestRegenerate}
            disabled={busy}
            onClick={p.onRegenerate}
          >
            <Icon icon="refresh" className={`text-base ${busy ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" className={`${ICON_BTN} ${ICON_IDLE}`} aria-label={t.aiSuggestDismiss} title={t.aiSuggestDismiss} onClick={p.onDismiss}>
            <Icon icon="x" className="text-base" />
          </button>
        </div>
      </div>

      {busy ? (
        <div className="flex flex-col gap-2 px-2 py-2.5" aria-hidden="true">
          <span className="bg-default-300 block h-3.25 w-full animate-pulse rounded" />
          <span className="bg-default-300 block h-3.25 w-2/3 animate-pulse rounded" />
        </div>
      ) : (
        <button
          type="button"
          title={t.aiSuggestPickHint}
          className="text-default-800 hover:bg-default-100 focus-visible:ring-primary -mx-2 block min-h-11 w-full rounded-lg px-2 py-2 text-start text-sm focus-visible:ring-1 focus-visible:outline-none lg:min-h-0 lg:py-1.5"
          onClick={() => p.onPick(p.suggestion)}
        >
          <span className="sr-only">{t.aiSuggestPickHint}: </span>
          <span className="block max-h-36 overflow-y-auto whitespace-pre-wrap">{p.suggestion}</span>
        </button>
      )}
    </div>
  )
}
