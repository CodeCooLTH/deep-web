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
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
// import type ล้วน — ถูกลบทิ้งตอน compile จึงไม่ลาก service (prisma) เข้า bundle ฝั่ง client
import type { PhraseOverlap } from '@/services/auto-reply-rule.service'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import PagePicker, { PageAvatar } from './PagePicker'
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
type Ad = {
  adId: string
  adTitle: string | null
  /** ข้อความโฆษณา — ช่วยแยกตัวที่ตั้งชื่อคล้ายกัน */
  adBody?: string | null
  /** รูปโฆษณาที่ mirror เข้า storage แล้ว (feature 00018) — null = Meta ไม่ส่งรูปมาครั้งนั้น */
  photoFileId?: string | null
  hitCount: number
}

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
  /** กลุ่มอื่นในร้านที่ใช้คำตรวจจับซ้ำกับกลุ่มนี้ — เรียง priority desc มาจาก service แล้ว (A-3) */
  overlaps: PhraseOverlap[]
  channels: Channel[]
  products: Product[]
}

async function callApi(url: string, init: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'ดำเนินการไม่สำเร็จ')
  return data
}

/** เงื่อนไขเฉพาะ = แถวที่ระบุเพจ/โฆษณา/สินค้า อย่างน้อยหนึ่งอย่าง (ที่เหลือคือคำตอบพื้นฐาน) */
const isException = (r: Rule) => Boolean(r.shopChannelId || r.adId || r.productId)

/**
 * ลำดับที่ resolver ไล่จริง (orderBy specificity desc, tie-break ด้วย id ให้ผลนิ่ง)
 *
 * เป็นสูตรเดียวของหน้านี้ — ใช้ทั้งตอนเรนเดอร์บันได และตอนคำนวณ "ลำดับใหม่" หลังบันทึก
 * เพื่อบอกผู้ใช้ว่าข้อที่แก้ย้ายไปอยู่ลำดับไหน ถ้าแยกเป็นสองสูตรจะเพี้ยนกันเงียบ ๆ
 */
const sortExceptions = (list: Rule[]) =>
  list.filter(isException).sort((a, b) => b.specificity - a.specificity || a.id.localeCompare(b.id))

/** สถานะ 3 ค่าของกลุ่มคำ — เขียวสงวนให้ "ตอบลูกค้าจริง" ตาม Verified-Means-Green */
const STATUS_ORDER = ['OFFLINE', 'TEST', 'LIVE'] as const
const STATUS_META: Record<string, { label: string; active: string }> = {
  OFFLINE: { label: 'ไม่ใช้งาน', active: 'bg-default-500 text-white' },
  TEST: { label: 'ทดสอบ', active: 'bg-warning text-white' },
  LIVE: { label: 'ตอบลูกค้าจริง', active: 'bg-success text-white' },
}

/**
 * สีป้ายสถานะของ "กลุ่มอื่น" ในบล็อกคำซ้ำ — label ยังอ่านจาก STATUS_META ตัวเดียวข้างบน (SSOT, CL-10)
 * ที่นี่เก็บเฉพาะสี เพราะ STATUS_META.active เป็นสีของ *ปุ่มที่ถูกเลือก* (พื้นทึบ) ซึ่งเอามาทำป้ายไม่ได้
 *
 * กฎเดียวกับป้ายอ่านอย่างเดียวของหน้ารายการ (CL-12/CL-17): fill = ทำงานอยู่ · outline = ไม่ทำงาน
 * OFFLINE ห้ามใช้ text-default-700 บนพื้น default-200 — .badge ย่อตัวอักษรเป็น 0.75em (ตัวเล็ก)
 * เกณฑ์จึงเป็น 4.5:1 แต่คู่นั้นได้ 4.17 (ตก) ส่วน outline บน bg-card ได้ 4.69 (ผ่าน)
 */
const STATUS_BADGE: Record<string, string> = {
  OFFLINE: 'border-default-300 bg-card text-default-700 border',
  TEST: 'bg-warning/15 text-warning',
  LIVE: 'bg-success/15 text-success',
}

/**
 * ป้าย DeepBot บนบับเบิลตัวอย่าง — ก็อป markup มาจากป้ายจริงในห้องแชท
 * Base: src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/AutoReplyTag.tsx
 *   (คลาสเดียวกันเป๊ะ รวมตำแหน่ง absolute top-0 end-2.5 -translate-y-1/2)
 *
 * ต่างจากของจริงตรงที่ **กดไม่ได้** — ของจริงกดแล้วกางกล่องบอกเงื่อนไขที่ใช้ตอบ ซึ่งมาจาก
 * บันทึกการตอบจริง (AutoReplyLog) ที่ยังไม่เกิดในหน้าตั้งค่า ทำเป็นปุ่มที่กดแล้วไม่มีอะไร
 * เกิดขึ้นแย่กว่าไม่ทำเป็นปุ่ม
 */
function PreviewBotTag() {
  return (
    <span className="border-primary text-primary bg-card absolute top-0 end-2.5 z-20 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap shadow">
      <Icon icon="robot" className="text-xs" aria-hidden="true" />
      DeepBot
    </span>
  )
}

