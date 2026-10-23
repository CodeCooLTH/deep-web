'use client'

/**
 * FlashWebhookBlock — ส่วน "การรับแจ้งสถานะจาก Flash" ในโมดัลเชื่อมต่อ (Design-Spec §3.6)
 *
 * ท่าเริ่มต้นปลอดภัย: "คงเดิม" ไม่มีปุ่มบันทึก — ทับระบบเดิมของร้านได้ก็ต่อเมื่อเจ้าของเลือก
 * "เปลี่ยนมาใช้ Deep" แล้วยืนยัน Swal เท่านั้น (Flash ตั้งปลายทางได้ชนิดละ 1 ที่)
 * แสดงเฉพาะ host ห้ามโชว์ path/โทเคน
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 *       theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx
 *       settings/ShippingSettingsRow.tsx (radio-card ของ CREATE_MODES)
 */

import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { TONE_BADGE, NOTICE_BOX } from '@/components/safepay/iship/tone'
import {
  KIND_LABEL,
  flashKindBadge,
  webhookBlockState,
  type WebhookKindRow,
} from '@/lib/shipping/flash-settings-view'
import type { FlashConnectionView, FlashWebhookReport } from '@/services/flash.service'
import { flashFetch } from './flash-fetch'

interface Props {
  isOwner: boolean
  webhookStatus: FlashConnectionView['webhook']['status']
  /** รายงานที่ได้มาแล้ว (เช่น ตอบกลับของการเชื่อม) — ไม่มี = อ่านเองเมื่อเป็น EXTERNAL */
  initialReport: FlashWebhookReport | null
  onConnection: (c: FlashConnectionView) => void
  onBusy: (busy: boolean) => void
}

