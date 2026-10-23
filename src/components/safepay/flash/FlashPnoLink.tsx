'use client'

/**
 * FlashPnoLink — ส่วน "ตรวจเลขพัสดุก่อน แล้วค่อยยืนยันผูก" (Design-Spec §4.7 ข้อ ①)
 *
 * ใช้ร่วม 2 ที่: FlashLinkPanel (ผูกใบที่ร้านเปิดไว้ที่ Flash) และ FlashReviewPanel (ทางออกของ 1003)
 * ต่างกันแค่ปลายทางที่ยิงตอนยืนยัน จึงรับเป็น `confirmRequest` ไม่แยกคอมโพเนนต์สองชุด
 *
 * 🛑 ปุ่มยืนยันไม่ปรากฏจนกว่าตรวจเลข "ตัวที่พิมพ์อยู่ตอนนี้" ผ่าน (pnoStep) — กันผูกผิดใบ (บทเรียน 00022)
 * ตัวอย่างจาก Flash ไม่มีชื่อผู้รับ จึงบอกให้ร้านเทียบกับ Flash Printer เอง ไม่เขียนว่าตรวจชื่อให้แล้ว
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (form-input + form-label)
 *       + theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (กล่องตัวอย่าง/ข้อผิดพลาด)
 */

import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTime } from '@/lib/format-date'
import { describeCarrierStatus } from '@/lib/iship/status'
import { linkErrorText, pnoFormatError, pnoStep } from '@/lib/shipping/flash-order-ui'
import { useIShipUrl } from '@/components/safepay/iship/iship-shop-context'
import { TONE_BADGE, NOTICE_BOX } from '@/components/safepay/iship/tone'
import type { ShipmentFooterReporter } from '@/components/safepay/iship/shipment-footer'
import type { ShipmentViewJson } from '@/lib/iship/context'
import { readApiError } from './flash-api'

interface Preview {
  pno: string
  carrierStatus: string | null
  carrierStatusText: string | null
  stateText: string | null
  routes: { at: string | null; message: string }[]
}

interface Props {
  /** ปลายทางตอนยืนยันผูก — link: POST /shipments/link · review: POST /shipments/[id]/resolve (LINK_PNO) */
  confirmRequest: (pno: string) => { path: string; body: unknown }
  onLinked: (shipment: ShipmentViewJson) => void
  /** id ของ <form> — ให้ปุ่มยืนยันไปอยู่ footer ของโมดัลผ่าน attribute form= */
  formId?: string
  hideSubmit?: boolean
  onFooterChange?: ShipmentFooterReporter
  /** แจ้งผู้เรียกว่ากำลังยิงคำขอ (ให้ปิดทางเลือกอื่นระหว่างทาง) */
  onBusyChange?: (busy: boolean) => void
}