export default function KeywordEditorClient({ canEdit, keyword, overlaps, channels, products }: Props) {
  const router = useRouter()

  const [status, setStatus] = useState(keyword.status)
  const [testThreadCount, setTestThreadCount] = useState(keyword.testThreadCount)
  /** ตัวนับสั่งเปิดแผงเลือกแชทใน TestThreadsCard (ใช้ตัวนับไม่ใช่ boolean — กดซ้ำต้องทริกเกอร์ซ้ำได้) */
  const [pickerSignal, setPickerSignal] = useState(0)
  /** จำว่าผู้ใช้กด "ทดสอบ" ไว้ตอนยังไม่มีแชท — พอเลือกแชทแรกเสร็จให้สลับสถานะให้เอง */
  const pendingTestRef = useRef(false)
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
  /**
   * ช่องตัวเลข 0–1000 ซ่อนอยู่หลังลิงก์ "ตั้งตัวเลขเอง" และไม่โผล่มาเอง —
   * เจ้าของร้านตอบไม่ได้ว่าควรใส่เลขเท่าไหร่ แต่ตอบได้ว่าอยากให้กลุ่มไหนมาก่อน (critique Recognition 2/4)
   */
  const [showPriorityInput, setShowPriorityInput] = useState(false)
  const [phrases, setPhrases] = useState(keyword.phrases)
  const [newPhrase, setNewPhrase] = useState('')
  /**
   * S-16: ช่องพิมพ์คำใหม่ซ่อนอยู่หลังปุ่ม "เพิ่มคำ" — ช่องกว้างที่ค้างอยู่ตลอดทำให้แถวอ่านเป็น
   * "ฟอร์ม" แทนที่จะเป็น "รายการคำ"
   *
   * WARNING: ต้องใช้ initializer ครั้งเดียว ห้าม derive จาก phrases.length ทุกรอบเรนเดอร์ —
   * ไม่งั้นพอลบชิปตัวสุดท้ายทิ้ง ช่องจะเด้งเปิดเองกลางทางทั้งที่ผู้ใช้ไม่ได้สั่ง
   */
  const [addingPhrase, setAddingPhrase] = useState(() => keyword.phrases.length === 0)
  const phraseInputRef = useRef<HTMLInputElement>(null)
  const addPhraseBtnRef = useRef<HTMLButtonElement>(null)
  /**
   * จุดที่ต้องโฟกัสหลังสลับปุ่ม↔ช่อง — สั่งได้หลัง element ถูก mount แล้วเท่านั้นจึงต้องรอ useEffect
   * ที่ไม่ผูกกับ addingPhrase ตรง ๆ เพราะตอนโหลดหน้าแบบ 0 คำ ช่องเปิดอยู่แล้ว แต่ห้ามขโมยโฟกัส
   */
  const pendingFocusRef = useRef<'input' | 'button' | null>(null)
  const [rules, setRules] = useState(keyword.rules)
  const [busy, setBusy] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  /**
   * แถวที่กำลังแก้ (null = โหมดเพิ่ม) — แยกจาก `sheetOpen` เพราะถ้าใช้ตัวเดียวคุมสองโหมด
   * จะไม่มีทางรู้ว่าเปิดมาเพื่อเพิ่มหรือเพื่อแก้ และค่าที่ค้างจะรั่วข้ามครั้ง
   */
  const [editingRule, setEditingRule] = useState<Rule | null>(null)

  const defaultRule = useMemo(() => rules.find((r) => !isException(r)) ?? null, [rules])
  const [defaultReply, setDefaultReply] = useState(defaultRule?.replyText ?? '')

  /** เงื่อนไขเฉพาะเรียงเจาะจงมากอยู่บน = ลำดับที่ระบบตัดสินจริง (ไม่ใช่ลำดับการสร้าง) */
  const exceptions = useMemo(() => sortExceptions(rules), [rules])

  /**
   * อันดับที่ผู้ใช้เห็น = กลุ่มอื่นที่ใช้คำซ้ำ + กลุ่มนี้เอง เรียง priority มาก→น้อย
   * กลุ่มนี้ใช้ `priority` จาก state ไม่ใช่ keyword.priority เพื่อให้รายการสลับที่ทันทีที่กดเลื่อน
   * เสมอกันให้กลุ่มนี้อยู่ล่าง — ตรงกับสูตร A-1 ที่ต้อง "มากกว่า" จริงเท่านั้นถึงจะขึ้นไปอยู่บน
   */
  const ranking = useMemo(
    () =>
      [
        ...overlaps.map((o) => ({ id: o.id, name: o.name, priority: o.priority, status: o.status, isMe: false })),
        { id: keyword.id, name: 'กลุ่มนี้', priority, status, isMe: true },
      ].sort(
        (a, b) =>
          b.priority - a.priority ||
          (a.isMe ? 1 : 0) - (b.isMe ? 1 : 0) ||
          a.name.localeCompare(b.name, 'th'),
      ),
    [overlaps, keyword.id, priority, status],
  )
  const myRank = ranking.findIndex((r) => r.isMe)

  /**
   * สูตร A-1: ขึ้น = มากกว่ากลุ่มที่สูงสุดอยู่ 1 · ลง = น้อยกว่ากลุ่มที่ต่ำสุดอยู่ 1
   * ไม่แตะ priority ของกลุ่มอื่นแม้แต่ตัวเดียว (renumber ทั้งชุดต้องมี endpoint bulk ที่ยังไม่มี)
   */
  const upTarget = overlaps.length > 0 ? Math.min(1000, Math.max(...overlaps.map((o) => o.priority)) + 1) : priority
  const downTarget = overlaps.length > 0 ? Math.max(0, Math.min(...overlaps.map((o) => o.priority)) - 1) : priority
  // ปิดปุ่มเมื่ออยู่ปลายรายการ หรือเมื่อค่าที่จะได้เท่าเดิม (เช่นมีกลุ่มอื่นอยู่ที่ 1000 แล้ว) = กดไปก็ไม่เกิดอะไร
  const canMoveUp = canEdit && !busy && myRank > 0 && upTarget !== priority
  const canMoveDown = canEdit && !busy && myRank < ranking.length - 1 && downTarget !== priority

  /**
   * คำที่หยิบมาพูดในประโยคอธิบาย — เรียงตามลำดับชิปในหน้านี้ก่อน เพราะ sharedPhrases ที่ service
   * ส่งมาวิ่งตาม createdAt ของ "กลุ่มอื่น" (A-3b) ซึ่งไม่ตรงกับลำดับที่ตาผู้ใช้กวาดอยู่บนจอ
   */
  const topOverlap = overlaps.length > 0 ? overlaps[0] : null
  const sharedPhraseShown = useMemo(() => {
    if (!topOverlap) return ''
    const order = phrases.map((p) => p.phrase)
    const rank = (s: string) => {
      const i = order.indexOf(s)
      return i === -1 ? order.length : i
    }
    return [...topOverlap.sharedPhrases].sort((a, b) => rank(a) - rank(b))[0] ?? ''
  }, [topOverlap, phrases])

  // แถบบันทึกลอย: บอกด้วยว่าแก้อะไรไป ไม่ใช่แค่ว่า "มีการแก้"
  const dirty = useMemo(() => {
    const d: string[] = []
    if (name !== keyword.name) d.push('ชื่อกลุ่ม')
    if (priority !== keyword.priority) d.push('ลำดับความสำคัญ')
    if (defaultReply !== (defaultRule?.replyText ?? '')) d.push('คำตอบปกติ')
    return d
  }, [name, priority, defaultReply, keyword, defaultRule])

  /**
   * เปลี่ยนสถานะมีผลทันที ไม่ต้องกดบันทึกแยก
   * WARNING: V1 ให้สวิตช์อยู่ในฟอร์มที่ต้องกดบันทึก — user เปิดแล้วนึกว่าทำงาน แต่จริง ๆ ไม่ได้บันทึก
   * แล้วสรุปว่า "ตั้งค่าแล้วระบบไม่ตอบ" (บั๊กจริงบน prod 2026-07-29) ไม่มีใครคาดหวังว่าสวิตช์ต้องยืนยัน
   */
  async function changeStatus(next: string) {
    if (!canEdit || busy || next === status) return
    /**
     * ทางตันที่ user เจอบน prod 2026-07-31: กด "ทดสอบ" ตอนยังไม่มีแชท → server ปฏิเสธ
     * (ต้องมี >=1 แชทก่อน) แล้วโยน toast แดงบอกให้ "เลือกแชทก่อน" — แต่แผงเลือกแชทอยู่
     * ใต้จอไกลจากปุ่ม ผู้ใช้จึงติดวงกลม: จะเปิดโหมดทดสอบต้องมีแชท / จะเห็นที่เลือกแชทต้อง
     * หาเอง กันด้วยการ **ไม่ยิง API เลย** แล้วพาไปที่แผงเลือกแชทแทน + จำไว้ว่าตั้งใจจะเปิด
     * โหมดทดสอบ พอเลือกแชทแรกเสร็จจะสลับสถานะให้เอง (ผู้ใช้กดครั้งเดียวได้ผลตามที่ตั้งใจ)
     */
    if (next === 'TEST' && testThreadCount === 0) {
      pendingTestRef.current = true
      setPickerSignal((n) => n + 1)
      pacesToast.info('เลือกแชทที่จะใช้ทดสอบก่อน แล้วระบบจะเปิดโหมดทดสอบให้อัตโนมัติ')
      return
    }
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

  /**
   * เลื่อนลำดับ = PATCH `priority` ค่าเดียวตามสูตร A-1 แล้วมีผลทันที ไม่ต้องรอแถบบันทึก [E]
   * เหตุผลเดียวกับสวิตช์สถานะ: ของที่กดแล้วเห็นรายการสลับที่ตรงหน้า ไม่มีใครคาดว่าต้องกดยืนยันอีกที
   */
  async function movePriority(dir: 'up' | 'down') {
    if (dir === 'up' ? !canMoveUp : !canMoveDown) return
    const next = dir === 'up' ? upTarget : downTarget
    /**
     * toast ต้องบอกผลจริง ไม่ใช่ผลกับเพื่อนบ้าน — สูตร A-1 กระโดดสุดปลาย ไม่ได้ขยับทีละขั้น
     * ของเดิมพูดถึงกลุ่มที่อยู่ติดกันกลุ่มเดียว ("จะถูกเลือกก่อน X แล้ว") ซึ่งจริงแต่บอกไม่หมด:
     * ตอนมี 3 กลุ่มขึ้นไป กดครั้งเดียวแล้วแซงทุกกลุ่ม ผู้ใช้ที่อ่าน toast จะนึกว่าต้องกดอีกหลายที
     */
    const otherCount = overlaps.length
    setBusy(true)
    try {
      await callApi(`/api/shops/auto-reply/keywords/${keyword.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: next }),
      })
      setPriority(next)
      pacesToast.success(
        dir === 'up'
          ? `กลุ่มนี้จะถูกเลือกก่อนอีก ${otherCount} กลุ่มที่ใช้คำซ้ำกันแล้ว`
          : `อีก ${otherCount} กลุ่มที่ใช้คำซ้ำกันจะถูกเลือกก่อนกลุ่มนี้แล้ว`,
      )
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เลื่อนลำดับไม่สำเร็จ')
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
      /**
       * บล็อก "คำที่ซ้ำกับกลุ่มอื่น" คำนวณที่ server (getPhraseOverlaps ใน page.tsx) —
       * ถ้าไม่ refresh บล็อกจะไม่โผล่จนกว่าจะรีโหลดหน้า ทั้งที่ toast เพิ่งเตือนว่าคำนี้ซ้ำ (spec §9 ข้อ 2)
       */
      router.refresh()
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
    /**
     * ถามก่อนเสมอ — ลบแล้วกู้คืนไม่ได้ (เดิมกดปุ่มแล้วยิงลบทันที)
     * WARNING: confirm ต้องมา *ก่อน* setBusy(true) ถ้าสลับลำดับ แล้ว user กดยกเลิก
     * ต้องปลด busy เองในทุกทางออก ซึ่งลืมง่าย = ปุ่มทั้งหน้าค้าง disabled
     */
    const ok = await pacesConfirm.danger(
      'ลบเงื่อนไขเฉพาะข้อนี้?',
      'ข้อความตอบของข้อนี้จะหายไป และกู้คืนไม่ได้ — กรณีที่เคยเข้าข้อนี้จะไปใช้ "คำตอบปกติ" แทน',
      { confirmButtonText: 'ลบเงื่อนไข' },
    )
    if (!ok) return
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

  /** โฟกัสตามที่สั่งไว้ตอนสลับปุ่ม↔ช่อง (a11y: ปิดช่องด้วย Esc แล้วโฟกัสห้ามหายไปจากหน้า) */
  useEffect(() => {
    const target = pendingFocusRef.current
    if (!target) return
    pendingFocusRef.current = null
    if (target === 'input') phraseInputRef.current?.focus()
    else addPhraseBtnRef.current?.focus()
  }, [addingPhrase])

  function openPhraseInput() {
    pendingFocusRef.current = 'input'
    setAddingPhrase(true)
  }

  function closePhraseInput() {
    pendingFocusRef.current = 'button'
    setNewPhrase('')
    setAddingPhrase(false)
  }

  /**
   * ชื่อเพจซ้ำกันได้จริง — เพจ Facebook กับบัญชี Instagram ที่ผูกกันมักตั้งชื่อเดียวกันเป๊ะ
   * (user report 2026-08-02: สร้าง 2 เพจ x 1 โฆษณา แล้วเห็นสองแถวเหมือนกันจนนึกว่าระบบเบิ้ล)
   * ต่อท้ายด้วยชื่อช่องทางเฉพาะตอนที่ชื่อซ้ำ — ไม่รกในเคสปกติที่ชื่อไม่ซ้ำ
   */
  /**
   * ชิปเงื่อนไข — เพจแสดงโลโก้จริง + ไอคอนช่องทาง (user 2026-08-02 "ให้ดูง่ายขึ้น")
   *
   * ชื่อเพจซ้ำกันได้จริง: เพจ Facebook กับบัญชี Instagram ที่ผูกกันมักตั้งชื่อเดียวกันเป๊ะ
   * (user report: สร้าง 2 เพจ x 1 โฆษณา แล้วเห็นสองแถวเหมือนกันจนนึกว่าระบบเบิ้ล)
   * โลโก้+ไอคอนแยกออกได้ตั้งแต่แรกเห็น ไม่ต้องอ่านตัวหนังสือเทียบทีละตัว
   */
  function CondChips({ r }: { r: Rule }) {
    const ch = r.shopChannelId ? channels.find((c) => c.id === r.shopChannelId) : null
    const chip = 'bg-primary/10 text-primary flex max-w-full items-center gap-1 rounded px-2 py-0.5 text-xs font-medium'
    const display = ch ? getChannelDisplay(ch.provider) : null
    return (
      <>
        {r.shopChannelId && (
          <span className={chip}>
            {ch?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ch.avatarUrl} alt="" className="size-4 flex-none rounded-full object-cover" />
            ) : (
              <Icon icon="building-store" className="size-3.5 flex-none" aria-hidden="true" />
            )}
            <span className="truncate">{ch?.name ?? '—'}</span>
            {display && (
              <Icon
                icon={display.icon}
                width={13}
                height={13}
                className={`flex-none ${display.iconClassName ?? ''}`}
                style={display.iconStyle}
                aria-label={display.label}
              />
            )}
          </span>
        )}
        {r.adId && (
          <span className={chip}>
            <Icon icon="speakerphone" className="size-3.5 flex-none" aria-hidden="true" />
            <span className="truncate">{r.adLabel ?? r.adId}</span>
          </span>
        )}
        {r.productId && (
          <span className={chip}>
            <Icon icon="package" className="size-3.5 flex-none" aria-hidden="true" />
            <span className="truncate">{products.find((p) => p.id === r.productId)?.name ?? '—'}</span>
          </span>
        )}
      </>
    )
  }

  return (
    <>
      {/* ไม่มี subheader (user 2026-07-31 "ตัดข้อความยาว ๆ ออก") — ย่อหน้า 3 บรรทัดเดิม
          อธิบายสิ่งที่หน้านี้ทำ ซึ่งการ์ดแต่ละใบบอกด้วยตัวเองอยู่แล้ว (การ์ด [A] = ตั้งค่ากลุ่มคำ,
          [B] = คำตอบที่ลูกค้าจะได้รับ) การอธิบายซ้ำที่หัวหน้าคือ non-information ที่ดันเนื้อหา
          จริงลงไปครึ่งจอบนมือถือ */}

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
          {/* ── [A] ตั้งค่ากลุ่มคำ ───────────────────────────────── */}
          <div className="card">
            {/* หัวการ์ด "รอง": text-md + ไอคอนเปล่าสีธีม — ไม่มีแผ่นสีรองไอคอน เพราะแผ่นนั้นสงวนให้
                การ์ด [B] ใบเดียวในหน้า (spec §7) ลำดับชั้นจึงมาจาก treatment ไม่ใช่จากการทำให้
                ใบอื่นจางลง ซึ่งเป็นต้นเหตุที่ user ทักว่า "ทุกอย่างจางไปหมด"
                Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx → CardWithHeader (:182-197) */}
            <div className="card-header flex flex-wrap items-center justify-between gap-3">
              <h5 className="text-default-800 text-md flex min-w-0 items-center gap-2 font-semibold">
                <Icon icon="adjustments-horizontal" className="text-primary size-4 flex-none" aria-hidden="true" />
                ตั้งค่ากลุ่มคำ
              </h5>
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
              {/* ชื่อกลุ่ม: ย้ายลงมาอยู่ใน card-body พร้อม form-label ที่ผูก htmlFor (§11.2 ข้อ 17 a11y)
                  หัวการ์ดจึงเหลือ "ชื่อการ์ด + สถานะ" ตามลำดับชั้นใน mockup แทนที่จะเป็น input ลอยในหัว
                  ห่อ .input-group เพราะ .form-input มี width:100% แบบ unlayered → width utility บนตัว input
                  เองไม่มีผลเลย ต้องคุมที่ตัวห่อ (paces-component-reference.md §4)
                  Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (:15-22) */}
              <div className="mb-5">
                <label className="form-label" htmlFor="k-name">
                  ชื่อกลุ่มคำ
                </label>
                <div className="input-group max-w-md">
                  <input
                    id="k-name"
                    className="form-input font-semibold"
                    value={name}
                    disabled={!canEdit}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    aria-label="ชื่อกลุ่มคำ"
                  />
                </div>
              </div>

              {/* label ครอบกลุ่มชิป (ไม่ผูก htmlFor เพราะกำกับทั้งกลุ่ม ไม่ใช่ช่องเดียว — ชื่อที่ a11y
                  อ่านของช่องพิมพ์ยังเป็น aria-label "คำตรวจจับใหม่" ตามเดิม)
                  ประโยคสรุปคำที่เคยอยู่ตรงนี้ ("มีคำว่า X หรือ Y") ถูกตัดทิ้ง ไม่ได้ทำให้จางลง —
                  มันพูดซ้ำกับชิปที่อยู่ใต้มันเอง (กลไกเพดานเทา spec §7) */}
              <div className="mb-3">
                <label className="form-label">ตอบเมื่อลูกค้าพิมพ์</label>
                <div className="flex flex-wrap items-center gap-2">
                  {phrases.map((p) => (
                    /* ชิปคำตรวจจับ = คลาสเดียวกับหน้ารายการเป๊ะ (SSOT: AutoReplyListing.tsx:96)
                       ของชิ้นเดียวกันในสองหน้าต้องสีและทรงเดียวกัน — rounded (4px) ไม่ใช่ rounded-full */
                    <span
                      key={p.id}
                      className={`bg-primary/10 text-primary flex max-w-full items-center gap-1 rounded py-0.5 text-xs font-medium ${
                        canEdit ? 'ps-2 pe-1 sm:pe-2' : 'px-2'
                      }`}
                    >
                      {/* คำยาวได้ถึง 200 ตัวอักษร — ต้องยอมตัดบรรทัดในชิป ไม่ใช่ดันแถวจนล้นจอมือถือ */}
                      <span className="min-w-0 break-words">{p.phrase}</span>
                      {canEdit && (
                        /* hit area 36px บนมือถือตาม precedent แท็ก CRM ที่ shipped แล้ว
                           (CustomerCrmSection.tsx:288-295) — ไอคอนคงขนาดเดิมเพื่อไม่ให้ชิปบวม */
                        <button type="button" onClick={() => removePhrase(p.id)} disabled={busy}
                          aria-label={`ลบคำ ${p.phrase}`}
                          className="text-primary/60 hover:text-danger hover:bg-primary/15 flex size-9 flex-none items-center justify-center rounded-full sm:size-4">
                          <Icon icon="x" className="text-xs" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  ))}
                  {canEdit &&
                    (addingPhrase ? (
                      /* สปินเนอร์อยู่ *นอก* .input-group เพราะ .input-group > :not(:last-child)
                         จะถอดมุมโค้งด้านขวาของ input ทิ้ง (custom/_forms.css:270) = ช่องเปลี่ยนทรง
                         ทุกครั้งที่กำลังบันทึก */
                      <div className="flex w-full items-center gap-2 sm:w-auto">
                        <div className="input-group w-full sm:w-56">
                          <input
                            ref={phraseInputRef}
                            /* .form-input ตั้งสี placeholder เป็นเทาที่ตก AA (2.9:1) ไว้แบบ unlayered
                               → utility ธรรมดาแพ้ ต้องเติม ! เพื่อยกขึ้นเป็นเทาที่อ่านออกตามเพดานเทา (A-6) */
                            className="form-input placeholder:text-default-500! min-h-11 sm:min-h-0"
                            value={newPhrase} placeholder="เช่น ส่งฟรีไหม"
                            onChange={(e) => setNewPhrase(e.target.value)}
                            /**
                             * Enter = เพิ่มคำแล้ว "ค้างช่องไว้" ให้พิมพ์คำถัดไปต่อได้ทันที
                             * (addPhrase ล้างค่าให้เอง) — ถ้ายุบกลับเป็นปุ่มทุกครั้ง ผู้ใช้ต้องกดปุ่ม
                             * ไล่โฟกัสใหม่ต่อ 1 คำ = ช้ากว่าของเดิม
                             * Esc = ปิดช่องแล้วคืนโฟกัสไปที่ปุ่ม
                             */
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); addPhrase() }
                              else if (e.key === 'Escape') { e.preventDefault(); closePhraseInput() }
                            }}
                            /**
                             * ยุบกลับเป็นปุ่มเฉพาะตอนช่องว่าง — ถ้ามีข้อความค้างอยู่ต้องคงช่องไว้เหมือนเดิม
                             * เพราะทั้งสองทางเลือกที่เหลือแย่กว่า: เพิ่มให้เอง = เขียน DB สิ่งที่ผู้ใช้ไม่ได้สั่ง,
                             * ทิ้ง = "คำที่พิมพ์ไปหายไปไหน"
                             */
                            onBlur={() => { if (!newPhrase.trim()) setAddingPhrase(false) }}
                            maxLength={200} aria-label="คำตรวจจับใหม่"
                          />
                        </div>
                        {busy && (
                          <Icon icon="loader-2" className="size-4 flex-none animate-spin text-default-500" aria-hidden="true" />
                        )}
                      </div>
                    ) : (
                      /* ปุ่มเส้นประ = precedent เดียวกับ "เปิดร้านของฉันเอง" (ChooseShopClient.tsx:206)
                         เส้นประ ไม่ใช่พื้นสี — ถ้าใช้พื้นทึบจะอ่านเหมือนชิปอีกตัวที่เข้มกว่า ผู้ใช้จะนึกว่า
                         มีคำว่า "เพิ่มคำ" อยู่ในกลุ่ม และต้องมีคำกำกับ ไม่ใช่ + เปล่า เพราะช่องพิมพ์ถูกซ่อนไปแล้ว */
                      <button
                        ref={addPhraseBtnRef}
                        type="button"
                        onClick={openPhraseInput}
                        aria-expanded={addingPhrase}
                        className="btn btn-sm border border-dashed border-default-300 text-primary hover:bg-primary/5 min-h-11 inline-flex items-center gap-1 sm:min-h-0"
                      >
                        <Icon icon="plus" className="size-3.5" aria-hidden="true" />
                        เพิ่มคำ
                      </button>
                    ))}
                </div>
                {canEdit && addingPhrase && (
                  /* helper โผล่เฉพาะตอนช่องเปิด และไม่พูดถึง Esc — บนมือถือซึ่งเป็น surface หลัก
                     ของผู้ขายไม่มีปุ่มนั้นให้กด */
                  <p className="text-default-600 mt-1.5 text-xs">กด Enter เพื่อเพิ่มทีละคำ</p>
                )}
              </div>

              {/* ── บล็อก "คำที่ซ้ำกับกลุ่มอื่น" = ตัวแทนช่องเลข 0–1000 ─────────────
                  เจ้าของร้านตอบไม่ได้ว่าควรใส่เลขเท่าไหร่ แต่ตอบได้ว่าอยากให้กลุ่มไหนมาก่อน
                  จึงแสดง "ใครชนะใคร" เป็นรายการ แล้วให้กดเลื่อนแทน (เลขยังเป็น int 0–1000 เหมือนเดิม
                  ซ่อนหลังลิงก์ "ตั้งตัวเลขเอง" เป็นทางหนีเมื่อกดเลื่อนแล้วยังไม่ได้ผลที่ต้องการ)
                  Base: theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx → Numbered (:381-411) */}
              <div className="border-default-300 mt-5 border-t border-dashed pt-4">
                {overlaps.length > 0 ? (
                  <>
                    <h6 className="text-default-800 mb-1.5 flex items-center gap-2 text-sm font-semibold">
                      <Icon icon="git-branch" className="text-primary size-4 flex-none" aria-hidden="true" />
                      คำที่ซ้ำกับกลุ่มอื่น
                    </h6>
                    <p className="text-default-800 mb-3 text-xs">
                      <span className="text-primary font-semibold">“{sharedPhraseShown}”</span> ใช้อยู่ในกลุ่ม “
                      {topOverlap?.name}” ด้วย — ถ้าลูกค้าพิมพ์คำนี้ ระบบจะเลือกกลุ่มที่อยู่บนสุด
                    </p>
                    {/* overflow-hidden กันพื้นไฮไลต์ของแถวตัวเองทะลุมุมที่ rounded (เหมือนบันไดใน [B]) */}
                    <ul className="divide-default-200 border-default-300 mb-3 divide-y overflow-hidden rounded border">
                      {ranking.map((r, i) => (
                        <li key={r.id}
                          className={`flex items-center gap-2.5 px-4.75 py-2.5 text-xs ${r.isMe ? 'bg-primary/5' : ''}`}>
                          <span className={`w-5 flex-none font-semibold ${r.isMe ? 'text-primary' : 'text-default-700'}`}>
                            {i + 1}.
                          </span>
                          <span className="text-default-800 min-w-0 flex-1 truncate font-medium">{r.name}</span>
                          <span className={`badge flex-none whitespace-nowrap ${STATUS_BADGE[r.status] ?? STATUS_BADGE.OFFLINE}`}>
                            {STATUS_META[r.status]?.label ?? r.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* btn-outline ของ mockup ไม่มีนิยามใน Paces (CL-4) → ใช้ light/neutral variant จริง

                          ป้ายต้องบอกสิ่งที่โค้ดทำจริง (critique 2026-07-31 [P1] "เลื่อนขึ้น/ลง
                          ป้ายบอกอย่าง โค้ดทำอีกอย่าง"): สูตร A-1 คือ
                          upTarget = max(priority ของกลุ่มอื่นทั้งหมด) + 1 → **กระโดดขึ้นบนสุดทีเดียว**
                          ไม่ใช่ขยับทีละขั้น (downTarget ก็ลงล่างสุดแบบเดียวกัน)
                          "เลื่อนขึ้น" ที่กดแล้วแซงทุกกลุ่มรวดเดียว = ป้ายโกหกในหน้าที่มี 3 กลุ่มขึ้นไป */}
                      <button type="button" disabled={!canMoveUp} onClick={() => movePriority('up')}
                        className="btn btn-sm bg-light text-dark hover:bg-light-hover min-h-11 sm:min-h-0">
                        <Icon icon="arrow-up" className="size-3" aria-hidden="true" />ให้กลุ่มนี้มาก่อนทุกกลุ่ม
                      </button>
                      <button type="button" disabled={!canMoveDown} onClick={() => movePriority('down')}
                        className="btn btn-sm bg-light text-dark hover:bg-light-hover min-h-11 sm:min-h-0">
                        <Icon icon="arrow-down" className="size-3" aria-hidden="true" />ให้กลุ่มอื่นมาก่อน
                      </button>
                      {/* ต้องเห็นเสมอแม้ปุ่มเลื่อนจะ disabled ทั้งคู่ — ไม่งั้นเคส "กลุ่มอื่นอยู่ที่ 1000 แล้ว" จะตัน (A-1b) */}
                      <button type="button" className="text-primary ms-1.5 text-xs font-medium underline underline-offset-4"
                        onClick={() => setShowPriorityInput((v) => !v)}>
                        ตั้งตัวเลขเอง
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-default-700 text-xs">ยังไม่มีกลุ่มอื่นใช้คำซ้ำกับกลุ่มนี้</span>
                    {/* ชื่อเดียวกับสาขา overlaps > 0 — ปุ่มตัวเดียวกันเปิดช่องเดียวกัน แต่เดิม
                        เรียก "ตั้งลำดับเอง" ที่นี่ และ "ตั้งตัวเลขเอง" ข้างบน (clarify: ของชิ้น
                        เดียวกันต้องใช้คำเดียวกันทั้ง product) */}
                    <button type="button" className="text-primary text-xs font-medium underline underline-offset-4"
                      onClick={() => setShowPriorityInput((v) => !v)}>
                      ตั้งตัวเลขเอง
                    </button>
                  </div>
                )}

                {showPriorityInput && (
                  <div className="mt-3 sm:w-48">
                    <label className="form-label" htmlFor="k-pri">ตัวเลขลำดับ (0–1000)</label>
                    {/* ห่อ .input-group เพราะ .form-input มี width:100% แบบ unlayered (paces-component-reference §4) */}
                    <div className="input-group">
                      <input id="k-pri" type="number" className="form-input" value={priority} disabled={!canEdit}
                        min={0} max={1000} onChange={(e) => setPriority(Number(e.target.value))} />
                    </div>
                    <p className="text-default-500 mt-1 text-xs">ตัวเลขมากกว่าถูกเลือกก่อน</p>
                  </div>
                )}
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
                {/**
                 * ทำไมต้องบอกว่า "สลับเองไม่ได้" (user ตัดสิน 2026-08-02 ตัด drag drop ออก)
                 *
                 * แถวมีเลข 1. 2. 3. ซึ่งเป็น affordance ที่อ่านว่า "ลากสลับได้" — critique
                 * 2026-07-31 ให้ข้อ User Control 2/4 ด้วยเหตุนี้ ("บันไดมีเลขลำดับแต่เรียงใหม่
                 * ไม่ได้ ขณะที่บล็อกคำซ้ำที่ไม่มีเลขกลับเลื่อนได้ = affordance กลับหัว")
                 * ทางแก้ที่ user เลือกคือ **ไม่เพิ่ม drag** แล้วปิดช่องว่างด้วยคำอธิบายแทน
                 *
                 * เหตุผลที่เขียนต้องเป็นเหตุผล *จริง* ไม่ใช่ "ระบบจัดการให้": ลำดับมาจาก
                 * computeSpecificity() = เพจ 4 + โฆษณา 2 + สินค้า 1 (auto-reply-constants.ts:151)
                 * เรียง desc — ถ้าปล่อยให้ร้านยกข้อที่กว้างกว่าขึ้นไปไว้บน ข้อที่เจาะจงกว่าจะถูก
                 * ข้อกว้างดักไว้ก่อนทุกครั้ง = ตั้งไปก็ไม่มีวันทำงาน ซึ่งเป็นของที่ผู้ใช้เดาเองไม่ได้
                 *
                 * โผล่ที่ >=2 เพราะมี 1 ข้อยังไม่มีลำดับให้เถียง (บรรทัดบนอธิบายพอแล้ว)
                 */}
                {exceptions.length >= 2 && (
                  <p className="text-default-700 mt-1 text-xs">
                    ข้อที่ระบุเงื่อนไขมากกว่าอยู่บนเสมอ — ระบบเรียงให้เอง สลับเองไม่ได้
                    เพราะถ้าเอาข้อที่กว้างกว่าขึ้นไปไว้บน ข้อที่เจาะจงกว่าจะไม่มีวันถูกใช้
                  </p>
                )}
              </div>
              {/* NOTE: ปุ่ม "คลังคำถาม" เคยอยู่ตรงนี้ ตอนนี้ไม่มีแล้วและไม่ควรกลับมา —
                  คลังคำถามรายกลุ่มคำถูกถอดออกทั้งชุดเมื่อ 2026-08-02 (`68c37cd3`) พร้อมกับ
                  คิวคำถามที่ตอบไม่ได้และ AI Enhance · ของที่มาแทนคือ **คลังความรู้ระดับร้าน**
                  ซึ่งอยู่คนละเมนู (`/settings/chatbot/knowledge`) ไม่ใช่แท็บของหน้านี้
                  (คอมเมนต์เดิมเขียนว่ากลายเป็น Tab "คลังคำตอบ" ของหน้านี้ — KeywordTabs.tsx
                   ถูกลบไปแล้ว แท็บนั้นไม่มีอยู่จริง) */}
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
                          <CondChips r={r} />
                        </div>
                        {/* ข้อความล้วน ไม่ใส่กล่องซ้อนกล่องในบันได (anti-slop) */}
                        <p className="text-default-800 mt-1 line-clamp-3 text-sm">{r.replyText}</p>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1.5 max-sm:w-full">
                        {/* เปิด sheet โหมดแก้ = ส่ง rule ทั้งแถวไป prefill (ไม่ใช่แค่ id)
                            sheet จึงอ่าน adLabel เดิมได้แม้รายการโฆษณายังโหลดไม่เสร็จ (CL-8) */}
                        {/* ไอคอนล้วนบนจอใหญ่ (แถวสูงไม่เท่ากันเพราะคำตอบยาวไม่เท่ากัน
                            ปุ่มกล่องเทาใหญ่จึงดูลอยไม่เกาะแถว) · มือถือคงข้อความไว้ให้กดง่าย */}
                        <button type="button"
                          className="btn btn-sm bg-light text-dark hover:bg-light-hover min-h-11 flex-1 justify-center sm:min-h-0 sm:flex-none"
                          aria-label={`แก้ไขเงื่อนไขข้อ ${i + 1}`}
                          onClick={() => { setEditingRule(r); setSheetOpen(true) }}>
                          <Icon icon="pencil" className="size-3.5" aria-hidden="true" />
                          <span className="sm:hidden">แก้ไข</span>
                        </button>
                        <button type="button" disabled={busy}
                          className="btn btn-sm text-danger hover:bg-danger min-h-11 flex-1 justify-center hover:text-white sm:min-h-0 sm:flex-none"
                          aria-label={`ลบเงื่อนไขข้อ ${i + 1}`}
                          onClick={() => deleteException(r.id)}>
                          <Icon icon="trash" className="size-3.5" aria-hidden="true" />
                          <span className="sm:hidden">ลบ</span>
                        </button>
                      </div>
                    )}
                  </li>
                ))}

                {/* แถวสุดท้าย = คำตอบพื้นฐานตัวจริง · เส้น accent ซ้ายอยู่ที่ "แถว" ไม่ใช่ขอบการ์ด
                    accent จึงชี้ของจริงและไม่ซ้อน 2 ชั้น (accepted exception ตาม DESIGN.md §8 "Do's and Don'ts" / spec §7) */}
                <li className="border-s-primary border-s-3 px-4.75 py-3">
                  {/* ชื่อ "คำตอบปกติ" ไม่ใช่ "ทุกกรณีที่เหลือ" และไม่มี badge กำกับ (user +
                      /impeccable clarify 2026-07-31): ของเดิมนิยามด้วยการปฏิเสธ 2 ชั้นซ้อนกัน
                      ("ที่เหลือ" + "ไม่เข้าข้อไหนเลย") ซึ่งบังคับให้คนอ่านนึกเซ็ตทั้งหมดก่อนแล้ว
                      ค่อยลบออก = รูปที่ยากที่สุดสำหรับกลุ่ม digital-literacy ต่ำ ซึ่ง PRODUCT.md
                      ระบุเป็นผู้ใช้หลัก · badge ถูกตัดเพราะพูดซ้ำกับชื่อ และข้อมูลนั้นมีอยู่แล้วที่
                      บรรทัดกลไกบนหัวการ์ด + ตำแหน่งแถวที่อยู่ล่างสุด */}
                  <div className="mb-1.5">
                    <label htmlFor="k-fallback-reply" className="text-default-800 mb-0 text-sm font-semibold">
                      คำตอบปกติ
                    </label>
                  </div>
                  {/* WARNING: ห้ามห่อ textarea ด้วย div ที่มี border แล้วสั่ง border-0 ที่ตัว textarea —
                      `_forms.css` ของ Paces ไม่ห่อ @layer ทำให้ style ระดับ element ชนะ utility ของ
                      Tailwind กรอบของ textarea จึงไม่หาย ได้กรอบซ้อนกรอบ (บั๊กจริง 2026-07-29,
                      ตรงกับ memory feedback_paces_forms_css_gotchas) — ใช้ form-textarea ตรง ๆ
                      แล้ววางตัวนับไว้นอกกรอบแทน */}
                  <textarea id="k-fallback-reply" className="form-textarea" rows={4} value={defaultReply} disabled={!canEdit}
                    maxLength={REPLY_MAX} onChange={(e) => setDefaultReply(e.target.value)}
                    placeholder="เช่น สนใจสินค้ารายการไหนคะ ส่งรูปหรือชื่อสินค้าเข้ามาได้เลยค่ะ"
                    aria-label="คำตอบปกติ" />
                  <div className="mt-1.5 flex justify-end">
                    <span className="text-default-400 text-2xs">{defaultReply.length}/{REPLY_MAX}</span>
                  </div>
                </li>
              </ul>

              {/* 0 เงื่อนไข (เคสพบบ่อยสุด): ไม่มีเลขลำดับ ไม่มีกล่องเส้นประ — ชวนเบา ๆ บรรทัดเดียว */}
              {/* ไม่มีบรรทัดชวนตรงนี้ (user 2026-07-31 "เอาออก มันซ้ำซ้อน") — ปุ่ม
                  "เพิ่มเงื่อนไขเฉพาะ" อยู่หัวการ์ดใบนี้แล้ว การชวนซ้ำอีกครั้งคือพูด
                  เรื่องเดียวกันสองที่ ซึ่งเป็นกฎเดียวกับที่ตัดประโยค "ตรงเมื่อมีคำว่า…" ทิ้ง */}
            </div>
          </div>

          {/* เส้นเชื่อมระหว่างขั้น */}
          <div className="border-default-300 ms-6 h-4 border-s border-dashed" aria-hidden="true" />

          {/* ── แชทสำหรับทดสอบ ─────────────────────────────────────
              user 2026-07-29: "แล้วไหนเลือกช่องทางทดสอบ ... มันควรมี table สำหรับ lists รายการแชท"
              อยู่ในหน้าของกลุ่มคำ ไม่ใช่หน้าตั้งค่ารวม เพราะรายการนี้เป็นของกลุ่มคำนี้ตัวเดียว */}
          <TestThreadsCard
            apiBase={`/api/shops/auto-reply/keywords/${keyword.id}/test-threads`}
            status={status}
            canEdit={canEdit}
            openPickerSignal={pickerSignal}
            onCountChange={(count) => {
              setTestThreadCount(count)
              // ผู้ใช้กด "ทดสอบ" ไว้ตอน 0 แชท — พอมีแชทแรกแล้วเปิดโหมดให้เลย
              // เขาจะได้ไม่ต้องเลื่อนกลับขึ้นไปกดปุ่มเดิมซ้ำ (ทางตันเดิม)
              if (pendingTestRef.current && count > 0) {
                pendingTestRef.current = false
                void changeStatus('TEST')
              }
            }}
          />
        </div>

        <div className="xl:col-span-3">
          <SimulatePanel channels={channels} products={products} keywordId={keyword.id}
            previewReply={defaultReply}
            onEnable={() => changeStatus('TEST')} canEdit={canEdit} />
        </div>
      </div>

      {/* ── footer บันทึก — โผล่เฉพาะตอนมีของที่ยังไม่ได้บันทึก (CL-22)
             เดิมแสดงตลอดพร้อมประโยคบอกว่ายังไม่ได้แก้อะไร + ปุ่มจาง 2 ปุ่ม = กินพื้นที่จอ
             ถาวรเพื่อบอกว่า "ไม่มีอะไร" และลอยทับช่องพิมพ์คำตอบด้วย
             ยังบอกว่าแก้อะไรไปบ้าง (ช่วยตอนแก้หลายจุดพร้อมกัน) — ต่างจาก reference ตรงนี้
             fade เข้าใช้ starting:opacity-0 (Tailwind 4 = @starting-style) เพราะ Paces ไม่มี
             keyframe เข้า/ออกให้ใช้ และห้ามเขียน CSS ใหม่
             bottom-20 บนจอ <lg กัน SellerBottomNav (fixed 64px) ทับ ── */}
      {canEdit && dirty.length > 0 && (
        <div className="card sticky bottom-20 lg:bottom-4 z-10 mt-4 opacity-100 transition-opacity duration-200 starting:opacity-0">
          <div className="card-body flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="text-default-600 text-sm">
              {`แก้ไข ${dirty.length} อย่าง: ${dirty.join(', ')}`}
            </span>
            <div className="flex gap-2">
              <button className="btn bg-light text-dark hover:bg-light-hover min-h-11 sm:min-h-0" disabled={busy}
                onClick={async () => {
                  // ถามก่อนคืนค่า — กดพลาดแล้วสิ่งที่พิมพ์ไว้หายทั้งหมด กู้คืนไม่ได้
                  const ok = await pacesConfirm.danger(
                    'ล้างสิ่งที่แก้ไว้?',
                    'ค่าที่แก้ในหน้านี้จะกลับไปเป็นค่าที่บันทึกไว้ล่าสุด',
                    { confirmButtonText: 'ล้างที่แก้ไว้' },
                  )
                  if (!ok) return
                  setName(keyword.name)
                  setPriority(keyword.priority); setDefaultReply(defaultRule?.replyText ?? '')
                }}>ล้างที่แก้ไว้</button>
              <button className="btn bg-primary hover:bg-primary-hover min-h-11 text-white sm:min-h-0"
                disabled={busy} onClick={saveAll}>
                บันทึกการเปลี่ยนแปลง
              </button>
            </div>
          </div>
        </div>
      )}

      {sheetOpen && (
        <ExceptionSheet
          keywordId={keyword.id} channels={channels} products={products}
          rule={editingRule}
          // เคลียร์ editingRule ด้วย ไม่งั้นกด "เพิ่มเงื่อนไขเฉพาะ" ครั้งถัดไปจะเปิดเป็นโหมดแก้
          onClose={() => { setSheetOpen(false); setEditingRule(null) }}
          onCreated={(created) => {
            setRules((r) => [...r, ...created]); setSheetOpen(false); setEditingRule(null); router.refresh()
          }}
          onUpdated={(updated) => {
            /**
             * บอกลำดับใหม่เมื่อความเจาะจงเปลี่ยน (เช่น เพิ่มสินค้าเข้าไป → ขึ้นไปอยู่บนกว่าเดิม)
             * เทียบ before/after ด้วย sortExceptions ตัวเดียวกับที่เรนเดอร์บันได
             * และใช้ specificity ที่ service ส่งกลับมา — ห้ามคำนวณเองที่ client (TFR-004)
             */
            const before = sortExceptions(rules).findIndex((r) => r.id === updated.id)
            const next = rules.map((r) => (r.id === updated.id ? updated : r))
            const after = sortExceptions(next).findIndex((r) => r.id === updated.id)
            setRules(next); setSheetOpen(false); setEditingRule(null)
            pacesToast.success(
              after !== before ? `บันทึกแล้ว — ข้อนี้ย้ายไปอยู่ลำดับที่ ${after + 1}` : 'บันทึกแล้ว',
            )
            router.refresh()
          }}
        />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   sheet เพิ่ม/แก้เงื่อนไขเฉพาะ — โหมดแก้ prefill จาก rule เดิมแล้ว PATCH
   ═══════════════════════════════════════════════════════════════════ */
function ExceptionSheet({
  keywordId, channels, products, rule = null, onClose, onCreated, onUpdated,
}: {
  keywordId: string
  channels: Channel[]
  products: Product[]
  /** null = โหมดเพิ่ม (POST ได้หลายข้อ) · Rule = โหมดแก้ (PATCH ข้อเดียว) */
  rule?: Rule | null
  onClose: () => void
  onCreated: (r: Rule[]) => void
  onUpdated: (r: Rule) => void
}) {
  // derive จาก prop ไม่ต้องมี state `mode` แยก — state ซ้อนที่ต้อง sync เองคือที่มาของบั๊ก
  const isEdit = rule !== null
  /**
   * prefill ผ่าน initializer ของ useState เท่านั้น — ถ้าใช้ useEffect แล้ว setState
   * ค่าจะกระพริบหนึ่งเฟรม และถ้า effect รันซ้ำจะทับค่าที่ user พิมพ์ไปแล้ว
   */
  const [usePage, setUsePage] = useState(() => rule?.shopChannelId != null)
  const [useAd, setUseAd] = useState(() => rule?.adId != null)
  const [useProduct, setUseProduct] = useState(() => rule?.productId != null)
  const [channelIds, setChannelIds] = useState<string[]>(() => (rule?.shopChannelId ? [rule.shopChannelId] : []))
  const [adIds, setAdIds] = useState<string[]>(() => (rule?.adId ? [rule.adId] : []))
  const [adQuery, setAdQuery] = useState('')
  const [productId, setProductId] = useState(() => rule?.productId ?? '')
  const [productQuery, setProductQuery] = useState('')
  const [reply, setReply] = useState(() => rule?.replyText ?? '')
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

  /**
   * โหมดแก้ที่ผูกโฆษณาไว้ต้องโหลดรายการโฆษณาเองตอนเปิด — ปกติ `ads` โหลดตอนติ๊ก checkbox
   * เท่านั้น ถ้าไม่โหลดที่นี่ ช่องโฆษณาจะกางอยู่แต่ไม่มีตัวเลือกให้เห็นเลยว่าผูกอันไหนไว้
   * (sheet mount ใหม่ทุกครั้งที่เปิด จึงรันครั้งเดียวพอ)
   */
  useEffect(() => {
    if (rule?.adId) loadAds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * ค้นได้ทั้งชื่อ ข้อความโฆษณา และ ID — ร้านที่จำชื่อไม่ได้มักถือ ID มาจาก Ads Manager
   * ตัวที่เลือกไว้แล้วต้องไม่หายตอนพิมพ์ค้นหา ไม่งั้นจะดูเหมือนติ๊กหลุด
   */
  const visibleAds = useMemo(() => {
    if (!ads) return null
    const q = adQuery.trim().toLowerCase()
    if (!q) return ads
    return ads.filter(
      (a) =>
        adIds.includes(a.adId) ||
        a.adId.toLowerCase().includes(q) ||
        (a.adTitle ?? '').toLowerCase().includes(q) ||
        (a.adBody ?? '').toLowerCase().includes(q),
    )
  }, [ads, adQuery, adIds])

  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (q) return products.filter((p) => p.name.toLowerCase().includes(q))
    const first = products.slice(0, 12)
    /**
     * ปักสินค้าที่ผูกไว้ให้เห็นเสมอ — ถ้ามันอยู่นอก 12 ตัวแรก user จะเห็นเหมือน "ยังไม่ได้เลือก"
     * แล้วกดบันทึกทับ = เงื่อนไขสินค้าเดิมหายโดยไม่มีใครรู้ตัว
     */
    if (productId && !first.some((p) => p.id === productId)) {
      const pinned = products.find((p) => p.id === productId)
      if (pinned) return [pinned, ...first.slice(0, 11)]
    }
    return first
  }, [products, productQuery, productId])

  /** ประโยคสรุปภาษาคน — ผู้ใช้ไม่ต้องรู้จักคำว่า specificity */
  const summary = useMemo(() => {
    const parts: string[] = []
    if (usePage && channelIds.length > 0) {
      const names = channelIds.map((id) => channels.find((c) => c.id === id)?.name).filter(Boolean)
      parts.push(names.length === 1 ? `เพจ “${names[0]}”` : `เพจ ${names.map((n) => `“${n}”`).join(' หรือ ')}`)
    }
    if (useAd && adIds.length > 0) {
      // fallback rule.adLabel ก่อนตกไปที่ id ดิบ — ไม่งั้นโหมดแก้จะโชว์เลข ad id ระหว่าง ads โหลด
      const names = adIds.map(
        (id) => ads?.find((a) => a.adId === id)?.adTitle ?? (id === rule?.adId ? rule.adLabel : null) ?? id,
      )
      parts.push(names.length === 1 ? `โฆษณา “${names[0]}”` : `โฆษณา ${names.map((n) => `“${n}”`).join(' หรือ ')}`)
    }
    if (useProduct && productId) parts.push(`สินค้า “${products.find((p) => p.id === productId)?.name}”`)
    if (parts.length === 0) return null
    return parts.join(' และ ')
  }, [usePage, useAd, useProduct, channelIds, adIds, productId, channels, ads, products, rule])

  const pageChosen = usePage && channelIds.length > 0
  /** จำนวนมิติที่ติ๊กจริง — ใช้บอกความเจาะจงเป็นภาษาคน (ผู้ใช้ไม่ต้องรู้จักคำว่า specificity) */
  const dimCount =
    (pageChosen ? 1 : 0) + (useAd && adIds.length > 0 ? 1 : 0) + (useProduct && productId ? 1 : 0)

  /**
   * CL-1: โฆษณาผูกกับเพจในโมเดลข้อมูล — service โยน AUTO_REPLY_RULE_AD_REQUIRES_CHANNEL
   * ถ้าได้ adId มาโดยไม่มี shopChannelId ก่อนหน้านี้ canSubmit ไม่บังคับข้อนี้ จึงกดถึงได้จริง
   * บน prod แล้วได้ 500 (mapServiceError ที่แก้ใน S-02 เป็น backstop ไม่ใช่ทางกัน)
   */
  const adMissingPage = useAd && !pageChosen

  const canSubmit =
    summary !== null && reply.trim().length > 0 && !busy &&
    (!usePage || channelIds.length > 0) && (!useAd || adIds.length > 0) && !adMissingPage

  /**
   * CL-8: ลำดับของสูตรนี้คือตัวกันบั๊ก ไม่ใช่แค่ความสวย — ต้องคืน `rule.adLabel` ก่อนเสมอเมื่อ
   * โฆษณาไม่ได้เปลี่ยน จึงไม่พึ่ง `ads` ที่เริ่มเป็น null และโหลด lazy เลย ถ้าใช้สูตรของโหมดเพิ่ม
   * (`ads.find(...)`) ตรง ๆ ตอน ads ยังไม่มา จะส่ง adLabel: null ไปทับชื่อเดิม แล้วชิปในบันได
   * กลายเป็นเลข ad id ดิบ (condLabel fallback `r.adLabel ?? r.adId`)
   * เส้นทางนี้ทดสอบอัตโนมัติไม่ได้ — dev DB ไม่มีเงื่อนไขที่มี adId และโปรเจกต์ไม่มี RTL
   * (vitest environment: "node") จึงต้องกันด้วยรูปของโค้ด
   */
  function resolveAdLabel(nextAdId: string | null): string | null {
    if (nextAdId === null) return null
    const fromList = ads?.find((a) => a.adId === nextAdId)?.adTitle ?? null
    if (rule && nextAdId === rule.adId) return rule.adLabel ?? fromList
    return fromList
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      if (rule !== null) {
        /**
         * โหมดแก้ = 1 แถวคือ 1 rule จึง PATCH เดียว ไม่วนคู่ผสมเหมือนโหมดเพิ่ม
         * AutoReplyRuleUpdateSchema ไม่ใช่ partial (A-2) — ต้องส่งครบ 8 field ทุกครั้ง
         * ส่งขาด key = valibot 400 · ห้ามส่ง keywordId (schema ไม่รับ service ตรึงจากแถวเดิม)
         */
        const nextAdId = useAd && adIds[0] ? adIds[0] : null
        // specificity ใน response คือค่าที่ service คำนวณใหม่ — ใช้ค่านั้น ห้าม optimistic เอง
        const updated: Rule = await callApi(`/api/shops/auto-reply/rules/${rule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopChannelId: usePage && channelIds[0] ? channelIds[0] : null,
            adId: nextAdId,
            adLabel: resolveAdLabel(nextAdId),
            productId: useProduct && productId ? productId : null,
            replyText: reply.trim(),
            // คงค่าเดิม — hardcode true จะเปิดกฎที่ร้านตั้งใจปิดไว้เงียบ ๆ
            isActive: rule.isActive,
            activeFrom: null,
            activeUntil: null,
          }),
        })
        // toast อยู่ที่ parent เพราะต้องเทียบลำดับก่อน/หลังจาก rules ทั้งชุด
        onUpdated(updated)
        return
      }
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
            <Icon icon="git-branch" className="text-primary size-4.5" aria-hidden="true" />
            {isEdit ? 'แก้เงื่อนไขเฉพาะ' : 'เพิ่มเงื่อนไขเฉพาะ'}
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
              // โหมดเพิ่ม: ติ๊กได้หลายเพจ — เลือก 2 เพจ = สร้างเงื่อนไขเฉพาะ 2 ข้อที่ใช้คำตอบเดียวกัน
              // (ตาราง AutoReplyRule เก็บ 1 แถวต่อ 1 เงื่อนไข ไม่ใช่ array ของเพจ)
              // โหมดแก้: 1 แถว = 1 เพจ จึงเป็น form-radio (CL-5) — checkbox ที่ทำตัวเป็น radio
              // = โกหก affordance ส่วน <select> เป็น control ชนิดใหม่ใน sheet ทำ consistency แย่ลง
              <div className="mt-2.5 space-y-1.5">
                {channels.length === 0 && <p className="text-default-500 text-xs">ยังไม่ได้เชื่อมเพจใด</p>}
                {channels.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type={isEdit ? 'radio' : 'checkbox'}
                      name={isEdit ? 'ex-page' : undefined}
                      className={isEdit ? 'form-radio rounded-full!' : 'form-checkbox'}
                      checked={channelIds.includes(c.id)}
                      onChange={(e) =>
                        setChannelIds((prev) =>
                          isEdit ? [c.id] : e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                        )
                      }
                    />
                    {/* รูปเพจ (user 2026-08-02) — ร้านที่มีหลายเพจชื่อคล้ายกันแยกด้วยรูปได้เร็ว
                        กว่าอ่านชื่อจนจบ; ใช้ PageAvatar ตัวเดียวกับ PagePicker ไม่เขียนใหม่ */}
                    <PageAvatar avatarUrl={c.avatarUrl} name={c.name} size="size-7" />
                    <span className="text-default-700 min-w-0 truncate">{c.name}</span>
                    <span className="text-default-400 shrink-0 text-xs">{c.provider === 'INSTAGRAM' ? 'Instagram' : 'Messenger'}</span>
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
            {/* บอกเหตุผลไว้ก่อนติ๊ก — เงื่อนไขที่ระบุโฆษณาต้องมีเพจด้วยเสมอ (CL-1) */}
            <p className="text-default-700 mt-1 text-xs">โฆษณาผูกกับเพจ — เลือกเพจที่โฆษณานั้นวิ่งอยู่ด้วย</p>
            {adMissingPage && (
              // ข้อความเป็น text-default-800 · text-warning ใช้ได้แค่ที่ไอคอน (บนพื้นขาว 1.9:1)
              <p className="text-default-800 mt-1.5 flex items-start gap-1.5 text-xs">
                <Icon icon="alert-triangle" className="text-warning mt-0.5 size-4 flex-none" aria-hidden="true" />
                ติ๊ก “มาจากเพจ” แล้วเลือกเพจก่อน จึงจะบันทึกเงื่อนไขที่ระบุโฆษณาได้
              </p>
            )}
            {useAd && (
              <div className="mt-2.5">
                {/* บอกที่มาของรายการ (user 2026-08-02) — ร้านที่ยิงโฆษณาใหม่แล้วหาไม่เจอ
                    จะนึกว่าระบบพัง ทั้งที่เป็นข้อจำกัดของสิทธิ์ที่ Meta ยังไม่ได้ให้:
                    เราอ่านได้เฉพาะโฆษณาที่มีคนทักเข้ามาจริง (จาก webhook) ยังดึงรายชื่อ
                    จาก Marketing API ไม่ได้จนกว่า App Review จะอนุมัติ ads_read */}
                {ads !== null && (
                  <p className="text-default-500 mb-2 flex items-start gap-1.5 text-xs">
                    <Icon icon="info-circle" className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
                    <span>
                      รายการนี้คือโฆษณาที่เคยมีลูกค้าทักเข้ามาแล้วเท่านั้น
                      โฆษณาที่เพิ่งยิงและยังไม่มีใครทัก จะขึ้นให้เลือกหลังมีคนทักครั้งแรก
                    </span>
                  </p>
                )}
                {ads !== null && ads.length > 5 && (
                  <div className="input-icon-group mb-2">
                    <Icon icon="search" className="input-icon" />
                    <input
                      type="search"
                      className="form-input form-input-sm"
                      placeholder="ค้นหาชื่อ ข้อความ หรือ ID โฆษณา"
                      value={adQuery}
                      onChange={(e) => setAdQuery(e.target.value)}
                      aria-label="ค้นหาโฆษณา"
                    />
                  </div>
                )}
                {ads === null ? (
                  <p className="text-default-500 text-xs">กำลังโหลด…</p>
                ) : ads.length === 0 ? (
                  <p className="text-default-500 text-xs">
                    ยังไม่มีลูกค้าทักเข้ามาจากโฆษณาใด — พอมีคนทักจากโฆษณาครั้งแรก โฆษณานั้นจะขึ้นที่นี่เอง
                  </p>
                ) : visibleAds && visibleAds.length === 0 ? (
                  <p className="text-default-500 text-xs">ไม่พบโฆษณาที่ตรงกับคำค้นหา</p>
                ) : (
                  (visibleAds ?? []).map((a) => {
                    const on = adIds.includes(a.adId)
                    return (
                      <label key={a.adId}
                        className={`mb-1.5 flex w-full cursor-pointer items-start gap-3 rounded border p-3 ${on ? 'border-primary bg-primary/5' : 'border-default-200'}`}>
                        <input
                          type={isEdit ? 'radio' : 'checkbox'}
                          name={isEdit ? 'ex-ad' : undefined}
                          className={isEdit ? 'form-radio rounded-full! mt-1 flex-none' : 'form-checkbox mt-1 flex-none'}
                          checked={on}
                          onChange={(e) =>
                            setAdIds((prev) =>
                              isEdit
                                ? [a.adId]
                                : e.target.checked
                                  ? [...prev, a.adId]
                                  : prev.filter((x) => x !== a.adId),
                            )
                          }
                        />
                        {/* รูปโฆษณา — ตัวแยกที่ใช้ได้จริงเมื่อชื่อซ้ำกันหรือ Meta ไม่ส่งชื่อมา
                            mirror เข้า storage แล้วตอนรับ webhook ไม่ hotlink CDN Meta ที่หมดอายุ */}
                        {a.photoFileId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/files/${a.photoFileId}`}
                            alt=""
                            loading="lazy"
                            className="size-16 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="bg-default-100 text-default-400 flex size-16 shrink-0 items-center justify-center rounded-md">
                            <Icon icon="speakerphone" className="text-2xl" aria-hidden="true" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="text-default-800 block truncate text-sm font-medium">{a.adTitle ?? a.adId}</span>
                          {/* ข้อความเต็ม ไม่ truncate (user 2026-08-02) — โฆษณาชุดเดียวกัน
                              มักต่างกันแค่ท้ายข้อความ ตัดทิ้งแล้วแยกไม่ออกว่าอันไหนคืออันไหน */}
                          {a.adBody && (
                            <span className="text-default-600 mt-0.5 block text-xs whitespace-pre-wrap">{a.adBody}</span>
                          )}
                          {/* แสดง ID ด้วย (user request) — ชื่อโฆษณาซ้ำกันได้ ID คือตัวที่แยกออกจริง
                              และร้านเอาไปเทียบกับ Ads Manager ได้ */}
                          <span className="text-default-400 block truncate text-xs">
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
            <div className="bg-primary/8 text-default-800 mt-3 flex gap-2 rounded p-3 text-xs leading-relaxed">
              <Icon icon="info-circle" className="text-primary mt-0.5 size-4 flex-none" aria-hidden="true" />
              <span>
                คำตอบนี้จะถูกใช้เมื่อลูกค้าทักจาก {summary}
                {/* CL-7: บอกความเจาะจงเป็นจำนวนมิติที่ติ๊ก — พูดเฉพาะตอนที่ยังเป็นความจริง
                    เพราะสูตรจริงคือ เพจ 4 + โฆษณา 2 + สินค้า 1 ข้อที่ระบุ "แค่เพจ" หรือ
                    "แค่สินค้า" จึงไม่ได้ถูกตรวจก่อนข้อที่ระบุแค่เพจ (เท่ากัน/ต่ำกว่า) */}
                {dimCount >= 2 && pageChosen && (
                  <>
                    <br />
                    เงื่อนไขนี้เจาะจง {dimCount} อย่าง จะถูกตรวจก่อนข้อที่ระบุแค่เพจอย่างเดียว
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        {/* CL-4: btn-soft-default / btn-primary ไม่มีนิยามใน CSS เลย และ .btn ไม่มีพื้นหลัง
            → ปุ่มเรนเดอร์เป็นตัวหนังสือลอย ๆ ใช้ variant จริงตาม paces-component-reference §1 */}
        <div className="card-footer flex justify-end gap-2">
          <button className="btn bg-light text-dark hover:bg-light-hover" onClick={onClose}>ยกเลิก</button>
          <button className="btn bg-primary hover:bg-primary-hover text-white" disabled={!canSubmit} onClick={submit}>
            {isEdit ? 'บันทึกเงื่อนไข' : 'เพิ่มเงื่อนไขเฉพาะ'}
          </button>
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
  keywordId,
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
  /**
   * "ลูกค้าคนนี้มาจากโฆษณาไหน" (user report 2026-08-02: "ทดสอบด้านขวาไม่สามารถเลือก option
   * ads ได้ เลยทดสอบว่ามาจาก ads ไหนตอบอะไรไม่ได้")
   *
   * เดิม simulate ส่ง adId: null ตายตัว — เงื่อนไขเฉพาะที่ผูกกับโฆษณาจึงไม่มีทางถูกเลือกใน
   * การทดสอบเลย ร้านตั้งกฎ "โฆษณาตัวนี้ตอบราคานี้" แล้วลองไม่ได้ ต้องรอลูกค้าจริงทักเข้ามา
   * ถึงจะรู้ว่าถูกหรือผิด ซึ่งสายไปแล้ว (ตอบราคาผิดรุ่นคือความเสียหายอันดับ 1 ใน PRD §6.1)
   */
  const [ads, setAds] = useState<Ad[] | null>(null)
  const [adId, setAdId] = useState('')

  // โหลดครั้งเดียวตอน mount — รายการโฆษณาของร้านมักไม่เกินหลักสิบ และแผงนี้เปิดค้างทั้งหน้า
  // ถ้าโหลดตอนกดเลือกจะเห็น select ว่างแวบหนึ่งทุกครั้ง
  useEffect(() => {
    let alive = true
    callApi('/api/shops/auto-reply/ads', { method: 'GET' })
      .then((data) => {
        if (alive) setAds(data.items ?? [])
      })
      .catch(() => {
        if (alive) setAds([])
      })
    return () => {
      alive = false
    }
  }, [])

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
        body: JSON.stringify({
          message: text,
          shopChannelId: channelId || null,
          adId: adId || null,
          productId: null,
        }),
      })

      if (data.willHandoff) {
        /**
         * WARNING: ข้อความเดิมคือ "ไม่เข้าเงื่อนไขข้อใด — ระบบจะเงียบและส่งต่อให้พนักงาน"
         * ซึ่ง **ผิดทั้งสองท่อน** หลังแก้บั๊ก 2026-07-31:
         *
         * 1) ไม่มีการส่งต่อ — `NO_KEYWORD_MATCH` เลิกเขียน `handoffAt` แล้ว
         *    (auto-reply.service.ts:485) เพราะ handoffAt เป็นสวิตช์ถาวรที่ไม่มีที่ไหนเคลียร์
         *    เคยล็อกห้องจริงบน prod 240 ห้องตั้งแต่ข้อความแรก
         * 2) ไม่ได้เงียบเสมอไป — ตรงจุดที่เมื่อก่อนเงียบ ตอนนี้ DeepBot ลองตอบจากคลังความรู้ก่อน
         *    (`tryChatbotAnswer` ใน else ของ NO_KEYWORD_MATCH)
         *
         * หน้าพรีวิวยืนยันแทน ChatBot ไม่ได้ เพราะ /simulate ไม่ได้เรียก AI (เป็น matcher ล้วน)
         * จึงต้องพูดเท่าที่รู้จริง: "กลุ่มคำไม่มีข้อไหนตรง" แล้วบอกว่าใครรับช่วงต่อ — ห้าม
         * ยืนยันว่าลูกค้าจะไม่ได้คำตอบ ร้านที่อ่านแล้วเชื่อจะไปไล่เพิ่มคำทั้งที่บอทตอบได้อยู่แล้ว
         */
        setTurns((t) => [
          ...t,
          {
            who: 'none',
            text: 'ไม่มีเงื่อนไขข้อไหนตรง — กลุ่มคำนี้จะไม่ตอบข้อความนี้ ถ้าเปิด DeepBot ไว้ ระบบจะให้ DeepBot ลองตอบจากคลังความรู้ต่อ (หน้านี้ยังลองส่วนนั้นให้ไม่ได้)',
          },
        ])
      } else {
        /**
         * พรีวิวค้นทั้งร้าน ไม่ใช่เฉพาะกลุ่มนี้ (simulate/route.ts: findMany ทุก keyword ของ shop)
         * ผู้ชนะจึงอาจเป็น "กลุ่มอื่น" — เดิมเขียนว่า "ชุดนี้ยังไม่ใช้งาน" ซึ่งชี้กลุ่มผิดได้
         * critique 2026-07-31 [P0] "พรีวิวคิวรีทั้งร้าน แต่ไม่บอกว่ากลุ่มไหนตอบ ทั้งที่ API
         * คืน winnerState.keywordName มาแล้ว" — เรียกชื่อกลุ่มตรง ๆ จบทั้งสองปัญหา
         */
        const notes: string[] = []
        const winnerName = data.winnerState?.keywordName
        const isThisGroup = data.winnerState?.keywordId === keywordId
        if (winnerName && !isThisGroup) notes.push(`ตอบโดยกลุ่ม “${winnerName}”`)
        if (data.winnerState?.status === 'OFFLINE') {
          notes.push(isThisGroup ? 'กลุ่มนี้ยังไม่ใช้งาน' : `กลุ่ม “${winnerName}” ยังไม่ใช้งาน`)
        }
        if (data.winnerState?.status === 'TEST') {
          notes.push(isThisGroup ? 'กลุ่มนี้อยู่โหมดทดสอบ' : `กลุ่ม “${winnerName}” อยู่โหมดทดสอบ`)
        }
        setTurns((t) => [
          ...t,
          { who: 'page', text: data.replyText ?? '', note: notes.length ? notes.join(' · ') : undefined },
        ])
        // ปุ่มเปิดโหมดทดสอบสั่งได้เฉพาะ *กลุ่มนี้* — ถ้าผู้ชนะเป็นกลุ่มอื่น กดไปก็ไม่แก้สิ่งที่เห็น
        setNeedsEnable(data.winnerState?.status === 'OFFLINE' && isThisGroup)
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
      {/* แผงนี้เคยไม่มีชื่อเลย — หัวการ์ดมีแต่ตัวเลือกเพจกับปุ่มล้าง คนที่กวาดตามาเจอคอลัมน์ขวา
          จึงไม่รู้ว่ามันคืออะไรจนกว่าจะลองพิมพ์ (critique heuristic 10 Help/Documentation)
          ชื่อ + บรรทัดเดียวบอกขอบเขต ("ไม่ส่งออกจริง") ปิดช่องว่างนั้นโดยไม่กินที่ */}
      <div className="card-header flex flex-col items-stretch gap-2">
        <h6 className="text-default-800 mb-0 flex items-center gap-2 text-sm font-semibold">
          <Icon icon="player-play" className="text-primary size-4 flex-none" aria-hidden="true" />
          ลองพิมพ์ดูว่าจะตอบว่าอะไร
        </h6>
        <div className="flex items-center gap-2">
          {channels.length > 0 ? (
            <PagePicker options={channels} value={channelId} onChange={setChannelId} />
          ) : (
            <p className="text-default-500 flex-1 text-sm">ยังไม่ได้เชื่อมเพจใด</p>
          )}
          {turns.length > 0 && (
            /* CL-4 (ซ้ำรอบสาม): `btn-soft-default` ไม่มีนิยามใน Paces และ `.btn` เองไม่มีพื้นหลัง
               → ปุ่มเรนเดอร์เป็นตัวหนังสือลอย ๆ · ยืนยันด้วย
               `rg '\.btn-[a-z-]+' src/assets/css/` = มีแค่ btn-icon|btn-lg|btn-light|
               btn-on-hover-icon|btn-sm|btn-theme-setting · ครึ่งซ้ายของหน้าเลี่ยงไปใช้ utility
               จริงตั้งแต่แรก แต่แผงขวาถูกข้าม ทั้งที่ critique 2026-07-31 แจ้งเป็น [P0] แล้ว */
            <button
              className="btn btn-sm bg-light text-dark hover:bg-light-hover flex-none"
              onClick={() => { setTurns([]); setNeedsEnable(false) }}
            >
              ล้าง
            </button>
          )}
        </div>
      </div>

      {/* "ลูกค้าคนนี้มาจากโฆษณาไหน" — ตัวแปรสำคัญที่สุดของการตอบอัตโนมัติรองจากเพจ เพราะกฎ
          ระดับโฆษณาชนะกฎระดับเพจเสมอ (user report 2026-08-02: เลือกไม่ได้เลย เลยทดสอบกฎที่
          ผูกโฆษณาไม่ได้). ใช้ form-select ไม่ใช่ dropdown เพราะเป็น "ค่าของฟิลด์" ไม่ใช่เมนู action
          ซ่อนทั้งแถวเมื่อร้านยังไม่เคยมีลูกค้ามาจากโฆษณา — ไม่มีอะไรให้เลือกก็ไม่ต้องมีช่อง */}
      {ads !== null && ads.length > 0 && (
        <div className="border-default-200 flex items-center gap-2 border-b px-4 py-2">
          <label htmlFor="sim-ad" className="text-default-500 shrink-0 text-xs">
            มาจากโฆษณา
          </label>
          <select
            id="sim-ad"
            className="form-select form-select-sm min-w-0 flex-1 text-sm"
            value={adId}
            onChange={(e) => setAdId(e.target.value)}
          >
            <option value="">ไม่ได้มาจากโฆษณา</option>
            {ads.map((a) => (
              // ชื่อโฆษณาว่างได้ (Meta ไม่ส่ง ad_title มาทุกครั้ง) — fallback เป็น id ดิบดีกว่า
              // ตัวเลือกว่างเปล่าที่เลือกแล้วไม่รู้ว่าเลือกอะไรไป
              <option key={a.adId} value={a.adId}>
                {a.adTitle ?? `รหัสโฆษณา ${a.adId}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* บทสนทนา — Base ChatThread.tsx:887-980 (`my-5 flex items-start gap-2.5` + justify-end
          ฝั่งเรา, บับเบิล `rounded px-6 py-3`, ลูกค้า `bg-light` / เพจ `bg-primary text-white`)
          ฝั่งซ้าย = ลูกค้า ฝั่งขวา = เพจ ให้ตรงกับห้องแชทจริง (เดิมกลับข้างกัน) */}
      <div className="bg-light/30 max-h-96 min-h-72 overflow-y-auto px-4">
        {turns.length === 0 ? (
          <div className="py-8">
            {previewReply.trim() ? (
              <>
                <p className="text-default-400 mb-4 text-center text-xs">ตัวอย่างคำตอบที่ตั้งไว้</p>
                {/* แสดงให้เหมือนบับเบิลจริงในห้องแชท (user สั่ง 2026-08-01) — เดิมเป็นบับเบิลจาง
                    opacity-60 และไม่มีป้าย DeepBot ทำให้ร้านไม่เห็นว่าลูกค้าจะเห็นอะไรจริง ๆ
                    Base: ChatThread.tsx บับเบิลฝั่งร้าน (relative + max-w-96 + bg-primary) */}
                <div className="flex items-start justify-end gap-2.5">
                  <div className="relative min-w-0 max-w-96 break-words">
                    <PreviewBotTag />
                    <div className="bg-primary rounded px-6 py-3">
                      <p className="mb-0 text-sm whitespace-pre-wrap text-white">{previewReply}</p>
                    </div>
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
                <div className={`relative min-w-0 break-words ${t.who === 'page' ? 'max-w-96' : ''}`}>
                  {/* ผลจำลองฝั่งร้าน = สิ่งที่ DeepBot จะส่ง จึงติดป้ายเดียวกับของจริง */}
                  {t.who === 'page' && <PreviewBotTag />}
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
          {/* ปุ่มนี้โผล่เฉพาะตอนผู้ชนะ = กลุ่มนี้เอง (เช็ค isThisGroup ใน send()) จึงพูดว่า
              "กลุ่มนี้" ได้จริง · btn-soft-primary ไม่มีนิยาม → พื้นม่วงโปร่งด้วย token ตรง ๆ */}
          <button
            className="btn btn-sm bg-primary/10 text-primary hover:bg-primary/15 w-full"
            onClick={onEnable}
          >
            เปิดโหมดทดสอบให้กลุ่มนี้
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
            className="btn bg-primary hover:bg-primary-hover flex-none text-white"
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
