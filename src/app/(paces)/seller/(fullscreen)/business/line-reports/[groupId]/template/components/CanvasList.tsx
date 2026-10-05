'use client'

/**
 * CanvasList — คอลัมน์ "ข้อความ": รายการเดียวในกรอบเดียว (หัวรายงานล็อก · บล็อกที่ลากได้ · หมายเหตุล็อก · ปุ่มเปิด Deep)
 *
 * Base: src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/CanvasFrame.tsx (Droppable `canvas-blocks` + Draggable ต่อบล็อก + `dragHandleProps` ผูกปุ่มจับ + สถานะลาก `border-primary bg-primary/5 shadow-lg`)
 *   + theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx (DragDropContext/Droppable/Draggable)
 *   + theme/paces/Admin/TS/src/app/(admin)/plugins/sortable/components/NestedListWithHandle.tsx (แถวมี handle)
 *   + theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (`form-input`) · ChecksRadioSwitches.tsx (ผ่าน CheckRow)
 * ต่างจาก CanvasFrame: ไม่มีกรอบต่อบล็อก · ปุ่มย้าย/เอาออกแสดงเฉพาะแถวที่เปิด · เปิดได้ทีละแถว
 * ลำดับ `index` ของ dnd = index ใน `template.blocks` ตรง ๆ (ใช้ `moveToIndex` ตัวเดียวกับปุ่มขึ้น/ลง)
 * BlockRow และ body ทุกตัวอยู่ระดับ module — ห้ามประกาศใน render (พิมพ์แล้ว remount = เสีย focus/IME ไทย)
 * ห้าม ancestor ของ Droppable มี transform/filter/will-change — ไม่มี `active:scale`/`transition-transform` บน wrapper
 */
import type { Dispatch, ReactNode } from 'react'
import { Draggable, Droppable, type DraggableProvided, type DraggableStateSnapshot } from '@hello-pangea/dnd'
import Icon from '@/components/wrappers/Icon'
import { CheckRow } from '@/app/(paces)/seller/(dashboard)/business/line-reports/_components/detail/Rows'
import { type Availability, type AvailabilityContext } from '@/lib/line-report/availability'
import { MAX_BUTTON_LABEL, MAX_TITLE_LENGTH, type Block, type TemplateV1 } from '@/lib/line-report/template'
import { cn } from '@/utils/helpers'
import { BLOCK_ICON, blockSummary, blockTitle, measureLabel, rowWarning } from '../lib/block-meta'
import type { Action } from '../lib/reducer'
import SegControl from './SegControl'
import TextBlockEditor from './TextBlockEditor'

export const CANVAS_DROPPABLE_ID = 'canvas-blocks'
const ROW = 'border-default-200 border-b'
const ICON_BTN = 'btn btn-icon text-default-700 hover:bg-default-100 min-h-11 min-w-11 shrink-0 disabled:opacity-40'

/** ปุ่ม/ช่องที่ผู้ใช้เห็นในแถวเปิด — ต่อชนิดบล็อก */
function ProfitBody() {
  return (
    <p role="status" className="bg-warning/15 text-warning-ink mb-0 rounded-lg px-3 py-2 text-sm">
      ทุกคนในกลุ่ม LINE จะเห็นตัวเลขกำไร รวมถึงคนที่ไม่ได้มีสิทธิ์ดูการเงินในร้าน
    </p>
  )
}

function ShopsBody({ block, top3Avail, readOnly, dispatch, onShopsProfit }: { block: Extract<Block, { type: 'shops' }>; top3Avail: Availability; readOnly: boolean; dispatch: Dispatch<Action>; onShopsProfit: (id: string, next: boolean) => void }) {
  return (
    <div>
      <CheckRow
        checked={block.top3}
        disabled={readOnly || (!top3Avail.ok && !block.top3)}
        onChange={(top3) => dispatch({ type: 'setShops', id: block.id, patch: { top3 } })}
        label="ขายดี 3 อันดับต่อร้าน"
        sub={!top3Avail.ok ? top3Avail.reason : undefined}
      />
      <CheckRow checked={block.profit} disabled={readOnly} onChange={(next) => onShopsProfit(block.id, next)} label="กำไรต่อร้าน" />
    </div>
  )
}

