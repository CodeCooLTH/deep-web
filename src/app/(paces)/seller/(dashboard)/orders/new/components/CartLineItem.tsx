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

  const setQty = (n: number) => {
    if (n < 1) {
      itemsCtl.remove(index)
      return
    }
    qtyField.onChange(n)
  }

  return (
    <div className="rounded-lg border border-default-200 bg-card p-3">
      {/* top: thumb + combobox + remove */}
      <div className="flex items-start gap-2.5">
        <ProductThumb src={thumbSrc} alt={item.name} className="size-11 rounded-lg" iconClassName="size-5" />
        <div className="min-w-0 flex-1">
          <ProductCombobox
            value={{ productId: item.productId, name: item.name }}
            catalog={catalog}
            onPick={(p) => itemsCtl.setLineProduct(index, p)}
            onCustom={(text) => itemsCtl.setLineCustom(index, text)}
          />
          {itemErrors?.name && <p className="mt-0.5 text-xs text-danger">{itemErrors.name.message}</p>}
        </div>
        <button
          type="button"
          onClick={() => itemsCtl.remove(index)}
          aria-label="ลบรายการ"
          className="btn btn-icon !size-11 min-h-0 shrink-0 text-default-400 hover:bg-danger/10 hover:text-danger"
        >
          <Icon icon="x" className="size-4" />
        </button>
      </div>

      {/* description */}
      <input
        type="text"
        placeholder="เพิ่มคำอธิบาย (ถ้ามี)"
        value={descField.value ?? ''}
        onChange={descField.onChange}
        onBlur={descField.onBlur}
        className="form-input mt-2 border-dashed !border-default-300 bg-default-50 text-xs"
      />

      {/* bottom: qty stepper + unit price + line total */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setQty(qty - 1)}
            aria-label="ลดจำนวน"
            className="btn btn-icon !size-11 min-h-0 shrink-0 border border-default-200 text-default-600 hover:bg-default-100"
          >
            <Icon icon="minus" width={12} height={12} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="form-input w-12 py-1 text-center text-sm"
            value={qtyField.value ?? 1}
            onChange={(e) => qtyField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={qtyField.onBlur}
          />
          <button
            type="button"
            onClick={() => setQty(qty + 1)}
            aria-label="เพิ่มจำนวน"
            className="btn btn-icon !size-11 min-h-0 shrink-0 border border-default-200 text-default-600 hover:bg-default-100"
          >
            <Icon icon="plus" width={12} height={12} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* unit price — แก้ได้ทุก line (spec §5.2) */}
          <div className="relative w-24">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs text-default-400">฿</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              className="form-input w-full py-1 pl-6 text-sm"
              value={priceField.value ?? 0}
              onChange={(e) => priceField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={priceField.onBlur}
            />
          </div>
          <span className="min-w-16 text-right text-sm font-semibold text-dark tabular-nums">
            {formatThb(qty * price)}
          </span>
        </div>
      </div>
      {itemErrors?.qty && <p className="mt-1 text-xs text-danger">{itemErrors.qty.message}</p>}
      {itemErrors?.price && <p className="mt-1 text-xs text-danger">{itemErrors.price.message}</p>}
    </div>
  )
}
