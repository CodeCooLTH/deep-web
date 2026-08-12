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
import type { MissingReceiverField, MissingSenderField } from '@/lib/iship/mapping'
import SenderIncompleteNotice from './SenderIncompleteNotice'
import { useIShipUrl } from '@/components/safepay/iship/iship-shop-context'

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
  /**
   * ช่องผู้รับที่ยังขาด "ณ ตอนนี้" จากฟอร์ม — ส่งต่อให้ SenderIncompleteNotice ตอน
   * INCOMPLETE_DATA: ถ้า hardcode [] บล็อกสีฟ้าจะอ้างว่า "ข้อมูลผู้รับครบแล้ว" ทั้งที่
   * ชื่อ/เบอร์/บ้านเลขที่อาจยังว่าง (compareReady ไม่เช็คสามช่องนั้น) = ข้อมูลเท็จ
   */
  missingReceiver: MissingReceiverField[]
  onPick: (courierCode: string) => void
  /** กลับไปหน้าฟอร์ม — ผู้เรียกเป็นคนคืน focus ให้ปุ่มเทียบราคา */
  onClose: () => void
}

type SheetState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'data'; result: CompareResult }
  | { kind: 'incomplete'; missing: MissingSenderField[] }
  /** detail = ข้อความจริงจาก server — ไม่มีบรรทัดนี้ user/เรา วินิจฉัยจากหน้าจอไม่ได้เลย */
  | { kind: 'error'; detail?: string }

const fee = (n: number | null) => (n != null ? `฿${n.toLocaleString('th-TH')}` : '—')

