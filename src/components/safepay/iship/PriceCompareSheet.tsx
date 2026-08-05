'use client'

/**
 * PriceCompareSheet — เปรียบเทียบราคาทุกขนส่งของร้านก่อนเปิดพัสดุ (ส่วนขยาย feature 00022)
 *
 * เป็น "view swap" ภายในโมดัลเดิมของ ShipmentCreateForm — ไม่ใช่ portal/overlay ใหม่
 * เพราะฟอร์มนี้ถูกใช้ใน 2 ที่ (โมดัลหน้า order detail + แผงในแชทซึ่งซ่อนด้วย hidden
 * ไม่ unmount) การซ้อน fixed overlay ในบริบทแชทจะชน transform/z-index ของ Chat Rail
 *
 * ยิง POST /price/compare ครั้งเดียวได้ครบทุกขนส่ง (server เป็นคน fan-out) — ผลถูก
 * cache ตาม key ของ input: เปิดซ้ำโดยไม่แก้ที่อยู่/ขนาด = เห็นผลเดิมทันที ไม่ยิงใหม่
 *
 * Base: mockup docs/superpowers/specs/2026-08-05-iship-price-compare-mockup.html (อนุมัติ
 *       2026-08-05) + โลโก้ขนส่งตาม pattern OrderCard.tsx (object-contain + ring-1) +
 *       error/warning block ตาม SenderIncompleteNotice.tsx
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { courierInitials, courierLogoUrl } from '@/lib/iship/courier'
import type { CompareResult, CompareRow } from '@/lib/iship/compare'
import type { MissingSenderField } from '@/lib/iship/mapping'
import SenderIncompleteNotice from './SenderIncompleteNotice'

export interface CompareInput {
  receiver: { subdistrict: string; district: string; province: string; postcode: string }
  weight: number
  width: number
  length: number
  height: number
}

interface Props {
  /** เปิดอยู่ไหม — component นี้ mount ค้างไว้เสมอ สลับด้วย hidden เพื่อคง state/ผลเดิม */
  open: boolean
  input: CompareInput
  /** "ไป ต.ขุนยวม อ.ขุนยวม แม่ฮ่องสอน 58140" */
  destinationLabel: string
  /** "1.0 กก. · 20×14×6 ซม." */
  parcelLabel: string
  onPick: (courierCode: string) => void
  /** กลับไปหน้าฟอร์ม — ผู้เรียกเป็นคนคืน focus ให้ปุ่มเทียบราคา */
  onClose: () => void
}

type SheetState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'data'; result: CompareResult }
  | { kind: 'incomplete'; missing: MissingSenderField[] }
  | { kind: 'error' }

const fee = (n: number | null) => (n != null ? `฿${n.toLocaleString('th-TH')}` : '—')

