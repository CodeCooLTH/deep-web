'use client'

/**
 * ReturnPanel — ระบบคืนของในหน้าออเดอร์และในห้องแชท (feature 00056 · P4)
 *
 * 🛑 component เดียวใช้ 2 จอ (หน้ารายละเอียด + แผงออเดอร์ในห้องแชท) ตามที่หัวหน้าสั่งว่า
 * "กดคืนของจาก order detail + หน้าแชทได้เลย" — ถ้าเขียนสองตัว ปุ่ม/กติกาจะเลื่อนออกจากกัน
 * แน่นอน (บทเรียนซ้ำจาก sibling-surface-parity.md) ต่างกันแค่ `compact` ที่ย่อ padding
 *
 * โหลดข้อมูลตอน **กางเท่านั้น** — ออเดอร์ส่วนใหญ่ไม่มีการคืนของ การยิง API ทุกใบตั้งแต่
 * paint แรกคือค่าใช้จ่ายที่แทบไม่มีใครได้ใช้
 *
 * ─── รอบ re-design 2026-08-25 (D-1..D-9) ────────────────────────────────────
 * ฟอร์ม 3 ขั้น: **วิธีคืน+ขนส่ง → ของที่คืน → ตรวจก่อนยืนยัน**
 *   - radio 3 ข้อ (`RETURN_METHODS`) — "ใครออกค่าส่ง" เป็นผลลัพธ์ ไม่ใช่คำถาม (D-1)
 *   - ขนส่งขากลับเป็น dropdown จากรายชื่อในระบบ (D-2) และเป็น **พัสดุคนละใบกับขาไป** (D-3)
 *   - เลขพัสดุเว้นว่างได้ = "ไม่มีเลข" (D-4) · ขนาดกล่องตั้งต้น = ของขาไป แก้ได้ (D-5)
 *   - หน้าสรุปก่อนยืนยัน (D-6) ที่บอกด้วยว่า **ลูกค้าส่งกลับมาที่ไหน** (D-7)
 *   - แถวสินค้าใช้รูปจริง ไม่มีรูป = กล่องเทาเปล่า ห้ามใช้ไอคอนแทน (D-9)
 *
 * 🛑 **ตรรกะทุกตัวที่ตัดสินว่าจอจะทำอะไร อยู่ใน `src/lib/return-sheet.ts`** ไม่ใช่เทอร์นารี
 * ในไฟล์นี้ — เกณฑ์คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" ซึ่งของพวกนี้เขียนกลับด้าน
 * ได้ง่ายมากและผลคือร้านเสียเงินจริง (`ui-boolean-needs-a-testable-home.md`)
 *
 * Base: การ์ด `.card` + `.card-header` ของ Paces (โครงเดียวกับ ShippingCard ที่อยู่ติดกัน)
 *       แถบปุ่มท้ายชีตยกทั้งดุ้นจาก `RecordPaymentSheet.tsx:580` (ชีตพี่น้องในโดเมนเดียวกัน)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import {
  RETURN_PAYER_TEXT,
  RETURN_STATUS,
  RETURN_TRACKING_SOURCE,
  RETURN_TRACKING_SOURCE_TEXT,
  computeRefundAmount,
  resolveReturnShippingChoice,
  returnMethod,
  type ReturnMethodKey,
  type ReturnParcelBox,
  type ReturnPayer,
  type ReturnTrackingSource,
} from '@/lib/order-return'
import {
  METHOD_STEP_BLOCK_TEXT,
  RETURN_PRICE_TEXT,
  defaultReturnCourier,
  methodStepBlock,
  methodUsesIship,
  resolveReturnPriceState,
  selectableReturnMethods,
  type QuoteRow,
} from '@/lib/return-sheet'
import {
  COURIER_OPTIONS,
  OTHER_COURIER_CODE,
  courierBrandCode,
  courierInitials,
  courierLabel,
  courierLogoUrl,
} from '@/lib/iship/courier'
import { deriveShippingStage, resolveOrderStatusBadge } from '@/lib/order-stage'
import { formatBaht } from '@/lib/format-money'
import { ItemThumbnail } from './order-detail-shared'

type EligibleItem = {
  orderItemId: string
  name: string
  orderedQty: number
  returnedQty: number
  remainingQty: number
  unitPrice: number
  /** null = ไม่มีรูป → กล่องเทาเปล่า (D-9) ไม่ใช่ไอคอน */
  imageUrl: string | null
}

/** พัสดุ **ขาไป** ที่แถบบนสุดของฟอร์มแสดง — รวม 2 ทางเข้ามาเป็นรูปเดียวจากฝั่ง service */
type ForwardParcel = {
  courierCode: string | null
  courierName: string | null
  trackingNo: string | null
  carrierStatus: string | null
  box: ReturnParcelBox | null
}

type Eligibility = {
  canReturn: boolean
  blockedText: string | null
  items: EligibleItem[]
  forward: ForwardParcel
  ishipConnected: boolean
  orderStatus: string
}

export type ReturnRow = {
  id: string
  status: string
  payer: ReturnPayer
  trackingSource: ReturnTrackingSource
  manualTrackingNo: string | null
  returnCourierCode: string | null
  returnCourierName: string | null
  countAsCost: boolean
  refundAmount: number | null
  createdAt: string
  trackingNo: string | null
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: 'รอส่งคืน', cls: 'bg-warning/15 text-warning-ink' },
  SHIPPING: { label: 'กำลังส่งคืน', cls: 'bg-info/15 text-info-ink' },
  // ผลทางบัญชีเกิดที่นี่ (ยอดขายหาย) — ใช้ warning ไม่ใช่ success เพราะไม่ใช่ผลที่ร้านอยากได้
  RECEIVED: { label: 'รับของคืนแล้ว', cls: 'bg-warning/15 text-warning-ink' },
  CANCELLED: { label: 'ยกเลิกแล้ว', cls: 'bg-default-100 text-default-700' },
}

