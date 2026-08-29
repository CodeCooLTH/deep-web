'use client'

/**
 * CustomerQuickBlock — section "ลูกค้า" ของ quick create (< lg), phone-first
 * Base: mockup 2026-07-06-quick-create-order.html (section ลูกค้า) + CustomerSearchSheet (dedup, full-screen)
 * ค้นหาลูกค้า → full-screen CustomerSearchSheet (คลิกเดียวได้ข้อมูล); เจอลูกค้าเดิม = badge "ลูกค้าเก่า" ข้างหัวข้อ
 * wand tool → PasteParseSheet; locality field → AddressSearchSheet; ที่อยู่แสดงเมื่อ salesChannel !== STOREFRONT
 */

import { useState, useRef, useEffect } from 'react'
import { useController, useWatch } from 'react-hook-form'
import type { Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import AddressSearchSheet, { type SelectedLocality } from './AddressSearchSheet'
import PasteParseSheet from './PasteParseSheet'
import CustomerSearchSheet, { type CustomerResult } from './CustomerSearchSheet'
import PhoneSuggestHint from './PhoneSuggestHint'
import DeliveryModeToggle from './DeliveryModeToggle'
import { hasPhoneSuggestion, hasPhoneHint } from '@/lib/phone-hint'
import { MOBILE_PHONE_RE } from '@/lib/phone'
import type { FormValues } from './OrderCreateForm'
import type { ParsedOrderMessage } from '@/lib/parse-order-message'
import { getLocalityStatus } from '@/lib/shipping-address-status'
import { parseOrderMessage } from '@/lib/parse-order-message'

interface Props {
  control: Control<FormValues>
  errors: FieldErrors<FormValues>
  setValue: UseFormSetValue<FormValues>
  /** ออเดอร์นี้ต้องจัดส่ง (มีสินค้า SHIPPED + ไม่ใช่หน้าร้าน) → เตือนให้ตั้งที่อยู่ปลายทางให้ครบ */
  needsShipping: boolean
  /**
   * ข้อความจากแชทที่ต้องกระจายให้ตอนเปิดฟอร์ม (user สั่ง 2026-08-04 — กดค้างบนข้อความ →
   * สร้างคำสั่งซื้อ) กระจายรอบเดียวตอน mount เท่านั้น ไม่ตามค่า prop ที่เปลี่ยนทีหลัง
   */
  prefillParseText?: string
  /** feature 00062 (U15) — ปุ่มคู่ "จัดส่ง | นัดรับ" เฉพาะร้าน ONLINE_SALES (SSOT: OrderCreateForm) */
  showDeliveryToggle?: boolean
}

export default function CustomerQuickBlock({
  control,
  errors,
  setValue,
  needsShipping,
  prefillParseText,
  showDeliveryToggle = false,
}: Props) {
  const [pasteOpen, setPasteOpen] = useState(false)
  /** ข้อความตั้งต้นในชีตกระจาย — มีค่าเมื่อเปิดชีตเพราะกระจายได้ไม่ครบ (ให้ร้านแก้ต่อจากของเดิม) */
  const [pasteInitialText, setPasteInitialText] = useState('')
  /** กระจายจากข้อความในแชทให้แล้ว → ขึ้นแถบบอก ไม่ให้ค่าโผล่มาเองอย่างเงียบ ๆ */
  const [prefilledFromChat, setPrefilledFromChat] = useState(false)
  const [addrOpen, setAddrOpen] = useState(false)
  const [custOpen, setCustOpen] = useState(false)
  const [custQuery, setCustQuery] = useState('')
  const [selected, setSelected] = useState<CustomerResult | null>(null)
  const [isNewCustomer, setIsNewCustomer] = useState(false) // badge "ลูกค้าใหม่" (paste ไม่เจอ / ยืนยันลูกค้าใหม่)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // พิมพ์เบอร์ → debounce (เผื่อ paste) → เปิด sheet ค้นหา (ไม่เปิดตอนแค่จิ้ม)
  //
  // 🛑 มี chip แนะนำค้างอยู่ = ยังไม่เปิดชีต (user เคาะ 2026-08-21) — ชีตเปิดทับทั้งจอ
  // ถ้าเปิดตอนค่ายังเพี้ยน ร้านจะเห็นจอ "ไม่พบลูกค้าเดิม" ทั้งที่ลูกค้าคนนั้นมีอยู่จริง
  // (นั่นคือภาพที่ user รายงานมาพอดี) และ chip ที่เพิ่งโผล่จะถูกทับใน ~0.5 วินาที
  // ปล่อยให้ร้านกด chip ให้ค่าสะอาดก่อน แล้วการค้นที่วิ่งจริงคือการค้นที่หาเจอได้
  //
  // เคสอื่น (พิมพ์ชื่อคน / เลขที่ยังไม่ครบ) ชีตยังเปิดเองเหมือนเดิมทุกอย่าง
  const triggerCustomerSearch = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      const t = value.trim()
      if (t.length < 2) return
      if (hasPhoneSuggestion(t)) return
      setCustQuery(t)
      setCustOpen(true)
    }, 500)
  }

  /** กด chip → เขียนทับค่าในช่อง แล้วค้นใหม่ทันทีด้วยเบอร์ที่สะอาดแล้ว */
  const applyPhoneSuggestion = (phone: string) => {
    setSelected(null)
    setIsNewCustomer(false)
    setValue('buyerContact', phone, { shouldValidate: true })
    triggerCustomerSearch(phone)
  }

  const { field: nameField } = useController({ control, name: 'buyerName', defaultValue: '' })
  const { field: contactField } = useController({ control, name: 'buyerContact', defaultValue: '' })
  const { field: line1Field } = useController({ control, name: 'shippingAddress.line1', defaultValue: '' })

  const contactErrorMessage = errors.buyerContact?.message
    ? String(errors.buyerContact.message)
    : undefined

  /**
   * สล็อตใต้ช่องมีเนื้อหาไหม — ใช้ตัดสิน `aria-describedby` เท่านั้น (ชี้กล่องว่างไม่ได้)
   * 🛑 ห้ามเอาไปครอบตัว <PhoneSuggestHint> — ดูคอมเมนต์ที่จุด render
   */
  const hintVisible = hasPhoneHint(contactField.value ?? '') || Boolean(contactErrorMessage)

  /**
   * บล็อกที่อยู่ต้องผูกกับ needsShipping ตัวเดียวกับที่ตัดสินการบันทึกจริง (user 2026-08-10)
   *
   * เดิมเงื่อนไขคือ `channel !== 'STOREFRONT'` ล้วน ๆ ซึ่งกว้างกว่ากฎที่บังคับจริงมาก — ร้านคิวงาน/
   * บ้านพักที่คุยกับลูกค้าในแชท (ช่องทางย่อมไม่ใช่ "หน้าร้าน") จึงเห็นช่องที่อยู่ทุกใบทั้งที่ไม่มีการส่งของ
   * เลย. ฝั่งเดสก์ท็อป (CartPanel) ซ่อนทั้ง accordion มาตั้งแต่ 2026-08-07 แล้ว — สองจอของฟอร์ม
   * เดียวกันตอบไม่ตรงกันอยู่ 3 วัน โดยที่โมดัลในแชทคือทางที่ผู้ขายใช้จริงมากที่สุด
   *
   * (มติ 2026-08-07 "คงช่องไว้แต่ไม่บังคับ" ถูก user ยกเลิกเอง 2026-08-10 → ซ่อนให้ตรงกับเดสก์ท็อป)
   */
  const showAddress = needsShipping
  const addr = useWatch({ control, name: 'shippingAddress' }) as FormValues['shippingAddress']

  /**
   * feature 00062 (U15) — เลือก "นัดรับ" ไหม (ใช้แค่ตัดสินว่าจะโชว์บรรทัดอธิบายแทนที่บล็อกที่อยู่
   * หรือเปล่า — ตัวที่บล็อกการบันทึกจริงคือ `showAddress`/`needsShipping` ด้านบน ซึ่งรับค่านี้ผ่าน
   * SSOT `orderNeedsShippingAddress()` ที่ QuickForm เรียกอยู่แล้ว ไม่ใช่เขียนเงื่อนไขซ้ำที่นี่)
   */
  const isPickup = useWatch({ control, name: 'fulfillmentMode' }) === 'PICKUP'

  // ── สถานะที่อยู่ (bug user report 2026-08-02) ────────────────────────────────
  // เดิมปุ่มที่อยู่ขึ้นสถานะ "เลือกแล้ว" ทันทีที่มีตำบล *หรือ* จังหวัดอย่างใดอย่างหนึ่ง
  // ร้านที่วางข้อความแล้ว parser จับจังหวัด/รหัสไปรษณีย์ไม่ได้ จึงเห็นปุ่มเหมือนเลือกสำเร็จ
  // แล้วไปเจอ error ตอนกดบันทึกโดยไม่มีอะไรชี้ว่าขาดช่องไหน — ปุ่มต้องบอกความจริงตั้งแต่ตอนเติมค่า
  // (กฎ "ครบพอบันทึกไหม" อยู่ที่ lib/shipping-address-status.ts ที่เดียว ห้ามเขียนซ้ำที่นี่)

  // error ที่ OrderCreateForm setError ไว้ตอน submit — ก่อนหน้านี้ set แล้วไม่มีใคร render
  const line1Error = errors.shippingAddress?.line1?.message
  const localitySubmitError = !!(errors.shippingAddress?.province || errors.shippingAddress?.postcode)
  const localityStatus = getLocalityStatus(addr, localitySubmitError)

  const locality: SelectedLocality | null = localityStatus.hasAnyData
    ? {
        subdistrict: addr?.subdistrict?.trim() ?? '',
        district: addr?.district?.trim() ?? '',
        province: addr?.province?.trim() ?? '',
        postcode: addr?.postcode?.trim() ?? '',
      }
    : null

  // banner ภาพรวมมีไว้ตอน "ยังไม่แตะที่อยู่เลย" เท่านั้น — พอมีสัญญาณรายช่องแล้วต้องหลบ
  // ไม่งั้นข้อความเตือนซ้ำ 2 ที่พร้อมกันแล้วแย่ง attention จากจุดที่ต้องแก้จริง
  const showAddressBanner =
    needsShipping &&
    !addr?.line1?.trim() &&
    !localityStatus.hasAnyData &&
    !line1Error &&
    !localitySubmitError

  const selectCustomer = (c: CustomerResult) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    setSelected(c)
    setIsNewCustomer(false)
    setValue('buyerContact', c.contact)
    setValue('buyerName', c.name ?? '')
    setCustOpen(false)
  }

  /**
   * "ใช้คำที่พิมพ์เป็นลูกค้าใหม่"
   *
   * 🛑 เดิมเขียนว่า `if (/^\d/.test(q)) setValue('buyerContact', q)` = ยัด **ค่าดิบทั้งดุ้น**
   * ลงช่องเบอร์ ⇒ `"0 8 6 5 3 5 2960"` เข้าฟอร์มแล้วไปเด้งตอนกดบันทึกท้ายสุด หลังร้าน
   * กรอกที่อยู่/สินค้าครบแล้ว (user report 2026-08-21)
   *
   * ตอนนี้ค่าที่เขียนลงช่องเบอร์ต้องผ่านเกณฑ์เดียวกับด่านบันทึกเสมอ — ชีตไม่แสดงปุ่มนี้
   * ให้กับค่าที่แก้ได้ด้วย chip อยู่แล้ว (FR-CUS-E1-07) นี่คือด่านชั้นสองกันเรียกจากที่อื่น
   */
  const useNewCustomer = (q: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    setSelected(null)
    setIsNewCustomer(true)
    if (MOBILE_PHONE_RE.test(q)) setValue('buyerContact', q)
    else setValue('buyerName', q)
    setCustOpen(false)
  }

  // เช็ก DB ว่าเบอร์นี้เป็นลูกค้าเก่าไหม → โชว์ badge (ใช้หลัง paste เติมเบอร์ให้)
  const lookupExistingCustomer = async (phone: string) => {
    if (phone.trim().length < 2) return
    try {
      const res = await fetch(`/api/orders/customers?q=${encodeURIComponent(phone.trim())}`)
      if (!res.ok) return
      const list: CustomerResult[] = await res.json()
      const match = list.find((c) => c.contact === phone.trim())
      if (match) {
        setSelected(match)
        setIsNewCustomer(false)
      } else {
        setIsNewCustomer(true) // paste เบอร์ที่ไม่มีในระบบ → ลูกค้าใหม่
      }
    } catch {
      /* เงียบ — เป็น enhancement */
    }
  }

  const applyPaste = (p: ParsedOrderMessage) => {
    setSelected(null)
    if (p.name) setValue('buyerName', p.name)
    if (p.phone) {
      setValue('buyerContact', p.phone)
      void lookupExistingCustomer(p.phone) // เช็กลูกค้าเก่าจากเบอร์ที่ paste มา
    }
    if (p.addressLine) setValue('shippingAddress.line1', p.addressLine)
    if (p.subdistrict) setValue('shippingAddress.subdistrict', p.subdistrict)
    if (p.district) setValue('shippingAddress.district', p.district)
    if (p.province) setValue('shippingAddress.province', p.province)
    if (p.postcode) setValue('shippingAddress.postcode', p.postcode)
    setPasteOpen(false)
  }

  /**
   * กระจายข้อความจากแชทให้ทันทีที่ฟอร์มเปิด (user สั่ง 2026-08-04 — กดค้างบนข้อความ → สร้างคำสั่งซื้อ)
   *
   * รอบเดียวตอน mount: ref กันไม่ให้รันซ้ำเมื่อ component re-render (setValue ทำให้ re-render เอง)
   * และไม่ผูกกับค่า prop ที่เปลี่ยนทีหลัง — ถ้าร้านแก้ค่าในฟอร์มแล้วมี re-render ห้ามเขียนทับของที่พิมพ์
   *
   * ครบ/ไม่ครบตัดสินด้วย lib/shipping-address-status.ts (SSOT เดียวกับที่ปุ่มที่อยู่ใช้ ซึ่งตรงกับ
   * เงื่อนไขจริงของ createOrder) — ขาดช่องบังคับ = เปิดชีตกระจายให้พร้อมข้อความตั้งต้น ให้ร้านแก้
   * หรือก๊อปข้อความอื่นมาต่อได้ทันที ไม่ใช่ปล่อยให้ไปเจอ error ตอนกดบันทึก
   */
  const prefillDoneRef = useRef(false)
  useEffect(() => {
    const text = prefillParseText?.trim()
    if (!text || prefillDoneRef.current) return
    prefillDoneRef.current = true
    const parsed = parseOrderMessage(text)
    applyPaste(parsed)
    setPrefilledFromChat(true)
    // ที่อยู่ครบพอบันทึกไหม — ใช้ผล parse ตรง ๆ ไม่รอค่าจากฟอร์ม (setValue ยังไม่ propagate ในรอบนี้)
    const status = getLocalityStatus(
      {
        line1: parsed.addressLine,
        subdistrict: parsed.subdistrict,
        district: parsed.district,
        province: parsed.province,
        postcode: parsed.postcode,
      },
      false,
    )
    if (!parsed.addressLine?.trim() || status.state !== 'complete') {
      setPasteInitialText(text)
      setPasteOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillParseText])

  const applyLocality = (loc: SelectedLocality) => {
    setValue('shippingAddress.subdistrict', loc.subdistrict)
    setValue('shippingAddress.district', loc.district)
    setValue('shippingAddress.province', loc.province)
    setValue('shippingAddress.postcode', loc.postcode)
    setAddrOpen(false)
  }

  return (
    <>
      {/* header: ลูกค้า (title เด่น) + badge ลูกค้าเก่า + ปุ่มกระจายที่อยู่ (paste) */}
      {/* แถบบอกว่าค่าในฟอร์มมาจากข้อความในแชท ไม่ใช่โผล่มาเอง (user สั่ง 2026-08-04) —
          ต้องมีเพราะค่าถูกเติมให้ตอนเปิดฟอร์ม ถ้าไม่บอกเลยร้านจะไม่รู้ว่าควรตรวจอะไร และ parser
          พลาดได้เสมอ. ไม่ใช้ success/เขียว: "เติมให้แล้ว" ไม่ใช่ "ยืนยันแล้วว่าถูก" (Verified-Means-Green) */}
      {prefilledFromChat && (
        <div className="bg-info/10 text-info-ink mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
          <Icon icon="info-circle" className="mt-0.5 size-4 shrink-0" />
          <span>เติมชื่อ เบอร์ และที่อยู่จากข้อความในแชทให้แล้ว — ตรวจอีกครั้งก่อนบันทึก</span>
        </div>
      )}
      <div className="mb-3 flex items-center gap-2">
        <Icon icon="user" className="size-5 text-primary" />
        <h2 className="text-base font-bold text-dark">ลูกค้า</h2>
        {selected && (
          <span className="badge badge-label bg-success/15 text-success text-2xs font-semibold">
            <Icon icon="user-check" className="text-xs" />
            ลูกค้าเก่า · {selected.orderCount} ออเดอร์
          </span>
        )}
        {!selected && isNewCustomer && (
          <span className="badge badge-label bg-info/15 text-info text-2xs font-semibold">
            <Icon icon="user-plus" className="text-xs" />
            ลูกค้าใหม่
          </span>
        )}
        <button
          type="button"
          onClick={() => setPasteOpen(true)}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
        >
          <Icon icon="clipboard" className="size-4" />
          กระจายที่อยู่
        </button>
      </div>

      {/* ชื่อ */}
      <div className="mb-2.5">
        {/* ดาวแดง: ฟอร์มนี้บังคับชื่อจริง (Yup `buyerName.required()` ใน OrderCreateForm) — เดิม
            ไม่ติดดาวเพราะอ่านจาก CreateOrderSchema ฝั่ง backend ที่เป็น optional แล้วสรุปว่า
            "ไม่บังคับ" ผลคือจอบอกตรงข้ามกับกฎที่บล็อกการบันทึกจริง (impeccable critique P0
            2026-08-07; user เคาะให้ "บังคับ" เพราะชื่อมีผลกับการตามหาลูกค้าภายหลัง) */}
        <label htmlFor="cq-buyer-name" className="form-label">
          ชื่อลูกค้า<span className="ms-0.5 text-danger">*</span>
        </label>
        {/* name + ref ไม่ใช่ของประดับ: onInvalid เลื่อนจอด้วย querySelector([name=...]) และ
            react-hook-form ย้ายโฟกัสให้เองผ่าน ref — ไม่มีสองอย่างนี้ = กดบันทึกไม่ผ่านแล้วจอ
            ไม่ขยับเลยทั้งที่ error ขึ้นอยู่สูงกว่าจอไป 2 หน้าจอ (critique P1 2026-08-07) */}
        <input
          id="cq-buyer-name"
          name="buyerName"
          ref={nameField.ref}
          type="text"
          placeholder="ชื่อลูกค้า"
          className="form-input"
          value={nameField.value ?? ''}
          onChange={(e) => {
            setSelected(null)
            setIsNewCustomer(false)
            nameField.onChange(e)
          }}
          onBlur={nameField.onBlur}
        />
        {errors.buyerName?.message && <p className="mt-1 text-xs text-danger">{String(errors.buyerName.message)}</p>}
      </div>

      {/* เบอร์ — พิมพ์ (หรือ paste) → debounce → เปิด sheet ค้นหา/เพิ่มลูกค้า (รวมกรณีเปลี่ยนเบอร์หลังเลือกแล้ว) */}
      <div className="mb-2.5">
        {/* เบอร์โทร = required เสมอไม่มีเงื่อนไข (CreateOrderSchema.buyerContact ไม่ใช่ v.optional)
            ชื่อลูกค้าก็ติดดาวเช่นกัน: backend ปล่อยเป็น optional แต่ **ฟอร์มนี้บังคับ** ผ่าน Yup
            ดาวจึงต้องสะท้อนกฎที่บล็อกผู้ใช้จริง ไม่ใช่กฎที่หลวมที่สุดในระบบ (แก้ 2026-08-07) */}
        <label htmlFor="cq-buyer-contact" className="form-label">
          เบอร์โทร<span className="ms-0.5 text-danger">*</span>
        </label>
        <input
          id="cq-buyer-contact"
          name="buyerContact"
          ref={contactField.ref}
          type="text"
          inputMode="tel"
          autoComplete="off"
          placeholder="พิมพ์เบอร์ → ค้นหาลูกค้า"
          aria-describedby={hintVisible ? 'cq-buyer-contact-hint' : undefined}
          className={`form-input ${contactErrorMessage ? 'is-invalid' : ''}`}
          value={contactField.value ?? ''}
          onChange={(e) => {
            setSelected(null)
            setIsNewCustomer(false)
            contactField.onChange(e)
            triggerCustomerSearch(e.target.value)
          }}
          onBlur={contactField.onBlur}
        />
        {/* สล็อตเดียวใต้ช่อง — chip / คำเตือน / error เลือกกันเองในตัว component
            🛑 ห้ามครอบด้วยเทอร์นารีอีก: เงื่อนไขที่จะใช้ครอบคือตัวเดียวกับที่ component เช็คภายใน
            (ไม่มีผลกับภาพ) แต่ทำให้ live region ไม่ประกาศ และทำให้ error ตอนกดบันทึกหายไปทั้งหมด */}
        <PhoneSuggestHint
          id="cq-buyer-contact-hint"
          value={contactField.value ?? ''}
          onPick={applyPhoneSuggestion}
          size="mobile"
          errorMessage={contactErrorMessage}
        />
      </div>

      {/* วิธีส่งมอบ — ปุ่มคู่ "จัดส่ง | นัดรับ" (feature 00062 U15, เฉพาะร้าน ONLINE_SALES) */}
      {showDeliveryToggle && (
        <div className="mb-2.5">
          <span className="mb-2 block text-sm font-semibold text-default-700">วิธีส่งมอบ</span>
          <DeliveryModeToggle control={control} />
          {/* text-default-400 บรรทัดเดียว ไม่ใช่ callout (UX-Design-Spec §A1) — เตือนเชิงข้อมูล
              ไม่ใช่คำเตือนที่ต้องแย่งความสนใจแบบ showAddressBanner ด้านล่าง */}
          {isPickup && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-default-400">
              <Icon icon="info-circle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              ลูกค้ามารับเองที่ร้าน — ไม่ต้องกรอกที่อยู่จัดส่ง
            </p>
          )}
        </div>
      )}

      {/* ที่อยู่ (ไม่ใช่ STOREFRONT) */}
      {showAddress && (
        <>
          {/* เตือนเชิงรุก: ยังไม่แตะที่อยู่เลย + ออเดอร์ต้องจัดส่ง → บอกภาพรวมก่อนที่จะมีอะไรให้ชี้เฉพาะจุด */}
          {showAddressBanner && (
            <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-warning">
              <Icon icon="alert-triangle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="text-xs font-medium">
                ออเดอร์นี้ต้องจัดส่ง — กรอกที่อยู่ปลายทางให้ครบก่อนบันทึก (ที่อยู่ / จังหวัด / รหัสไปรษณีย์)
              </p>
            </div>
          )}
          <div className="mb-2.5">
            {/* ดาวแดงคงเงื่อนไข needsShipping ไว้เหมือนเดิม — ตั้งแต่ 2026-08-10 ทั้งบล็อกโผล่เฉพาะตอน
                needsShipping อยู่แล้ว เงื่อนไขนี้จึงเป็นจริงเสมอในทางปฏิบัติ แต่ปล่อยไว้เพื่อให้ดาว
                ผูกกับ "กฎที่บังคับจริง" ไม่ใช่ผูกกับการมีอยู่ของ JSX (ถ้าวันหนึ่งมีคนคืนบล็อกให้โผล่
                กว้างกว่านี้อีก ดาวจะไม่โกหกทันที)
                ช่องที่ติดดาวตรงกับ SSOT lib/shipping-address-status.ts เป๊ะ: line1 + จังหวัด + รหัสไปรษณีย์
                ตำบล/อำเภอ ไม่บล็อกการบันทึก จึงไม่ติดดาว (ตรงกับ CartPanel.tsx:428/432) */}
            <label htmlFor="cq-addr-line1" className="form-label">
              บ้านเลขที่ / หมู่ / ถนน{needsShipping && <span className="ms-0.5 text-danger">*</span>}
            </label>
            <input
              id="cq-addr-line1"
              type="text"
              placeholder="เช่น 91 ม.7 ถ.พหลโยธิน"
              className={`form-input${line1Error ? ' is-invalid' : ''}`}
              aria-describedby={line1Error ? 'cq-addr-line1-err' : undefined}
              value={line1Field.value ?? ''}
              onChange={line1Field.onChange}
              onBlur={line1Field.onBlur}
            />
            {line1Error && (
              <p id="cq-addr-line1-err" className="mt-1 text-xs text-danger">{String(line1Error)}</p>
            )}
          </div>
          <div>
            {/* control เป็น <button> ไม่ใช่ input — <label htmlFor> ผูกกับปุ่มไม่ได้ตามสเปก HTML
                จึงใช้ aria-labelledby ชี้กลับมาที่ label แทน */}
            {/* ป้ายรวม 4 ช่องที่ requiredness ไม่เท่ากัน (จังหวัด+รหัสไปรษณีย์ บังคับ / ตำบล+อำเภอ ไม่บังคับ)
                control เป็นปุ่มเดียวไม่ใช่ 4 input จึงติดดาวได้แค่ระดับกลุ่ม — "ในกลุ่มนี้มีของบังคับอยู่"
                ส่วนที่ว่าขาดช่องไหนเป๊ะ ๆ ให้ inline error ข้างล่าง (localityStatus.missingRequired) เป็นคนบอก */}
            <span id="cq-locality-label" className="form-label block">
              ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์{needsShipping && <span className="ms-0.5 text-danger">*</span>}
            </span>
            <button
              type="button"
              aria-labelledby="cq-locality-label"
              aria-describedby={localityStatus.state === 'incomplete' ? 'cq-locality-err' : undefined}
              onClick={() => setAddrOpen(true)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left ${
                localityStatus.state === 'incomplete' ? 'border-danger/60 bg-danger/5' : 'border-default-300'
              }`}
            >
              <Icon
                icon="map-pin"
                className={`size-4 shrink-0 ${
                  localityStatus.state === 'incomplete'
                    ? 'text-danger'
                    : localityStatus.state === 'complete'
                      ? 'text-primary'
                      : 'text-default-400'
                }`}
              />
              {/* ป้ายว่าง ๆ บอกสิ่งที่จะได้ ไม่ใช่ท่าที่ต้องทำ — ไอคอนแว่นขยายท้ายแถวบอกอยู่แล้วว่าค้นหาได้
                  ("แตะเพื่อเลือกที่อยู่ (พิมพ์ค้นหา/เลือก)" เดิมอธิบายวิธีใช้ซ้ำกับสิ่งที่ตาเห็น) */}
              {locality ? (
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold text-dark">
                    ต.{locality.subdistrict || '—'} · อ.{locality.district || '—'}
                  </span>
                  <span className="block text-xs text-default-500">
                    {locality.province || '—'} · {locality.postcode || '—'}
                  </span>
                </span>
              ) : (
                <span className="flex-1 text-sm text-default-400">เลือกตำบล / อำเภอ / จังหวัด</span>
              )}
              <Icon icon="search" className="size-4 shrink-0 text-default-400" />
            </button>
            {/* ยังไม่ได้เลือกอะไรเลย (กดบันทึกบนฟอร์มว่าง) ต้องพูดคนละแบบกับ "เลือกมาแล้วแต่ขาดบางช่อง" */}
            {localityStatus.state === 'incomplete' && (
              <p id="cq-locality-err" className="mt-1 text-xs text-danger">
                {localityStatus.hasAnyData
                  ? `ยังขาด${localityStatus.missingRequired.join('และ')} — เลือกให้ครบก่อนบันทึก`
                  : 'ยังไม่ได้เลือกที่อยู่ — เลือกก่อนบันทึก'}
              </p>
            )}
            {/* "บันทึกออเดอร์ได้" → "บันทึกได้เลย": ประโยคนี้ขึ้นได้ในร้านทุกประเภทที่มีสินค้าต้องจัดส่ง
                รวมร้านบริการที่ขายของด้วย ซึ่งไม่เรียกรายการของตัวเองว่า "ออเดอร์" (ORDER_VOCAB)
                ส่วนคำว่า "พัสดุ" ยังตรงบริบทเสมอ เพราะบรรทัดนี้ขึ้นเฉพาะตอน needsShipping */}
            {localityStatus.recommendedGap && (
              <p className="mt-1 text-xs text-warning">ยังไม่มีตำบล/อำเภอ — บันทึกได้เลย แต่ต้องเติมก่อนเปิดพัสดุ</p>
            )}
          </div>
        </>
      )}

      <CustomerSearchSheet
        open={custOpen}
        initialQuery={custQuery}
        onSelect={selectCustomer}
        onUseNew={useNewCustomer}
        onClose={() => setCustOpen(false)}
      />
      {/* key={pasteOpen} → remount ทุกครั้งที่เปิด: text/showBubble เริ่มสด ไม่ต้อง setState ใน effect */}
      <PasteParseSheet
        key={String(pasteOpen)}
        open={pasteOpen}
        initialText={pasteInitialText}
        onApply={applyPaste}
        onClose={() => setPasteOpen(false)}
      />
      <AddressSearchSheet open={addrOpen} current={locality} onSelect={applyLocality} onClose={() => setAddrOpen(false)} />
    </>
  )
}
