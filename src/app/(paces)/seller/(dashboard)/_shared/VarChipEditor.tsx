'use client'

/**
 * VarChipEditor — ตัวแก้ข้อความที่ตัวแปรเป็นชิป `{ชื่อ}` (แกนของ TemplateEditor ยกออกมาเป็น component กลางแบบ presentational)
 * ใช้ที่: บอทติดตามยอดขาย 00095 (ชิ้นข้อความของแต่ละรอบ) · ไม่มี fetch/Swal/toast/kind ของ auto-notify — ผู้เรียกถือข้อความและตัวตรวจเอง
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (ชิป badge rounded-full)
 *   + settings/auto-notify/components/TemplateEditor.tsx (contenteditable + paint/domToText/makeChip/เมนู `{`/อีโมจิ/ตัวนับ — ยกโครงมาทั้งแกน)
 *   + inbox/[conversationId]/components/EmojiPicker.tsx (ปุ่ม mood-smile + แผง)
 * HR1: ตัวแก้ที่ตัวแปรเป็นชิปไม่มีใน theme — ผู้ใช้เลือกเอง 2026-10-18 (ท่าเดียวกับ TemplateEditor)
 *
 * 🛑 contenteditable แบบ uncontrolled: React ไม่วาด children ของกล่อง — `paint()` วาดเองตอน mount เท่านั้น
 * พิมพ์ `{ชื่อ}` จนปิดปีกกา = แทนช่วงนั้นด้วยชิป · ห้ามเขียน DOM ระหว่างพิมพ์ (IME ไทย: สระ/วรรณยุกต์ลอย เคอร์เซอร์กระโดด)
 * ค่าจริงอ่านจาก DOM ด้วย `domToText` ตัวเดียว · ผู้เรียกที่ต้องสลับลำดับ/ลบรายการต้องคีย์ด้วย uid เพื่อให้ DOM ตามตัวมันไป
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { domToText } from '@/lib/auto-notify/editor-dom'
import { textToParts } from '@/lib/auto-notify/editor-text'
import { countCodePoints } from '@/lib/auto-notify/variables'
import EmojiPicker from '@/app/(paces)/seller/(chat)/inbox/[conversationId]/components/EmojiPicker'

const CHIP_CLS = 'badge bg-primary/10 text-primary-ink text-2xs mx-0.5 rounded-full font-semibold'
const LITERAL_VAR_RE = /\{([^{}\n]*)\}/

export interface VarChipVariable {
  name: string
  sample: string
}

export interface VarChipEditorLabels {
  emoji: string
  /** ชื่อปุ่มชิป "+ ชื่อ" สำหรับตัวอ่านหน้าจอ */
  insertVar: (name: string) => string
  varMenu: string
}

function makeChip(name: string): HTMLSpanElement {
  const s = document.createElement('span')
  s.contentEditable = 'false'
  s.dataset.var = name
  s.className = CHIP_CLS
  s.textContent = name
  return s
}

/** วาดข้อความลงกล่อง — ตัวแปรที่ใช้ได้เป็นชิป · ที่ใช้ไม่ได้คงเป็นตัวหนังสือ (ให้ข้อความผิดชี้ได้ว่าตัวไหน) */
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

function hasLiteralVar(el: HTMLElement, allowed: ReadonlySet<string>): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const m = (n.textContent ?? '').match(LITERAL_VAR_RE)
    if (m && allowed.has(m[1])) return true
  }
  return false
}

