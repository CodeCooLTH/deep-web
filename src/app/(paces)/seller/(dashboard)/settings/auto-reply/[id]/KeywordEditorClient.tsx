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
 * "คำตอบหลัก" + "เงื่อนไขเฉพาะ" เรียงจากเจาะจงมากลงมาน้อยตามลำดับที่ระบบตัดสินจริง
 * (ไม่ใช้คำว่า "ข้อยกเว้น" เพราะร้านที่ตั้งคำตอบต่อโฆษณาทุกตัว สิ่งเหล่านั้นคือของหลัก
 *  ไม่ใช่ของแปลก — user ทักท้วง 2026-07-29 และถูกต้อง)
 *
 * toast = pacesToast เท่านั้น (Hard Rule 9)
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import PagePicker from './PagePicker'
import TestThreadsCard from './TestThreadsCard'

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
type Channel = { id: string; name: string; provider: string; avatarUrl?: string | null }
type Product = { id: string; name: string; price: string; image: string | null }
type Ad = { adId: string; adTitle: string | null; hitCount: number }

type Props = {
  canEdit: boolean
  keyword: {
    id: string
    name: string
    matchType: string
    priority: number
    status: string
    testThreadCount: number
    phrases: Phrase[]
    rules: Rule[]
  }
  channels: Channel[]
  products: Product[]
}

async function callApi(url: string, init: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'ดำเนินการไม่สำเร็จ')
  return data
}

/** สถานะ 3 ค่าของกลุ่มคำ — เขียวสงวนให้ "ตอบลูกค้าจริง" ตาม Verified-Means-Green */
const STATUS_ORDER = ['OFFLINE', 'TEST', 'LIVE'] as const
const STATUS_META: Record<string, { label: string; active: string }> = {
  OFFLINE: { label: 'ไม่ใช้งาน', active: 'bg-default-500 text-white' },
  TEST: { label: 'ทดสอบ', active: 'bg-warning text-white' },
  LIVE: { label: 'ตอบลูกค้าจริง', active: 'bg-success text-white' },
}

