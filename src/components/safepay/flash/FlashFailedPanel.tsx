'use client'

/**
 * FlashFailedPanel — ใบ Flash ที่สร้างไม่สำเร็จ (Design-Spec §4.6)
 *
 * ShipmentStatusView เรียกใช้ในกิ่ง FAILED เมื่อ provider = FLASH (กิ่ง iShip ไม่ถูกแตะ)
 * ปุ่มทึบมีได้ใบเดียวต่อจอ และตัดสินจากชนิดของ error (flashFailedView) ไม่ใช่ตำแหน่งตายตัว —
 * บทเรียนเดียวกับ iShip: อย่าเชิญให้ร้านกดสิ่งที่ไม่มีวันผ่าน
 *
 * Base: in-app src/components/safepay/iship/ShipmentStatusView.tsx (กิ่ง FAILED) +
 *       theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx
 */

import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { formatRelativeDayTime } from '@/lib/format-date'
import { flashFailedView, type FlashSolidAction } from '@/lib/shipping/flash-order-ui'
import { shipmentSourceLabel } from '@/lib/shipping/provider'
import { TONE_BADGE } from '@/components/safepay/iship/tone'
import type { ReceiverData, ShipmentViewJson } from '@/lib/iship/context'
import FlashLogo from './FlashLogo'
import { FLASH_SENDER_SETTINGS_HREF, FLASH_SETTINGS_HREF } from './flash-api'

interface Props {
  shipment: ShipmentViewJson
  receiver?: ReceiverData | null
  /** เจ้าของร้าน — ใช้ตัดสินปุ่ม "วางคีย์ใหม่" (key ตั้งได้เฉพาะเจ้าของ) · ไม่ส่ง = ปิด */
  isOwner?: boolean
  busy: boolean
  onRetry: () => void
  /** สลับกลับไปฟอร์ม (แก้ที่อยู่ผู้รับ/ข้อมูลพัสดุ) — ไม่ส่ง = ไม่มีปุ่มแก้ */
  onEditRequest?: () => void
  /** "ส่งเองแทน" — ผู้เรียกที่พาไปส่งเองได้เท่านั้น (แชท) */
  onSelfShipRequest?: () => void
}

const PRIMARY = 'bg-primary text-white hover:bg-primary-hover'
const GHOST = 'text-default-700 hover:bg-default-100'
const BTN = 'btn inline-flex min-h-11 items-center justify-center gap-2 p-3 disabled:opacity-60 @2xl:flex-1'

const SOLID_LABEL: Record<Exclude<FlashSolidAction, 'retry' | 'none'>, { label: string; icon: string }> = {
  'edit-sender': { label: 'ตั้งที่อยู่ผู้ส่ง', icon: 'tabler:settings' },
  'edit-receiver': { label: 'แก้ที่อยู่ผู้รับ', icon: 'tabler:edit' },
  'edit-parcel': { label: 'แก้ข้อมูลพัสดุ', icon: 'tabler:edit' },
  rekey: { label: 'วางคีย์ใหม่', icon: 'tabler:key' },
}

export default function FlashFailedPanel({
  shipment,
  receiver,
  isOwner = false,
  busy,
  onRetry,
  onEditRequest,
  onSelfShipRequest,
}: Props) {
  const view = flashFailedView(shipment.lastErrorCode, isOwner, shipment.lastErrorMessage)
  // ปุ่มแก้ที่ต้องสลับกลับฟอร์ม แต่ผู้เรียกไม่มีทางสลับ → ไม่ใช่ปุ่มทึบ (ไม่ทิ้งปุ่มที่กดแล้วไม่ทำอะไร)
  const needsForm = view.solid === 'edit-receiver' || view.solid === 'edit-parcel'
  const solid: FlashSolidAction = needsForm && !onEditRequest ? 'none' : view.solid
  const showRetry = solid === 'retry' || view.ghostRetry

  const retry = (
    <button
      type="button"
      onClick={onRetry}
      disabled={busy}
      className={`${BTN} ${solid === 'retry' ? PRIMARY : GHOST}`}
    >
      {busy ? (
        <span
          className={`inline-block size-4 animate-spin rounded-full border-2 border-t-transparent ${
            solid === 'retry' ? 'border-white' : 'border-default-400'
          }`}
        />
      ) : (
        <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
      )}
      {/* ป้ายเปลี่ยนตอนทำงาน — ข้อความ error ซ้ำเดิมทำให้จอนิ่งสนิทและคนอ่านหน้าจอไม่ได้ยินอะไร */}
      {busy ? 'กำลังลองใหม่…' : 'ลองใหม่'}
    </button>
  )

  const solidButton =
    solid === 'none' || solid === 'retry' ? null : solid === 'edit-sender' || solid === 'rekey' ? (
      <Link
        href={solid === 'rekey' ? FLASH_SETTINGS_HREF : FLASH_SENDER_SETTINGS_HREF}
        className={`${BTN} ${PRIMARY}`}
      >
        <Icon icon={SOLID_LABEL[solid].icon} className="text-base" aria-hidden="true" />
        {SOLID_LABEL[solid].label}
      </Link>
    ) : (
      <button type="button" onClick={onEditRequest} disabled={busy} className={`${BTN} ${PRIMARY}`}>
        <Icon icon={SOLID_LABEL[solid].icon} className="text-base" aria-hidden="true" />
        {SOLID_LABEL[solid].label}
      </button>
    )

  return (
    <div className="@container flex flex-col">
      <section className="border-b-8 border-default-100 p-4">
        <div className="flex items-start gap-3">
          <FlashLogo />
          <div className="min-w-0 flex-1">
            <p className="mb-0 flex items-center gap-2">
              <span className="truncate text-base font-bold text-default-900">{shipmentSourceLabel(shipment)}</span>
              <span className={TONE_BADGE.danger}>ไม่สำเร็จ</span>
            </p>
            <p className="text-default-700 mb-0 mt-1 text-xs">
              {[
                receiver?.name ? `ส่งถึง ${receiver.name}` : null,
                `สร้างเมื่อ ${formatRelativeDayTime(new Date(shipment.createdAt))}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 p-4">
        <p
          className="mb-0 flex items-start gap-2 rounded-lg bg-danger/15 px-3 py-2.5 text-sm text-danger-ink"
          role="alert"
        >
          <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            {view.message}
            {view.nonOwnerHint && <span className="mt-1 block">{view.nonOwnerHint}</span>}
          </span>
        </p>

        {/* ปุ่มหลักมาก่อนใน DOM เสมอ — ตำแหน่งต้องนิ่งในจอที่ร้านกดซ้ำ ๆ */}
        {(solidButton || showRetry) && (
          <div className="flex flex-col gap-2 @2xl:flex-row @2xl:items-stretch">
            {solidButton}
            {showRetry && retry}
          </div>
        )}

        {view.offerSelfShip && onSelfShipRequest && (
          <button
            type="button"
            onClick={onSelfShipRequest}
            disabled={busy}
            className="btn inline-flex min-h-11 items-center justify-center gap-2 text-sm text-default-700 hover:bg-default-100 disabled:opacity-60"
          >
            <Icon icon="tabler:edit" className="text-base" aria-hidden="true" />
            ส่งเองแทน
          </button>
        )}

        {view.note && <p className="mb-0 text-xs text-default-600">{view.note}</p>}
      </section>
    </div>
  )
}