export default function FlashWebhookBlock({
  isOwner,
  webhookStatus,
  initialReport,
  onConnection,
  onBusy,
}: Props) {
  const [report, setReport] = useState(initialReport)
  const [loadError, setLoadError] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [choice, setChoice] = useState<'keep' | 'override'>('keep')
  // เก็บชนิดที่ "ติ๊กออก" แทนชนิดที่ติ๊ก — ค่าเริ่มต้นคือติ๊กครบโดยไม่ต้องใช้ effect ตั้งค่า
  const [unchecked, setUnchecked] = useState<string[]>([])

  const status = report?.status ?? webhookStatus
  const state = webhookBlockState(status, report?.kinds ?? null, isOwner)

  async function sync(overrideKinds?: string[]) {
    setSyncing(true)
    onBusy(true)
    setLoadError(false)
    try {
      const res = await flashFetch('/webhook/sync', 'POST', overrideKinds ? { overrideKinds } : {})
      if (!res.ok) {
        setLoadError(true)
        return false
      }
      const body = (await res.json()) as { connection: FlashConnectionView; webhook: FlashWebhookReport }
      setReport(body.webhook)
      onConnection(body.connection)
      setChoice('keep')
      setUnchecked([])
      return true
    } catch {
      setLoadError(true)
      return false
    } finally {
      setSyncing(false)
      onBusy(false)
    }
  }

  // เจ้าของเปิดโมดัลตอนมีชนิดไปที่อื่น: อ่านรายชนิดครั้งเดียว (route เป็น OWNER-only จึงไม่ยิงให้คนอื่น)
  const needsLoad = state.kind === 'loading'
  useEffect(() => {
    if (!needsLoad) return
    void sync()
    // sync เป็น closure ใหม่ทุก render — ตั้งใจให้รันตามค่า needsLoad เท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLoad])

  async function applyOverride(rows: WebhookKindRow[]) {
    const picked = rows.filter((k) => !unchecked.includes(k.kind))
    if (picked.length === 0) {
      pacesToast.warning('เลือกอย่างน้อย 1 ชนิดที่จะเปลี่ยนมาใช้ Deep')
      return
    }
    const hosts = [...new Set(picked.map((k) => k.host).filter(Boolean))].join(', ') || 'ระบบเดิม'
    const ok = await pacesConfirm.warning(
      'เปลี่ยนที่รับแจ้งสถานะมาใช้ Deep?',
      `${picked.map((k) => KIND_LABEL[k.kind]).join(', ')} จะส่งมาที่ Deep แทน ${hosts} ระบบเดิมจะหยุดได้รับข้อมูลชนิดนี้จาก Flash ระบบจะบันทึกชื่อคุณและเวลาที่เปลี่ยน`,
      { confirmButtonText: 'เปลี่ยนมาใช้ Deep', cancelButtonText: 'คงเดิม' },
    )
    if (!ok) return
    if (await sync(picked.map((k) => k.kind))) pacesToast.success('เปลี่ยนที่รับแจ้งสถานะมาใช้ Deep แล้ว')
  }

  return (
    <section aria-labelledby="flash-webhook-h" className="border-t border-default-200 pt-4">
      <h6 id="flash-webhook-h" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-default-900">
        <Icon icon="world" className="text-base" aria-hidden="true" />
        การรับแจ้งสถานะจาก Flash
      </h6>

      {state.kind === 'deep' && (
        <p className={`mb-0 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.info}`}>
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          ตั้งรับแจ้งสถานะแล้ว Flash ส่งสถานะ เส้นทาง น้ำหนัก ราคา และข้อมูลคนขับมาที่ Deep ทันที
        </p>
      )}

      {state.kind === 'unset' && (
        <>
          <p className={`mb-0 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}>
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            ยังไม่ได้ตั้งรับแจ้งสถานะ ระบบจะเช็คเองทุก 15 นาที
          </p>
          {isOwner && (
            <button
              type="button"
              onClick={() => void sync()}
              disabled={syncing}
              className="btn btn-sm mt-3 inline-flex items-center gap-1.5 border border-default-300 py-2.5 disabled:opacity-60"
            >
              {syncing ? (
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Icon icon="refresh" className="text-base" aria-hidden="true" />
              )}
              ลองตั้งใหม่
            </button>
          )}
        </>
      )}

      {state.kind === 'summary-external' && (
        <p className={`mb-0 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}>
          <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          Flash ส่งสถานะบางชนิดไปที่ระบบอื่นอยู่ ระบบจะเช็คเองทุก 15 นาที
        </p>
      )}

      {state.kind === 'loading' &&
        (loadError ? (
          <div className={`rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}>
            <p className="mb-2 flex items-start gap-2">
              <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
              อ่านสถานะการรับแจ้งจาก Flash ไม่ได้ตอนนี้
            </p>
            <button
              type="button"
              onClick={() => void sync()}
              className="btn btn-sm inline-flex items-center gap-1.5 border border-default-300 bg-card py-2.5"
            >
              <Icon icon="refresh" className="text-base" aria-hidden="true" />
              ลองใหม่
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2" role="status" aria-label="กำลังอ่านสถานะการรับแจ้งจาก Flash">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-default-200" />
            ))}
          </div>
        ))}

      {state.kind === 'external' && (
        <>
          <p className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}>
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            บางชนิดส่งไประบบอื่นอยู่ ระบบเช็คสถานะให้เองทุก 15 นาทีสำหรับชนิดที่ไม่ได้ส่งมาที่ Deep
          </p>
          <ul className="mb-3 flex list-none flex-col gap-1.5 p-0">
            {state.rows.map((k) => {
              const b = flashKindBadge(k)
              return (
                <li key={k.kind} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="text-default-700">{KIND_LABEL[k.kind]}</span>
                  <span className={`${TONE_BADGE[b.tone]} max-w-full truncate`}>{b.text}</span>
                </li>
              )
            })}
          </ul>

          {state.overridable.length > 0 && (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={syncing}>
              <legend className="sr-only">เลือกวิธีรับแจ้งสถานะ</legend>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  choice === 'keep' ? 'border-primary bg-primary/10' : 'border-default-200'
                }`}
              >
                <input
                  type="radio"
                  name="flash-webhook-choice"
                  className="form-radio mt-0.5"
                  checked={choice === 'keep'}
                  onChange={() => setChoice('keep')}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-default-800">
                    คงเดิม (เช็คอัตโนมัติทุก 15 นาที)
                  </span>
                  <span className="mt-0.5 block text-xs text-default-500">
                    ระบบเดิมของคุณรับแจ้งต่อได้เหมือนเดิม สถานะใน Deep อัปเดตช้ากว่าเล็กน้อย
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  choice === 'override' ? 'border-primary bg-primary/10' : 'border-default-200'
                }`}
              >
                <input
                  type="radio"
                  name="flash-webhook-choice"
                  className="form-radio mt-0.5"
                  checked={choice === 'override'}
                  onChange={() => setChoice('override')}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-default-800">เปลี่ยนมาใช้ Deep</span>
                  <span className="mt-0.5 block text-xs text-default-500">
                    Deep รับแจ้งสถานะทันที แต่ระบบเดิมจะหยุดได้รับข้อมูลชนิดที่เลือก
                  </span>
                </span>
              </label>

              {choice === 'override' && (
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {state.overridable.map((k) => (
                      <label key={k.kind} className="flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
                        <input
                          type="checkbox"
                          className="form-checkbox"
                          checked={!unchecked.includes(k.kind)}
                          onChange={(e) =>
                            setUnchecked((u) => (e.target.checked ? u.filter((x) => x !== k.kind) : [...u, k.kind]))
                          }
                        />
                        {KIND_LABEL[k.kind]}
                      </label>
                    ))}
                  </div>
                  <p className={`mb-0 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}>
                    <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
                    ระบบที่รับแจ้งสถานะอยู่ตอนนี้ (
                    {[...new Set(state.overridable.map((k) => k.host).filter(Boolean))].join(', ') || 'ระบบเดิม'})
                    จะหยุดได้รับข้อมูลจาก Flash ทันที Flash ตั้งปลายทางได้ชนิดละ 1 ที่
                  </p>
                  <button
                    type="button"
                    onClick={() => void applyOverride(state.overridable)}
                    disabled={syncing}
                    className="btn inline-flex items-center justify-center gap-2 border border-default-300 py-2.5 disabled:opacity-60"
                  >
                    {syncing && (
                      <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    )}
                    เปลี่ยนมาใช้ Deep
                  </button>
                </div>
              )}
            </fieldset>
          )}
        </>
      )}

      {!isOwner && (
        <p className="mb-0 mt-3 flex items-center gap-2 text-xs text-default-600">
          <Icon icon="lock" className="shrink-0 text-base" aria-hidden="true" />
          เจ้าของร้านเป็นผู้ตั้งค่านี้
        </p>
      )}
    </section>
  )
}