export default function ReturnPanel({
  orderToken,
  initialCount,
  compact = false,
  asSheet = false,
  sheetOpen = false,
  onCloseSheet,
}: {
  orderToken: string
  /** จำนวนใบคืนที่ server นับมาให้ — 0 = ยังไม่เคยมีการคืน (ยังกางเพื่อเปิดใบใหม่ได้) */
  initialCount: number
  compact?: boolean
  /**
   * โหมดชีต — ใช้ในห้องแชท ซึ่งเปิดจากเมนู `⋮` ของออเดอร์แต่ละใบ
   *
   * 🛑 ในรายการแชทมีออเดอร์หลายใบบนจอเดียว การ์ดคงที่ต่อใบจะกลายเป็น N การ์ดที่กินพื้นที่
   * เท่ากับรายการจริง และขึ้นแม้ใบนั้นคืนไม่ได้ (= เสียงรบกวนล้วน) — user ทักเองว่าผิดที่
   * ปุ่มต้องอยู่ในเมนูของออเดอร์ใบนั้นตาม `docs/conventions/seller-action-placement.md`
   */
  asSheet?: boolean
  sheetOpen?: boolean
  onCloseSheet?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  const [returns, setReturns] = useState<ReturnRow[] | null>(null)
  const [form, setForm] = useState(false)
  /**
   * ขั้นของฟอร์ม — 1 วิธีคืน+ขนส่ง · 2 ของที่คืน · 3 ตรวจก่อนยืนยัน (D-6)
   *
   * 🛑 ถามวิธีคืนก่อน เพราะนั่นคือสิ่งที่ร้าน **ตกลงกับลูกค้าไปแล้ว** ก่อนจะมากดในระบบ
   * ส่วน "ของกี่ชิ้น" เป็นรายละเอียดที่ต้องเปิดออเดอร์ดู — ถามเรื่องที่ตัดสินใจแล้วก่อน
   * ทำให้ผ่านขั้นแรกได้เร็ว และขั้นสองไม่มีอะไรมาแย่งสายตาตอนนับจำนวน (ซึ่งคือเงิน)
   *
   * ขั้น 3 มีเพราะหัวหน้าสั่งตรง ("เดี๋ยว seller สับสน") — ปุ่มที่ยิง API จริงอยู่ที่ขั้นนี้
   * ขั้นเดียว ปุ่มขั้น 2 จึงเปลี่ยนคำเป็น "ถัดไป — ตรวจก่อนยืนยัน" ให้ตรงกับสิ่งที่มันทำ
   */
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [qty, setQty] = useState<Record<string, number>>({})
  /**
   * 🛑 เก็บ **คีย์วิธี** อย่างเดียว — `payer`/`trackingSource` เป็นผลลัพธ์ที่ server ตัดสิน
   * ด้วย `resolveReturnShippingChoice()` (D-1 · BR-RT-39) จอไม่เคยส่งสองค่านั้นออกไป
   */
  const [methodKey, setMethodKey] = useState<ReturnMethodKey | null>(null)
  const [trackingNo, setTrackingNo] = useState('')
  /** รหัสขนส่งขากลับ — แพ็กเกจจริงของ iShip (วิธี ISHIP) หรือรหัสแบรนด์ (วิธีอื่น) */
  const [courierCode, setCourierCode] = useState<string | null>(null)
  /** ชื่อขนส่งที่ร้านพิมพ์เอง — ใช้เฉพาะตอนเลือก "อื่น ๆ" */
  const [otherCourierName, setOtherCourierName] = useState('')
  const [countAsCost, setCountAsCost] = useState(false)
  const [reason, setReason] = useState('')

  // ── กล่องขากลับ (D-5) — null = ใช้กล่องของขาไป ────────────────────────────
  const [boxOpen, setBoxOpen] = useState(false)
  const [boxDraft, setBoxDraft] = useState<Record<keyof ReturnParcelBox, string>>({
    weight: '',
    width: '',
    length: '',
    height: '',
  })

  // ── ค่าส่งขากลับโดยประมาณ ────────────────────────────────────────────────
  const [quote, setQuote] = useState<QuoteRow[] | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  const method = methodKey ? returnMethod(methodKey) : null
  const forward = eligibility?.forward ?? null

  /**
   * กล่องที่จะใช้จริง — ที่ร้านกรอกเองชนะกล่องของขาไป
   * 🛑 ยอมรับเฉพาะก้อนที่ครบ 4 ช่องและเป็นบวกทั้งหมด (เกณฑ์เดียวกับ `parseReturnParcel`
   * ฝั่ง server) — ก้อนที่ครบครึ่งเดียวคือกล่องที่ไม่มีอยู่จริง
   */
  const draftBox: ReturnParcelBox | null = (() => {
    const nums = (['weight', 'width', 'length', 'height'] as const).map((k) => Number(boxDraft[k]))
    if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null
    return { weight: nums[0]!, width: nums[1]!, length: nums[2]!, height: nums[3]! }
  })()
  const effectiveBox = draftBox ?? forward?.box ?? null

  const price = resolveReturnPriceState({
    method: methodKey,
    hasBox: effectiveBox != null,
    loading: quoteLoading,
    error: quoteError,
    rows: quote,
    courierCode,
  })
  /** เกณฑ์เดียวของ "กดถัดไปจากขั้น 1 ได้ไหม" — ใช้ทั้งปุ่มและข้อความใต้ปุ่ม */
  const stepOneBlock = methodStepBlock(methodKey, price)

  /**
   * ชื่อขนส่งที่จะบันทึกคู่กับรหัส — เหมือน `OrderShipment.courierCode/courierName`
   * 🛑 "อื่น ๆ" ต้องเก็บชื่อที่ร้านพิมพ์ ไม่ใช่คำว่า "อื่น ๆ" ซึ่งไม่บอกอะไรกับใครเลย
   */
  const resolvedCourierName: string | null = (() => {
    if (!courierCode) return null
    if (courierCode === OTHER_COURIER_CODE) return otherCourierName.trim() || null
    return courierChoicesName(courierCode)
  })()

  /** ตัวเลือกใน dropdown — คนละแหล่งตามวิธี ดูเหตุผลที่ `renderCourierPicker` */
  const courierChoices: { code: string; label: string }[] =
    methodKey && methodUsesIship(methodKey)
      ? (quote ?? []).map((r) => ({
          code: r.courierCode,
          // ราคาอยู่ในตัวเลือกเลย — ร้านเทียบได้โดยไม่ต้องกดทีละเจ้าแล้วดูแถวสรุป
          label: `${r.courierName} · ${formatBaht(r.totalPrice)}`,
        }))
      : COURIER_OPTIONS.map((o) => ({ code: o.code, label: o.label }))

  /** ชื่อจริงของรหัสที่เลือก — ชื่อแพ็กเกจของ iShip ชนะชื่อแบรนด์เสมอเมื่อมี */
  function courierChoicesName(code: string): string | null {
    const row = (quote ?? []).find((r) => r.courierCode === code)
    return row?.courierName ?? courierLabel(code, null)
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderToken}/returns`, { cache: 'no-store' })
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as Eligibility & { returns?: ReturnRow[] }
      setEligibility(data)
      setReturns(data.returns ?? [])
    } catch {
      pacesToast.error('โหลดข้อมูลการคืนของไม่สำเร็จ')
    }
  }, [orderToken])

  /**
   * ยิงประเมินค่าส่งขากลับ — เฉพาะวิธีที่ **ระบบเป็นคนเปิดพัสดุ** (ที่เดียวที่ราคามีความหมาย)
   *
   * 🛑 dep เป็น primitive ล้วน + `orderToken` ห้ามใส่อ็อบเจกต์ที่สร้างใหม่ทุก render
   * (`hook-return-identity-in-deps.md` — ลูปยิง API ไม่หยุดเคยเกิดมาแล้วบน prod)
   * และ **ห้ามใส่ `quote`/`quoteError` ที่ effect นี้เป็นคนตั้งกลับเข้า deps**
   */
  const boxKey = effectiveBox
    ? `${effectiveBox.weight}|${effectiveBox.width}|${effectiveBox.length}|${effectiveBox.height}`
    : ''
  const needsQuote = methodKey != null && methodUsesIship(methodKey) && boxKey !== ''
  const quoteReq = useRef(0)
  useEffect(() => {
    if (!needsQuote) return
    const seq = ++quoteReq.current
    setQuoteLoading(true)
    setQuoteError(null)
    void (async () => {
      try {
        const res = await fetch(`/api/orders/${orderToken}/return-quote`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ parcel: boxKey ? Object.fromEntries(
            (['weight', 'width', 'length', 'height'] as const).map((k, i) => [k, Number(boxKey.split('|')[i])]),
          ) : null }),
        })
        const data = await res.json().catch(() => null)
        // คำขอที่ถูกแซง (ร้านเปลี่ยนกล่อง/วิธีระหว่างรอ) ต้องไม่เขียนทับผลของคำขอล่าสุด
        if (seq !== quoteReq.current) return
        if (!res.ok) throw new Error(data?.error ?? 'ประเมินค่าส่งไม่สำเร็จ')
        setQuote((data?.rows ?? []) as QuoteRow[])
      } catch (e) {
        if (seq !== quoteReq.current) return
        setQuote(null)
        setQuoteError(e instanceof Error ? e.message : 'ประเมินค่าส่งไม่สำเร็จ')
      } finally {
        if (seq === quoteReq.current) setQuoteLoading(false)
      }
    })()
  }, [needsQuote, boxKey, orderToken])

  /**
   * เลือกขนส่งขากลับให้ล่วงหน้า = เจ้าเดียวกับขาไป (D-5) — **เฉพาะตอนที่ร้านยังไม่เคยเลือกเอง**
   * 🛑 เขียนทับค่าที่ร้านเพิ่งเลือกคือบั๊กที่อ่านว่า "dropdown เด้งกลับเอง"
   */
  const courierTouched = useRef(false)
  useEffect(() => {
    if (!methodKey || courierTouched.current) return
    const next = defaultReturnCourier({
      method: methodKey,
      forwardCourierCode: forward?.courierCode ?? null,
      rows: quote,
      brandFallback: courierBrandCode(forward?.courierCode, forward?.courierName),
    })
    setCourierCode((cur) => (cur === next ? cur : next))
  }, [methodKey, forward?.courierCode, forward?.courierName, quote])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !eligibility) void load()
  }

  /**
   * โหมดชีต: เปิดเมื่อไหร่โหลดทันที — ผู้ใช้กดจากเมนูแล้วต้องเห็นของเลย ไม่ใช่ต้องกดซ้ำ
   * 🛑 dep เป็น `load` ที่เป็น `useCallback` ตัวเดียว ไม่ใช่ object ที่ hook คืนทั้งก้อน
   * (docs/conventions/hook-return-identity-in-deps.md — ลูปยิง API ไม่หยุดเคยเกิดมาแล้ว)
   */
  useEffect(() => {
    if (asSheet && sheetOpen && !eligibility) void load()
  }, [asSheet, sheetOpen, eligibility, load])

  // ล็อก scroll ของหน้าเมื่อชีตเปิด — โมดัลที่ประกอบเองด้วย React state ต้องเรียกเสมอ
  // (docs/conventions/overlay-scroll-lock.md · การแปลง hs-overlay เป็น controlled div
  //  ทิ้งการล็อกที่เคยได้ฟรีไปทุกใบ ไม่มีใครสังเกตจนผู้ใช้เจอบนมือถือ)
  useLockBodyScroll(asSheet && sheetOpen)

  const selectedLines = (eligibility?.items ?? [])
    .filter((i) => (qty[i.orderItemId] ?? 0) > 0)
    .map((i) => ({ qty: qty[i.orderItemId]!, unitPrice: i.unitPrice }))
  const refundPreview = computeRefundAmount(selectedLines)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${orderToken}/returns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: Object.entries(qty)
            .filter(([, q]) => q > 0)
            .map(([orderItemId, q]) => ({ orderItemId, qty: q })),
          reason: reason.trim() || null,
          // 🛑 ส่ง **คีย์วิธี** อย่างเดียว — payer/trackingSource ตัดสินที่ server (D-1)
          method: methodKey,
          // วิธีที่ระบบออกเลขให้ไม่มีช่องนี้บนจอ — ส่ง null ไม่ใช่ค่าค้างจากวิธีที่เลือกก่อนหน้า
          trackingNo: method && !methodUsesIship(method.key) ? trackingNo : null,
          returnCourierCode: courierCode,
          returnCourierName: resolvedCourierName,
          returnParcel: draftBox,
          countAsCost,
        }),
      })
      const data = await res.json()
      // ข้อความจาก API บอกทางแก้อยู่แล้ว (คืนได้อีกกี่ชิ้น/ทำไมคืนไม่ได้) — แสดงตรง ๆ
      if (!res.ok) throw new Error(data?.error ?? 'เปิดใบคืนไม่สำเร็จ')
      pacesToast.success('เปิดใบคืนของแล้ว')
      closeForm()
      await load()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เปิดใบคืนไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const act = async (returnId: string, action: 'ship' | 'receive' | 'cancel') => {
    if (action === 'receive') {
      // บอกผลที่ตามมาให้ครบก่อนกด — ตรงนี้คือจุดเดียวที่ยอดขายเปลี่ยน (BRD §2)
      const ok = await pacesConfirm.warning(
        'ยืนยันว่าได้รับของคืนแล้ว?',
        'ยอดขายของรายการที่คืนจะถูกหักออก และปิดเรื่องคืนของใบนี้',
        { confirmButtonText: 'ได้รับของคืนแล้ว' },
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${orderToken}/returns/${returnId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'ทำรายการไม่สำเร็จ')
      pacesToast.success(
        action === 'ship' ? 'บันทึกการส่งคืนแล้ว' : action === 'receive' ? 'รับของคืนแล้ว' : 'ยกเลิกเรื่องคืนของแล้ว',
      )
      await load()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  /** ปิดฟอร์ม + ล้างร่างทั้งชุด — เดิมล้างแค่ `qty` ทำให้วิธีคืนของรอบก่อนค้างมารอบถัดไป */
  const closeForm = () => {
    setForm(false)
    setStep(1)
    setQty({})
    setMethodKey(null)
    setTrackingNo('')
    setCourierCode(null)
    setOtherCourierName('')
    setCountAsCost(false)
    setReason('')
    setBoxOpen(false)
    setBoxDraft({ weight: '', width: '', length: '', height: '' })
    setQuote(null)
    setQuoteError(null)
    courierTouched.current = false
  }

  const labelUrl = `/api/o/${orderToken}/return-label`

  /**
   * ฟอร์มเปิดอยู่ไหม — **SSOT เดียว** ที่ทั้งตัวเนื้อหาและแถบปุ่มอ่าน
   *
   * 🛑 โหมดชีตเข้าฟอร์มทันทีโดย **ไม่เคยตั้ง `form` เป็น true** (D-8: กดจาก `⋮ → คืนของ`
   * แล้วต้องเห็นฟอร์มเลย ไม่มีปุ่มคั่น) ⇒ เกณฑ์ที่เช็คแค่ `form` จะบอกว่า "ยังไม่เปิดฟอร์ม"
   * ทั้งที่ฟอร์มอยู่ตรงหน้า · เขียนสองที่เมื่อไหร่มันจะไม่ตรงกันแบบนี้เสมอ
   * (เจอจริงตอนเปิดจอดู 2026-08-25: **แถบปุ่มหายทั้งแถบในโหมดชีต** ปุ่ม "ถัดไป" ไม่มีเลย
   *  และ tsc/eslint/theme-guard/เทสผ่านหมด เพราะเงื่อนไขถูกต้องตามชนิดทุกตัวอักษร)
   */
  const formOpen = form || asSheet
  const footer = eligibility?.canReturn && formOpen ? footerConfig() : null

  const body = !eligibility ? (
    <p className="text-default-700 mb-0 flex items-center gap-2 text-sm">
      <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
      กำลังโหลด…
    </p>
  ) : (
    renderBody()
  )

  /**
   * โหมดชีต — เปิดจากเมนู `⋮` ของออเดอร์ในห้องแชท
   *
   * ฉากเบลอ + แผงยึดขอบล่างบนมือถือ / กลางจอบนเดสก์ท็อป · `role="dialog"` ต้องมี
   * `aria-modal` คู่กันเสมอ ไม่งั้นผู้ใช้ screen reader อ่านหลุดออกไปหลังฉาก
   * (docs/conventions/aria-name-requires-supporting-role.md)
   */
  if (asSheet) {
    if (!sheetOpen) return null
    return (
      /* Base: RecordPaymentSheet.tsx / AppointmentSummarySheet.tsx — โครงชีตของโปรเจกต์นี้
         (`z-90` · `.card` · `max-h-full` + `min-h-0 flex-1`) ห้ามคิดเลข z/ความสูงเอง:
         🛑 ร่างแรกใช้ `z-[1090]` + `max-h-[85dvh]` (arbitrary → HR7 แดง) และหัวชีต `z-10`
         ซึ่งเทส [blocker] `paces-sticky-z-index` จับได้ว่าจะถูก `.btn` (z-10 ในตัว) ทับ */
      <div
        className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="การคืนของ"
        onMouseDown={(e) => {
          // ปิดเฉพาะเมื่อกดที่ "ฉากเบลอ" จริง ๆ — ใช้ target===currentTarget แทน stopPropagation
          // ที่ลูก เพราะการลากเลือกข้อความในแผงแล้วปล่อยนอกแผงจะกลายเป็นการปิดโดยไม่ได้ตั้งใจ
          if (e.target === e.currentTarget) onCloseSheet?.()
        }}
      >
        <div className="card bg-card flex h-full max-h-full w-full flex-col rounded-b-none sm:h-auto sm:max-w-lg sm:rounded-lg">
          <div className="card-header flex flex-nowrap items-center justify-between gap-2">
            <h5 className="card-title flex min-w-0 items-center gap-1.5">
              <Icon icon="arrow-back-up" className="text-default-600 size-4 shrink-0" />
              <span className="truncate">การคืนของ</span>
            </h5>
            <button
              type="button"
              className="btn btn-sm bg-light text-default-700 shrink-0 hover:bg-light-hover"
              onClick={onCloseSheet}
              aria-label="ปิด"
            >
              <Icon icon="x" className="size-4" aria-hidden="true" />
            </button>
          </div>
          {/* min-h-0 flex-1 = ส่วนที่เลื่อนได้หดเอง เนื้อหายาวจึงไม่ดันชีตทะลุจอ */}
          <div className="card-body min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
          {/* 🛑 นอกกล่องที่เลื่อนได้ — ปุ่มหลักต้องอยู่กับที่เสมอ ไม่งั้นร้านที่ของหลายชิ้น
              ต้องเลื่อนลงสุดทุกครั้งเพื่อกด (โครงเดียวกับ RecordPaymentSheet.tsx) */}
          {footer && renderFooter(footer)}
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header flex-nowrap items-center justify-between gap-2">
        <h5 className="card-title flex min-w-0 items-center gap-1.5">
          <Icon icon="arrow-back-up" className="text-default-600 size-4 shrink-0" />
          <span className="truncate">การคืนของ</span>
          {initialCount > 0 && (
            <span className="badge bg-warning/15 text-warning-ink text-2xs shrink-0">
              {initialCount}
            </span>
          )}
        </h5>
        <button type="button" className="btn btn-sm bg-light text-default-700 shrink-0 hover:bg-light-hover" onClick={toggle}>
          {open ? 'ซ่อน' : 'จัดการ'}
        </button>
      </div>

      {open && <div className={compact ? 'card-body !p-3' : 'card-body'}>{body}</div>}
    </div>
  )

  /** เนื้อหาจริง — ใช้ร่วมทั้งโหมดการ์ดและโหมดชีต ห้ามเขียนสองชุด (sibling-surface-parity) */
  function renderBody() {
    if (!eligibility) return null
    return (
      <>
              {/* ── ใบคืนที่มีอยู่ ─────────────────────────────────────────── */}
              {(returns ?? []).map((r) => (
                <div key={r.id} className="border-default-200 mb-3 rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`badge text-2xs ${STATUS_META[r.status]?.cls ?? ''}`}>
                      {STATUS_META[r.status]?.label ?? r.status}
                    </span>
                    <span className="text-default-600 text-2xs">
                      {RETURN_PAYER_TEXT[r.payer]} · {RETURN_TRACKING_SOURCE_TEXT[r.trackingSource]}
                    </span>
                    {/* ลูกค้าออกค่าส่งแต่ร้านรับผิดชอบ = ต้องเห็นชัด ไม่งั้นตัวเลขต้นทุนอ่านไม่ออก */}
                    {r.payer === 'BUYER' && r.countAsCost && (
                      <span className="badge bg-default-100 text-default-700 text-2xs">
                        นับเป็นต้นทุนร้าน
                      </span>
                    )}
                    <span className="text-default-500 text-2xs">
                      {formatDateTime(r.createdAt)}
                    </span>
                  </div>

                  {(r.trackingNo || r.manualTrackingNo) && (
                    <p className="text-default-800 mb-2 text-xs font-semibold tabular-nums">
                      {courierLabel(r.returnCourierCode, r.returnCourierName)
                        ? `${courierLabel(r.returnCourierCode, r.returnCourierName)} · `
                        : ''}
                      {r.trackingNo ?? r.manualTrackingNo}
                    </p>
                  )}

                  {/* การ์ดใบปะหน้า — เฉพาะใบที่ระบบออกเลขให้ (หัวหน้าสั่ง: ให้ลูกค้าพิมพ์ได้) */}
                  {r.trackingSource === RETURN_TRACKING_SOURCE.ISHIP && r.trackingNo && (
                    <div className="bg-default-50 border-default-200 mb-2 flex items-center gap-2 rounded-lg border p-2">
                      <Icon icon="file-type-pdf" className="text-default-600 size-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-default-900 mb-0 text-xs font-medium">ใบปะหน้าพัสดุขากลับ</p>
                        <p className="text-default-600 mb-0 text-2xs">ส่งลิงก์นี้ให้ลูกค้าพิมพ์ติดกล่อง</p>
                      </div>
                      <a
                        href={labelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm bg-light text-default-700 shrink-0 hover:bg-light-hover"
                      >
                        เปิด
                      </a>
                      <button
                        type="button"
                        className="btn btn-sm bg-light text-default-700 shrink-0 hover:bg-light-hover"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              `${window.location.origin}${labelUrl}`,
                            )
                            pacesToast.success('คัดลอกลิงก์ใบปะหน้าแล้ว')
                          } catch {
                            // clipboard ต้องการ https — บอกทางออกที่ทำได้จริงบนมือถือ
                            pacesToast.error('คัดลอกไม่สำเร็จ — กดเปิดแล้วคัดลอกจากแถบที่อยู่')
                          }
                        }}
                      >
                        คัดลอกลิงก์
                      </button>
                    </div>
                  )}

                  {r.refundAmount != null && (
                    <p className="text-default-700 mb-2 text-xs">
                      ยอดที่คืน {formatBaht(r.refundAmount)}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {r.status === RETURN_STATUS.REQUESTED && (
                      <button
                        type="button"
                        className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
                        disabled={busy}
                        onClick={() => act(r.id, 'ship')}
                      >
                        {r.trackingSource === RETURN_TRACKING_SOURCE.ISHIP
                          ? 'ออกเลขพัสดุขากลับ'
                          : 'บันทึกว่าส่งคืนแล้ว'}
                      </button>
                    )}
                    {(r.status === RETURN_STATUS.REQUESTED || r.status === RETURN_STATUS.SHIPPING) && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm bg-light text-default-700 hover:bg-light-hover"
                          disabled={busy}
                          onClick={() => act(r.id, 'receive')}
                        >
                          ได้รับของคืนแล้ว
                        </button>
                        {/* ยกเลิกเป็นปุ่มขอบ ไม่ใช่ปุ่มทึบ — ไม่ใช่ทางที่เราอยากให้กดเป็นอันดับแรก */}
                        <button
                          type="button"
                          className="btn btn-sm border border-danger text-danger hover:bg-danger/15 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => act(r.id, 'cancel')}
                        >
                          ยกเลิกเรื่องคืน
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* ── เปิดใบใหม่ ─────────────────────────────────────────────── */}
              {!eligibility.canReturn ? (
                <p className="text-default-700 mb-0 flex items-start gap-2 text-xs">
                  <Icon icon="info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                  {eligibility.blockedText}
                </p>
              ) : !formOpen ? (
                /* 🛑 ปุ่มนี้มีเฉพาะโหมดการ์ด — โหมดชีตเปิดจาก `⋮ → คืนของ` ซึ่งผู้ใช้บอกเจตนา
                   ไปแล้ว การให้กด "เปิดเรื่องคืนของ" ซ้ำคือคลิกที่ไม่ได้ตัดสินใจอะไรเพิ่ม
                   (หัวหน้าทักเอง 2026-08-25: "ทำไมยังต้องกดเปิดเรื่องคืนของ") */
                <button type="button" className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-60" onClick={() => setForm(true)}>
                  <Icon icon="plus" className="size-4" aria-hidden="true" />
                  เปิดเรื่องคืนของ
                </button>
              ) : (
                <div className="border-default-200 rounded-lg border p-3">
                  {renderForm()}
                  {!asSheet && footer && renderFooter(footer)}
                </div>
              )}
      </>
    )
  }

  /**
   * ฟอร์มเปิดใบคืน — 2 ขั้น: วิธีคืน → ของที่คืน
   *
   * ดีไซน์นี้มาจาก prototype 3 แบบที่เทียบกันบนหน้าจริง (branch `proto/return-sheet-redesign`)
   * หัวหน้าเคาะแบบ A ด้วยเหตุผลว่าตรงกับที่สั่งตรงตัว "กดปุ่มคืนของแล้วให้เลือกเป็น radio"
   */
  /**
   * แถบปุ่มของขั้นที่เปิดอยู่ — เป็น **ข้อมูล** ไม่ใช่ JSX ที่ฝังอยู่ในตัวเนื้อหา
   *
   * 🛑 เหตุผลทั้งหมด: โหมดชีตต้องเรนเดอร์แถบนี้ **นอก** `card-body` ซึ่งเป็นกล่องที่เลื่อนได้
   * ไม่งั้นปุ่มหลักจะเลื่อนหายไปกับเนื้อหา แล้วร้านที่ของหลายชิ้นต้องเลื่อนลงสุดทุกครั้งเพื่อกด
   * (โครงเดียวกับ `RecordPaymentSheet.tsx` ที่แยก body/footer เป็นพี่น้องกันใน flex column)
   * ส่วนโหมดการ์ดไม่มีกล่องเลื่อน จึงวางต่อท้ายเนื้อหาได้ตรง ๆ — เนื้อหาชุดเดียว 2 ตำแหน่ง
   */
  function footerConfig(): Parameters<typeof renderFooter>[0] {
    if (step === 1) {
      return {
        total: null,
        primary: (
          <button
            type="button"
            className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-sm font-medium text-white disabled:opacity-60"
            disabled={stepOneBlock !== null}
            onClick={() => setStep(2)}
          >
            ถัดไป — เลือกของที่คืน
          </button>
        ),
        /* โหมดชีตมีปุ่ม ✕ ที่หัวอยู่แล้ว — สองปุ่มที่ทำงานเดียวกันคือของซ้ำ
           โหมดการ์ดไม่มี (ปุ่ม "ซ่อน" ที่หัวการ์ดยุบทั้งบล็อก ไม่ใช่ยกเลิกฟอร์ม) */
        secondary: asSheet ? undefined : (
          <button
            type="button"
            className="btn bg-light text-default-800 hover:bg-default-200 min-h-11 text-sm"
            onClick={closeForm}
          >
            ยกเลิก
          </button>
        ),
      }
    }
    if (step === 2) {
      return {
        total: refundPreview,
        primary: (
          <button
            type="button"
            className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-sm font-medium text-white disabled:opacity-60"
            disabled={selectedLines.length === 0}
            onClick={() => setStep(3)}
          >
            ถัดไป — ตรวจก่อนยืนยัน
          </button>
        ),
      }
    }
    return {
      total: null,
      secondary: (
        <button
          type="button"
          className="btn bg-light text-default-800 hover:bg-default-200 min-h-11 text-sm"
          disabled={busy}
          onClick={() => setStep(2)}
        >
          <Icon icon="arrow-left" className="size-4" aria-hidden="true" />
          แก้ไข
        </button>
      ),
      primary: (
        <button
          type="button"
          className="btn bg-primary hover:bg-primary-hover min-h-11 flex-[2] items-center justify-center gap-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={busy || selectedLines.length === 0}
          onClick={submit}
        >
          <Icon
            icon={busy ? 'loader-2' : 'check'}
            className={`text-base ${busy ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          ยืนยันเปิดใบคืน
        </button>
      ),
    }
  }

  /** ฟอร์มเปิดใบคืน — 3 ขั้น (D-6) · เนื้อหาชุดเดียวใช้ทั้งโหมดการ์ดและโหมดชีต */
  function renderForm() {
    if (!eligibility) return null
    if (step === 1) return renderStepMethod()
    if (step === 2) return renderStepItems()
    return renderStepReview()
  }

  // ── ขั้น 1 · ตกลงกับลูกค้าไว้ยังไง + ขนส่งขากลับ ────────────────────────
  function renderStepMethod() {
    const methods = selectableReturnMethods(eligibility!.ishipConnected)
    return (
      <>
        {renderForwardStrip()}

        <p className="text-default-900 mt-3 mb-0.5 text-sm font-semibold">จะส่งของกลับยังไง</p>
        <p className="text-default-600 mb-3 text-xs">เลือกข้อที่ตรงกับที่ตกลงกับลูกค้าไว้</p>

        <div className="flex flex-col gap-2">
          {methods.map((m) => {
            const on = methodKey === m.key
            return (
              /* label ห่อ input ทั้งก้อน = กดตรงไหนของการ์ดก็ติด และยังได้ชื่อจาก markup จริง
                 ไม่ต้องพึ่ง aria-label (docs/conventions/aria-name-requires-supporting-role.md) */
              <label
                key={m.key}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 ${
                  on ? 'border-primary bg-primary/5' : 'border-default-200'
                }`}
              >
                <input
                  type="radio"
                  name="return-method"
                  className="form-radio mt-0.5 shrink-0"
                  checked={on}
                  onChange={() => {
                    setMethodKey(m.key)
                    /* ล้างค่าที่ผูกกับวิธีเดิม — ไม่งั้นเลขพัสดุ/ขนส่งที่เลือกไว้ตอนวิธีอื่น
                       จะถูกส่งไปด้วย และรหัสแพ็กเกจ iShip จะไปโผล่ในช่องที่รับแต่รหัสแบรนด์ */
                    setTrackingNo('')
                    setOtherCourierName('')
                    setCourierCode(null)
                    courierTouched.current = false
                    if (!m.costOptional) setCountAsCost(false)
                  }}
                />
                <Icon icon={m.icon} className="text-default-600 mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="text-default-900 flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {m.title}
                    {/* badge เป็นกลาง ไม่ใช่สี semantic — "ใครจ่าย" เป็นข้อเท็จจริง ไม่ใช่สถานะ */}
                    <span className="badge bg-default-100 text-default-700 text-2xs">{m.money}</span>
                  </span>
                  <span className="text-default-600 block text-xs">{m.detail}</span>
                </span>
              </label>
            )
          })}
        </div>

        {method && <div className="mt-2">{renderCourierPicker()}</div>}

        {stepOneBlock && stepOneBlock !== 'NO_METHOD' && (
          <p className="text-warning-ink mt-2 mb-0 flex items-start gap-1.5 text-xs">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
            {METHOD_STEP_BLOCK_TEXT[stepOneBlock]}
          </p>
        )}

      </>
    )
  }

  // ── ขั้น 2 · คืนของชิ้นไหนบ้าง ──────────────────────────────────────────
  function renderStepItems() {
    return (
      <>
        <ParcelStrip
          label="ขากลับ"
          code={courierCode}
          name={resolvedCourierName}
          detail={
            [
              resolvedCourierName ?? 'ยังไม่ระบุขนส่ง',
              price.kind === 'PRICE' ? `~${formatBaht(price.amount)}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || null
          }
          right={
            <button
              type="button"
              className="text-primary-ink shrink-0 text-xs font-medium underline-offset-2 hover:underline"
              onClick={() => setStep(1)}
            >
              เปลี่ยน
            </button>
          }
        />

        {/* ปุ่มย้อนกลับพูดชื่อข้อที่เลือกไว้ด้วย = ไม่ต้องจำ และแก้ได้ในคลิกเดียว */}
        <button
          type="button"
          className="btn btn-sm bg-light text-default-800 hover:bg-default-200 mt-3 max-w-full"
          onClick={() => setStep(1)}
        >
          <Icon icon="arrow-left" className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{method?.title}</span>
        </button>

        <p className="text-default-900 mt-3 mb-2 text-sm font-semibold">คืนของชิ้นไหนบ้าง</p>
        {eligibility!.items.map((i) => {
          const n = qty[i.orderItemId] ?? 0
          const setN = (next: number) =>
            // clamp ที่นี่ด้วย — ปุ่มกันไว้แล้วแต่ service ก็กันอีกชั้น ค่าที่ส่งออกต้องถูกเสมอ
            setQty((q) => ({ ...q, [i.orderItemId]: Math.max(0, Math.min(i.remainingQty, next)) }))
          return (
            <div
              key={i.orderItemId}
              className="border-default-200 mb-2 flex items-center gap-2.5 rounded-lg border p-2.5"
            >
              {/* D-9: รูปจริง · ไม่มีรูป = กล่องเทา **เปล่า** ห้ามใช้ไอคอนแทน */}
              <ItemThumbnail imageUrl={i.imageUrl} name={i.name} fallback="blank" />
              <span className="min-w-0 flex-1">
                <span className="text-default-900 block truncate text-sm">{i.name}</span>
                <span className="text-default-500 block text-xs">
                  ซื้อ {i.orderedQty} · คืนได้ {i.remainingQty} · {formatBaht(i.unitPrice)}/ชิ้น
                </span>
              </span>
              {/* stepper — ยกโครงจาก `orders/new/components/QuickLineItem.tsx` (โดเมนเดียวกัน:
                  รายการสินค้า + จำนวน) ตาม docs/conventions/sibling-surface-parity.md
                  ต่างกันจุดเดียว: ตรงกลางเป็นตัวเลขอ่านอย่างเดียว ไม่ใช่ช่องพิมพ์ — คืนของมี
                  เพดาน `remainingQty` ที่แข็ง การเปิดให้พิมพ์คือการเชิญให้พิมพ์เกินแล้วโดนดีดกลับ */}
              <div className="border-default-300 flex shrink-0 items-center overflow-hidden rounded-lg border">
                <button
                  type="button"
                  className="text-primary inline-flex size-9 items-center justify-center disabled:opacity-40"
                  disabled={n <= 0}
                  onClick={() => setN(n - 1)}
                  aria-label={`ลดจำนวนที่คืนของ ${i.name}`}
                >
                  <Icon icon="minus" className="size-4" aria-hidden="true" />
                </button>
                {/* live region ทำหน้าที่แทน `<input>` ของ sibling: ตัวเลขนี้โฟกัสไม่ได้ ผู้ใช้
                    screen reader จึงต้องได้ยินค่าที่เปลี่ยนหลังกด ±  ไม่งั้นกดแล้วเงียบสนิท
                    🛑 ไม่ใส่ `aria-label` — บน live region ชื่อจากผู้เขียนจะไปแทนที่ *เนื้อหา*
                    ที่ต้องถูกอ่าน ซึ่งก็คือตัวเลข (บริบทว่าของชิ้นไหนอยู่ที่ปุ่มที่เพิ่งกดแล้ว) */}
                <span
                  className="border-default-200 w-10 border-x py-1.5 text-center text-sm font-bold tabular-nums"
                  role="status"
                >
                  {n}
                </span>
                <button
                  type="button"
                  className="text-primary inline-flex size-9 items-center justify-center disabled:opacity-40"
                  disabled={n >= i.remainingQty}
                  onClick={() => setN(n + 1)}
                  aria-label={`เพิ่มจำนวนที่คืนของ ${i.name}`}
                >
                  <Icon icon="plus" className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}

        <input
          className="form-input mt-3"
          placeholder="เหตุผล (ไม่บังคับ)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="เหตุผลที่คืน"
        />

      </>
    )
  }

  // ── ขั้น 3 · ตรวจก่อนยืนยัน (D-6) ───────────────────────────────────────
  function renderStepReview() {
    const lines = eligibility!.items.filter((i) => (qty[i.orderItemId] ?? 0) > 0)
    const usesIship = method != null && methodUsesIship(method.key)
    /** ค่าส่งขากลับเข้าต้นทุนร้านไหม — เกณฑ์เดียวกับที่ service บังคับ ไม่ใช่คำที่คิดขึ้นใหม่ */
    const asCost = method != null && resolveReturnShippingChoice(method.key, trackingNo, countAsCost).countAsCost

    return (
      <>
        <p className="text-default-900 mb-0.5 text-sm font-semibold">ตรวจก่อนยืนยัน</p>
        <p className="text-default-600 mb-3 text-xs">
          กดยืนยันแล้วยังยกเลิกได้ ตราบใดที่ยังไม่ได้รับของคืน
        </p>

        {/* 1 · ของที่คืน */}
        <div className="border-default-200 mb-2 rounded-lg border p-3">
          <p className="text-default-500 mb-1.5 text-2xs font-semibold">ของที่คืน</p>
          {lines.map((i) => (
            <div key={i.orderItemId} className="mb-1.5 flex items-center gap-2.5 last:mb-0">
              <ItemThumbnail imageUrl={i.imageUrl} name={i.name} fallback="blank" />
              <span className="text-default-900 min-w-0 flex-1 truncate text-sm">{i.name}</span>
              <span className="text-default-600 shrink-0 text-sm tabular-nums">
                ×{qty[i.orderItemId]}
              </span>
              <span className="text-default-900 shrink-0 text-sm font-semibold tabular-nums">
                {formatBaht((qty[i.orderItemId] ?? 0) * i.unitPrice)}
              </span>
            </div>
          ))}
          <div className="border-default-200 mt-2 flex items-baseline justify-between border-t border-dashed pt-2 text-sm font-semibold">
            <span>ยอดที่คืนให้ลูกค้า</span>
            <span className="tabular-nums">{formatBaht(refundPreview)}</span>
          </div>
        </div>

        {/* 2 · พัสดุ 2 ขา คนละบรรทัด (D-3) */}
        <div className="border-default-200 mb-2 rounded-lg border p-3">
          <p className="text-default-500 mb-2 text-2xs font-semibold">พัสดุ</p>
          <div className="mb-1.5">{renderForwardStrip()}</div>
          <ParcelStrip
            label="ขากลับ"
            code={courierCode}
            name={resolvedCourierName}
            detail={
              [
                resolvedCourierName ?? 'ยังไม่ระบุขนส่ง',
                usesIship
                  ? 'ออกเลขให้หลังยืนยัน'
                  : trackingNo.trim() || 'ไม่มีเลขพัสดุ',
              ]
                .filter(Boolean)
                .join(' · ') || null
            }
          />
          <p className="text-default-600 mt-2 mb-0 text-xs">
            {asCost ? (
              <>
                ค่าส่งขากลับ
                {price.kind === 'PRICE' ? ` ~${formatBaht(price.amount)} ` : ' '}
                เข้าเป็น<span className="font-semibold">ต้นทุนร้าน</span> — จะไปโผล่ในหน้ากำไร/ขาดทุน
              </>
            ) : (
              <>ลูกค้าออกค่าส่งขากลับเอง — ไม่นับเป็นต้นทุนร้าน</>
            )}
          </p>
        </div>

        {/* 3 · ลูกค้าส่งกลับมาที่ไหน (D-7) — คำถามที่หัวหน้าถามมาเอง ตอบบนจอ ไม่ให้เดา */}
        <div className="bg-default-50 border-default-200 mb-2 rounded-lg border p-3">
          <p className="text-default-500 mb-1 text-2xs font-semibold">ลูกค้าส่งกลับมาที่</p>
          <p className="text-default-900 mb-0 text-sm">
            ที่อยู่ผู้ส่งของร้าน (ตั้งค่า → การจัดส่ง)
            <span className="text-default-600 block text-xs">
              ระบบสลับผู้ส่ง/ผู้รับกับขาไปให้เอง —{' '}
              <span className="font-semibold">ร้านไม่ต้องกรอกที่อยู่ใหม่</span>
            </span>
          </p>
        </div>

        {/* 4 · หลังกดยืนยัน — ข้อความต่างกันตามวิธี ไม่ใช่ชุดเดียวใช้ทุกกรณี
            (บอกว่าจะได้ "ออกเลขพัสดุ" ทั้งที่เลือกทางที่ไม่มีเลข = โกหกร้าน) */}
        <div className="border-default-200 rounded-lg border p-3">
          <p className="text-default-500 mb-2 text-2xs font-semibold">หลังกดยืนยัน</p>
          <ol className="text-default-700 mb-0 list-inside list-decimal space-y-1.5 text-xs">
            {usesIship ? (
              <>
                <li>
                  กด &ldquo;ออกเลขพัสดุขากลับ&rdquo; ในใบคืน — <span className="font-semibold">ตอนนั้น</span>
                  เครดิต iShip ถึงจะถูกตัด
                </li>
                <li>คัดลอกลิงก์ใบปะหน้าส่งให้ลูกค้าทางแชท</li>
              </>
            ) : trackingNo.trim() ? (
              <li>ระบบบันทึกเลขพัสดุที่กรอกไว้ทันทีที่กดยืนยัน — ไม่มีการตัดเครดิตใด ๆ</li>
            ) : (
              <li>ระบบบันทึกไว้ว่ากำลังรอของคืน โดยไม่มีเลขพัสดุให้ติดตาม</li>
            )}
            <li>
              ของถึงร้านแล้วกด <span className="font-semibold">&ldquo;ได้รับของคืนแล้ว&rdquo;</span> —{' '}
              <span className="font-semibold">จุดนี้จุดเดียว</span>ที่ยอดขาย{' '}
              {formatBaht(refundPreview)} ถูกหักออก
            </li>
          </ol>
        </div>

      </>
    )
  }

  /**
   * แถบพัสดุหนึ่งบรรทัด — ใช้ทั้ง "ขาไป" (ขั้น 1) "ขากลับ" (ขั้น 2) และทั้งคู่ในหน้าสรุป
   *
   * 🛑 `flex-nowrap` + `min-w-0` + ลูก `truncate` มาเป็นชุด — flexbox ตัดสินว่าจะ wrap ไหม
   * จาก **ขนาดเนื้อหาเต็มก่อนหด** ใส่ `truncate` เฉย ๆ ไม่มีผลกับการตกบรรทัดเลย
   * (`docs/conventions/flex-header-truncation.md` — ชื่อขนส่ง/เลขพัสดุยาวได้จริง)
   */
  function ParcelStrip({
    label,
    code,
    name,
    detail,
    right,
  }: {
    label: string
    code: string | null
    name: string | null
    detail: string | null
    right?: React.ReactNode
  }) {
    const logo = courierLogoUrl(code, name)
    return (
      <div className="bg-default-50 border-default-200 flex flex-nowrap items-center gap-2 rounded-lg border p-2">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- โลโก้ขนส่งเป็นไฟล์คงที่ใน public/ ขนาด 24px ไม่ได้ประโยชน์จาก next/image
          <img src={logo} alt="" className="ring-default-200 size-6 shrink-0 rounded object-contain ring-1" />
        ) : (
          <span className="bg-default-200 text-default-700 flex size-6 shrink-0 items-center justify-center rounded text-2xs font-semibold">
            {courierInitials(name, code)}
          </span>
        )}
        <span className="text-default-500 shrink-0 text-xs">{label}</span>
        <span className="text-default-800 min-w-0 flex-1 truncate text-xs font-medium tabular-nums">
          {detail ?? '—'}
        </span>
        {right}
      </div>
    )
  }

  /** แถบ "ขาไป" — บริบทที่ร้านต้องเห็นก่อนตัดสินใจว่าจะเอาของกลับมายังไง */
  function renderForwardStrip() {
    if (!eligibility || !forward) return null
    const badge = resolveOrderStatusBadge(
      eligibility.orderStatus,
      deriveShippingStage({
        status: eligibility.orderStatus,
        carrierStatus: forward.carrierStatus,
        hasShipment: forward.trackingNo != null,
      }),
    )
    const name = courierLabel(forward.courierCode, forward.courierName)
    return (
      <ParcelStrip
        label="ขาไป"
        code={forward.courierCode}
        name={forward.courierName}
        detail={[name, forward.trackingNo].filter(Boolean).join(' · ') || null}
        right={<span className={`badge text-2xs shrink-0 ${badge.cls}`}>{badge.label}</span>}
      />
    )
  }

  /**
   * dropdown ขนส่งขากลับ — **แหล่งรายชื่อต่างกันตามวิธี และนั่นถูกต้องแล้ว**
   *
   * ISHIP: ระบบเป็นคนเปิดพัสดุ ⇒ ต้องเป็น **แพ็กเกจจริงที่ร้านมีในบัญชี iShip** (ชื่อแบรนด์
   *   ลอย ๆ ส่งให้ iShip ไม่ได้) และมีราคาต่อเจ้าให้เทียบในตัวเลือกเลย
   * วิธีอื่น: ร้าน/ลูกค้าไปเปิดพัสดุเอง ⇒ เป็นแค่ป้ายกำกับ ⇒ ใช้ `COURIER_OPTIONS` (แบรนด์
   *   + "อื่น ๆ") ซึ่งครอบขนส่งที่ iShip ไม่มีด้วย · **ไม่มีราคา** เพราะเราไม่ใช่คนคิดเงิน
   *   การโชว์ราคาของ iShip ให้พัสดุที่ร้านจะไปเปิดที่เคาน์เตอร์เจ้าอื่น คือตัวเลขที่ไม่มีวันตรง
   *
   * 🛑 native `<select>` เท่านั้น (`form-select`) — ใส่ `<img>` ใน `<option>` ไม่ได้
   * โลโก้จึงไปโผล่ในแถบ "ขากลับ" ที่อ่านอย่างเดียวแทน (ขั้น 2/3)
   */
  function renderCourierPicker() {
    if (!method) return null
    const usesIship = methodUsesIship(method.key)
    return (
      <div className="bg-default-50 border-default-200 rounded-lg border p-2.5">
        <div className="mb-1 flex flex-nowrap items-baseline justify-between gap-2">
          <label className="form-label text-default-600 mb-0 text-xs" htmlFor="return-courier">
            ขนส่งขากลับ
          </label>
          <span className="text-default-500 shrink-0 text-2xs">ตั้งต้น = เจ้าเดียวกับขาไป</span>
        </div>
        <select
          id="return-courier"
          className="form-select"
          value={courierCode ?? ''}
          onChange={(e) => {
            courierTouched.current = true
            setCourierCode(e.target.value || null)
            if (e.target.value !== OTHER_COURIER_CODE) setOtherCourierName('')
          }}
        >
          <option value="">
            {usesIship && quoteLoading ? 'กำลังโหลดรายชื่อขนส่ง…' : 'เลือกขนส่ง'}
          </option>
          {courierChoices.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>

        {courierCode === OTHER_COURIER_CODE && (
          <input
            className="form-input mt-2"
            placeholder="ชื่อขนส่ง"
            value={otherCourierName}
            onChange={(e) => setOtherCourierName(e.target.value)}
            aria-label="ชื่อขนส่งขากลับ"
          />
        )}

        {/* เลขพัสดุ — เฉพาะวิธีที่ร้าน/ลูกค้าไปเปิดพัสดุเอง · เว้นว่างได้ (D-4) */}
        {!usesIship && (
          <input
            className="form-input mt-2"
            placeholder="เลขพัสดุ (ไม่บังคับ)"
            value={trackingNo}
            onChange={(e) => setTrackingNo(e.target.value)}
            aria-label="เลขพัสดุขากลับ"
          />
        )}

        {/* ค่าส่งโดยประมาณ — 6 สถานะ ห้ามยุบสถานะที่ไม่มีตัวเลขเป็น ฿0 */}
        {price.kind !== 'HIDDEN' && (
          <div className="mt-2 text-xs">
            {price.kind === 'PRICE' ? (
              <>
                <div className="flex flex-nowrap items-baseline justify-between gap-2">
                  <span className="text-default-600">ค่าส่งโดยประมาณ</span>
                  <span className="text-default-900 shrink-0 font-semibold tabular-nums">
                    {formatBaht(price.amount)}
                  </span>
                </div>
                {effectiveBox && (
                  <p className="text-default-500 mt-0.5 mb-0 text-2xs">
                    คิดจากกล่อง{draftBox ? 'ที่แก้ไว้' : 'ของขาไป'} ({effectiveBox.weight} กก. ·{' '}
                    {effectiveBox.width}×{effectiveBox.length}×{effectiveBox.height}) —{' '}
                    {renderBoxToggle()}
                  </p>
                )}
              </>
            ) : (
              <p
                className={`mb-0 ${price.kind === 'LOADING' ? 'text-default-600' : 'text-warning-ink'}`}
              >
                {price.kind === 'ERROR' ? price.text : RETURN_PRICE_TEXT[price.kind]}
                {price.kind !== 'LOADING' && <> {renderBoxToggle()}</>}
              </p>
            )}
            {boxOpen && renderBoxEditor()}
          </div>
        )}

        {/* ถามเฉพาะตอนลูกค้าออกค่าส่ง — ร้านจ่ายเองบังคับเป็นต้นทุนอยู่แล้ว (resolveCountAsCost)
            ถามไปก็หลอกว่าเลือกได้ทั้งที่ติ๊กออกแล้วไม่มีผล */}
        {method.costOptional && (
          <label className="mt-2 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="form-checkbox mt-0.5"
              checked={countAsCost}
              onChange={(e) => setCountAsCost(e.target.checked)}
            />
            <span>
              ลูกค้าออกเลขเอง แต่<span className="font-semibold">มาเรียกเก็บร้านทีหลัง</span> — บันทึกเป็นต้นทุนร้าน
            </span>
          </label>
        )}
      </div>
    )
  }

  /** ลิงก์เปิด/ปิดตัวแก้ขนาดกล่อง — `<button>` ไม่ใช่ `<a>` (ไม่ได้พาไปไหน) */
  function renderBoxToggle() {
    return (
      <button
        type="button"
        className="text-primary-ink font-medium underline-offset-2 hover:underline"
        aria-expanded={boxOpen}
        onClick={() => {
          setBoxOpen((v) => !v)
          // เปิดครั้งแรกเติมค่าของขาไปให้ — ร้านแก้ทีละช่องได้โดยไม่ต้องพิมพ์ใหม่ทั้งชุด
          if (!boxOpen && !draftBox && forward?.box) {
            setBoxDraft({
              weight: String(forward.box.weight),
              width: String(forward.box.width),
              length: String(forward.box.length),
              height: String(forward.box.height),
            })
          }
        }}
      >
        {boxOpen ? 'ปิดการแก้ขนาด' : 'แก้ขนาดกล่อง'}
      </button>
    )
  }

  /** ตัวแก้ขนาดกล่องขากลับ (D-5) — 2 คอลัมน์บนมือถือ 320px · 4 คอลัมน์ตั้งแต่ sm */
  function renderBoxEditor() {
    const FIELDS = [
      { key: 'weight', label: 'น้ำหนัก (กก.)' },
      { key: 'width', label: 'กว้าง (ซม.)' },
      { key: 'length', label: 'ยาว (ซม.)' },
      { key: 'height', label: 'สูง (ซม.)' },
    ] as const
    return (
      <div className="border-default-200 mt-2 rounded-lg border border-dashed p-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="form-label text-default-600 mb-0.5 text-2xs" htmlFor={`box-${f.key}`}>
                {f.label}
              </label>
              <input
                id={`box-${f.key}`}
                className="form-input"
                type="number"
                inputMode="decimal"
                min={0}
                value={boxDraft[f.key]}
                onChange={(e) => setBoxDraft((b) => ({ ...b, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {forward?.box && (
          <button
            type="button"
            className="btn btn-sm bg-light text-default-800 hover:bg-default-200 mt-2 text-xs"
            onClick={() => setBoxDraft({ weight: '', width: '', length: '', height: '' })}
          >
            ใช้ขนาดของขาไป
          </button>
        )}
        {!draftBox && (
          <p className="text-default-500 mt-1 mb-0 text-2xs">
            กรอกให้ครบทั้ง 4 ช่องถึงจะใช้ขนาดใหม่ — ไม่ครบจะใช้กล่องของขาไปตามเดิม
          </p>
        )}
      </div>
    )
  }

  /**
   * แถบปุ่มท้ายฟอร์ม — โครงเดียวกันทุกขั้นและทุกโหมด
   *
   * Base: `RecordPaymentSheet.tsx:580` (ชีตพี่น้อง) — `min-h-11` คือสิ่งที่ทำให้ปุ่มถึงเกณฑ์
   * นิ้ว 44px ซึ่ง `.btn` เปล่า ๆ ของธีมไม่ถึง · safe-area เฉพาะโหมดชีตที่ยึดขอบจอจริง
   */
  function renderFooter({
    total,
    primary,
    secondary,
  }: {
    total: number | null
    primary: React.ReactNode
    secondary?: React.ReactNode
  }) {
    return (
      <div
        className={
          asSheet
            ? 'border-default-200 shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]' /* carve-out HR7: safe-area ไม่มี token ในธีม Paces — แถบปุ่มยึดขอบจอจึงต้องรับ inset เอง (ยกจาก RecordPaymentSheet.tsx:580) */
            : 'border-default-200 mt-4 border-t pt-3'
        }
      >
        {total != null && (
          <p className="text-default-900 mb-2 text-sm font-semibold tabular-nums">
            คืน {formatBaht(total)}
          </p>
        )}
        <div className="flex gap-3">
          {secondary}
          {primary}
        </div>
      </div>
    )
  }
}
