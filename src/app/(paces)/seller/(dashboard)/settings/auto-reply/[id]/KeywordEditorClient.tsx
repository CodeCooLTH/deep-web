'use client'

/**
 * KeywordEditorClient — แก้ไขกลุ่มคำ + คำตอบทุกระดับ + แผงทดสอบ (feature 00023, S-13 หน้า 2)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/UI-DESIGN-SPEC.md §4
 *
 * Base (form-input/textarea + ตัวนับอักษร): src/app/(paces)/seller/(dashboard)/settings/ai/
 *   AiSettingForm.tsx ซึ่ง Base เดิม = theme/paces/Admin/TS/src/app/(admin)/form/elements/
 *   components/InputTextfieldType.tsx
 * Base (chip/badge ของคำตรวจจับ): theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 *
 * toast ใช้ pacesToast เท่านั้น (Hard Rule 9)
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

const REPLY_MAX = 1000

type Phrase = { id: string; phrase: string }
type Rule = {
  id: string
  shopChannelId: string | null
  adId: string | null
  adLabel: string | null
  productId: string | null
  replyText: string
  isActive: boolean
  specificity: number
}
type Keyword = {
  id: string
  name: string
  matchType: string
  priority: number
  isActive: boolean
  phrases: Phrase[]
  rules: Rule[]
}
type Props = {
  canEdit: boolean
  keyword: Keyword
  channels: { id: string; name: string; provider: string }[]
  products: { id: string; name: string }[]
}

const MATCH_TYPE_OPTIONS = [
  { value: 'CONTAINS', label: 'มีคำอยู่ในประโยค' },
  { value: 'EXACT', label: 'ตรงทั้งข้อความ' },
  { value: 'STARTS_WITH', label: 'ขึ้นต้นด้วยคำ' },
]

/** ป้ายภาษาคนของระดับกฎ — ห้ามโชว์ค่าดิบอย่าง KEYWORD_PAGE_AD ให้ผู้ใช้เห็น */
const LEVEL_LABEL: Record<string, string> = {
  KEYWORD_PAGE_AD_PRODUCT: 'กลุ่มคำ + เพจ + โฆษณา + สินค้า',
  KEYWORD_PAGE_AD: 'กลุ่มคำ + เพจ + โฆษณา',
  KEYWORD_PAGE_PRODUCT: 'กลุ่มคำ + เพจ + สินค้า',
  KEYWORD_PAGE: 'กลุ่มคำ + เพจ',
  KEYWORD_PRODUCT: 'กลุ่มคำ + สินค้า',
  KEYWORD_DEFAULT: 'คำตอบกลางของกลุ่มคำ',
  PAGE_DEFAULT: 'คำตอบกลางของเพจ',
  SHOP_DEFAULT: 'คำตอบกลางของร้าน',
  NONE: 'ไม่มีกฎที่ใช้ได้',
}

