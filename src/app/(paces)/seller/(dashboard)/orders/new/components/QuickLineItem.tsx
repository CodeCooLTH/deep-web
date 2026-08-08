'use client'

/**
 * QuickLineItem — 1 บรรทัดสินค้าใน quick create (< lg), layout ภาพ 21
 * [รูป square] + col( top:[ชื่อ tap→picker + รายละเอียด inline-edit] + trash จาง / bottom:[ยอดรวมตัวหนา + ราคา/ชิ้น(จิ้ม→QuickPriceSheet)] · stepper )
 * Base: mockup 2026-07-06-quick-create-order.html + CartLineItem.tsx (useController qty/price/desc + stock warning) + ProductThumb
 * ชื่อสินค้า = ปุ่ม tap-to-open (เปิด ProductPickerSheet ที่ QuickForm ผ่าน onOpenPicker) — ไม่มี arrow/dropdown inline (ตาม mockup)
 */

import { useState } from 'react'
import { useController } from 'react-hook-form'
import type { Control, FieldErrors } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import ProductThumb from './ProductThumb'
import QuickPriceSheet from './QuickPriceSheet'
import type { CatalogProduct, FormValues, ItemsController } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  index: number
  item: FormValues['items'][number]
  control: Control<FormValues>
  catalog: CatalogProduct[]
  itemsCtl: ItemsController
  errors?: FieldErrors<FormValues>
  inventoryEnabled?: boolean
  /** คำเรียกของที่ร้านขาย (สินค้า/บริการ/ห้องพัก) */
  productNoun?: string
  /** ไอคอนแทนของที่ร้านขาย (package/tool/bed) */
  productIcon?: string
  /** หน่วยนับต่อบรรทัด (ชิ้น/ครั้ง/คืน) */
  unitLabel?: string
  /** เปิด ProductPickerSheet ที่ QuickForm สำหรับ line นี้ */
  onOpenPicker: () => void
}

