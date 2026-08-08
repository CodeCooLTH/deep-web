'use client'

/**
 * CartLineItem — 1 บรรทัดในตะกร้า: thumb + ProductCombobox + description + qty stepper + unit price + line total + ลบ
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/CartBlock.tsx (stepper/price/remove markup)
 * stepper uniform ทั้ง catalog/custom (setQty ตรง ๆ ผ่าน useController — ถึง 0 = remove); ราคาแก้ได้ทุก line (spec §5.2)
 */

import { useController } from 'react-hook-form'
import LineCostField from './LineCostField'
import type { Control, FieldErrors } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from './ProductThumb'
import ProductCombobox from './ProductCombobox'
import type { CatalogProduct, FormValues, ItemsController } from './OrderCreateForm'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

interface Props {
  index: number
  item: FormValues['items'][number]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  catalog: CatalogProduct[]
  itemsCtl: ItemsController
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors?: FieldErrors<any>
  inventoryEnabled?: boolean
}

export default function CartLineItem({ index, item, control, catalog, itemsCtl, errors, inventoryEnabled = false }: Props) {
  const { field: qtyField } = useController({ control, name: `items.${index}.qty`, defaultValue: 1 })
  const { field: priceField } = useController({ control, name: `items.${index}.price`, defaultValue: 0 })
  const { field: descField } = useController({ control, name: `items.${index}.description`, defaultValue: '' })
  const { field: costField } = useController({ control, name: `items.${index}.cost`, defaultValue: null })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemErrors = (errors?.items as any)?.[index]
  const qty = Number(qtyField.value) || 0
  const price = Number(priceField.value) || 0
  const catalogProduct = item.productId ? catalog.find((p) => p.id === item.productId) : undefined
  // "รู้แน่ว่ายังไม่เคยตั้งต้นทุน" = สินค้าจากแคตตาล็อกที่ cost เป็น null เท่านั้น —
  // รายการพิมพ์เองไม่มี "ค่าที่ควรจะมีแต่ขาด" ให้เทียบ จึงใช้คำเชิญกลาง ๆ แทน
  const knownMissingCost = Boolean(catalogProduct && catalogProduct.cost == null)
  const thumbSrc = catalogProduct?.image ?? null
  // สต็อก: เตือนเมื่อ qty เกินคงเหลือ (เฉพาะร้านเปิดระบบคลัง + สินค้า tracked)
  const stock = catalogProduct?.stockQty
  const overStock = inventoryEnabled && stock != null && qty > stock

  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5 border-b border-default-100 py-2.5 last:border-b-0 lg:flex-nowrap">
      <ProductThumb src={thumbSrc} alt={item.name} className="size-14 rounded-lg" iconClassName="size-6" />
      {/* คอลัมน์หลัก: ชื่อสินค้า (combobox) + รายละเอียดใต้ชื่อ. lg:min-w-0 = ยอมหดให้คอลัมน์ตัวเลขพอดีบรรทัดเดียว */}
      <div className="min-w-36 flex-1 lg:min-w-0">
        <ProductCombobox
          value={{ productId: item.productId, name: item.name }}
          catalog={catalog}
          onPick={(p) => itemsCtl.setLineProduct(index, p)}
          onCustom={(text) => itemsCtl.setLineCustom(index, text)}
        />
        <input
          type="text"
          placeholder="รายละเอียด (ถ้ามี)"
          value={descField.value ?? ''}
          onChange={descField.onChange}
          onBlur={descField.onBlur}
          className="form-input mt-1 py-1 text-xs"
        />
        {/* ราคาทุนของบรรทัดนี้ (FR-EXP-17) — อยู่ในคอลัมน์ชื่อซึ่งเป็นพื้นที่ยืดหด
            ไม่ใช่คอลัมน์ที่ 5 (ตะกร้าล้นงบอยู่แล้วที่ 1024px — ดู LineCostField) */}
        {Boolean(item.name?.trim()) && (
          <LineCostField
            cost={(costField.value as number | null) ?? null}
            price={Number(item.price) || 0}
            onChange={costField.onChange}
            knownMissing={knownMissingCost}
          />
        )}
        {itemErrors?.name && <p className="mt-0.5 text-xs text-danger">{itemErrors.name.message}</p>}
        {overStock && (
          <p className="mt-1 flex items-center gap-1 text-xs text-danger">
            <Icon icon="alert-triangle" className="size-3.5 shrink-0" />
            เกินสต็อก (คงเหลือ {stock})
          </p>
        )}
      </div>
      {/* จำนวน — ห่อ .input-group (มี `> .form-input { width: 1%; flex: 1 1 auto }` unlayered ที่ _forms.css:256-262
          ชนะ .form-input ตัวเปล่า ๆ ได้) แทนใส่ w-14 ตรงที่ input เพราะ _forms.css เป็นไฟล์เดียวที่ไม่ห่อ @layer
          → unlayered ชนะ @layer utilities เสมอใน Tailwind v4 ทำให้ w-14 บน .form-input ไม่มีผล (บีบเหลือ 0px)
          w-14/shrink-0 ย้ายมาอยู่ที่ wrapper (div ธรรมดา ไม่ชนกับ unlayered rule) แทน — ห้ามย้ายกลับไปที่ input ตรง ๆ */}
      <div className="input-group w-14 shrink-0">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          aria-label="จำนวน"
          className="form-input px-1 py-1.5 text-center text-sm"
          value={qtyField.value ?? 1}
          onChange={(e) => qtyField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
          onBlur={qtyField.onBlur}
        />
      </div>
      {/* ราคาต่อหน่วย */}
      <div className="input-group w-24 shrink-0">
        <span className="input-group-text px-2">฿</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          aria-label="ราคาต่อหน่วย"
          className="form-input px-1.5 py-1.5 text-sm"
          value={priceField.value ?? 0}
          onChange={(e) => priceField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
          onBlur={priceField.onBlur}
        />
      </div>
      {/* รวม */}
      <div className="w-20 shrink-0 self-start pt-2 text-right text-sm font-semibold text-dark tabular-nums">
        {formatThb(qty * price)}
      </div>
      {/* ลบ */}
      <button
        type="button"
        onClick={() => itemsCtl.remove(index)}
        aria-label="ลบรายการ"
        className="btn btn-icon !size-9 min-h-0 shrink-0 text-default-400 hover:bg-danger/10 hover:text-danger"
      >
        <Icon icon="x" className="size-4" />
      </button>
    </div>
  )
}
