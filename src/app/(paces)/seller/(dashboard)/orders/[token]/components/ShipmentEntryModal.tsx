'use client'

/**
 * ShipmentEntryModal — โมดัลแจ้ง/แก้เลขพัสดุ (task T9, S-9/S-12)
 *
 * เดิม ShippingCard ฝังฟอร์มไว้ในเนื้อหาหน้า → ปุ่ม submit สีน้ำเงินกลายเป็นน้ำเงินตัวที่ 2
 * แข่งกับปุ่ม primary บนแถบ action (ผิด One Voice, ย้อนกลับไปเป็นอาการ "ปุ่มกระจาย" ที่ v5 ตั้งใจแก้)
 * — ดู docs/superpowers/specs/2026-07-31-seller-order-detail-v5-design.md §3
 *
 * 2 mode:
 *   'create' — ปุ่ม "แจ้งเลขพัสดุ" (สถานะ PENDING) มี segmented [ส่งเอง | สร้างพัสดุ iShip | เลือกจาก iShip]
 *   'edit'   — ปุ่ม "แก้ไขเลขพัสดุ" (สถานะ SHIPPED + MANUAL เท่านั้น) ไม่มี segmented ยิง PATCH
 *
 * ── 2026-08-04: รื้อ shell ตาม Impeccable critique (คะแนน 20/40, P0 สองข้อ) ──────────
 *
 * เดิมไฟล์นี้เขียน dialog/backdrop/focus-trap/Escape เองทั้งหมด แล้วได้ผลลัพธ์ที่พังกว่า
 * shell กลางที่มีอยู่แล้วห่างไปไม่กี่ไฟล์ (IShipModalShell) ในทุกแกน:
 *
 *   1. `flex items-center` บน container ที่ `overflow-y-auto` → เมื่อเนื้อหาสูงเกินจอ
 *      (แท็บ "สร้างพัสดุ iShip" สูงราว 1,600px) การจัดกึ่งกลางดันเนื้อล้นออกทั้งบนและล่าง
 *      แต่ scrollTop ต่ำกว่า 0 ไม่ได้ → **หัวโมดัลถูกตัดและเลื่อนกลับไปดูไม่ได้เลย**
 *   2. panel ไม่มี max-h / ไม่มี scroll ในตัว / ไม่มี footer → ปุ่มที่เสียเงินจริงเป็น element
 *      ตัวสุดท้ายของคอลัมน์ยาว ร้านต้องปัดหาทุกครั้ง
 *   3. `sm:max-w-md` ตันที่ 448px ตั้งแต่ 640px ขึ้นไปจนถึงจอ 1920px
 *   4. ไม่มี safe-area บนมือถือ, ไม่มี `transform-gpu` (AddressSearchSheet ที่เป็น position:fixed
 *      จึงยึด viewport แทนกรอบโมดัล)
 *   5. effect focus-trap ผูก dependency `[open, submitting]` และ cleanup เรียกคืนโฟกัสทุกครั้ง
 *      → โฟกัสเด้งออกนอกโมดัล 2 ครั้งต่อการกดบันทึก 1 ครั้ง ซึ่งเป็นบั๊กชนิดเดียวกับที่
 *      IShipModalShell เขียนคอมเมนต์บันทึกไว้ว่าเคยโดน user report มาแล้ว (2026-07-29)
 *
 * ทั้ง 5 ข้อหายไปพร้อมกันด้วยการใช้ shell กลาง ไม่ใช่ด้วยการไล่แก้ทีละข้อที่นี่
 *
 * P0 ข้อที่สอง — **กันปิดโมดัลระหว่างคำขอที่เสียเงินจริง**: เดิม `submitting` มีแต่ ShipForm
 * (ฝั่ง MANUAL) เท่านั้นที่รายงานผ่าน onSubmittingChange ส่วนฝั่ง iShip ไม่มีช่องรายงานเลย
 * (คอมเมนต์เดิมบันทึกไว้ว่าเป็น OOS-7) — แต่การกด Escape ระหว่าง POST เปิดพัสดุไม่ได้ยกเลิก
 * คำขอ พัสดุถูกเปิดและถูกคิดเงินไปแล้ว ร้านแค่เสียเลขพัสดุกับใบปะหน้าไปเปล่า ๆ ตอนนี้ทุก branch
 * รายงานสถานะขึ้นมาทาง ShipmentFooterSpec.busy เส้นเดียวกับที่ใช้วาดปุ่ม footer
 *
 * ── 00084: ผู้ให้บริการที่สอง (Flash บัญชีของร้านเอง) ──────────────────────────────
 *   ร้านเชื่อมเจ้าเดียว = segmented 3 ช่องชุดเดียว (iShip คงเดิมทุกประการ; Flash = ส่งเอง / สร้างพัสดุ Flash /
 *   ผูกเลขพัสดุ Flash) · ร้านเชื่อมทั้งสอง = สองชั้น (ชั้น 1 เลือกผู้ให้บริการ ชั้น 2 เลือกสร้าง/ผูก) และ **ไม่เลือก
 *   ค่าเริ่มต้นให้** (DD-5/BR-FLASH-21) · ตัวตัดสินทั้งหมดอยู่ใน lib/shipping/flash-order-ui.ts (มีเทส)
 *   มีพัสดุ live ของเจ้าใดอยู่แล้ว → ข้ามตัวเลือก เข้าหน้าสถานะของใบนั้นทันที · Flash NEEDS_REVIEW ล็อกแถบเลือก
 *   (ต้องผูก/เปิดใหม่ให้จบก่อน ไม่เปิดทางให้เสียเงินซ้ำ)
 *
 * Base (เปลือกโมดัล — bottom-sheet บนมือถือ / modal กลางจอบน desktop, focus trap, sticky footer):
 *   src/components/safepay/iship/IShipModalShell.tsx
 * Base (segmented ที่ใช้ flex-1 จึงไม่ล้นกรอบบนจอ 360px):
 *   src/app/(paces)/seller/(chat)/_components/ShipmentDraftPanel.tsx
 *
 * เนื้อฟอร์มจริง (validate/submit/error) ไม่เขียนซ้ำที่นี่ — reuse ShipForm (MANUAL) และ
 * ShipmentPanel (iShip, bare) ที่มีอยู่แล้วตรง ๆ ปุ่มใน footer ยิง submit กลับเข้าฟอร์ม
 * เหล่านั้นผ่าน attribute `form=` ของ HTML ไม่ได้ส่ง handler ขึ้นมาเก็บไว้ (ดูเหตุผลใน
 * src/components/safepay/iship/shipment-footer.ts)
 *
 * หมายเหตุขอบเขต (iShip branch): ShipmentPanel/ShipmentCreateForm มี router.refresh() ของตัวเอง
 * อยู่แล้วก่อนหน้านี้ — ไฟล์นี้เองไม่เรียก router.refresh() เลยสักบรรทัด (import ไม่มี useRouter
 * ด้วยซ้ำ) ตาม spec "ห้ามเรียก router.refresh() เองในโมดัล"
 */

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import IShipModalShell from '@/components/safepay/iship/IShipModalShell'
import type { ShipmentFooterSpec } from '@/components/safepay/iship/shipment-footer'
import ShipForm from './ShipForm'
import ShipmentPanel from './ShipmentPanel'
import FlashPanel from '@/components/safepay/flash/FlashPanel'
import { NOTICE_BOX } from '@/components/safepay/iship/tone'
import type { ShipmentContextJson } from '@/lib/iship/context'
import type { FlashPanelJson } from '@/services/flash.service'
import {
  PROVIDER_CHOICES,
  entryMode,
  flashOffered,
  initialMethod,
  isLinkMethod,
  methodFor,
  providerOf,
  shipmentLock,
  showEntrySegmented,
  singleTierSegments,
  type EntryMethod,
  type EntryProvider,
  type EntrySegment,
} from '@/lib/shipping/flash-order-ui'