export default function KeywordEditorClient({ canEdit, keyword, channels, products }: Props) {
  const router = useRouter()

  const [status, setStatus] = useState(keyword.status)
  const [testThreadCount, setTestThreadCount] = useState(keyword.testThreadCount)
  const [name, setName] = useState(keyword.name)
  /**
   * รูปแบบการตรวจจับล็อกไว้ที่ค่าเดิมของชุดนั้น ไม่ให้แก้ผ่าน UI (user 2026-07-29)
   *
   * เอาตัวเลือกออกเพราะผู้ใช้ส่วนใหญ่ไม่เข้าใจความต่าง และค่าที่ "ทำงานจริง" มีตัวเดียว:
   * ลูกค้าไทยไม่พิมพ์คำเปล่า ๆ ("สนใจครับ" / "สนใจ ราคาเท่าไหร่") ถ้าใช้ EXACT จะแทบไม่ match เลย
   * คอลัมน์ยังอยู่ใน DB — ชุดเก่าที่เคยตั้ง EXACT/STARTS_WITH ไว้ยังทำงานเหมือนเดิม
   */
  const matchType = keyword.matchType
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

  /** เงื่อนไขเฉพาะเรียงเจาะจงมากอยู่บน = ลำดับที่ระบบตัดสินจริง (ไม่ใช่ลำดับการสร้าง) */
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
    if (priority !== keyword.priority) d.push('ลำดับความสำคัญ')
    if (defaultReply !== (defaultRule?.replyText ?? '')) d.push('คำตอบหลัก')
    return d
  }, [name, priority, defaultReply, keyword, defaultRule])

  /**
   * เปลี่ยนสถานะมีผลทันที ไม่ต้องกดบันทึกแยก
   * WARNING: V1 ให้สวิตช์อยู่ในฟอร์มที่ต้องกดบันทึก — user เปิดแล้วนึกว่าทำงาน แต่จริง ๆ ไม่ได้บันทึก
   * แล้วสรุปว่า "ตั้งค่าแล้วระบบไม่ตอบ" (บั๊กจริงบน prod 2026-07-29) ไม่มีใครคาดหวังว่าสวิตช์ต้องยืนยัน
   */
  async function changeStatus(next: string) {
    if (!canEdit || busy || next === status) return
    if (next === 'LIVE') {
      const ok = await pacesConfirm.warning(
        'ให้กลุ่มคำนี้ตอบลูกค้าจริง?',
        'หลังจากนี้ลูกค้าทุกคนที่ทักเข้ามาและพิมพ์ตรงกับคำในกลุ่มนี้ จะได้รับคำตอบอัตโนมัติทันที',
        { confirmButtonText: 'ตอบลูกค้าจริง' },
      )
      if (!ok) return
    }
    setBusy(true)
    const prev = status
    setStatus(next)
    try {
      await callApi(`/api/shops/auto-reply/keywords/${keyword.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      pacesToast.success(`เปลี่ยนเป็น "${STATUS_META[next]?.label ?? next}" แล้ว`)
      router.refresh()
    } catch (e) {
      setStatus(prev)
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
      /**
       * WARNING: ชื่อ field ต้องตรงกับ AddPhrasesResult ของ service เป๊ะ —
       * `created` / `duplicateInGroup` / `emptyAfterNormalize` / `warnings[]{phrase,...}`
       * ของเดิมอ่าน `added` / `skipped` ซึ่ง **ไม่มีจริง** ผลคือบันทึกสำเร็จ (201) แต่ชิป
       * ไม่ขึ้นจนกว่าจะรีโหลดหน้า และเตือน "คำซ้ำ" ไม่เคยทำงานเลย (บั๊กจริง จับได้ตอนเขียน
       * E2E 2026-07-30 — grep + tsc มองไม่เห็นเพราะ response เป็น any)
       */
      if (data.created?.length) setPhrases((p) => [...p, ...data.created])
      setNewPhrase('')
      if (data.warnings?.length) {
        const w = data.warnings[0]
        pacesToast.warning(`"${w.phrase}" ใช้อยู่ในกลุ่ม "${w.conflictKeywordName}" ด้วย`)
      } else if (data.duplicateInGroup?.length) {
        pacesToast.warning('คำนี้มีอยู่ในกลุ่มนี้แล้ว')
      } else if (data.emptyAfterNormalize?.length) {
        pacesToast.warning('คำนี้ใช้ไม่ได้ — มีแต่วรรคตอนหรือช่องว่าง')
      }
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
      pacesToast.success('ลบเงื่อนไขเฉพาะแล้ว')
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
      {/* subheader ใต้หัวเรื่อง (user request 2026-07-29) — เทียบเคียงข้อความของ reference
          แต่เขียนให้ตรงกับสิ่งที่ระบบเราทำจริง: ของเราจับคำ ไม่ใช่ตอบข้อความแรกเสมอ */}
      <div className="mb-4">
        <p className="text-default-600 text-sm">
          ตอบลูกค้าที่ทักเข้ามาทาง Messenger หรือ Instagram โดยอัตโนมัติ
          เมื่อข้อความตรงกับคำที่คุณตั้งไว้ ปรับข้อความได้เองว่าจะทักทาย ให้ข้อมูลเพิ่มเติม
          หรือบอกว่าจะติดต่อกลับเมื่อไหร่ และตั้งคำตอบต่างกันตามเพจหรือโฆษณาที่ลูกค้าเข้ามาได้
        </p>
      </div>

      {status === 'TEST' && (
        <div className="card bg-warning/10 border-warning mb-4">
          <div className="card-body flex items-center gap-3 py-3">
            <span className="bg-warning flex size-8 flex-none items-center justify-center rounded-lg text-white">
              <Icon icon="flask" className="text-base" aria-hidden="true" />
            </span>
            <p className="text-default-700 mb-0 text-sm">
              {testThreadCount > 0
                ? `กลุ่มคำนี้อยู่ในโหมดทดสอบ — ตอบเฉพาะ ${testThreadCount} แชทที่เลือกไว้ด้านล่างเท่านั้น ลูกค้าทั่วไปจะยังไม่ได้รับคำตอบจากชุดนี้ (ชุดอื่นที่ตอบลูกค้าจริงอยู่ไม่กระทบ)`
                : 'กลุ่มคำนี้อยู่ในโหมดทดสอบแต่ยังไม่ได้เลือกแชทสำหรับทดสอบ — ตอนนี้จึงไม่ตอบใครเลย เพิ่มแชทในตาราง "แชทสำหรับทดสอบ" ด้านล่างก่อน'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-10">
        <div className="xl:col-span-7">
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
              {/* สถานะของกลุ่มคำนี้ 3 ค่า — ค่าเดียวจบ ไม่มีสวิตช์เปิด/ปิดซ้อนอีกชั้น
                  (user 2026-07-29: "ทดสอบไม่เท่ากับ INACTIVE นะ ต้องมี 3 สถานะ")
                  มีผลทันทีไม่ต้องกดบันทึก */}
              <div className="bg-light inline-flex flex-none rounded-lg p-0.5" role="group" aria-label="สถานะของกลุ่มคำนี้">
                {STATUS_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => changeStatus(key)}
                    aria-pressed={status === key}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      status === key ? STATUS_META[key].active : 'text-default-500 hover:text-default-800'
                    }`}
                  >
                    {STATUS_META[key].label}
                  </button>
                ))}
              </div>
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

              <div className="sm:w-48">
                <label htmlFor="k-pri" className="text-default-600 mb-1 block text-xs">ลำดับความสำคัญ</label>
                <input id="k-pri" type="number" className="form-input" value={priority} disabled={!canEdit}
                  min={0} max={1000} onChange={(e) => setPriority(Number(e.target.value))} />
                <p className="text-default-500 mt-1 text-xs">
                  ใช้เมื่อข้อความเดียวเข้าหลายกลุ่มพร้อมกัน — ตัวเลขมากกว่าถูกเลือกก่อน
                </p>
              </div>
            </div>
          </div>


          {/* เส้นเชื่อมระหว่างขั้น — สื่อว่าอ่านต่อเนื่องเป็นลำดับ (ตาม reference ที่ user ส่ง) */}
          <div className="border-default-300 ms-6 h-4 border-s border-dashed" aria-hidden="true" />

          {/* ── [B] บันไดคำตอบ = พระเอกของหน้า ─────────────────────────
              ยุบการ์ดคำตอบพื้นฐาน + การ์ดเงื่อนไขเฉพาะเป็นบันไดใบเดียว: ลำดับแถวบนลงล่าง
              = ลำดับที่ resolver ไล่จริง และแถวสุดท้ายคือ textarea คำตอบพื้นฐานตัวจริง
              โครงนี้เองคือคำอธิบายกลไก จึงไม่ต้องมีย่อหน้าสอน (Impeccable critique 2026-07-30
              Help 2/4 + Aesthetic 2/4 แก้ด้วยของชิ้นเดียว)
              Base: theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx → Numbered (:381-411) */}
          <div className="card">
            <div className="card-header items-start">
              <div className="min-w-0">
                {/* ไอคอนแผ่น + text-lg มีที่นี่ใบเดียวในหน้า = ตัวแยกขั้นพระเอก/การ์ดรอง (spec §7)
                    ใช้ treatment เป็นตัวแยกขั้น ไม่ใช่ "ใบเดียวมีสี ที่เหลือเทา" ซึ่งจะพาหน้ากลับไปจาง */}
                <h5 className="text-default-900 flex items-center gap-2 text-lg font-semibold">
                  <span className="bg-primary/15 text-primary flex size-8 flex-none items-center justify-center rounded-lg">
                    {/* message-reply ไม่ใช่ message-2-reply — ชื่อหลังไม่มีในชุด tabler (ยืนยันกับ
                        api.iconify.design แล้ว) ถ้าใส่ชื่อที่ไม่มี @iconify/react จะไม่ render svg เลย
                        โดยไม่ throw และ tsc/grep/E2E ผ่านหมด = เห็นเป็นแผ่นสีว่าง ๆ เท่านั้น */}
                    <Icon icon="message-reply" className="size-4.5" aria-hidden="true" />
                  </span>
                  คำตอบที่ลูกค้าจะได้รับ
                </h5>
                {/* CL-6: อธิบายกลไกเฉพาะเมื่อมีบันไดให้ไล่จริง — ตอน 0 เงื่อนไขประโยคนี้จะอธิบาย
                    กลไกที่ยังไม่ทำงาน = เพิ่มภาระให้ร้านมือใหม่ซึ่งเป็นคนส่วนใหญ่ */}
                {exceptions.length >= 1 && (
                  <p className="text-default-700 mt-1.5 text-xs">
                    ระบบไล่จากบนลงล่าง เจอข้อแรกที่ตรงก็ตอบข้อนั้นแล้วหยุด
                  </p>
                )}
              </div>
              {canEdit && (
                // CL-4: btn-primary ไม่มีนิยามใน (paces) เหมือน btn-soft-* → ใช้ variant จริงตาม
                // paces-component-reference.md §1 (ไม่งั้นปุ่มเรนเดอร์เป็นตัวหนังสือลอย ๆ)
                <button type="button"
                  className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 flex-none text-white max-sm:w-full sm:min-h-0"
                  onClick={() => setSheetOpen(true)}>
                  <Icon icon="plus" className="size-3" aria-hidden="true" />เพิ่มเงื่อนไขเฉพาะ
                </button>
              )}
            </div>
            <div className="card-body">
              {/* overflow-hidden เพิ่มจาก theme — กันเส้น accent ซ้ายของแถวสุดท้ายทะลุมุมที่ rounded */}
              <ul className="divide-default-200 border-default-300 divide-y overflow-hidden rounded border">
                {exceptions.map((r, i) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-1.5 px-4.75 py-3">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div className="bg-primary/10 text-primary text-2xs flex size-5.5 flex-none items-center justify-center rounded font-semibold">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-default-700 text-xs">เมื่อมาจาก</span>
                          {condLabel(r).map((c) => (
                            <span key={c} className="bg-primary/10 text-primary max-w-full truncate rounded px-2 py-0.5 text-xs font-medium">{c}</span>
                          ))}
                        </div>
                        {/* ข้อความล้วน ไม่ใส่กล่องซ้อนกล่องในบันได (anti-slop) */}
                        <p className="text-default-800 mt-1 line-clamp-3 text-sm">{r.replyText}</p>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1.5 max-sm:w-full">
                        {/* handler ของ "แก้ไข" (เปิด sheet โหมดแก้) เป็นงาน S-05 — รอบนี้ยัง disabled */}
                        <button type="button" disabled
                          className="btn btn-sm bg-light text-dark hover:bg-light-hover min-h-11 flex-1 justify-center sm:min-h-0 sm:flex-none"
                          aria-label={`แก้ไขเงื่อนไขข้อ ${i + 1}`}>
                          <Icon icon="pencil" className="size-3" aria-hidden="true" />แก้ไข
                        </button>
                        <button type="button" disabled={busy}
                          className="btn btn-sm text-danger hover:bg-danger min-h-11 flex-1 justify-center hover:text-white sm:min-h-0 sm:flex-none"
                          aria-label={`ลบเงื่อนไขข้อ ${i + 1}`}
                          onClick={() => deleteException(r.id)}>
                          <Icon icon="trash" className="size-3" aria-hidden="true" />ลบ
                        </button>
                      </div>
                    )}
                  </li>
                ))}

                {/* แถวสุดท้าย = คำตอบพื้นฐานตัวจริง · เส้น accent ซ้ายอยู่ที่ "แถว" ไม่ใช่ขอบการ์ด
                    accent จึงชี้ของจริงและไม่ซ้อน 2 ชั้น (accepted exception ตาม DESIGN.md §6 / spec §7) */}
                <li className="border-s-primary border-s-3 px-4.75 py-3">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {/* label ครอบเฉพาะข้อความ ห้ามครอบ badge — ไม่งั้น accessible name ของ textarea เพี้ยน */}
                    <label htmlFor="k-fallback-reply" className="text-default-800 mb-0 text-sm font-semibold">
                      ทุกกรณีที่เหลือ
                    </label>
                    <span className="badge bg-default-200 text-default-700">ใช้เมื่อไม่เข้าข้อไหนเลย</span>
                  </div>
                  {/* WARNING: ห้ามห่อ textarea ด้วย div ที่มี border แล้วสั่ง border-0 ที่ตัว textarea —
                      `_forms.css` ของ Paces ไม่ห่อ @layer ทำให้ style ระดับ element ชนะ utility ของ
                      Tailwind กรอบของ textarea จึงไม่หาย ได้กรอบซ้อนกรอบ (บั๊กจริง 2026-07-29,
                      ตรงกับ memory feedback_paces_forms_css_gotchas) — ใช้ form-textarea ตรง ๆ
                      แล้ววางตัวนับไว้นอกกรอบแทน */}
                  <textarea id="k-fallback-reply" className="form-textarea" rows={4} value={defaultReply} disabled={!canEdit}
                    maxLength={REPLY_MAX} onChange={(e) => setDefaultReply(e.target.value)}
                    placeholder="เช่น สนใจสินค้ารายการไหนคะ ส่งรูปหรือชื่อสินค้าเข้ามาได้เลยค่ะ"
                    aria-label="ทุกกรณีที่เหลือ" />
                  <div className="mt-1.5 flex justify-end">
                    <span className="text-default-400 text-2xs">{defaultReply.length}/{REPLY_MAX}</span>
                  </div>
                </li>
              </ul>

              {/* 0 เงื่อนไข (เคสพบบ่อยสุด): ไม่มีเลขลำดับ ไม่มีกล่องเส้นประ — ชวนเบา ๆ บรรทัดเดียว */}
              {canEdit && exceptions.length === 0 && (
                <p className="text-default-700 mt-3 text-xs">
                  อยากตอบต่างกันตามเพจ โฆษณา หรือสินค้า?{' '}
                  <button type="button" className="text-primary font-medium hover:underline"
                    onClick={() => setSheetOpen(true)}>เพิ่มเงื่อนไขเฉพาะ</button>
                </p>
              )}
            </div>
          </div>

          {/* เส้นเชื่อมระหว่างขั้น */}
          <div className="border-default-300 ms-6 h-4 border-s border-dashed" aria-hidden="true" />

          {/* ── แชทสำหรับทดสอบ ─────────────────────────────────────
              user 2026-07-29: "แล้วไหนเลือกช่องทางทดสอบ ... มันควรมี table สำหรับ lists รายการแชท"
              อยู่ในหน้าของกลุ่มคำ ไม่ใช่หน้าตั้งค่ารวม เพราะรายการนี้เป็นของกลุ่มคำนี้ตัวเดียว */}
          <TestThreadsCard
            keywordId={keyword.id}
            status={status}
            canEdit={canEdit}
            onCountChange={setTestThreadCount}
          />
        </div>

        <div className="xl:col-span-3">
          <SimulatePanel channels={channels} products={products} keywordId={keyword.id}
            previewReply={defaultReply}
            onEnable={() => changeStatus('TEST')} canEdit={canEdit} />
        </div>
      </div>

      {/* ── footer บันทึก (ตาม reference) — เห็นตลอด ปุ่มจางเมื่อยังไม่มีการแก้
             ต่างจาก reference ตรงที่บอกด้วยว่าแก้อะไรไปบ้าง ซึ่งช่วยตอนแก้หลายจุดพร้อมกัน ── */}
      {canEdit && (
        <div className="card sticky bottom-4 z-10 mt-4">
          <div className="card-body flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="text-default-600 text-sm">
              {dirty.length > 0 ? `แก้ไข ${dirty.length} อย่าง: ${dirty.join(', ')}` : 'ยังไม่มีการเปลี่ยนแปลง'}
            </span>
            <div className="flex gap-2">
              <button className="btn btn-soft-default" disabled={busy || dirty.length === 0}
                onClick={() => {
                  setName(keyword.name)
                  setPriority(keyword.priority); setDefaultReply(defaultRule?.replyText ?? '')
                }}>ล้างที่แก้ไว้</button>
              <button className="btn btn-primary" disabled={busy || dirty.length === 0} onClick={saveAll}>
                บันทึกการเปลี่ยนแปลง
              </button>
            </div>
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
   sheet เพิ่มเงื่อนไขเฉพาะ
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
  const [adIds, setAdIds] = useState<string[]>([])
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
    if (useAd && adIds.length > 0) {
      const names = adIds.map((id) => ads?.find((a) => a.adId === id)?.adTitle ?? id)
      parts.push(names.length === 1 ? `โฆษณา “${names[0]}”` : `โฆษณา ${names.map((n) => `“${n}”`).join(' หรือ ')}`)
    }
    if (useProduct && productId) parts.push(`สินค้า “${products.find((p) => p.id === productId)?.name}”`)
    if (parts.length === 0) return null
    return parts.join(' และ ')
  }, [usePage, useAd, useProduct, channelIds, adIds, productId, channels, ads, products])

  const canSubmit =
    summary !== null && reply.trim().length > 0 && !busy &&
    (!usePage || channelIds.length > 0) && (!useAd || adIds.length > 0)

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      // เลือกหลายเพจ/หลายโฆษณา = สร้างเงื่อนไขเฉพาะทุกคู่ผสม (1 แถวต่อ 1 เงื่อนไข)
      const pageTargets = usePage && channelIds.length > 0 ? channelIds : [null]
      const adTargets = useAd && adIds.length > 0 ? adIds : [null]
      const created: Rule[] = []
      for (const ch of pageTargets) {
        for (const ad of adTargets) {
          created.push(
            await callApi('/api/shops/auto-reply/rules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keywordId,
                shopChannelId: ch,
                adId: ad,
                adLabel: ad ? (ads?.find((a) => a.adId === ad)?.adTitle ?? null) : null,
                productId: useProduct ? productId : null,
                replyText: reply.trim(),
                activeFrom: null,
                activeUntil: null,
              }),
            }),
          )
        }
      }
      pacesToast.success(created.length > 1 ? `เพิ่มเงื่อนไขเฉพาะ ${created.length} ข้อแล้ว` : 'เพิ่มเงื่อนไขเฉพาะแล้ว')
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
          <h5 className="text-default-800 flex items-center gap-2 text-base font-semibold">
            <Icon icon="git-branch" className="text-primary text-lg" aria-hidden="true" />
            เพิ่มเงื่อนไขเฉพาะ
          </h5>
          <button onClick={onClose} className="text-default-500" aria-label="ปิด">
            <Icon icon="x" aria-hidden="true" />
          </button>
        </div>

        <div className="card-body flex-1 overflow-y-auto">
          <p className="text-default-600 mb-3 text-sm">ใช้คำตอบนี้เมื่อลูกค้า…</p>

          {/* เพจ */}
          <div className={`mb-2.5 rounded border p-3 ${usePage ? 'border-primary' : 'border-default-200'}`}>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="form-checkbox" checked={usePage}
                onChange={(e) => setUsePage(e.target.checked)} />
              มาจากเพจ
            </label>
            {usePage && (
              // ติ๊กได้หลายเพจ — เลือก 2 เพจ = สร้างเงื่อนไขเฉพาะ 2 ข้อที่ใช้คำตอบเดียวกัน
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
                  ads.map((a) => {
                    const on = adIds.includes(a.adId)
                    return (
                      <label key={a.adId}
                        className={`mb-1.5 flex w-full cursor-pointer items-center gap-2.5 rounded border p-2.5 ${on ? 'border-primary bg-primary/5' : 'border-default-200'}`}>
                        <input
                          type="checkbox" className="form-checkbox flex-none" checked={on}
                          onChange={(e) =>
                            setAdIds((prev) => (e.target.checked ? [...prev, a.adId] : prev.filter((x) => x !== a.adId)))
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-default-800 block truncate text-sm font-medium">{a.adTitle ?? a.adId}</span>
                          {/* แสดง ID ด้วย (user request) — ชื่อโฆษณาซ้ำกันได้ ID คือตัวที่แยกออกจริง
                              และร้านเอาไปเทียบกับ Ads Manager ได้ */}
                          <span className="text-default-500 block truncate text-xs">
                            ID {a.adId} · ทัก {a.hitCount} ครั้ง
                          </span>
                        </span>
                      </label>
                    )
                  })
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
              คำตอบนี้จะถูกใช้เมื่อลูกค้าทักจาก {summary}
              <br />
              ยิ่งระบุเงื่อนไขหลายอย่าง ยิ่งอยู่สูงในลำดับ และถูกเลือกก่อนข้อที่ระบุน้อยกว่า
            </div>
          )}
        </div>

        <div className="card-footer flex justify-end gap-2">
          <button className="btn btn-soft-default" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>เพิ่มเงื่อนไขเฉพาะ</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   แผงดูตัวอย่างการตอบ — หน้าตาเหมือนห้องแชทจริง (user 2026-07-29)
   ═══════════════════════════════════════════════════════════════════ */
type SimTurn =
  | { who: 'customer'; text: string }
  | { who: 'page'; text: string; note?: string }
  | { who: 'none'; text: string }

function SimulatePanel({
  channels,
  previewReply,
  onEnable,
  canEdit,
}: {
  channels: Channel[]
  products: Product[]
  keywordId: string
  /** คำตอบหลักที่ตั้งไว้ — โชว์เป็นตัวอย่างตั้งแต่ยังไม่พิมพ์ ไม่ต้องรอให้ลองก่อนถึงจะเห็น */
  previewReply: string
  onEnable: () => void
  canEdit: boolean
}) {
  const [turns, setTurns] = useState<SimTurn[]>([])
  const [draft, setDraft] = useState('')
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [needsEnable, setNeedsEnable] = useState(false)

  const page = channels.find((c) => c.id === channelId)

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setTurns((t) => [...t, { who: 'customer', text }])
    setBusy(true)
    try {
      const data = await callApi('/api/shops/auto-reply/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, shopChannelId: channelId || null, adId: null, productId: null }),
      })

      if (data.willHandoff) {
        setTurns((t) => [...t, { who: 'none', text: 'ไม่เข้าเงื่อนไขข้อใด — ระบบจะเงียบและส่งต่อให้พนักงาน' }])
      } else {
        // บอกสถานะเป็นหมายเหตุใต้บับเบิล ไม่บังคำตอบ (user: "อยากให้ลองตอบเลยว่าจะตอบว่าอะไร")
        const notes: string[] = []
        if (data.winnerState?.status === 'OFFLINE') notes.push('ชุดนี้ยังไม่ใช้งาน')
        if (data.winnerState?.status === 'TEST') notes.push('อยู่โหมดทดสอบ')
        setTurns((t) => [
          ...t,
          { who: 'page', text: data.replyText ?? '', note: notes.length ? notes.join(' · ') : undefined },
        ])
        setNeedsEnable(data.winnerState?.status === 'OFFLINE')
      }
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ดูตัวอย่างไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card xl:sticky xl:top-20">
      {/* หัวแชท — ยืมโครงจากห้องแชทจริง (ผู้ใช้: "อยากให้ UI มันฟีลเหมือนอยู่หน้าแชท")
          Base: src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx:630-650
          ต่างกันตรงตัวตนบนหัว: ห้องแชทจริงโชว์ "ลูกค้าคนไหน" แต่หน้านี้ลูกค้าเป็นตัวสมมติ
          สิ่งที่ต้องรู้คือ "กำลังดูการตอบของเพจไหน" หัวจึงเป็นตัวเลือกเพจไปในตัว
          (แก้ตัวเลือกซ้อน 2 จุดที่ user ทัก — ดู PagePicker.tsx) */}
      <div className="card-header flex items-center gap-2">
        {channels.length > 0 ? (
          <PagePicker options={channels} value={channelId} onChange={setChannelId} />
        ) : (
          <p className="text-default-500 flex-1 text-sm">ยังไม่ได้เชื่อมเพจใด</p>
        )}
        {turns.length > 0 && (
          <button
            className="btn btn-sm btn-soft-default flex-none"
            onClick={() => { setTurns([]); setNeedsEnable(false) }}
          >
            ล้าง
          </button>
        )}
      </div>

      {/* บทสนทนา — Base ChatThread.tsx:887-980 (`my-5 flex items-start gap-2.5` + justify-end
          ฝั่งเรา, บับเบิล `rounded px-6 py-3`, ลูกค้า `bg-light` / เพจ `bg-primary text-white`)
          ฝั่งซ้าย = ลูกค้า ฝั่งขวา = เพจ ให้ตรงกับห้องแชทจริง (เดิมกลับข้างกัน) */}
      <div className="bg-light/30 max-h-96 min-h-72 overflow-y-auto px-4">
        {turns.length === 0 ? (
          <div className="py-8">
            {previewReply.trim() ? (
              <>
                <p className="text-default-400 mb-4 text-center text-xs">ตัวอย่างคำตอบที่ตั้งไว้</p>
                {/* บับเบิลจาง ๆ ให้เห็นหน้าตาคำตอบจริงทันที ไม่ต้องพิมพ์ทดลองก่อน */}
                <div className="flex items-start justify-end gap-2.5 opacity-60">
                  <div className="bg-primary min-w-0 rounded px-6 py-3">
                    <p className="mb-0 text-sm whitespace-pre-wrap text-white">{previewReply}</p>
                  </div>
                  <span className="bg-default-100 flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon icon="building-store" width={16} height={16} className="text-default-500" aria-hidden="true" />
                  </span>
                </div>
                <p className="text-default-400 mt-6 text-center text-xs">
                  พิมพ์ด้านล่างเพื่อลองว่าคำไหนเข้าเงื่อนไขไหน
                </p>
              </>
            ) : (
              <p className="text-default-400 py-8 text-center text-sm">
                ยังไม่ได้ตั้งข้อความตอบกลับ
                <br />
                ใส่คำตอบทางซ้ายแล้วจะเห็นตัวอย่างตรงนี้
              </p>
            )}
          </div>
        ) : (
          turns.map((t, i) =>
            t.who === 'none' ? (
              <p key={i} className="text-default-500 py-3 text-center text-xs">{t.text}</p>
            ) : (
              <div key={i} className={`my-5 flex items-start gap-2.5 ${t.who === 'page' ? 'justify-end' : ''}`}>
                {t.who === 'customer' && (
                  <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon icon="user" width={16} height={16} aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0">
                  <div className={`rounded px-6 py-3 ${t.who === 'page' ? 'bg-primary' : 'bg-light'}`}>
                    <p className={`mb-0 text-sm whitespace-pre-wrap ${t.who === 'page' ? 'text-white' : 'text-default-800'}`}>
                      {t.text}
                    </p>
                  </div>
                  {t.who === 'page' && t.note && (
                    <div className="text-default-400 mt-1 flex justify-end text-xs">{t.note}</div>
                  )}
                </div>
                {t.who === 'page' && (
                  <span className="bg-default-100 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
                    {page?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={page.avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <Icon icon="building-store" width={16} height={16} className="text-default-500" aria-hidden="true" />
                    )}
                  </span>
                )}
              </div>
            ),
          )
        )}
        {busy && <p className="text-default-400 py-2 text-xs">กำลังตอบ…</p>}
      </div>

      {needsEnable && canEdit && (
        <div className="border-default-200 border-t px-4 pt-3">
          <button className="btn btn-soft-primary btn-sm w-full" onClick={onEnable}>
            เริ่มทดสอบชุดนี้
          </button>
        </div>
      )}

      {/* ช่องพิมพ์ — Base ChatThread.tsx composer (แถบล่างมีเส้นคั่น + ปุ่มส่งสีหลัก) */}
      <div className="border-default-200 border-t p-3">
        <div className="flex items-center gap-2">
          <input
            className="form-input"
            placeholder="พิมพ์ข้อความ..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
            aria-label="ข้อความจากลูกค้า"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !draft.trim()}
            className="btn btn-primary flex-none"
            aria-label="ส่ง"
          >
            <Icon icon="send" className="text-base" aria-hidden="true" />
            ส่ง
          </button>
        </div>
        <p className="text-default-400 mt-2 text-xs">ข้อความในหน้านี้ไม่ถูกส่งออกจริง และไม่ถูกบันทึกลงแชท</p>
      </div>
    </div>
  )
}
