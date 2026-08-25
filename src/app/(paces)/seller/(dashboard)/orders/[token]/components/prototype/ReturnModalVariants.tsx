'use client'

/**
 * 🧪 PROTOTYPE — 3 variants ของ modal คืนของ (throwaway · ดู README.md)
 *
 * 🛑 แต่ละ variant render **ทั้ง overlay เอง** ไม่ได้แชร์เปลือกชีตกัน — เพราะคำถามรอบนี้คือ
 * "กล่องควรเป็นรูปอะไรถึงจะเป็น flow เดียวกันทั้ง desktop/mobile" ⇒ เปลือกคือสิ่งที่กำลังเทียบ
 * แชร์เปลือกเมื่อไหร่ prototype ก็ตอบคำถามตัวเองไม่ได้ทันที
 */

import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { formatBaht } from '@/lib/format-money'
import {
  CARRIERS,
  METHODS,
  draftCount,
  draftReady,
  draftTotal,
  emptyDraft,
  methodOf,
  type Draft,
  type MethodKey,
  type ProtoItem,
} from './return-model'

export type VariantProps = {
  items: ProtoItem[]
  onClose: () => void
  onSubmit: (d: Draft) => void
}

function useDraft(items: ProtoItem[]) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(items))
  const set = (p: Partial<Draft>) => setDraft((c) => ({ ...c, ...p }))
  const setQty = (id: string, n: number) => setDraft((c) => ({ ...c, qty: { ...c.qty, [id]: n } }))
  return { draft, set, setQty }
}

/** แถบแสดง state ปัจจุบัน — prototype ต้องเห็นว่ากดแล้วอะไรเปลี่ยน */
function StateReadout({ draft, items }: { draft: Draft; items: ProtoItem[] }) {
  const m = methodOf(draft.method)
  return (
    <div className="bg-default-100 text-default-700 mt-3 rounded-lg p-2 font-mono text-2xs leading-relaxed">
      {m.title} · {draft.carrier || '—'} {draft.trackingNo || '—'} · ต้นทุนร้าน:{' '}
      {m.costOptional ? (draft.countAsCost ? 'ใช่' : 'ไม่') : 'ใช่ (บังคับ)'} · {draftCount(draft)} ชิ้น ={' '}
      {formatBaht(draftTotal(draft, items))}
    </div>
  )
}

