'use client'

/**
 * TemplateEditor — ตัวแก้ข้อความส่งอัตโนมัติแบบ gochat-v3 (feature 00078 T18 · S-16 · สเปก v2 "แก้ไขรอบ 3")
 * กล่องเดียว: หัว (ไอคอน + "เนื้อความ" + ตัวนับมุมขวา) · เนื้อความที่ตัวแปรเป็นชิป · แถบล่างอีโมจิ + ชิปเส้นประ "+ {ตัวแปร}"
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (ชิป badge rounded-full)
 *   + inbox/[conversationId]/components/EmojiPicker.tsx (ปุ่ม mood-smile + แผง — ท่าเดียวกับ CommentsClient)
 *   + settings/chatbot/ChatbotTabs.tsx (กลุ่มปุ่มตัวอย่าง bg-light rounded-lg p-1)
 * HR1: ตัวแก้ที่ตัวแปรเป็นชิปไม่มีใน theme — user เลือกเอง 2026-10-18 ("ชิปในเนื้อความ (gochat เต็ม)") แทน textarea
 *
 * 🛑 contenteditable แบบ uncontrolled: React ไม่วาด children ของกล่อง — `paint()` วาดเองเฉพาะตอนเปิด/ใช้ตัวอย่าง/คืนค่า/
 * วางข้อความที่มี `{ชื่อ}` · พิมพ์ `{ชื่อ}` จนปิดปีกกา = แทนช่วงนั้นด้วยชิป · ห้ามเขียน DOM ระหว่างพิมพ์ (IME ไทย: สระ/วรรณยุกต์ลอย เคอร์เซอร์กระโดด)
 * ค่าจริงอ่านจาก DOM ด้วย `domToText` ตัวเดียว (src/lib/auto-notify/editor-dom.ts) · ตัวตรวจ = `validateTemplate` ตัวเดียวกับ server
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { TEMPLATE_EXAMPLES } from '@/lib/auto-notify/defaults'
import { domToText } from '@/lib/auto-notify/editor-dom'
import { textToParts } from '@/lib/auto-notify/editor-text'
import { AUTO_NOTIFY_TEMPLATE_MAX_CHARS, type AutoNotifyKind } from '@/lib/auto-notify/ledger-constants'
import {
  countCodePoints,
  templateHasLinkVariable,
  validateTemplate,
  type TemplateVariable,
} from '@/lib/auto-notify/variables'
import { formatDateTime } from '@/lib/format-date'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import EmojiPicker from '@/app/(paces)/seller/(chat)/inbox/[conversationId]/components/EmojiPicker'

export type TemplateSaved = { body: string; updatedAt: string; updatedBy: { name: string } | null }

const CHIP_CLS = 'badge bg-primary/10 text-primary-ink text-2xs mx-0.5 rounded-full font-semibold'
const LITERAL_VAR_RE = /\{([^{}\n]*)\}/

function makeChip(name: string): HTMLSpanElement {
  const s = document.createElement('span')
  s.contentEditable = 'false'
  s.dataset.var = name
  s.className = CHIP_CLS
  s.textContent = name
  return s
}

/** วาดข้อความลงกล่อง — ตัวแปรที่จังหวะนี้ใช้ได้เป็นชิป · ที่ใช้ไม่ได้คงเป็นตัวหนังสือ (ให้ข้อความผิดชี้ได้ว่าตัวไหน) */
function paint(el: HTMLElement, body: string, allowed: ReadonlySet<string>) {
  el.replaceChildren()
  for (const p of textToParts(body)) {
    if (p.type === 'var' && allowed.has(p.name)) {
      el.append(makeChip(p.name))
      continue
    }
    const s = p.type === 'var' ? `{${p.name}}` : p.text
    s.split('\n').forEach((line, i) => {
      if (i > 0) el.append(document.createElement('br'))
      if (line) el.append(document.createTextNode(line))
    })
  }
  // บรรทัดว่างท้ายสุดต้องมี <br> อีกตัวให้มีความสูง/ที่วางเคอร์เซอร์ (domToText ทิ้งตัวนี้)
  if (el.lastChild?.nodeName === 'BR') el.append(document.createElement('br'))
}