export default function PriceCompareSheet({
  open,
  input,
  destinationLabel,
  parcelLabel,
  onPick,
  onClose,
}: Props) {
  const [state, setState] = useState<SheetState>({ kind: 'idle' })
  /** key ของผลที่ถืออยู่ — input เปลี่ยน (แก้ที่อยู่/ขนาด) ค่อยยิงใหม่ */
  const [loadedKey, setLoadedKey] = useState('')
  /** md เท่านั้น: การ์ดที่กาง breakdown อยู่ — mobile/desktop โชว์เสมอ */
  const [expanded, setExpanded] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const inputKey = useMemo(
    () =>
      [
        input.receiver.subdistrict,
        input.receiver.district,
        input.receiver.province,
        input.receiver.postcode,
        input.weight,
        input.width,
        input.length,
        input.height,
      ].join('|'),
    [input],
  )

  async function load() {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/seller/iship/price/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { code?: string; missing?: MissingSenderField[] }
        } | null
        if (body?.error?.code === 'INCOMPLETE_DATA') {
          setState({ kind: 'incomplete', missing: body.error.missing ?? [] })
        } else {
          setState({ kind: 'error' })
        }
        return
      }
      setState({ kind: 'data', result: (await res.json()) as CompareResult })
    } catch {
      setState({ kind: 'error' })
    }
  }

  // เปิด sheet (หรือเปิดอยู่แล้ว input เปลี่ยน) → ยิงเมื่อยังไม่มีผลของ key นี้
  useEffect(() => {
    if (!open || loadedKey === inputKey) return
    setLoadedKey(inputKey)
    setExpanded(null)
    void load()
    // load อ่านค่าจาก input ปัจจุบันซึ่ง inputKey ครอบอยู่แล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inputKey, loadedKey])

  // ย้าย focus ไปหัวข้อเมื่อเปิด — screen reader อ่านบริบทใหม่ก่อน แล้วค่อย Tab เข้าเนื้อหา
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open])

  const rows = state.kind === 'data' ? state.result.rows : []
  const failed = state.kind === 'data' ? state.result.failed : []
  const isEmpty = state.kind === 'data' && rows.length === 0 && failed.length === 0
  const hasRemote = rows.some((r) => r.remoteFee != null)

  /** สรุปสั้นให้ screen reader ครั้งเดียวตอนผลมา — ไม่อ่านทุกการ์ด */
  const liveMessage =
    state.kind === 'data'
      ? isEmpty
        ? 'ยังไม่มีขนส่งให้เทียบราคา'
        : `พบราคาจาก ${rows.length} ขนส่ง ถูกที่สุดคือ ${rows[0].courierName} ${rows[0].totalPrice.toLocaleString('th-TH')} บาท` +
          (failed.length > 0 ? ` · ประเมินไม่ได้ ${failed.length} ขนส่ง` : '')
      : state.kind === 'error'
        ? 'เทียบราคาไม่สำเร็จ ลองใหม่ได้'
        : ''

  return (
    <div
      className={open ? undefined : 'hidden'}
      onKeyDown={(e) => {
        // Escape = กลับไปฟอร์ม ไม่ใช่ปิดโมดัลทั้งใบ — สกัดก่อนถึง listener ของ IShipModalShell
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>

      {/* ── หัว sheet ── */}
      <div className="flex items-center gap-2 border-b border-default-200 p-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="กลับไปยังฟอร์มเปิดพัสดุ"
          className="btn btn-icon min-h-11 min-w-11 shrink-0 text-default-700 hover:bg-default-100 md:hidden"
        >
          <Icon icon="tabler:chevron-left" className="text-xl" aria-hidden="true" />
        </button>
        <h6 ref={headingRef} tabIndex={-1} className="mb-0 text-base font-semibold text-default-900">
          เปรียบเทียบราคาขนส่ง
        </h6>
        <p className="mb-0 hidden min-w-0 truncate text-sm text-default-700 md:block">
          {destinationLabel} · {parcelLabel}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดหน้าต่างเปรียบเทียบราคา"
          className="btn btn-icon ms-auto hidden min-h-11 min-w-11 shrink-0 text-default-700 hover:bg-default-100 md:flex"
        >
          <Icon icon="tabler:x" className="text-xl" aria-hidden="true" />
        </button>
      </div>

      {/* ── ปลายทาง (mobile) + คำเตือนราคาประมาณการ ── */}
      <div className="border-b border-default-200 p-4 md:py-2.5">
        <p className="mb-0 text-sm text-default-700 md:hidden">
          {destinationLabel} · {parcelLabel}
        </p>
        <p className="mb-0 flex items-start gap-1.5 text-xs text-warning-ink md:mt-0 max-md:mt-1.5">
          <Icon icon="tabler:alert-triangle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
          <span>
            ราคาประมาณการ — ค่าจริงอาจต่างถ้าน้ำหนัก/ขนาดที่ชั่งไม่ตรง
            {hasRemote ? ' · ปลายทางเป็นพื้นที่ห่างไกล มีค่าเพิ่ม (รวมในราคาแล้ว)' : ''}
          </span>
        </p>
      </div>

      {/* ── เนื้อหาตามสถานะ ── */}
      {state.kind === 'loading' && (
        <div className="p-4">
          <p role="status" className="mb-3 text-sm text-default-700">
            กำลังถามราคาจากขนส่งทุกเจ้า…
          </p>
          <div className="flex flex-col gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-default-300 p-3">
                <div className="flex items-center gap-2.5">
                  <span className="size-10 animate-pulse rounded-lg bg-default-200" />
                  <span className="flex-1">
                    <span className="mb-1.5 block h-3.5 w-28 animate-pulse rounded bg-default-200" />
                    <span className="block h-3 w-20 animate-pulse rounded bg-default-200" />
                  </span>
                  <span className="h-6 w-14 animate-pulse rounded bg-default-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.kind === 'incomplete' && (
        <div className="p-4">
          <SenderIncompleteNotice missing={state.missing} missingReceiver={[]} />
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-danger/15 text-danger">
            <Icon icon="tabler:alert-circle" className="text-2xl" aria-hidden="true" />
          </span>
          <div>
            <p className="mb-1 font-semibold text-default-900">เทียบราคาไม่สำเร็จ</p>
            <p className="mb-0 text-sm text-default-700">
              ขนส่งทุกเจ้ายังไม่ตอบกลับตอนนี้ ลองใหม่อีกครั้งได้เลย
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="btn inline-flex items-center gap-2 bg-primary px-5 py-3 text-white hover:bg-primary-hover"
          >
            <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
            ลองใหม่
          </button>
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-default-100 text-default-500">
            <Icon icon="tabler:package" className="text-2xl" aria-hidden="true" />
          </span>
          <div>
            <p className="mb-1 font-semibold text-default-900">ยังไม่มีขนส่งให้เทียบราคา</p>
            <p className="mb-0 text-sm text-default-700">
              บัญชี iShip ของร้านยังไม่เปิดใช้งานขนส่งเจ้าไหนเลย ไปเปิดใช้งานที่หน้าตั้งค่าก่อน
            </p>
          </div>
          <Link
            href="/settings?iship=settings"
            className="btn inline-flex items-center gap-2 bg-primary px-5 py-3 text-white hover:bg-primary-hover"
          >
            ไปตั้งค่าขนส่ง
          </Link>
        </div>
      )}

      {state.kind === 'data' && rows.length > 0 && (
        <div className="flex flex-col gap-3 p-4 md:grid md:grid-cols-2 lg:flex lg:flex-col">
          {rows.map((row, i) => (
            <CourierCard
              key={row.courierCode}
              row={row}
              cheapest={i === 0}
              expanded={expanded === row.courierCode}
              onToggle={() =>
                setExpanded((cur) => (cur === row.courierCode ? null : row.courierCode))
              }
              onPick={() => onPick(row.courierCode)}
            />
          ))}
          {failed.length > 0 && (
            <p className="mb-0 text-xs text-default-700 md:col-span-2">
              ประเมินไม่ได้ {failed.length} ขนส่ง: {failed.map((f) => f.courierName).join(', ')} —
              ขนส่งไม่ตอบกลับ ลองใหม่ได้จากปุ่มเทียบราคา
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CourierCard({
  row,
  cheapest,
  expanded,
  onToggle,
  onPick,
}: {
  row: CompareRow
  cheapest: boolean
  expanded: boolean
  onToggle: () => void
  onPick: () => void
}) {
  const logo = courierLogoUrl(row.courierCode, row.courierName)
  return (
    <div
      className={`rounded-lg border p-3 lg:flex lg:items-center lg:gap-3 ${
        cheapest ? 'border-primary' : 'border-default-300'
      }`}
    >
      {/* หัวการ์ด — บน md เป็นปุ่มกาง breakdown (mobile/desktop โชว์เสมอ กดไม่มีผล) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`bd-${row.courierCode}`}
        className="flex w-full items-center gap-2.5 text-start lg:w-56 lg:shrink-0"
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={row.courierName}
            /* object-contain + ring-1 ตาม OrderCard: โลโก้ 2:1 (Fuze) ห้ามครอป,
               โลโก้พื้นขาวต้องมีขอบไม่ให้กลืนการ์ด */
            className="ring-default-200 size-10 shrink-0 rounded-lg bg-white object-contain ring-1"
          />
        ) : (
          <span className="bg-default-100 text-default-700 flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
            {courierInitials(row.courierName, row.courierCode)}
          </span>
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-default-900">{row.courierName}</span>
            {cheapest && <span className="badge bg-primary text-white shrink-0">ถูกที่สุด</span>}
          </span>
          {row.estimateDays != null && (
            <span className="block text-xs text-default-700">
              ถึงปลายทางราว {row.estimateDays} วัน
            </span>
          )}
        </span>
        <span className="ms-auto text-lg font-bold tabular-nums text-default-900 lg:hidden">
          ฿{row.totalPrice.toLocaleString('th-TH')}
        </span>
      </button>

      {/* breakdown 3 ช่อง — md ยุบไว้หลังแตะการ์ด (จอแคบ 2 คอลัมน์ไม่พอ), mobile/desktop โชว์เสมอ */}
      <div
        id={`bd-${row.courierCode}`}
        className={`mt-2.5 grid grid-cols-3 gap-2 border-t border-dashed border-default-300 pt-2.5 text-center lg:mt-0 lg:flex-1 lg:border-t-0 lg:pt-0 ${
          expanded ? '' : 'md:hidden lg:grid'
        }`}
      >
        <div>
          <p className="mb-0 text-xs text-default-700">ค่าส่ง</p>
          <p className="mb-0 text-sm font-medium tabular-nums text-default-900">
            {fee(row.basePrice)}
          </p>
        </div>
        <div>
          <p className="mb-0 text-xs text-default-700">ค่าน้ำมัน</p>
          <p className="mb-0 text-sm font-medium tabular-nums text-default-900">
            {fee(row.fuelFee)}
          </p>
        </div>
        <div>
          <p className="mb-0 text-xs text-default-700">พื้นที่ห่างไกล</p>
          <p className="mb-0 text-sm font-medium tabular-nums text-default-900">
            {fee(row.remoteFee)}
          </p>
        </div>
      </div>

      <p className="mb-0 hidden w-16 text-end text-lg font-bold tabular-nums text-default-900 lg:block">
        ฿{row.totalPrice.toLocaleString('th-TH')}
      </p>

      <button
        type="button"
        onClick={onPick}
        aria-label={`ใช้ขนส่ง ${row.courierName} ราคา ${row.totalPrice.toLocaleString('th-TH')} บาท`}
        className={`btn mt-2.5 w-full py-3 lg:mt-0 lg:w-auto lg:shrink-0 lg:px-5 ${
          cheapest
            ? 'bg-primary text-white hover:bg-primary-hover'
            : 'border border-primary text-primary hover:bg-primary hover:text-white'
        }`}
      >
        ใช้ขนส่งนี้
      </button>
    </div>
  )
}
