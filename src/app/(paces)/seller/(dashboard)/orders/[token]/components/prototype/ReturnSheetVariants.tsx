'use client'

/**
 * 🧪 PROTOTYPE — 3 variants ของชีตคืนของ (throwaway · ดู README.md)
 *
 * ทั้ง 3 ใช้ radio 4 ตัวเลือกเป็นภาษาคนเหมือนกัน (แกนที่ user เสนอ) — ที่ต่างกันคือ **ลำดับ
 * การตัดสินใจ** และ **รูปแบบหลักของหน้า** ไม่ใช่สี:
 *   A  วิธีคืน → ของ   · wizard 2 ขั้น · radio เป็นการ์ดใหญ่
 *   B  จอเดียวจบ        · radio เป็นแถวลิสต์ · ของอยู่บน
 *   C  ของ → วิธีคืน   · เลือกของเต็มจอด้วย stepper · แถบสรุปยอดติดล่าง
 *
 * 🛑 onSubmit เป็น stub — prototype ตอบคำถาม "ควรหน้าตายังไง" ไม่ใช่ "backend ทำงานไหม"
 */

import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { formatBaht } from '@/lib/format-money'
import {
  SHIPPING_CHOICES,
  choiceOf,
  draftCount,
  draftReady,
  draftTotal,
  emptyDraft,
  type ChoiceKey,
  type ProtoDraft,
  type ProtoItem,
} from './return-shipping-choices'

export type VariantProps = {
  items: ProtoItem[]
  onSubmit: (draft: ProtoDraft) => void
  onCancel: () => void
}

// ─── ชิ้นส่วนที่แชร์ได้จริง (ไม่ใช่ layout — layout ต้องต่างกัน ไม่งั้นไม่ใช่ prototype) ────

function QtyStepper({
  value,
  max,
  onChange,
}: {
  value: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="btn btn-sm btn-light size-9 p-0"
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
        aria-label="ลดจำนวน"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        className="btn btn-sm btn-light size-9 p-0"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="เพิ่มจำนวน"
      >
        +
      </button>
    </div>
  )
}

function TrackingFields({ draft, set }: { draft: ProtoDraft; set: (d: Partial<ProtoDraft>) => void }) {
  return (
    <div className="mt-2 flex gap-2">
      <input
        className="form-input flex-1"
        placeholder="ชื่อขนส่ง"
        value={draft.manualCourier}
        onChange={(e) => set({ manualCourier: e.target.value })}
      />
      <input
        className="form-input flex-1"
        placeholder="เลขพัสดุ *"
        value={draft.manualTrackingNo}
        onChange={(e) => set({ manualTrackingNo: e.target.value })}
      />
    </div>
  )
}

/** ถามเฉพาะตอนลูกค้าออกค่าส่ง — ร้านจ่ายเองบังคับเป็นต้นทุนอยู่แล้ว ถามไปก็หลอกว่าเลือกได้ */
function CostToggle({ draft, set }: { draft: ProtoDraft; set: (d: Partial<ProtoDraft>) => void }) {
  return (
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
  )
}

function useDraft() {
  const [draft, setDraft] = useState<ProtoDraft>(emptyDraft)
  const set = (d: Partial<ProtoDraft>) => setDraft((cur) => ({ ...cur, ...d }))
  const setQty = (id: string, n: number) =>
    setDraft((cur) => ({ ...cur, qty: { ...cur.qty, [id]: n } }))
  return { draft, set, setQty }
}

// ─── A · วิธีคืนก่อน (wizard 2 ขั้น · radio เป็นการ์ดใหญ่) ────────────────────────
//
// สมมติฐาน: สิ่งที่ร้าน "ตกลงกับลูกค้าไปแล้ว" คือวิธีคืน ส่วนของกี่ชิ้นเป็นรายละเอียดที่ดูทีหลัง
// ถามเรื่องที่ตัดสินใจไปแล้วก่อน = ผ่านขั้นแรกได้เร็ว และขั้นสองไม่มีอะไรมารบกวนสายตา

