'use client'

/**
 * ShipmentStatusView — พัสดุที่เปิดไปแล้ว 1 ใบ (feature 00022)
 *
 * ใช้ร่วมกัน 2 ที่: ส่วนการจัดส่งในหน้าคำสั่งซื้อ และโมดัลในหน้าแชท
 * ปุ่มที่เป็นเรื่องเฉพาะบริบท (เช่น "แจ้งเลขในแชท") ผู้เรียกใส่เองผ่าน actions
 *
 * Base: orders/[token]/components/ShipmentPanel.tsx (สถานะ 3/4 เดิม — kv rows, timeline traces,
 *       ปุ่มพิมพ์ใบปะหน้า/ยกเลิก) + badge จาก theme/paces/Admin/TS/src/app/(admin)/ui/badges
 */

import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTime } from '@/lib/format-date'
import { describeCarrierStatus, describeShipmentStatus } from '@/lib/iship/status'
import type { ShipmentViewJson } from '@/lib/iship/context'

interface TraceEvent {
  status: string
  statusText: string | null
  statusDesc: string | null
  location: string | null
  occurredAt: string
}

interface Props {
  shipment: ShipmentViewJson
  /** ปุ่มเพิ่มของผู้เรียก (เช่น "แจ้งเลขในแชท") — วางเหนือปุ่มยกเลิก */
  actions?: React.ReactNode
  onCancelled: () => void
  onRetried: (shipment: ShipmentViewJson) => void
  /** "แก้ข้อมูลแล้วลองใหม่" — ผู้เรียกสลับกลับไปแสดงฟอร์ม */
  onEditRequest?: () => void
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  } catch {
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

/**
 * ต้องเขียน class เต็มตัวทุกอัน — Tailwind สแกนซอร์สแบบข้อความ
 * `bg-${tone}/15` จะไม่ถูกสร้าง แล้ว badge จะออกมาไม่มีสีโดยไม่มี error ให้เห็น
 */
const TONE_BADGE: Record<string, string> = {
  primary: 'badge bg-primary/15 text-primary',
  info: 'badge bg-info/15 text-info',
  success: 'badge bg-success/15 text-success',
  warning: 'badge bg-warning/15 text-warning',
  danger: 'badge bg-danger/15 text-danger',
  secondary: 'badge bg-secondary/15 text-secondary',
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-default-200 py-2 text-sm last:border-0">
      <span className="text-default-500">{label}</span>
      <span className="text-end font-semibold text-default-900">{value}</span>
    </div>
  )
}

