'use client'

/**
 * ShipmentPanel — ส่วน "การจัดส่ง" ในหน้ารายละเอียดคำสั่งซื้อ (feature 00022, FR-ISHIP-022)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingActivity.tsx
 *   — โครง card + card-header + card-body ของคอลัมน์ขวา
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx
 *   — Sweet Alerts confirm + pacesToast + ปุ่ม btn bg-primary/15 text-primary
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *
 * รับผิดชอบ 4 สถานะ:
 *   1. ยังไม่มีพัสดุ + ข้อมูลครบ  → ปุ่มสร้างพัสดุ
 *   2. ยังไม่มีพัสดุ + ข้อมูลขาด  → บอกว่าขาดช่องไหน (ไม่ใช่ปุ่มที่กดไม่ได้เฉย ๆ)
 *   3. มีพัสดุแล้ว              → ขนส่ง + เลขติดตาม (คัดลอกได้) + สถานะ + พิมพ์ + ยกเลิก + ไทม์ไลน์
 *   4. สร้างไม่สำเร็จ            → สาเหตุ + ปุ่มลองใหม่
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTime } from '@/lib/format-date'

interface ShipmentData {
  id: string
  status: string
  courierName: string | null
  trackingNo: string | null
  carrierStatusText: string | null
  carrierStatusAt: string | null
  isOverWeight: boolean
  isOverSize: boolean
  labelPrintedAt: string | null
  labelPrintCount: number
  isDryRun: boolean
  lastErrorMessage: string | null
}

interface TraceEvent {
  status: string
  statusText: string | null
  statusDesc: string | null
  location: string | null
  occurredAt: string
}

interface Props {
  orderId: string
  shipment: ShipmentData | null
  /** ช่องข้อมูลที่ยังขาด — ว่าง = พร้อมสร้างพัสดุ */
  missing: string[]
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  } catch {
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

export default function ShipmentPanel({ orderId, shipment, missing }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [traces, setTraces] = useState<TraceEvent[] | null>(null)
  const [loadingTraces, setLoadingTraces] = useState(false)

  // ── สร้างพัสดุ ───────────────────────────────────────────────────────────
  async function handleCreate() {
    // ยืนยันก่อนเสมอ — การกดปุ่มนี้คือการเปิดพัสดุจริงและเกิดค่าใช้จ่ายจริงของร้าน
    // ไม่ใช่การบันทึกข้อมูลที่ย้อนกลับได้ฟรี (BR-ISHIP-20)
    const result = await Swal.fire({
      title: 'สร้างพัสดุที่ iShip',
      html:
        'ระบบจะเปิดพัสดุจริงกับขนส่งตามค่าที่ตั้งไว้ในหน้าตั้งค่าการจัดส่ง<br/>' +
        '<span class="text-danger">การสร้างพัสดุมีค่าใช้จ่ายจริงกับบัญชี iShip ของร้าน</span>',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'สร้างพัสดุ',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover',
        cancelButton: 'btn border-default-300 ms-2',
      },
    })
    if (!result.isConfirmed) return

    setBusy(true)
    try {
      const res = await fetch('/api/seller/iship/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      const body = (await res.json()) as ShipmentData
      if (body.status === 'CREATED') pacesToast.success('สร้างพัสดุสำเร็จ')
      else pacesToast.error(body.lastErrorMessage ?? 'สร้างพัสดุไม่สำเร็จ')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleRetry() {
    if (!shipment) return
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
      const body = (await res.json()) as ShipmentData
      if (body.status === 'CREATED') pacesToast.success('สร้างพัสดุสำเร็จ')
      else pacesToast.error(body.lastErrorMessage ?? 'ยังสร้างพัสดุไม่สำเร็จ')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (!shipment) return
    const result = await Swal.fire({
      title: 'ยกเลิกพัสดุ',
      html: 'ยกเลิกได้เฉพาะตอนที่ขนส่งยังไม่รับของ<br/>ยกเลิกแล้วเปิดพัสดุใบใหม่สำหรับคำสั่งซื้อนี้ได้',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยกเลิกพัสดุ',
      cancelButtonText: 'ไม่ยกเลิก',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-danger text-white hover:bg-danger/90',
        cancelButton: 'btn border-default-300 ms-2',
      },
    })
    if (!result.isConfirmed) return

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
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!shipment?.trackingNo) return
    try {
      await navigator.clipboard.writeText(shipment.trackingNo)
      pacesToast.success('คัดลอกเลขติดตามแล้ว')
    } catch {
      // clipboard ต้องการ https — บน dev ที่ไม่ใช่ https จะล้มเหลว ให้บอกตามตรง
      pacesToast.warning('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกด้วยตัวเอง')
    }
  }

  async function handleTraces() {
    if (!shipment) return
    if (traces) {
      setTraces(null) // กดซ้ำ = ยุบ
      return
    }
    setLoadingTraces(true)
    try {
      const res = await fetch(`/api/seller/iship/shipments/${shipment.id}/traces`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      setTraces((await res.json()) as TraceEvent[])
    } finally {
      setLoadingTraces(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium w-full justify-center">
          <Icon icon="tabler:truck-delivery" className="text-base" aria-hidden="true" />
          การจัดส่ง
        </h5>
      </div>

      <div className="card-body">
        {/* สถานะ 2 — ข้อมูลขาด: บอกเป็นข้อ ๆ ว่าขาดอะไร ไม่ใช่ปุ่มที่กดไม่ได้เฉย ๆ */}
        {!shipment && missing.length > 0 && (
          <div>
            <p className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-warning/15 text-warning text-sm">
              <Icon icon="tabler:alert-triangle" className="text-base shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                สร้างพัสดุไม่ได้ — ยังไม่มี {missing.join(', ')}
              </span>
            </p>
            <p className="text-xs text-default-400 mt-2">
              เติมข้อมูลที่ขาดแล้วกลับมาหน้านี้อีกครั้ง ปุ่มสร้างพัสดุจะขึ้นให้เอง
            </p>
          </div>
        )}

        {/* สถานะ 1 — พร้อมสร้าง */}
        {!shipment && missing.length === 0 && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex w-full items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? (
              <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            ) : (
              <Icon icon="tabler:package-export" className="text-base" aria-hidden="true" />
            )}
            สร้างพัสดุ
          </button>
        )}

        {/* สถานะ 4 — สร้างไม่สำเร็จ */}
        {shipment?.status === 'FAILED' && (
          <div>
            <p className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger/15 text-danger text-sm">
              <Icon icon="tabler:alert-circle" className="text-base shrink-0 mt-0.5" aria-hidden="true" />
              <span>{shipment.lastErrorMessage ?? 'สร้างพัสดุไม่สำเร็จ'}</span>
            </p>
            <button
              type="button"
              onClick={handleRetry}
              disabled={busy}
              className="btn bg-primary text-white hover:bg-primary-hover inline-flex w-full items-center justify-center gap-2 mt-3 disabled:opacity-60"
            >
              <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
              ลองใหม่
            </button>
            <p className="text-xs text-default-400 mt-2">
              คำสั่งซื้อของคุณถูกบันทึกไว้เรียบร้อยแล้ว การลองใหม่จะไม่ทำให้เกิดพัสดุซ้ำ
            </p>
          </div>
        )}

        {/* สถานะ 3 — มีพัสดุแล้ว */}
        {shipment && shipment.status !== 'FAILED' && (
          <div className="flex flex-col gap-3">
            {shipment.isDryRun && (
              <p className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/15 text-warning text-xs">
                <Icon icon="tabler:flask" className="text-base shrink-0" aria-hidden="true" />
                พัสดุจำลอง (โหมดทดสอบ) — ไม่ได้ส่งออกไปที่ขนส่งจริง
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-default-500 text-sm">ขนส่ง</span>
              <span className="text-sm font-medium text-default-800">
                {shipment.courierName ?? '—'}
              </span>
            </div>

            {shipment.trackingNo && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-default-500 text-sm">เลขติดตาม</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                >
                  {shipment.trackingNo}
                  <Icon icon="tabler:copy" className="text-base" aria-hidden="true" />
                </button>
              </div>
            )}

            {shipment.carrierStatusText && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-default-500 text-sm">สถานะพัสดุ</span>
                <span className="text-sm text-default-800">
                  {shipment.carrierStatusText}
                  {shipment.carrierStatusAt && (
                    <span className="block text-xs text-default-400">
                      {formatDateTime(new Date(shipment.carrierStatusAt))}
                    </span>
                  )}
                </span>
              </div>
            )}

            {(shipment.isOverWeight || shipment.isOverSize) && (
              <p className="flex items-start gap-2 px-3 py-2 rounded-lg bg-warning/15 text-warning text-xs">
                <Icon icon="tabler:scale" className="text-base shrink-0 mt-0.5" aria-hidden="true" />
                ขนส่งวัด{shipment.isOverWeight ? 'น้ำหนัก' : 'ขนาด'}ได้เกินกว่าที่แจ้งไว้ — ค่าส่งจริงอาจสูงกว่าที่ประเมิน
              </p>
            )}

            <div className="flex flex-col gap-2 pt-3 border-t border-default-200">
              <a
                href={`/api/seller/iship/shipments/${shipment.id}/label`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center justify-center gap-2"
              >
                <Icon icon="tabler:printer" className="text-base" aria-hidden="true" />
                พิมพ์ใบปะหน้า
              </a>
              {shipment.labelPrintedAt && (
                <p className="text-xs text-default-400 text-center">
                  พิมพ์ล่าสุด {formatDateTime(new Date(shipment.labelPrintedAt))} ({shipment.labelPrintCount} ครั้ง)
                </p>
              )}

              <button
                type="button"
                onClick={handleTraces}
                disabled={loadingTraces}
                className="btn btn-sm bg-primary/15 text-primary hover:bg-primary/25 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Icon icon="tabler:route" className="text-base" aria-hidden="true" />
                {traces ? 'ซ่อนการเดินทาง' : 'ดูการเดินทางของพัสดุ'}
              </button>

              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="btn btn-sm bg-danger/15 text-danger hover:bg-danger/25 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Icon icon="tabler:package-off" className="text-base" aria-hidden="true" />
                ยกเลิกพัสดุ
              </button>
            </div>

            {traces && traces.length > 0 && (
              <ol className="flex flex-col gap-3 pt-3 border-t border-default-200">
                {traces.map((t, i) => (
                  <li key={`${t.status}-${t.occurredAt}-${i}`} className="flex gap-2">
                    <Icon
                      icon="tabler:point-filled"
                      className="text-base text-primary shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-default-800">{t.statusText ?? t.status}</p>
                      {t.statusDesc && <p className="text-xs text-default-500">{t.statusDesc}</p>}
                      <p className="text-xs text-default-400">
                        {formatDateTime(new Date(t.occurredAt))}
                        {t.location ? ` · ${t.location}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {traces && traces.length === 0 && (
              <p className="text-xs text-default-400 pt-3 border-t border-default-200">
                ยังไม่มีข้อมูลการเดินทาง — ขนส่งจะอัปเดตหลังรับพัสดุเข้าระบบ
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