type Method = EntryMethod

/** id คงที่ — ปุ่มใน footer อยู่นอก <form> จึงต้องอ้างผ่าน attribute form= */
const MANUAL_FORM_ID = 'shipment-manual-form'
const ISHIP_FORM_ID = 'shipment-iship-form'
const FLASH_FORM_ID = 'shipment-flash-form'

const SEG = 'btn inline-flex flex-1 items-center justify-center gap-1.5 text-xs min-h-11'
/** เจ้าเดียว: ปุ่มที่เลือกเป็นสีทึบตามเดิม · สองชั้น: tint (ปุ่มทึบมีได้ใบเดียวต่อโมดัล = ปุ่มใน footer) */
const segCls = (active: boolean, tint: boolean) =>
  active
    ? tint
      ? `${SEG} bg-primary/15 text-primary-ink border border-primary`
      : `${SEG} bg-primary text-white border border-primary`
    : `${SEG} border border-default-300 bg-card text-default-700 hover:bg-default-50`

interface SegItem<T extends string> {
  value: T
  label: string
  sub?: string
  icon: string
}

/**
 * radiogroup + roving tabindex (APG) — ลูกศร/Home/End ตามที่ประกาศ role ไว้
 * ประกาศระดับ module (ไม่ใช่ใน render) เพื่อไม่ให้สร้างคอมโพเนนต์ใหม่ทุกครั้งที่ render
 */
