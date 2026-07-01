'use client'

/**
 * ไม่มี Paces demo ตรง — ประกอบจาก primitive:
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductInformation.tsx
 *   (card > card-header > card-body shell)
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
 *   line 222-231 (`form-radio rounded-full!` + label ข้าง ๆ — radio group pattern)
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *   line 15-23 (form-label + form-input — ใช้กับ input type="datetime-local")
 *
 * Domain component: create mode = radio (เปิดทันที|กำหนดเวลา) + startTime (ถ้าเลือกกำหนดเวลา) + endTime
 * edit mode = UpdateAuctionSchema (@/lib/validations) **ไม่มี field startTime เลย** (แก้ไม่ได้หลังสร้าง)
 *   → edit แสดงแค่ endTime editable + (ถ้ามี startTime เดิม) โชว์เป็น read-only ข้อมูล ไม่ใช่ input
 */
import type { UseFormRegister, FieldErrors, UseFormWatch } from 'react-hook-form'
import type { AuctionFormValues } from './AuctionForm.types'

interface AuctionTimeCardProps {
  mode: 'create' | 'edit'
  register: UseFormRegister<AuctionFormValues>
  errors: FieldErrors<AuctionFormValues>
  watch: UseFormWatch<AuctionFormValues>
  disabled?: boolean
  /** edit mode เท่านั้น — ข้อความแสดงเวลาเปิดที่ตั้งไว้ตอนสร้าง (แก้ไม่ได้แล้ว) */
  scheduledStartLabel?: string | null
}

export default function AuctionTimeCard({
  mode,
  register,
  errors,
  watch,
  disabled,
  scheduledStartLabel,
}: AuctionTimeCardProps) {
  const scheduleType = watch('scheduleType')

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">เวลาประมูล</h4>
      </div>

      <div className="card-body grid grid-cols-1 gap-base">
        {mode === 'create' && (
          <div>
            <label className="form-label">
              เปิดประมูล <span className="text-danger">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="auc-schedule-now"
                  value="now"
                  className="form-radio rounded-full!"
                  disabled={disabled}
                  {...register('scheduleType')}
                />
                <label htmlFor="auc-schedule-now">เปิดทันที</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="auc-schedule-later"
                  value="schedule"
                  className="form-radio rounded-full!"
                  disabled={disabled}
                  {...register('scheduleType')}
                />
                <label htmlFor="auc-schedule-later">กำหนดเวลา</label>
              </div>
            </div>

            {scheduleType === 'schedule' && (
              <div className="mt-3">
                <label htmlFor="auc-start-time" className="form-label">
                  เวลาที่จะเปิดประมูล <span className="text-danger">*</span>
                </label>
                <input
                  id="auc-start-time"
                  type="datetime-local"
                  className="form-input"
                  disabled={disabled}
                  aria-describedby={errors.startTime ? 'auc-start-time-error' : undefined}
                  {...register('startTime')}
                />
                {errors.startTime && (
                  <p id="auc-start-time-error" className="text-danger mt-1 text-sm">
                    {errors.startTime.message}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {mode === 'edit' && scheduledStartLabel && (
          <div>
            <span className="form-label">เวลาเปิดประมูล (ตั้งไว้ตอนสร้าง — แก้ไม่ได้)</span>
            <p className="text-default-700 text-sm">{scheduledStartLabel}</p>
          </div>
        )}

        <div>
          <label htmlFor="auc-end-time" className="form-label">
            ปิดประมูล <span className="text-danger">*</span>
          </label>
          <input
            id="auc-end-time"
            type="datetime-local"
            className="form-input"
            disabled={disabled}
            aria-describedby={errors.endTime ? 'auc-end-time-error' : undefined}
            {...register('endTime')}
          />
          {errors.endTime && (
            <p id="auc-end-time-error" className="text-danger mt-1 text-sm">
              {errors.endTime.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
