'use client'

/**
 * FlashPanel — เนื้อในส่วน "การจัดส่ง Flash" ของคำสั่งซื้อ 1 ใบ (feature 00084)
 *
 * คู่ของ orders/[token]/components/ShipmentPanel.tsx ฝั่ง iShip: เลือกว่าจะแสดงอะไร —
 * ผู้ส่งไม่ครบ / key ถูกปฏิเสธ / มีพัสดุแล้ว (สถานะ · รอตรวจ · ล้มเหลว) / ผูกเลขพัสดุ / ฟอร์มสร้าง
 * bare เสมอ (ผู้เรียกมีการ์ด/โมดัลอยู่แล้ว) · T10b ใช้ซ้ำในแผงพัสดุของแชทได้
 *
 * Base: in-app orders/[token]/components/ShipmentPanel.tsx
 *       + theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import SenderIncompleteNotice from '@/components/safepay/iship/SenderIncompleteNotice'
import ShipmentStatusView from '@/components/safepay/iship/ShipmentStatusView'
import { NOTICE_BOX } from '@/components/safepay/iship/tone'
import type { ShipmentFooterReporter } from '@/components/safepay/iship/shipment-footer'
import type { ShipmentViewJson } from '@/lib/iship/context'
import { hasUsableShipment, shipmentSourceLabel } from '@/lib/shipping/provider'
import type { FlashPanelJson } from '@/services/flash.service'
import FlashCreateForm from './FlashCreateForm'
import FlashLinkPanel from './FlashLinkPanel'
import { FLASH_SENDER_SETTINGS_HREF, FLASH_SETTINGS_HREF } from './flash-api'

interface Props {
  orderToken: string
  panel: FlashPanelJson
  /** เจ้าของร้าน — ปุ่มวางคีย์ใหม่ของใบล้มเหลว/ลิงก์ตั้งค่า (ค่าตั้งต้นปิด) */
  isOwner?: boolean
  /** true = เริ่มที่แผงผูกเลขพัสดุ */
  initialLink?: boolean
  formId?: string
  /** รายงานปุ่มหลักขึ้น footer ของโมดัล */
  onFooterChange?: ShipmentFooterReporter
  /** ปุ่มของผู้เรียกในหน้าสถานะ (เช่น "แจ้งเลขในแชท") */
  statusActions?: React.ReactNode
  /** "ส่งเองแทน" ของใบล้มเหลว — เฉพาะผู้เรียกที่พาไปส่งเองได้ */
  onSelfShipRequest?: () => void
  /** หลังสร้าง/ผูก/ยกเลิก/แก้สถานะ — ผู้เรียกรับทราบ (หน้านี้ refresh เองอยู่แล้ว) */
  onChanged?: (shipment: ShipmentViewJson | null) => void
  /** T10b — เฉพาะ "สร้าง/ผูกสำเร็จ" (ทุกผลที่แถวถูกสร้าง) — แชทใช้ปิดแผง/แจ้งเลขต่อ */
  onCreated?: (shipment: ShipmentViewJson) => void
  /** T10b — ช่องเพิ่มเติมท้ายฟอร์มสร้าง (ติ๊กแจ้งเลขในแชท) */
  extraFields?: () => React.ReactNode
  /** false = ไม่ router.refresh() (แชทไม่ต้องรีเฟรชหน้า inbox ทั้งหน้า) · ค่าตั้งต้น true เหมือนเดิม */
  refreshOnChange?: boolean
}

