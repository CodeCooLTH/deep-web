'use client'

/**
 * KeywordEditorClient V2 — แก้ไขกลุ่มคำ (feature 00023, S-13)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/UI-DESIGN-SPEC-V2.md
 *       mockup: docs/superpowers/specs/2026-07-29-auto-reply-editor-v2-mockup.html
 *
 * Base (card/form-input/textarea/switch): src/app/(paces)/seller/(dashboard)/settings/ai/
 *   AiSettingForm.tsx ซึ่ง Base เดิม = theme/paces/Admin/TS/src/app/(admin)/form/elements/
 *   components/{InputTextfieldType,ChecksRadioSwitches}.tsx
 *
 * WARNING: V1 มองการตั้งค่าเป็น "ตาราง 9 ระดับ" ตามที่ PRD §8 เขียน แต่ 9 ระดับนั้นคือสเปกของ
 * resolver ไม่ใช่แบบจำลองในหัวเจ้าของร้าน ซึ่งคือ "ปกติตอบแบบนี้ ยกเว้น..." — V2 จึงเรียกว่า
 * "คำตอบหลัก" + "ข้อยกเว้น" และเรียงข้อยกเว้นจากเจาะจงมากลงมาน้อยตามลำดับที่ระบบตัดสินจริง
 *
 * toast = pacesToast เท่านั้น (Hard Rule 9)
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'

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
type Channel = { id: string; name: string; provider: string }
type Product = { id: string; name: string; price: string; image: string | null }
type Ad = { adId: string; adTitle: string | null; hitCount: number }

type Props = {
  canEdit: boolean
  shopEnabled: boolean
  keyword: {
    id: string
    name: string
    matchType: string
    priority: number
    isActive: boolean
    phrases: Phrase[]
    rules: Rule[]
  }
  channels: Channel[]
  products: Product[]
}

const MATCH_TYPE_OPTIONS = [
  { value: 'CONTAINS', label: 'มีคำอยู่ในประโยค' },
  { value: 'EXACT', label: 'ตรงทั้งข้อความ' },
  { value: 'STARTS_WITH', label: 'ขึ้นต้นด้วยคำ' },
]

async function callApi(url: string, init: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'ดำเนินการไม่สำเร็จ')
  return data
}

export default function KeywordEditorClient({ canEdit, shopEnabled, keyword, channels, products }: Props) {
  const router = useRouter()

  const [isActive, setIsActive] = useState(keyword.isActive)
  const [name, setName] = useState(keyword.name)
  const [matchType, setMatchType] = useState(keyword.matchType)
  const [priority, setPriority] = useState(keyword.priority)
  const [phrases, setPhrases] = useState(keyword.phrases)
  const [newPhrase, setNewPhrase] = useState('')
  const [rules, setRules] = useState(keyword.rules)
  const [busy, setBusy] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const defaultRule = useMemo(
    () => rules.find((r) => !r.shopChannelId && !r.adId && !r.productId) ?? null,
    [rules],
  )
  const [defaultReply, setDefaultReply] = useState(defaultRule?.replyText ?? '')

  /** ข้อยกเว้นเรียงเจาะจงมากอยู่บน = ลำดับที่ระบบตัดสินจริง (ไม่ใช่ลำดับการสร้าง) */
  const exceptions = useMemo(
    () =>
      rules
        .filter((r) => r.shopChannelId || r.adId || r.productId)
        .sort((a, b) => b.specificity - a.specificity || a.id.localeCompare(b.id)),
    [rules],
  )

  // แถบบันทึกลอย: บอกด้วยว่าแก้อะไรไป ไม่ใช่แค่ว่า "มีการแก้"
  const dirty = useMemo(() => {
    const d: string[] = []
    if (name !== keyword.name) d.push('ชื่อกลุ่ม')
    if (matchType !== keyword.matchType) d.push('รูปแบบการตรวจจับ')
    if (priority !== keyword.priority) d.push('ลำดับความสำคัญ')
    if (defaultReply !== (defaultRule?.replyText ?? '')) d.push('คำตอบหลัก')
    return d
  }, [name, matchType, priority, defaultReply, keyword, defaultRule])

  /**
   * สวิตช์มีผลทันที ไม่ต้องกดบันทึกแยก
   * WARNING: V1 ให้สวิตช์อยู่ในฟอร์มที่ต้องกดบันทึก — user เปิดแล้วนึกว่าทำงาน แต่จริง ๆ ไม่ได้บันทึก
   * แล้วสรุปว่า "ตั้งค่าแล้วระบบไม่ตอบ" (บั๊กจริงบน prod 2026-07-29) ไม่มีใครคาดหวังว่าสวิตช์ต้องยืนยัน
   */
  async function toggleActive(next: boolean) {
    if (!canEdit || busy) return
    setBusy(true)
    setIsActive(next)
    try {
      await callApi(`/api/shops/auto-reply/keywords/${keyword.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      pacesToast.success(next ? 'เปิดใช้งานกลุ่มคำแล้ว' : 'ปิดกลุ่มคำแล้ว')
      router.refresh()
    } catch (e) {
      setIsActive(!next)
      pacesToast.error(e instanceof Error ? e.message : 'เปลี่ยนสถานะไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function saveAll() {
    if (!canEdit || busy || dirty.length === 0) return
    setBusy(true)
    try {
      if (name !== keyword.name || matchType !== keyword.matchType || priority !== keyword.priority) {
        await callApi(`/api/shops/auto-reply/keywords/${keyword.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), matchType, priority }),
        })
      }
      if (defaultReply !== (defaultRule?.replyText ?? '')) {
        const payload = {
          shopChannelId: null, adId: null, adLabel: null, productId: null,
          replyText: defaultReply, isActive: true, activeFrom: null, activeUntil: null,
        }
        if (defaultRule) {
          await callApi(`/api/shops/auto-reply/rules/${defaultRule.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        } else {
          await callApi('/api/shops/auto-reply/rules', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, keywordId: keyword.id }),
          })
        }
      }
      pacesToast.success('บันทึกแล้ว')
      router.refresh()
    } catch (e) {
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
      const data = await callApi(`/api/shops/auto-reply/keywords/${keyword.id}/phrases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrases: [value] }),
      })
      if (data.added?.length) setPhrases((p) => [...p, ...data.added])
      setNewPhrase('')
      if (data.warnings?.length) pacesToast.warning(data.warnings[0])
      else if (data.skipped?.length) pacesToast.warning('คำนี้มีอยู่ในกลุ่มนี้แล้ว')
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เพิ่มคำไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function removePhrase(id: string) {
    if (!canEdit || busy) return
    setBusy(true)
    try {
      await callApi(`/api/shops/auto-reply/keywords/${keyword.id}/phrases/${id}`, { method: 'DELETE' })
      setPhrases((p) => p.filter((x) => x.id !== id))
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function deleteException(id: string) {
    if (!canEdit || busy) return
    setBusy(true)
    try {
      await callApi(`/api/shops/auto-reply/rules/${id}`, { method: 'DELETE' })
      setRules((r) => r.filter((x) => x.id !== id))
      pacesToast.success('ลบข้อยกเว้นแล้ว')
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const condLabel = (r: Rule) => {
    const parts: string[] = []
    if (r.shopChannelId) parts.push(`เพจ ${channels.find((c) => c.id === r.shopChannelId)?.name ?? '—'}`)
    if (r.adId) parts.push(`โฆษณา ${r.adLabel ?? r.adId}`)
    if (r.productId) parts.push(`สินค้า ${products.find((p) => p.id === r.productId)?.name ?? '—'}`)
    return parts
  }

  return (
    <>
      {!shopEnabled && (
        <div className="card bg-warning/10 border-warning mb-4">
          <div className="card-body flex items-center gap-3 py-3">
            <Icon icon="alert-triangle" className="text-warning text-lg" aria-hidden="true" />
            <p className="text-default-700 text-sm">
              ระบบตอบอัตโนมัติปิดอยู่ทั้งร้าน — ตั้งค่าได้ แต่ลูกค้าจะยังไม่ได้รับคำตอบจนกว่าจะเปิดสวิตช์ในหน้ารายการ
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-10">
        <div className="space-y-4 xl:col-span-7">
          {/* ── หัวกลุ่มคำ + คำตรวจจับ ───────────────────────────── */}
          <div className="card">
            <div className="card-header flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <input
                  className="form-input font-semibold"
                  value={name}
                  disabled={!canEdit}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  aria-label="ชื่อกลุ่มคำ"
                />
                <p className="text-default-500 mt-1.5 text-xs">
                  ตรงเมื่อ{matchType === 'EXACT' ? 'ข้อความตรงกับ' : matchType === 'STARTS_WITH' ? 'ข้อความขึ้นต้นด้วย' : 'มีคำว่า'}
                  {phrases.length > 0
                    ? ' ' + phrases.map((p) => `“${p.phrase}”`).join(' หรือ ')
                    : ' — ยังไม่ได้ใส่คำตรวจจับ'}
                </p>
              </div>
              {/* สวิตช์อยู่ก่อนคำว่า เปิด/ปิด แบบเดียวกับ reference — อ่านเป็นประโยคเดียว
                  และมีผลทันทีไม่ต้องกดบันทึก */}
              <label className="flex flex-none cursor-pointer items-center gap-2">
                <input
                  type="checkbox" className="form-switch" checked={isActive}
                  disabled={!canEdit || busy} onChange={(e) => toggleActive(e.target.checked)}
                  aria-label="เปิดใช้งานกลุ่มคำนี้"
                />
                <span className={`text-sm font-medium ${isActive ? 'text-success' : 'text-default-500'}`}>
                  {isActive ? 'เปิด' : 'ปิด'}
                </span>
              </label>
            </div>

            <div className="card-body">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {phrases.map((p) => (
                  <span key={p.id} className="chip bg-default-100 text-default-700 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs">
                    {p.phrase}
                    {canEdit && (
                      <button type="button" onClick={() => removePhrase(p.id)} disabled={busy}
                        aria-label={`ลบคำ ${p.phrase}`} className="text-default-500 hover:text-danger">
                        <Icon icon="x" className="text-xs" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
                {canEdit && (
                  <input
                    className="form-input w-40" value={newPhrase} placeholder="เพิ่มคำ…"
                    onChange={(e) => setNewPhrase(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhrase() } }}
                    maxLength={200} aria-label="คำตรวจจับใหม่"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="k-match" className="text-default-600 mb-1 block text-xs">รูปแบบการตรวจจับ</label>
                  <ChoiceSelect
                    id="k-match" options={MATCH_TYPE_OPTIONS} value={matchType} search={false}
                    disabled={!canEdit} onChange={(v) => setMatchType(v as string)}
                    ariaLabel="รูปแบบการตรวจจับ"
                  />
                </div>
                <div>
                  <label htmlFor="k-pri" className="text-default-600 mb-1 block text-xs">ลำดับความสำคัญ</label>
                  <input id="k-pri" type="number" className="form-input" value={priority} disabled={!canEdit}
                    min={0} max={1000} onChange={(e) => setPriority(Number(e.target.value))} />
                </div>
              </div>
            </div>
          </div>

          {/* ── คำตอบหลัก ─────────────────────────────────────────── */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h5 className="text-default-800 text-base font-semibold">คำตอบหลัก</h5>
              <span className="text-default-500 text-xs">{defaultReply.length}/{REPLY_MAX}</span>
            </div>
            <div className="card-body">
              <textarea className="form-textarea" rows={3} value={defaultReply} disabled={!canEdit}
                maxLength={REPLY_MAX} onChange={(e) => setDefaultReply(e.target.value)}
                placeholder="เช่น สนใจสินค้ารายการไหนคะ ส่งรูปหรือชื่อสินค้าเข้ามาได้เลยค่ะ" />
              <p className="text-default-500 mt-1.5 text-xs">ใช้เมื่อไม่เข้าข้อยกเว้นด้านล่าง</p>
            </div>
          </div>

          {/* ── บันไดข้อยกเว้น ────────────────────────────────────── */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h5 className="text-default-800 text-base font-semibold">ข้อยกเว้น ({exceptions.length})</h5>
              {canEdit && (
                <button className="btn btn-primary btn-sm" onClick={() => setSheetOpen(true)}>
                  <Icon icon="plus" className="me-1" aria-hidden="true" />เพิ่มข้อยกเว้น
                </button>
              )}
            </div>
            <div className="card-body">
              <p className="text-default-500 mb-3 text-xs">
                เฉพาะเจาะจงกว่าอยู่บน — ระบบเลือกอันบนสุดที่เข้าเงื่อนไข
              </p>

              {exceptions.length === 0 ? (
                <div className="border-default-200 rounded border border-dashed px-4 py-6 text-center">
                  <p className="text-default-600 text-sm">ยังไม่มีข้อยกเว้น</p>
                  <p className="text-default-500 mt-1 text-xs">
                    ทุกเธรดจะได้รับคำตอบหลักเหมือนกันหมด — เพิ่มข้อยกเว้นเมื่ออยากตอบต่างกันตามเพจ โฆษณา หรือสินค้า
                  </p>
                </div>
              ) : (
                <div className="border-default-200 overflow-hidden rounded border">
                  {exceptions.map((r, i) => (
                    <div key={r.id}
                      className={`border-default-200 p-3 ${i < exceptions.length - 1 ? 'border-b' : ''} ${i === 0 ? 'border-s-primary border-s-2' : ''}`}>
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-default-400 text-xs">เมื่อมาจาก</span>
                        {condLabel(r).map((c) => (
                          <span key={c} className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-medium">{c}</span>
                        ))}
                      </div>
                      <p className="bg-default-50 text-default-800 rounded p-2 text-sm">{r.replyText}</p>
                      {canEdit && (
                        <div className="mt-2 flex gap-1.5">
                          <button className="btn btn-soft-default btn-sm" disabled={busy}
                            onClick={() => deleteException(r.id)}>ลบ</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* ทำให้การถอยไปคำตอบหลักเป็นสิ่งที่ "เห็น" ไม่ใช่สิ่งที่ต้องรู้เอง */}
                  <div className="bg-default-50 text-default-600 flex items-center gap-2 px-3 py-2.5 text-xs">
                    <Icon icon="corner-down-right" aria-hidden="true" />
                    ไม่เข้าข้อไหนเลย ใช้คำตอบหลัก
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-3">
          <SimulatePanel channels={channels} products={products} keywordId={keyword.id}
            onEnable={() => toggleActive(true)} canEdit={canEdit} />
        </div>
      </div>

      {/* ── แถบบันทึกลอย ───────────────────────────────────────── */}
      {canEdit && dirty.length > 0 && (
        <div className="bg-default-900 sticky bottom-4 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 shadow-lg">
          <span className="text-sm text-white">แก้ไข {dirty.length} อย่าง: {dirty.join(', ')}</span>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-soft-default" disabled={busy}
              onClick={() => {
                setName(keyword.name); setMatchType(keyword.matchType)
                setPriority(keyword.priority); setDefaultReply(defaultRule?.replyText ?? '')
              }}>ยกเลิก</button>
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={saveAll}>บันทึก</button>
          </div>
        </div>
      )}

      {sheetOpen && (
        <ExceptionSheet
          keywordId={keyword.id} channels={channels} products={products}
          onClose={() => setSheetOpen(false)}
          onCreated={(created) => { setRules((r) => [...r, ...created]); setSheetOpen(false); router.refresh() }}
        />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   sheet เพิ่มข้อยกเว้น
   ═══════════════════════════════════════════════════════════════════ */
function ExceptionSheet({
  keywordId, channels, products, onClose, onCreated,
}: {
  keywordId: string
  channels: Channel[]
  products: Product[]
  onClose: () => void
  onCreated: (r: Rule[]) => void
}) {
  const [usePage, setUsePage] = useState(false)
  const [useAd, setUseAd] = useState(false)
  const [useProduct, setUseProduct] = useState(false)
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [adId, setAdId] = useState('')
  const [productId, setProductId] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [reply, setReply] = useState('')
  const [ads, setAds] = useState<Ad[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadAds() {
    if (ads !== null) return
    try {
      const data = await callApi('/api/shops/auto-reply/ads', { method: 'GET' })
      setAds(data.items ?? [])
    } catch {
      setAds([])
    }
  }

  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products.slice(0, 12)
  }, [products, productQuery])

  /** ประโยคสรุปภาษาคน — ผู้ใช้ไม่ต้องรู้จักคำว่า specificity */
  const summary = useMemo(() => {
    const parts: string[] = []
    if (usePage && channelIds.length > 0) {
      const names = channelIds.map((id) => channels.find((c) => c.id === id)?.name).filter(Boolean)
      parts.push(names.length === 1 ? `เพจ “${names[0]}”` : `เพจ ${names.map((n) => `“${n}”`).join(' หรือ ')}`)
    }
    if (useAd && adId) parts.push(`โฆษณา “${ads?.find((a) => a.adId === adId)?.adTitle ?? adId}”`)
    if (useProduct && productId) parts.push(`สินค้า “${products.find((p) => p.id === productId)?.name}”`)
    if (parts.length === 0) return null
    return parts.join(' และ ')
  }, [usePage, useAd, useProduct, channelIds, adId, productId, channels, ads, products])

  const canSubmit = summary !== null && reply.trim().length > 0 && !busy && (!usePage || channelIds.length > 0)

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      // เลือกหลายเพจ = สร้างหลายข้อยกเว้นที่ใช้คำตอบเดียวกัน (1 แถวต่อ 1 เงื่อนไข)
      const targets = usePage && channelIds.length > 0 ? channelIds : [null]
      const created: Rule[] = []
      for (const ch of targets) {
        created.push(
          await callApi('/api/shops/auto-reply/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keywordId,
              shopChannelId: ch,
              adId: useAd ? adId : null,
              adLabel: useAd ? (ads?.find((a) => a.adId === adId)?.adTitle ?? null) : null,
              productId: useProduct ? productId : null,
              replyText: reply.trim(),
              activeFrom: null,
              activeUntil: null,
            }),
          }),
        )
      }
      pacesToast.success(created.length > 1 ? `เพิ่มข้อยกเว้น ${created.length} ข้อแล้ว` : 'เพิ่มข้อยกเว้นแล้ว')
      onCreated(created)
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เพิ่มไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <div className="bg-default-900/50 fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/* max-h-full พอ เพราะ parent เป็น fixed inset-0 ที่มี padding อยู่แล้ว — ไม่ต้องใช้ arbitrary vh */}
      <div className="card mb-0 flex max-h-full w-full max-w-2xl flex-col overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <h5 className="text-default-800 text-base font-semibold">เพิ่มข้อยกเว้น</h5>
          <button onClick={onClose} className="text-default-500" aria-label="ปิด">
            <Icon icon="x" aria-hidden="true" />
          </button>
        </div>

        <div className="card-body flex-1 overflow-y-auto">
          <p className="text-default-600 mb-3 text-sm">ใช้ข้อยกเว้นนี้เมื่อลูกค้า…</p>

          {/* เพจ */}
          <div className={`mb-2.5 rounded border p-3 ${usePage ? 'border-primary' : 'border-default-200'}`}>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="form-checkbox" checked={usePage}
                onChange={(e) => setUsePage(e.target.checked)} />
              มาจากเพจ
            </label>
            {usePage && (
              // ติ๊กได้หลายเพจ — เลือก 2 เพจ = สร้างข้อยกเว้น 2 ข้อที่ใช้คำตอบเดียวกัน
              // (ตาราง AutoReplyRule เก็บ 1 แถวต่อ 1 เงื่อนไข ไม่ใช่ array ของเพจ)
              <div className="mt-2.5 space-y-1.5">
                {channels.length === 0 && <p className="text-default-500 text-xs">ยังไม่ได้เชื่อมเพจใด</p>}
                {channels.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox" className="form-checkbox"
                      checked={channelIds.includes(c.id)}
                      onChange={(e) =>
                        setChannelIds((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                      }
                    />
                    <span className="text-default-700">{c.name}</span>
                    <span className="text-default-400 text-xs">{c.provider === 'INSTAGRAM' ? 'Instagram' : 'Messenger'}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* โฆษณา */}
          <div className={`mb-2.5 rounded border p-3 ${useAd ? 'border-primary' : 'border-default-200'}`}>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="form-checkbox" checked={useAd}
                onChange={(e) => { setUseAd(e.target.checked); if (e.target.checked) loadAds() }} />
              กดมาจากโฆษณา
            </label>
            {useAd && (
              <div className="mt-2.5">
                {ads === null ? (
                  <p className="text-default-500 text-xs">กำลังโหลด…</p>
                ) : ads.length === 0 ? (
                  <p className="text-default-500 text-xs">ยังไม่มีลูกค้าทักเข้ามาจากโฆษณาใด</p>
                ) : (
                  ads.map((a) => (
                    <button key={a.adId} type="button" onClick={() => setAdId(a.adId)}
                      className={`mb-1.5 flex w-full items-center gap-2.5 rounded border p-2.5 text-start ${adId === a.adId ? 'border-primary bg-primary/5' : 'border-default-200'}`}>
                      <span className={`size-4 flex-none rounded-full border-2 ${adId === a.adId ? 'border-primary border-4' : 'border-default-300'}`} />
                      <span className="min-w-0">
                        <span className="text-default-800 block text-sm font-medium">{a.adTitle ?? a.adId}</span>
                        <span className="text-default-500 block text-xs">ทัก {a.hitCount} ครั้ง</span>
                      </span>
                    </button>
                  ))
                )}
                <p className="text-default-500 mt-1 text-xs">เลือกจากโฆษณาที่เคยมีลูกค้าทักเข้ามาจริง</p>
              </div>
            )}
          </div>

          {/* สินค้า — การ์ดมีรูป */}
          <div className={`mb-2.5 rounded border p-3 ${useProduct ? 'border-primary' : 'border-default-200'}`}>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="form-checkbox" checked={useProduct}
                onChange={(e) => setUseProduct(e.target.checked)} />
              สนใจสินค้า
            </label>
            {useProduct && (
              <div className="mt-2.5">
                <input className="form-input mb-2.5" placeholder="ค้นหาสินค้า…" value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)} aria-label="ค้นหาสินค้า" />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {visibleProducts.map((p) => (
                    <button key={p.id} type="button" onClick={() => setProductId(p.id)}
                      className={`overflow-hidden rounded border text-start ${productId === p.id ? 'border-primary ring-primary/20 ring-2' : 'border-default-200'}`}>
                      <span className="bg-default-100 flex h-16 items-center justify-center overflow-hidden">
                        {p.image ? (
                          <img src={p.image} alt="" className="size-full object-cover" />
                        ) : (
                          <Icon icon="package" className="text-default-400 text-xl" aria-hidden="true" />
                        )}
                      </span>
                      <span className="block p-1.5">
                        <span className="text-default-800 line-clamp-2 block text-xs font-medium">{p.name}</span>
                        <span className="text-primary block text-xs font-semibold">฿{p.price}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <label htmlFor="ex-reply" className="text-default-700 mb-1 block text-sm font-medium">ตอบว่า</label>
            <textarea id="ex-reply" className="form-textarea" rows={3} value={reply} maxLength={REPLY_MAX}
              onChange={(e) => setReply(e.target.value)} placeholder="ข้อความที่จะส่งให้ลูกค้าเมื่อเข้าเงื่อนไขนี้" />
            <div className="text-default-500 mt-1 text-end text-xs">{reply.length}/{REPLY_MAX}</div>
          </div>

          {summary && (
            <div className="bg-primary/8 text-primary mt-3 rounded p-3 text-xs leading-relaxed">
              ข้อยกเว้นนี้จะถูกใช้เมื่อลูกค้าทักจาก {summary}
              <br />
              ยิ่งระบุเงื่อนไขหลายอย่าง ยิ่งอยู่สูงในลำดับ และถูกเลือกก่อนข้อที่ระบุน้อยกว่า
            </div>
          )}
        </div>

        <div className="card-footer flex justify-end gap-2">
          <button className="btn btn-soft-default" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>เพิ่มข้อยกเว้น</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   แผงทดสอบ
   ═══════════════════════════════════════════════════════════════════ */
function SimulatePanel({
  channels, products, keywordId, onEnable, canEdit,
}: {
  channels: Channel[]
  products: Product[]
  keywordId: string
  onEnable: () => void
  canEdit: boolean
}) {
  const [message, setMessage] = useState('')
  const [shopChannelId, setShopChannelId] = useState('')
  const [productId, setProductId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<null | {
    rawText: string
    matched: { keywordName: string; matchedPhrase: string } | null
    replyText: string | null
    willHandoff: boolean
    blockedBy: { reason: string; keywordId: string; keywordName: string } | null
    shopEnabled: boolean
    matchTrace?: { losers?: { keywordName: string; lostAt: string }[] }
  }>(null)

  async function run() {
    if (!message.trim() || busy) return
    setBusy(true)
    try {
      const data = await callApi('/api/shops/auto-reply/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message, shopChannelId: shopChannelId || null, adId: null, productId: productId || null,
        }),
      })
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
          <Icon icon="flask" aria-hidden="true" />ทดสอบกฎ
        </h5>
      </div>
      <div className="card-body space-y-2.5">
        <p className="text-default-500 text-xs">ทดลองอย่างเดียว ไม่ส่งถึงลูกค้า ไม่บันทึกอะไร</p>
        <textarea className="form-textarea" rows={2} value={message}
          placeholder="พิมพ์ข้อความแบบที่ลูกค้าจะทักเข้ามา"
          onChange={(e) => setMessage(e.target.value)} aria-label="ข้อความลูกค้าสมมติ" />
        <ChoiceSelect
          options={channels.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="ไม่ระบุเพจ" value={shopChannelId} search={false}
          onChange={(v) => setShopChannelId(v as string)} ariaLabel="เพจ"
        />
        <ChoiceSelect
          options={products.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="ไม่ระบุสินค้า" value={productId} search
          onChange={(v) => setProductId(v as string)} ariaLabel="สินค้า"
        />
        <button className="btn btn-primary w-full" disabled={busy || !message.trim()} onClick={run}>
          {busy ? 'กำลังทดสอบ…' : 'ทดสอบ'}
        </button>

        {result && (
          <div className="border-default-200 space-y-3 border-t pt-3">
            {/* ถ้าระบบรู้สาเหตุ ต้องบอกสาเหตุ ไม่ใช่บอกอาการ — และถ้าแก้ได้ในคลิกเดียวให้ปุ่มไปเลย */}
            {result.blockedBy?.reason === 'KEYWORD_INACTIVE' ? (
              <div className="bg-warning/10 border-warning rounded border p-3">
                <p className="text-default-800 text-sm font-medium">กลุ่มคำนี้ปิดอยู่</p>
                <p className="text-default-600 mt-1 text-xs">
                  คำที่ตั้งไว้ตรงกับข้อความนี้ แต่ระบบยังไม่นำมาใช้เพราะกลุ่ม “{result.blockedBy.keywordName}” ยังไม่เปิด
                </p>
                {canEdit && result.blockedBy.keywordId === keywordId && (
                  <button className="btn btn-primary btn-sm mt-2" onClick={onEnable}>เปิดใช้งานเลย</button>
                )}
              </div>
            ) : !result.shopEnabled ? (
              <div className="bg-warning/10 border-warning rounded border p-3">
                <p className="text-default-800 text-sm font-medium">ระบบตอบอัตโนมัติปิดอยู่ทั้งร้าน</p>
                <p className="text-default-600 mt-1 text-xs">ผลด้านล่างคือสิ่งที่จะเกิดขึ้นเมื่อเปิดสวิตช์ใหญ่แล้ว</p>
              </div>
            ) : null}

            {/* กรอบมือถือ — ให้ร้านเห็นว่าลูกค้าจะเห็นอะไรจริง ๆ ไม่ใช่แค่ข้อความลอย */}
            <div className="border-default-300 bg-default-100 mx-auto w-full max-w-64 rounded-3xl border-4 p-2">
              <div className="bg-white rounded-2xl p-2.5">
                <div className="border-default-200 mb-2 flex items-center gap-2 border-b pb-2">
                  <span className="bg-default-200 flex size-6 items-center justify-center rounded-full">
                    <Icon icon="user" className="text-default-500 text-xs" aria-hidden="true" />
                  </span>
                  <span className="text-default-700 truncate text-xs font-medium">ลูกค้า</span>
                </div>

                {/* ข้อความที่ลูกค้าพิมพ์ */}
                <div className="mb-1.5 flex justify-end">
                  <span className="bg-default-100 text-default-800 max-w-full rounded-xl rounded-br-sm px-2.5 py-1.5 text-xs">
                    {result.rawText}
                  </span>
                </div>

                {/* คำตอบของระบบ */}
                {result.willHandoff ? (
                  <div className="border-default-200 rounded-lg border border-dashed px-2.5 py-2">
                    <p className="text-default-700 text-xs font-medium">ระบบจะไม่ตอบ</p>
                    <p className="text-default-500 mt-0.5 text-xs">
                      {result.matched ? 'ยังไม่มีคำตอบให้ใช้ — ส่งต่อพนักงาน' : 'ไม่เข้าเงื่อนไขข้อใด — ส่งต่อพนักงาน'}
                    </p>
                  </div>
                ) : (
                  <div className="flex justify-start">
                    <span className="bg-primary max-w-full rounded-xl rounded-bl-sm px-2.5 py-1.5 text-xs text-white">
                      {result.replyText}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {result.matched && (
              <dl className="text-default-600 space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt>จับได้</dt>
                  <dd className="text-default-800 text-end">
                    {result.matched.keywordName} (“{result.matched.matchedPhrase}”)
                  </dd>
                </div>
              </dl>
            )}

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
