'use client'

/**
 * CommentRulesCard — กฎตอบคอมเมนต์ตามคีย์เวิร์ด (feature 00038 ส่วนขยาย E2, 2026-08-15)
 *
 * ที่มา: นับจากฐาน prod คอมเมนต์ระดับบนของลูกค้า 472 ใบ **ถามราคาตรง ๆ 164 ใบ (35%)** แต่ทุกคน
 * ได้ข้อความเดียวกันหมด — คำตอบใบเดียวจึงตอบตรงคำถามได้จริงแค่กลุ่มเดียว
 *
 * Base: การ์ด/สวิตช์/ช่องพิมพ์/ตัวนับ ยกจาก `CommentReplyCard` ในไฟล์ข้าง ๆ (สอง card อยู่หน้า
 * เดียวกัน ต้องพูดภาษาเดียวกัน — `docs/conventions/sibling-surface-parity.md`)
 *   → ต้นทางเดิม: settings/ai/AiSettingForm.tsx:100-282
 *      (theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx:71)
 * Base (ยืนยันก่อนลบ): src/lib/paces-swal.ts `pacesConfirm.danger`
 *
 * 🛑 ลำดับที่แสดงในหน้านี้ = ลำดับที่ระบบใช้เลือกจริง (service เรียง priority DESC → createdAt ASC
 * → id ASC ตรงกับ `matchCommentRule`) — ถ้าหน้าจอเรียงคนละแบบกับที่ระบบตัดสิน ร้านจะตั้งกฎแล้ว
 * งงว่าทำไมอีกข้อชนะ โดยไม่มีอะไรอธิบายได้
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { COMMENT_NAME_PLACEHOLDER } from '@/lib/comment-reply-template'

/** ต้องตรงกับ CommentReplyRuleSchema (validations.ts) และ service */
const RULE_TEXT_MAX = 1000
const RULE_PHRASE_MAX = 30

export type CommentRule = {
  id: string
  name: string
  shopChannelId: string | null
  phrases: string[]
  publicReplyText: string | null
  publicReplyFileId: string | null
  privateReplyText: string | null
  priority: number
  isActive: boolean
  createdAt: string
}

export type RuleChannelOption = { id: string; name: string }

type Draft = {
  name: string
  shopChannelId: string | null
  phrasesText: string
  publicReplyText: string
  privateReplyText: string
  priority: number
  isActive: boolean
}

