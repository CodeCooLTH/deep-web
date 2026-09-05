'use client'

/**
 * RoundResultForm — ฟอร์มบันทึกผลตรวจทั้งรอบ (feature 00060 · T13 · UX Design Spec Surface C)
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_card.css (`.card`) + `_forms.css`
 *   (`form-textarea`) — โครงเป็น task flow คอลัมน์เดียว (Operate mode) ไม่ใช่ dashboard
 *
 * 🛑 **ยิงเป็นชุดใน request เดียว (API §4.8) ห้ามยิงทีละข้อ** — บังคับให้ผู้ตรวจเลือกผลของ
 * "ทุกข้อ" ก่อนปุ่ม "บันทึกผลตรวจ" จะกดได้ แล้วยิง POST /results ครั้งเดียว ตามด้วย
 * POST /complete ทันที (การตัดสินใจของ dev: มติ/ม็อกอัพเขียนปุ่มเดียว "บันทึกผลตรวจ" →
 * "batch save → toast → กลับหน้ารายการ" ไม่มีปุ่ม "ปิดรอบ" แยกในมือถือ — 4.9 ต้องการให้ทุกข้อ
 * ของรอบถูกยืนยันแล้วเท่านั้นถึงปิดได้ ⇒ บังคับเลือกครบก่อนเป็นทางเดียวที่ทำให้ "กดปุ่มเดียวจบ"
 * เป็นจริงได้โดยไม่มีสถานะครึ่ง ๆ กลาง ๆ)
 *
 * 🛑 ข้อที่หลักฐานเป็นของสาธารณะจริง (`deep_photo_album`/`video_tour`/`location_exists` —
 * มิเรอร์ `PUBLIC_PAIRS` ของ `src/lib/inspection/evidence-visibility.ts`) ต้องมีหลักฐานแนบก่อน
 * บันทึกผล "ผ่าน" ได้ — ค่าที่ Deep ยืนยันต่อสาธารณะต้องมีหลักฐานรองรับเสมอ
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import type { ApiDisplayStatus } from '@/lib/inspection/result-status'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm, pacesConfirmWithText } from '@/lib/paces-swal'
import OutcomeButtons, { type Outcome } from './OutcomeButtons'
import EvidenceUploadButton, { type UploadKind } from './EvidenceUploadButton'

/**
 * สถานะที่รับเข้ามาใช้ชื่อตามสัญญา HTTP (`ApiDisplayStatus`) — service แปลงจากชื่อภายในให้แล้ว
 */
type DisplayStatus = ApiDisplayStatus

type CheckRow = {
  checkKey: string
  label: string
  scope: 'SHOP' | 'ROOM'
  currentDisplayStatus: DisplayStatus
}

type RoomInfo = {
  id: string
  name: string
  listingImages: string[]
  declaredMaxGuests: number | null
  declaredFacilities: string[]
} | null

type EvidenceEntry =
  | { kind: 'PHOTO' | 'VIDEO_STILL' | 'DOCUMENT'; fileId: string }
  | { kind: 'GEO'; lat: number; lng: number }

type CheckState = { outcome: Outcome | null; note: string; evidence: EvidenceEntry[] }

type Props = {
  roundId: string
  shopName: string
  room: RoomInfo
  /** วิธีตรวจของรอบนี้ — ข้อทุกข้อในรอบเดียวกันมี method เดียวกันเสมอ (§3.2 ช) */
  method: string
  stepLabel: string
  checks: CheckRow[]
  initialFraudNote: string | null
}

const STATUS_META: Record<DisplayStatus, { label: string; cls: string }> = {
  PASS: { label: 'สถานะปัจจุบัน: ผ่าน', cls: 'bg-success/15 text-success-ink' },
  FAIL: { label: 'สถานะปัจจุบัน: ไม่ผ่าน', cls: 'bg-danger/15 text-danger-ink' },
  RECHECK_DUE: { label: 'สถานะปัจจุบัน: รอตรวจซ้ำ', cls: 'bg-warning/15 text-warning-ink' },
  NO_DATA: { label: 'ยังไม่มีข้อมูล', cls: 'bg-default-100 text-default-700' },
  NOT_APPLICABLE: { label: 'ไม่เกี่ยวข้อง', cls: 'bg-default-100 text-default-700' },
}

