'use client'

/**
 * AI Enhance ของกลุ่มคำ — สวิตช์ + กฎห้ามตอบ (Guardrails)
 * feature 00023 · phase `00023-ai-enhance` · A-11
 *
 * Base: settings/auto-reply/[id]/KeywordEditorClient.tsx (.card / .card-header / form-switch /
 *   pacesToast) + qna/QnaListingClient.tsx (รายการ divide-y + ปุ่มลบต่อแถว + pacesConfirm)
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

type Props = {
  keywordId: string
  keywordName: string
  canEdit: boolean
  initialEnabled: boolean
  initialGuardrails: GuardrailRow[]
  initialTone: string
  /** ยอดเครดิตในกระเป๋า — 0 = AI จะไม่ถูกเรียกเลย ต้องเตือนให้เห็น */
  walletBalance: number
}

/** ปุ่มลัดน้ำเสียงที่ใช้บ่อย — กดแล้วเติมลงช่อง แก้ต่อได้ ไม่ใช่ตัวเลือกตายตัว */
const TONE_PRESETS = [
  'สุภาพ เป็นกันเอง อ่านง่าย',
  'สั้น กระชับ ตรงประเด็น',
  'เป็นทางการ น่าเชื่อถือ',
  'อบอุ่น ใส่ใจ เหมือนคุยกับเพื่อน',
]

