'use client'

/**
 * ExpenseForm — บันทึก/แก้ไขค่าใช้จ่าย (dual-mode create/edit) — feature 00016 Unit 5A
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/components/InviteMemberForm.tsx
 *   (card > card-header + card-body (grid form-input/form-select) + card-footer (submit btn) — RHF+Yup shell)
 * ช่องวันที่ (expenseDate): src/app/(paces)/seller/(fullscreen)/auctions/components/AuctionTimeCard.tsx:83
 *   (<input type="date" className="form-input">) — เปลี่ยนจาก datetime-local → date (ไม่มี time component)
 * ช่องจำนวนเงิน (amount): docs/system/ui-guideline/paces-component-reference.md §4 input-group
 *   (<div className="input-group"><span className="input-group-text">฿</span><input className="form-input"/></div>)
 *
 * Design decision (UX-Design-Spec.md §A): dual-mode component เดียว (ไม่แยก modal edit) — mirror
 * ProductFormV2 ที่ทำ create/edit ในไฟล์เดียวอยู่แล้ว
 *
 * expenseDate: serializeExpense คืน ISO ค.ศ. "YYYY-MM-DD" ตรง ๆ (wire format คงที่) → prefill
 * <input type="date"> ได้เลย ไม่ต้องแปลง; display พ.ศ. ทำที่ ExpenseList ด้วย formatDate
 */
import { useEffect } from 'react'
import { yupResolver } from '@hookform/resolvers/yup'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL_TH, type ExpenseCategory } from '@/lib/expense'
import { todayThaiIsoDate } from '@/lib/date-range'
import type { SerializedExpense } from '@/services/expense.service'

const schema = Yup.object({
  category: Yup.string()
    .oneOf(EXPENSE_CATEGORIES as unknown as string[], 'กรุณาเลือกหมวดหมู่')
    .required('กรุณาเลือกหมวดหมู่'),
  amount: Yup.number()
    .typeError('กรุณากรอกจำนวนเงิน')
    .required('กรุณากรอกจำนวนเงิน')
    .min(0.01, 'จำนวนเงินต้องมากกว่า 0'),
  expenseDate: Yup.string().required('กรุณาเลือกวันที่'),
  // .default('') กัน TS mismatch ระหว่าง Yup.InferType (optional key) กับ resolver ของ react-hook-form
  // (required key แบบ string | undefined) — ผลลัพธ์ runtime เหมือนเดิม (ไม่บังคับกรอก) แค่ type แน่นขึ้น
  note: Yup.string().max(500, 'หมายเหตุยาวเกินไป (ไม่เกิน 500 ตัวอักษร)').default(''),
})

type FormValues = Yup.InferType<typeof schema>

type Props = {
  mode: 'create' | 'edit'
  editingId?: string
  initialValues?: SerializedExpense | null
  onCancelEdit: () => void
  onSuccess: () => void
}

function buildDefaultValues(mode: 'create' | 'edit', initialValues?: SerializedExpense | null): FormValues {
  if (mode === 'edit' && initialValues) {
    return {
      category: initialValues.category,
      amount: initialValues.amount,
      expenseDate: initialValues.expenseDate,
      note: initialValues.note ?? '',
    }
  }
  return { category: '', amount: undefined as unknown as number, expenseDate: todayThaiIsoDate(), note: '' }
}

export default function ExpenseForm({ mode, editingId, initialValues, onCancelEdit, onSuccess }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: buildDefaultValues(mode, initialValues),
  })

  // สลับ create↔edit (คลิก pencil ที่แถว list) — reset ฟอร์มด้วยค่าของแถวที่เลือก
  useEffect(() => {
    reset(buildDefaultValues(mode, initialValues))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialValues?.id])

  const onSubmit = async (values: FormValues) => {
    try {
      const trimmedNote = values.note?.trim() ?? ''
      const body: Record<string, unknown> = {
        category: values.category,
        amount: values.amount,
        expenseDate: values.expenseDate,
      }
      // create: omit note ว่าง (schema note ไม่ nullable — ส่ง key ไม่ได้ถ้าไม่มีค่า)
      // edit: ส่ง note เสมอ (แม้ '') เพื่อให้ล้างหมายเหตุเดิมได้ — schema เป็น string เฉย ๆ '' ผ่านได้
      if (mode === 'edit') body.note = trimmedNote
      else if (trimmedNote) body.note = trimmedNote

      const url = mode === 'edit' ? `/api/expenses/${editingId}` : '/api/expenses'
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }

      pacesToast.success(mode === 'edit' ? 'แก้ไขค่าใช้จ่ายสำเร็จ' : 'บันทึกค่าใช้จ่ายสำเร็จ')
      if (mode === 'create') reset(buildDefaultValues('create'))
      onSuccess()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">{mode === 'edit' ? 'แก้ไขค่าใช้จ่าย' : 'บันทึกค่าใช้จ่าย'}</h4>
        </div>

        <div className="card-body">
          <div className="gap-base grid grid-cols-1 sm:grid-cols-2">
            {/* หมวดหมู่ — HR6: form-select native (bind RHF) ห้าม hs-dropdown */}
            <div>
              <label className="form-label">
                หมวดหมู่ค่าใช้จ่าย <span className="text-danger">*</span>
              </label>
              <select className="form-select" {...register('category')}>
                <option value="">เลือกหมวดหมู่</option>
                {EXPENSE_CATEGORIES.map((c: ExpenseCategory) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABEL_TH[c]}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-danger mt-1 text-sm">{errors.category.message}</p>}
            </div>

            {/* จำนวนเงิน — input-group ฿ (component reference §4) */}
            <div>
              <label className="form-label">
                จำนวนเงิน <span className="text-danger">*</span>
              </label>
              <div className="input-group">
                <span className="input-group-text">฿</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  className="form-input"
                  placeholder="0.00"
                  {...register('amount', { valueAsNumber: true })}
                />
              </div>
              {errors.amount && <p className="text-danger mt-1 text-sm">{errors.amount.message}</p>}
            </div>

            {/* วันที่เกิดค่าใช้จ่าย — Base: AuctionTimeCard.tsx:83 (input type="date") */}
            <div>
              <label className="form-label">
                วันที่เกิดค่าใช้จ่าย <span className="text-danger">*</span>
              </label>
              <input type="date" className="form-input" {...register('expenseDate')} />
              {errors.expenseDate && <p className="text-danger mt-1 text-sm">{errors.expenseDate.message}</p>}
            </div>

            {/* หมายเหตุ — ไม่บังคับ */}
            <div className="sm:col-span-2">
              <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
              <textarea className="form-textarea" rows={2} {...register('note')} />
              {errors.note && <p className="text-danger mt-1 text-sm">{errors.note.message}</p>}
            </div>
          </div>
        </div>

        <div className="card-footer flex justify-end gap-2">
          {mode === 'edit' && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="btn bg-light text-dark hover:bg-light-hover"
            >
              ยกเลิกแก้ไข
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Icon icon="refresh" className="animate-spin" aria-hidden="true" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Icon icon={mode === 'edit' ? 'device-floppy' : 'plus'} aria-hidden="true" />
                {mode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึกค่าใช้จ่าย'}
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  )
}