/** มี `{ชื่อที่ใช้ได้}` เป็นตัวหนังสือในกล่องไหม (พิมพ์เอง/วาง) — มีค่อยวาดใหม่เป็นชิป */
function hasLiteralVar(el: HTMLElement, allowed: ReadonlySet<string>): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const m = (n.textContent ?? '').match(LITERAL_VAR_RE)
    if (m && allowed.has(m[1])) return true
  }
  return false
}

export default function TemplateEditor({
  kind,
  label,
  variables,
  body,
  defaultBody,
  isCustom,
  updatedAt,
  updatedBy,
  onSaved,
  onReset,
  onClose,
  onDirtyChange,
}: {
  kind: AutoNotifyKind
  /** ชื่อจังหวะ ("เมื่อ…") — ใช้ใน aria ของกล่อง */
  label: string
  variables: readonly TemplateVariable[]
  /** ข้อความที่ใช้อยู่ตอนนี้ (ของร้าน หรือค่าตั้งต้น) */
  body: string
  defaultBody: string
  isCustom: boolean
  updatedAt: string | null
  updatedBy: { name: string } | null
  onSaved: (r: TemplateSaved) => void
  onReset: () => void
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const t = useT().autoNotify
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<Range | null>(null)
  const [text, setText] = useState(body)
  const [saving, setSaving] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  /** เมนู `{` — เปิดเมื่อตัวอักษรหน้าเคอร์เซอร์คือ `{` (ตัดสินใหม่ทุกครั้งที่พิมพ์) */
  const [menuIdx, setMenuIdx] = useState<number | null>(null)
  const allowed = useMemo(() => new Set(variables.map((v) => v.name)), [variables])
  const max = AUTO_NOTIFY_TEMPLATE_MAX_CHARS
  const count = countCodePoints(text)
  const editorId = `an-editor-${kind}`

  useEffect(() => {
    if (boxRef.current) paint(boxRef.current, body, allowed)
    // วาดครั้งเดียวตอนเปิด — หลังจากนี้ DOM เป็นของผู้ใช้ (ดูหัวไฟล์)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirty = text !== body
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  // จำตำแหน่งเคอร์เซอร์ล่าสุดในกล่อง — ปุ่มชิป/อีโมจิแทรกตรงนั้น
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection()
      const el = boxRef.current
      if (!sel || sel.rangeCount === 0 || !el) return
      const r = sel.getRangeAt(0)
      if (el.contains(r.startContainer)) rangeRef.current = r.cloneRange()
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  // native beforeinput: Enter ทุกแบบ = <br> (ไม่ให้เบราว์เซอร์สร้าง <div>) · เต็ม 500 = ไม่รับเพิ่ม (ยกเว้นระหว่าง IME)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onBefore = (e: InputEvent) => {
      if (e.inputType === 'insertParagraph') {
        e.preventDefault()
        document.execCommand('insertLineBreak')
      } else if (e.inputType === 'insertFromDrop') {
        e.preventDefault()
      } else if (e.inputType.startsWith('insert') && !e.isComposing && window.getSelection()?.isCollapsed && countCodePoints(domToText(el)) >= max) {
        e.preventDefault()
      }
    }
    el.addEventListener('beforeinput', onBefore)
    return () => el.removeEventListener('beforeinput', onBefore)
  }, [max])

  const sync = () => {
    const el = boxRef.current
    if (!el) return
    setText(domToText(el))
    const sel = window.getSelection()
    const n = sel?.anchorNode
    const before = sel?.isCollapsed && n?.nodeType === Node.TEXT_NODE ? (n.textContent ?? '').charAt(sel.anchorOffset - 1) : ''
    setMenuIdx(before === '{' ? 0 : null)
    // พิมพ์ `{ชื่อ}` เองจนปิดปีกกา = แปลงเป็นชิปตรงนั้น (`}` เป็น ASCII ไม่อยู่ใน IME composition)
    if (before === '}' && n && sel) {
      const m = (n.textContent ?? '').slice(0, sel.anchorOffset).match(/\{([^{}\n]*)\}$/)
      if (m && allowed.has(m[1])) {
        const r = document.createRange()
        r.setStart(n, sel.anchorOffset - m[0].length)
        r.setEnd(n, sel.anchorOffset)
        insertNode(makeChip(m[1]), r)
      }
    }
  }

  /** แทรก node ที่ตำแหน่งเคอร์เซอร์ที่จำไว้ — ไม่มี = ท้ายข้อความ (ก่อน <br> ที่วางเคอร์เซอร์) */
  const insertNode = (node: Node, at?: Range, eatBrace = false) => {
    const el = boxRef.current
    if (!el) return
    let r = at ?? (rangeRef.current && el.contains(rangeRef.current.startContainer) ? rangeRef.current : null)
    if (!r) {
      r = document.createRange()
      r.selectNodeContents(el)
      r.collapse(false)
      if (el.lastChild?.nodeName === 'BR') r.setStartBefore(el.lastChild)
    }
    if (eatBrace && r.startContainer.nodeType === Node.TEXT_NODE && r.startOffset > 0) {
      r.setStart(r.startContainer, r.startOffset - 1) // ลบ `{` ที่เปิดเมนู
    }
    r.deleteContents()
    r.insertNode(node)
    r.setStartAfter(node)
    r.collapse(true)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
    rangeRef.current = r.cloneRange()
    el.focus()
    setMenuIdx(null)
    setText(domToText(el))
  }

  const insertVar = (name: string, eatBrace = false) => {
    if (count + countCodePoints(`{${name}}`) > max) return
    insertNode(makeChip(name), undefined, eatBrace)
  }

  const applyBody = (next: string) => {
    if (boxRef.current) paint(boxRef.current, next, allowed)
    rangeRef.current = null
    setText(next)
  }

  const applyExample = async (exampleBody: string) => {
    if (dirty && !(await pacesConfirm.warning(t.exampleConfirmTitle, undefined, { confirmButtonText: t.exampleConfirmOk, cancelButtonText: t.keepEditing }))) return
    applyBody(exampleBody)
  }

  const doReset = async (ask: boolean) => {
    if (!isCustom) {
      applyBody(defaultBody) // ยังไม่เคยบันทึก = แค่คืนในกล่อง ไม่มีอะไรให้ลบ
      return
    }
    if (ask && !(await pacesConfirm.warning(t.resetConfirmTitle, t.resetConfirmBody, { confirmButtonText: t.resetDefault, cancelButtonText: t.keepIt }))) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/shops/current/auto-notify/templates/${kind}?expectedUpdatedAt=${encodeURIComponent(updatedAt ?? '')}`,
        { method: 'DELETE' },
      )
      if (res.status === 409) {
        pacesToast.error(t.errorConflict)
        router.refresh() // ดึง updatedAt ฉบับล่าสุด — ไม่งั้นกดซ้ำกี่ครั้งก็ชนซ้ำ (AutoNotifyClient sync จาก props)
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      onReset()
      pacesToast.success(t.toastReset)
    } catch {
      pacesToast.error(t.errorSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  const issues = validateTemplate(kind, text)
  const save = async () => {
    if (issues.length || saving) return
    // ตรงค่าตั้งต้นทุกตัวอักษร = ไม่เก็บแถว (เก็บแล้ว LINE จะได้ข้อความล้วนแทนการ์ด — U-E)
    if (text === defaultBody) {
      if (isCustom) await doReset(false)
      else onClose()
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/shops/current/auto-notify/templates/${kind}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, expectedUpdatedAt: isCustom ? updatedAt : null }),
      })
      if (res.status === 409) {
        const code = ((await res.json().catch(() => null)) as { error?: string } | null)?.error
        pacesToast.error(code === 'KIND_NOT_AVAILABLE' ? t.kindUnavailable : t.errorConflict)
        router.refresh() // ดึง updatedAt ล่าสุด / ชนิดที่ร้านใช้ได้ — ข้อความที่พิมพ์ค้างในกล่องยังอยู่
        if (code === 'KIND_NOT_AVAILABLE') onClose()
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      onSaved((await res.json()) as TemplateSaved)
      pacesToast.success(t.toastSaved)
    } catch {
      pacesToast.error(t.errorSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  const messages = issues.flatMap((i) => {
    if (i.code === 'UNKNOWN_VARIABLE') return [fmt(t.errorUnknownVar, { name: `{${i.name}}` })]
    if (i.code === 'WRONG_KIND_VARIABLE') return [fmt(t.errorWrongKindVar, { name: `{${i.name}}` })]
    if (i.code === 'TOO_LONG') return [fmt(t.errorTooLong, { max })]
    if (i.code === 'BLANK') return [t.errorEmpty]
    return []
  })
  const warnNoLink = issues.length === 0 && !templateHasLinkVariable(text)

  return (
    <div className="mt-3 flex flex-col gap-3 ps-8">
      {/* เริ่มจากตัวอย่าง — เติมลงกล่อง ยังไม่บันทึก */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-default-700 text-xs">{t.editorStartFrom}</span>
        <div className="bg-light flex gap-0.5 overflow-x-auto rounded-lg p-1">
          {TEMPLATE_EXAMPLES[kind].map((ex) => (
            <button
              key={ex.id}
              type="button"
              disabled={saving}
              onClick={() => void applyExample(ex.body)}
              className="text-default-700 hover:bg-card min-h-11 shrink-0 rounded-md px-3 text-xs font-medium lg:min-h-8"
            >
              {{ SHORT: t.sampleShort, POLITE: t.samplePolite, FRIENDLY: t.sampleFriendly }[ex.id]}
            </button>
          ))}
        </div>
      </div>

      <div className="border-default-300 focus-within:border-primary relative rounded-lg border">
        <div className="flex items-start gap-3 px-3 pt-3">
          <span className="bg-default-100 text-default-600 flex size-8 shrink-0 items-center justify-center rounded-md">
            <Icon icon="message-2" className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-default-900 text-sm font-medium">{t.editorBody}</p>
            <p className="text-default-600 text-xs">{t.editorBodyHint}</p>
          </div>
          <span
            className={`shrink-0 text-xs tabular-nums ${count >= max ? 'text-danger-ink' : count >= max - 50 ? 'text-warning-ink' : 'text-default-600'}`}
            aria-live={count >= max - 50 ? 'polite' : 'off'}
          >
            {count}/{max}
          </span>
        </div>

        <div
          ref={boxRef}
          id={editorId}
          role="textbox"
          aria-multiline="true"
          aria-label={fmt(t.editorAria, { when: label })}
          aria-invalid={messages.length > 0 || undefined}
          aria-controls={menuIdx !== null ? `${editorId}-menu` : undefined}
          aria-activedescendant={menuIdx !== null ? `${editorId}-opt-${menuIdx}` : undefined}
          contentEditable={!saving}
          suppressContentEditableWarning
          spellCheck={false}
          onInput={(e) => {
            if ((e.nativeEvent as InputEvent).isComposing) return
            sync()
          }}
          onCompositionEnd={sync}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (menuIdx !== null) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const d = e.key === 'ArrowDown' ? 1 : -1
                setMenuIdx((i) => ((i ?? 0) + d + variables.length) % variables.length)
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                insertVar(variables[menuIdx].name, true)
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMenuIdx(null)
                return
              }
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              document.execCommand('insertLineBreak')
            }
          }}
          onPaste={(e) => {
            // ข้อความล้วนเท่านั้น (ไม่เก็บ HTML) — `{ชื่อ}` ที่วางมากลายเป็นชิปตอน blur
            e.preventDefault()
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
            // วาดใหม่ทันที (ไม่รอ blur — blur ไปแผงอีโมจิแล้ววาดใหม่ทำให้ตำแหน่งเคอร์เซอร์หาย) · เคอร์เซอร์ไปท้ายข้อความ
            const el = boxRef.current
            if (el && hasLiteralVar(el, allowed)) applyBody(domToText(el))
          }}
          className="text-default-900 min-h-32 px-3 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap focus:outline-none"
        />

        {menuIdx !== null && (
          <div id={`${editorId}-menu`} role="listbox" aria-label={t.varMenuLabel} className="card absolute inset-x-3 z-20 -mt-2 max-h-64 overflow-y-auto p-1 shadow-lg">
            {variables.map((v, i) => (
              <button
                key={v.name}
                id={`${editorId}-opt-${i}`}
                type="button"
                role="option"
                aria-selected={i === menuIdx}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertVar(v.name, true)}
                className={`flex min-h-11 w-full flex-col items-start justify-center rounded px-2 text-start lg:min-h-9 ${i === menuIdx ? 'bg-primary/10' : 'hover:bg-default-100'}`}
              >
                <span className="text-default-900 text-sm">{v.name}</span>
                <span className="text-default-600 text-xs">{v.sample}</span>
              </button>
            ))}
          </div>
        )}

        <div className="border-default-200 flex flex-wrap items-center gap-1 border-t px-2 py-1">
          <div className="relative shrink-0">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEmojiOpen((v) => !v)}
              aria-label={t.emojiAria}
              aria-expanded={emojiOpen}
              aria-controls={`${editorId}-emoji`}
              className="hover:bg-default-200 text-default-700 flex size-11 items-center justify-center rounded-full lg:size-9"
            >
              <Icon icon="mood-smile" className="text-lg" />
            </button>
            {emojiOpen && (
              <div id={`${editorId}-emoji`}>
                <EmojiPicker
                  onSelect={(emoji) => {
                    if (count + countCodePoints(emoji) <= max) insertNode(document.createTextNode(emoji))
                  }}
                  onClose={() => setEmojiOpen(false)}
                />
              </div>
            )}
          </div>
          {variables.map((v) => (
            <button
              key={v.name}
              type="button"
              disabled={saving}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertVar(v.name)}
              aria-label={fmt(t.insertVarAria, { name: v.name })}
              title={v.sample}
              className="inline-flex min-h-11 items-center lg:min-h-8"
            >
              <span className="border-primary/40 text-primary-ink hover:bg-primary/10 text-2xs rounded-full border border-dashed px-2 py-0.5 font-medium">
                + {v.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {messages.length > 0 && (
        <ul className="text-danger-ink space-y-1 text-xs" role="alert">
          {messages.map((m) => (
            <li key={m} className="flex items-start gap-1.5">
              <Icon icon="alert-circle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {m}
            </li>
          ))}
        </ul>
      )}
      {warnNoLink && (
        <p className="text-warning-ink flex items-start gap-1.5 text-xs">
          <Icon icon="alert-triangle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {kind === 'TRACKING' ? t.warnNoTrackingLink : t.warnNoLink}
        </p>
      )}
      {(kind === 'ORDER_SUMMARY' || kind === 'TRACKING') && (
        <p className="text-default-700 flex items-start gap-1.5 text-xs">
          <Icon icon="info-circle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {kind === 'ORDER_SUMMARY' ? t.lineNote : t.trackingLinkNote}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || messages.length > 0}
          className="btn bg-primary min-h-11 text-white disabled:opacity-50 lg:min-h-9"
        >
          {saving ? t.saving : t.save}
        </button>
        <button
          type="button"
          onClick={() => void doReset(true)}
          disabled={saving || (!isCustom && text === defaultBody)}
          className="btn border-default-300 text-default-800 min-h-11 border disabled:opacity-50 lg:min-h-9"
        >
          {t.resetDefault}
        </button>
        <button type="button" onClick={onClose} disabled={saving} className="btn text-default-700 min-h-11 lg:min-h-9">
          {t.cancel}
        </button>
        {isCustom && updatedAt && (
          <span className="text-default-600 text-xs">
            {updatedBy ? fmt(t.lastEdited, { when: formatDateTime(updatedAt), name: updatedBy.name }) : fmt(t.lastEditedNoName, { when: formatDateTime(updatedAt) })}
          </span>
        )}
      </div>
    </div>
  )
}