export default function AiEnhanceClient({
  keywordId,
  keywordName,
  canEdit,
  initialEnabled,
  initialGuardrails,
  initialTone,
  walletBalance,
}: Props) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [rules, setRules] = useState<GuardrailRow[]>(initialGuardrails)
  const [newRule, setNewRule] = useState('')
  const [tone, setTone] = useState(initialTone)
  const [savedTone, setSavedTone] = useState(initialTone)
  const [busy, setBusy] = useState(false)

  async function readError(res: Response, fallback: string) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? fallback
  }

  async function toggle() {
    if (!canEdit || busy) return
    const next = !enabled
    setEnabled(next) // optimistic — สวิตช์ต้องขยับทันที ไม่งั้นผู้ใช้กดซ้ำ
    setBusy(true)
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${keywordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiEnhanceEnabled: next }),
      })
      if (!res.ok) throw new Error(await readError(res, 'บันทึกไม่สำเร็จ'))
      pacesToast.success(next ? 'เปิด AI Enhance ให้กลุ่มนี้แล้ว' : 'ปิด AI Enhance ของกลุ่มนี้แล้ว')
      // เปิดครั้งแรก server จะคัดลอกกฎเริ่มต้นให้ — refresh เพื่อดึงรายการจริงมาแสดง
      if (next) router.refresh()
    } catch (e) {
      setEnabled(!next)
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function saveTone() {
    if (!canEdit || busy || tone === savedTone) return
    setBusy(true)
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${keywordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiTone: tone }),
      })
      if (!res.ok) throw new Error(await readError(res, 'บันทึกไม่สำเร็จ'))
      setSavedTone(tone)
      pacesToast.success('บันทึกน้ำเสียงแล้ว')
    } catch (e) {
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
      const res = await fetch(`/api/shops/auto-reply/keywords/${keywordId}/guardrails`, {
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
    if (!canEdit || busy) return
    const next = !row.isActive
    setRules((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)))
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${keywordId}/guardrails/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      if (!res.ok) throw new Error(await readError(res, 'บันทึกไม่สำเร็จ'))
    } catch (e) {
      setRules((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: row.isActive } : r)))
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
      const res = await fetch(`/api/shops/auto-reply/keywords/${keywordId}/guardrails/${row.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await readError(res, 'ลบไม่สำเร็จ'))
      pacesToast.success('ลบกฎแล้ว')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 flex items-center gap-2 text-base font-semibold">
              <span className="bg-primary/15 text-primary flex size-8 flex-none items-center justify-center rounded-lg">
                <Icon icon="sparkles" className="size-4.5" aria-hidden="true" />
              </span>
              ให้ AI เรียบเรียงคำตอบก่อนส่ง
            </h5>
            <p className="text-default-700 mt-1 text-xs">
              คำตอบที่คุณเขียนไว้ในกลุ่ม &ldquo;{keywordName}&rdquo; จะถูก AI ปรับถ้อยคำให้อ่านลื่นขึ้นก่อนส่งถึงลูกค้า ·
              ข้อมูลอย่างราคา วันส่ง เงื่อนไข ต้องตรงกับที่คุณเขียนไว้เป๊ะ · เกิน 8 วินาทีระบบส่งคำตอบเดิมแทนทันที
            </p>
          </div>
          <label className="flex flex-none items-center gap-2">
            <span className="text-default-700 text-sm">{enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
            <input
              type="checkbox"
              className="form-switch"
              checked={enabled}
              disabled={!canEdit || busy}
              onChange={toggle}
              aria-label="เปิดใช้ AI Enhance สำหรับกลุ่มคำนี้"
            />
          </label>
        </div>
      </div>

      {/* เปิดสวิตช์แล้วแต่เครดิตหมด = AI จะไม่ถูกเรียกเลย ต้องบอกตรง ๆ ไม่ใช่เงียบ
          (บั๊กที่ user เจอ 2026-08-01 — ข้อความออกมาเหมือนเดิมโดยไม่มีคำอธิบาย) */}
      {enabled && walletBalance <= 0 && (
        <div className="card">
          <div className="card-body flex items-start gap-3">
            <Icon icon="alert-triangle" className="text-warning mt-0.5 size-5 flex-none" aria-hidden="true" />
            <div className="text-sm">
              <p className="text-default-800 font-semibold">เครดิตในกระเป๋าหมด — AI ยังไม่ทำงาน</p>
              <p className="text-default-700 mt-1">
                สวิตช์เปิดอยู่ แต่ระบบจะข้ามการเรียก AI และส่งคำตอบเดิมของคุณตามปกติ
                จนกว่าจะเติมเครดิต (กระเป๋าเดียวกับที่ใช้ส่ง SMS)
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 text-base font-semibold">น้ำเสียง</h5>
            <p className="text-default-700 mt-1 text-xs">
              บอก AI ว่าอยากให้พูดกับลูกค้าแบบไหน — ว่างไว้ = สุภาพ เป็นกันเอง อ่านง่าย ·
              น้ำเสียงไม่มีอำนาจเหนือกฎข้อมูล ราคาและเงื่อนไขยังต้องตรงกับที่คุณเขียนไว้เสมอ
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
            aria-label="น้ำเสียงที่ให้ AI ใช้"
          />
          {canEdit && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveTone}
                disabled={tone === savedTone || busy}
                className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 text-white"
              >
                บันทึกน้ำเสียง
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header items-start">
          <div className="min-w-0">
            <h5 className="text-default-900 text-base font-semibold">กฎห้ามตอบ</h5>
            <p className="text-default-700 mt-1 text-xs">
              สิ่งที่ AI ห้ามพูดถึง — ชนกฎแล้วระบบจะไม่ส่งอะไรเลยและส่งต่อให้คนดูแทน
              (คนละอย่างกับ &ldquo;สัญญาณส่งต่อ&rdquo; ซึ่งดูคำที่ลูกค้าพิมพ์เข้ามา)
            </p>
          </div>
          <span className="badge bg-light text-default-700 shrink-0">{rules.length} ข้อ</span>
        </div>

        {rules.length === 0 ? (
          <div className="card-body text-default-500 py-8 text-center text-sm">
            {enabled
              ? 'ยังไม่มีกฎ — เพิ่มข้อแรกด้านล่าง'
              : 'เปิดสวิตช์ด้านบนแล้วระบบจะใส่ชุดกฎเริ่มต้นให้ 6 ข้อ'}
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
                    <p className="text-default-400 mt-0.5 text-xs">
                      ดักคำ: {r.denyPhrases.join(' · ')}
                    </p>
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
