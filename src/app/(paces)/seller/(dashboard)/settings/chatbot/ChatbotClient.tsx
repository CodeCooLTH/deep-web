'use client'

/**
 * ChatBot — สวิตช์หลัก + ช่วงเวลา + น้ำเสียง + กฎห้ามตอบ + option ขัดเกลา Auto Reply + เพดาน
 * feature 00023 · phase `00023-ai-enhance`
 *
 * Base: settings/auto-reply/[id]/KeywordEditorClient.tsx (.card / form-switch / pacesToast) +
 * qna/QnaListingClient.tsx (รายการ divide-y + ปุ่มลบต่อแถว)
 * (ไฟล์ ai/AiEnhanceClient.tsx ที่เคยเป็นต้นแบบถูกลบแล้วตอนย้ายทุกอย่างมาเมนูนี้ —
 *   รายการกฎ divide-y + ปุ่มลบต่อแถว) — ยกโครงมาทั้งชุด เปลี่ยนแค่ปลายทาง API เป็นระดับร้าน
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'

export type GuardrailRow = {
  id: string
  rule: string
  denyPhrases: string[]
  isFromDefaultSet: boolean
  isActive: boolean
}

export type ChatbotConfig = {
  aiChatbotStatus: string
  aiChatbotEnabled: boolean
  aiChatbotTone: string | null
  aiChatbotStartTime: string | null
  aiChatbotEndTime: string | null
  aiEnhanceEnabled: boolean
  aiDailyCapBaht: number
  aiCapAlertSmsOptIn: boolean
}

type Props = {
  canEdit: boolean
  initialConfig: ChatbotConfig
  initialGuardrails: GuardrailRow[]
  walletBalance: number
  /** จำนวนข้อในคลังความรู้ที่ใช้งานอยู่ — ChatBot อ่านจากคลังนี้ ถ้าว่างก็ตอบอะไรไม่ได้ */
  knowledgeCount: number
}

/** 3 สถานะ — คำเดียวกับกลุ่มคำของ Auto Reply เพื่อไม่ให้ร้านต้องเรียนความหมายใหม่ */
const STATUS_OPTIONS = [
  { key: 'OFFLINE', label: 'ไม่ใช้งาน', hint: 'ไม่ทำงานเลย' },
  { key: 'TEST', label: 'ทดสอบ', hint: 'ตอบเฉพาะแชทที่เลือกไว้' },
  { key: 'LIVE', label: 'เปิดใช้งาน', hint: 'ตอบลูกค้าจริงทุกคน' },
] as const

const TONE_PRESETS = [
  'สุภาพ เป็นกันเอง อ่านง่าย',
  'สั้น กระชับ ตรงประเด็น',
  'เป็นทางการ น่าเชื่อถือ',
  'อบอุ่น ใส่ใจ เหมือนคุยกับเพื่อน',
]

