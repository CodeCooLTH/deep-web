'use client'

/**
 * FlashConnectModal — โมดัล "เชื่อมต่อ Flash Express" (Design-Spec §3.5, §3.7)
 *
 * ลำดับ (ตัดส่วนที่ไม่เข้าเงื่อนไขทิ้ง ไม่ซ่อนด้วย disabled): สถานะ+ปุ่ม → ฟอร์มวางคีย์ → รับแจ้งสถานะ
 * ปุ่มทึบมีใบเดียวคือ "ทดสอบและบันทึก" · ข้อผิดพลาดเป็นกล่อง role="alert" ค้างในโมดัล ไม่ใช่ toast อย่างเดียว
 * ระหว่างยิง Flash โมดัลปิดไม่ได้ (busy) — คำขอกลางทางยกเลิกไม่ได้
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (ผ่าน IShipModalShell)
 *       theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *       theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import IShipModalShell from '@/components/safepay/iship/IShipModalShell'
import { TONE_BADGE, NOTICE_BOX } from '@/components/safepay/iship/tone'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { formatDateTime } from '@/lib/format-date'
import {
  flashStatusBadge,
  validateConnectForm,
  connectErrorText,
  connectNeedsWebhookStep,
} from '@/lib/shipping/flash-settings-view'
import type { FlashConnectionView, FlashWebhookReport } from '@/services/flash.service'
import { flashFetch, readFlashError } from './flash-fetch'
import FlashWebhookBlock from './FlashWebhookBlock'

interface Props {
  isOwner: boolean
  connection: FlashConnectionView
  /** เปิดมาในโหมดวางคีย์ใหม่ทันที (ปุ่ม "วางคีย์ใหม่" ของสถานะ TOKEN_INVALID) */
  startWithForm: boolean
  onConnection: (c: FlashConnectionView) => void
  onClose: () => void
}

const SPIN_PRIMARY = 'inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent'
const SPIN_WHITE = 'inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent'