/** คำที่ร้านพิมพ์คั่นด้วยคอมมาหรือขึ้นบรรทัดใหม่ — ตัดว่างทิ้ง (server ตัดซ้ำอีกชั้นด้วย normalize) */
function parsePhrases(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function emptyDraft(): Draft {
  return {
    name: '',
    shopChannelId: null,
    phrasesText: '',
    publicReplyText: '',
    privateReplyText: '',
    priority: 100,
    isActive: true,
  }
}

function toDraft(rule: CommentRule): Draft {
  return {
    name: rule.name,
    shopChannelId: rule.shopChannelId,
    phrasesText: rule.phrases.join(', '),
    publicReplyText: rule.publicReplyText ?? '',
    privateReplyText: rule.privateReplyText ?? '',
    priority: rule.priority,
    isActive: rule.isActive,
  }
}

export default function CommentRulesCard({
  initialRules,
  channels,
}: {
  initialRules: CommentRule[]
  channels: RuleChannelOption[]
}) {
  const [rules, setRules] = useState(initialRules)
  /** null = ไม่ได้แก้อะไรอยู่ · 'new' = กำลังสร้างใหม่ · id = กำลังแก้ข้อนั้น */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startNew() {
    setDraft(emptyDraft())
    setEditingId('new')
    setError(null)
  }

  function startEdit(rule: CommentRule) {
    setDraft(toDraft(rule))
    setEditingId(rule.id)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  async function handleSave() {
    if (saving || !editingId) return
    const phrases = parsePhrases(draft.phrasesText)
    // เกณฑ์เดียวกับ Valibot + service เป๊ะ — สามที่นี้ต้องตรงกันเสมอ ไม่งั้นจะได้สถานะ
    // "กดบันทึกแล้วเด้ง error ที่หน้าจอบอกไม่ได้ว่าผิดตรงไหน"
    if (!draft.name.trim()) return setError('ตั้งชื่อกฎก่อน')
    if (phrases.length === 0) return setError('ใส่คำที่จะให้ระบบตรวจจับอย่างน้อย 1 คำ')
    if (phrases.length > RULE_PHRASE_MAX) return setError(`ใส่คำได้สูงสุด ${RULE_PHRASE_MAX} คำต่อกฎ`)
    if (!draft.publicReplyText.trim() && !draft.privateReplyText.trim()) {
      return setError('กรอกคำตอบอย่างน้อยหนึ่งช่อง (ตอบใต้คอมเมนต์ หรือ ทักแชท)')
    }

    setSaving(true)
    setError(null)
    try {
      const isNew = editingId === 'new'
      const res = await fetch(
        isNew ? '/api/shops/comment-reply/rules' : `/api/shops/comment-reply/rules/${editingId}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: draft.name,
            shopChannelId: draft.shopChannelId,
            phrases,
            publicReplyText: draft.publicReplyText.trim() || null,
            publicReplyFileId: null,
            privateReplyText: draft.privateReplyText.trim() || null,
            priority: draft.priority,
            isActive: draft.isActive,
          }),
        },
      )
      const body = (await res.json().catch(() => null)) as { rule?: CommentRule; error?: string } | null
      if (!res.ok || !body?.rule) {
        setError(body?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      const saved = body.rule
      setRules((prev) => (isNew ? [...prev, saved] : prev.map((r) => (r.id === saved.id ? saved : r))))
      setEditingId(null)
      pacesToast.success('บันทึกกฎแล้ว')
    } catch {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(rule: CommentRule) {
    const ok = await pacesConfirm.danger(
      'ลบกฎนี้?',
      `คอมเมนต์ที่เคยเข้ากฎ "${rule.name}" จะกลับไปได้ข้อความตั้งต้นของเพจแทน`,
    )
    if (!ok) return
    const res = await fetch(`/api/shops/comment-reply/rules/${rule.id}`, { method: 'DELETE' })
    if (!res.ok) {
      pacesToast.error('ลบไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    setRules((prev) => prev.filter((r) => r.id !== rule.id))
    pacesToast.success('ลบกฎแล้ว')
  }

  const channelName = (id: string | null) =>
    id === null ? 'ทุกเพจ' : (channels.find((c) => c.id === id)?.name ?? 'เพจที่ถูกถอดไปแล้ว')

  return (
    <div className="card">
      <div className="card-header flex flex-nowrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-default-800 truncate text-sm font-semibold">ตอบต่างกันตามคำที่ลูกค้าพิมพ์</p>
          <p className="text-default-400 text-xs">
            คอมเมนต์ที่เข้ากฎจะได้คำตอบของกฎนั้นแทนข้อความตั้งต้นด้านบน · ไม่เข้ากฎไหนเลยก็ยังได้ข้อความตั้งต้นเหมือนเดิม
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          disabled={editingId !== null}
          className="btn btn-sm btn-light inline-flex shrink-0 items-center gap-1.5"
        >
          <Icon icon="plus" className="text-sm" aria-hidden="true" />
          เพิ่มกฎ
        </button>
      </div>

      <div className="card-body space-y-3">
        {rules.length === 0 && editingId === null && (
          <p className="text-default-500 text-sm">
            ยังไม่มีกฎ — ตอนนี้ทุกคอมเมนต์ได้ข้อความตั้งต้นของเพจเหมือนกันหมด
          </p>
        )}

        <ul className="divide-default-200 divide-y">
          {rules.map((rule) => (
            <li key={rule.id} className="py-3 first:pt-0">
              {editingId === rule.id ? (
                <RuleEditor
                  draft={draft}
                  setDraft={setDraft}
                  channels={channels}
                  saving={saving}
                  error={error}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                />
              ) : (
                <div className="flex flex-nowrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-default-800 text-sm font-medium">{rule.name}</span>
                      {!rule.isActive && (
                        <span className="badge bg-default-200 text-default-700 text-2xs">ปิดอยู่</span>
                      )}
                      <span className="badge bg-default-100 text-default-700 text-2xs">
                        {channelName(rule.shopChannelId)}
                      </span>
                    </div>
                    <p className="text-default-500 mt-1 text-2xs">
                      คำที่จับ: {rule.phrases.join(' · ')}
                    </p>
                    {/* บอกให้ชัดว่ากฎนี้ทำอะไรบ้าง — ร้านตั้งได้ทีละช่อง (D-EXT2-4) ถ้าไม่เขียนไว้
                        จะแยกไม่ออกว่า "ไม่ทัก" เพราะตั้งใจหรือเพราะลืมกรอก */}
                    <p className="text-default-500 mt-0.5 text-2xs">
                      {rule.publicReplyText?.trim() ? 'ตอบใต้คอมเมนต์' : 'ไม่ตอบใต้คอมเมนต์'}
                      {' · '}
                      {rule.privateReplyText?.trim() ? 'ทักแชท' : 'ไม่ทักแชท'}
                      {' · ลำดับ '}
                      {rule.priority}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(rule)}
                      disabled={editingId !== null}
                      className="btn btn-sm btn-light inline-flex items-center gap-1"
                    >
                      <Icon icon="pencil" className="text-sm" aria-hidden="true" />
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule)}
                      disabled={editingId !== null}
                      aria-label={`ลบกฎ ${rule.name}`}
                      className="btn btn-sm bg-danger/15 text-danger-ink hover:bg-danger/25 inline-flex items-center"
                    >
                      <Icon icon="trash" className="text-sm" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {editingId === 'new' && (
          <RuleEditor
            draft={draft}
            setDraft={setDraft}
            channels={channels}
            saving={saving}
            error={error}
            onSave={handleSave}
            onCancel={cancelEdit}
          />
        )}
      </div>
    </div>
  )
}

/** ฟอร์มแก้กฎ — ประกาศนอก render ของ CommentRulesCard (component-declared-in-render.md) */
function RuleEditor({
  draft,
  setDraft,
  channels,
  saving,
  error,
  onSave,
  onCancel,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  channels: RuleChannelOption[]
  saving: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="border-default-300 space-y-3 rounded-lg border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-default-800 mb-1 block text-xs font-medium">ชื่อกฎ</span>
          <input
            className="form-input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="เช่น ถามราคา"
            disabled={saving}
          />
        </label>
        <label className="block">
          <span className="text-default-800 mb-1 block text-xs font-medium">ใช้กับเพจ</span>
          <select
            className="form-select"
            value={draft.shopChannelId ?? ''}
            onChange={(e) => setDraft({ ...draft, shopChannelId: e.target.value || null })}
            disabled={saving}
          >
            <option value="">ทุกเพจ</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-default-800 mb-1 block text-xs font-medium">คำที่จะให้ระบบตรวจจับ</span>
        <textarea
          rows={2}
          className="form-textarea"
          value={draft.phrasesText}
          onChange={(e) => setDraft({ ...draft, phrasesText: e.target.value })}
          placeholder="ราคา, เท่าไหร่, กี่บาท"
          disabled={saving}
        />
        <span className="text-default-500 mt-1 block text-2xs">
          คั่นด้วยคอมมาหรือขึ้นบรรทัดใหม่ · ระบบจับแบบ &ldquo;มีคำนี้อยู่ในข้อความ&rdquo; ไม่ต้องพิมพ์ให้ตรงทั้งประโยค
        </span>
      </label>

      <label className="block">
        <span className="text-default-800 mb-1 block text-xs font-medium">
          ตอบใต้คอมเมนต์ <span className="text-default-400 font-normal">(เว้นว่าง = ไม่ตอบ)</span>
        </span>
        <textarea
          rows={2}
          className="form-textarea"
          maxLength={RULE_TEXT_MAX}
          value={draft.publicReplyText}
          onChange={(e) => setDraft({ ...draft, publicReplyText: e.target.value })}
          disabled={saving}
        />
      </label>

      <label className="block">
        <span className="text-default-800 mb-1 block text-xs font-medium">
          ทักแชท <span className="text-default-400 font-normal">(เว้นว่าง = ไม่ทัก)</span>
        </span>
        <textarea
          rows={2}
          className="form-textarea"
          maxLength={RULE_TEXT_MAX}
          value={draft.privateReplyText}
          onChange={(e) => setDraft({ ...draft, privateReplyText: e.target.value })}
          disabled={saving}
        />
        <span className="text-default-500 mt-1 block text-2xs">
          ใช้ {COMMENT_NAME_PLACEHOLDER} แทนชื่อลูกค้าได้ทั้งสองช่อง
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="block w-28">
          <span className="text-default-800 mb-1 block text-xs font-medium">ลำดับ</span>
          <input
            type="number"
            className="form-input"
            value={draft.priority}
            min={0}
            max={9999}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
            disabled={saving}
          />
        </label>
        <label className="mt-5 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="form-switch"
            checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            disabled={saving}
          />
          <span className="text-default-800 text-sm">เปิดใช้งาน</span>
        </label>
        <span className="text-default-500 text-2xs">
          เลขมากกว่าถูกเลือกก่อน · กฎที่ระบุเพจชนะกฎ &ldquo;ทุกเพจ&rdquo; เสมอ
        </span>
      </div>

      {error && <p className="text-danger-ink text-xs">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn bg-light text-default-700 hover:bg-light-hover disabled:opacity-60"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? (
            <>
              <Icon icon="loader-2" className="me-1 animate-spin text-base" aria-hidden="true" />
              กำลังบันทึก...
            </>
          ) : (
            'บันทึกกฎ'
          )}
        </button>
      </div>
    </div>
  )
}
