'use client'

/**
 * FlashSettingsRow — การ์ด "Flash Express (บัญชีของร้านเอง)" แถวเดียว + โมดัล 3 ตัว (feature 00084 T9)
 *
 * โครงแถวคัดจาก ShippingSettingsRow (โลโก้ + ข้อความ + ป้าย | ปุ่มขวา) — โมดัลเปิดเมื่อกดเท่านั้น:
 *   เชื่อมต่อ  → FlashConnectModal  (สถานะ/ทดสอบ/ถอน/วางคีย์ + รับแจ้งสถานะ)
 *   ตั้งค่า     → FlashSettingsModal (3 แท็บ · ผู้ที่ไม่ใช่เจ้าของเห็นแบบอ่านอย่างเดียว)
 *   เรียกรถ    → FlashPickupModal
 * ตัวตัดสินว่าจะโชว์อะไรอยู่ใน src/lib/shipping/flash-settings-view.ts (มีเทส)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx
 *       theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 *       settings/ShippingSettingsRow.tsx (โครงแถว + deep-link ?flash=settings)
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { TONE_BADGE, NOTICE_BOX } from '@/components/safepay/iship/tone'
import { formatRelativeDayTime } from '@/lib/format-date'
import { courierLogoUrl } from '@/lib/iship/courier'
import {
  flashStatusBadge,
  flashRowButtons,
  flashRowWarnings,
  type RowAction,
  type RowButton,
  type SenderFields,
  type SettingsTab,
} from '@/lib/shipping/flash-settings-view'
import type { FlashConnectionView, FlashSettings } from '@/services/flash.service'
import FlashConnectModal from './FlashConnectModal'
import FlashSettingsModal from './FlashSettingsModal'
import FlashPickupModal from './FlashPickupModal'

interface Props {
  isOwner: boolean
  initialConnection: FlashConnectionView
  /** null = ยังไม่เชื่อมต่อ */
  initialSettings: FlashSettings | null
  /** ที่อยู่ผู้ส่งของ iShip สำหรับปุ่มก๊อป — ส่งมาเฉพาะเจ้าของร้านที่เชื่อม iShip และที่อยู่ครบ */
  ishipSender: SenderFields | null
  /** ร้านเชื่อม iShip ด้วย — ใช้บอกว่าจะถูกถามผู้ให้บริการทุกครั้ง */
  ishipConnected: boolean
}

type ModalKey = 'connect' | 'settings' | 'pickup' | null

const BTN_STYLE: Record<RowButton['style'], string> = {
  tint: 'bg-primary/15 text-primary-ink hover:bg-primary/25',
  outline: 'border border-default-300',
  warning: 'bg-warning/15 text-warning-ink hover:bg-warning/25',
}
const BTN_ICON: Record<RowAction, string> = {
  connect: 'plug-connected',
  rekey: 'key',
  pickup: 'truck',
  settings: 'settings',
}

/** โลโก้ Flash — จัตุรัสพื้นเหลืองเต็มกรอบ (object-cover ไม่มี padding) · ไฟล์หาย = ไอคอนแทน ไม่ปล่อยช่องว่าง */
function FlashLogo() {
  const [failed, setFailed] = useState(false)
  const src = courierLogoUrl('FLASH', 'Flash Express')
  if (failed || !src) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-default-200 bg-primary/10">
        <Icon icon="truck-delivery" className="text-lg text-primary" aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className="size-9 shrink-0 overflow-hidden rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Flash Express" className="size-full object-cover" onError={() => setFailed(true)} />
    </span>
  )
}

