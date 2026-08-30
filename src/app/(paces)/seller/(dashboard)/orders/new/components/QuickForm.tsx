'use client'

/**
 * QuickForm — ฟอร์มสร้างออเดอร์ "quick" สำหรับ < lg (มือถือ+แท็บเล็ต)
 *
 * Base: mockup docs/superpowers/specs/2026-07-06-quick-create-order.html (frame "Mobile · สร้างออเดอร์")
 *   — inline scroll, แต่ละ section คั่นด้วยแถบเทา full-bleed (ไม่ใช่ card); ลำดับ customer-first
 * Base: FullscreenPageHeader.tsx (-mx-4 md:-mx-8 bleed pattern)
 *
 * ลำดับ: ลูกค้า → ช่องทาง/ชำระเงิน → สินค้า → เพิ่มเติม; footer = QuickSummaryPanel (collapsible)
 */

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useWatch } from 'react-hook-form'
import type { Control, FieldErrors, UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import { orderNeedsShippingAddress, toOrderItemShippingKind } from '@/lib/shipping-address-status'
import QuickLineItem from './QuickLineItem'
import ProductPickerSheet from './ProductPickerSheet'
import ChannelPaymentSelect from './ChannelPaymentSelect'
import CustomerQuickBlock from './CustomerQuickBlock'
import MoreOptions from './MoreOptions'
import OrderDateRow from './OrderDateRow'
import QuickSummaryPanel from './QuickSummaryPanel'
import type { CatalogProduct, ItemsController, FormValues } from './OrderCreateForm'

interface Props {
  /** ชื่อของสิ่งนั้นตามประเภทกิจการ (feature 00030) — ส่งต่อลง QuickSummaryPanel */
  orderNoun?: string
  /** คำเรียกของที่ร้านขาย ตามประเภทกิจการ (สินค้า/บริการ/ห้องพัก) — SSOT: PRODUCT_VOCAB */
  productNoun?: string
  /** ไอคอนแทน 'ของที่ร้านขาย' ตามประเภทกิจการ (package/tool/bed) — SSOT: PRODUCT_VOCAB.soldIcon */
  productIcon?: string
  /** หน่วยนับต่อบรรทัด (ชิ้น/ครั้ง/คืน) — SSOT: PRODUCT_VOCAB.unitLabel */
  unitLabel?: string

  /** ข้อความจากแชทที่จะให้ section ลูกค้ากระจายให้ตอนเปิดฟอร์ม (user สั่ง 2026-08-04) */
  prefillParseText?: string
  control: Control<FormValues>
  errors: FieldErrors<FormValues>
  setValue: UseFormSetValue<FormValues>
  /** ร้านนี้ส่งของไหม — รายการพิมพ์เอง (ไม่มี productId) นับเป็น "ต้องจัดส่ง" เฉพาะร้านที่ส่งของ */
  shipsGoods?: boolean
  /** ล็อกช่องทางการขายตามเธรดแชท (ดูเหตุผลเต็มที่ ChannelPaymentSelect) */
  channelLocked?: boolean
  catalog: CatalogProduct[]
  bestSellers: CatalogProduct[]
  itemsCtl: ItemsController
  formId?: string
  inventoryEnabled?: boolean
  subtotal: number
  total: number
  /** feature 00024 — บล็อกวันเข้าใช้บริการ (variant="card") จาก OrderCreateForm */
  appointmentBlock?: ReactNode
  /** compact = render ในโมดัลสร้างคำสั่งซื้อ (feature 00018) — footer sticky ในโมดัลแทน fixed viewport */
  compact?: boolean
  /** feature 00033 — ค่า orderedAt เริ่มต้นมาจากเวลาข้อความในแชท → OrderDateRow เปิดช่องค้างไว้เอง */
  orderDateFromMessage?: boolean
  /** feature 00033 — เวลาข้อความต้นทางเก่ากว่าเพดานย้อนหลัง จึงไม่ได้เติมให้ (โชว์ชิปเตือนใน OrderDateRow) */
  orderDateMessageTooOld?: boolean
  /** feature 00033 + impeccable clarify — ป้ายช่องวันที่ ผันตามประเภทกิจการ (ORDER_VOCAB.dateLabel) */
  orderDateLabel?: string
  /** feature 00062 (U15) — ปุ่มคู่ "จัดส่ง | นัดรับ" เฉพาะร้าน ONLINE_SALES (SSOT: OrderCreateForm) */
  showDeliveryToggle?: boolean
}

export default function QuickForm({
  orderNoun = 'คำสั่งซื้อ',
  productNoun = 'สินค้า',
  productIcon = 'package',
  unitLabel = 'ชิ้น',
  prefillParseText,
  control,
  errors,
  setValue,
  catalog,
  bestSellers,
  itemsCtl,
  formId,
  inventoryEnabled = false,
  subtotal,
  total,
  appointmentBlock,
  compact = false,
  orderDateFromMessage,
  orderDateMessageTooOld,
  orderDateLabel,
  shipsGoods = true,
  channelLocked = false,
  showDeliveryToggle = false,
}: Props) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)

  // needsShipping (reactive) — เรียก SSOT ตัวเดียวกับตอน submit (OrderCreateForm) และเดสก์ท็อป (CartPanel)
  // 2026-08-10: เดิมสามที่นี้เขียนกฎซ้ำกันเอง แล้วรอบแก้ 2026-08-07 เติม shipsGoods ให้เฉพาะตอน submit
  // ที่เดียว → หน้าจอ "ขอ" ที่อยู่ในสิ่งที่ตัวบล็อกจริงไม่ได้บังคับ (ดูเหตุผลเต็มใน lib/shipping-address-status)
  const watchedItems = (useWatch({ control, name: 'items' }) ?? []) as FormValues['items']
  const salesChannel = useWatch({ control, name: 'salesChannel' })
  // feature 00062 (U15) — ปุ่มคู่ "จัดส่ง | นัดรับ" อยู่ใน CustomerQuickBlock (มือถือ) แต่ needsShipping
  // ต้องรู้ค่านี้ที่นี่ด้วย เพราะ QuickForm เป็นเจ้าของ SSOT call ที่ต้องส่งลงเป็น prop `needsShipping`
  const fulfillmentMode = useWatch({ control, name: 'fulfillmentMode' }) as FormValues['fulfillmentMode']
  const needsShipping = useMemo(
    () =>
      orderNeedsShippingAddress({
        shipsGoods,
        salesChannel,
        items: watchedItems.map((i) =>
          toOrderItemShippingKind(i?.productId, catalog.find((p) => p.id === i?.productId)?.fulfillmentMode),
        ),
        deliveryOverride: fulfillmentMode === 'PICKUP' ? 'PICKUP' : undefined,
      }),
    [watchedItems, catalog, salesChannel, shipsGoods, fulfillmentMode],
  )

  // compact (โมดัลในแชท): ไม่ bleed ขอบ (ไม่มี fullscreen layout p-4/p-8 ให้หักล้าง) + padding คงที่ px-4
  // (ไม่ใช้ md:px-8 ที่อิง viewport เพราะโมดัลแคบแต่ viewport กว้าง จะได้ padding เดสก์ท็อปผิด — user report 2026-07-24)
  /** error ระดับ array ของ items ("ต้องมีสินค้าอย่างน้อย 1 รายการ") — ใช้ 2 ที่: ป้ายหัวข้อ + ข้อความใต้รายการ */
  const itemsRootErrorMsg =
    typeof (errors.items as { message?: string })?.message === 'string'
      ? (errors.items as { message?: string }).message
      : null

  const rootCls = compact ? '' : '-mx-4 md:-mx-8'
  const secX = compact ? 'px-4' : 'px-4 md:px-8'
  return (
    <div className={rootCls}>
      {/* SECTION 1: ลูกค้า (phone-first + wand paste + address) */}
      <section className={`border-b-8 border-default-100 ${secX} py-4`}>
        <CustomerQuickBlock
          control={control}
          errors={errors}
          setValue={setValue}
          needsShipping={needsShipping}
          prefillParseText={prefillParseText}
          showDeliveryToggle={showDeliveryToggle}
        />
      </section>

      {/* SECTION 2: ช่องทางการขาย + การชำระเงิน */}
      <section className={`border-b-8 border-default-100 ${secX} py-3.5`}>
        <ChannelPaymentSelect control={control} compact={compact} channelLocked={channelLocked} />
      </section>

      {/* SECTION 2.5: วันที่สั่งซื้อ (feature 00033) — ยุบไว้ + ปุ่มเปลี่ยน ตาม D-7
          ห้ามห่อด้วย accordion ซ้ำ (ux ruling) — ยุบ/ขยายในตัวอยู่แล้ว */}
      <section className={`border-b-8 border-default-100 ${secX} py-3.5`}>
        <OrderDateRow
          control={control}
          setValue={setValue}
          fromMessage={orderDateFromMessage}
          messageTooOld={orderDateMessageTooOld}
          dateLabel={orderDateLabel}
        />
      </section>

      {/* SECTION 3: สินค้า — ไม่มีปุ่มพิมพ์เอง: แถวเปล่ารอเสมออยู่แล้ว (spreadsheet pattern, จัดการที่ OrderCreateForm) */}
      {/* scroll-mt-24: onInvalid เลื่อนมาที่ section นี้ด้วย block:'start' ซึ่งจะเอาหัวข้อ + ป้าย
          "ต้องแก้" ไปนอนใต้ FullscreenPageHeader ที่เป็น sticky top-0 สูงราว 90px บนมือถือพอดี —
          สิ่งที่ถูกบังคือสิ่งที่ toast เพิ่งสั่งให้ไปดู (critique P1 2026-08-07) */}
      <section id="order-items-section" className={`scroll-mt-24 border-b-8 border-default-100 ${secX} py-4`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-dark">
            <Icon icon={productIcon} className="size-5 text-primary" />
            {productNoun}
            {/* ป้าย "ต้องแก้" คำเดียวกับที่บล็อกลูกค้า/ที่อยู่ใช้อยู่แล้ว — คำเดียวกัน = ของเดียวกัน */}
            {itemsRootErrorMsg && <span className="badge bg-danger/15 text-danger">ต้องแก้</span>}
          </h2>
        </div>
        <div>
          {itemsCtl.fields.map((f, i) => (
            <QuickLineItem
              key={f.id}
              index={i}
              item={f as unknown as FormValues['items'][number]}
              control={control}
              catalog={catalog}
              itemsCtl={itemsCtl}
              errors={errors}
              inventoryEnabled={inventoryEnabled}
              productNoun={productNoun}
              productIcon={productIcon}
              unitLabel={unitLabel}
              onOpenPicker={() => setPickerIndex(i)}
            />
          ))}
        </div>
        {itemsRootErrorMsg && (
          <p id="order-items-error" className="mt-1.5 text-xs text-danger">
            {itemsRootErrorMsg}
          </p>
        )}
      </section>

      {/* SECTION 3.5: วันเข้าใช้บริการ (feature 00024 — เฉพาะร้านที่เปิดคิวงาน)
          หลังเลือกสินค้า/บริการแล้วค่อยนัดวัน ตาม Design Spec ส่วน C */}
      {appointmentBlock}

      {/* SECTION 4: เพิ่มเติม — ส่วนลด/VAT/หมายเหตุ (ไม่ collapse; สไตล์เดียวกับ section อื่น) */}
      <section className={`border-b-8 border-default-100 ${secX} py-4`}>
        <div className="mb-3 flex items-center gap-2">
          <Icon icon="adjustments" className="size-5 text-primary" />
          <h2 className="text-base font-bold text-dark">เพิ่มเติม</h2>
        </div>
        <MoreOptions control={control} />
      </section>

      {/* Footer sticky (< lg) — collapsible summary + บันทึก */}
      <QuickSummaryPanel control={control} subtotal={subtotal} total={total} formId={formId} compact={compact} orderNoun={orderNoun} />

      {/* ProductPickerSheet — instance เดียว เปิดเล็ง line ที่ pickerIndex */}
      <ProductPickerSheet
        open={pickerIndex !== null}
        catalog={catalog}
        bestSellers={bestSellers}
        productNoun={productNoun}
        onPick={(p) => {
          if (pickerIndex != null) itemsCtl.setLineProduct(pickerIndex, p)
          setPickerIndex(null)
        }}
        onCustom={(text) => {
          if (pickerIndex != null) itemsCtl.setLineCustom(pickerIndex, text)
          setPickerIndex(null)
        }}
        onClose={() => setPickerIndex(null)}
      />
    </div>
  )
}
