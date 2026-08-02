'use client'

/**
 * ExpenseFormModal — บันทึก/แก้ไขค่าใช้จ่ายในโมดัล (feature 00016 redesign)
 *
 * แทนที่ ExpenseForm.tsx เดิมที่เป็นการ์ดแปะค้างกลางหน้า — validation/endpoint/payload เหมือนเดิมทุกอย่าง
 * เปลี่ยนแค่เปลือกและลำดับช่องกรอก (จำนวนเงินมาก่อน เพราะเป็นสิ่งที่ผู้ใช้รู้ก่อนเสมอตอนเปิดหน้านี้)
 *
 * Base:
 *   - เปลือกโมดัล (dialog/backdrop/Escape/focus trap/คืน focus/กันปิดระหว่างส่ง):
 *     src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShipmentEntryModal.tsx
 *     (ตัวเดียวกับที่ IShipImportModal ใช้เป็น Base)
 *   - bottom sheet บนจอแคบ: src/app/(paces)/seller/(dashboard)/orders/new/components/ProductPickerSheet.tsx
 *   - ช่องจำนวนเงิน input-group ฿: docs/system/ui-guideline/paces-component-reference.md §4
 *   - ปุ่มชิปหมวดหมู่: segmented/chip pattern เดียวกับ PnlReportCard เดิม (btn + aria-pressed)
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md §1D–1G, §4.2–4.4
 */
import { useEffect, useRef, useState } from 'react'
import { yupResolver } from '@hookform/resolvers/yup'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { cn } from '@/utils/helpers'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL_TH,
  EXPENSE_CATEGORY_ICON,
  type ExpenseCategory,
} from '@/lib/expense'
import { todayThaiIsoDate, shiftIsoDate } from '@/lib/date-range'
import { formatDate } from '@/lib/format-date'
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
  note: Yup.string().max(500, 'หมายเหตุยาวเกินไป (ไม่เกิน 500 ตัวอักษร)').default(''),
})

type FormValues = Yup.InferType<typeof schema>

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

type Props = {
  mode: 'create' | 'edit'
  /** แถวที่กำลังแก้ไข — required เมื่อ mode='edit' */
  editing?: SerializedExpense | null
  onClose: () => void
  /** เรียกหลัง create/edit/delete สำเร็จ — parent ไป refetch ทั้งก้อน */
  onMutated: () => void
}

function buildDefaultValues(mode: 'create' | 'edit', editing?: SerializedExpense | null): FormValues {
  if (mode === 'edit' && editing) {
    return {
      category: editing.category,
      amount: editing.amount,
      expenseDate: editing.expenseDate,
      note: editing.note ?? '',
    }
  }
  return { category: '', amount: undefined as unknown as number, expenseDate: todayThaiIsoDate(), note: '' }
}