export default function PriceCompareSheet({
  open,
  input,
  destinationLabel,
  parcelLabel,
  missingReceiver,
  onPick,
  onClose,
}: Props) {
  // URL ของ iShip ต้องพก shopId ของแผงนี้ไปด้วยเสมอ (ดู iship-shop-context)
  const ishipUrl = useIShipUrl()
  const [state, setState] = useState<SheetState>({ kind: 'idle' })
  /** key ของผลที่ถืออยู่ — input เปลี่ยน (แก้ที่อยู่/ขนาด) ค่อยยิงใหม่ */
  const [loadedKey, setLoadedKey] = useState('')
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
      const res = await fetch(ishipUrl('/api/seller/iship/price/compare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { code?: string; message?: string; missing?: MissingSenderField[] }
        } | null
        if (body?.error?.code === 'INCOMPLETE_DATA') {
          setState({ kind: 'incomplete', missing: body.error.missing ?? [] })
        } else {
          setState({
            kind: 'error',
            detail: body?.error
              ? `${body.error.code ?? ''} ${body.error.message ?? ''}`.trim()
              : `HTTP ${res.status}`,
          })
        }
        return
      }
      setState({ kind: 'data', result: (await res.json()) as CompareResult })
    } catch {
      setState({ kind: 'error', detail: 'เครือข่ายมีปัญหา — คำขอส่งไม่ถึงระบบ' })
    }
  }

  // เปิด sheet (หรือเปิดอยู่แล้ว input เปลี่ยน) → ยิงเมื่อยังไม่มีผลของ key นี้
  useEffect(() => {
    if (!open || loadedKey === inputKey) return
    setLoadedKey(inputKey)
    void load()
    // load อ่านค่าจาก input ปัจจุบันซึ่ง inputKey ครอบอยู่แล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inputKey, loadedKey])

  // ย้าย focus ไปหัวข้อเมื่อเปิด — screen reader อ่านบริบทใหม่ก่อน แล้วค่อย Tab เข้าเนื้อหา
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open])

  // Escape = กลับไปฟอร์ม ไม่ใช่ปิดโมดัลทั้งใบ — ดักที่ document แบบ capture เพราะ listener
  // ของ IShipModalShell อยู่ระดับ document เหมือนกัน: ถ้าดักแค่ใน div ของ sheet แล้ว focus
  // หลุดไปที่พื้นที่ไม่ focusable กด Esc จะทิ้งทั้งโมดัล (ฟอร์มที่กรอกไว้หายทั้งชุด)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  const rows = state.kind === 'data' ? state.result.rows : []
  const failed = state.kind === 'data' ? state.result.failed : []
  const isEmpty = state.kind === 'data' && rows.length === 0 && failed.length === 0
  /** พังทุกเจ้า (server ตอบ 200 พร้อมเหตุผลรายเจ้า) — แสดงเป็น state ล้มเหลวไม่ใช่รายการว่าง */
  const allFailed = state.kind === 'data' && rows.length === 0 && failed.length > 0
  const errorDetail =
    state.kind === 'error'
      ? state.detail
      : allFailed && state.kind === 'data'
        ? state.result.failedDetail
        : undefined
  const showError = state.kind === 'error' || allFailed
  const hasRemote = rows.some((r) => r.remoteFee != null)

  // แกนตัดสินใจที่สอง "ความเร็ว" — ไม่มี badge นี้ผู้ใช้ต้องไล่อ่านวันเองทั้ง ~17 ใบ
  // ให้ใบแรกที่วันน้อยสุดใบเดียว (วันเท่ากันหลายใบ = ใบที่ถูกกว่าชนะเพราะ rows เรียงราคาแล้ว)
  const fastestCode = useMemo(() => {
    if (rows.length < 2) return null
    let best: CompareRow | null = null
    for (const r of rows) {
      if (r.estimateDays == null) continue
      if (!best || r.estimateDays < (best.estimateDays as number)) best = r
    }
    return best?.courierCode ?? null
  }, [rows])

  /** สรุปสั้นให้ screen reader ครั้งเดียวตอนผลมา — ไม่อ่านทุกการ์ด */
  const liveMessage =
    state.kind === 'data'
      ? isEmpty
        ? 'ยังไม่มีขนส่งให้เทียบราคา'
        : allFailed
          ? 'เทียบราคาไม่สำเร็จ ลองใหม่ได้'
          : `พบราคาจาก ${rows.length} ขนส่ง ถูกที่สุดคือ ${rows[0].courierName} ${rows[0].totalPrice.toLocaleString('th-TH')} บาท` +
            (failed.length > 0 ? ` · ประเมินไม่ได้ ${failed.length} ขนส่ง` : '')
      : state.kind === 'error'
        ? 'เทียบราคาไม่สำเร็จ ลองใหม่ได้'
        : ''

  return (
    /* @container: layout ของ sheet ตัดสินจากความกว้าง "กล่องจริง" ไม่ใช่ viewport —
       component นี้อยู่ได้ทั้ง modal 672px และแผงแชทแคบ ~450px บนจอ desktop
       (เหตุ prod 2026-08-06: แผงแชทโดน layout แถวเดสก์ท็อปจน text ทับกันหมด)
       precedent: ProductGrid ใน POS (อนุมัติ 2026-08-01) */
    <div className={`@container ${open ? '' : 'hidden'}`}>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>

      {/* ── หัว sheet ── */}
      <div className="flex items-center gap-2 border-b border-default-200 p-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="กลับไปยังฟอร์มเปิดพัสดุ"
          className="btn btn-icon min-h-11 min-w-11 shrink-0 text-default-700 hover:bg-default-100 @2xl:hidden"
        >
          <Icon icon="tabler:chevron-left" className="text-xl" aria-hidden="true" />
        </button>
        {/* outline-none: focus ด้วยโปรแกรมตอนเปิด sheet — กรอบ ring บนหัวข้อไม่สื่ออะไร
            (เห็นจริงในแผงแชท 2026-08-06) screen reader ยังอ่านปกติ */}
        <h6
          ref={headingRef}
          tabIndex={-1}
          className="mb-0 text-base font-semibold text-default-900 outline-none"
        >
          เปรียบเทียบราคาขนส่ง
        </h6>
        <p className="mb-0 hidden min-w-0 truncate text-sm text-default-700 @2xl:block">
          {destinationLabel} · {parcelLabel}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดหน้าต่างเปรียบเทียบราคา"
          className="btn btn-icon ms-auto hidden min-h-11 min-w-11 shrink-0 text-default-700 hover:bg-default-100 @2xl:flex"
        >
          <Icon icon="tabler:x" className="text-xl" aria-hidden="true" />
        </button>
      </div>

      {/* ── ปลายทาง (กล่องแคบ) + คำเตือนราคาประมาณการ ── */}
      <div className="border-b border-default-200 p-4 @2xl:py-2.5">
        <p className="mb-0 text-sm text-default-700 @2xl:hidden">
          {destinationLabel} · {parcelLabel}
        </p>
        <p className="mb-0 mt-1.5 flex items-start gap-1.5 text-xs text-warning-ink @2xl:mt-0">
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
          <SenderIncompleteNotice missing={state.missing} missingReceiver={missingReceiver} />
        </div>
      )}

      {showError && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-danger/15 text-danger">
            <Icon icon="tabler:alert-circle" className="text-2xl" aria-hidden="true" />
          </span>
          <div>
            <p className="mb-1 font-semibold text-default-900">เทียบราคาไม่สำเร็จ</p>
            <p className="mb-0 text-sm text-default-700">
              ขนส่งทุกเจ้ายังไม่ตอบกลับตอนนี้ ลองใหม่อีกครั้งได้เลย
            </p>
            {errorDetail && (
              <p className="mx-auto mb-0 mt-2 max-w-md break-all text-xs text-default-500">
                รายละเอียด: {errorDetail}
              </p>
            )}
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
            {/* การเปิดใช้ขนส่งทำในหลังบ้าน iShip ไม่ใช่หน้าตั้งค่าของเรา — ห้าม copy
                สัญญาปุ่มที่พาไปแล้วทำสิ่งนั้นไม่ได้ (clarify gate 2026-08-05) */}
            <p className="mb-0 text-sm text-default-700">
              บัญชี iShip ของร้านยังไม่มีขนส่งที่เปิดใช้งาน — เปิดใช้งานขนส่งในหลังบ้าน iShip
              แล้วกลับมากดลองใหม่
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
          <Link
            href="/settings?iship=settings"
            className="text-sm font-medium text-primary hover:underline"
          >
            ตรวจการเชื่อมต่อ iShip
          </Link>
        </div>
      )}

      {state.kind === 'data' && rows.length > 0 && (
        <div className="flex flex-col gap-3 p-4">
          {rows.map((row, i) => (
            <CourierCard
              key={row.courierCode}
              row={row}
              cheapest={i === 0}
              fastest={row.courierCode === fastestCode}
              onPick={() => onPick(row.courierCode)}
            />
          ))}
          {failed.length > 0 && (
            <p className="mb-0 text-xs text-default-700">
              ประเมินไม่ได้ {failed.length} ขนส่ง: {failed.map((f) => f.courierName).join(', ')} —
              ขนส่งไม่ตอบกลับ{' '}
              {/* ต้องเป็นปุ่มที่ยิงจริง — ผลถูก cache ตาม inputKey การปิดแล้วกดเทียบราคาซ้ำ
                  จะได้ cache เดิม ไม่ retry (critique 2026-08-05 priority #1) */}
              <button
                type="button"
                onClick={() => void load()}
                className="font-medium text-primary hover:underline"
              >
                ลองใหม่อีกครั้ง
              </button>
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
  fastest,
  onPick,
}: {
  row: CompareRow
  cheapest: boolean
  fastest: boolean
  onPick: () => void
}) {
  const logo = courierLogoUrl(row.courierCode, row.courierName)

  const headerInner = (
    <>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={row.courierName}
          loading="lazy"
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
          {fastest && (
            <span className="badge bg-info/15 text-info-ink shrink-0">เร็วที่สุด</span>
          )}
        </span>
        {row.estimateDays != null && (
          <span className="block text-xs text-default-700">
            ถึงปลายทางราว {row.estimateDays} วัน
          </span>
        )}
      </span>
      <span className="ms-auto text-lg font-bold tabular-nums text-default-900 @2xl:hidden">
        ฿{row.totalPrice.toLocaleString('th-TH')}
      </span>
    </>
  )

  return (
    /* layout ตามความกว้างกล่องจริง (@container ประกาศที่ root ของ sheet):
       กล่องแคบ (แผงแชท/มือถือ) = การ์ดซ้อนแนวตั้ง · กล่อง ≥672px (@2xl) = แถวเต็ม */
    <div
      className={`rounded-lg border p-3 @2xl:flex @2xl:items-center @2xl:gap-3 ${
        cheapest ? 'border-primary' : 'border-default-300'
      }`}
    >
      <div className="flex w-full items-center gap-2.5 text-start @2xl:w-56 @2xl:shrink-0">
        {headerInner}
      </div>

      {/* breakdown 3 ช่อง — โชว์เสมอทุกขนาดกล่อง */}
      <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-dashed border-default-300 pt-2.5 text-center @2xl:mt-0 @2xl:flex-1 @2xl:border-t-0 @2xl:pt-0">
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

      <p className="mb-0 hidden w-16 text-end text-lg font-bold tabular-nums text-default-900 @2xl:block">
        ฿{row.totalPrice.toLocaleString('th-TH')}
      </p>

      <button
        type="button"
        onClick={onPick}
        aria-label={`ใช้ขนส่ง ${row.courierName} ราคา ${row.totalPrice.toLocaleString('th-TH')} บาท`}
        className={`btn mt-2.5 w-full py-3 @2xl:mt-0 @2xl:w-auto @2xl:shrink-0 @2xl:px-5 ${
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
