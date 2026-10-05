'use client'

/**
 * TextBlockEditor — body ของบล็อก "ข้อความ" (feature 00070 EXT · spec §3.5 · AC-EXT-11-13)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (`form-textarea` + `is-invalid`)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (ปุ่ม toggle `aria-pressed` — ไม่พบ theme match ของ rich-text toolbar: ใช้ ui/buttons + seg)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx + ScheduleCard.tsx (ชิปโทเคน `bg-primary/10 text-primary rounded-full`)
 *
 * ช่องพิมพ์ = textarea ธรรมดา (ไม่ contentEditable) · ห้ามใส่ maxLength (กันตัดกลาง IME ไทย) · โทเคนเป็นตัวอักษร `{ป้าย}`
 * ตำแหน่งเคอร์เซอร์/ช่วงเลือกอ่านจาก ref ตอนกดปุ่มเท่านั้น ไม่เก็บใน state (กัน re-render วน)
 * ประกาศระดับ module — ห้ามประกาศใน render (พิมพ์แล้ว remount = เสีย focus/IME) · ห้าม font-mono
 */
import { useRef, useState, type Dispatch } from 'react'
import Icon from '@/components/wrappers/Icon'
import { contextAvailability, REASON, type AvailabilityContext } from '@/lib/line-report/availability'
import { authoredLength, MAX_TEXT_LENGTH, parseMarkup, TOKEN_KEYS, TOKENS, type Block, type TokenKey } from '@/lib/line-report/template'
import { cn } from '@/utils/helpers'
import { confirmProfitExposure } from '../lib/confirm-profit'
import { EMPTY_TEXT_HINT, PROFIT_TOKEN_HINT } from '../lib/draft-issues'
import { insertAtSelection, wrapSelection } from '../lib/markup-edit'
import type { Action } from '../lib/reducer'
import { pacesToast } from '@/lib/paces-toast'
import SegControl from './SegControl'

type TextBlock = Extract<Block, { type: 'text' }>

const TOOL_BTN = 'btn border-default-300 text-default-700 hover:bg-default-100 inline-flex min-h-11 items-center gap-1 border lg:min-h-0'
const CHIP = 'bg-primary/10 text-primary inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium disabled:opacity-50 lg:min-h-8'

const SWATCH = { ink: 'bg-default-900', slate: 'bg-default-700', accent: 'bg-primary' } as const

