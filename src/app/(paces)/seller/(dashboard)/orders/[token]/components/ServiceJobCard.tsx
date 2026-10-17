'use client'

/**
 * การ์ด "งานนี้" ของร้านบริการ — สถานะชุดเดียว + ปิดงาน + เปิดงานอีกครั้ง (feature 00073)
 *
 * แสดงกับ **ทุกงานของร้านบริการ** (มีนัดหรือ walk-in) — เดิมปุ่มผลนัดอยู่ในการ์ดนัดหมาย
 * ซึ่งไม่ render กับงาน walk-in ⇒ งานไม่มีนัดไม่มีทางปิดได้จากหน้านี้เลย
 *
 * สิทธิ์ (00071): ปิดงาน O4 · ส่วนรับเงินในชีต O5 · คืนมัดจำ/เปิดงานอีกครั้ง O6
 * ซ่อนปุ่มที่ไม่มีสิทธิ์ — ตัวบังคับจริงอยู่ที่ /api/orders/[token]/close
 *
 * Base (โครงการ์ด/ปุ่ม/ข้อความใต้ปุ่ม): ./AppointmentCard.tsx
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import Icon from '@/components/wrappers/Icon'
import ServiceCloseSheet from '@/components/safepay/service-close/ServiceCloseSheet'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTH, formatDateTimeTH } from '@/lib/format-date'
import type { OrderMoney } from '@/lib/order-payment'
import { SERVICE_JOB_ERROR_MESSAGE } from '@/lib/service-job'
import { canCloseServiceJob, canReopenServiceJob, type ServiceStatusKey } from '@/lib/service-status'
import { cn } from '@/utils/helpers'

type Props = {
  publicToken: string
  orderLabel: string
  status: string
  /** ISO — null = ยังไม่ปิด */
  closedAtISO: string | null
  /** ISO — null = ยังไม่กดเริ่มงาน (00078) */
  startedAtISO?: string | null
  /** ป้ายสถานะที่ server derive แล้ว (service-status.ts) */
  badge: { key: ServiceStatusKey; label: string; cls: string; icon: string }
  hasAppointment: boolean
  /** เวลาเริ่มนัด — ปิดงานได้ตั้งแต่เวลานี้ (BR-RSV-34) · null = walk-in */
  startISO: string | null
  allDay: boolean
  /**
   * เงินของงาน — ส่งมาเฉพาะผู้มีสิทธิ์รับเงิน (O5) · ไม่ส่ง = ไม่มีส่วนรับเงินในชีต
   * 🛑 จอของช่าง (ระดับเงิน NONE) ต้อง **ไม่มีคีย์นี้เลย** ไม่ใช่ส่ง null — คีย์เงินใด ๆ ใน payload ของช่างผิดกติกา 00071
   */
  money?: OrderMoney
  canClose: boolean
  canManage: boolean
  editHref: string | null
}