function MethodRadio({
  draft,
  set,
  variant,
}: {
  draft: Draft
  set: (p: Partial<Draft>) => void
  variant: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {METHODS.map((m) => {
        const on = draft.method === m.key
        return (
          <label
            key={m.key}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 ${
              on ? 'border-primary bg-primary/5' : 'border-default-200'
            }`}
          >
            <input
              type="radio"
              name={`proto-${variant}-method`}
              className="form-radio mt-0.5 shrink-0"
              checked={on}
              onChange={() => set({ method: m.key as MethodKey, carrier: '', trackingNo: '', countAsCost: false })}
            />
            <Icon icon={m.icon} className="text-default-600 mt-0.5 size-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="text-default-900 flex flex-wrap items-center gap-1.5 text-sm font-medium">
                {m.title}
                <span className="badge bg-default-100 text-default-700 text-2xs">{m.money}</span>
              </span>
              <span className="text-default-600 block text-xs">{m.detail}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

function CarrierFields({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select
          className="form-select"
          value={draft.carrier}
          onChange={(e) => set({ carrier: e.target.value })}
          aria-label="ขนส่ง"
        >
          <option value="">เลือกขนส่ง</option>
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="อื่น ๆ">อื่น ๆ</option>
        </select>
        <input
          className="form-input"
          placeholder="เลขพัสดุ (ไม่มีก็เว้นว่างได้)"
          value={draft.trackingNo}
          onChange={(e) => set({ trackingNo: e.target.value })}
          aria-label="เลขพัสดุขากลับ"
        />
      </div>
      {methodOf(draft.method).costOptional && (
        <label className="mt-2 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="form-checkbox mt-0.5"
            checked={draft.countAsCost}
            onChange={(e) => set({ countAsCost: e.target.checked })}
          />
          <span>
            ลูกค้าออกเลขเอง แต่<span className="font-semibold">มาเรียกเก็บร้านทีหลัง</span> — บันทึกเป็นต้นทุนร้าน
          </span>
        </label>
      )}
    </>
  )
}

function ItemRows({
  items,
  draft,
  setQty,
}: {
  items: ProtoItem[]
  draft: Draft
  setQty: (id: string, n: number) => void
}) {
  return (
    <>
      {items.map((i) => {
        const n = draft.qty[i.orderItemId] ?? 0
        return (
          <div
            key={i.orderItemId}
            className="border-default-200 mb-2 flex items-center gap-2 rounded-lg border p-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="text-default-900 block truncate text-sm">{i.name}</span>
              <span className="text-default-500 block text-xs">
                คืนได้ {i.remainingQty} · {formatBaht(i.unitPrice)}/ชิ้น
              </span>
            </span>
            <div className="border-default-300 flex shrink-0 items-center rounded-lg border">
              <button
                type="button"
                className="text-primary inline-flex size-9 items-center justify-center disabled:opacity-40"
                disabled={n <= 0}
                onClick={() => setQty(i.orderItemId, n - 1)}
                aria-label={`ลด ${i.name}`}
              >
                <Icon icon="minus" className="size-4" />
              </button>
              <span className="border-default-200 w-9 border-x py-1.5 text-center text-sm font-bold tabular-nums">
                {n}
              </span>
              <button
                type="button"
                className="text-primary inline-flex size-9 items-center justify-center disabled:opacity-40"
                disabled={n >= i.remainingQty}
                onClick={() => setQty(i.orderItemId, n + 1)}
                aria-label={`เพิ่ม ${i.name}`}
              >
                <Icon icon="plus" className="size-4" />
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}

/* ═══ A · ชีตขั้นเดียว — ตัด "ขั้นตอน" ทิ้ง ═══════════════════════════════
 *
 * ยุทธศาสตร์: สิ่งเดียวที่ทุกขนาดจอทำเหมือนกันได้แน่นอนคือ **คอลัมน์ที่เลื่อนลง**
 * ⇒ ไม่มี wizard ไม่มีขั้น เหลือกล่องเดียวยึดขอบล่างทั้ง desktop และ mobile
 * ปุ่มหลักตรึงท้ายกล่องเสมอ (ไม่ลอยตามเนื้อหา) — จุดที่ของเดิมต่างกันมากที่สุด
 */
export function VariantA({ items, onClose, onSubmit }: VariantProps) {
  const { draft, set, setQty } = useDraft(items)
  useLockBodyScroll(true)
  const m = methodOf(draft.method)

  return (
    <div className="fixed inset-0 z-90 flex items-end justify-center bg-black/50" role="dialog" aria-modal="true">
      {/* เดสก์ท็อปก็ยึดขอบล่าง ไม่ลอยกลางจอ — ตำแหน่งเดียวกันทุกขนาด ต่างแค่ความกว้าง */}
      <div className="card bg-card flex max-h-[92dvh] w-full flex-col rounded-b-none sm:max-w-xl">
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 className="card-title truncate">คืนของ</h5>
          <button type="button" className="btn btn-sm btn-light shrink-0" onClick={onClose} aria-label="ปิด">
            <Icon icon="x" className="size-4" />
          </button>
        </div>

        <div className="card-body min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <p className="text-default-900 mb-2 text-sm font-semibold">จะส่งของกลับยังไง</p>
          <MethodRadio draft={draft} set={set} variant="a" />
          {m.needsCarrier && <CarrierFields draft={draft} set={set} />}

          <div className="border-default-200 my-4 border-t border-dashed" />

          <p className="text-default-900 mb-2 text-sm font-semibold">คืนของชิ้นไหนบ้าง</p>
          <ItemRows items={items} draft={draft} setQty={setQty} />
          <input
            className="form-input mt-2"
            placeholder="เหตุผล (ไม่บังคับ)"
            value={draft.reason}
            onChange={(e) => set({ reason: e.target.value })}
          />
          <StateReadout draft={draft} items={items} />
        </div>

        {/* แถบปุ่มตรึง — เห็นยอดและปุ่มตลอดเวลาไม่ว่าจะเลื่อนไปไหน ทั้งสองขนาดจอ */}
        <div className="border-default-200 flex items-center justify-between gap-3 border-t p-3">
          <span className="text-default-900 text-sm font-semibold">
            คืน {formatBaht(draftTotal(draft, items))}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!draftReady(draft)}
            onClick={() => onSubmit(draft)}
          >
            เปิดใบคืน
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══ B · เต็มจอทั้งสองขนาด — ตัด "ความต่างของกล่อง" ทิ้ง ═════════════════
 *
 * ยุทธศาสตร์: ถ้ากล่องคือสิ่งที่ต่าง ก็เอากล่องออก — ยึดเต็มจอทั้งคู่ แล้วให้เดสก์ท็อปได้
 * คอลัมน์กลางกว้างคงที่บนพื้นเดียวกัน (ท่าเดียวกับ route `(fullscreen)` ที่โปรเจกต์มีอยู่แล้ว)
 * แลกด้วยความรู้สึก "หนัก" บนเดสก์ท็อป — นั่นคือสิ่งที่ต้องตัดสินตอนกดดู
 */
export function VariantB({ items, onClose, onSubmit }: VariantProps) {
  const { draft, set, setQty } = useDraft(items)
  useLockBodyScroll(true)
  const m = methodOf(draft.method)

  return (
    <div className="bg-body-bg fixed inset-0 z-90 flex flex-col" role="dialog" aria-modal="true">
      <div className="border-default-200 bg-card flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <button type="button" className="btn btn-sm btn-light" onClick={onClose} aria-label="ปิด">
          <Icon icon="x" className="size-4" />
        </button>
        <h5 className="mb-0 flex-1 truncate text-base font-semibold">คืนของ</h5>
        <span className="text-default-600 text-xs tabular-nums">{draftCount(draft)} ชิ้น</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[560px] p-3">
          <div className="card mb-3">
            <div className="card-body">
              <p className="text-default-900 mb-2 text-sm font-semibold">จะส่งของกลับยังไง</p>
              <MethodRadio draft={draft} set={set} variant="b" />
              {m.needsCarrier && <CarrierFields draft={draft} set={set} />}
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-default-900 mb-2 text-sm font-semibold">คืนของชิ้นไหนบ้าง</p>
              <ItemRows items={items} draft={draft} setQty={setQty} />
              <input
                className="form-input mt-2"
                placeholder="เหตุผล (ไม่บังคับ)"
                value={draft.reason}
                onChange={(e) => set({ reason: e.target.value })}
              />
            </div>
          </div>
          <StateReadout draft={draft} items={items} />
        </div>
      </div>

      <div className="border-default-200 bg-card shrink-0 border-t">
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 p-3">
          <span className="text-default-900 text-sm font-semibold">
            คืน {formatBaht(draftTotal(draft, items))}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!draftReady(draft)}
            onClick={() => onSubmit(draft)}
          >
            เปิดใบคืน
          </button>
        </div>
      </div>
    </div>
  )
}

type RowId = 'method' | 'items' | 'reason'

/**
 * 🛑 ต้องอยู่ระดับโมดูล ห้ามประกาศในตัว render ของ VariantC
 *
 * React เทียบชนิด component ด้วย identity ของฟังก์ชัน — ประกาศในตัว render = ชนิดใหม่ทุก
 * re-render ⇒ unmount+mount ใหม่ทั้งซับทรี ⇒ **ช่อง "เหตุผล" หลุดโฟกัสทุกตัวอักษร**
 * (docs/conventions/component-declared-in-render.md) ซึ่งจะทำให้ variant C ถูกตัดสินว่า
 * "ใช้ยาก" เพราะบั๊กของ prototype เอง ไม่ใช่เพราะดีไซน์
 */
function SummaryRow({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string
  value: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-default-200 border-b last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="text-default-500 w-20 shrink-0 text-xs">{label}</span>
        <span className="text-default-900 min-w-0 flex-1 truncate text-sm font-medium">{value}</span>
        <Icon icon={open ? 'chevron-up' : 'chevron-down'} className="text-default-400 size-4 shrink-0" />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

/* ═══ C · ใบคืนที่แก้ทีละบรรทัด — ตัด "ฟอร์ม" ทิ้ง ════════════════════════
 *
 * ยุทธศาสตร์: เคสที่พบบ่อยที่สุด (iShip · ของชิ้นเดียว · คืนทั้งหมด) ถูกเติมไว้ให้แล้ว
 * เปิดมาเห็นเป็น "ใบคืน" ที่พร้อมกดยืนยัน — แตะบรรทัดไหนถึงจะกางแก้บรรทัดนั้น
 * กางได้ทีละบรรทัด ⇒ ความสูงคุมได้ ⇒ กล่องเดียวกันพอดีทั้งสองขนาดโดยไม่ต้องมีขั้น
 */
export function VariantC({ items, onClose, onSubmit }: VariantProps) {
  const { draft, set, setQty } = useDraft(items)
  const [openRow, setOpenRow] = useState<RowId | null>(null)
  useLockBodyScroll(true)
  const m = methodOf(draft.method)
  const toggle = (r: RowId) => setOpenRow((c) => (c === r ? null : r))

  return (
    <div className="fixed inset-0 z-90 flex items-end justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="card bg-card flex max-h-[92dvh] w-full flex-col rounded-b-none sm:max-w-md">
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 className="card-title truncate">ใบคืนของ</h5>
          <button type="button" className="btn btn-sm btn-light shrink-0" onClick={onClose} aria-label="ปิด">
            <Icon icon="x" className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <SummaryRow
            label="ส่งกลับโดย"
            value={`${m.title}${draft.carrier ? ` · ${draft.carrier}` : ''}`}
            open={openRow === 'method'}
            onToggle={() => toggle('method')}
          >
            <MethodRadio draft={draft} set={set} variant="c" />
            {m.needsCarrier && <CarrierFields draft={draft} set={set} />}
          </SummaryRow>

          <SummaryRow
            label="ของที่คืน"
            open={openRow === 'items'}
            onToggle={() => toggle('items')}
            value={
              draftCount(draft) === 0
                ? 'ยังไม่ได้เลือก'
                : `${draftCount(draft)} ชิ้น · ${formatBaht(draftTotal(draft, items))}`
            }
          >
            <ItemRows items={items} draft={draft} setQty={setQty} />
          </SummaryRow>

          <SummaryRow
            label="เหตุผล"
            value={draft.reason || 'ไม่ระบุ'}
            open={openRow === 'reason'}
            onToggle={() => toggle('reason')}
          >
            <input
              className="form-input"
              placeholder="เหตุผล (ไม่บังคับ)"
              value={draft.reason}
              onChange={(e) => set({ reason: e.target.value })}
            />
          </SummaryRow>

          <div className="px-3 pt-3">
            <StateReadout draft={draft} items={items} />
          </div>
        </div>

        <div className="border-default-200 border-t p-3">
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={!draftReady(draft)}
            onClick={() => onSubmit(draft)}
          >
            เปิดใบคืน · {formatBaht(draftTotal(draft, items))}
          </button>
        </div>
      </div>
    </div>
  )
}