export default function FlashSettingsRow({ isOwner, initialConnection, initialSettings, ishipSender, ishipConnected }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [connection, setConnection] = useState(initialConnection)
  const [modal, setModal] = useState<ModalKey>(null)
  const [tab, setTab] = useState<SettingsTab>('sender')
  // เปิดโมดัลเชื่อมต่อในโหมดวางคีย์ใหม่ทันที (ปุ่ม "วางคีย์ใหม่")
  const [rekey, setRekey] = useState(false)

  // router.refresh() ส่ง props ชุดใหม่มา — useState เก็บค่าแรกไว้ จึงต้องซิงค์เองไม่งั้นการ์ดค้างสถานะเก่า
  // (ปรับ state ระหว่าง render แทน effect: ไม่ต้อง render ซ้ำสองรอบ)
  const [seenInitial, setSeenInitial] = useState(initialConnection)
  if (seenInitial !== initialConnection) {
    setSeenInitial(initialConnection)
    setConnection(initialConnection)
  }

  // deep-link จากฟอร์มสร้างพัสดุ (?flash=settings&tab=sender) — เปิดโมดัลที่แท็บที่ต้องแก้ แล้วล้าง query
  useEffect(() => {
    if (searchParams.get('flash') !== 'settings') return
    const t = searchParams.get('tab')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link เปิดโมดัลครั้งเดียวแล้วล้าง query (precedent ShippingSettingsRow)
    setTab(t === 'parcel' || t === 'mode' ? t : 'sender')
    setModal(connection.connected ? 'settings' : 'connect')
    router.replace('/settings')
  }, [searchParams, connection.connected, router])

  const badge = flashStatusBadge(connection)
  const buttons = flashRowButtons(connection, isOwner)
  const warnings = flashRowWarnings(connection, isOwner)
  const tokenInvalid = connection.connected && connection.status === 'TOKEN_INVALID'

  function onButton(a: RowAction) {
    if (a === 'rekey') setRekey(true)
    if (a === 'connect') setRekey(false)
    setModal(a === 'rekey' ? 'connect' : a)
  }

  function openWarning(key: 'sender' | 'webhook') {
    if (key === 'sender') {
      setTab('sender')
      setModal('settings')
    } else {
      setRekey(false)
      setModal('connect')
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FlashLogo />
          <div className="min-w-0">
            <p className="mb-0 text-sm font-medium text-default-800">เชื่อมต่อ Flash Express</p>
            <p className="mb-0 mt-0.5 truncate text-sm text-default-500">
              {connection.connected
                ? `mchId ${connection.merchantIdMasked ?? '—'}${
                    connection.lastVerifiedAt
                      ? ` · ตรวจล่าสุด ${formatRelativeDayTime(connection.lastVerifiedAt)}`
                      : ''
                  }`
                : 'ใช้ราคาสัญญาและบัญชีของร้านเองกับ Flash'}
            </p>
            <span className={`${TONE_BADGE[badge.tone]} mt-1 inline-flex items-center gap-1`}>
              <Icon icon={badge.icon} className="text-xs" aria-hidden="true" />
              {badge.label}
            </span>
          </div>
        </div>

        {buttons.length > 0 && (
          <div className="flex shrink-0 gap-2">
            {buttons.map((b) => (
              <button
                key={b.action}
                type="button"
                onClick={() => onButton(b.action)}
                className={`btn btn-sm inline-flex flex-1 items-center justify-center gap-1.5 py-2.5 sm:flex-none ${BTN_STYLE[b.style]}`}
              >
                <Icon icon={BTN_ICON[b.action]} className="text-base" aria-hidden="true" />
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!connection.connected && (
        <p className={`mb-0 mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.info}`}>
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          {isOwner
            ? 'ต้องมีรหัสร้านค้า (mchId) และ Secret Key ที่ Flash ออกให้ ขอได้จากเจ้าหน้าที่ Flash'
            : 'เจ้าของร้านเป็นผู้เชื่อมต่อ Flash Express'}
        </p>
      )}

      {tokenInvalid && (
        <p className={`mb-0 mt-3 text-sm ${NOTICE_BOX.warning} rounded-lg px-3 py-2.5`}>
          {isOwner
            ? 'Flash ปฏิเสธรหัสร้านค้าหรือ Secret Key เปิดพัสดุและพิมพ์ใบปะหน้าจาก Deep ไม่ได้จนกว่าจะวางคีย์ใหม่'
            : 'Flash ปฏิเสธรหัสร้านค้าหรือ Secret Key เปิดพัสดุจาก Deep ไม่ได้ แจ้งเจ้าของร้านให้วางคีย์ใหม่'}
        </p>
      )}

      {warnings.map((w) => (
        <p
          key={w.key}
          className={`mb-0 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}
        >
          <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
          <span className="min-w-0 flex-1">{w.text}</span>
          {w.actionLabel && (
            <button
              type="button"
              onClick={() => openWarning(w.key)}
              className="inline-flex min-h-11 items-center gap-0.5 font-medium underline lg:min-h-0"
            >
              {w.actionLabel}
              <Icon icon="chevron-right" className="text-base" aria-hidden="true" />
            </button>
          )}
        </p>
      ))}

      {modal === 'connect' && (
        <FlashConnectModal
          isOwner={isOwner}
          connection={connection}
          startWithForm={rekey}
          onConnection={setConnection}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'settings' && initialSettings && (
        <FlashSettingsModal
          isOwner={isOwner}
          senderComplete={connection.senderComplete}
          initialSettings={initialSettings}
          ishipSender={ishipSender}
          ishipConnected={ishipConnected}
          initialTab={tab}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'pickup' && initialSettings && (
        <FlashPickupModal
          sender={initialSettings}
          senderComplete={connection.senderComplete}
          lastPickup={connection.lastPickup}
          onOpenSender={() => {
            setTab('sender')
            setModal('settings')
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}