export default function ServiceJobCard({
  publicToken,
  orderLabel,
  status,
  closedAtISO,
  startedAtISO = null,
  badge,
  hasAppointment,
  startISO,
  allDay,
  money,
  canClose,
  canManage,
  editHref,
}: Props) {
  const router = useRouter()
  const t = useT().autoNotify
  const [starting, setStarting] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reopening, setReopening] = useState(false)

  const closable = canCloseServiceJob({ status, serviceClosedAt: closedAtISO })
  const reopenable = canReopenServiceJob({ status, serviceClosedAt: closedAtISO })

  /** ยังไม่ถึงเวลานัด = ปิดไม่ได้ — ปลดล็อกเองเมื่อถึงเวลา (เหตุผลเต็มที่ AppointmentCard) */
  const [notStarted, setNotStarted] = useState(() => (startISO ? new Date(startISO).getTime() > Date.now() : false))
  useEffect(() => {
    if (!startISO) return setNotStarted(false)
    const msLeft = new Date(startISO).getTime() - Date.now()
    if (msLeft <= 0) return setNotStarted(false)
    setNotStarted(true)
    if (msLeft > 24 * 60 * 60 * 1000) return
    const t = setTimeout(() => setNotStarted(false), msLeft)
    return () => clearTimeout(t)
  }, [startISO])

  async function start() {
    const ok = await pacesConfirm({
      icon: 'question',
      title: t.startSwalTitle,
      text: t.startSwalBody,
      confirmButtonText: t.startSwalConfirm,
      cancelButtonText: t.startSwalCancel,
    })
    if (!ok) return
    setStarting(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/start`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        pacesToast.error(json.message ?? SERVICE_JOB_ERROR_MESSAGE[json.error ?? ''] ?? 'เริ่มงานไม่สำเร็จ — รีเฟรชหน้าแล้วลองอีกครั้ง')
        return
      }
      router.refresh()
    } catch {
      pacesToast.error('เริ่มงานไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่')
    } finally {
      setStarting(false)
    }
  }

  async function reopen() {
    const ok = await pacesConfirm({
      icon: 'warning',
      title: 'เปิดงานนี้อีกครั้ง?',
      text: `${orderLabel} · ยอดของงานนี้จะออกจากวันที่ปิดงาน จนกว่าจะปิดใหม่ · มัดจำที่เคยคืนไปแล้วจะไม่กลับมาเอง`,
      confirmButtonText: 'เปิดงานอีกครั้ง',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!ok) return
    setReopening(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/close`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        pacesToast.error(json.message ?? SERVICE_JOB_ERROR_MESSAGE[json.error ?? ''] ?? 'เปิดงานไม่สำเร็จ — รีเฟรชหน้าแล้วลองอีกครั้ง')
        return
      }
      pacesToast.success('เปิดงานอีกครั้งแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('เปิดงานไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่')
    } finally {
      setReopening(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-2">
        <h4 className="card-title">งานนี้</h4>
        <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', badge.cls)}>
          <Icon icon={badge.icon} className="shrink-0 text-sm" aria-hidden="true" />
          {badge.label}
        </span>
      </div>
      <div className="card-body">
        {closedAtISO && (
          <p className="text-default-700 mb-0 text-sm">
            ปิดงานเมื่อ {formatDateTimeTH(closedAtISO)}
            {status !== 'CONFIRMED' && badge.key !== 'NO_SHOW' && (
              <span className="text-default-600 block text-xs">รอลูกค้ายืนยันรับบริการ — ยืนยันแล้วจึงรีวิวได้</span>
            )}
          </p>
        )}
        {!closedAtISO && status === 'CONFIRMED' && (
          <p className="text-default-700 mb-0 text-sm">ลูกค้ายืนยันรับบริการแล้ว — ปิดงานเพื่อให้ยอดเข้าการเงินร้าน</p>
        )}
        {!closedAtISO && status !== 'CONFIRMED' && (
          <p className="text-default-700 mb-0 text-sm">
            ทำงานเสร็จแล้วกด &ldquo;ปิดงาน&rdquo; — บันทึกผลและรับเงินที่เหลือในครั้งเดียว
          </p>
        )}

        {/* เริ่มงาน (00078) — ไม่เปลี่ยนสถานะ/เงิน; กดแล้วแทนปุ่มด้วยข้อความเวลา · ซ่อนเมื่อยังไม่ถึงนัด */}
        {canClose && closable && startedAtISO && (
          <p className="text-default-700 mb-0 mt-4 text-sm">{fmt(t.startedAt, { time: formatDateTimeTH(startedAtISO) })}</p>
        )}
        {canClose && closable && !startedAtISO && !notStarted && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <button
              type="button"
              disabled={starting}
              onClick={() => void start()}
              className="btn bg-primary/10 text-primary-ink hover:bg-primary/20 min-h-11 w-full gap-2 disabled:opacity-60"
            >
              <Icon icon={starting ? 'loader-2' : 'player-play'} className={cn('text-base', starting && 'animate-spin')} aria-hidden="true" />
              {t.startJob}
            </button>
          </div>
        )}

        {canClose && closable && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <button
              type="button"
              disabled={notStarted}
              onClick={() => setSheetOpen(true)}
              className="btn bg-primary hover:bg-primary-hover min-h-11 w-full gap-2 text-white disabled:opacity-60"
            >
              <Icon icon="clipboard-check" className="text-base" aria-hidden="true" />
              ปิดงาน
            </button>
            {notStarted && startISO && (
              <p className="text-default-700 mb-0 mt-2 text-xs">
                ปิดงานได้ตั้งแต่ {allDay ? formatDateTH(startISO) : formatDateTimeTH(startISO)}
              </p>
            )}
          </div>
        )}

        {/* เปิดงานอีกครั้ง (มติ D2) — ปิดผิดแก้ได้ก่อนลูกค้ายืนยัน · ปุ่มโทนเบา: ไม่ใช่ action หลัก */}
        {canManage && reopenable && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <button
              type="button"
              disabled={reopening}
              onClick={() => void reopen()}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 w-full gap-2 disabled:opacity-60"
            >
              <Icon icon={reopening ? 'loader-2' : 'clipboard-x'} className={cn('text-base', reopening && 'animate-spin')} aria-hidden="true" />
              เปิดงานอีกครั้ง
            </button>
          </div>
        )}
      </div>

      <ServiceCloseSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        orderToken={publicToken}
        orderLabel={orderLabel}
        hasAppointment={hasAppointment}
        money={money ?? null}
        canRefundDeposit={canManage}
        editHref={editHref}
        onClosed={() => router.refresh()}
      />
    </div>
  )
}
