'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/Pricing.tsx
 *   (card shell + base price field)
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputGroup.tsx
 *   line 29-40 ("Amount" — `input-group` + `input-group-text` currency prefix pattern)
 * Reference (in-app real usage เดียวกัน): src/app/(paces)/seller/(dashboard)/orders/new/components/
 *   PaymentChannelBlock.tsx line 119-145 (input-group ฿ + nullable number ผ่าน useController)
 *
 * Domain component — 5 ราคา (startPrice/bidIncrement บังคับ, reservePrice/buyNowPrice/expectedPrice
 * ไม่บังคับ + hint text ใต้ 3 ตัวหลัง ตาม content outline ของ Design Spec §D#10)
 */
import { useController } from 'react-hook-form'
import type { Control, FieldErrors } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import type { AuctionFormValues } from './AuctionForm.types'

interface AuctionPriceCardProps {
  control: Control<AuctionFormValues>
  errors: FieldErrors<AuctionFormValues>
  disabled?: boolean
}

// number input ที่รับค่าว่างได้ (nullable) — แปลง '' → null ตอน onChange เพื่อไม่ให้ Yup เห็น NaN
function useNullableNumberField(control: Control<AuctionFormValues>, name: 'reservePrice' | 'buyNowPrice' | 'expectedPrice') {
  return useController({ control, name })
}

export default function AuctionPriceCard({ control, errors, disabled }: AuctionPriceCardProps) {
  const { field: startPriceField } = useController({ control, name: 'startPrice' })
  const { field: bidIncrementField } = useController({ control, name: 'bidIncrement' })
  const { field: reserveField } = useNullableNumberField(control, 'reservePrice')
  const { field: buyNowField } = useNullableNumberField(control, 'buyNowPrice')
  const { field: expectedField } = useNullableNumberField(control, 'expectedPrice')

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ราคา</h4>
      </div>

      <div className="card-body grid grid-cols-1 gap-base">
        {/* startPrice* */}
        <div>
          <label htmlFor="auc-start-price" className="form-label">
            ราคาเริ่มต้น <span className="text-danger">*</span>
          </label>
          <div className="input-group">
            <span className="input-group-text">฿</span>
            <input
              id="auc-start-price"
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              className="form-input"
              disabled={disabled}
              value={startPriceField.value ?? ''}
              onChange={(e) =>
                startPriceField.onChange(e.target.value === '' ? undefined : Number(e.target.value))
              }
              onBlur={startPriceField.onBlur}
              ref={startPriceField.ref}
            />
          </div>
          {errors.startPrice && (
            <p className="text-danger mt-1 text-sm">{errors.startPrice.message}</p>
          )}
        </div>

        {/* bidIncrement* */}
        <div>
          <label htmlFor="auc-bid-increment" className="form-label">
            ขั้นบิดขั้นต่ำ <span className="text-danger">*</span>
          </label>
          <div className="input-group">
            <span className="input-group-text">฿</span>
            <input
              id="auc-bid-increment"
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              className="form-input"
              disabled={disabled}
              value={bidIncrementField.value ?? ''}
              onChange={(e) =>
                bidIncrementField.onChange(e.target.value === '' ? undefined : Number(e.target.value))
              }
              onBlur={bidIncrementField.onBlur}
              ref={bidIncrementField.ref}
            />
          </div>
          {errors.bidIncrement && (
            <p className="text-danger mt-1 text-sm">{errors.bidIncrement.message}</p>
          )}
        </div>

        {/* reservePrice — optional + hint */}
        <div>
          <label htmlFor="auc-reserve-price" className="form-label">
            ราคาขั้นต่ำ (reserve) <span className="text-default-400">(ไม่บังคับ)</span>
          </label>
          <div className="input-group">
            <span className="input-group-text">฿</span>
            <input
              id="auc-reserve-price"
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              placeholder="ไม่บังคับ"
              className="form-input"
              disabled={disabled}
              value={reserveField.value ?? ''}
              onChange={(e) =>
                reserveField.onChange(e.target.value === '' ? null : Number(e.target.value))
              }
              onBlur={reserveField.onBlur}
              ref={reserveField.ref}
            />
          </div>
          <p className="text-default-400 mt-1 flex items-center gap-1 text-xs">
            <Icon icon="info-circle" className="size-3.5 shrink-0" />
            Buyer เห็นว่ามีราคาขั้นต่ำ แต่ไม่เห็นตัวเลข
          </p>
          {errors.reservePrice && (
            <p className="text-danger mt-1 text-sm">{errors.reservePrice.message}</p>
          )}
        </div>

        {/* buyNowPrice — optional + hint */}
        <div>
          <label htmlFor="auc-buynow-price" className="form-label">
            ราคาซื้อทันที (buy-now) <span className="text-default-400">(ไม่บังคับ)</span>
          </label>
          <div className="input-group">
            <span className="input-group-text">฿</span>
            <input
              id="auc-buynow-price"
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              placeholder="ไม่บังคับ"
              className="form-input"
              disabled={disabled}
              value={buyNowField.value ?? ''}
              onChange={(e) =>
                buyNowField.onChange(e.target.value === '' ? null : Number(e.target.value))
              }
              onBlur={buyNowField.onBlur}
              ref={buyNowField.ref}
            />
          </div>
          <p className="text-default-400 mt-1 flex items-center gap-1 text-xs">
            <Icon icon="bolt" className="size-3.5 shrink-0" />
            กดซื้อทันทีได้ถ้าบิดยังไม่ถึงราคานี้
          </p>
          {errors.buyNowPrice && (
            <p className="text-danger mt-1 text-sm">{errors.buyNowPrice.message}</p>
          )}
        </div>

        {/* expectedPrice — optional + hint (seller-only, ไม่มีผลต่อ logic) */}
        <div>
          <label htmlFor="auc-expected-price" className="form-label">
            ยอดที่คาดหวัง <span className="text-default-400">(ไม่บังคับ)</span>
          </label>
          <div className="input-group">
            <span className="input-group-text">฿</span>
            <input
              id="auc-expected-price"
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              placeholder="เช่น 20000"
              className="form-input"
              disabled={disabled}
              value={expectedField.value ?? ''}
              onChange={(e) =>
                expectedField.onChange(e.target.value === '' ? null : Number(e.target.value))
              }
              onBlur={expectedField.onBlur}
              ref={expectedField.ref}
            />
          </div>
          <p className="text-default-400 mt-1 flex items-center gap-1 text-xs">
            <Icon icon="target" className="size-3.5 shrink-0" />
            เป้าหมายส่วนตัว ไว้ติดตามว่าราคาถึงที่หวังไหม — buyer ไม่เห็น
          </p>
          {errors.expectedPrice && (
            <p className="text-danger mt-1 text-sm">{errors.expectedPrice.message}</p>
          )}
        </div>
      </div>
    </div>
  )
}