export default function KeywordEditorClient({ canEdit, keyword, channels, products }: Props) {
  const router = useRouter()
  const [name, setName] = useState(keyword.name)
  const [matchType, setMatchType] = useState(keyword.matchType)
  const [priority, setPriority] = useState(keyword.priority)
  const [isActive, setIsActive] = useState(keyword.isActive)
  const [phrases, setPhrases] = useState(keyword.phrases)
  const [newPhrase, setNewPhrase] = useState('')
  const [rules, setRules] = useState(keyword.rules)
  const [busy, setBusy] = useState(false)

  const defaultRule = rules.find((r) => !r.shopChannelId && !r.adId && !r.productId) ?? null
  const overrides = rules.filter((r) => r.shopChannelId || r.adId || r.productId)
  const [defaultReply, setDefaultReply] = useState(defaultRule?.replyText ?? '')

  async function call(url: string, init: RequestInit) {
    const res = await fetch(url, { cache: 'no-store', ...init })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'ดำเนินการไม่สำเร็จ')
    return data
  }

  async function saveGeneral() {
    if (!canEdit || busy) return
    setBusy(true)
    try {
      await call(`/api/shops/auto-reply/keywords/${keyword.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), matchType, priority, isActive }),
      })
      pacesToast.success('บันทึกแล้ว')
      router.refresh()
    } catch (e) {
      // เปิดใช้งานไม่ได้เพราะยังไม่มีคำตรวจจับ/คำตอบ = ข้อความจาก API อธิบายเองแล้ว
      setIsActive(keyword.isActive)
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function addPhrase() {
    const value = newPhrase.trim()
    if (!canEdit || !value || busy) return
    setBusy(true)
    try {
      const data = await call(`/api/shops/auto-reply/keywords/${keyword.id}/phrases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrases: [value] }),
      })
      if (data.added?.length) {
        setPhrases((p) => [...p, ...data.added.map((a: Phrase) => ({ id: a.id, phrase: a.phrase }))])
      }
      setNewPhrase('')
      // ซ้ำข้ามกลุ่ม = เตือนแต่ยังเพิ่มได้ (AC-002-04) ต้องบอกว่าชนกับกลุ่มไหน ไม่ใช่เงียบ
      if (data.warnings?.length) pacesToast.warning(data.warnings[0])
      else if (data.skipped?.length) pacesToast.warning('คำนี้มีอยู่ในกลุ่มนี้แล้ว')
      else pacesToast.success('เพิ่มคำแล้ว')
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เพิ่มคำไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function removePhrase(phraseId: string) {
    if (!canEdit || busy) return
    setBusy(true)
    try {
      await call(`/api/shops/auto-reply/keywords/${keyword.id}/phrases/${phraseId}`, { method: 'DELETE' })
      setPhrases((p) => p.filter((x) => x.id !== phraseId))
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function saveDefaultReply() {
    if (!canEdit || busy) return
    setBusy(true)
    try {
      if (defaultRule) {
        await call(`/api/shops/auto-reply/rules/${defaultRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopChannelId: null, adId: null, adLabel: null, productId: null,
            replyText: defaultReply, isActive: true, activeFrom: null, activeUntil: null,
          }),
        })
      } else {
        const created = await call('/api/shops/auto-reply/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keywordId: keyword.id,
            shopChannelId: null, adId: null, adLabel: null, productId: null,
            replyText: defaultReply, activeFrom: null, activeUntil: null,
          }),
        })
        setRules((r) => [...r, created])
      }
      pacesToast.success('บันทึกคำตอบกลางแล้ว')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {/* ── ทั่วไป ─────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h5 className="text-default-800 text-base font-semibold">ทั่วไป</h5>
            <label className="flex items-center gap-2">
              <span className="text-default-600 text-sm">เปิดใช้งาน</span>
              <input
                type="checkbox"
                className="form-switch"
                checked={isActive}
                disabled={!canEdit || busy}
                onChange={(e) => setIsActive(e.target.checked)}
                aria-label="เปิดใช้งานกลุ่มคำนี้"
              />
            </label>
          </div>
          <div className="card-body space-y-3">
            <div>
              <label htmlFor="k-name" className="text-default-700 mb-1 block text-sm font-medium">ชื่อกลุ่มคำ</label>
              <input id="k-name" className="form-input" value={name} disabled={!canEdit}
                onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="k-match" className="text-default-700 mb-1 block text-sm font-medium">รูปแบบการตรวจจับ</label>
                <select id="k-match" className="form-select" value={matchType} disabled={!canEdit}
                  onChange={(e) => setMatchType(e.target.value)}>
                  {MATCH_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="k-pri" className="text-default-700 mb-1 block text-sm font-medium">ลำดับความสำคัญ</label>
                <input id="k-pri" type="number" className="form-input" value={priority} disabled={!canEdit}
                  min={0} max={1000} onChange={(e) => setPriority(Number(e.target.value))} />
                <p className="text-default-500 mt-1 text-xs">ค่ามากกว่าถูกเลือกก่อนเมื่อข้อความตรงหลายกลุ่ม</p>
              </div>
            </div>
          </div>
          {canEdit && (
            <div className="card-footer flex justify-end">
              <button className="btn btn-primary" disabled={busy} onClick={saveGeneral}>บันทึก</button>
            </div>
          )}
        </div>

        {/* ── คำตรวจจับ ───────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h5 className="text-default-800 text-base font-semibold">คำตรวจจับ ({phrases.length})</h5>
          </div>
          <div className="card-body">
            <p className="text-default-600 mb-3 text-sm">
              ใส่คำที่ความหมายเหมือนกันได้หลายคำ ระบบจะเข้าใจว่าเป็นเรื่องเดียวกัน
              และรองรับคำลงท้ายอย่าง ครับ/ค่ะ/จ้า ให้อัตโนมัติ
            </p>
            {phrases.length === 0 ? (
              <p className="text-default-500 mb-3 text-sm">ยังไม่มีคำตรวจจับ — กลุ่มนี้จะยังเปิดใช้งานไม่ได้</p>
            ) : (
              <div className="mb-3 flex flex-wrap gap-2">
                {phrases.map((p) => (
                  <span key={p.id} className="badge bg-default-100 text-default-700 flex items-center gap-1">
                    {p.phrase}
                    {canEdit && (
                      <button type="button" onClick={() => removePhrase(p.id)} disabled={busy}
                        aria-label={`ลบคำ ${p.phrase}`} className="text-default-500 hover:text-danger">
                        <Icon icon="x" className="text-xs" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {canEdit && (
              <div className="flex gap-2">
                <input className="form-input flex-1" value={newPhrase} placeholder="เช่น สนใจ"
                  onChange={(e) => setNewPhrase(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhrase() } }}
                  maxLength={200} aria-label="คำตรวจจับใหม่" />
                <button className="btn btn-soft-primary" disabled={busy || !newPhrase.trim()} onClick={addPhrase}>
                  เพิ่ม
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── คำตอบกลาง ──────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h5 className="text-default-800 text-base font-semibold">คำตอบกลาง</h5>
          </div>
          <div className="card-body">
            <p className="text-default-600 mb-2 text-sm">
              ใช้เมื่อไม่ได้ตั้งคำตอบเฉพาะเพจ/โฆษณา/สินค้าไว้ — ลูกค้าจะได้รับข้อความนี้ตรงตามที่พิมพ์ทุกตัวอักษร
            </p>
            <textarea className="form-textarea" rows={4} value={defaultReply} disabled={!canEdit}
              maxLength={REPLY_MAX} onChange={(e) => setDefaultReply(e.target.value)}
              placeholder="เช่น สนใจสินค้ารายการไหนคะ ส่งรูปหรือชื่อสินค้าเข้ามาได้เลยค่ะ" />
            <div className="text-default-500 mt-1 text-end text-xs">{defaultReply.length}/{REPLY_MAX}</div>
          </div>
          {canEdit && (
            <div className="card-footer flex justify-end">
              <button className="btn btn-primary" disabled={busy || !defaultReply.trim()} onClick={saveDefaultReply}>
                บันทึกคำตอบกลาง
              </button>
            </div>
          )}
        </div>

        {/* ── คำตอบเฉพาะ ─────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h5 className="text-default-800 text-base font-semibold">คำตอบเฉพาะ ({overrides.length})</h5>
          </div>
          <div className="card-body">
            <p className="text-default-600 mb-3 text-sm">
              ตั้งคำตอบต่างกันตามเพจ โฆษณา หรือสินค้าได้ ระบบจะเลือกอันที่เฉพาะเจาะจงที่สุดก่อนเสมอ
              และถ้าไม่มีจะถอยมาใช้คำตอบกลาง
            </p>
            {overrides.length === 0 ? (
              <p className="text-default-500 text-sm">ยังไม่มีคำตอบเฉพาะ — ทุกเธรดจะได้รับคำตอบกลาง</p>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr><th>เงื่อนไข</th><th>คำตอบ</th><th>สถานะ</th></tr>
                  </thead>
                  <tbody>
                    {overrides.map((r) => (
                      <tr key={r.id}>
                        <td className="text-sm">
                          {r.shopChannelId && <div>เพจ: {channels.find((c) => c.id === r.shopChannelId)?.name ?? r.shopChannelId}</div>}
                          {r.adId && <div>โฆษณา: {r.adLabel ?? r.adId}</div>}
                          {r.productId && <div>สินค้า: {products.find((p) => p.id === r.productId)?.name ?? r.productId}</div>}
                        </td>
                        <td className="text-default-600 max-w-md text-sm">{r.replyText}</td>
                        <td>
                          <span className={`badge ${r.isActive ? 'bg-success/15 text-success' : 'bg-default-200 text-default-600'}`}>
                            {r.isActive ? 'เปิด' : 'ปิด'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── แผงทดสอบ ─────────────────────────────────────────────── */}
      <div className="xl:col-span-1">
        <SimulatePanel channels={channels} products={products} />
      </div>
    </div>
  )
}

/**
 * SimulatePanel — ทดสอบกฎแบบกรอกเอง (FR-020)
 *
 * เรียก /simulate ซึ่งใช้ matcher ตัวเดียวกับเส้นทางตอบจริง (ไม่มี logic คู่ขนาน) —
 * ผลที่เห็นจึงตรงกับสิ่งที่จะเกิดขึ้นจริง (AC-020-05) และไม่เขียน/ไม่ส่งอะไรทั้งสิ้น
 */
function SimulatePanel({
  channels,
  products,
}: {
  channels: { id: string; name: string }[]
  products: { id: string; name: string }[]
}) {
  const [message, setMessage] = useState('')
  const [shopChannelId, setShopChannelId] = useState('')
  const [productId, setProductId] = useState('')
  const [adId, setAdId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<null | {
    matched: { keywordName: string; matchedPhrase: string } | null
    resolutionLevel: string
    replyText: string | null
    willHandoff: boolean
    matchTrace?: { losers?: { keywordName: string; lostAt: string }[] }
  }>(null)

  async function run() {
    if (!message.trim() || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/shops/auto-reply/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          message,
          shopChannelId: shopChannelId || null,
          adId: adId || null,
          productId: productId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'ทดสอบไม่สำเร็จ')
      setResult(data)
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ทดสอบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card xl:sticky xl:top-20">
      <div className="card-header">
        <h5 className="text-default-800 flex items-center gap-2 text-base font-semibold">
          <Icon icon="flask" aria-hidden="true" />
          ทดสอบกฎ
        </h5>
      </div>
      <div className="card-body space-y-3">
        <p className="text-default-500 text-xs">
          ทดลองอย่างเดียว ไม่ส่งข้อความถึงลูกค้า และไม่บันทึกอะไรลงระบบ
        </p>
        <textarea className="form-textarea" rows={2} value={message} placeholder="พิมพ์ข้อความแบบที่ลูกค้าจะทักเข้ามา"
          onChange={(e) => setMessage(e.target.value)} aria-label="ข้อความลูกค้าสมมติ" />
        <select className="form-select" value={shopChannelId} onChange={(e) => setShopChannelId(e.target.value)} aria-label="เพจ">
          <option value="">ไม่ระบุเพจ</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="form-input" value={adId} placeholder="รหัสโฆษณา (ไม่ระบุก็ได้)"
          onChange={(e) => setAdId(e.target.value)} aria-label="รหัสโฆษณา" />
        <select className="form-select" value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="สินค้า">
          <option value="">ไม่ระบุสินค้า</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn btn-primary w-full" disabled={busy || !message.trim()} onClick={run}>
          {busy ? 'กำลังทดสอบ...' : 'ทดสอบ'}
        </button>

        {result && (
          <div className="border-default-200 mt-2 space-y-3 border-t pt-3">
            {result.willHandoff ? (
              <div className="bg-warning/10 border-warning rounded border p-3">
                <p className="text-default-800 text-sm font-medium">ระบบจะไม่ตอบ</p>
                <p className="text-default-600 mt-1 text-xs">
                  ไม่มีกฎที่ใช้ได้กับบริบทนี้ — เธรดจะถูกส่งต่อให้พนักงานแทนการเดาคำตอบ
                </p>
              </div>
            ) : (
              <div>
                <p className="text-default-500 mb-1 text-xs">ลูกค้าจะได้รับ</p>
                {/* บับเบิลแชทจำลอง — ใช้ bg-primary ของ Paces ไม่ใช่สีน้ำเงิน Facebook */}
                <div className="bg-primary w-fit max-w-full rounded-lg px-3 py-2 text-sm text-white">
                  {result.replyText}
                </div>
              </div>
            )}

            <dl className="text-default-600 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt>จับได้</dt>
                <dd className="text-default-800 text-end">
                  {result.matched ? `${result.matched.keywordName} ("${result.matched.matchedPhrase}")` : 'ไม่ตรงกลุ่มคำใด'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>ใช้กฎระดับ</dt>
                <dd className="text-default-800 text-end">
                  {LEVEL_LABEL[result.resolutionLevel] ?? result.resolutionLevel}
                </dd>
              </div>
            </dl>

            {/* AC-020-04: ต้องบอกได้ว่ากฎอื่นทำไมไม่ถูกเลือก — ส่วนที่ reference ของ Facebook ไม่มี */}
            {result.matchTrace?.losers && result.matchTrace.losers.length > 0 && (
              <div>
                <p className="text-default-500 mb-1 text-xs">กลุ่มอื่นที่ไม่ถูกเลือก</p>
                <ul className="text-default-600 space-y-0.5 text-xs">
                  {result.matchTrace.losers.slice(0, 5).map((l, i) => (
                    <li key={i}>· {l.keywordName} (แพ้ที่เกณฑ์ {l.lostAt})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