export default function FlashConnectModal({ isOwner, connection, startWithForm, onConnection, onClose }: Props) {
  const router = useRouter()
  const [mchId, setMchId] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [webhookBusy, setWebhookBusy] = useState(false)
  // รายงาน webhook ตอนเชื่อมสำเร็จ + ข้อความ "เหลือเรื่องรับแจ้งสถานะ"
  const [report, setReport] = useState<FlashWebhookReport | null>(null)
  const [afterConnect, setAfterConnect] = useState(false)

  const badge = flashStatusBadge(connection)
  const tokenInvalid = connection.connected && connection.status === 'TOKEN_INVALID'
  const showForm =
    isOwner && (!connection.connected || tokenInvalid || replacing || (startWithForm && !afterConnect))
  const keyChange = connection.connected // เปลี่ยน key ใต้ mchId เดิม — mchId แก้ไม่ได้ (API: MERCHANT_CHANGE_NOT_ALLOWED)
  const busy = connecting || verifying || webhookBusy

  async function handleConnect() {
    const bad = validateConnectForm({ mchId: keyChange ? (connection.merchantId ?? '') : mchId, secretKey })
    if (bad) {
      setError(bad)
      return
    }
    setError(null)
    setConnecting(true)
    try {
      const res = await flashFetch('/connection', 'POST', {
        mchId: (keyChange ? (connection.merchantId ?? '') : mchId).trim(),
        secretKey: secretKey.trim(),
      })
      if (!res.ok) {
        const e = await readFlashError(res)
        setError(connectErrorText(e.code, e.message))
        return
      }
      const body = (await res.json()) as { connection: FlashConnectionView; webhook: FlashWebhookReport }
      setSecretKey('')
      setReplacing(false)
      onConnection(body.connection)
      if (connectNeedsWebhookStep(body.webhook)) {
        // ไม่ปิดโมดัล — ข้อมูลที่ต้องตัดสินใจจะหายไปกับ toast
        setReport(body.webhook)
        setAfterConnect(true)
        router.refresh()
        return
      }
      onClose()
      pacesToast.success('เชื่อมต่อ Flash สำเร็จ')
      router.refresh()
    } catch {
      setError(connectErrorText('UPSTREAM_ERROR'))
    } finally {
      setConnecting(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    try {
      const res = await flashFetch('/connection/verify', 'POST')
      if (!res.ok) {
        const e = await readFlashError(res)
        pacesToast.error(
          e.code === 'UPSTREAM_ERROR' || e.code === 'UPSTREAM_TIMEOUT'
            ? 'ติดต่อ Flash ไม่ได้ตอนนี้ สถานะการเชื่อมต่อยังเป็นเดิม ลองอีกครั้งในอีกสักครู่'
            : (e.message ?? 'ทดสอบการเชื่อมต่อไม่สำเร็จ'),
        )
        return
      }
      const body = (await res.json()) as FlashConnectionView
      onConnection(body)
      if (body.status === 'ACTIVE') pacesToast.success('การเชื่อมต่อใช้งานได้ตามปกติ')
      else pacesToast.warning('Flash ปฏิเสธรหัสร้านค้าหรือ Secret Key แล้ว วาง Secret Key ใหม่ด้านล่าง')
      router.refresh()
    } finally {
      setVerifying(false)
    }
  }

  async function handleDisconnect() {
    const ok = await pacesConfirm.danger(
      'ยกเลิกการเชื่อมต่อ Flash Express?',
      undefined,
      {
        html: `<ul style="text-align:left;margin:0;padding-left:1.25rem">
          <li>Deep จะลบ Secret Key ของร้านออก และพยายามปิดการรับแจ้งสถานะที่ตั้งไว้กับ Flash</li>
          <li>พัสดุที่ยังเดินทางอยู่จะหยุดอัปเดตสถานะใน Deep</li>
          <li>พิมพ์ใบปะหน้าและยกเลิกพัสดุจาก Deep ไม่ได้อีก (ไปทำที่ Flash ได้ตามปกติ)</li>
          <li>ประวัติพัสดุและเลขพัสดุที่เคยสร้างยังอยู่ครบ</li>
        </ul>`,
        confirmButtonText: 'ยกเลิกการเชื่อมต่อ',
        cancelButtonText: 'ไม่ยกเลิก',
      },
    )
    if (!ok) return
    const res = await flashFetch('/connection', 'DELETE')
    if (!res.ok) {
      pacesToast.error((await readFlashError(res)).message ?? 'ยกเลิกการเชื่อมต่อไม่สำเร็จ ลองอีกครั้ง')
      return
    }
    onClose()
    pacesToast.success('ยกเลิกการเชื่อมต่อแล้ว')
    router.refresh()
  }

  return (
    <IShipModalShell title="เชื่อมต่อ Flash Express" size="md" busy={busy} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {afterConnect && (
          <p className={`mb-0 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.info}`}>
            <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            เชื่อมต่อสำเร็จแล้ว เหลือเรื่องการรับแจ้งสถานะ
          </p>
        )}

        {connection.connected && (
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`${TONE_BADGE[badge.tone]} inline-flex items-center gap-1`}>
                <Icon icon={badge.icon} className="text-xs" aria-hidden="true" />
                {badge.label}
              </span>
              <span className="text-sm text-default-700">mchId {connection.merchantId ?? connection.merchantIdMasked}</span>
            </div>
            <p className="mb-0 mt-1 text-xs text-default-600">
              {connection.keyLast4 && <>Secret Key ลงท้าย …{connection.keyLast4}</>}
              {connection.lastVerifiedAt && (
                <>
                  {connection.keyLast4 ? ' · ' : ''}ตรวจล่าสุด {formatDateTime(connection.lastVerifiedAt)}
                </>
              )}
            </p>
            {tokenInvalid && (
              <p className={`mb-0 mt-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}>
                {connection.lastVerifyError ?? 'Flash ปฏิเสธรหัสร้านค้าหรือ Secret Key'}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={busy}
                  className="btn btn-sm inline-flex items-center gap-1.5 bg-primary/15 py-2.5 text-primary-ink hover:bg-primary/25 disabled:opacity-50"
                >
                  {verifying ? <span className={SPIN_PRIMARY} /> : <Icon icon="refresh" className="text-base" aria-hidden="true" />}
                  ทดสอบการเชื่อมต่อ
                </button>
                {isOwner && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={busy}
                    className="btn btn-sm inline-flex items-center gap-1.5 bg-danger/15 py-2.5 text-danger-ink hover:bg-danger/25 disabled:opacity-50"
                  >
                    <Icon icon="plug-off" className="text-base" aria-hidden="true" />
                    ยกเลิกการเชื่อมต่อ
                  </button>
                )}
              </div>
          </div>
        )}

        {connection.connected && connection.status === 'ACTIVE' && (
          <FlashWebhookBlock
            isOwner={isOwner}
            webhookStatus={connection.webhook.status}
            initialReport={report}
            onConnection={onConnection}
            onBusy={setWebhookBusy}
          />
        )}

        {isOwner && connection.connected && !showForm && (
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className="inline-flex min-h-11 items-center gap-1 self-start border-t border-default-200 pt-4 text-sm font-medium text-default-700 lg:min-h-0"
          >
            เปลี่ยน Secret Key
            <Icon icon="chevron-down" className="text-base" aria-hidden="true" />
          </button>
        )}

        {showForm && (
          <form
            className={connection.connected ? 'border-t border-default-200 pt-4' : ''}
            onSubmit={(e) => {
              e.preventDefault()
              void handleConnect()
            }}
          >
            <p className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.info}`}>
              <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
              ต้องมีรหัสร้านค้า (mchId) และ Secret Key ที่ Flash ออกให้ ขอได้จากเจ้าหน้าที่ Flash
              (Deep ไม่ได้ออกให้ และไม่มีปุ่มสมัครในแอป)
            </p>

            <label className="form-label" htmlFor="flash-mchId">รหัสร้านค้า (mchId)</label>
            {/* _forms.css ไม่ห่อ @layer → width util บน .form-input ไม่มีผล ต้องใช้ .input-group ครอบ */}
            <div className="input-group mb-3">
              <input
                id="flash-mchId"
                type="text"
                className="form-input"
                value={keyChange ? (connection.merchantId ?? '') : mchId}
                readOnly={keyChange}
                disabled={connecting}
                onChange={(e) => setMchId(e.target.value)}
                placeholder="เช่น AB1234"
                autoComplete="off"
                maxLength={32}
              />
            </div>

            <label className="form-label" htmlFor="flash-secretKey">Secret Key</label>
            <div className="flex gap-2">
              <div className="input-group flex-1">
                <input
                  id="flash-secretKey"
                  type={showKey ? 'text' : 'password'}
                  className="form-input"
                  value={secretKey}
                  disabled={connecting}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="วาง Secret Key ที่นี่"
                  autoComplete="off"
                  aria-describedby="flash-secretKey-help"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="btn btn-icon shrink-0 border border-default-300"
                aria-label={showKey ? 'ซ่อน Secret Key' : 'แสดง Secret Key'}
              >
                <Icon icon={showKey ? 'eye-off' : 'eye'} className="text-base" />
              </button>
            </div>
            <p id="flash-secretKey-help" className="mb-0 mt-1 text-xs text-default-600">
              ระบบเก็บแบบเข้ารหัสและจะไม่แสดงให้เห็นอีก
            </p>

            {error && (
              <p role="alert" className={`mb-0 mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.danger}`}>
                <Icon icon="alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={connecting}
              className="btn mt-3 inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {connecting ? (
                <>
                  <span className={SPIN_WHITE} />
                  กำลังทดสอบกับ Flash…
                </>
              ) : (
                <>
                  <Icon icon="plug-connected" className="text-base" aria-hidden="true" />
                  ทดสอบและบันทึก
                </>
              )}
            </button>
          </form>
        )}

        {!isOwner && (
          <p className="mb-0 flex items-center gap-2 rounded-lg bg-default-100 px-3 py-2.5 text-sm text-default-700">
            <Icon icon="lock" className="shrink-0 text-base" aria-hidden="true" />
            เฉพาะเจ้าของร้านเท่านั้นที่ตั้งค่าการเชื่อมต่อได้
          </p>
        )}
      </div>
    </IShipModalShell>
  )
}