export default function TextBlockEditor({
  block,
  markup,
  touched,
  readOnly,
  ctx,
  word,
  profitOn,
  profitConfirmed,
  profitUnconfirmed,
  dispatch,
  onConfirmProfit,
}: {
  block: TextBlock
  markup: string
  touched: boolean
  readOnly: boolean
  ctx: AvailabilityContext
  word: string
  /** ฉบับร่างเปิดกำไรอยู่แล้ว (derive) */
  profitOn: boolean
  profitConfirmed: boolean
  /** ฉบับร่างมี {กำไร} แต่ยังไม่ยืนยัน (บันทึกถูกปิด) */
  profitUnconfirmed: boolean
  dispatch: Dispatch<Action>
  onConfirmProfit: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [tokensOpen, setTokensOpen] = useState(false)
  const [formatOpen, setFormatOpen] = useState(false)
  const parsed = parseMarkup(markup)
  const len = authoredLength(parsed.ok ? parsed.runs : block.runs)
  const left = MAX_TEXT_LENGTH - len
  const showError = touched && !parsed.ok
  const hasProfitTok = block.runs.some((r) => 'tok' in r && r.tok === 'profit')
  const hasCondTok = block.runs.some((r) => 'tok' in r && (r.tok === 'cycle_sales' || r.tok === 'profit'))
  const cycleOk = contextAvailability('cycle', ctx).ok
  const errId = `text-err-${block.id}`

  const apply = (r: { text: string; selStart: number; selEnd: number }) => {
    dispatch({ type: 'setMarkup', id: block.id, src: r.text })
    // เคอร์เซอร์/ช่วงเลือกตั้งหลัง React commit ค่าใหม่ลง textarea
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(r.selStart, r.selEnd)
    })
  }
  const sel = () => ({ start: ref.current?.selectionStart ?? markup.length, end: ref.current?.selectionEnd ?? markup.length })

  async function insertToken(k: TokenKey) {
    if (k === 'profit') {
      const ok = await confirmProfitExposure({ showProfit: profitOn }, { showProfit: true }, profitConfirmed)
      if (!ok) return
      dispatch({ type: 'confirmProfit' })
    }
    const { start, end } = sel()
    apply(insertAtSelection(markup, start, end, TOKENS[k]))
  }

  function wrap(marker: '**' | '^^') {
    const { start, end } = sel()
    const r = wrapSelection(markup, start, end, marker)
    if (!r) {
      pacesToast.info('ลากคลุมคำในช่องพิมพ์ก่อน แล้วกดอีกครั้ง')
      return
    }
    apply(r)
  }

  return (
    <div>
      <textarea
        ref={ref}
        rows={3}
        value={markup}
        readOnly={readOnly}
        aria-label="พิมพ์ข้อความถึงคนในกลุ่ม"
        aria-invalid={showError || undefined}
        aria-describedby={showError ? errId : undefined}
        placeholder="พิมพ์ข้อความถึงทีม เช่น สรุปยอดของ {ชื่อร้าน} วันนี้"
        className={cn('form-textarea break-words', showError && 'is-invalid')}
        onChange={(e) => dispatch({ type: 'setMarkup', id: block.id, src: e.target.value })}
        onBlur={() => dispatch({ type: 'touch', id: block.id })}
      />
      {showError && !parsed.ok && (
        <p id={errId} className="text-danger-ink mt-1 mb-0 text-xs">
          {parsed.message}
        </p>
      )}
      {markup.trim() === '' && <p className="text-default-700 mt-1 mb-0 text-xs">{EMPTY_TEXT_HINT}</p>}
      {hasCondTok && <p className="text-default-700 mt-1 mb-0 text-xs">ถ้าคำนวณไม่ได้ในรอบนั้น บรรทัดนี้จะไม่ถูกส่ง และบันทึกในประวัติ</p>}
      {block.runs.some((r) => 'tok' in r && r.tok === 'cycle_sales') && !cycleOk && (
        <p className="text-warning-ink mt-1 mb-0 text-xs">{`{ยอดสะสมรอบ} ส่งได้เฉพาะรายงานรายวันที่ไม่ใช่รอบ 24:00 ในรายงานรายเดือนบรรทัดนี้จะไม่ถูกส่ง (${REASON.CYCLE_NEEDS_MONTHLY})`}</p>
      )}
      {hasProfitTok && profitUnconfirmed && !readOnly && (
        <div role="status" className="bg-warning/15 text-warning-ink mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs">
          <span className="min-w-0 flex-1">{PROFIT_TOKEN_HINT}</span>
          <button type="button" onClick={onConfirmProfit} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white lg:min-h-0">
            เปิดและยืนยัน
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cn('me-auto text-xs tabular-nums', left < 0 ? 'text-danger-ink' : 'text-default-700')}>{left < 0 ? `เกิน ${-left} ตัวอักษร` : `เหลือ ${left} ตัวอักษร`}</span>
        {!readOnly && (
          <>
            <button type="button" aria-expanded={tokensOpen} aria-controls={`tokens-${block.id}`} className={TOOL_BTN} onClick={() => setTokensOpen((p) => !p)}>
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              ข้อมูล
            </button>
            <button type="button" aria-expanded={formatOpen} aria-controls={`format-${block.id}`} className={TOOL_BTN} onClick={() => setFormatOpen((p) => !p)}>
              จัดรูปแบบ
            </button>
          </>
        )}
      </div>

      {tokensOpen && !readOnly && (
        <div id={`tokens-${block.id}`} className="mt-2 flex flex-wrap gap-2">
          {TOKEN_KEYS.map((k) => {
            const cycleBlocked = k === 'cycle_sales' && !cycleOk
            const title = cycleBlocked ? REASON.CYCLE_NEEDS_MONTHLY : k === 'orders_count' ? `แสดงเป็น “${word}” ตามประเภทร้านในข้อความจริง` : undefined
            return (
              <button
                key={k}
                type="button"
                disabled={cycleBlocked}
                title={title}
                // ลากชิปวางบน textarea ได้ (HTML5 native · เดสก์ท็อป) — {กำไร} ไม่ลาก เพราะต้องผ่านด่านยืนยันก่อน
                draggable={k !== 'profit' && !cycleBlocked}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', TOKENS[k])}
                onClick={() => void insertToken(k)}
                className={CHIP}
              >
                {TOKENS[k]}
              </button>
            )
          })}
        </div>
      )}

      {formatOpen && !readOnly && (
        <div id={`format-${block.id}`} className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-default-700 text-xs">ทั้งบรรทัด</span>
            <button
              type="button"
              aria-pressed={block.style.bold}
              onClick={() => dispatch({ type: 'setStyle', id: block.id, patch: { bold: !block.style.bold } })}
              className={cn(TOOL_BTN, 'font-bold', block.style.bold && 'bg-primary/15 text-primary-ink')}
            >
              หนา
            </button>
            <SegControl
              label="ขนาดตัวอักษร"
              value={block.style.size}
              onChange={(size) => dispatch({ type: 'setStyle', id: block.id, patch: { size } })}
              options={[
                { value: 's', label: 'เล็ก' },
                { value: 'm', label: 'ปกติ' },
                { value: 'l', label: 'ใหญ่', title: 'ใหญ่ = เท่าหัวรายงาน ใหญ่กว่านี้ไม่ได้ เพื่อให้ยอดขายยังเด่นที่สุด' },
              ]}
            />
            <SegControl
              label="สีตัวอักษร"
              title="ไม่มีสีเขียวและแดง เพราะในรายงานนี้เขียวหมายถึงยืนยันแล้ว แดงหมายถึงดึงข้อมูลไม่สำเร็จ"
              value={block.style.color}
              onChange={(color) => dispatch({ type: 'setStyle', id: block.id, patch: { color } })}
              options={[
                { value: 'ink', label: (<><span className={cn('size-3 rounded-full', SWATCH.ink)} aria-hidden="true" />ปกติ</>) },
                { value: 'slate', label: (<><span className={cn('size-3 rounded-full', SWATCH.slate)} aria-hidden="true" />รอง</>) },
                { value: 'accent', label: (<><span className={cn('size-3 rounded-full', SWATCH.accent)} aria-hidden="true" />เน้น</>) },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-default-700 text-xs">คำที่เลือก</span>
            <button type="button" className={cn(TOOL_BTN, 'font-bold')} onClick={() => wrap('**')}>
              หนา
            </button>
            <button type="button" className={TOOL_BTN} onClick={() => wrap('^^')}>
              เน้นสี
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