function SegGroup<T extends string>({
  label,
  items,
  value,
  onChange,
  disabled,
  tint,
}: {
  label: string
  items: SegItem<T>[]
  value: T | null
  onChange: (v: T) => void
  disabled: boolean
  tint: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    let next = -1
    if (delta !== 0) next = (index + delta + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(items[next].value)
    refs.current[next]?.focus()
  }
  // ยังไม่เลือกอะไร → ช่องแรกเป็น tab stop (มี tab stop เดียวทั้งกลุ่ม)
  const focusIdx = Math.max(0, items.findIndex((i) => i.value === value))
  return (
    <div className="flex" role="radiogroup" aria-label={label}>
      {items.map((seg, i) => (
        <button
          key={seg.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={value === seg.value}
          tabIndex={i === focusIdx ? 0 : -1}
          onKeyDown={(e) => onKeyDown(e, i)}
          onClick={() => onChange(seg.value)}
          // กันสลับโหมดระหว่างที่อีกฝั่งกำลังยิงคำขออยู่ — การสลับจะ unmount component
          // ที่กำลังรอ response ของคำขอที่เปิดพัสดุจริงและคิดเงินไปแล้ว
          disabled={disabled}
          className={`${segCls(value === seg.value, tint)} ${seg.sub ? 'flex-col py-1.5 leading-tight' : ''} ${
            i === 0 ? 'rounded-e-none' : i === items.length - 1 ? '-ms-px rounded-s-none' : '-ms-px rounded-none'
          } disabled:opacity-60`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={seg.icon} className="text-sm" aria-hidden="true" />
            {seg.label}
          </span>
          {seg.sub && <span className="text-2xs font-normal">{seg.sub}</span>}
        </button>
      ))}
    </div>
  )
}

const TIER2: SegItem<'CREATE' | 'LINK'>[] = [
  { value: 'CREATE', label: 'สร้างพัสดุ', icon: 'package-export' },
  { value: 'LINK', label: 'ผูกพัสดุที่มีอยู่', icon: 'link' },
]

interface ShipmentEntryModalProps {
  open: boolean
  onClose: () => void
  /** เรียกหลังบันทึกสำเร็จ (หลังโมดัลปิดไปแล้ว) — page เป็นคนสั่ง router.refresh() เอง (T11) */
  onSuccess?: () => void
  orderToken: string
  /** 'create' = ปุ่ม "แจ้งเลขพัสดุ" (PENDING, มี segmented) | 'edit' = ปุ่ม "แก้ไขเลขพัสดุ" (SHIPPED+MANUAL, ไม่มี segmented) */
  mode: 'create' | 'edit'
  /** context ของ iShip — null/undefined = ร้านไม่ได้เชื่อมต่อ (ใช้เฉพาะ mode='create') */
  ishipContext?: ShipmentContextJson | null
  /** true = มีพัสดุ iShip เปิดไว้แล้ว → เข้าโหมด iShip เลย ไม่ต้องให้เลือกซ้ำ (ใช้เฉพาะ mode='create') */
  hasIshipShipment?: boolean
  /** ค่าที่กรอกไว้แล้ว — prefill ตอน mode='edit' */
  initialTrackingNo?: string | null
  initialProvider?: string | null
  /** 00078 — ส่งมาเฉพาะบทบาทที่เห็นเงินได้ · ไม่ส่ง = ไม่วาดช่องค่าส่ง */
  showShipCost?: boolean
  initialOutboundShippingCost?: number | null
  /** 00084 — แผง Flash ของออเดอร์นี้ (server โหลด) · null = Flash ปิด/ไม่เกี่ยว (ร้าน iShip เห็นเหมือนเดิม) */
  flashPanel?: FlashPanelJson | null
  /** 00084 — เจ้าของร้าน (ปุ่มวางคีย์ใหม่ของใบ Flash) · ไม่ส่ง = ปิด */
  isOwner?: boolean
  /** 00085 — ผู้ดูถือ S1 (ปิดพัสดุมีปัญหา) · ไม่ส่ง = ปิด */
  canManageParcel?: boolean
}

export default function ShipmentEntryModal({
  open,
  onClose,
  onSuccess,
  orderToken,
  mode,
  ishipContext = null,
  hasIshipShipment = false,
  initialTrackingNo,
  initialProvider,
  showShipCost = false,
  initialOutboundShippingCost,
  flashPanel = null,
  isOwner = false,
  canManageParcel = false,
}: ShipmentEntryModalProps) {
  const canUseIship = mode === 'create' && ishipContext !== null
  // พัสดุล่าสุดของออเดอร์ (ทุกผู้ให้บริการ) — ตัวตัดสินว่าเข้าหน้าสถานะ/ตรวจสอบ หรือให้เลือกวิธี
  const currentShipment = flashPanel?.shipment ?? ishipContext?.shipment ?? null
  const lock = (() => {
    const l = shipmentLock(currentShipment)
    // prop เดิมของ iShip ยังชนะถ้าหน้าบอกว่ามีใบ live (พฤติกรรมเดิม)
    return l.kind === 'none' && hasIshipShipment ? ({ kind: 'live', provider: 'ISHIP' } as const) : l
  })()
  // ใบ Flash ที่ค้างอยู่ต้องเห็นได้แม้เลิกเชื่อมแล้ว (ไม่งั้นเปิดหน้าสถานะดูไม่ได้)
  const flashRelevant = mode === 'create' && (flashOffered(flashPanel?.flashState) || currentShipment?.provider === 'FLASH')
  const entry = mode === 'create' ? entryMode(canUseIship, flashRelevant) : 'manual-only'
  const startMethod = (): Method | null => {
    const m = initialMethod(entry, lock)
    // iShip ไม่ได้เชื่อมแล้ว (ใบเก่าค้าง) → ไม่มีฟอร์ม iShip ให้เข้า กลับไป "ส่งเอง" ตามเดิม
    return providerOf(m) === 'ISHIP' && !canUseIship ? 'MANUAL' : m
  }
  const [method, setMethod] = useState<Method | null>(startMethod)
  // ฝั่ง MANUAL รายงานผ่าน onSubmittingChange ของ ShipForm ส่วนฝั่ง iShip/Flash รายงานมาใน
  // panelFooter.busy — สองเส้นนี้รวมกันเป็น "กำลังส่งอยู่" ที่ใช้กันปิดโมดัล
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [panelFooter, setPanelFooter] = useState<ShipmentFooterSpec | null>(null)

  const busy = manualSubmitting || panelFooter?.busy === true

  // reset state ทุกครั้งที่เปิดใหม่ — กันค่าค้างจากรอบก่อน (เช่นเปิด create ของออเดอร์หนึ่งแล้วปิด
  // แล้วเปิด edit ของอีกออเดอร์)
  useEffect(() => {
    if (open) {
      setMethod(startMethod())
      setManualSubmitting(false)
      setPanelFooter(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderToken, mode])

  if (!open) return null

  const dismiss = () => {
    if (busy) return
    onClose()
  }

  const handleSuccess = () => {
    setManualSubmitting(false)
    onClose()
    onSuccess?.()
  }

  const provider = providerOf(method)
  const isLink = isLinkMethod(method)
  const showManualForm = mode === 'edit' || method === 'MANUAL' || entry === 'manual-only'
  const showSegmented = mode === 'create' && showEntrySegmented(entry, lock)
  // ร้านสองเจ้ายังไม่ได้เลือกใคร → ไม่มีเนื้อให้แสดง นอกจากคำชี้แจง (DD-5: ระบบไม่เลือกแทนร้าน)
  const awaitingChoice = !showManualForm && method === null

  /**
   * หัวโมดัลบอกสิ่งที่กำลังทำอยู่จริง ไม่ใช่คำเดียวตายตัว — เดิมเขียน "แจ้งเลขพัสดุ" ค้างไว้
   * ทั้งที่เนื้อข้างในสลับได้ 4 แบบ รวมถึงหน้าสถานะของพัสดุที่เปิดไปแล้ว (หัวจึงขัดกับเนื้อ)
   */
  const title =
    mode === 'edit'
      ? 'แก้ไขเลขพัสดุ'
      : lock.kind === 'live'
        ? lock.provider === 'FLASH'
          ? 'สถานะพัสดุ Flash'
          : 'สถานะพัสดุ iShip'
        : lock.kind === 'review'
          ? 'ตรวจสอบพัสดุ Flash'
          : showManualForm
            ? 'แจ้งเลขพัสดุ'
            : method === null
              ? 'เปิดพัสดุ'
              : method === 'ISHIP_LINK'
                ? 'ผูกพัสดุที่เปิดไว้แล้ว'
                : method === 'FLASH_LINK'
                  ? 'ผูกเลขพัสดุ Flash'
                  : method === 'FLASH'
                    ? 'สร้างพัสดุ Flash'
                    : 'สร้างพัสดุ iShip'

  /**
   * คำอธิบายเหลือเฉพาะกรณีที่เนื้อข้างในยังไม่ได้อธิบายตัวเอง — เดิมมีประโยคเดียวครอบทุกกรณี
   * ซึ่ง (ก) พูดผิดเมื่อ body แสดงสถานะพัสดุที่เปิดไปแล้ว แต่ยังเขียนว่า "ระบบจะเปิดพัสดุให้"
   * (ข) ซ้ำกับประโยคความหมายเดียวกันใน ShipmentLinkPanel คนละสำนวน ห่างกันไม่กี่พิกเซล
   * (ค) ใช้ text-default-400 = 2.46:1 ตกเกณฑ์ AA แม้กระทั่งเกณฑ์ตัวใหญ่ 3:1
   * (Flash ไม่มี helper: ฟอร์ม/แผงของ Flash บอกเรื่องค่าใช้จ่ายและการผูกไว้ในตัวเองแล้ว)
   */
  const helper =
    mode === 'edit'
      ? 'แก้ไขขนส่งหรือเลขพัสดุ เลขใหม่จะแจ้งลูกค้าตามจังหวะที่ตั้งไว้'
      : showManualForm
        ? 'ส่งของกับขนส่งเอง แล้วกรอกเลขพัสดุที่นี่ ออเดอร์จะอยู่ที่ "รอจัดส่ง" จนกว่าจะกด "จัดส่งแล้ว"'
        : method === 'ISHIP'
          ? 'ระบบจะเปิดพัสดุจริงกับขนส่งและออกใบปะหน้าให้ทันที'
          : null

  const pickProvider = (p: EntryProvider) => setMethod(methodFor(p, false))
  const pickAction = (a: 'CREATE' | 'LINK') => {
    if (provider && provider !== 'MANUAL') setMethod(methodFor(provider, a === 'LINK'))
  }

  const closeButton = (
    <button
      type="button"
      onClick={dismiss}
      disabled={busy}
      className="btn min-h-11 border border-default-300 bg-card text-sm text-default-700 hover:bg-default-50 disabled:opacity-60"
    >
      ปิด
    </button>
  )

  /**
   * footer ไม่เลื่อนตามเนื้อหา — ปุ่มหลักจึงอยู่ในสายตาและในระยะนิ้วโป้งเสมอ ไม่ว่าฟอร์ม
   * จะยาวแค่ไหน (ฝั่ง iShip ยาวราว 1,600px) ปุ่มยิง submit กลับเข้าฟอร์มผ่าน attribute form=
   * state ที่ไม่มีอะไรให้ยืนยัน (เลือกใบ / ดูสถานะพัสดุ) เหลือแค่ปุ่มปิดเต็มความกว้าง
   */
  const footer = showManualForm ? (
    <div className="flex gap-2">
      <button
        type="submit"
        form={MANUAL_FORM_ID}
        disabled={manualSubmitting}
        className="btn min-h-11 flex-1 bg-primary text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {manualSubmitting
          ? 'กำลังบันทึก...'
          : mode === 'edit'
            ? 'บันทึกการแก้ไข'
            : 'บันทึกเลขพัสดุ'}
      </button>
      {closeButton}
    </div>
  ) : panelFooter ? (
    <div className="flex gap-2">
      <button
        type="submit"
        form={panelFooter.formId}
        disabled={panelFooter.busy}
        className="btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-primary text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {panelFooter.busy ? (
          <Icon icon="tabler:loader-2" className="animate-spin text-base" aria-hidden="true" />
        ) : (
          <Icon icon={panelFooter.icon} className="text-base" aria-hidden="true" />
        )}
        {panelFooter.label}
      </button>
      {closeButton}
    </div>
  ) : (
    <button
      type="button"
      onClick={dismiss}
      disabled={busy}
      className="btn min-h-11 w-full border border-default-300 bg-card text-sm text-default-700 hover:bg-default-50 disabled:opacity-60"
    >
      ปิด
    </button>
  )

  /* ตัวเลือกวิธี — เฉพาะ create mode ที่ร้านเชื่อมผู้ให้บริการไว้และยังไม่มีพัสดุ live
     edit mode ต้องไม่มี segmented (แก้ได้เฉพาะ MANUAL อยู่แล้ว ไม่ใช่จังหวะเลือกวิธีส่ง)

     อยู่ในแถบ `tabs` ของ shell ซึ่งไม่เลื่อนตามเนื้อหา — แท็บ "สร้างพัสดุ iShip" สูงราว
     1,600px ถ้าตัวเลือกเลื่อนหายไปด้วย ร้านต้องปัดกลับขึ้นบนสุดก่อนถึงจะสลับวิธีส่งได้

     flex + flex-1: ปุ่ม 3 ตัวต้องไม่ล้นกรอบบนจอ 360px (เหลือราว 296px)
     radiogroup + roving tabindex: เลือกได้ทีละอัน (SegGroup) */
  const segmented = !showSegmented ? null : entry === 'both' ? (
    <div className="flex flex-col gap-2">
      <p className="text-default-700 mb-0 text-xs font-semibold">เปิดพัสดุกับใคร (เลือก 1)</p>
      <SegGroup
        label="เลือกผู้ให้บริการเปิดพัสดุ"
        items={PROVIDER_CHOICES}
        value={provider}
        onChange={pickProvider}
        disabled={busy}
        tint
      />
      {provider && provider !== 'MANUAL' && (
        <SegGroup
          label="เลือกวิธี"
          items={TIER2}
          value={isLink ? 'LINK' : 'CREATE'}
          onChange={pickAction}
          disabled={busy}
          tint
        />
      )}
    </div>
  ) : (
    <SegGroup
      label="เลือกวิธีจัดส่ง"
      items={singleTierSegments(entry === 'flash' ? 'flash' : 'iship') as EntrySegment[]}
      value={method}
      onChange={setMethod}
      disabled={busy}
      tint={false}
    />
  )

  // ใบ Flash ค้างอยู่แต่หน้าไม่ได้โหลดแผง Flash มา (เช่นปิดฟีเจอร์ไปแล้ว) → ประกอบแผงขั้นต่ำให้ดูสถานะได้
  const flashPanelEff: FlashPanelJson = flashPanel ?? {
    flashState: 'UNAVAILABLE',
    orderId: ishipContext?.orderId ?? '',
    shipment: currentShipment,
    activeElsewhere: null,
  }

  return (
    <IShipModalShell
      title={title}
      onClose={dismiss}
      size="2xl"
      busy={busy}
      tabs={segmented}
      footer={footer}
      // ShipmentPanel มีเส้นคั่น border-b-8 เต็มความกว้างระหว่าง section และมี p-4 ในแต่ละบล็อก
      // ของตัวเอง ถ้า shell ใส่ px-5 ครอบอีกชั้น เส้นคั่นจะลอยมีขอบขาวสองข้างผิดจากที่ออกแบบไว้
      // → คุม padding เองตามเนื้อในที่กำลังแสดง
      bodyClassName={showManualForm || awaitingChoice ? 'px-5 py-4' : ''}
    >
      <div className={showManualForm || awaitingChoice ? 'flex flex-col gap-3' : ''}>
        {/* text-default-700 (4.69:1) — ค่าเดิม text-default-400 วัดได้ 2.46:1 ตก AA
            helper ไม่ค้างไปกับ tabs โดยเจตนา: ปุ่มที่ active บอกอยู่แล้วตลอดเวลาว่าอยู่โหมดไหน
            และพื้นที่แนวตั้งบนมือถือคือทรัพยากรที่หายากที่สุดของหน้านี้ */}
        {helper && (
          <p className={`mb-0 text-xs text-default-700 ${showManualForm ? '' : 'px-5 pt-4'}`}>
            {helper}
          </p>
        )}

        {awaitingChoice ? (
          <div className={`rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.info}`}>
            <p className="mb-1.5 font-semibold">เลือกก่อนว่าจะเปิดพัสดุกับใคร</p>
            <ul className="mb-0 flex list-disc flex-col gap-1 ps-5">
              <li>Flash (บัญชีของร้านเอง) ใช้ราคาสัญญา บิลกับ Flash โดยตรง</li>
              <li>iShip เทียบราคาหลายขนส่ง บิลผ่าน iShip</li>
            </ul>
          </div>
        ) : showManualForm ? (
          <ShipForm
            publicToken={orderToken}
            initialTrackingNo={initialTrackingNo}
            initialProvider={initialProvider}
            showShipCost={showShipCost}
            initialOutboundShippingCost={initialOutboundShippingCost}
            mode={mode}
            alwaysOpen
            formId={MANUAL_FORM_ID}
            hideActions
            onSuccess={handleSuccess}
            onCancel={dismiss}
            onSubmittingChange={setManualSubmitting}
          />
        ) : provider === 'FLASH' || lock.kind === 'review' ? (
          // key = method: สลับสร้าง/ผูกแล้วต้อง mount ใหม่ ไม่งั้นโหมดข้างในค้างค่าเดิม
          <FlashPanel
            key={method ?? 'FLASH'}
            orderToken={orderToken}
            panel={flashPanelEff}
            isOwner={isOwner}
            initialLink={method === 'FLASH_LINK'}
            formId={FLASH_FORM_ID}
            onFooterChange={setPanelFooter}
            canManageParcel={canManageParcel}
          />
        ) : (
          // ShipmentPanel มีกรอบการ์ดของตัวเอง — ที่นี่ต้องการเฉพาะเนื้อใน จึงส่ง bare
          // key = method: สลับ segmented แล้วต้อง mount ใหม่ ไม่งั้นโหมดข้างในค้างค่าเดิม
          <ShipmentPanel
            key={method}
            orderToken={orderToken}
            context={ishipContext!}
            bare
            ishipMode={method === 'ISHIP_LINK' ? 'LINK' : 'CREATE'}
            formId={ISHIP_FORM_ID}
            onFooterChange={setPanelFooter}
            // 00084 §4.4 — แผงเทียบราคามีบล็อก Flash เฉพาะร้านสองเจ้า (ไม่พกค่าที่แก้ในฟอร์มข้ามไป: ฟอร์ม Flash โหลดจากออเดอร์เอง)
            onUseFlash={entry === 'both' ? () => setMethod('FLASH') : undefined}
            canManageParcel={canManageParcel}
          />
        )}
      </div>
    </IShipModalShell>
  )
}