export default function ShipmentStatusView({
  shipment,
  actions,
  onCancelled,
  onRetried,
  onEditRequest,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [traces, setTraces] = useState<TraceEvent[] | null>(null)
  const [loadingTraces, setLoadingTraces] = useState(false)

  async function handleRetry() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/seller/iship/shipments/${shipment.id}/retry`, {
        method: 'POST',
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      const body = (await res.json()) as ShipmentViewJson
      if (body.status === 'CREATED') pacesToast.success('สร้างพัสดุสำเร็จ')
      else pacesToast.error(body.lastErrorMessage ?? 'ยังสร้างพัสดุไม่สำเร็จ')
      onRetried(body)
    } catch {
      pacesToast.error('ลองใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (busy) return
    const ok = await pacesConfirm.danger(
      'ยกเลิกพัสดุ',
      'ยกเลิกได้เฉพาะตอนที่ขนส่งยังไม่รับของ — ยกเลิกแล้วเปิดพัสดุใบใหม่สำหรับคำสั่งซื้อนี้ได้',
      { confirmButtonText: 'ยกเลิกพัสดุ', cancelButtonText: 'ไม่ยกเลิก' },
    )
    if (!ok) return

    setBusy(true)
    try {
      const res = await fetch(`/api/seller/iship/shipments/${shipment.id}/cancel`, {
        method: 'POST',
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      pacesToast.success('ยกเลิกพัสดุแล้ว')
      onCancelled()
    } catch {
      pacesToast.error('ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!shipment.trackingNo) return
    try {
      await navigator.clipboard.writeText(shipment.trackingNo)
      pacesToast.success('คัดลอกเลขติดตามแล้ว')
    } catch {
      // clipboard ต้องการ https — บน dev ที่ไม่ใช่ https จะล้มเหลว ให้บอกตามตรง
      pacesToast.warning('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกด้วยตัวเอง')
    }
  }

  /**
   * โหลดการเดินทางของพัสดุ — ยิงเองตอนเปิดดู ไม่ต้องให้ร้านกดอีกที (user request 2026-07-29)
   *
   * เงียบเมื่อล้มเหลว (ไม่ขึ้น toast) เพราะเป็นการยิงอัตโนมัติที่ร้านไม่ได้สั่ง —
   * เด้ง error ใส่หน้าทุกครั้งที่เปิดโมดัลจะกวนมากกว่ามีประโยชน์ ปุ่มรีเฟรชที่ร้านกดเอง
   * ค่อยบอก error ตรง ๆ ได้
   */
  const loadTraces = useCallback(
    async (opts?: { silent?: boolean }) => {
      setLoadingTraces(true)
      try {
        const res = await fetch(`/api/seller/iship/shipments/${shipment.id}/traces`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          if (!opts?.silent) pacesToast.error(await readError(res))
          return
        }
        setTraces((await res.json()) as TraceEvent[])
      } catch {
        if (!opts?.silent) pacesToast.error('โหลดการเดินทางของพัสดุไม่สำเร็จ')
      } finally {
        setLoadingTraces(false)
      }
    },
    [shipment.id],
  )

  // ยิงครั้งเดียวตอนเปิด — พัสดุที่ยังไม่มีเลขติดตามยังไม่มีอะไรให้ติดตาม จึงข้าม
  useEffect(() => {
    if (!shipment.trackingNo) return
    void loadTraces({ silent: true })
  }, [shipment.trackingNo, loadTraces])

  // ── สร้างไม่สำเร็จ — ไม่แสดง kv/timeline เพราะยังไม่มีพัสดุจริงให้ติดตาม
  if (shipment.status === 'FAILED') {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="mb-0 flex items-start gap-2 rounded-lg bg-danger/15 px-3 py-2.5 text-sm text-danger">
          <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>{shipment.lastErrorMessage ?? 'สร้างพัสดุไม่สำเร็จ'}</span>
        </p>
        <p className="mb-0 flex items-start gap-2 rounded-lg bg-info/15 px-3 py-2.5 text-sm text-info">
          <Icon icon="tabler:info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            ลองใหม่จะใช้คีย์เดิม ไม่เปิดพัสดุใบที่สอง — ถ้าครั้งก่อนเปิดสำเร็จแล้วแต่คำตอบหาย
            ระบบจะคืนใบเดิมให้
          </span>
        </p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={busy}
          className="btn inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? (
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
          )}
          ลองใหม่
        </button>
        {onEditRequest && (
          <button
            type="button"
            onClick={onEditRequest}
            disabled={busy}
            className="btn inline-flex w-full items-center justify-center gap-2 border border-default-300 py-2.5 text-default-700 disabled:opacity-60"
          >
            <Icon icon="tabler:edit" className="text-base" aria-hidden="true" />
            แก้ข้อมูลแล้วลองใหม่
          </button>
        )}
      </div>
    )
  }

  // สถานะจากขนส่งสำคัญกว่าสถานะฝั่งเรา — ถ้ายังไม่มีค่อยใช้ของเรา (เพิ่งสร้าง ขนส่งยังไม่อัปเดต)
  const badge = shipment.carrierStatus
    ? describeCarrierStatus(shipment.carrierStatus)
    : describeShipmentStatus(shipment.status)
  const badgeText = shipment.carrierStatusText ?? badge.text

  return (
    <div className="flex flex-col">
      <section className="border-b-8 border-default-100 p-4">
        {shipment.isDryRun && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">
            <Icon icon="tabler:flask" className="shrink-0 text-base" aria-hidden="true" />
            พัสดุจำลอง (โหมดทดสอบ) — ไม่ได้ส่งออกไปที่ขนส่งจริง
          </p>
        )}

        <div className="text-center">
          <p className="mb-1 text-xs font-semibold tracking-wide text-default-400">เลขติดตามพัสดุ</p>
          <p className="mb-2 text-xl font-bold tabular-nums text-default-900">
            {shipment.trackingNo ?? '—'}
          </p>
          <span className={TONE_BADGE[badge.tone] ?? TONE_BADGE.secondary}>{badgeText}</span>
        </div>

        {(shipment.isOverWeight || shipment.isOverSize) && (
          <p className="mb-0 mt-3 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">
            <Icon icon="tabler:scale" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            ขนส่งวัด{shipment.isOverWeight ? 'น้ำหนัก' : 'ขนาด'}ได้เกินกว่าที่แจ้งไว้ —
            ค่าส่งจริงอาจสูงกว่าที่ประเมิน
          </p>
        )}
      </section>

      <section className="border-b-8 border-default-100 p-4">
        {/* ใบเก่าที่สร้างก่อน 2026-07-29 ไม่มี courierName เก็บไว้ (ตอนนั้นไม่มีโค้ดเขียนค่านี้เลย)
            fallback เป็นรหัสขนส่งดีกว่าโชว์ "—" ซึ่งดูเหมือนข้อมูลหาย */}
        <StatRow label="ขนส่ง" value={shipment.courierName ?? shipment.courierCode ?? '—'} />
        <StatRow label="สร้างเมื่อ" value={formatDateTime(new Date(shipment.createdAt))} />
        {shipment.carrierStatusAt && (
          <StatRow
            label="อัปเดตล่าสุด"
            value={formatDateTime(new Date(shipment.carrierStatusAt))}
          />
        )}
        {/* ค่าที่ถูกส่งไปจริงตอนเปิดพัสดุ — ร้านตรวจย้อนได้ว่าเปิดใบนี้ด้วยขนาด/น้ำหนักเท่าไร
            สำคัญเวลาค่าส่งไม่ตรงที่คิด หรือขนส่งชั่งแล้วได้ไม่เท่าที่แจ้ง */}
        {shipment.weight != null && (
          <StatRow label="น้ำหนักที่แจ้ง" value={`${shipment.weight} กก.`} />
        )}
        {shipment.width != null && shipment.length != null && shipment.height != null && (
          <StatRow
            label="ขนาดที่แจ้ง"
            value={`${shipment.width}×${shipment.length}×${shipment.height} ซม.`}
          />
        )}
        <StatRow
          label="เก็บเงินปลายทาง"
          value={
            shipment.codAmount > 0
              ? `฿${shipment.codAmount.toLocaleString('th-TH')}`
              : 'ไม่เก็บ'
          }
        />
        <StatRow
          label="พิมพ์ใบปะหน้าแล้ว"
          value={
            shipment.labelPrintedAt
              ? `${shipment.labelPrintCount} ครั้ง · ${formatDateTime(new Date(shipment.labelPrintedAt))}`
              : 'ยังไม่ได้พิมพ์'
          }
        />
      </section>

      <section className="border-b-8 border-default-100 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="tabler:route" className="text-sm" aria-hidden="true" />
          </span>
          <h6 className="mb-0 text-sm font-semibold text-default-900">การเดินทางของพัสดุ</h6>
          <button
            type="button"
            onClick={() => loadTraces()}
            disabled={loadingTraces}
            aria-label="โหลดสถานะล่าสุดอีกครั้ง"
            className="btn btn-icon ms-auto text-default-500 hover:bg-default-100 disabled:opacity-50"
          >
            {loadingTraces ? (
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-default-400 border-t-transparent" />
            ) : (
              <Icon icon="tabler:refresh" className="text-base" />
            )}
          </button>
        </div>

        {/* ระหว่างโหลดครั้งแรก — โครงเทาแทนความว่างเปล่า ไม่งั้นดูเหมือนไม่มีข้อมูล */}
        {traces === null && loadingTraces && (
          <div className="flex flex-col gap-2" aria-busy="true">
            <span className="h-4 w-2/3 animate-pulse rounded bg-default-100" />
            <span className="h-4 w-1/2 animate-pulse rounded bg-default-100" />
          </div>
        )}

        {traces && traces.length > 0 && (
          <ol className="flex flex-col gap-3">
            {traces.map((t, i) => (
              <li key={`${t.status}-${t.occurredAt}-${i}`} className="flex gap-2">
                <Icon
                  icon="tabler:point-filled"
                  className="mt-0.5 shrink-0 text-base text-primary"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="mb-0 text-sm font-medium text-default-900">
                    {t.statusText ?? t.status}
                  </p>
                  {t.statusDesc && <p className="mb-0 text-xs text-default-500">{t.statusDesc}</p>}
                  <p className="mb-0 text-xs text-default-400">
                    {formatDateTime(new Date(t.occurredAt))}
                    {t.location ? ` · ${t.location}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {traces && traces.length === 0 && (
          <p className="mb-0 text-xs text-default-400">
            ยังไม่มีข้อมูลการเดินทาง — ขนส่งจะอัปเดตหลังรับพัสดุเข้าระบบ
          </p>
        )}

        {/* ดึงไม่สำเร็จตอนเปิด (เงียบไว้ไม่เด้ง toast) — บอกตรงนี้แทน พร้อมทางกดเอง */}
        {traces === null && !loadingTraces && (
          <p className="mb-0 text-xs text-default-400">
            ยังไม่ได้ข้อมูลการเดินทาง กดปุ่มรีเฟรชด้านบนเพื่อลองใหม่
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!shipment.trackingNo}
            className="btn inline-flex items-center justify-center gap-1.5 bg-primary/15 py-2.5 text-primary hover:bg-primary/25 disabled:opacity-50"
          >
            <Icon icon="tabler:copy" className="text-base" aria-hidden="true" />
            คัดลอกเลข
          </button>
          <a
            href={`/api/seller/iship/shipments/${shipment.id}/label`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn inline-flex items-center justify-center gap-1.5 bg-primary/15 py-2.5 text-primary hover:bg-primary/25"
          >
            <Icon icon="tabler:printer" className="text-base" aria-hidden="true" />
            พิมพ์ใบปะหน้า
          </a>
        </div>

        {actions}

        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          className="btn inline-flex items-center justify-center gap-1.5 bg-danger/15 py-2.5 text-danger hover:bg-danger/25 disabled:opacity-50"
        >
          <Icon icon="tabler:package-off" className="text-base" aria-hidden="true" />
          ยกเลิกพัสดุ
        </button>
      </div>
    </div>
  )
}