export function VariantA({ items, onSubmit, onCancel }: VariantProps) {
  const { draft, set, setQty } = useDraft()
  const [step, setStep] = useState<1 | 2>(1)
  const choice = draft.choice ? choiceOf(draft.choice) : null

  if (step === 1) {
    return (
      <div>
        <p className="text-default-900 mb-1 text-sm font-semibold">ตกลงกับลูกค้าไว้ยังไง</p>
        <p className="text-default-600 mb-3 text-xs">เลือกข้อที่ตรงกับที่คุยกันไว้</p>

        <div className="flex flex-col gap-2">
          {SHIPPING_CHOICES.map((c) => {
            const on = draft.choice === c.key
            return (
              <label
                key={c.key}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  on ? 'border-primary bg-primary/5' : 'border-default-200'
                }`}
              >
                <input
                  type="radio"
                  name="proto-a-choice"
                  className="form-radio mt-0.5 shrink-0"
                  checked={on}
                  onChange={() => set({ choice: c.key })}
                />
                <Icon icon={c.icon} className="text-default-600 mt-0.5 size-5 shrink-0" />
                <span className="min-w-0">
                  <span className="text-default-900 block text-sm font-medium">{c.title}</span>
                  <span className="text-default-600 block text-xs">{c.detail}</span>
                </span>
              </label>
            )
          })}
        </div>

        {choice?.needsTracking && <TrackingFields draft={draft} set={set} />}
        {choice?.costOptional && <CostToggle draft={draft} set={set} />}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="btn btn-primary flex-1"
            disabled={!draft.choice || (choice!.needsTracking && draft.manualTrackingNo.trim() === '')}
            onClick={() => setStep(2)}
          >
            ถัดไป — เลือกของที่คืน
          </button>
          <button type="button" className="btn btn-light" onClick={onCancel}>
            ยกเลิก
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button type="button" className="btn btn-sm btn-light mb-3" onClick={() => setStep(1)}>
        ← {choice?.title}
      </button>

      <p className="text-default-900 mb-2 text-sm font-semibold">คืนของชิ้นไหนบ้าง</p>
      {items.map((i) => (
        <div key={i.orderItemId} className="border-default-200 mb-2 flex items-center gap-3 rounded-lg border p-3">
          <span className="min-w-0 flex-1">
            <span className="text-default-900 block truncate text-sm">{i.name}</span>
            <span className="text-default-500 block text-xs">
              ซื้อ {i.orderedQty} · คืนได้ {i.remainingQty} · {formatBaht(i.unitPrice)}/ชิ้น
            </span>
          </span>
          <QtyStepper
            value={draft.qty[i.orderItemId] ?? 0}
            max={i.remainingQty}
            onChange={(n) => setQty(i.orderItemId, n)}
          />
        </div>
      ))}

      <input
        className="form-input mt-3"
        placeholder="เหตุผล (ไม่บังคับ)"
        value={draft.reason}
        onChange={(e) => set({ reason: e.target.value })}
      />

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-default-900 text-sm font-semibold">
          คืน {formatBaht(draftTotal(draft, items))}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!draftReady(draft, items)}
          onClick={() => onSubmit(draft)}
        >
          เปิดใบคืน
        </button>
      </div>
    </div>
  )
}

// ─── B · จอเดียวจบ (radio เป็นแถวลิสต์ · ของอยู่บน) ─────────────────────────────
//
// สมมติฐานตรงข้ามกับ A: ร้านอยากเห็นทุกอย่างพร้อมกันแล้วกดครั้งเดียวจบ ไม่ต้องจำว่าขั้นก่อน
// เลือกอะไรไว้ · radio เป็นแถวเตี้ย ๆ (ไม่ใช่การ์ด) เพื่อให้ทั้งหมดพอดีจอเดียวโดยไม่ต้องเลื่อน

export function VariantB({ items, onSubmit, onCancel }: VariantProps) {
  const { draft, set, setQty } = useDraft()
  const choice = draft.choice ? choiceOf(draft.choice) : null

  return (
    <div>
      <p className="text-default-900 mb-2 text-sm font-semibold">คืนของชิ้นไหนบ้าง</p>
      {items.map((i) => (
        <div key={i.orderItemId} className="mb-1.5 flex items-center gap-2">
          <span className="text-default-800 min-w-0 flex-1 truncate text-sm">
            {i.name}
            <span className="text-default-500"> · เหลือ {i.remainingQty}</span>
          </span>
          <QtyStepper
            value={draft.qty[i.orderItemId] ?? 0}
            max={i.remainingQty}
            onChange={(n) => setQty(i.orderItemId, n)}
          />
        </div>
      ))}

      <div className="border-default-200 my-3 border-t border-dashed" />

      <p className="text-default-900 mb-2 text-sm font-semibold">ค่าส่งขากลับ</p>
      <div className="border-default-200 divide-default-200 divide-y overflow-hidden rounded-lg border">
        {SHIPPING_CHOICES.map((c) => {
          const on = draft.choice === c.key
          return (
            <label
              key={c.key}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-2.5 ${on ? 'bg-primary/5' : ''}`}
            >
              <input
                type="radio"
                name="proto-b-choice"
                className="form-radio shrink-0"
                checked={on}
                onChange={() => set({ choice: c.key })}
              />
              <span className="text-default-900 min-w-0 flex-1 text-sm">{c.title}</span>
            </label>
          )
        })}
      </div>

      {/* คำอธิบายโผล่เฉพาะข้อที่เลือก — ถ้าโชว์ทั้ง 4 ข้อ ลิสต์จะสูงเท่าการ์ดของ A พอดี
          แล้วข้อดีเรื่อง "จอเดียวจบ" ก็หายไป */}
      {choice && <p className="text-default-600 mt-2 text-xs">{choice.detail}</p>}
      {choice?.needsTracking && <TrackingFields draft={draft} set={set} />}
      {choice?.costOptional && <CostToggle draft={draft} set={set} />}

      <input
        className="form-input mt-3"
        placeholder="เหตุผล (ไม่บังคับ)"
        value={draft.reason}
        onChange={(e) => set({ reason: e.target.value })}
      />

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-default-900 text-sm font-semibold">
          คืน {formatBaht(draftTotal(draft, items))}
        </span>
        <span className="flex gap-2">
          <button type="button" className="btn btn-light" onClick={onCancel}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!draftReady(draft, items)}
            onClick={() => onSubmit(draft)}
          >
            เปิดใบคืน
          </button>
        </span>
      </div>
    </div>
  )
}