export default function ChatbotClient({
  canEdit,
  initialConfig,
  initialGuardrails,
  walletBalance,
  knowledgeCount,
}: Props) {
  const router = useRouter()
  const [cfg, setCfg] = useState(initialConfig)
  const [rules, setRules] = useState(initialGuardrails)
  const [newRule, setNewRule] = useState('')
  const [tone, setTone] = useState(initialConfig.aiChatbotTone ?? '')
  const [savedTone, setSavedTone] = useState(initialConfig.aiChatbotTone ?? '')
  const [busy, setBusy] = useState(false)

  async function readError(res: Response, fallback: string) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? fallback
  }

  /** เขียนค่าเดียวลง config ระดับร้าน — optimistic + ย้อนกลับเมื่อ API ล้ม */
  async function patch(partial: Partial<ChatbotConfig>, successMsg?: string) {
    if (!canEdit || busy) return
    const prev = cfg
    setCfg({ ...cfg, ...partial })
    setBusy(true)
    try {
      const res = await fetch('/api/shops/auto-reply/chatbot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      if (!res.ok) throw new Error(await readError(res, 'บันทึกไม่สำเร็จ'))
      if (successMsg) pacesToast.success(successMsg)
      // เปิดสวิตช์หลักครั้งแรก server จะใส่กฎเริ่มต้นให้ — ดึงรายการจริงมาแสดง
      if (partial.aiChatbotStatus && partial.aiChatbotStatus !== 'OFFLINE') router.refresh()
    } catch (e) {
      setCfg(prev)
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function addRule() {
    const rule = newRule.trim()
    if (!canEdit || busy || !rule) return
    setBusy(true)
    try {
      const res = await fetch('/api/shops/auto-reply/chatbot/guardrails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule }),
      })
      if (!res.ok) throw new Error(await readError(res, 'เพิ่มกฎไม่สำเร็จ'))
      setNewRule('')
      pacesToast.success('เพิ่มกฎแล้ว')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เพิ่มกฎไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function toggleRule(row: GuardrailRow) {
    if (!canEdit) return
    const next = !row.isActive
    setRules((p) => p.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)))
    try {
      const res = await fetch(`/api/shops/auto-reply/chatbot/guardrails/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      if (!res.ok) throw new Error(await readError(res, 'บันทึกไม่สำเร็จ'))
    } catch (e) {
      setRules((p) => p.map((r) => (r.id === row.id ? { ...r, isActive: row.isActive } : r)))
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  async function removeRule(row: GuardrailRow) {
    if (!canEdit || busy) return
    const ok = await pacesConfirm.danger('ลบกฎข้อนี้?', 'ลบแล้วจะไม่กลับมาอีก แม้ระบบจะอัปเดตชุดกฎเริ่มต้นในอนาคต', {
      confirmButtonText: 'ลบ',
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/shops/auto-reply/chatbot/guardrails/${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'ลบไม่สำเร็จ'))
      pacesToast.success('ลบกฎแล้ว')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const status = cfg.aiChatbotStatus
  const on = status !== 'OFFLINE'

  return (
    <div className="space-y-4">
      {/* ── สวิตช์หลัก ── */}
      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 flex items-center gap-2 text-base font-semibold">
              <span className="bg-primary/15 text-primary flex size-8 flex-none items-center justify-center rounded-lg">
                <Icon icon="robot" className="size-4.5" aria-hidden="true" />
              </span>
              ตอบคำถามที่ Auto Reply ไม่รับ
            </h5>
            <p className="text-default-700 mt-1 text-xs">
              ข้อความที่ไม่ตรงเงื่อนไขไหนเลยจะเงียบไป — เปิดแล้ว AI จะอ่านคลังความรู้แล้วตอบให้แทน
              <br />
              <strong>คำตอบที่คุณตั้งไว้เองยังมาก่อนเสมอ</strong> AI ได้เฉพาะคำถามที่ไม่มีใครรับ
            </p>
          </div>
        </div>
        <div className="card-body">
          {/* segmented 3 สถานะ — Base InboxList.tsx (พื้น bg-light ตัว active เป็นการ์ดยกขึ้น) */}
          <div className="bg-light flex w-full items-center gap-0.5 rounded-lg p-1" role="tablist" aria-label="สถานะ ChatBot">
            {STATUS_OPTIONS.map((o) => {
              const active = status === o.key
              return (
                <button
                  key={o.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={!canEdit || busy}
                  onClick={() => patch({ aiChatbotStatus: o.key }, `เปลี่ยนเป็น "${o.label}" แล้ว`)}
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-md px-2 py-2 text-sm font-medium ${
                    active ? 'bg-card text-dark font-semibold shadow-sm' : 'text-default-600'
                  }`}
                >
                  {o.label}
                  <span className="text-default-400 text-2xs font-normal">{o.hint}</span>
                </button>
              )
            })}
          </div>
          {status === 'TEST' && (
            <p className="text-default-500 mt-2.5 text-xs">
              โหมดทดสอบตอบเฉพาะแชทที่เลือกไว้ — ยังไม่มีหน้าจอให้เลือก กำลังทำอยู่
              ระหว่างนี้ยังไม่มีแชทไหนถูกเลือก บอทจึงยังไม่ตอบใคร
            </p>
          )}
        </div>
      </div>

      {/* เตือนสภาพที่ทำให้เปิดแล้วไม่ทำงาน — บอกตรง ๆ ดีกว่าให้ไปงงเองว่าทำไมเงียบ */}
      {on && walletBalance <= 0 && (
        <div className="card">
          <div className="card-body flex items-start gap-3">
            <Icon icon="alert-triangle" className="text-warning mt-0.5 size-5 flex-none" aria-hidden="true" />
            <div className="text-sm">
              <p className="text-default-800 font-semibold">เครดิตในกระเป๋าหมด — AI ยังไม่ทำงาน</p>
              <p className="text-default-700 mt-1">เติมเครดิตก่อน (กระเป๋าเดียวกับที่ใช้ส่ง SMS)</p>
            </div>
          </div>
        </div>
      )}
      {on && knowledgeCount === 0 && (
        <div className="card">
          <div className="card-body flex items-start gap-3">
            <Icon icon="alert-triangle" className="text-warning mt-0.5 size-5 flex-none" aria-hidden="true" />
            <div className="text-sm">
              <p className="text-default-800 font-semibold">คลังความรู้ยังว่าง — AI ไม่มีข้อมูลให้ตอบ</p>
              <p className="text-default-700 mt-1">
                ChatBot ตอบจากคลังความรู้เท่านั้น ไม่เดาเอง — เพิ่มข้อมูลที่แท็บ &ldquo;คลังความรู้&rdquo; ก่อน
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── ช่วงเวลาทำงาน ── */}
      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 text-base font-semibold">ช่วงเวลาที่ให้ ChatBot ทำงาน</h5>
            <p className="text-default-700 mt-1 text-xs">
              เว้นว่างทั้งคู่ = ทำงานตลอดเวลา · ตั้งข้ามเที่ยงคืนได้ เช่น 18:00 ถึง 09:00 สำหรับให้ตอบแทนตอนร้านหลับ
            </p>
          </div>
        </div>
        <div className="card-body flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="cb-start" className="form-label">เริ่ม</label>
            <input
              id="cb-start"
              type="time"
              className="form-input"
              value={cfg.aiChatbotStartTime ?? ''}
              disabled={!canEdit}
              onChange={(e) => setCfg({ ...cfg, aiChatbotStartTime: e.target.value })}
              onBlur={(e) => patch({ aiChatbotStartTime: e.target.value }, 'บันทึกช่วงเวลาแล้ว')}
            />
          </div>
          <div>
            <label htmlFor="cb-end" className="form-label">ถึง</label>
            <input
              id="cb-end"
              type="time"
              className="form-input"
              value={cfg.aiChatbotEndTime ?? ''}
              disabled={!canEdit}
              onChange={(e) => setCfg({ ...cfg, aiChatbotEndTime: e.target.value })}
              onBlur={(e) => patch({ aiChatbotEndTime: e.target.value }, 'บันทึกช่วงเวลาแล้ว')}
            />
          </div>
        </div>
      </div>

      {/* ── น้ำเสียง ── */}
      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 text-base font-semibold">น้ำเสียง</h5>
            <p className="text-default-700 mt-1 text-xs">
              ว่างไว้ = สุภาพ เป็นกันเอง อ่านง่าย · น้ำเสียงเปลี่ยนได้แค่ถ้อยคำ ไม่เปลี่ยนข้อมูลในคลังความรู้
            </p>
          </div>
        </div>
        <div className="card-body space-y-2.5">
          <div className="flex flex-wrap gap-2">
            {TONE_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                disabled={!canEdit}
                className="badge bg-light text-default-700 cursor-pointer rounded-full px-3 py-1 text-xs"
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="form-textarea"
            rows={2}
            maxLength={300}
            disabled={!canEdit}
            placeholder="เช่น สุภาพ เป็นกันเอง ใช้คำว่าค่ะ ไม่ใช้ศัพท์เทคนิค"
            aria-label="น้ำเสียงของ ChatBot"
          />
          {canEdit && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={tone === savedTone || busy}
                onClick={async () => {
                  await patch({ aiChatbotTone: tone }, 'บันทึกน้ำเสียงแล้ว')
                  setSavedTone(tone)
                }}
                className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 text-white"
              >
                บันทึกน้ำเสียง
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── option: ขัดเกลาคำตอบของ Auto Reply ── */}
      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 text-base font-semibold">ขัดเกลาคำตอบของ Auto Reply</h5>
            <p className="text-default-700 mt-1 text-xs">
              คำตอบที่คุณตั้งไว้ใน Auto Reply จะถูก AI ปรับถ้อยคำให้อ่านลื่นขึ้นก่อนส่ง
              <br />
              <strong>ราคา วันส่ง เงื่อนไข ต้องตรงกับที่คุณเขียนไว้เป๊ะ</strong> · เกิน 8 วินาทีส่งของเดิมแทน · คิดค่าใช้จ่ายต่อครั้ง
            </p>
          </div>
          <label className="flex flex-none items-center gap-2">
            <span className="text-default-700 text-sm">{cfg.aiEnhanceEnabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
            <input
              type="checkbox"
              className="form-switch"
              checked={cfg.aiEnhanceEnabled}
              disabled={!canEdit || busy}
              onChange={() =>
                patch(
                  { aiEnhanceEnabled: !cfg.aiEnhanceEnabled },
                  !cfg.aiEnhanceEnabled ? 'เปิดการขัดเกลาคำตอบแล้ว' : 'ปิดการขัดเกลาคำตอบแล้ว',
                )
              }
              aria-label="เปิดใช้การขัดเกลาคำตอบของ Auto Reply"
            />
          </label>
        </div>
      </div>

      {/* ── เพดานค่าใช้จ่าย ── */}
      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 text-base font-semibold">เพดานค่าใช้จ่ายต่อวัน</h5>
            <p className="text-default-700 mt-1 text-xs">
              ใช้ครบแล้วหยุดเรียก AI จนขึ้นวันใหม่ — Auto Reply ยังตอบตามปกติ ลูกค้าไม่รู้สึกว่าอะไรหายไป
            </p>
          </div>
        </div>
        <div className="card-body space-y-3">
          <div className="flex items-end gap-3">
            <div>
              <label htmlFor="cb-cap" className="form-label">บาทต่อวัน</label>
              <input
                id="cb-cap"
                type="number"
                min={1}
                className="form-input"
                value={cfg.aiDailyCapBaht}
                disabled={!canEdit}
                onChange={(e) => setCfg({ ...cfg, aiDailyCapBaht: Number(e.target.value) })}
                onBlur={(e) => {
                  const n = Number(e.target.value)
                  if (n >= 1) patch({ aiDailyCapBaht: n }, 'บันทึกเพดานแล้ว')
                }}
              />
            </div>
            <p className="text-default-500 pb-2.5 text-xs">เครดิตคงเหลือ {walletBalance.toLocaleString('th-TH')} บาท</p>
          </div>
          <label className="flex items-center justify-between">
            <span className="text-default-700 text-sm">
              เตือนทาง SMS เมื่อใช้ถึง 80% ของเพดาน
              <span className="text-default-400 block text-xs">ค่าส่ง 1 บาทต่อครั้ง — ไม่เปิดก็ยังเห็นเตือนในแอปอยู่ดี</span>
            </span>
            <input
              type="checkbox"
              className="form-switch"
              checked={cfg.aiCapAlertSmsOptIn}
              disabled={!canEdit || busy}
              onChange={() => patch({ aiCapAlertSmsOptIn: !cfg.aiCapAlertSmsOptIn })}
              aria-label="เตือนทาง SMS เมื่อใช้ถึง 80%"
            />
          </label>
        </div>
      </div>

      {/* ── กฎห้ามตอบ ── */}
      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 text-base font-semibold">กฎห้ามตอบ</h5>
            <p className="text-default-700 mt-1 text-xs">
              สิ่งที่ AI ห้ามพูดถึง — ชนกฎแล้วระบบจะไม่ส่งอะไรเลยและส่งต่อให้คนดูแทน
            </p>
          </div>
          <span className="badge bg-light text-default-700 shrink-0">{rules.length} ข้อ</span>
        </div>

        {rules.length === 0 ? (
          <div className="card-body text-default-500 py-8 text-center text-sm">
            {on ? 'ยังไม่มีกฎ — เพิ่มข้อแรกด้านล่าง' : 'เปิดสวิตช์ด้านบนแล้วระบบจะใส่ชุดกฎเริ่มต้นให้ 6 ข้อ'}
          </div>
        ) : (
          <ul className="divide-default-200 divide-y">
            {rules.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${r.isActive ? 'text-default-800' : 'text-default-400 line-through'}`}>
                    {r.rule}
                  </p>
                  {r.denyPhrases.length > 0 && (
                    <p className="text-default-400 mt-0.5 text-xs">ดักคำ: {r.denyPhrases.join(' · ')}</p>
                  )}
                </div>
                {r.isFromDefaultSet && (
                  <span className="badge bg-light text-default-500 shrink-0 text-2xs">ชุดเริ่มต้น</span>
                )}
                {canEdit && (
                  <>
                    <input
                      type="checkbox"
                      className="form-switch form-switch-sm mt-0.5 shrink-0"
                      checked={r.isActive}
                      onChange={() => toggleRule(r)}
                      aria-label={r.isActive ? `ปิดกฎ ${r.rule}` : `เปิดกฎ ${r.rule}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeRule(r)}
                      className="btn btn-icon btn-sm bg-light text-danger shrink-0"
                      aria-label={`ลบกฎ ${r.rule}`}
                    >
                      <Icon icon="trash" className="size-4" aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="border-default-200 flex items-center gap-2 border-t px-4 py-3">
            <input
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addRule()
              }}
              className="form-input"
              maxLength={200}
              placeholder="เช่น ห้ามบอกวันส่งที่ไม่ตรงกับที่ร้านตั้งไว้"
              aria-label="กฎห้ามตอบข้อใหม่"
            />
            <button
              type="button"
              onClick={addRule}
              disabled={!newRule.trim() || busy}
              className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 shrink-0 text-white"
            >
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              เพิ่ม
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