export default function FlashPanel({
  orderToken,
  panel,
  isOwner = false,
  initialLink = false,
  formId,
  onFooterChange,
  statusActions,
  onSelfShipRequest,
  onChanged,
  onCreated,
  extraFields,
  refreshOnChange = true,
}: Props) {
  const router = useRouter()
  const [shipment, setShipment] = useState<ShipmentViewJson | null>(panel.shipment)
  const [forceForm, setForceForm] = useState(false)
  const [linkMode, setLinkMode] = useState(initialLink)

  function afterChange(next: ShipmentViewJson | null) {
    setShipment(next)
    setForceForm(false)
    onChanged?.(next)
    if (refreshOnChange) router.refresh()
  }

  function afterCreated(next: ShipmentViewJson) {
    afterChange(next)
    onCreated?.(next)
  }

  // ใบของ iShip ที่ใช้งานอยู่ขวางอยู่ — เปิดใบ Flash ซ้อนไม่ได้ ต้องยกเลิกใบเดิมก่อน
  const elsewhere =
    shipment && shipment.provider !== 'FLASH' && hasUsableShipment(shipment.status) ? shipment : null
  const ready = panel.flashState === 'READY' ? panel : null
  const showStatus = shipment !== null && shipment.provider === 'FLASH' && !forceForm

  // หน้าที่ไม่มีปุ่มหลักของตัวเอง ต้องเคลียร์ footer ที่แผงก่อนหน้าเคยรายงานไว้
  const noPrimaryAction = showStatus || Boolean(elsewhere) || !ready || Boolean(ready.blockedBy)
  useEffect(() => {
    if (!onFooterChange || !noPrimaryAction) return
    onFooterChange(null)
  }, [onFooterChange, noPrimaryAction])

  if (showStatus && shipment) {
    return (
      <ShipmentStatusView
        shipment={shipment}
        receiver={ready?.receiver}
        items={ready?.items}
        actions={statusActions}
        isShopOwner={isOwner}
        onCancelled={() => afterChange(null)}
        onRetried={afterChange}
        onEditRequest={() => setForceForm(true)}
        onSelfShipRequest={onSelfShipRequest}
      />
    )
  }

  if (elsewhere) {
    return (
      <div className="p-4">
        <p className={`mb-0 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.info}`}>
          <Icon icon="tabler:info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            คำสั่งซื้อนี้มีพัสดุที่ {shipmentSourceLabel(elsewhere)} อยู่แล้ว
            {elsewhere.trackingNo ? ` เลขพัสดุ ${elsewhere.trackingNo}` : ''} ยกเลิกใบเดิมก่อนจึงจะเปิดใบใหม่ได้
          </span>
        </p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p
          className={`mb-0 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
            panel.flashState === 'TOKEN_INVALID' ? NOTICE_BOX.warning : NOTICE_BOX.info
          }`}
        >
          <Icon icon="tabler:alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            {panel.flashState === 'TOKEN_INVALID'
              ? 'Flash ปฏิเสธรหัสร้านค้าหรือ Secret Key ของร้านนี้ ต้องวางคีย์ใหม่ก่อนจึงจะเปิดพัสดุได้'
              : 'ร้านนี้ยังไม่ได้เชื่อมต่อ Flash — เชื่อมต่อได้ที่หน้าตั้งค่า'}
          </span>
        </p>
        {panel.flashState === 'TOKEN_INVALID' && !isOwner && (
          <p className="text-default-700 mb-0 text-xs">แจ้งเจ้าของร้านให้วางคีย์ใหม่</p>
        )}
        {(isOwner || panel.flashState !== 'TOKEN_INVALID') && (
          <Link
            href={FLASH_SETTINGS_HREF}
            className="btn inline-flex min-h-11 w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover"
          >
            <Icon icon="tabler:settings" className="text-base" aria-hidden="true" />
            {panel.flashState === 'TOKEN_INVALID' ? 'ไปวางคีย์ใหม่ที่หน้าตั้งค่า' : 'ไปหน้าตั้งค่า'}
          </Link>
        )}
      </div>
    )
  }

  if (ready.blockedBy) {
    return (
      <div className="p-4">
        <SenderIncompleteNotice
          missing={ready.blockedBy.missing}
          missingReceiver={ready.missingReceiver}
          settingsHref={FLASH_SENDER_SETTINGS_HREF}
        />
      </div>
    )
  }

  if (linkMode) {
    return (
      <FlashLinkPanel
        orderToken={orderToken}
        onLinked={afterCreated}
        onSwitchToCreate={() => setLinkMode(false)}
        formId={formId}
        hideSubmit={Boolean(formId)}
        onFooterChange={onFooterChange}
      />
    )
  }

  return (
    <FlashCreateForm
      orderToken={orderToken}
      formId={formId}
      hideSubmit={Boolean(formId)}
      onFooterChange={onFooterChange}
      missingReceiver={ready.missingReceiver}
      receiver={ready.receiver}
      sender={ready.sender}
      items={ready.items}
      codSuggested={ready.codSuggested}
      defaults={ready.defaults}
      extraFields={extraFields}
      onCreated={afterCreated}
      onExists={() => router.refresh()}
    />
  )
}