// ─── C · เลือกของก่อน (แถบสรุปยอดติดล่าง) ────────────────────────────────────────
//
// สมมติฐาน: เรื่องที่ผิดพลาดแล้วเจ็บที่สุดคือ "จำนวนที่คืน" (มันคือเงิน) จึงให้มันได้ทั้งจอ
// และมี **ยอดที่จะคืนติดตาอยู่ตลอด** ที่แถบล่าง · วิธีส่งเป็นขั้นที่สองแบบลิสต์เตี้ย

export function VariantC({ items, onSubmit, onCancel }: VariantProps) {
  const { draft, set, setQty } = useDraft()
  const [step, setStep] = useState<1 | 2>(1)
  const choice = draft.choice ? choiceOf(draft.choice) : null
  const count = draftCount(draft)

  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {step === 1 ? (
          <>
            <p className="text-default-900 mb-2 text-sm font-semibold">เลือกของที่ลูกค้าคืน</p>
            {items.map((i) => {
              const q = draft.qty[i.orderItemId] ?? 0
              const on = q > 0
              return (
                <button
                  key={i.orderItemId}
                  type="button"
                  // แตะที่แถว = คืนทั้งหมดของชิ้นนั้น (เคสที่พบบ่อยที่สุด) แล้วค่อยปรับด้วย stepper
                  onClick={() => setQty(i.orderItemId, on ? 0 : i.remainingQty)}
                  className={`mb-2 flex w-full items-center gap-3 rounded-lg border p-3 text-start ${
                    on ? 'border-primary bg-primary/5' : 'border-default-200'
                  }`}
                >
                  <Icon
                    icon={on ? 'circle-check-filled' : 'circle'}
                    className={`size-5 shrink-0 ${on ? 'text-primary' : 'text-default-400'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-default-900 block truncate text-sm">{i.name}</span>
                    <span className="text-default-500 block text-xs">
                      คืนได้ {i.remainingQty} · {formatBaht(i.unitPrice)}/ชิ้น
                    </span>
                  </span>
                  {on && i.remainingQty > 1 && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <QtyStepper value={q} max={i.remainingQty} onChange={(n) => setQty(i.orderItemId, n)} />
                    </span>
                  )}
                </button>
              )
            })}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-sm btn-light mb-3" onClick={() => setStep(1)}>
              ← คืน {count} ชิ้น · {formatBaht(draftTotal(draft, items))}
            </button>
            <p className="text-default-900 mb-2 text-sm font-semibold">ค่าส่งขากลับใครออก</p>
            <div className="flex flex-col gap-1.5">
              {SHIPPING_CHOICES.map((c) => {
                const on = draft.choice === c.key
                return (
                  <label
                    key={c.key}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 ${
                      on ? 'border-primary bg-primary/5' : 'border-default-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="proto-c-choice"
                      className="form-radio shrink-0"
                      checked={on}
                      onChange={() => set({ choice: c.key })}
                    />
                    <span className="text-default-900 min-w-0 flex-1 text-sm">{c.title}</span>
                  </label>
                )
              })}
            </div>
            {choice?.needsTracking && <TrackingFields draft={draft} set={set} />}
            {choice?.costOptional && <CostToggle draft={draft} set={set} />}
            <input
              className="form-input mt-3"
              placeholder="เหตุผล (ไม่บังคับ)"
              value={draft.reason}
              onChange={(e) => set({ reason: e.target.value })}
            />
          </>
        )}
      </div>

      {/* แถบสรุปติดล่าง — ยอดที่จะคืนต้องอยู่ในสายตาตลอด เพราะมันคือเงินที่หายจากยอดขาย */}
      <div className="border-default-200 bg-card sticky bottom-0 -mx-4 mt-3 border-t px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-default-900 text-sm font-semibold">
            {count > 0 ? `${count} ชิ้น · ${formatBaht(draftTotal(draft, items))}` : 'ยังไม่ได้เลือกของ'}
          </span>
          {step === 1 ? (
            <span className="flex gap-2">
              <button type="button" className="btn btn-light" onClick={onCancel}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={count === 0}
                onClick={() => setStep(2)}
              >
                ถัดไป
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!draftReady(draft, items)}
              onClick={() => onSubmit(draft)}
            >
              เปิดใบคืน
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
