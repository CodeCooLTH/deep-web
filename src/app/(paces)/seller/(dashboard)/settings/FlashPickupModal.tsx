'use client'

/**
 * FlashPickupModal — "เรียกรถเข้ารับพัสดุ" (Design-Spec §3.9)
 *
 * 3 สถานะ: ที่อยู่ผู้ส่งไม่ครบ → กรอกคำขอ → ผลลัพธ์ (แทนที่ฟอร์มในโมดัลเดิม)
 * ผลลัพธ์ใช้ info ไม่ใช่เขียว เพราะ Flash ยังไม่ได้มารับ · ผลคำขอล่าสุดมาจาก connection.lastPickup
 * จึงอยู่รอดหลังรีโหลด (มติ Controller ข้อ 1)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (ผ่าน IShipModalShell)
 *       ShipmentStatusView (แถวข้อมูลเส้นประแบบ StatRow)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import IShipModalShell from '@/components/safepay/iship/IShipModalShell'
import { TONE_BADGE, NOTICE_BOX } from '@/components/safepay/iship/tone'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import {
  pickupModalState,
  pickupResultToShow,
  pickupErrorText,
  isValidParcelCount,
  type PickupResult,
} from '@/lib/shipping/flash-settings-view'
import type { FlashConnectionView, FlashSettings } from '@/services/flash.service'
import { flashFetch, readFlashError } from './flash-fetch'

interface Props {
  sender: FlashSettings
  senderComplete: boolean
  lastPickup: FlashConnectionView['lastPickup']
  onOpenSender: () => void
  onClose: () => void
}

const SPIN_WHITE = 'inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-default-300 py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-default-600">{label}</span>
      <span className="min-w-0 break-words text-end text-default-900">{children}</span>
    </div>
  )
}

export default function FlashPickupModal({ sender, senderComplete, lastPickup, onOpenSender, onClose }: Props) {
  const router = useRouter()
  const [result, setResult] = useState<PickupResult | null>(pickupResultToShow(lastPickup))
  const [senderOk, setSenderOk] = useState(senderComplete)
  const [parcelCount, setParcelCount] = useState('1')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const state = pickupModalState(senderOk, result)
  const place = `${sender.senderSubdistrict ?? ''} ${sender.senderDistrict ?? ''} ${sender.senderProvince ?? ''}`.trim()

  async function handleCreate() {
    const count = Number(parcelCount)
    if (!isValidParcelCount(count)) {
      setError('จำนวนพัสดุต้องเป็นจำนวนเต็ม 1–100')
      return
    }
    setError(null)
    const ok = await pacesConfirm.question(
      'เรียกรถ Flash มารับที่ร้าน?',
      `รับที่ ${place} · ประมาณ ${count} ชิ้น`,
      { confirmButtonText: 'เรียกรถ', cancelButtonText: 'ยังไม่เรียก' },
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await flashFetch('/pickups', 'POST', { parcelCount: count, remark: remark.trim() || null })
      if (!res.ok) {
        const e = await readFlashError(res)
        if (e.code === 'INCOMPLETE_DATA') setSenderOk(false)
        else setError(pickupErrorText(e.code, e.message))
        return
      }
      setResult((await res.json()) as PickupResult)
      router.refresh()
    } catch {
      setError(pickupErrorText('UPSTREAM_ERROR'))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (!result) return
    const ok = await pacesConfirm.danger(
      'ยกเลิกคำขอเรียกรถ?',
      'ยกเลิกเฉพาะคำขอรถ พัสดุที่เปิดไว้ยังอยู่ครบ',
      { confirmButtonText: 'ยกเลิกคำขอรถ', cancelButtonText: 'ไม่ยกเลิก' },
    )
    if (!ok) return
    setBusy(true)
    try {
      const res = await flashFetch(`/pickups/${encodeURIComponent(result.id)}/cancel`, 'POST')
      if (!res.ok) {
        const e = await readFlashError(res)
        setError(pickupErrorText(e.code, e.message))
        return
      }
      setError(null)
      setResult(null)
      pacesToast.success('ยกเลิกคำขอรถแล้ว')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function copyId(v: string) {
    try {
      await navigator.clipboard.writeText(v)
      pacesToast.success('คัดลอกเลขคำขอแล้ว')
    } catch {
      pacesToast.error('คัดลอกไม่สำเร็จ ลองเลือกแล้วคัดลอกเอง')
    }
  }

  const errorBox = error && (
    <p role="alert" className={`mb-0 mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.danger}`}>
      <Icon icon="alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
      {error}
    </p>
  )

  return (
    <IShipModalShell
      title="เรียกรถเข้ารับพัสดุ"
      size="sm"
      busy={busy}
      onClose={onClose}
      footer={
        state === 'form' ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="btn inline-flex items-center justify-center border border-default-300 py-2.5 text-default-700 disabled:opacity-60">
              ยกเลิก
            </button>
            <button type="button" onClick={() => void handleCreate()} disabled={busy}
              className="btn inline-flex items-center justify-center gap-2 bg-primary py-2.5 text-white hover:bg-primary-hover disabled:opacity-60">
              {busy ? (
                <>
                  <span className={SPIN_WHITE} />
                  กำลังส่งคำขอ…
                </>
              ) : (
                <>
                  <Icon icon="truck" className="text-base" aria-hidden="true" />
                  เรียกรถ
                </>
              )}
            </button>
          </div>
        ) : undefined
      }
    >
      {state === 'incomplete' && (
        <div>
          <p className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}>
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            ตั้งที่อยู่ผู้ส่งก่อน Flash จะส่งรถไปรับที่ที่อยู่นี้
          </p>
          <button type="button" onClick={onOpenSender}
            className="btn inline-flex w-full items-center justify-center gap-2 bg-primary py-2.5 text-white hover:bg-primary-hover">
            <Icon icon="map-pin" className="text-base" aria-hidden="true" />
            ตั้งที่อยู่ผู้ส่ง
          </button>
        </div>
      )}

      {state === 'form' && (
        <div>
          <p className="form-label">รถจะไปรับที่</p>
          <div className="mb-4 rounded-lg border border-default-200 bg-default-100 px-3 py-2.5 text-sm text-default-800">
            <p className="mb-0 font-medium">{[sender.senderName, sender.senderPhone].filter(Boolean).join(' · ')}</p>
            <p className="mb-0 mt-0.5 break-words">
              {[sender.senderAddress, place, sender.senderPostcode].filter(Boolean).join(' ')}
            </p>
          </div>
          <label className="form-label" htmlFor="flash-pickup-count">จำนวนพัสดุโดยประมาณ (1–100)</label>
          <input id="flash-pickup-count" type="number" min="1" max="100" className="form-input mb-4"
            value={parcelCount} disabled={busy} onChange={(e) => setParcelCount(e.target.value)} />
          <label className="form-label" htmlFor="flash-pickup-remark">หมายเหตุถึงคนขับ (ไม่บังคับ)</label>
          <input id="flash-pickup-remark" type="text" className="form-input" maxLength={200}
            value={remark} disabled={busy} onChange={(e) => setRemark(e.target.value)} />
          {errorBox}
        </div>
      )}

      {state === 'result' && result && (
        <div>
          {result.isDryRun && (
            <p className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}>
              <Icon icon="flask" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
              คำขอจำลอง (โหมดทดสอบ) ไม่ได้เรียกรถจริง
            </p>
          )}
          <span className={`${TONE_BADGE.info} mb-2 inline-flex items-center gap-1`}>
            <Icon icon="send" className="text-xs" aria-hidden="true" />
            ส่งคำขอแล้ว
          </span>
          <Row label="เลขคำขอ">
            {result.ticketPickupId ? (
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums">{result.ticketPickupId}</span>
                <button type="button" onClick={() => void copyId(result.ticketPickupId!)}
                  aria-label="คัดลอกเลขคำขอ" className="btn btn-icon min-h-11 min-w-11 lg:min-h-0 lg:min-w-0">
                  <Icon icon="copy" className="text-base" />
                </button>
              </span>
            ) : '—'}
          </Row>
          {result.staffName || result.staffPhone ? (
            <>
              <Row label="คนขับ">{result.staffName ?? '—'}</Row>
              <Row label="เบอร์คนขับ">
                {result.staffPhone ? (
                  <a href={`tel:${result.staffPhone.replace(/[^0-9+]/g, '')}`}
                    className="inline-flex min-h-11 items-center gap-1 text-primary-ink underline lg:min-h-0">
                    <Icon icon="phone" className="text-base" aria-hidden="true" />
                    <span className="tabular-nums">{result.staffPhone}</span>
                  </a>
                ) : '—'}
              </Row>
            </>
          ) : (
            <Row label="คนขับ">ยังไม่ระบุ ข้อมูลคนขับจะอัปเดตเมื่อ Flash มอบหมายงาน</Row>
          )}
          {result.timeoutAtText && <Row label="ช่วงเวลาเข้ารับ">{result.timeoutAtText}</Row>}
          {result.ticketMessage && <Row label="ข้อความจาก Flash">{result.ticketMessage}</Row>}
          {errorBox}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => void handleCancel()} disabled={busy}
              className="btn inline-flex items-center justify-center gap-1.5 bg-danger/15 py-2.5 text-danger-ink hover:bg-danger/25 disabled:opacity-60">
              {busy && <span className="inline-block size-4 animate-spin rounded-full border-2 border-danger border-t-transparent" />}
              ยกเลิกคำขอรถ
            </button>
            <button type="button" onClick={onClose} disabled={busy}
              className="btn inline-flex items-center justify-center border border-default-300 py-2.5 text-default-700 disabled:opacity-60">
              ปิด
            </button>
          </div>
        </div>
      )}
    </IShipModalShell>
  )
}