export default function QuickLineItem({
  index,
  item,
  control,
  catalog,
  itemsCtl,
  errors,
  inventoryEnabled = false,
  productNoun = 'สินค้า',
  productIcon = 'package',
  unitLabel = 'ชิ้น',
  onOpenPicker,
}: Props) {
  const [priceOpen, setPriceOpen] = useState(false)
  const { field: qtyField } = useController({ control, name: `items.${index}.qty`, defaultValue: 1 })
  const { field: priceField } = useController({ control, name: `items.${index}.price`, defaultValue: 0 })
  const { field: descField } = useController({ control, name: `items.${index}.description`, defaultValue: '' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemErrors = (errors?.items as any)?.[index]
  /**
   * error ระดับ array ("ต้องมีสินค้าอย่างน้อย 1 รายการ") — ทาสีเฉพาะแถวที่ยังว่าง
   * เพื่อชี้ว่าต้องกลับมาแตะตรงไหน (แถวที่กรอกแล้วไม่ใช่ปัญหา ห้ามทาแดงไปด้วย)
   */
  const itemsRootError =
    typeof (errors?.items as { message?: string })?.message === 'string' && !item.name?.trim()
  const qty = Number(qtyField.value) || 0
  const price = Number(priceField.value) || 0
  const hasProduct = Boolean(item.name?.trim())
  const catalogProduct = item.productId ? catalog.find((p) => p.id === item.productId) : undefined
  const stock = catalogProduct?.stockQty
  const overStock = inventoryEnabled && stock != null && qty > stock
  const setQty = (n: number) => qtyField.onChange(Math.max(1, n))

  return (
    <div className="flex gap-3 border-b border-default-100 py-3 last:border-b-0">
      {/* thumb square (ว่าง = dashed muted) */}
      {hasProduct ? (
        <ProductThumb src={catalogProduct?.image ?? null} alt={item.name} className="size-14 rounded-lg" iconClassName="size-6" />
      ) : (
        <span
          className={`inline-flex size-14 shrink-0 items-center justify-center rounded-lg border border-dashed ${
            itemsRootError ? 'border-danger bg-danger/5 text-danger' : 'border-default-300 bg-default-50 text-default-300'
          }`}
        >
          <Icon icon={productIcon} className="size-6" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* top: ชื่อ (tap→picker) + รายละเอียด · trash มุมขวา */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {/**
             * ทรงเดิม: ข้อความเปล่า ไม่มีกรอบ/ไอคอน (user สั่งคืน 2026-08-07 หลังเห็นของจริง —
             * กรอบทำให้แถวอ่านเป็นฟอร์มและสูงขึ้น เสียบุคลิก "บรรทัดในสเปรดชีต" ของรายการ)
             *
             * แต่ทางตันที่เคยเกิดต้องไม่กลับมา — ปุ่มบันทึกกดได้เสมอแล้ว (ลบ disabled ไปคนละไฟล์)
             * ตัวแถวจึงไม่ต้องแบกหน้าที่ "สอนว่าต้องแตะตรงนี้" คนเดียวอีก: กดบันทึกตอนยังว่าง
             * จะได้ toast + ป้าย "ต้องแก้" + ข้อความสีแดงที่ชี้มาที่นี่
             *
             * ยังคงไว้จากรอบก่อน: คำผันตามประเภทร้าน (productNoun) และสีแดงตอน validate ไม่ผ่าน
             * (สีอย่างเดียว ไม่มีกรอบ) · aria-* ให้ screen reader รู้ว่าปุ่มนี้คือจุดที่ผิด
             */}
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur()
                onOpenPicker()
              }}
              aria-label={item.name ? `แก้ไข${productNoun} ${item.name}` : `เลือก${productNoun}`}
              aria-invalid={itemsRootError || undefined}
              aria-describedby={itemsRootError ? 'order-items-error' : undefined}
              className={`w-full truncate rounded-md px-1.5 py-1 text-start text-sm font-semibold hover:bg-default-100 ${
                hasProduct ? 'text-dark' : itemsRootError ? 'text-danger' : 'text-default-400'
              }`}
            >
              {item.name || `เลือก${productNoun} หรือพิมพ์ชื่อเอง`}
            </button>
            <input
              type="text"
              placeholder={`รายละเอียด${productNoun}`}
              value={descField.value ?? ''}
              onChange={descField.onChange}
              onBlur={descField.onBlur}
              /* focus:border-default-400 ไม่ใช่ -300 — ช่องนี้ขอบโปร่งใสตอนพัก ขอบที่โผล่ตอน
                 โฟกัสจึงเป็น "ตัวบอกโฟกัส" ตัวเดียวที่มี (focus:bg-white บนการ์ดขาวแทบไม่เห็น)
                 WCAG 1.4.11 บังคับ 3:1 แต่ default-300 = 1.22:1 ส่วน default-400 = 4.95:1
                 — ตัวเลขชุดเดียวกับที่โปรเจกต์วัดไว้เองแล้วแก้ให้ .form-checkbox (_forms.css:96) */
              className="w-full rounded-md border border-transparent px-1.5 py-0.5 text-xs text-default-500 focus:border-default-400 focus:bg-white focus:outline-none"
            />
            {itemErrors?.name && <p className="mt-0.5 px-1.5 text-xs text-danger">{itemErrors.name.message}</p>}
            {overStock && (
              <p className="mt-1 flex items-center gap-1 px-1.5 text-xs text-danger">
                <Icon icon="alert-triangle" className="size-3.5 shrink-0" />
                เกินสต็อก (คงเหลือ {stock})
              </p>
            )}
          </div>
          {/**
           * ลบรายการ — เป้ากด 44px และ "ถามก่อนถ้ามีอะไรจะเสีย"
           *
           * ของเดิม `p-1` ครอบไอคอน 16px ได้เป้าจริงราว 24px อยู่ห่างช่อง "รายละเอียด" ที่กำลัง
           * พิมพ์อยู่ไม่กี่พิกเซล และเรียก remove() ทันทีโดยไม่มี confirm/undo — กดพลาดครั้งเดียว
           * ตอนลูกค้ายืนรอ = ราคาที่เพิ่งคีย์หายโดยไม่มีทางเรียกคืน (impeccable critique P2)
           *
           * ถามเฉพาะแถวที่มีของจะเสียจริง (มีชื่อแล้ว) — แถวเปล่าลบทันทีเหมือนเดิม ไม่งั้น
           * การล้างแถวที่เผลอกดเพิ่มจะกลายเป็น 2 คลิกทุกครั้งโดยไม่ได้กันอะไรเลย
           * (convention: destructive ในคอนโซลผู้ขายต้องมี confirm — docs/conventions/seller-action-placement.md)
           */}
          <button
            type="button"
            onClick={async () => {
              if (!hasProduct) return itemsCtl.remove(index)
              const ok = await pacesConfirm.danger('ลบรายการนี้?', item.name)
              if (ok) itemsCtl.remove(index)
            }}
            aria-label={hasProduct ? `ลบรายการ ${item.name}` : 'ลบรายการ'}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-default-300 hover:bg-danger/10 hover:text-danger"
          >
            <Icon icon="trash" className="size-4" />
          </button>
        </div>

        {/* bottom: ยอดรวม + แก้ราคา (ซ้าย) · stepper (ขวา) */}
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-bold text-dark tabular-nums">{formatThb(qty * price)}</div>
            {hasProduct && (
              <button type="button" onClick={() => setPriceOpen(true)} className="mt-0.5 text-2xs text-default-400">
                {formatThb(price)}/{unitLabel} · <span className="font-semibold text-primary">แก้ราคา</span>
              </button>
            )}
          </div>
          {/* stepper qty ±1 */}
          <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-default-300">
            <button type="button" onClick={() => setQty(qty - 1)} aria-label={item.name ? `ลดจำนวน ${item.name}` : 'ลดจำนวน'} className="inline-flex size-9 items-center justify-center text-primary">
              <Icon icon="minus" className="size-4" />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              aria-label={item.name ? `จำนวน ${item.name}` : 'จำนวน'}
              className="w-10 border-x border-default-200 py-1.5 text-center text-sm font-bold"
              value={qtyField.value ?? 1}
              onChange={(e) => qtyField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={qtyField.onBlur}
            />
            <button type="button" onClick={() => setQty(qty + 1)} aria-label={item.name ? `เพิ่มจำนวน ${item.name}` : 'เพิ่มจำนวน'} className="inline-flex size-9 items-center justify-center text-primary">
              <Icon icon="plus" className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <QuickPriceSheet
        open={priceOpen}
        price={price}
        name={item.name}
        qty={qty}
        unitLabel={unitLabel}
        onApply={(p) => {
          priceField.onChange(p)
          setPriceOpen(false)
        }}
        onClose={() => setPriceOpen(false)}
      />
    </div>
  )
}
