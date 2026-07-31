/**
 * ShipForm — ฟอร์มบันทึกการจัดส่ง (extract จาก OrderActions เพื่อ reuse ใน StatusHero)
 * Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderActions.tsx
 *
 * T9 (2026-07-31) — เพิ่ม prop เสริมให้ ShipmentEntryModal เรียกใช้ได้ทั้ง create/edit
 * โดยไม่กระทบผู้เรียกเดิม (ShippingCard) เลย — prop ใหม่ทุกตัว optional ค่าเริ่มต้น = พฤติกรรมเดิม:
 *   mode='edit'            → ยิง PATCH แทน POST, ปุ่ม submit เขียน "บันทึกการแก้ไข" (S-12)
 *   alwaysOpen              → ไม่มีปุ่ม toggle ในตัว (โมดัลเป็นคนคุมการเปิด/ปิดฟอร์มทั้งก้อนแล้ว)
 *   onSuccess/onCancel       → ให้ผู้เรียกคุม flow เอง (โมดัลปิด+refresh หน้าเอง ไม่ใช่ฟอร์มเรียก router.refresh())
 *   onSubmittingChange       → แจ้งสถานะ "กำลังส่ง" ออกไปให้โมดัลกันปิด backdrop ระหว่างส่ง
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pacesToast } from '@/lib/paces-toast'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import Select from '@/components/wrappers/Select'
import Icon from '@/components/wrappers/Icon'

const CARRIERS = [
  'Kerry Express',
  'Flash Express',
  'Thailand Post',
  'J&T Express',
  'DHL',
  'อื่นๆ',
]

const trackingSchema = yup.object({
  provider: yup.string().required('กรุณาเลือกขนส่ง'),
  trackingNo: yup.string().required('กรุณากรอกเลขพัสดุ').min(3, 'เลขพัสดุต้องมีอย่างน้อย 3 ตัวอักษร'),
})

type TrackingFormValues = yup.InferType<typeof trackingSchema>

interface ShipFormProps {
  publicToken: string
  /**
   * เลขติดตามจากพัสดุ iShip ที่เปิดไว้แล้ว (feature 00022) — เติมให้ล่วงหน้า
   * เหตุผล: ร้านเพิ่งเปิดพัสดุจากหน้านี้เมื่อครู่ ถ้าต้องพิมพ์เลขเดิมซ้ำอีกรอบ
   * ก็เท่ากับยังทำงานซ้ำอยู่ ซึ่งเป็นสิ่งที่ฟีเจอร์นี้ตั้งใจกำจัด
   */
  initialTrackingNo?: string | null
  /** ชื่อขนส่งจาก iShip — เติมให้เฉพาะเมื่อ "ตรงกับตัวเลือกที่มีอยู่" เท่านั้น */
  initialProvider?: string | null
  /** 'create' (ค่าเริ่มต้น) ยิง POST | 'edit' ยิง PATCH — แก้เลขพัสดุที่แจ้งไปแล้ว (S-12, สถานะ SHIPPED+MANUAL เท่านั้น) */
  mode?: 'create' | 'edit'
  /**
   * true = ไม่มีปุ่ม toggle "กรอกเลขพัสดุ" ในตัว ฟอร์มเปิดค้างเสมอ — ใช้เมื่อผู้เรียก (ShipmentEntryModal)
   * เป็นคนคุมการเปิด/ปิดฟอร์มทั้งก้อนอยู่แล้ว (โมดัลเปิด = ฟอร์มเปิด ไม่ต้องมี toggle ซ้อน toggle)
   */
  alwaysOpen?: boolean
  /**
   * เรียกแทนการ router.refresh()+ยุบฟอร์มในตัวเองหลังบันทึกสำเร็จ — ผู้เรียกที่เป็นโมดัล
   * (ShipmentEntryModal) จะปิดโมดัล + router.refresh() หน้าเอง ไม่ส่งมา = พฤติกรรมเดิม (ShippingCard)
   */
  onSuccess?: () => void
  /** เรียกแทนการยุบฟอร์ม/reset ในตัวเองตอนกดปุ่ม "ปิด" — โมดัลใช้ปิด dialog ทั้งบาน ไม่ส่งมา = พฤติกรรมเดิม */
  onCancel?: () => void
  /** แจ้งสถานะกำลังส่งฟอร์มออกไปให้ผู้เรียก (โมดัลใช้กันปิด backdrop ระหว่างส่ง) */
  onSubmittingChange?: (submitting: boolean) => void
}

