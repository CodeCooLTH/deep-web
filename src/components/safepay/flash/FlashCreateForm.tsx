'use client'

/**
 * FlashCreateForm — ฟอร์มเปิดพัสดุ Flash 1 ใบ (feature 00084, Design-Spec §4.3)
 *
 * โครงคัดจาก iship/ShipmentCreateForm.tsx (ผู้รับ / พัสดุ / เพิ่มเติม / ตรวจก่อนสร้าง + ปุ่มสร้างใน footer ผ่าน form=)
 * ต่างจากพี่น้อง iShip ตามเหตุผลทางข้อมูล: ไม่มีช่องเลือกขนส่ง/กล่อง · ขนาดกล่องไม่บังคับ ·
 * ราคาเป็น "ประมาณการ" เสมอ (BR-FLASH-53) และถามที่ /api/seller/flash/price · ผลสร้างอาจเป็น NEEDS_REVIEW (1003)
 *
 * "ไม่รู้จักแชท" โดยเจตนาเหมือนพี่น้อง — T10b ใส่ช่องของแชทผ่าน extraFields แล้วทำงานต่อใน onCreated
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (form-input/form-select/form-checkbox)
 *       + in-app: src/components/safepay/iship/ShipmentCreateForm.tsx
 */

import { useEffect, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { shouldWarnCodReturnRisk, type BuyerReputation } from '@/lib/buyer-reputation'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { ISHIP_CATEGORIES, findMissingReceiverFields } from '@/lib/iship/mapping'
import type { MissingReceiverField, SenderAddress } from '@/lib/iship/mapping'
import type { ParcelDefaults, ReceiverData, ShipmentReviewItem, ShipmentViewJson } from '@/lib/iship/context'
import { flashItemNotices, flashPriceBadge, flashPriceState, flashPriceSubline } from '@/lib/shipping/flash-order-ui'
import { useIShipUrl } from '@/components/safepay/iship/iship-shop-context'
import { NOTICE_BOX, TONE_BADGE } from '@/components/safepay/iship/tone'
import type { ShipmentFooterReporter } from '@/components/safepay/iship/shipment-footer'
import AddressSearchSheet, {
  type SelectedLocality,
} from '@/app/(paces)/seller/(dashboard)/orders/new/components/AddressSearchSheet'
import FlashLogo from './FlashLogo'
import { readApiError } from './flash-api'

interface Props {
  orderToken: string
  missingReceiver: MissingReceiverField[]
  receiver: ReceiverData
  /** ผู้ส่งจากการตั้งค่าร้าน — โชว์ในบล็อกตรวจ แก้ที่นี่ไม่ได้ */
  sender: SenderAddress
  items: ShipmentReviewItem[]
  /** ยอดเก็บปลายทางของคำสั่งซื้อนี้ — 0 = ไม่ใช่ใบ COD */
  codSuggested: number
  defaults: ParcelDefaults
  submitLabel?: string
  /** ช่องเพิ่มเติมของผู้เรียก (เช่น ติ๊กแจ้งเลขในแชท) */
  extraFields?: () => React.ReactNode
  /** เรียกทุกผลที่แถวถูกสร้าง (CREATED / FAILED / NEEDS_REVIEW) — ผู้เรียกสลับไปหน้าสถานะเสมอ */
  onCreated: (shipment: ShipmentViewJson) => void
  /** 409 = มีพัสดุที่ยังใช้งานอยู่แล้ว — ผู้เรียกโหลด context ใหม่ */
  onExists: () => void
  formId?: string
  hideSubmit?: boolean
  onFooterChange?: ShipmentFooterReporter
}

interface Quote {
  totalBaht: number
  pricingTable: string
}

/** ตัวเลขจากช่อง input — ว่าง = ไม่ส่ง field นั้นไปเลย (ให้ค่าตั้งต้นร้านทำงาน) */
function numOrUndefined(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function MissingChip({ label }: { label: string }) {
  return <span className="badge bg-danger/15 text-danger-ink">ขาด{label}</span>
}

/** ประวัติรับของของลูกค้า (00055) — ยิงเองในฟอร์มเหมือนพี่น้อง iShip (ฟอร์มถูกใช้หลายทางเข้า) */
function useBuyerReputation(orderToken: string, enabled: boolean) {
  const [data, setData] = useState<BuyerReputation | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/api/orders/${orderToken}/buyer-reputation`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { reputation?: BuyerReputation | null }
        if (alive) setData(json.reputation ?? null)
      } catch {
        // ดึงไม่ได้ = ไม่เตือน (คำเตือนที่ไม่มีตัวเลขหนุนคือเสียงรบกวน)
      }
    })()
    return () => {
      alive = false
    }
  }, [orderToken, enabled])
  return data
}

export default function FlashCreateForm({
  orderToken,
  missingReceiver,
  receiver,
  sender,
  items,
  codSuggested,
  defaults,
  submitLabel = 'สร้างพัสดุที่ Flash',
  extraFields,
  onCreated,
  onExists,
  formId,
  hideSubmit = false,
  onFooterChange,
}: Props) {
  const flashUrl = useIShipUrl()
  const [busy, setBusy] = useState(false)
  const [addrOpen, setAddrOpen] = useState(false)
  const [form, setForm] = useState<ReceiverData>(receiver)

  const [weight, setWeight] = useState(defaults.weight != null ? String(defaults.weight) : '')
  const [width, setWidth] = useState(defaults.width != null ? String(defaults.width) : '')
  const [length, setLength] = useState(defaults.length != null ? String(defaults.length) : '')
  const [height, setHeight] = useState(defaults.height != null ? String(defaults.height) : '')
  const [categoryId, setCategoryId] = useState(defaults.categoryId != null ? String(defaults.categoryId) : '')

  const hasPresetExtras = !!defaults.remark || defaults.optOnTime || defaults.optBoxShield || defaults.optIsInsured
  const [extraOpen, setExtraOpen] = useState(hasPresetExtras || codSuggested > 0)
  // ใบ COD เติมยอดจากคำสั่งซื้อให้เลย — พิมพ์เองคือจังหวะที่ผิดแล้วรู้ตอนเก็บเงินลูกค้าผิดจำนวน
  const [codAmount, setCodAmount] = useState(codSuggested > 0 ? String(codSuggested) : '')
  const buyerReputation = useBuyerReputation(orderToken, codSuggested > 0)
  const [remark, setRemark] = useState(defaults.remark ?? '')
  const [onTime, setOnTime] = useState(defaults.optOnTime)
  const [boxShield, setBoxShield] = useState(defaults.optBoxShield)
  const [isInsured, setIsInsured] = useState(defaults.optIsInsured)
  const [productValue, setProductValue] = useState(
    defaults.optProductValue != null ? String(defaults.optProductValue) : '',
  )

  const setField = (k: keyof ReceiverData, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const isMissing = (f: MissingReceiverField) => missingReceiver.includes(f)

  // ช่องผู้รับที่ยังขาด "ณ วินาทีนี้" — คำนวณจากสิ่งที่พิมพ์อยู่ ไม่ใช่ค่า server ตอนโหลด
  const liveMissing = useMemo(
    () =>
      findMissingReceiverFields(
        {
          line1: form.line1,
          subdistrict: form.subdistrict,
          district: form.district,
          province: form.province,
          postcode: form.postcode,
        },
        form.name,
        form.phone,
      ),
    [form],
  )

  const [itemsOpen, setItemsOpen] = useState(false)
  const itemCount = useMemo(() => items.reduce((s, it) => s + it.qty, 0), [items])
  const itemsSubtotal = useMemo(() => items.reduce((s, it) => s + it.price * it.qty, 0), [items])
  const itemNotices = useMemo(() => flashItemNotices(items), [items])

  // ── ราคาประมาณการ (หน่วง 700ms หลังหยุดพิมพ์ — น้ำหนัก "1.25" ต้องไม่กลายเป็น 4 คำขอ) ──
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoteTick, setQuoteTick] = useState(0)

  const priceReady =
    numOrUndefined(weight) != null && !!form.district && !!form.province && !!form.postcode
  const quoteKey = [weight, width, length, height, form.subdistrict, form.district, form.province, form.postcode, quoteTick].join('|')

  useEffect(() => {
    const w = numOrUndefined(weight)
    if (!priceReady || w == null) {
      setQuote(null)
      setQuoteError(null)
      return
    }
    let alive = true
    setQuoting(true)
    const timer = setTimeout(async () => {
      try {
        const wd = numOrUndefined(width)
        const ln = numOrUndefined(length)
        const ht = numOrUndefined(height)
        const res = await fetch(flashUrl('/api/seller/flash/price'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiver: {
              district: form.district,
              province: form.province,
              postcode: form.postcode,
              ...(form.subdistrict ? { subdistrict: form.subdistrict } : {}),
            },
            weight: w,
            ...(wd != null ? { width: wd } : {}),
            ...(ln != null ? { length: ln } : {}),
            ...(ht != null ? { height: ht } : {}),
          }),
          cache: 'no-store',
        })
        if (!alive) return
        if (!res.ok) {
          // ไม่เดาตัวเลข ไม่ใช้ ฿0 — ประเมินไม่ได้ไม่ขวางการสร้างพัสดุ
          setQuote(null)
          setQuoteError((await readApiError(res, 'ติดต่อ Flash ไม่ได้')).message)
          return
        }
        setQuote((await res.json()) as Quote)
        setQuoteError(null)
      } catch {
        if (alive) {
          setQuote(null)
          setQuoteError('ติดต่อ Flash ไม่ได้')
        }
      } finally {
        if (alive) setQuoting(false)
      }
    }, 700)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // quoteKey รวมทุกช่องที่มีผลต่อราคาไว้แล้ว (+ quoteTick ของปุ่มลองใหม่)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey])

  const priceState = flashPriceState({ ready: priceReady, loading: quoting, hasQuote: quote !== null, hasError: quoteError !== null })

  const hasLocality = !!(form.subdistrict || form.district || form.province || form.postcode)
  const localityMissing =
    isMissing('ตำบล') || isMissing('อำเภอ') || isMissing('จังหวัด') || isMissing('รหัสไปรษณีย์')

  async function handleSubmit() {
    if (busy) return
    if (itemNotices.blockedBy) {
      pacesToast.error(`รายการ "${itemNotices.blockedBy}" จำนวนเกิน 999 ชิ้น ลดจำนวนหรือแยกเป็นหลายคำสั่งซื้อ แล้วสร้างพัสดุอีกครั้ง`)
      return
    }
    if (numOrUndefined(weight) == null) {
      pacesToast.error('กรอกน้ำหนักพัสดุก่อนสร้าง')
      return
    }
    // ยืนยันเสมอ — เปิดพัสดุจริงและเกิดค่าใช้จ่ายจริงของร้าน
    const ok = await pacesConfirm.question(
      'สร้างพัสดุที่ Flash',
      'ระบบจะเปิดพัสดุจริงที่ Flash ตามค่าที่กรอก มีค่าใช้จ่ายจริงกับบัญชี Flash ของร้าน',
      { confirmButtonText: 'สร้างพัสดุ', cancelButtonText: 'ไม่ใช่ตอนนี้' },
    )
    if (!ok) return

    setBusy(true)
    try {
      const wd = numOrUndefined(width)
      const ln = numOrUndefined(length)
      const ht = numOrUndefined(height)
      const res = await fetch(flashUrl('/api/seller/flash/shipments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderToken,
          receiver: form,
          override: {
            weight: numOrUndefined(weight),
            ...(wd != null ? { width: wd } : {}),
            ...(ln != null ? { length: ln } : {}),
            ...(ht != null ? { height: ht } : {}),
            ...(categoryId !== '' ? { categoryId: Number(categoryId) } : {}),
            // 🛑 ส่งเสมอ แม้ช่องว่าง (= 0) — คีย์ที่ไม่ส่งแปลว่า "ให้เซิร์ฟเวอร์ตัดสินเอง" ซึ่งเคยทำให้
            // ออเดอร์โอนเงินถูกเปิดพัสดุเป็น COD เท่ายอดบิล (บั๊กเงิน prod 2026-09-04 ของ iShip)
            codAmount: numOrUndefined(codAmount) ?? 0,
            ...(remark.trim() !== '' ? { remark } : {}),
            options: {
              onTime,
              boxShield,
              isInsured,
              ...(isInsured && numOrUndefined(productValue) != null
                ? { productValue: numOrUndefined(productValue) }
                : {}),
            },
          },
        }),
        cache: 'no-store',
      })

      if (res.status === 409) {
        // มีใบอยู่แล้ว/รอตรวจ — ไม่ใช่ความผิดพลาดของร้าน ให้ผู้เรียกโหลดสถานะจริงมาแสดง
        onExists()
        return
      }
      if (!res.ok) {
        pacesToast.error((await readApiError(res)).message)
        return
      }

      const body = (await res.json()) as ShipmentViewJson
      if (body.status === 'CREATED') pacesToast.success('สร้างพัสดุสำเร็จ')
      else if (body.status === 'NEEDS_REVIEW') pacesToast.warning(body.lastErrorMessage ?? 'ต้องตรวจสอบพัสดุที่ Flash')
      else pacesToast.error(body.lastErrorMessage ?? 'สร้างพัสดุไม่สำเร็จ')
      onCreated(body)
    } catch {
      pacesToast.error('สร้างพัสดุไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!onFooterChange || !formId) return
    onFooterChange({ formId, label: submitLabel, icon: 'tabler:package-export', busy })
    return () => onFooterChange(null)
  }, [onFooterChange, formId, submitLabel, busy])

  const has = (v?: string | null) => !!v && v.trim() !== ''
  const senderLine = [sender.address, sender.subdistrict, sender.district, sender.province, sender.postcode]
    .filter(has)
    .join(' ')
  const receiverLine = [form.line1, form.subdistrict, form.district, form.province, form.postcode].filter(has).join(' ')
  const badge = quote ? flashPriceBadge(quote.pricingTable) : null

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault()
        void handleSubmit()
      }}
      className="@container flex flex-col"
    >
      <section className="flex items-center gap-3 border-b-8 border-default-100 p-4">
        <FlashLogo className="size-9" />
        <div className="min-w-0">
          <p className="mb-0 truncate text-sm font-semibold text-default-900">Flash (บัญชีของร้านเอง)</p>
          <p className="text-default-700 mb-0 text-xs">ใช้ราคาสัญญา บิลกับ Flash โดยตรง</p>
        </div>
      </section>

      {/* ── ผู้รับ ─────────────────────────────────────────────── */}
      <section className="border-b-8 border-default-100 p-4">
        <header className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="tabler:user" className="text-sm" aria-hidden="true" />
          </span>
          <h6 className="mb-0 text-sm font-semibold text-default-900">ผู้รับ</h6>
          <span className="ms-auto text-xs text-default-700">บันทึกกลับเข้าคำสั่งซื้อ</span>
        </header>

        <div className="grid grid-cols-1 gap-2.5 @2xl:grid-cols-2">
          <div>
            <label className="form-label" htmlFor="fl-rcv-name">ชื่อผู้รับ</label>
            <input
              id="fl-rcv-name"
              type="text"
              className={`form-input${isMissing('ชื่อผู้รับ') ? ' is-invalid' : ''}`}
              aria-describedby={isMissing('ชื่อผู้รับ') ? 'fl-rcv-name-err' : undefined}
              value={form.name ?? ''}
              onChange={(e) => setField('name', e.target.value)}
            />
            {isMissing('ชื่อผู้รับ') && (
              <p id="fl-rcv-name-err" className="mb-0 mt-1 text-xs text-danger-ink">จำเป็นสำหรับเปิดพัสดุ</p>
            )}
          </div>
          <div>
            <label className="form-label" htmlFor="fl-rcv-phone">เบอร์โทรผู้รับ</label>
            <input
              id="fl-rcv-phone"
              type="tel"
              inputMode="numeric"
              className={`form-input${isMissing('เบอร์โทรผู้รับ') ? ' is-invalid' : ''}`}
              aria-describedby={isMissing('เบอร์โทรผู้รับ') ? 'fl-rcv-phone-err' : undefined}
              value={form.phone ?? ''}
              onChange={(e) => setField('phone', e.target.value)}
            />
            {isMissing('เบอร์โทรผู้รับ') && (
              <p id="fl-rcv-phone-err" className="mb-0 mt-1 text-xs text-danger-ink">จำเป็นสำหรับเปิดพัสดุ</p>
            )}
          </div>
        </div>

        <div className="mt-2.5">
          <label className="form-label" htmlFor="fl-rcv-line1">ที่อยู่ (บ้านเลขที่ / ถนน)</label>
          <input
            id="fl-rcv-line1"
            type="text"
            className={`form-input${isMissing('ที่อยู่') ? ' is-invalid' : ''}`}
            aria-describedby={isMissing('ที่อยู่') ? 'fl-rcv-line1-err' : undefined}
            value={form.line1 ?? ''}
            onChange={(e) => setField('line1', e.target.value)}
          />
          {isMissing('ที่อยู่') && (
            <p id="fl-rcv-line1-err" className="mb-0 mt-1 text-xs text-danger-ink">จำเป็นสำหรับเปิดพัสดุ</p>
          )}
        </div>

        {/* sheet ไม่ใช่ dropdown: โมดัลมี transform ที่ทำให้ลูก fixed ยึดกรอบโมดัลแทน viewport */}
        <div className="mt-2.5">
          <label className="form-label" id="fl-rcv-locality-label">ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์</label>
          <button
            type="button"
            onClick={() => setAddrOpen(true)}
            aria-labelledby="fl-rcv-locality-label"
            aria-describedby={localityMissing ? 'fl-rcv-locality-err' : undefined}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left ${
              localityMissing ? 'border-danger/60 bg-danger/5' : 'border-default-300'
            }`}
          >
            <Icon
              icon="tabler:map-pin"
              className={`size-4 shrink-0 ${hasLocality ? 'text-primary' : 'text-default-400'}`}
              aria-hidden="true"
            />
            {hasLocality ? (
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-semibold text-default-900">
                  ต.{form.subdistrict || '—'} · อ.{form.district || '—'}
                </span>
                <span className="block text-xs text-default-700">
                  {form.province || '—'} · {form.postcode || '—'}
                </span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-sm text-default-700">แตะเพื่อเลือกตำบล / อำเภอ / จังหวัด</span>
            )}
            <Icon icon="tabler:chevron-right" className="size-4 shrink-0 text-default-400" aria-hidden="true" />
          </button>
          {localityMissing && (
            <p id="fl-rcv-locality-err" className="mb-0 mt-1 text-xs text-danger-ink">
              ยังไม่ได้เลือก — จำเป็นสำหรับเปิดพัสดุ
            </p>
          )}
        </div>
      </section>

      {/* ── พัสดุ ──────────────────────────────────────────────── */}
      <section className="border-b-8 border-default-100 p-4">
        <header className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="tabler:package" className="text-sm" aria-hidden="true" />
          </span>
          <h6 className="mb-0 text-sm font-semibold text-default-900">พัสดุ</h6>
          <span className="ms-auto text-xs text-default-700">ค่าตั้งต้นของร้าน</span>
        </header>

        <div className="grid grid-cols-1 gap-2.5 @2xl:grid-cols-2">
          <div>
            <label className="form-label" htmlFor="fl-weight">น้ำหนัก (กก.)</label>
            <input
              id="fl-weight"
              type="number"
              /* step="any": step ยึดกริดจาก min ทำให้บางค่า (เช่น 2 กก.) ตกร่อง — ช่วงเลขคุมที่ Valibot ฝั่ง API */
              step="any"
              min="0.01"
              className="form-input"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="fl-width">ขนาดกล่อง (กว้าง × ยาว × สูง · ซม. ไม่บังคับ)</label>
            <div className="grid grid-cols-3 gap-2">
              <input id="fl-width" type="number" min="1" className="form-input" aria-label="กว้าง (ซม.)" value={width} onChange={(e) => setWidth(e.target.value)} />
              <input type="number" min="1" className="form-input" aria-label="ยาว (ซม.)" value={length} onChange={(e) => setLength(e.target.value)} />
              <input type="number" min="1" className="form-input" aria-label="สูง (ซม.)" value={height} onChange={(e) => setHeight(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-2.5">
          <label className="form-label" htmlFor="fl-category">ประเภทสินค้า</label>
          <select id="fl-category" className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">ใช้ประเภทค่าตั้งต้นของร้าน</option>
            {ISHIP_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </section>

      {/* ── เพิ่มเติม ──────────────────────────────────────────── */}
      <section className="border-b-8 border-default-100 p-4">
        <button
          type="button"
          onClick={() => setExtraOpen((v) => !v)}
          aria-expanded={extraOpen}
          aria-controls="fl-extra"
          className="flex w-full items-center gap-2 rounded-lg border border-default-200 bg-default-50 px-3 py-2.5 text-left"
        >
          <Icon icon="tabler:adjustments" className="size-4 shrink-0 text-default-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-default-700">เพิ่มเติม — เก็บเงินปลายทาง · หมายเหตุ · ประกัน</span>
          <Icon
            icon="tabler:chevron-down"
            className={`ms-auto size-4 shrink-0 text-default-400${extraOpen ? ' rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {extraOpen && (
          <div id="fl-extra" className="mt-3 flex flex-col gap-2.5">
            <div>
              <label className="form-label" htmlFor="fl-cod">เก็บเงินปลายทาง (บาท)</label>
              <input
                id="fl-cod"
                type="number"
                min="0"
                className="form-input"
                placeholder="0"
                value={codAmount}
                onChange={(e) => setCodAmount(e.target.value)}
              />
              <p className="mb-0 mt-1 text-xs text-default-700">
                ยอดนี้อ้างอิงวิธีชำระเงินของคำสั่งซื้อ — เว้นว่างหรือ 0 = ไม่เก็บเงินปลายทาง
              </p>
              {/* เตือน ไม่ใช่บล็อก (BR-BR-08) · ถ้อยคำเป็นกลางตาม BR-BR-09 */}
              {shouldWarnCodReturnRisk(buyerReputation, numOrUndefined(codAmount) ?? 0) && buyerReputation && (
                <p className={`mt-2 mb-0 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${NOTICE_BOX.warning}`}>
                  <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
                  <span>
                    ลูกค้ารายนี้เคยมีพัสดุตีกลับ <span className="font-semibold">{buyerReputation.returned} ครั้ง</span> ทั้งระบบ
                    {buyerReputation.returnRate !== null &&
                      ` (${Math.round(buyerReputation.returnRate * 100)}% ของ ${buyerReputation.shipped} ใบที่เปิดพัสดุ)`}
                    {' — '}พิจารณาเก็บเงินก่อนส่งแทนเก็บปลายทาง
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="form-label" htmlFor="fl-remark">หมายเหตุถึงคนส่งของ</label>
              <input
                id="fl-remark"
                type="text"
                className="form-input"
                placeholder="เช่น โทรก่อนส่ง"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="form-checkbox" checked={onTime} onChange={(e) => setOnTime(e.target.checked)} />
              ใช้บริการส่งตรงเวลา
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="form-checkbox" checked={boxShield} onChange={(e) => setBoxShield(e.target.checked)} />
              ประกันกล่องพัสดุ
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="form-checkbox" checked={isInsured} onChange={(e) => setIsInsured(e.target.checked)} />
              ประกันสินค้า
            </label>
            {isInsured && (
              <div className="ps-6">
                <label className="form-label" htmlFor="fl-product-value">มูลค่าสินค้าที่เอาประกัน (บาท)</label>
                <input
                  id="fl-product-value"
                  type="number"
                  min="1"
                  className="form-input"
                  value={productValue}
                  onChange={(e) => setProductValue(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {extraFields && <section className="border-b-8 border-default-100 p-4">{extraFields()}</section>}

      {/* ── ตรวจก่อนสร้างพัสดุ ──────────────────────────────────── */}
      <section className="border-b-8 border-default-100 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="tabler:clipboard-check" className="text-sm" aria-hidden="true" />
          </span>
          <h6 className="mb-0 text-sm font-semibold text-default-900">ตรวจก่อนสร้างพัสดุ</h6>
          <span className="ms-auto text-xs text-default-700">กวาดตาก่อนกดสร้าง</span>
        </div>

        <div className="rounded-lg border border-dashed border-default-300 bg-default-50 p-3">
          {liveMissing.length > 0 && (
            <p className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${NOTICE_BOX.danger}`}>
              <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <span>ผู้รับยังกรอกไม่ครบ {liveMissing.length} ช่อง — เลื่อนขึ้นไปกรอกด้านบนก่อนกดสร้าง</span>
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-xs text-default-700">จาก (ผู้ส่ง)</p>
              <p className="mb-0.5 truncate text-sm font-semibold text-default-900">{has(sender.name) ? sender.name : '—'}</p>
              <p className="mb-0 break-words text-sm text-default-600">{[sender.phone, senderLine].filter(has).join(' · ') || '—'}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs text-default-700">ถึง (ผู้รับ)</p>
              <p className="mb-0.5 flex flex-wrap items-center gap-1 text-sm font-semibold text-default-900">
                {has(form.name) ? form.name : liveMissing.includes('ชื่อผู้รับ') ? <MissingChip label="ชื่อ" /> : '—'}
              </p>
              <p className="mb-0.5 flex flex-wrap items-center gap-1 text-sm text-default-600">
                {has(form.phone) ? form.phone : liveMissing.includes('เบอร์โทรผู้รับ') ? <MissingChip label="เบอร์โทร" /> : '—'}
              </p>
              <p className="mb-0 break-words text-sm text-default-600">
                {receiverLine || (liveMissing.includes('ที่อยู่') ? <MissingChip label="ที่อยู่" /> : '—')}
              </p>
            </div>
          </div>

          <div className="mt-3 border-t border-dashed border-default-300 pt-3">
            <p className="mb-2 text-xs text-default-700">สินค้าในคำสั่งซื้อ</p>
            {items.length === 0 ? (
              <p className="mb-0 text-sm text-default-700">ไม่มีรายการสินค้าในคำสั่งซื้อนี้</p>
            ) : (
              <>
                <ul className="mb-0 flex list-none flex-col gap-1.5 ps-0">
                  {(itemsOpen ? items : items.slice(0, 3)).map((it) => (
                    <li key={it.id} className="flex items-start gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-default-700">{it.name}</span>
                      <span className="shrink-0 text-default-700">×{it.qty}</span>
                      <span className="shrink-0 font-semibold text-default-900">฿{(it.price * it.qty).toLocaleString('th-TH')}</span>
                    </li>
                  ))}
                </ul>
                {items.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setItemsOpen((v) => !v)}
                    className="btn mt-1.5 inline-flex items-center gap-1 p-0 text-xs text-primary hover:underline"
                  >
                    <Icon
                      icon="tabler:chevron-down"
                      className={`text-sm transition-transform ${itemsOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                    {itemsOpen ? 'ย่อ' : `ดูเพิ่มเติม (+${items.length - 3} รายการ)`}
                  </button>
                )}
                <div className="mt-2 flex items-center justify-between border-t border-dashed border-default-300 pt-2 text-sm">
                  <span className="text-default-700">รวมสินค้า {itemCount} ชิ้น</span>
                  <span className="font-semibold text-default-900">฿{itemsSubtotal.toLocaleString('th-TH')}</span>
                </div>
              </>
            )}
            {itemNotices.overflow && !itemNotices.blockedBy && (
              <p className={`mt-2 mb-0 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${NOTICE_BOX.info}`}>
                <Icon icon="tabler:info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                <span>
                  คำสั่งซื้อนี้มีสินค้าเกิน 10 รายการ รายการที่เหลือจะรวมเป็น &quot;สินค้าอื่น ๆ&quot; ในใบ Flash
                  (จำนวนรวมเท่าเดิม)
                </span>
              </p>
            )}
            {itemNotices.blockedBy && (
              <p className={`mt-2 mb-0 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${NOTICE_BOX.danger}`} role="alert">
                <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
                <span>
                  รายการ &quot;{itemNotices.blockedBy}&quot; จำนวนเกิน 999 ชิ้น ลดจำนวนหรือแยกเป็นหลายคำสั่งซื้อ
                  แล้วสร้างพัสดุอีกครั้ง
                </span>
              </p>
            )}
          </div>

          {/* ค่าส่งโดยประมาณ — ประมาณการเสมอ ไม่ใช่ราคาผูกพัน (BR-FLASH-53) */}
          <div className="mt-3 border-t border-dashed border-default-300 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-default-700">ค่าส่งโดยประมาณ</span>
              {priceState === 'loading' && (
                <span className="flex items-center gap-2 text-xs text-default-700" aria-busy="true">
                  <span className="h-4 w-16 animate-pulse rounded bg-default-100" />
                  กำลังถามราคาจาก Flash…
                </span>
              )}
              {priceState === 'quote' && quote && badge && (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-lg font-bold tabular-nums text-default-900">฿{quote.totalBaht.toLocaleString('th-TH')}</span>
                  <span className={TONE_BADGE.secondary}>ประมาณการ</span>
                  <span className={TONE_BADGE[badge.tone]}>{badge.label}</span>
                </span>
              )}
              {priceState === 'incomplete' && (
                <span className="text-xs text-default-700">กรอกปลายทางและน้ำหนักให้ครบเพื่อดูราคา</span>
              )}
            </div>
            {priceState === 'quote' && quote && (
              <p className="mb-0 mt-1 text-xs text-default-700">{flashPriceSubline(quote.pricingTable)}</p>
            )}
            {priceState === 'error' && (
              <p className={`mt-2 mb-0 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs ${NOTICE_BOX.warning}`}>
                <Icon icon="tabler:alert-triangle" className="shrink-0 text-sm" aria-hidden="true" />
                <span className="min-w-0 flex-1">ประเมินราคาไม่ได้ ({quoteError}) ยังสร้างพัสดุได้ตามปกติ</span>
                <button
                  type="button"
                  onClick={() => setQuoteTick((n) => n + 1)}
                  className="btn inline-flex min-h-11 items-center gap-1 p-0 text-warning-ink underline lg:min-h-0"
                >
                  <Icon icon="tabler:refresh" className="text-sm" aria-hidden="true" />
                  ลองใหม่
                </button>
              </p>
            )}
          </div>
        </div>
      </section>

      {!hideSubmit && (
        <div className="p-4">
          <button
            type="submit"
            disabled={busy}
            className="btn inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Icon icon="tabler:package-export" className="text-base" aria-hidden="true" />
            )}
            {submitLabel}
          </button>
          <p className="mb-0 mt-2 text-center text-xs text-default-700">
            ระบบจะเปิดพัสดุจริงที่ Flash ตามค่าที่กรอก · มีค่าใช้จ่ายจริงกับบัญชี Flash ของร้าน
          </p>
        </div>
      )}

      <AddressSearchSheet
        open={addrOpen}
        current={
          hasLocality
            ? {
                subdistrict: form.subdistrict ?? '',
                district: form.district ?? '',
                province: form.province ?? '',
                postcode: form.postcode ?? '',
              }
            : null
        }
        onSelect={(loc: SelectedLocality) =>
          setForm((f) => ({
            ...f,
            subdistrict: loc.subdistrict,
            district: loc.district,
            province: loc.province,
            postcode: loc.postcode,
          }))
        }
        onClose={() => setAddrOpen(false)}
      />
    </form>
  )
}
