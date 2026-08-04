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
import type { ShipmentContextJson } from '@/lib/iship/context'

type Method = 'MANUAL' | 'ISHIP' | 'ISHIP_LINK'

/** id คงที่ — ปุ่มใน footer อยู่นอก <form> จึงต้องอ้างผ่าน attribute form= */
const MANUAL_FORM_ID = 'shipment-manual-form'
const ISHIP_FORM_ID = 'shipment-iship-form'

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
}

const SEGMENTS: { value: Method; label: string; icon: string }[] = [
  { value: 'MANUAL', label: 'ส่งเอง', icon: 'edit' },
  { value: 'ISHIP', label: 'สร้างพัสดุ iShip', icon: 'package-export' },
  { value: 'ISHIP_LINK', label: 'เลือกจาก iShip', icon: 'link' },
]

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
}: ShipmentEntryModalProps) {
  const canUseIship = mode === 'create' && ishipContext !== null
  const [method, setMethod] = useState<Method>(hasIshipShipment ? 'ISHIP' : 'MANUAL')
  // ฝั่ง MANUAL รายงานผ่าน onSubmittingChange ของ ShipForm ส่วนฝั่ง iShip รายงานมาใน
  // panelFooter.busy — สองเส้นนี้รวมกันเป็น "กำลังส่งอยู่" ที่ใช้กันปิดโมดัล
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [panelFooter, setPanelFooter] = useState<ShipmentFooterSpec | null>(null)
  const segRefs = useRef<(HTMLButtonElement | null)[]>([])

  const busy = manualSubmitting || panelFooter?.busy === true

  // reset state ทุกครั้งที่เปิดใหม่ — กันค่าค้างจากรอบก่อน (เช่นเปิด create ของออเดอร์หนึ่งแล้วปิด
  // แล้วเปิด edit ของอีกออเดอร์)
  useEffect(() => {
    if (open) {
      setMethod(hasIshipShipment ? 'ISHIP' : 'MANUAL')
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

  const showManualForm = mode === 'edit' || method === 'MANUAL' || !canUseIship
  const showSegmented = mode === 'create' && canUseIship && !hasIshipShipment

  /**
   * หัวโมดัลบอกสิ่งที่กำลังทำอยู่จริง ไม่ใช่คำเดียวตายตัว — เดิมเขียน "แจ้งเลขพัสดุ" ค้างไว้
   * ทั้งที่เนื้อข้างในสลับได้ 4 แบบ รวมถึงหน้าสถานะของพัสดุที่เปิดไปแล้ว (หัวจึงขัดกับเนื้อ)
   */
  const title =
    mode === 'edit'
      ? 'แก้ไขเลขพัสดุ'
      : hasIshipShipment
        ? 'สถานะพัสดุ iShip'
        : showManualForm
          ? 'แจ้งเลขพัสดุ'
          : method === 'ISHIP_LINK'
            ? 'ผูกพัสดุที่เปิดไว้แล้ว'
            : 'สร้างพัสดุ iShip'

  /**
   * คำอธิบายเหลือเฉพาะกรณีที่เนื้อข้างในยังไม่ได้อธิบายตัวเอง — เดิมมีประโยคเดียวครอบทุกกรณี
   * ซึ่ง (ก) พูดผิดเมื่อ body แสดงสถานะพัสดุที่เปิดไปแล้ว แต่ยังเขียนว่า "ระบบจะเปิดพัสดุให้"
   * (ข) ซ้ำกับประโยคความหมายเดียวกันใน ShipmentLinkPanel คนละสำนวน ห่างกันไม่กี่พิกเซล
   * (ค) ใช้ text-default-400 = 2.46:1 ตกเกณฑ์ AA แม้กระทั่งเกณฑ์ตัวใหญ่ 3:1
   */
  const helper =
    mode === 'edit'
      ? 'แก้ไขขนส่งหรือเลขพัสดุที่แจ้งไปแล้ว — ผู้ซื้อจะเห็นเลขใหม่ทันทีที่บันทึก'
      : showManualForm
        ? 'ส่งของกับขนส่งเอง แล้วนำเลขพัสดุมากรอกที่นี่เพื่อแจ้งผู้ซื้อ'
        : method === 'ISHIP'
          ? 'ระบบจะเปิดพัสดุจริงกับขนส่งและออกใบปะหน้าให้ทันที'
          : null

  // ลูกศรซ้าย/ขวา + Home/End ตาม APG ของ radiogroup — คู่กับ roving tabindex ด้านล่าง
  // (มี tab stop เดียวทั้งกลุ่ม ไม่ใช่ 3 stop) ถ้าประกาศ role ถูกแต่ไม่ทำ keyboard ให้ครบ
  // คนใช้ screen reader จะได้ยินว่า "เลือก 1 จาก 3" แล้วกดลูกศรไม่ติด ซึ่งแย่กว่าไม่ประกาศ
  const onSegKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    let next = -1
    if (delta !== 0) next = (index + delta + SEGMENTS.length) % SEGMENTS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = SEGMENTS.length - 1
    if (next < 0) return
    e.preventDefault()
    setMethod(SEGMENTS[next].value)
    segRefs.current[next]?.focus()
  }

  const SEG = 'btn inline-flex flex-1 items-center justify-center gap-1.5 text-xs min-h-11'
  const segCls = (active: boolean) =>
    active
      ? `${SEG} bg-primary text-white border border-primary`
      : `${SEG} border border-default-300 bg-card text-default-700 hover:bg-default-50`

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
            : 'ยืนยันจัดส่ง'}
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

  return (
    <IShipModalShell
      title={title}
      onClose={dismiss}
      size="2xl"
      busy={busy}
      footer={footer}
      // ShipmentPanel มีเส้นคั่น border-b-8 เต็มความกว้างระหว่าง section และมี p-4 ในแต่ละบล็อก
      // ของตัวเอง ถ้า shell ใส่ px-5 ครอบอีกชั้น เส้นคั่นจะลอยมีขอบขาวสองข้างผิดจากที่ออกแบบไว้
      // → คุม padding เองตามเนื้อในที่กำลังแสดง
      bodyClassName={showManualForm ? 'px-5 py-4' : ''}
    >
      <div className={showManualForm ? 'flex flex-col gap-3' : ''}>
        {/* segmented เลือกวิธี — เฉพาะ create mode ที่ร้านเชื่อมต่อ iShip ไว้และยังไม่มีพัสดุ
            edit mode ต้องไม่มี segmented (แก้ได้เฉพาะ MANUAL อยู่แล้ว ไม่ใช่จังหวะเลือกวิธีส่ง)

            flex + flex-1: เดิมเป็น inline-flex ไม่ยืด ปุ่ม 3 ตัวจึงกินราว 355px แต่กล่องเนื้อหา
            บนจอ 360px เหลือราว 296px = ล้นกรอบและปัดตามแนวนอนไม่ได้ (Impeccable critique 2026-08-04)

            radiogroup + roving tabindex: เดิมใช้ role="group" + aria-pressed ซึ่งประกาศว่าเป็น
            ปุ่มสลับอิสระ 3 ตัว ทั้งที่เป็นตัวเลือกที่เลือกได้ทีละอัน */}
        {showSegmented && (
          <div
            className={`flex ${showManualForm ? '' : 'px-5 pt-4'}`}
            role="radiogroup"
            aria-label="เลือกวิธีจัดส่ง"
          >
            {SEGMENTS.map((seg, i) => (
              <button
                key={seg.value}
                ref={(el) => {
                  segRefs.current[i] = el
                }}
                type="button"
                role="radio"
                aria-checked={method === seg.value}
                tabIndex={method === seg.value ? 0 : -1}
                onKeyDown={(e) => onSegKeyDown(e, i)}
                onClick={() => setMethod(seg.value)}
                // กันสลับโหมดระหว่างที่อีกฝั่งกำลังยิงคำขออยู่ — การสลับจะ unmount component
                // ที่กำลังรอ response ของคำขอที่เปิดพัสดุจริงและคิดเงินไปแล้ว
                disabled={busy}
                className={`${segCls(method === seg.value)} ${
                  i === 0 ? 'rounded-e-none' : i === SEGMENTS.length - 1 ? '-ms-px rounded-s-none' : '-ms-px rounded-none'
                } disabled:opacity-60`}
              >
                <Icon icon={seg.icon} className="text-sm" aria-hidden="true" />
                {seg.label}
              </button>
            ))}
          </div>
        )}

        {/* text-default-700 (4.69:1) — ค่าเดิม text-default-400 วัดได้ 2.46:1 ตก AA */}
        {helper && (
          <p className={`mb-0 text-xs text-default-700 ${showManualForm ? '' : 'px-5 pt-3'}`}>
            {helper}
          </p>
        )}

        {showManualForm ? (
          <ShipForm
            publicToken={orderToken}
            initialTrackingNo={initialTrackingNo}
            initialProvider={initialProvider}
            mode={mode}
            alwaysOpen
            formId={MANUAL_FORM_ID}
            hideActions
            onSuccess={handleSuccess}
            onCancel={dismiss}
            onSubmittingChange={setManualSubmitting}
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
          />
        )}
      </div>
    </IShipModalShell>
  )
}