export default function ShipForm({
  publicToken,
  initialTrackingNo,
  initialProvider,
  mode = 'create',
  alwaysOpen = false,
  onSuccess,
  onCancel,
  onSubmittingChange,
}: ShipFormProps) {
  const router = useRouter()
  const [showShipForm, setShowShipForm] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<TrackingFormValues>({
    resolver: yupResolver(trackingSchema),
    defaultValues: {
      // provider เติมเฉพาะเมื่อชื่อตรงกับตัวเลือกในลิสต์พอดี — ชื่อขนส่งฝั่ง iShip
      // สะกดไม่เหมือนกันเสมอไป (เช่น "KEX Express" กับ "Kerry Express")
      // เติมค่าที่ไม่มีในลิสต์เข้าไปจะทำให้ select ว่างเปล่าแต่ validation ผ่าน = สับสนกว่าเดิม
      provider: initialProvider && CARRIERS.includes(initialProvider) ? initialProvider : '',
      trackingNo: initialTrackingNo ?? '',
    },
  })

  const setLoadingState = (v: boolean) => {
    setLoading(v)
    onSubmittingChange?.(v)
  }

  const genericErrorMessage = mode === 'edit'
    ? 'แก้ไขเลขพัสดุไม่สำเร็จ กรุณาลองใหม่'
    : 'บันทึกการจัดส่งไม่สำเร็จ กรุณาลองใหม่'

  const handleShip = async (values: TrackingFormValues) => {
    setLoadingState(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/ship`, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: values.provider, trackingNo: values.trackingNo }),
      })
      if (!res.ok) {
        // แสดงข้อความจริงจาก route (409/404/400 ของ updateShipmentTracking) ไม่ใช้ generic เสมอ
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || genericErrorMessage)
      }
      pacesToast.success(mode === 'edit' ? 'บันทึกการแก้ไขเลขพัสดุแล้ว' : 'บันทึกการจัดส่งแล้ว')
      if (onSuccess) {
        // ผู้เรียกเป็นโมดัล — โมดัลปิด + router.refresh() หน้าเอง ที่นี่ไม่เรียกซ้ำ
        onSuccess()
      } else {
        setShowShipForm(false)
        reset()
        router.refresh()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : genericErrorMessage
      pacesToast.error(message)
    } finally {
      setLoadingState(false)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      setShowShipForm(false)
      reset()
    }
  }

  return (
    <>
      {/* alwaysOpen (ShipmentEntryModal) = โมดัลเป็นตัว toggle เปิด/ปิดอยู่แล้ว — ไม่ต้องมี toggle ซ้อน toggle */}
      {!alwaysOpen && (
        <button
          type="button"
          onClick={() => setShowShipForm((v) => !v)}
          disabled={loading}
          className="btn bg-primary text-white hover:bg-primary-hover text-sm font-medium disabled:opacity-60 w-full inline-flex items-center justify-center gap-2 min-h-11"
        >
          <Icon icon={showShipForm ? 'x' : 'truck-delivery'} className="text-base" aria-hidden="true" />
          {/* label เดิม "บันทึกการจัดส่ง" ผิด — กดแล้วไม่ได้บันทึกอะไร แค่กางฟอร์ม
              และคำว่า "บันทึก" ไปซ้ำกับปุ่มยืนยันข้างในที่บันทึกจริง */}
          {showShipForm ? 'ปิดฟอร์ม' : 'กรอกเลขพัสดุ'}
        </button>
      )}

      {(alwaysOpen || showShipForm) && (
        // ไม่ใส่ bg-card/border/rounded — ฟอร์มนี้อยู่ใน card-body ของ StatusHero/ShipmentEntryModal อยู่แล้ว
        // การ์ดซ้อนการ์ดผิด DESIGN.md §6; ผู้เรียกห่อ border-t/card-body ให้ด้านนอกแล้ว
        <form onSubmit={handleSubmit(handleShip)} className={alwaysOpen ? 'flex flex-col gap-3' : 'flex flex-col gap-3 pt-3'}>
          {!alwaysOpen && <p className="text-sm font-semibold text-default-800 mb-0">ข้อมูลการจัดส่ง</p>}

          <div>
            <label className="form-label text-xs mb-1 block">
              ขนส่ง <span className="text-danger">*</span>
            </label>
            <Controller
              control={control}
              name="provider"
              render={({ field }) => {
                const options = CARRIERS.map((c) => ({ value: c, label: c }))
                return (
                  <Select
                    className="select2 react-select"
                    classNamePrefix="react-select"
                    isSearchable={false}
                    placeholder="-- เลือกขนส่ง --"
                    options={options}
                    value={options.find((o) => o.value === field.value) ?? null}
                    onChange={(opt: unknown) => field.onChange((opt as { value: string } | null)?.value ?? '')}
                  />
                )
              }}
            />
            {errors.provider && (
              <p className="text-danger text-xs mt-1">{errors.provider.message}</p>
            )}
          </div>

          <div>
            <label className="form-label text-xs mb-1 block">
              เลขพัสดุ <span className="text-danger">*</span>
            </label>
            <input
              {...register('trackingNo')}
              type="text"
              placeholder="เช่น TH123456789"
              className="form-input text-sm w-full"
            />
            {errors.trackingNo && (
              <p className="text-danger text-xs mt-1">{errors.trackingNo.message}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="btn bg-primary text-white hover:bg-primary-hover text-sm font-medium disabled:opacity-60 flex-1"
            >
              {/* edit mode ใช้คำว่า "บันทึกการแก้ไข" — คนละคำกับ "ยืนยันจัดส่ง" ตอนสร้าง (task T9) */}
              {loading ? 'กำลังบันทึก...' : mode === 'edit' ? 'บันทึกการแก้ไข' : 'ยืนยันจัดส่ง'}
            </button>
            {/* เดิมเขียน "ยกเลิก" ซึ่งซ้ำกับปุ่ม "ยกเลิกออเดอร์" (ทำลายล้าง) ที่อยู่ถัดลงไปไม่กี่พิกเซล
                — คำเดียวกัน ผลลัพธ์คนละเรื่อง จึงเปลี่ยนเป็น "ปิด" */}
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="btn border border-default-300 bg-card hover:bg-default-50 text-default-700 text-sm min-h-11 disabled:opacity-60"
            >
              ปิด
            </button>
          </div>
        </form>
      )}
    </>
  )
}