/** มิเรอร์ `PUBLIC_PAIRS` ของ `src/lib/inspection/evidence-visibility.ts` (อ่านอย่างเดียว ห้ามแก้
 * ไฟล์นั้น) — 3 คีย์นี้คือคีย์ที่ "ตัวหลักฐาน" ถูกแสดงต่อสาธารณะ ไม่ใช่แค่ผลผ่าน/ไม่ผ่าน */
const PUBLIC_EVIDENCE_KEYS = new Set(['deep_photo_album', 'video_tour', 'location_exists'])

function evidenceKindFor(checkKey: string, method: string): UploadKind | 'GEO' {
  if (checkKey === 'location_exists') return 'GEO'
  if (checkKey === 'video_tour') return 'VIDEO_STILL'
  if (method === 'DOCUMENT') return 'DOCUMENT'
  return 'PHOTO'
}

export default function RoundResultForm({ roundId, shopName, room, method, stepLabel, checks, initialFraudNote }: Props) {
  const router = useRouter()

  const [state, setState] = useState<Record<string, CheckState>>(() =>
    Object.fromEntries(checks.map((c) => [c.checkKey, { outcome: null, note: '', evidence: [] }])),
  )
  const [fraudNote, setFraudNote] = useState<string | null>(initialFraudNote)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // เคยกดบันทึกแล้วหรือยัง — ใช้ตัดสินว่าจะไฮไลต์ข้อที่ยังไม่ได้ตอบไหม
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const setOutcome = (checkKey: string, outcome: Outcome) =>
    setState((s) => ({ ...s, [checkKey]: { ...s[checkKey], outcome } }))
  const setNote = (checkKey: string, note: string) =>
    setState((s) => ({ ...s, [checkKey]: { ...s[checkKey], note } }))
  const addEvidence = (checkKey: string, entry: EvidenceEntry) =>
    setState((s) => ({ ...s, [checkKey]: { ...s[checkKey], evidence: [...s[checkKey].evidence, entry] } }))
  const removeEvidence = (checkKey: string, idx: number) =>
    setState((s) => ({ ...s, [checkKey]: { ...s[checkKey], evidence: s[checkKey].evidence.filter((_, i) => i !== idx) } }))

  const handlePin = (checkKey: string) => {
    if (!('geolocation' in navigator)) {
      pacesToast.error('อุปกรณ์นี้ไม่รองรับการปักหมุดตำแหน่ง')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        addEvidence(checkKey, { kind: 'GEO', lat: pos.coords.latitude, lng: pos.coords.longitude })
        pacesToast.success('ปักหมุดตำแหน่งแล้ว')
      },
      () => pacesToast.error('ปักหมุดไม่สำเร็จ — กรุณาอนุญาตการเข้าถึงตำแหน่งแล้วลองใหม่'),
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const handleReportFraud = async () => {
    const confirmed = await pacesConfirm.danger(
      'ยืนยันรายงานหลักฐานฉ้อโกง?',
      'ข้อมูลจะถูกส่งเข้ากระบวนการตรวจสอบมิจฉาชีพของ Deep',
    )
    if (!confirmed) return
    const text = await pacesConfirmWithText({
      title: 'รายละเอียดที่พบ',
      placeholder: 'อธิบายสิ่งที่เห็นซึ่งเข้าข่ายฉ้อโกง',
      validationMessage: 'กรุณาอธิบายรายละเอียดก่อนยืนยัน',
      maxLength: 2000,
      confirmButtonText: 'บันทึก',
    })
    if (text === null) return
    setFraudNote(text)
    pacesToast.success('บันทึกความสงสัยไว้แล้ว — จะถูกส่งไปพร้อมผลตรวจ')
  }

  const allAnswered = checks.every((c) => state[c.checkKey]?.outcome !== null)
  const missingEvidenceKeys = checks.filter(
    (c) =>
      PUBLIC_EVIDENCE_KEYS.has(c.checkKey) &&
      state[c.checkKey]?.outcome === 'PASS' &&
      state[c.checkKey]?.evidence.length === 0,
  )

  const handleSubmit = async () => {
    setSubmitAttempted(true)
    setFormError(null)
    if (!allAnswered) {
      setFormError('เลือกผลของทุกข้อก่อนบันทึก')
      return
    }
    if (missingEvidenceKeys.length > 0) {
      setFormError('ต้องแนบหลักฐานก่อนบันทึกผล "ผ่าน" ของบางข้อ — ดูคำเตือนสีแดงในรายการด้านล่าง')
      return
    }

    setSubmitting(true)
    try {
      const results = checks.map((c) => {
        const s = state[c.checkKey]
        const evidence = s.evidence.map((e) =>
          e.kind === 'GEO' ? { kind: 'GEO' as const, lat: e.lat, lng: e.lng } : { kind: e.kind, fileId: e.fileId },
        )
        return {
          checkKey: c.checkKey,
          outcome: s.outcome as Outcome,
          note: s.note.trim() === '' ? undefined : s.note.trim(),
          evidence: evidence.length > 0 ? evidence : undefined,
        }
      })

      const saveRes = await fetch(`/api/inspector/rounds/${roundId}/results`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ results, ...(fraudNote ? { suspectedFraudNote: fraudNote } : {}) }),
      })
      const saveData = (await saveRes.json().catch(() => null)) as { message?: string } | null
      if (!saveRes.ok) throw new Error(saveData?.message ?? 'บันทึกผลตรวจไม่สำเร็จ ลองใหม่อีกครั้ง')

      const completeRes = await fetch(`/api/inspector/rounds/${roundId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const completeData = (await completeRes.json().catch(() => null)) as { message?: string } | null
      if (!completeRes.ok) {
        // บันทึกผลสำเร็จแล้ว แค่ปิดรอบไม่สำเร็จ — ข้อมูลไม่หาย กลับมากดบันทึกซ้ำเพื่อปิดรอบได้
        throw new Error(completeData?.message ?? 'บันทึกผลสำเร็จแล้ว แต่ปิดรอบไม่สำเร็จ กรุณาลองกดบันทึกอีกครั้ง')
      }

      pacesToast.success('บันทึกผลตรวจสำเร็จ')
      router.push('/inspector')
      router.refresh()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 p-4 pb-28">
      <div className="card">
        <div className="card-body">
          <p className="text-sm font-bold text-default-900">{shopName}</p>
          {room && <p className="mt-0.5 text-xs text-default-600">{room.name} · {stepLabel}</p>}
          {!room && <p className="mt-0.5 text-xs text-default-600">{stepLabel}</p>}

          {room && room.listingImages.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-2xs font-medium text-default-500">
                ภาพประกาศปัจจุบัน — ใช้เทียบกับสภาพจริง
              </p>
              <div className="flex gap-2 overflow-x-auto">
                {room.listingImages.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${src}-${i}`}
                    src={src}
                    alt=""
                    className="size-16 shrink-0 rounded-lg border border-default-200 object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {room && (room.declaredMaxGuests !== null || room.declaredFacilities.length > 0) && (
            <p className="mt-2 text-2xs text-default-500">
              ประกาศไว้:
              {room.declaredMaxGuests !== null && ` รับได้สูงสุด ${room.declaredMaxGuests} คน`}
              {room.declaredFacilities.length > 0 && ` · สิ่งอำนวยความสะดวก: ${room.declaredFacilities.join(', ')}`}
            </p>
          )}
        </div>
      </div>

      {checks.map((c) => {
        const s = state[c.checkKey]
        const kind = evidenceKindFor(c.checkKey, method)
        const missing = missingEvidenceKeys.some((m) => m.checkKey === c.checkKey)
        // ข้อที่ยังไม่ได้เลือกผล ต้อง **มองเห็นได้** หลังกดบันทึกแล้วไม่ผ่าน — ไม่ใช่ให้ผู้ตรวจ
        // เลื่อนหาเองว่าลืมข้อไหนในรอบที่มีได้ถึง 6 ข้อ
        const unanswered = submitAttempted && s.outcome === null
        return (
          <div
            key={c.checkKey}
            className={cn('card', unanswered && 'border border-danger')}
          >
            <div className="card-body space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold text-default-900">{c.label}</p>
                <span className={`badge shrink-0 ${STATUS_META[c.currentDisplayStatus].cls}`}>
                  {STATUS_META[c.currentDisplayStatus].label}
                </span>
              </div>

              <OutcomeButtons value={s.outcome} onChange={(v) => setOutcome(c.checkKey, v)} />

              <div className="flex flex-wrap items-center gap-2">
                {kind === 'GEO' ? (
                  <button
                    type="button"
                    onClick={() => handlePin(c.checkKey)}
                    className="btn btn-sm inline-flex items-center gap-1.5 border border-default-300 text-default-800"
                  >
                    <Icon icon="map-pin" className="size-3.5" aria-hidden="true" />
                    ปักหมุดตำแหน่งปัจจุบัน
                  </button>
                ) : (
                  <EvidenceUploadButton
                    label="แนบรูปหลักฐาน"
                    kind={kind}
                    multiple={c.checkKey === 'deep_photo_album'}
                    onUploaded={(fileId) => addEvidence(c.checkKey, { kind, fileId })}
                  />
                )}
                {s.evidence.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success-ink">
                    <Icon icon="circle-check" className="size-3.5" aria-hidden="true" />
                    แนบแล้ว {s.evidence.length} รายการ
                  </span>
                )}
              </div>

              {s.evidence.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {s.evidence.map((e, idx) => (
                    <span
                      key={idx}
                      className="badge inline-flex items-center gap-1 bg-default-100 text-default-700"
                    >
                      {e.kind === 'GEO' ? `พิกัด ${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}` : `ไฟล์ #${idx + 1}`}
                      <button
                        type="button"
                        onClick={() => removeEvidence(c.checkKey, idx)}
                        aria-label="ลบหลักฐานนี้"
                        className="ms-0.5"
                      >
                        <Icon icon="x" className="size-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {missing && (
                <p className="text-xs font-medium text-danger-ink">ต้องแนบหลักฐานก่อนบันทึกผล &quot;ผ่าน&quot; ของข้อนี้</p>
              )}

              <textarea
                value={s.note}
                onChange={(e) => setNote(c.checkKey, e.target.value)}
                placeholder="โน้ต (ไม่บังคับ)"
                maxLength={2000}
                rows={2}
                className="form-textarea text-sm"
              />
            </div>
          </div>
        )
      })}

      {fraudNote && (
        <div className="card border-danger">
          <div className="card-body flex items-start gap-2">
            <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-danger-ink">บันทึกความสงสัยเรื่องฉ้อโกงไว้แล้ว</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-default-600">{fraudNote}</p>
              <p className="mt-1 text-2xs text-default-500">จะถูกส่งไปพร้อมกับการบันทึกผลตรวจ</p>
            </div>
          </div>
        </div>
      )}

      {formError && (
        <div className="card border-danger">
          <div className="card-body text-sm text-danger-ink">{formError}</div>
        </div>
      )}

      {/* แถบปุ่มล่างสุด — ยึดโซนนิ้วโป้ง (safe-area รับที่ (paces)/layout.tsx) */}
      <div
        className="bg-body-bg fixed inset-x-0 bottom-0 z-20 space-y-2 border-t border-dashed border-default-300 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]" /* carve-out: safe-area ไม่มี token */
      >
        <button
          type="button"
          onClick={() => void handleReportFraud()}
          className="btn btn-sm w-full border border-danger text-danger hover:bg-danger hover:text-white"
        >
          <Icon icon="alert-triangle" className="size-4" aria-hidden="true" />
          รายงานหลักฐานฉ้อโกง
        </button>
        {/* 🛑 ปุ่มต้องกดได้เสมอ (ยกเว้นระหว่างส่ง) — เดิม `disabled={!canSubmit}` ทำให้ผู้ตรวจที่ยืน
            อยู่หน้างานแล้วลืมข้อเดียวใน 6 ข้อ เจอปุ่มดับสนิท **ไม่มีข้อความบอกว่าทำไม** และบรรทัด
            ที่ควรบอก (`handleSubmit` ต้นฟังก์ชัน) กลายเป็นโค้ดที่ไม่มีวันทำงาน ⇒ บันทึกงานทั้งรอบ
            ไม่ได้และไม่รู้สาเหตุ · ให้กดได้แล้วให้ตัว handler เป็นคนบอกว่าขาดอะไร */}
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSubmit()}
          className="btn w-full bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {submitting ? (
            <Icon icon="loader-2" className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Icon icon="device-floppy" className="size-4" aria-hidden="true" />
          )}
          บันทึกผลตรวจ
        </button>
      </div>
    </div>
  )
}
