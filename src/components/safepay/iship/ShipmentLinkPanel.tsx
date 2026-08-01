'use client'

/**
 * ShipmentLinkPanel — เลือกพัสดุที่ร้านเปิดไว้แล้วบน iShip มาผูกกับคำสั่งซื้อ
 * (ส่วนขยาย feature 00022)
 *
 * ใช้ร่วมกัน 2 ที่เหมือน ShipmentCreateForm: ส่วนการจัดส่งในหน้าคำสั่งซื้อ และแผงในห้องแชท
 * component นี้ไม่รู้จักบริบทของผู้เรียก — สลับหน้าจอหลังผูกสำเร็จเป็นหน้าที่ของผู้เรียก
 *
 * 2 ขั้นในแผงเดียว:
 *   LIST    — ค้นหา + เลือกใบ
 *   CONFIRM — เทียบที่อยู่สองฝั่ง แล้วเลือกว่าจะยึดฝั่งไหน ก่อนกดผูก
 *
 * ทำไมขั้น CONFIRM ต้องยิงถามเซิร์ฟเวอร์อีกรอบ ทั้งที่รายการก็มีที่อยู่มาแล้ว:
 * ตอนกดผูกจริง เซิร์ฟเวอร์จะไปอ่านพัสดุจาก iShip ใหม่เสมอ (เชื่อ payload จาก client ไม่ได้)
 * ถ้าตารางเทียบมาจากรายการที่ดึงไว้ก่อนหน้า ร้านอาจกำลังยืนยันข้อมูลคนละชุดกับที่ระบบ
 * จะเขียนลงคำสั่งซื้อ — ความผิดพลาดชนิดที่ไม่มีอะไรฟ้อง
 *
 * Base (โครงรายการที่ค้นหาแล้วกดเลือก — input-icon-group + divide-y + ปุ่มเต็มแถว):
 *   src/app/(paces)/seller/(dashboard)/orders/new/components/AddressSearchSheet.tsx
 * Base (ปุ่ม submit + spinner + กล่อง error/empty + badge tone):
 *   src/components/safepay/iship/ShipmentCreateForm.tsx, ShipmentStatusView.tsx
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { describeCarrierStatus } from '@/lib/iship/status'
import { matchesQuery } from '@/lib/iship/unlinked'
import type {
  AddressDiffRow,
  ParcelPreview,
  UnlinkedParcelView,
} from '@/lib/iship/unlinked'
import type { ShipmentViewJson } from '@/lib/iship/context'

const TONE_BADGE: Record<string, string> = {
  primary: 'badge bg-primary/15 text-primary-ink',
  info: 'badge bg-info/15 text-info-ink',
  success: 'badge bg-success/15 text-success-ink',
  warning: 'badge bg-warning/15 text-warning-ink',
  danger: 'badge bg-danger/15 text-danger-ink',
  secondary: 'badge bg-secondary/15 text-default-700',
}

interface Props {
  orderToken: string
  /** เรียกหลังผูกสำเร็จ — ผู้เรียกสลับไปหน้าสถานะพัสดุ */
  onLinked: (shipment: ShipmentViewJson) => void
  /** ร้านกดปุ่มในสถานะว่าง เพื่อไปเปิดพัสดุใบใหม่แทน — ไม่ส่งมา = ไม่แสดงปุ่มนั้น */
  onSwitchToCreate?: () => void
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  } catch {
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

/** "2026-07-31 09:12:00" → "31 ก.ค. 09:12" — รูปสั้นพอสำหรับแถวในรายการ */
function shortThaiDate(raw: string | null): string {
  if (!raw) return '—'
  const [datePart, timePart] = raw.split(' ')
  const [, month, day] = (datePart ?? '').split('-')
  const MONTHS = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ]
  const label = MONTHS[Number(month) - 1]
  if (!label || !day) return raw
  return `${Number(day)} ${label}${timePart ? ` ${timePart.slice(0, 5)}` : ''}`
}