function ChartBody({ block, word, kb, readOnly, dispatch }: { block: Extract<Block, { type: 'chart_trend' | 'chart_compare' }>; word: string; kb: string; readOnly: boolean; dispatch: Dispatch<Action> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-default-700 text-xs">วัดจาก</span>
      <SegControl
        label="วัดจาก"
        value={block.measure}
        disabled={readOnly}
        onChange={(measure) => dispatch({ type: 'setMeasure', id: block.id, measure })}
        options={[
          { value: 'sales', label: measureLabel('sales', word) },
          { value: 'orders', label: measureLabel('orders', word) },
        ]}
      />
      <p className="text-default-700 mb-0 w-full text-xs">~{kb} KB · ถ้าข้อความยาวเกิน ระบบตัดกราฟก่อนตัวเลขหลัก</p>
    </div>
  )
}

function BlockRow({
  block,
  index,
  count,
  open,
  summary,
  warning,
  word,
  readOnly,
  drag,
  snap,
  onToggle,
  dispatch,
  onRemove,
  children,
}: {
  block: Block
  index: number
  count: number
  open: boolean
  summary: string
  warning: string | null
  word: string
  readOnly: boolean
  drag: DraggableProvided | null
  snap: DraggableStateSnapshot | null
  onToggle: (id: string) => void
  dispatch: Dispatch<Action>
  onRemove: (id: string) => void
  children: ReactNode
}) {
  const title = blockTitle(block.type, word)
  const bodyId = `body-${block.id}`
  return (
    <div
      id={`row-${block.id}`}
      ref={drag?.innerRef}
      {...drag?.draggableProps}
      className={cn(ROW, 'bg-card', snap?.isDragging && 'border-primary bg-primary/5 shadow-lg')}
    >
      <div className="flex min-h-12 items-center ps-1">
        {!readOnly && drag && (
          <span
            {...drag.dragHandleProps}
            aria-label={`ลากเพื่อย้าย${title}`}
            className="text-default-500 inline-flex min-h-11 min-w-11 shrink-0 cursor-grab touch-none items-center justify-center"
          >
            <Icon icon="grip-vertical" className="size-4" aria-hidden="true" />
          </span>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(block.id)}
          className={cn('flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1.5 text-start', readOnly && 'ps-3')}
        >
          <Icon icon={warning ? 'alert-triangle' : BLOCK_ICON[block.type]} className={cn('shrink-0 text-base', warning ? 'text-warning-ink' : 'text-default-500')} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="text-default-900 block truncate text-sm font-medium" title={title}>
              {title}
            </span>
            <span className={cn('block truncate text-xs', warning ? 'text-warning-ink' : 'text-default-700')} title={warning ?? summary}>
              {warning ?? summary}
            </span>
          </span>
          <Icon icon="chevron-down" className={cn('text-default-500 me-1 size-4 shrink-0', open && 'rotate-180')} aria-hidden="true" />
        </button>
        {open && !readOnly && (
          <>
            <button type="button" className={ICON_BTN} aria-label={`ย้าย${title}ขึ้น`} disabled={index === 0} onClick={() => dispatch({ type: 'step', id: block.id, dir: -1 })}>
              <Icon icon="chevron-up" className="size-4" aria-hidden="true" />
            </button>
            <button type="button" className={ICON_BTN} aria-label={`ย้าย${title}ลง`} disabled={index === count - 1} onClick={() => dispatch({ type: 'step', id: block.id, dir: 1 })}>
              <Icon icon="chevron-down" className="size-4" aria-hidden="true" />
            </button>
            <button type="button" className={ICON_BTN} aria-label={`เอา${title}ออก`} onClick={() => onRemove(block.id)}>
              <Icon icon="x" className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {open && (
        <div id={bodyId} className="px-4 pb-4 ps-4">
          {children}
        </div>
      )}
    </div>
  )
}

export type CanvasListProps = {
  draft: TemplateV1
  markupById: Readonly<Record<string, string>>
  openId: string | null
  touched: Readonly<Record<string, true>>
  readOnly: boolean
  word: string
  ctx: AvailabilityContext
  top3Avail: Availability
  /** ขนาดข้อความทั้งก้อน (KB) ที่แสดงในบล็อกกราฟ */
  kb: string
  titlePlaceholder: string
  profitOn: boolean
  profitConfirmed: boolean
  profitUnconfirmed: boolean
  dispatch: Dispatch<Action>
  onShopsProfit: (id: string, next: boolean) => void
  onConfirmProfit: () => void
  onRemove: (id: string) => void
}

export default function CanvasList(p: CanvasListProps) {
  const { draft, readOnly, word, dispatch } = p
  const titleLen = draft.title === undefined ? 0 : Array.from(draft.title).length
  const labelLen = Array.from(draft.button.label).length
  const onToggle = (id: string) => dispatch({ type: 'open', id: p.openId === id ? null : id })

  const body = (b: Block): ReactNode => {
    switch (b.type) {
      case 'profit':
        return <ProfitBody />
      case 'shops':
        return <ShopsBody block={b} top3Avail={p.top3Avail} readOnly={readOnly} dispatch={dispatch} onShopsProfit={p.onShopsProfit} />
      case 'chart_trend':
      case 'chart_compare':
        return <ChartBody block={b} word={word} kb={p.kb} readOnly={readOnly} dispatch={dispatch} />
      case 'text':
        return (
          <TextBlockEditor
            block={b}
            markup={p.markupById[b.id] ?? ''}
            touched={p.touched[b.id] === true}
            readOnly={readOnly}
            ctx={p.ctx}
            word={word}
            profitOn={p.profitOn}
            profitConfirmed={p.profitConfirmed}
            profitUnconfirmed={p.profitUnconfirmed}
            dispatch={dispatch}
            onConfirmProfit={p.onConfirmProfit}
          />
        )
      default:
        return null
    }
  }
  const hasBody = (b: Block) => b.type === 'profit' || b.type === 'shops' || b.type === 'text' || b.type === 'chart_trend' || b.type === 'chart_compare'

  const renderRow = (b: Block, i: number, drag: DraggableProvided | null, snap: DraggableStateSnapshot | null) => (
    <BlockRow
      key={b.id}
      block={b}
      index={i}
      count={draft.blocks.length}
      open={p.openId === b.id}
      summary={blockSummary(b, word, p.markupById[b.id] ?? '')}
      warning={rowWarning(b, p.ctx)}
      word={word}
      readOnly={readOnly}
      drag={drag}
      snap={snap}
      onToggle={onToggle}
      dispatch={dispatch}
      onRemove={p.onRemove}
    >
      {hasBody(b) ? body(b) : <p className="text-default-700 mb-0 text-xs">ไม่มีตัวเลือกเพิ่มในบล็อกนี้</p>}
    </BlockRow>
  )

  return (
    <section aria-label="ข้อความ">
      <h2 className="text-default-900 mb-2 text-sm font-semibold">ข้อความ</h2>
      <div className="border-default-300 rounded-lg border">
        {/* หัวรายงาน — ตรึงบนสุด ต้องมีเสมอ (นอก Droppable) */}
        <div
          className={cn(ROW, 'bg-light rounded-t-lg px-4 py-3')}
          title="ตรึงบนสุด · ต้องมีเสมอ เพื่อให้คนในกลุ่มรู้ว่าตัวเลขเป็นของช่วงไหน ณ เวลาใด"
        >
          <div className="flex items-center gap-2">
            <Icon icon="lock" className="text-default-500 size-4 shrink-0" aria-hidden="true" />
            <label htmlFor="template-title" className="text-default-900 shrink-0 text-sm font-medium">
              หัวรายงาน
            </label>
            <input
              id="template-title"
              type="text"
              value={draft.title ?? ''}
              readOnly={readOnly}
              placeholder={p.titlePlaceholder}
              aria-describedby="template-title-help"
              className={cn('form-input min-w-0 flex-1', titleLen > MAX_TITLE_LENGTH && 'is-invalid')}
              onChange={(e) => dispatch({ type: 'setTitle', title: e.target.value })}
            />
          </div>
          <p id="template-title-help" className={cn('mt-1 mb-0 ps-6 text-xs', titleLen > MAX_TITLE_LENGTH ? 'text-danger-ink' : 'text-default-700')}>
            {titleLen > MAX_TITLE_LENGTH ? `ชื่อรายงานยาวเกิน ${MAX_TITLE_LENGTH} ตัวอักษร` : 'ใช้เป็นชื่อของข้อความแรกในแต่ละรอบ · เว้นว่างเพื่อใช้ชื่อมาตรฐาน'}
          </p>
        </div>

        {readOnly ? (
          <div>{draft.blocks.map((b, i) => renderRow(b, i, null, null))}</div>
        ) : (
          <Droppable droppableId={CANVAS_DROPPABLE_ID}>
            {(drop, dropSnap) => (
              <div ref={drop.innerRef} {...drop.droppableProps} className={cn(dropSnap.isDraggingOver && 'bg-primary/5')}>
                {draft.blocks.length === 0 && !dropSnap.isDraggingOver && (
                  <p className="text-default-700 border-default-200 mb-0 border-b p-4 text-center text-sm">
                    ยังไม่มีข้อมูลในข้อความ เพิ่มอย่างน้อย 1 รายการจาก<span className="lg:hidden">แถบด้านบน</span>
                    <span className="hidden lg:inline">คลัง</span>
                  </p>
                )}
                {draft.blocks.map((b, i) => (
                  <Draggable key={b.id} draggableId={b.id} index={i}>
                    {(drag, snap) => renderRow(b, i, drag, snap)}
                  </Draggable>
                ))}
                {drop.placeholder}
              </div>
            )}
          </Droppable>
        )}

        {/* หมายเหตุอัตโนมัติ — ล็อก เอาออกไม่ได้ */}
        <div className={cn(ROW, 'bg-light flex items-start gap-2 px-4 py-3')} title="เอาออกไม่ได้ เพื่อไม่ให้ตัวเลขดูครบทั้งที่ไม่ครบ">
          <Icon icon="lock" className="text-default-500 mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="text-default-900 block text-sm font-medium">หมายเหตุอัตโนมัติ</span>
            <span className="text-default-700 block text-xs">ระบบใส่ให้เมื่อมีร้านที่ไม่ถูกรวมหรือข้อมูลไม่ครบ · เอาออกไม่ได้</span>
          </div>
        </div>

        {/* ปุ่มเปิด Deep — ไม่อยู่ใน blocks (อยู่ใน template.button) ลากไม่ได้ */}
        <div className="rounded-b-lg">
          <button
            type="button"
            aria-expanded={p.openId === 'button'}
            aria-controls="body-button"
            onClick={() => dispatch({ type: 'open', id: p.openId === 'button' ? null : 'button' })}
            className="flex min-h-12 w-full items-center gap-2 px-4 py-1.5 text-start"
          >
            <Icon icon="external-link" className="text-default-500 shrink-0 text-base" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="text-default-900 block text-sm font-medium">ปุ่มเปิด Deep</span>
              <span className="text-default-700 block truncate text-xs">{draft.button.show ? `“${draft.button.label}” · แสดง` : 'ซ่อนอยู่'}</span>
            </span>
            <Icon icon="chevron-down" className={cn('text-default-500 size-4 shrink-0', p.openId === 'button' && 'rotate-180')} aria-hidden="true" />
          </button>
          {p.openId === 'button' && (
            <div id="body-button" className="px-4 pb-4">
              <CheckRow checked={draft.button.show} disabled={readOnly} onChange={(show) => dispatch({ type: 'setButton', patch: { show } })} label="แสดงปุ่มนี้" />
              <label htmlFor="template-button-label" className="text-default-900 mb-1 block text-sm font-medium">
                ป้ายปุ่ม
              </label>
              <input
                id="template-button-label"
                type="text"
                value={draft.button.label}
                readOnly={readOnly}
                aria-describedby="template-button-help"
                className={cn('form-input', (labelLen > MAX_BUTTON_LABEL || draft.button.label.trim() === '') && 'is-invalid')}
                onChange={(e) => dispatch({ type: 'setButton', patch: { label: e.target.value } })}
              />
              <p id="template-button-help" className="text-default-700 mt-1 mb-0 text-xs">
                <span className={cn('tabular-nums', labelLen > MAX_BUTTON_LABEL && 'text-danger-ink')}>{labelLen > MAX_BUTTON_LABEL ? `เกิน ${labelLen - MAX_BUTTON_LABEL} ตัวอักษร` : `เหลือ ${MAX_BUTTON_LABEL - labelLen} ตัวอักษร`}</span>
                {' · '}ปุ่มนี้เปิดหน้า Deep ของคุณเสมอ แก้ได้เฉพาะข้อความบนปุ่ม
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