export default function VarChipEditor({
  id,
  initialValue,
  variables,
  max,
  ariaLabel,
  describedBy,
  invalid,
  disabled,
  labels,
  onChange,
}: {
  /** ใช้เป็นฐาน id ของกล่อง/เมนู/อีโมจิ — ต้องไม่ซ้ำในหน้า */
  id: string
  /** วาดครั้งเดียวตอน mount — หลังจากนั้น DOM เป็นของผู้ใช้ */
  initialValue: string
  variables: readonly VarChipVariable[]
  max: number
  ariaLabel: string
  describedBy?: string
  invalid?: boolean
  disabled?: boolean
  labels: VarChipEditorLabels
  onChange: (text: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<Range | null>(null)
  const [text, setText] = useState(initialValue)
  const [emojiOpen, setEmojiOpen] = useState(false)
  /** เมนู `{` — เปิดเมื่อตัวอักษรหน้าเคอร์เซอร์คือ `{` */
  const [menuIdx, setMenuIdx] = useState<number | null>(null)
  const allowed = useMemo(() => new Set(variables.map((v) => v.name)), [variables])
  const count = countCodePoints(text)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    paint(el, initialValue, allowed)
    // วาดครั้งเดียวตอนเปิด — หลังจากนี้ DOM เป็นของผู้ใช้ (ดูหัวไฟล์)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // native beforeinput: Enter ทุกแบบ = <br> (ไม่ให้เบราว์เซอร์สร้าง <div>) · เต็มเพดาน = ไม่รับเพิ่ม (ยกเว้นระหว่าง IME)
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

  // ผู้เรียกรับค่าผ่าน effect (ไม่ใช่ใน setState updater) — onChange ของผู้เรียกอาจ setState ของแม่
  const lastSent = useRef(initialValue)
  useEffect(() => {
    if (text === lastSent.current) return
    lastSent.current = text
    onChange(text)
  }, [text, onChange])

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

  return (
    <div className={`bg-card relative rounded-lg border ${invalid ? 'border-danger' : 'border-default-300 focus-within:border-primary'}`}>
      <div
        ref={boxRef}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-controls={menuIdx !== null ? `${id}-menu` : undefined}
        aria-activedescendant={menuIdx !== null ? `${id}-opt-${menuIdx}` : undefined}
        contentEditable={!disabled}
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
          // ข้อความล้วนเท่านั้น (ไม่เก็บ HTML) — `{ชื่อ}` ที่วางมากลายเป็นชิปทันที
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
          const el = boxRef.current
          if (el && hasLiteralVar(el, allowed)) applyBody(domToText(el))
        }}
        className="text-default-900 min-h-18 px-3 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap focus:outline-none"
      />

      {menuIdx !== null && (
        <div id={`${id}-menu`} role="listbox" aria-label={labels.varMenu} className="card absolute inset-x-3 z-20 -mt-2 max-h-64 overflow-y-auto p-1 shadow-lg">
          {variables.map((v, i) => (
            <button
              key={v.name}
              id={`${id}-opt-${i}`}
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

      <div className="border-default-200 flex items-center gap-1 border-t px-2 py-1">
        <div className="relative shrink-0">
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEmojiOpen((v) => !v)}
            aria-label={labels.emoji}
            aria-expanded={emojiOpen}
            aria-controls={`${id}-emoji`}
            className="hover:bg-default-200 text-default-700 flex size-11 items-center justify-center rounded-full lg:size-9"
          >
            <Icon icon="mood-smile" className="text-lg" />
          </button>
          {emojiOpen && (
            <div id={`${id}-emoji`}>
              <EmojiPicker
                onSelect={(emoji) => {
                  if (count + countCodePoints(emoji) <= max) insertNode(document.createTextNode(emoji))
                }}
                onClose={() => setEmojiOpen(false)}
              />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {variables.map((v) => (
            <button
              key={v.name}
              type="button"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertVar(v.name)}
              aria-label={labels.insertVar(v.name)}
              title={v.sample}
              className="inline-flex min-h-11 shrink-0 items-center lg:min-h-8"
            >
              <span className="border-primary/40 text-primary-ink hover:bg-primary/10 text-2xs rounded-full border border-dashed px-2 py-0.5 font-medium whitespace-nowrap">+ {v.name}</span>
            </button>
          ))}
        </div>
        <span
          className={`ms-auto shrink-0 pe-1 text-xs tabular-nums ${count >= max ? 'text-danger-ink' : count >= max - 50 ? 'text-warning-ink' : 'text-default-600'}`}
          aria-live={count >= max - 50 ? 'polite' : 'off'}
        >
          {count}/{max}
        </span>
      </div>
    </div>
  )
}
