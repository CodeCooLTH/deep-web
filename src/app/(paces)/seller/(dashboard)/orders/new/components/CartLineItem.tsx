'use client'

/**
 * CartLineItem — 1 บรรทัดในตะกร้า: thumb + ProductCombobox + description + qty stepper + unit price + line total + ลบ
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/CartBlock.tsx (stepper/price/remove markup)
 * stepper uniform ทั้ง catalog/custom (setQty ตรง ๆ ผ่าน useController — ถึง 0 = remove); ราคาแก้ได้ทุก line (spec §5.2)
 */

import { useController } from 'react-hook-form'
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
}

export default function CartLineItem({ index, item, control, catalog, itemsCtl, errors }: Props) {
  const { field: qtyField } = useController({ control, name: `items.${index}.qty`, defaultValue: 1 })
  const { field: priceField } = useController({ control, name: `items.${index}.price`, defaultValue: 0 })
  const { field: descField } = useController({ control, name: `items.${index}.description`, defaultValue: '' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemErrors = (errors?.items as any)?.[index]
  const qty = Number(qtyField.value) || 0
  const price = Number(priceField.value) || 0
  const thumbSrc = item.productId ? catalog.find((p) => p.id === item.productId)?.image : null

  return (
    <div className="rounded-lg border border-default-200 bg-card p-2.5">
      {/* แถวชื่อ: thumb + (ชื่อ combobox + รายละเอียดใต้ชื่อ แบบ FlowAccount) + ลบ */}
      <div className="flex items-start gap-2.5">
        <ProductThumb src={thumbSrc} alt={item.name} className="size-9 rounded-lg" iconClassName="size-4" />
        <div className="min-w-0 flex-1">
          <ProductCombobox
            value={{ productId: item.productId, name: item.name }}
            catalog={catalog}
            onPick={(p) => itemsCtl.setLineProduct(index, p)}
            onCustom={(text) => itemsCtl.setLineCustom(index, text)}
          />
          {/* รายละเอียด — บรรทัดใต้ชื่อสินค้า */}
          <input
            type="text"
            placeholder="รายละเอียด (ถ้ามี)"
            value={descField.value ?? ''}
            onChange={descField.onChange}
            onBlur={descField.onBlur}
            className="form-input mt-1.5 py-1 text-xs"
          />
          {itemErrors?.name && <p className="mt-0.5 text-xs text-danger">{itemErrors.name.message}</p>}
        </div>
        <button
          type="button"
          onClick={() => itemsCtl.remove(index)}
          aria-label="ลบรายการ"
          className="btn btn-icon !size-9 min-h-0 shrink-0 text-default-400 hover:bg-danger/10 hover:text-danger"
        >
          <Icon icon="x" className="size-4" />
        </button>
      </div>

      {/* จำนวน · ราคาต่อหน่วย · รวม — inline กระชับ แก้ตรงนั้น (indent ใต้ชื่อ) */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 ps-11">
        <label className="flex items-center gap-1.5">
          <span className="text-2xs text-default-500">จำนวน</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="form-input w-16 py-1.5 text-center text-sm"
            value={qtyField.value ?? 1}
            onChange={(e) => qtyField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={qtyField.onBlur}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-2xs text-default-500">ราคา</span>
          <div className="input-group w-28">
            <span className="input-group-text">฿</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              className="form-input py-1.5 text-sm"
              value={priceField.value ?? 0}
              onChange={(e) => priceField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={priceField.onBlur}
            />
          </div>
        </label>
        <div className="ms-auto text-right">
          <div className="text-2xs text-default-500">รวม</div>
          <div className="text-sm font-semibold text-dark tabular-nums">{formatThb(qty * price)}</div>
        </div>
      </div>
      {itemErrors?.qty && <p className="mt-1 text-xs text-danger">{itemErrors.qty.message}</p>}
      {itemErrors?.price && <p className="mt-1 text-xs text-danger">{itemErrors.price.message}</p>}
    </div>
  )
}
