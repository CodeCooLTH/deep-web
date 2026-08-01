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
import TestThreadsCard from '../auto-reply/[id]/TestThreadsCard'
import { pacesConfirm } from '@/lib/paces-swal'

export type GuardrailRow = {
  id: string
  rule: string
  denyPhrases: string[]
  mode: string
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
  aiChatbotFallbackMode: string
  aiChatbotFallbackText: string | null
  aiChatbotUseShopData: boolean
  aiChatbotUseChatHistory: boolean
  aiChatbotUseWebSearch: boolean
  aiChatbotCooldownSec: number
  aiChatbotMaxPerHour: number
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

const DEFAULT_FALLBACK_PLACEHOLDER = 'ขอเช็คข้อมูลให้สักครู่นะคะ เดี๋ยวแอดมินมาตอบค่ะ'

const FALLBACK_MODES = [
  { key: 'MESSAGE', label: 'ตอบข้อความสำรอง', hint: 'ลูกค้าไม่ถูกปล่อยเงียบ และไม่มีความเสี่ยงว่า AI จะแต่งเรื่อง' },
  { key: 'AI_FREE', label: 'ให้ AI ตอบเองอย่างอิสระ', hint: 'ตอบได้ทุกคำถาม แต่ยังห้ามแต่งราคา/เงื่อนไขของร้าน — เสี่ยงพูดเกินที่ร้านตั้งไว้' },
  { key: 'SILENT', label: 'เงียบ ไม่ตอบอะไรเลย', hint: 'พฤติกรรมเดิม — คำถามจะไปเข้าคิวให้ร้านมาตอบเอง' },
] as const

const DATA_SOURCES = [
  { key: 'aiChatbotUseShopData' as const, label: 'สินค้าและราคาในระบบ', hint: 'ตอบราคาได้ตรงกับระบบเสมอ ไม่ต้องพิมพ์ซ้ำเข้าคลัง' },
  { key: 'aiChatbotUseChatHistory' as const, label: 'บทสนทนาก่อนหน้าในห้องนั้น', hint: 'ตอบคำถามต่อเนื่องได้ เช่น "แล้วสีแดงล่ะ"' },
  { key: 'aiChatbotUseWebSearch' as const, label: 'ค้นเว็บประกอบ', hint: 'ตอบเรื่องนอกร้านได้ เช่น สเปกรุ่นรถ — ค่าใช้จ่ายสูงขึ้น และข้อมูลนี้ร้านไม่ได้รับรอง' },
] as const

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
  const [testThreadCount, setTestThreadCount] = useState(0)

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

  /** สลับ BLOCK <-> AVOID — optimistic เพราะเป็นการกดที่ผู้ใช้คาดหวังผลทันที */
  async function toggleMode(r: { id: string; mode: string }) {
    if (!canEdit || busy) return
    const next = r.mode === 'AVOID' ? 'BLOCK' : 'AVOID'
    setRules((p) => p.map((x) => (x.id === r.id ? { ...x, mode: next } : x)))
    try {
      const res = await fetch(`/api/shops/auto-reply/chatbot/guardrails/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (!res.ok) throw new Error(await readError(res, 'เปลี่ยนชนิดกฎไม่สำเร็จ'))
    } catch (e) {
      setRules((p) => p.map((x) => (x.id === r.id ? { ...x, mode: r.mode } : x)))
      pacesToast.error(e instanceof Error ? e.message : 'เปลี่ยนชนิดกฎไม่สำเร็จ')
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
              ตอบเฉพาะแชทที่เลือกไว้ในการ์ด &ldquo;แชทสำหรับทดสอบ&rdquo; ด้านล่าง
              {testThreadCount === 0 && ' — ตอนนี้ยังไม่ได้เลือกแชท ChatBot จึงยังไม่ตอบใครเลย'}
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

          {/* เพดานต่อห้อง — คนละเรื่องกับเพดานเงินต่อวัน: อันนั้นคุมค่าใช้จ่ายรวมทั้งร้าน
              อันนี้กันห้องเดียวยิงรัว ๆ จนกินโควตาของทุกห้องไปคนเดียว */}
          <div className="border-default-200 flex flex-wrap items-end gap-3 border-t pt-3">
            <div>
              <label htmlFor="cb-cooldown" className="form-label">เว้นระยะระหว่างคำตอบ (วินาที)</label>
              <input
                id="cb-cooldown"
                type="number"
                min={0}
                max={3600}
                className="form-input"
                value={cfg.aiChatbotCooldownSec}
                disabled={!canEdit}
                onChange={(e) => setCfg({ ...cfg, aiChatbotCooldownSec: Number(e.target.value) })}
                onBlur={(e) => {
                  const n = Number(e.target.value)
                  if (n >= 0 && n <= 3600) patch({ aiChatbotCooldownSec: n }, 'บันทึกการเว้นระยะแล้ว')
                }}
              />
            </div>
            <div>
              <label htmlFor="cb-perhour" className="form-label">ตอบได้สูงสุดต่อห้องต่อชั่วโมง</label>
              <input
                id="cb-perhour"
                type="number"
                min={0}
                max={200}
                className="form-input"
                value={cfg.aiChatbotMaxPerHour}
                disabled={!canEdit}
                onChange={(e) => setCfg({ ...cfg, aiChatbotMaxPerHour: Number(e.target.value) })}
                onBlur={(e) => {
                  const n = Number(e.target.value)
                  if (n >= 0 && n <= 200) patch({ aiChatbotMaxPerHour: n }, 'บันทึกเพดานต่อห้องแล้ว')
                }}
              />
            </div>
            <p className="text-default-500 pb-2.5 text-xs">
              0 = ไม่จำกัด · โหมดทดสอบไม่ติดสองข้อนี้ จะได้ยิงซ้ำดูผลได้
            </p>
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
            <h5 className="text-default-900 text-base font-semibold">กฎการตอบ</h5>
            <p className="text-default-700 mt-1 text-xs">
              กดที่ป้ายหน้าแต่ละข้อเพื่อสลับชนิด — <span className="text-warning font-medium">หยุดไม่ตอบ</span>{' '}
              คือชนแล้วไม่ส่งอะไรเลยและส่งต่อให้คนดู ส่วน{' '}
              <span className="text-info font-medium">เลี่ยงคำพูดนี้</span> คือยังตอบอยู่ แต่สั่ง AI ว่าห้ามพูดแบบนั้น
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
                  <p className="text-default-400 mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                    {/* ชนิดกฎอ่านจากป้ายได้ทันที — สองชนิดนี้ให้ผลตรงข้ามกัน (เงียบ vs ยังตอบ)
                        ถ้าแยกไม่ออกตั้งแต่แรกเห็น ร้านจะตั้งผิดชนิดแล้วงงว่าทำไมบอทเงียบ */}
                    <button
                      type="button"
                      disabled={!canEdit || busy}
                      onClick={() => toggleMode(r)}
                      className={`badge shrink-0 text-2xs ${
                        r.mode === 'AVOID' ? 'bg-info/15 text-info' : 'bg-warning/15 text-warning'
                      }`}
                      title="กดเพื่อสลับชนิดกฎ"
                    >
                      {r.mode === 'AVOID' ? 'เลี่ยงคำพูดนี้' : 'หยุดไม่ตอบ'}
                    </button>
                    {r.denyPhrases.length > 0 && <span>ดักคำ: {r.denyPhrases.join(' · ')}</span>}
                  </p>
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

      {/* ── เมื่อคลังไม่มีคำตอบ ─────────────────────────────────────────────
          user 2026-08-01: "อยากให้แชทบอทตอบทุกคำถาม ... แต่ถ้าไม่มีคลังความรู้
          ก็ให้ตอบข้อมูล โดยลูกค้าต้องตั้งค่าได้" */}
      <div className="card">
        <div className="card-header">
          <div className="min-w-0">
            <h5 className="text-default-900 text-base font-semibold">เมื่อคลังไม่มีคำตอบ</h5>
            <p className="text-default-700 mt-1 text-xs">
              บอทตอบจากคลังความรู้เป็นหลักเสมอ ตรงนี้คือสิ่งที่ทำเมื่อคลังตอบคำถามนั้นไม่ได้
            </p>
          </div>
        </div>
        <div className="card-body space-y-2.5">
          {FALLBACK_MODES.map((m) => (
            <label key={m.key} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name="fallback-mode"
                className="form-radio mt-1 shrink-0"
                checked={cfg.aiChatbotFallbackMode === m.key}
                disabled={!canEdit || busy}
                onChange={() => patch({ aiChatbotFallbackMode: m.key }, `เปลี่ยนเป็น "${m.label}" แล้ว`)}
              />
              <span className="min-w-0">
                <span className="text-default-800 block text-sm font-medium">{m.label}</span>
                <span className="text-default-500 block text-xs">{m.hint}</span>
              </span>
            </label>
          ))}
          {cfg.aiChatbotFallbackMode === 'MESSAGE' && (
            <div className="ps-6">
              <label htmlFor="cb-fallback" className="form-label">ข้อความสำรอง</label>
              <textarea
                id="cb-fallback"
                className="form-textarea"
                rows={2}
                maxLength={500}
                disabled={!canEdit}
                placeholder={DEFAULT_FALLBACK_PLACEHOLDER}
                value={cfg.aiChatbotFallbackText ?? ''}
                onChange={(e) => setCfg({ ...cfg, aiChatbotFallbackText: e.target.value })}
                onBlur={(e) => patch({ aiChatbotFallbackText: e.target.value }, 'บันทึกข้อความสำรองแล้ว')}
              />
              <p className="text-default-400 mt-1 text-xs">เว้นว่างไว้ = ใช้ข้อความกลาง · ไม่มีค่า AI เพราะเป็นข้อความคงที่</p>
            </div>
          )}
        </div>
      </div>

      {/* ── แหล่งข้อมูลประกอบ ─────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="min-w-0">
            <h5 className="text-default-900 text-base font-semibold">ข้อมูลที่บอทใช้ประกอบการตอบ</h5>
            <p className="text-default-700 mt-1 text-xs">
              เปิดมากขึ้น = ตอบได้ครอบคลุมขึ้น แต่ prompt ยาวขึ้นและค่าใช้จ่ายต่อครั้งสูงขึ้น
            </p>
          </div>
        </div>
        <div className="card-body space-y-3">
          {DATA_SOURCES.map((d) => (
            <label key={d.key} className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="text-default-700 block text-sm">{d.label}</span>
                <span className="text-default-400 block text-xs">{d.hint}</span>
              </span>
              <input
                type="checkbox"
                className="form-switch shrink-0"
                disabled={!canEdit || busy}
                checked={Boolean(cfg[d.key])}
                onChange={(e) => patch({ [d.key]: e.target.checked }, 'บันทึกแล้ว')}
              />
            </label>
          ))}
        </div>
      </div>

      {/* แชทสำหรับทดสอบ — การ์ดตัวเดียวกับของกลุ่มคำ ต่างแค่ scope เป็นระดับร้าน
          (ดู TestThreadsCard prop `apiBase`) จึงหน้าตา/พฤติกรรมตรงกันทั้งสองที่ */}
      <TestThreadsCard
        apiBase="/api/shops/auto-reply/chatbot/test-threads"
        scopeNoun="ChatBot"
        triggerHint="ถามคำถามที่ไม่ตรงกลุ่มคำไหนเลย"
        status={status}
        canEdit={canEdit}
        onCountChange={setTestThreadCount}
      />
    </div>
  )
}