export default function ShipmentLinkPanel({
  orderToken,
  onLinked,
  onSwitchToCreate,
}: Props) {
  const [parcels, setParcels] = useState<UnlinkedParcelView[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<ParcelPreview | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [resolution, setResolution] = useState<'KEEP_ORDER' | 'USE_ISHIP'>('KEEP_ORDER')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    setParcels(null)
    try {
      const res = await fetch('/api/seller/iship/unlinked', { cache: 'no-store' })
      if (!res.ok) {
        setLoadError(await readError(res))
        return
      }
      const body = (await res.json()) as { parcels: UnlinkedParcelView[] }
      setParcels(body.parcels)
    } catch {
      setLoadError('โหลดรายการพัสดุไม่สำเร็จ กรุณาลองใหม่')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () => (parcels ?? []).filter((p) => matchesQuery(p, query)),
    [parcels, query],
  )

  async function handleSelect(parcel: UnlinkedParcelView) {
    if (previewing) return
    setPreviewing(parcel.trackNo)
    try {
      const res = await fetch(
        `/api/seller/iship/unlinked/preview?orderToken=${encodeURIComponent(orderToken)}&trackingNo=${encodeURIComponent(parcel.trackNo)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      const body = (await res.json()) as ParcelPreview
      // ค่าเริ่มต้นเป็น "ไม่แก้อะไร" เสมอ — การเขียนทับที่อยู่ในคำสั่งซื้อต้องเป็นสิ่งที่
      // ร้านเลือกเอง ไม่ใช่สิ่งที่เกิดขึ้นเพราะไม่ได้แตะอะไรเลย
      setResolution('KEEP_ORDER')
      setPreview(body)
    } catch {
      pacesToast.error('อ่านข้อมูลพัสดุไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setPreviewing(null)
    }
  }

  async function handleLink() {
    if (busy || !preview) return
    // แจกแจงให้ครบว่าจะเกิดอะไรบ้าง — กล่องยืนยันบังตารางเทียบอยู่ ร้านตอบคำถามนี้
    // โดยดูตารางไม่ได้ ถ้าไม่สรุปมาให้ก็เท่ากับถามลอย ๆ
    // และการเขียนทับที่อยู่ "ย้อนกลับไม่ได้" จริง ๆ (unlink คืนแค่สถานะกับเลขพัสดุ
    // ไม่คืนที่อยู่เดิม) จึงต้องพูดตรงนี้ ไม่ใช่ปล่อยให้ร้านรู้ตอนสายเกินไป
    const changed = preview.diff.filter((r) => !r.same).map((r) => r.label)
    const ok = await pacesConfirm.question(
      'ผูกพัสดุนี้กับคำสั่งซื้อ',
      resolution === 'USE_ISHIP'
        ? `พัสดุ ${preview.parcel.trackNo} จะถูกผูกเข้ากับคำสั่งซื้อนี้ และจะแก้ ${changed.length} ช่องในคำสั่งซื้อตามพัสดุใบนี้: ${changed.join(', ')} — แก้แล้วย้อนกลับไม่ได้ (ยกเลิกการผูกทีหลังไม่คืนที่อยู่เดิม)`
        : `พัสดุ ${preview.parcel.trackNo} จะถูกผูกเข้ากับคำสั่งซื้อนี้`,
      { confirmButtonText: 'ผูกพัสดุ', cancelButtonText: 'ไม่ใช่ตอนนี้' },
    )
    if (!ok) return

    setBusy(true)
    try {
      const res = await fetch('/api/seller/iship/shipments/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          orderToken,
          trackingNo: preview.parcel.trackNo,
          addressResolution: resolution,
        }),
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        // ใบนี้อาจถูกใช้ไปแล้วระหว่างที่ร้านดูตารางเทียบ — กลับไปรายการที่รีเฟรชแล้ว
        setPreview(null)
        void load()
        return
      }
      const body = (await res.json()) as ShipmentViewJson
      pacesToast.success('ผูกพัสดุสำเร็จ')
      onLinked(body)
    } catch {
      pacesToast.error('ผูกพัสดุไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  // ── ขั้น 2: ยืนยัน ────────────────────────────────────────────────────────
  if (preview) {
    return (
      <div>
        <div className="border-b border-dashed border-default-200 p-4">
          <button
            type="button"
            onClick={() => setPreview(null)}
            // -ms-2 ดึงกลับให้ขอบตัวอักษรตรงกับเนื้อหาอื่น ทั้งที่ปุ่มมีพื้นที่แตะเต็ม 44px
            // (ไม่มี Paces token สำหรับ "ปุ่ม text ที่ยังต้องได้ tap target เต็ม")
            className="btn -ms-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm text-primary hover:underline"
          >
            <Icon icon="tabler:chevron-left" className="text-base" aria-hidden="true" />
            เลือกใบอื่น
          </button>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="font-semibold text-default-900">
              {preview.parcel.trackNo}
            </span>
            <span
              className={
                TONE_BADGE[describeCarrierStatus(preview.parcel.carrierStatus).tone] ??
                TONE_BADGE.secondary
              }
            >
              {preview.parcel.carrierStatusText}
            </span>
          </div>
          <p className="mb-0 mt-1 flex items-center gap-1.5 text-sm text-default-500">
            <Icon icon="tabler:truck-delivery" className="text-base" aria-hidden="true" />
            {preview.parcel.courierName ?? preview.parcel.courierCode ?? 'ไม่ระบุขนส่ง'}
          </p>
        </div>

        <div className="p-4">
          <h6 className="mb-3 text-sm font-semibold text-default-900">เทียบที่อยู่</h6>
          <DiffTable rows={preview.diff} />

          {preview.hasConflict ? (
            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-medium text-default-900">
                ที่อยู่ไม่ตรงกัน — เลือกว่าจะใช้ที่อยู่ไหน
              </legend>
              <ResolutionChoice
                value="KEEP_ORDER"
                current={resolution}
                onChange={setResolution}
                label="เก็บที่อยู่ในคำสั่งซื้อไว้"
                help="ไม่แก้อะไร พัสดุจะผูกเข้ากับคำสั่งซื้อตามที่อยู่เดิม"
              />
              <ResolutionChoice
                value="USE_ISHIP"
                current={resolution}
                onChange={setResolution}
                label="ใช้ที่อยู่จาก iShip ทับ"
                help="แก้ที่อยู่ในคำสั่งซื้อให้ตรงกับพัสดุที่เลือก — ย้อนกลับไม่ได้"
              />
            </fieldset>
          ) : (
            <p className="mb-0 mt-4 flex items-start gap-2 rounded-lg bg-success/15 px-3 py-2 text-sm text-success-ink">
              <Icon
                icon="tabler:circle-check"
                className="mt-0.5 shrink-0 text-base"
                aria-hidden="true"
              />
              ที่อยู่ตรงกันทุกช่อง — ไม่ต้องเลือกอะไรเพิ่ม กดยืนยันได้เลย
            </p>
          )}

          <button
            type="button"
            onClick={handleLink}
            disabled={busy}
            className="btn mt-4 inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? (
              <Icon icon="tabler:loader-2" className="animate-spin text-base" aria-hidden="true" />
            ) : (
              <Icon icon="tabler:link" className="text-base" aria-hidden="true" />
            )}
            ผูกพัสดุนี้
          </button>
        </div>
      </div>
    )
  }

  // ── ขั้น 1: เลือกใบ ───────────────────────────────────────────────────────
  return (
    <div>
      <div className="border-b border-dashed border-default-200 p-4">
        <p className="mb-3 text-sm text-default-500">
          เลือกพัสดุที่คุณเปิดไว้แล้วบน iShip มาผูกกับคำสั่งซื้อนี้ — ไม่เปิดพัสดุใหม่
        </p>
        <div className="input-icon-group">
          <span className="input-icon">
            <Icon icon="tabler:search" className="text-base" aria-hidden="true" />
          </span>
          <input
            type="search"
            className="form-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาด้วยเลขพัสดุ ชื่อผู้รับ หรือเบอร์โทร"
            aria-label="ค้นหาพัสดุบน iShip"
          />
        </div>
      </div>

      {loadError ? (
        <div className="p-4">
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger-ink">
            <Icon
              icon="tabler:alert-triangle"
              className="mt-0.5 shrink-0 text-base"
              aria-hidden="true"
            />
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="btn inline-flex w-full items-center justify-center gap-2 bg-default-100 p-2.5 text-default-900 hover:bg-default-200"
          >
            <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
            ลองใหม่
          </button>
        </div>
      ) : parcels === null ? (
        <div className="space-y-2 p-4" aria-busy="true">
          <div className="h-20 animate-pulse rounded-lg bg-default-100" />
          <div className="h-20 animate-pulse rounded-lg bg-default-100" />
          <div className="h-20 animate-pulse rounded-lg bg-default-100" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          searching={query.trim() !== ''}
          query={query}
          onClear={() => setQuery('')}
          onSwitchToCreate={onSwitchToCreate}
        />
      ) : (
        <ul className="mb-0 max-h-96 list-none overflow-y-auto p-0 divide-y divide-default-100">
          {visible.map((p) => (
            <li key={p.trackNo}>
              <button
                type="button"
                onClick={() => void handleSelect(p)}
                disabled={previewing !== null && previewing !== p.trackNo}
                aria-busy={previewing === p.trackNo}
                // ห้ามใช้ .btn ที่นี่ — .btn คือ inline-flex + items-center + justify-center
                // ลูกทั้งหมดจะถูกจับเรียงแนวนอนจนเนื้อ 5 บรรทัดยุบเป็นแถบเดียว
                // ตามรอย Base จริง (AddressSearchSheet.tsx) ที่ใช้ flex เปล่า ไม่ใช่ .btn
                className="flex w-full flex-col items-stretch gap-1 p-4 text-start hover:bg-default-50 disabled:opacity-60"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {previewing === p.trackNo && (
                      <Icon
                        icon="tabler:loader-2"
                        className="shrink-0 animate-spin text-base text-primary"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate font-semibold text-default-900">{p.trackNo}</span>
                  </span>
                  <span
                    className={
                      TONE_BADGE[describeCarrierStatus(p.carrierStatus).tone] ??
                      TONE_BADGE.secondary
                    }
                  >
                    {p.carrierStatusText}
                  </span>
                </span>

                <span className="flex items-center gap-1.5 text-sm text-default-500">
                  <Icon
                    icon="tabler:truck-delivery"
                    className="shrink-0 text-base"
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {p.courierName ?? p.courierCode ?? 'ไม่ระบุขนส่ง'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{shortThaiDate(p.createdAtRaw)}</span>
                </span>

                {/* ชื่อผู้รับคือสิ่งที่ร้านใช้ตัดสินว่า "ใบนี้ของลูกค้าคนนี้ไหม" จริง ๆ
                    ไม่ใช่เลขพัสดุซึ่งเป็นสตริงสุ่มที่คนแยกไม่ออก — จึงหนากว่าที่อยู่ */}
                <span className="truncate text-sm font-medium text-default-900">
                  {p.receiver.name ?? 'ไม่ระบุชื่อผู้รับ'}
                  {p.receiver.phone ? ` · ${p.receiver.phone}` : ''}
                </span>
                <span className="text-sm text-default-500">
                  {[
                    p.receiver.subdistrict && `ต.${p.receiver.subdistrict}`,
                    p.receiver.district && `อ.${p.receiver.district}`,
                    p.receiver.province,
                    p.receiver.postcode,
                  ]
                    .filter(Boolean)
                    .join(' ') || 'ไม่ระบุที่อยู่'}
                </span>

                {(p.codAmount > 0 || p.fromDeepOrphan) && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {p.codAmount > 0 && (
                      <span className="badge bg-warning/15 text-warning-ink">
                        COD {p.codAmount.toLocaleString('th-TH')} บาท
                      </span>
                    )}
                    {p.fromDeepOrphan && (
                      <span className="badge inline-flex items-center gap-1 bg-info/15 text-info-ink">
                        <Icon icon="tabler:link" className="text-sm" aria-hidden="true" />
                        สร้างจาก Deep แต่เลขไม่กลับมา
                      </span>
                    )}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** ตารางเทียบที่อยู่ — แคบ ๆ ก็อ่านได้ เพราะซ้อนสองฝั่งเป็นแถวบน/ล่างต่อหัวข้อ */
function DiffTable({ rows }: { rows: AddressDiffRow[] }) {
  return (
    <ul className="mb-0 list-none space-y-2 p-0">
      {rows.map((r) => (
        <li
          key={r.field}
          // แถวที่ต่างมีสัญญาณพอแล้วจากพื้นเหลือง + ป้าย "ต่างกัน" ที่มีไอคอนกำกับ —
          // แถบสีข้างซ้ายเป็นชั้นที่สามที่บอกเรื่องเดิมซ้ำ และไม่มีที่ไหนในชุดนี้ใช้
          // (ShipmentStatusView/SenderIncompleteNotice ใช้ bg-warning/15 เปล่า ๆ ทั้งหมด)
          className={
            r.same ? 'rounded-lg bg-default-50 p-3' : 'rounded-lg bg-warning/15 p-3'
          }
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-default-900">{r.label}</span>
            {!r.same && (
              <span className="flex items-center gap-1 text-xs font-semibold text-warning-ink">
                <Icon icon="tabler:alert-triangle" className="text-sm" aria-hidden="true" />
                ต่างกัน
              </span>
            )}
          </div>
          <dl className="mb-0 mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-default-500">ในคำสั่งซื้อ</dt>
              <dd className="mb-0 text-sm text-default-900">{r.order ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-default-500">บนพัสดุ iShip</dt>
              <dd className="mb-0 text-sm text-default-900">{r.parcel ?? '—'}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )
}

function ResolutionChoice({
  value,
  current,
  onChange,
  label,
  help,
}: {
  value: 'KEEP_ORDER' | 'USE_ISHIP'
  current: string
  onChange: (v: 'KEEP_ORDER' | 'USE_ISHIP') => void
  label: string
  help: string
}) {
  return (
    <label className="mb-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-default-200 p-3">
      <input
        type="radio"
        name="address-resolution"
        className="form-radio mt-0.5"
        checked={current === value}
        onChange={() => onChange(value)}
      />
      <span>
        <span className="block text-sm font-medium text-default-900">{label}</span>
        <span className="block text-xs text-default-500">{help}</span>
      </span>
    </label>
  )
}

function EmptyState({
  searching,
  query,
  onClear,
  onSwitchToCreate,
}: {
  searching: boolean
  query: string
  onClear: () => void
  onSwitchToCreate?: () => void
}) {
  return (
    <div className="p-6 text-center">
      <Icon
        icon="tabler:package-off"
        className="text-3xl text-default-400"
        aria-hidden="true"
      />
      {searching ? (
        <>
          <p className="mb-3 mt-2 text-sm text-default-500">
            ไม่พบพัสดุที่ตรงกับ &laquo;{query}&raquo;
          </p>
          <button
            type="button"
            onClick={onClear}
            className="btn inline-flex items-center justify-center gap-2 bg-default-100 px-4 py-2 text-default-900 hover:bg-default-200"
          >
            ล้างคำค้นหา
          </button>
        </>
      ) : (
        <>
          <p className="mb-3 mt-2 text-sm text-default-500">
            ไม่พบพัสดุที่ยังไม่ได้ผูกในช่วง 7 วันล่าสุด — iShip ให้ค้นย้อนหลังได้ไม่เกิน 7 วัน
          </p>
          {onSwitchToCreate && (
            <button
              type="button"
              onClick={onSwitchToCreate}
              className="btn inline-flex items-center justify-center gap-2 bg-default-100 px-4 py-2 text-default-900 hover:bg-default-200"
            >
              <Icon icon="tabler:package-export" className="text-base" aria-hidden="true" />
              สร้างพัสดุ iShip แทน
            </button>
          )}
        </>
      )}
    </div>
  )
}
