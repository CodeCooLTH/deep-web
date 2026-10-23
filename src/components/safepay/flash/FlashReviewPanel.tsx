'use client'

/**
 * FlashReviewPanel — ใบ Flash สถานะ NEEDS_REVIEW (Flash ตอบ 1003 แต่เราไม่มีเลขพัสดุ) (Design-Spec §4.7)
 *
 * ลำดับสำคัญ: ① ผูกด้วยเลขพัสดุ (ไม่เสียเงิน) มาก่อน ② เปิดใหม่ (เสี่ยงเสียเงินซ้ำ) ทีหลังและไม่ใช่ปุ่มทึบ
 * ปุ่ม "ลองใหม่" ธรรมดาถูกปิดโดยตั้งใจ — อาจสร้างพัสดุซ้ำที่ Flash
 * ② ต้องผ่าน Swal เตือน แล้วส่ง confirmNoExistingParcel: true (API.md §4.14) — server บันทึกชื่อผู้ยืนยัน
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (กล่องเตือน)
 *       + theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (โครงหัว/เนื้อ/ปุ่ม)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { formatRelativeDayTime } from '@/lib/format-date'
import { useIShipUrl } from '@/components/safepay/iship/iship-shop-context'
import { NOTICE_BOX, TONE_BADGE } from '@/components/safepay/iship/tone'
import { shipmentSourceLabel } from '@/lib/shipping/provider'
import type { ShipmentViewJson } from '@/lib/iship/context'
import FlashLogo from './FlashLogo'
import FlashPnoLink from './FlashPnoLink'
import { readApiError } from './flash-api'

interface Props {
  shipment: ShipmentViewJson
  /** ผูกสำเร็จ หรือเปิดใหม่สำเร็จ — ส่งใบที่ใช้แทนใบนี้ */
  onResolved: (shipment: ShipmentViewJson) => void
}

export default function FlashReviewPanel({ shipment, onResolved }: Props) {
  const flashUrl = useIShipUrl()
  const [linkBusy, setLinkBusy] = useState(false)
  const [reopening, setReopening] = useState(false)
  const resolvePath = `/api/seller/flash/shipments/${shipment.id}/resolve`

  async function reopen() {
    if (reopening || linkBusy) return
    const ok = await pacesConfirm.warning(
      'เปิดพัสดุใหม่ที่ Flash?',
      'ถ้าที่ Flash มีพัสดุใบเดิมอยู่แล้ว จะมีพัสดุสองใบและอาจเสียค่าส่งซ้ำ ตรวจใน Flash Printer ให้แน่ใจก่อน ระบบจะบันทึกชื่อคุณและเวลาที่ยืนยัน',
      { confirmButtonText: 'ไม่มีใบเดิม เปิดใหม่', cancelButtonText: 'กลับไปตรวจ', focusCancel: true },
    )
    if (!ok) return

    setReopening(true)
    try {
      const res = await fetch(flashUrl(resolvePath), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REOPEN', confirmNoExistingParcel: true }),
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error((await readApiError(res, 'เปิดพัสดุใหม่ไม่สำเร็จ กรุณาลองใหม่')).message)
        return
      }
      const next = (await res.json()) as ShipmentViewJson
      if (next.status === 'CREATED') pacesToast.success('สร้างพัสดุสำเร็จ')
      else if (next.status === 'NEEDS_REVIEW') pacesToast.warning(next.lastErrorMessage ?? 'ต้องตรวจสอบพัสดุอีกครั้ง')
      else pacesToast.error(next.lastErrorMessage ?? 'ยังสร้างพัสดุไม่สำเร็จ')
      onResolved(next)
    } catch {
      pacesToast.error('เปิดพัสดุใหม่ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setReopening(false)
    }
  }

  return (
    <div className="flex flex-col">
      <section className="border-b-8 border-default-100 p-4">
        <div className="flex items-start gap-3">
          <FlashLogo />
          <div className="min-w-0 flex-1">
            <p className="mb-0 truncate text-base font-bold text-default-900">{shipmentSourceLabel(shipment)}</p>
            <p className="mb-0 mt-1">
              <span className={`${TONE_BADGE.warning} inline-flex items-center gap-1`}>
                <Icon icon="tabler:alert-triangle" className="text-sm" aria-hidden="true" />
                ต้องตรวจสอบพัสดุ
              </span>
            </p>
            <p className="text-default-700 mb-0 mt-1.5 text-xs">
              สร้างเมื่อ {formatRelativeDayTime(new Date(shipment.createdAt))}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b-8 border-default-100 p-4">
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`} role="alert">
          <Icon icon="tabler:alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <div className="min-w-0">
            <p className="mb-1 font-semibold">อาจมีพัสดุถูกสร้างไว้ที่ Flash แล้ว</p>
            <p className="mb-0">
              Flash แจ้งว่าเลขอ้างอิงนี้เคยถูกใช้แล้ว แต่ไม่บอกเลขพัสดุเดิม Deep จึงยังไม่เปิดใบใหม่ให้
              เพื่อไม่ให้เสียเงินซ้ำ
            </p>
          </div>
        </div>
      </section>

      {/* ① ผูกก่อน (ไม่เสียเงิน) */}
      <section className="border-b-8 border-default-100 p-4">
        <h6 className="mb-1 text-sm font-semibold text-default-900">① มีพัสดุใบนี้ที่ Flash แล้ว: ผูกด้วยเลขพัสดุ</h6>
        <p className="text-default-700 mb-3 text-xs">
          ค้นหาจากชื่อผู้รับใน Flash Printer แล้วคัดลอกเลขพัสดุมาวาง
        </p>
        <FlashPnoLink
          confirmRequest={(pno) => ({ path: resolvePath, body: { action: 'LINK_PNO', pno } })}
          onLinked={onResolved}
          onBusyChange={setLinkBusy}
        />
      </section>

      {/* ② เปิดใหม่ — tint warning ไม่ใช่ปุ่มทึบ/แดง */}
      <section className="p-4">
        <h6 className="mb-2 text-sm font-semibold text-default-900">② ไม่มีพัสดุใบนี้ที่ Flash: เปิดใหม่</h6>
        <button
          type="button"
          onClick={() => void reopen()}
          disabled={reopening || linkBusy}
          className="btn inline-flex min-h-11 w-full items-center justify-center gap-2 bg-warning/15 text-warning-ink hover:bg-warning/25 disabled:opacity-60"
        >
          {reopening ? (
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-warning-ink border-t-transparent" />
          ) : (
            <Icon icon="tabler:package-export" className="text-base" aria-hidden="true" />
          )}
          ยืนยันว่าไม่มีใบเดิม แล้วเปิดใหม่
        </button>
        <p className="text-default-700 mb-0 mt-2 text-xs">
          ปุ่มลองใหม่ธรรมดาถูกปิดไว้ เพราะอาจสร้างพัสดุซ้ำที่ Flash
        </p>
      </section>
    </div>
  )
}