export default function FlashPnoLink({
  confirmRequest,
  onLinked,
  formId,
  hideSubmit = false,
  onFooterChange,
  onBusyChange,
}: Props) {
  const flashUrl = useIShipUrl()
  const [pno, setPno] = useState('')
  const [previewedPno, setPreviewedPno] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [checking, setChecking] = useState(false)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step = pnoStep({ pno, previewedPno, checking })

  useEffect(() => {
    onBusyChange?.(checking || linking)
  }, [onBusyChange, checking, linking])

  // ปุ่มยืนยันขึ้น footer เฉพาะเมื่อตรวจผ่านแล้ว — ก่อนหน้านั้น footer เหลือแค่ "ปิด"
  useEffect(() => {
    if (!onFooterChange || !formId || step !== 'ready') return
    onFooterChange({ formId, label: 'ยืนยันผูกเลขนี้', icon: 'tabler:link', busy: linking })
    return () => onFooterChange(null)
  }, [onFooterChange, formId, step, linking])

  async function check() {
    if (checking || linking) return
    const formatError = pnoFormatError(pno)
    if (formatError) {
      setError(formatError)
      return
    }
    const target = pno.trim()
    setError(null)
    setPreview(null)
    setPreviewedPno(null)
    setChecking(true)
    try {
      const res = await fetch(flashUrl(`/api/seller/flash/shipments/preview?pno=${encodeURIComponent(target)}`), {
        cache: 'no-store',
      })
      if (!res.ok) {
        const e = await readApiError(res)
        setError(linkErrorText(res.status, e.code, e.message))
        return
      }
      const data = (await res.json()) as {
        pno: string
        carrierStatus: string | null
        carrierStatusText: string | null
        stateText: string | null
        routes: { at: string | null; message: string }[]
      }
      setPreview({ ...data, routes: (data.routes ?? []).slice(0, 3) })
      setPreviewedPno(target)
    } catch {
      setError(linkErrorText(504, 'UPSTREAM_TIMEOUT'))
    } finally {
      setChecking(false)
    }
  }

  async function link() {
    if (linking || step !== 'ready') return
    setError(null)
    setLinking(true)
    try {
      const { path, body } = confirmRequest(pno.trim())
      const res = await fetch(flashUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      if (!res.ok) {
        const e = await readApiError(res)
        setError(linkErrorText(res.status, e.code, e.message))
        return
      }
      const shipment = (await res.json()) as ShipmentViewJson
      pacesToast.success('ผูกพัสดุแล้ว')
      onLinked(shipment)
    } catch {
      setError('ผูกเลขพัสดุไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLinking(false)
    }
  }

  const meta = preview ? describeCarrierStatus(preview.carrierStatus) : null

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault()
        // Enter = ตรวจเลข จนกว่าจะตรวจผ่าน แล้วจึงกลายเป็นยืนยันผูก
        void (step === 'ready' ? link() : check())
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <label className="form-label" htmlFor="flash-pno">
          เลขพัสดุ Flash (pno)
        </label>
        <div className="flex gap-2">
          <input
            id="flash-pno"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={`form-input tabular-nums${error ? ' is-invalid' : ''}`}
            placeholder="TH0123456789"
            aria-describedby={error ? 'flash-pno-err' : undefined}
            value={pno}
            onChange={(e) => {
              setPno(e.target.value)
              setError(null)
            }}
          />
          <button
            type="button"
            onClick={() => void check()}
            disabled={checking || linking || pno.trim() === ''}
            className="btn inline-flex min-h-11 shrink-0 items-center gap-1.5 border border-default-300 bg-card text-sm text-default-700 hover:bg-default-50 disabled:opacity-60"
          >
            {checking ? (
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-default-400 border-t-transparent" />
            ) : (
              <Icon icon="tabler:search" className="text-base" aria-hidden="true" />
            )}
            {checking ? 'กำลังตรวจ…' : 'ตรวจเลขนี้'}
          </button>
        </div>
        {error && (
          <p id="flash-pno-err" role="alert" className="mb-0 mt-1.5 text-xs text-danger-ink">
            {error}
          </p>
        )}
      </div>

      {preview && meta && step === 'ready' && (
        <div className="rounded-lg border border-default-200 p-3">
          <p className="text-default-700 mb-2 text-xs font-semibold">ตัวอย่างจาก Flash</p>
          <p className="mb-2 flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-bold tabular-nums text-default-900">{preview.pno}</span>
            <span className={TONE_BADGE[meta.tone] ?? TONE_BADGE.secondary}>
              {preview.carrierStatusText ?? preview.stateText ?? meta.text}
            </span>
          </p>
          {preview.routes.length > 0 ? (
            <ul className="mb-0 flex list-none flex-col gap-1 ps-0">
              {preview.routes.map((r, i) => (
                <li key={`${r.at ?? ''}-${i}`} className="text-default-700 flex gap-2 text-xs">
                  <span className="w-28 shrink-0 tabular-nums">{r.at ? formatDateTime(r.at) : '—'}</span>
                  <span className="min-w-0 flex-1">{r.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-default-700 mb-0 text-xs">ยังไม่มีเส้นทางที่ Flash บันทึก</p>
          )}
          <p className={`mb-0 mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs ${NOTICE_BOX.info}`}>
            <Icon icon="tabler:info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            เทียบกับพัสดุที่เห็นใน Flash Printer ก่อนกดยืนยัน
          </p>
        </div>
      )}

      {step === 'ready' && !hideSubmit && (
        <button
          type="submit"
          disabled={linking}
          className="btn inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {linking ? (
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Icon icon="tabler:link" className="text-base" aria-hidden="true" />
          )}
          ยืนยันผูกเลขนี้
        </button>
      )}
    </form>
  )
}