export default function ExpenseFormModal({ mode, editing, onClose, onMutated }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const [deleting, setDeleting] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: buildDefaultValues(mode, editing),
  })

  // register ช่องที่ไม่ได้ผูกกับ <input> ตรง ๆ (ชิปหมวดหมู่) ให้ RHF รู้จัก
  useEffect(() => {
    register('category')
  }, [register])

  const category = watch('category')
  const expenseDate = watch('expenseDate')
  const note = watch('note') ?? ''

  // กำลังส่ง/กำลังลบ = ห้ามปิด (กันผู้ใช้ปิดกลางคันแล้วไม่รู้ว่าบันทึกสำเร็จไหม)
  const busy = isSubmitting || deleting
  const dismiss = () => {
    if (busy) return
    onClose()
  }

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)[0]?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        dismiss()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])

  const onSubmit = async (values: FormValues) => {
    try {
      const trimmedNote = values.note?.trim() ?? ''
      const body: Record<string, unknown> = {
        category: values.category,
        amount: values.amount,
        expenseDate: values.expenseDate,
      }
      // create: ไม่ส่ง note ว่าง (schema ไม่ nullable) — edit: ส่งเสมอแม้ '' เพื่อให้ล้างหมายเหตุเดิมได้
      if (mode === 'edit') body.note = trimmedNote
      else if (trimmedNote) body.note = trimmedNote

      const url = mode === 'edit' ? `/api/expenses/${editing?.id}` : '/api/expenses'
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        // 404 = แถวถูกลบจากแท็บ/อุปกรณ์อื่นไปแล้ว — บอกความจริง แล้วปิดพร้อม sync list
        if (res.status === 404) {
          pacesToast.error('รายการนี้ถูกลบไปแล้ว')
          onClose()
          onMutated()
          return
        }
        pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }

      pacesToast.success(mode === 'edit' ? 'แก้ไขค่าใช้จ่ายสำเร็จ' : 'บันทึกค่าใช้จ่ายสำเร็จ')
      onClose()
      onMutated()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    const confirmed = await pacesConfirm.danger('ลบรายการค่าใช้จ่ายนี้?', 'ลบแล้วกู้คืนไม่ได้')
    if (!confirmed) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/expenses/${editing.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) {
        pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }
      pacesToast.success(res.status === 404 ? 'รายการนี้ถูกลบไปแล้ว' : 'ลบค่าใช้จ่ายแล้ว')
      onClose()
      onMutated()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setDeleting(false)
    }
  }

  const today = todayThaiIsoDate()
  const yesterday = shiftIsoDate(today, -1)
  const isEdit = mode === 'edit'

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="expenseFormModalTitle"
      tabIndex={-1}
      className="size-full bg-dark/40 fixed top-0 start-0 z-80 flex items-end overflow-x-hidden overflow-y-auto sm:items-center sm:p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      {/* ขอบรอบโมดัลมาจาก sm:p-3 ที่ backdrop (ไม่ใช่ w-[calc()] แบบ ShipmentEntryModal) — เลี่ยง
          arbitrary value ตาม Hard Rule 7. จอแคบกว่า sm เป็น bottom sheet เต็มความกว้าง จึงไม่มีขอบ */}
      <div className="w-full sm:mx-auto sm:max-w-lg">
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="card max-h-dvh w-full flex-col overflow-hidden rounded-t-2xl sm:rounded-lg"
        >
          {/* ที่จับสำหรับลากบนมือถือ — บอกว่าแผ่นนี้เลื่อนขึ้นมาจากล่าง (ตกแต่งล้วน ซ่อนบนจอกว้าง) */}
          <div className="bg-default-300 mx-auto mt-2.5 h-1 w-9 rounded-full sm:hidden" aria-hidden="true" />

          <div className="card-header">
            <h3 id="expenseFormModalTitle" className="card-title flex items-center gap-1.5">
              <Icon icon={isEdit ? 'pencil' : 'receipt'} className="text-base" aria-hidden="true" />
              {isEdit ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย'}
            </h3>
            <button
              type="button"
              aria-label="ปิด"
              onClick={dismiss}
              disabled={busy}
              className="btn btn-icon text-default-600 min-h-11 min-w-11 disabled:opacity-50"
            >
              <Icon icon="x" className="align-middle text-2xl" />
            </button>
          </div>

          <div className="card-body grid gap-4 overflow-y-auto">
            {/* จำนวนเงิน — มาก่อนเพราะเป็นข้อมูลที่ผู้ใช้ถืออยู่ในมือตอนเปิดโมดัล */}
            <div>
              <label htmlFor="expenseAmount" className="form-label">
                จำนวนเงิน <span className="text-danger">*</span>
              </label>
              <div className="input-group">
                <span className="input-group-text text-lg">฿</span>
                <input
                  id="expenseAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="form-input text-2xl font-bold"
                  aria-invalid={!!errors.amount}
                  {...register('amount', { valueAsNumber: true })}
                />
              </div>
              {errors.amount && <p className="text-danger mt-1 text-sm">{errors.amount.message}</p>}
            </div>

            {/* หมวดหมู่ — ชิป 7 อันเห็นครบในคราวเดียว (เร็วกว่ากางลิสต์บนมือถือ)
                role="group" + aria-pressed ตาม pattern เดียวกับ segmented ที่ใช้อยู่ทั้งโปรเจกต์ */}
            <div>
              <span className="form-label">
                หมวดหมู่ <span className="text-danger">*</span>
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="หมวดหมู่ค่าใช้จ่าย">
                {EXPENSE_CATEGORIES.map((c: ExpenseCategory) => {
                  const selected = category === c
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setValue('category', c, { shouldValidate: true })}
                      className={cn(
                        'border-default-300 flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-2xs font-medium leading-tight',
                        selected
                          ? 'border-primary bg-primary/15 text-primary-ink font-semibold'
                          : 'text-default-800 bg-card',
                      )}
                    >
                      <Icon
                        icon={EXPENSE_CATEGORY_ICON[c]}
                        className={cn('text-lg', selected ? 'text-primary' : 'text-default-600')}
                        aria-hidden="true"
                      />
                      {EXPENSE_CATEGORY_LABEL_TH[c]}
                    </button>
                  )
                })}
              </div>
              {errors.category && <p className="text-danger mt-1 text-sm">{errors.category.message}</p>}
            </div>

            {/* วันที่ — ชิปด่วนครอบ 2 เคสที่ใช้จริงเกือบทั้งหมด แล้วค่อยเปิดปฏิทินถ้าย้อนไกลกว่านั้น */}
            <div>
              <label htmlFor="expenseDate" className="form-label">
                วันที่เกิดค่าใช้จ่าย <span className="text-danger">*</span>
              </label>
              <div className="mb-2 flex gap-2">
                {[
                  { iso: today, label: 'วันนี้' },
                  { iso: yesterday, label: 'เมื่อวาน' },
                ].map((q) => (
                  <button
                    key={q.iso}
                    type="button"
                    aria-pressed={expenseDate === q.iso}
                    onClick={() => setValue('expenseDate', q.iso, { shouldValidate: true })}
                    className={cn(
                      'btn btn-sm rounded-full',
                      expenseDate === q.iso ? 'bg-primary/15 text-primary font-semibold' : 'bg-light text-dark',
                    )}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <input
                id="expenseDate"
                type="date"
                className="form-input"
                aria-invalid={!!errors.expenseDate}
                {...register('expenseDate')}
              />
              {/* ช่อง date ของเบราว์เซอร์แสดง ค.ศ. เสมอ — เขียน พ.ศ. กำกับไว้ให้ตรงกับที่เห็นในรายการ */}
              {expenseDate && !errors.expenseDate && (
                <p className="text-default-500 mt-1 text-2xs">{formatDate(expenseDate)}</p>
              )}
              {errors.expenseDate && <p className="text-danger mt-1 text-sm">{errors.expenseDate.message}</p>}
            </div>

            <div>
              <label htmlFor="expenseNote" className="form-label">
                หมายเหตุ <span className="text-default-500 font-normal">(ไม่บังคับ)</span>
              </label>
              <textarea
                id="expenseNote"
                rows={2}
                maxLength={500}
                placeholder="เช่น บูสต์โพสต์ TikTok — แคมเปญเปิดร้าน"
                className="form-textarea"
                {...register('note')}
              />
              <p className="text-default-500 mt-1 text-end text-2xs">{note.length} / 500</p>
              {errors.note && <p className="text-danger mt-1 text-sm">{errors.note.message}</p>}
            </div>
          </div>

          <div
            className={cn(
              'card-footer flex items-center gap-2',
              isEdit ? 'justify-between' : 'justify-end',
            )}
            /* carve-out safe-area (Hard Rule 7): บนมือถือแผ่นนี้ชิดขอบล่างจอ ต้องเผื่อ home indicator
               ของ iOS — ไม่มี token Paces แทนได้เพราะค่ามาจากตัวเครื่อง. precedent: SelectPagesClient.tsx */
            style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}
          >
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="btn bg-danger/15 text-danger-ink inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Icon icon="trash" aria-hidden="true" />
                ลบรายการ
              </button>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={dismiss}
                disabled={busy}
                className="btn bg-light text-dark hover:bg-light-hover disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-1.5 text-white disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Icon icon="loader-2" className="animate-spin" aria-hidden="true" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <Icon icon={isEdit ? 'device-floppy' : 'plus'} aria-hidden="true" />
                    {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกค่าใช้จ่าย'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
