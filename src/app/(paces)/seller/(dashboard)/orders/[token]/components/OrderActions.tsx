'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import Select from '@/components/wrappers/Select'
import { Icon } from '@iconify/react'
import SlipViewer from './SlipViewer'

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

interface OrderActionsProps {
  order: {
    publicToken: string
    status: string
    /** fulfillmentMode snapshot — SHIPPED หรือ NO_SHIPPING (spec §2 ship guard) */
    fulfillmentMode: string
    /** fileId ของสลิปโอนเงินที่ buyer แนบ (S-11); null = ยังไม่แนบ */
    slipFileId: string | null
    /** URL ส่งมอบสินค้า/บริการดิจิทัล (S-12); null = ยังไม่ตั้ง */
    accessUrl: string | null
  }
}

export default function OrderActions({ order }: OrderActionsProps) {
  const router = useRouter()
  const [showShipForm, setShowShipForm] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  const { status, fulfillmentMode, publicToken, slipFileId, accessUrl } = order

  // S-12 accessUrl form — ใช้ state แยกเพื่อไม่ปนกับ tracking form
  const [accessUrlValue, setAccessUrlValue] = useState(accessUrl ?? '')
  const [accessUrlLoading, setAccessUrlLoading] = useState(false)

  const handleSaveAccessUrl = async () => {
    const url = accessUrlValue.trim()
    if (!url) {
      toast.error('กรุณากรอกลิงก์')
      return
    }
    setAccessUrlLoading(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/access-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'บันทึกลิงก์ไม่สำเร็จ')
      }
      toast.success('บันทึกลิงก์แล้ว')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'บันทึกลิงก์ไม่สำเร็จ')
    } finally {
      setAccessUrlLoading(false)
    }
  }

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<TrackingFormValues>({
    resolver: yupResolver(trackingSchema),
  })

  const callAction = async (endpoint: string, body?: object) => {
    const res = await fetch(`/api/orders/${publicToken}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'เกิดข้อผิดพลาด')
    }
    return res.json()
  }

  const handleShip = async (values: TrackingFormValues) => {
    setLoading('ship')
    try {
      await callAction('ship', { provider: values.provider, trackingNo: values.trackingNo })
      toast.success('บันทึกการจัดส่งแล้ว')
      setShowShipForm(false)
      reset()
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'ไม่สามารถบันทึกการจัดส่งได้')
    } finally {
      setLoading(null)
    }
  }

  const handleCancel = async () => {
    if (!confirm('ยืนยันการยกเลิกออเดอร์นี้?')) return
    setLoading('cancel')
    try {
      await callAction('cancel')
      toast.success('ยกเลิกแล้ว')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'ไม่สามารถยกเลิกออเดอร์ได้')
    } finally {
      setLoading(null)
    }
  }

  // Terminal state CONFIRMED — ไม่มี action ให้ seller ทำแล้ว
  if (status === 'CONFIRMED') {
    return (
      <div className="flex items-center gap-2 text-success text-sm font-medium">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        ออเดอร์สำเร็จแล้ว
      </div>
    )
  }

  if (status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 text-danger text-sm font-medium">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        ออเดอร์ถูกยกเลิกแล้ว
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* S-11: สลิปโอนเงิน — แสดงเฉพาะเมื่อ buyer แนบสลิปแล้ว */}
      {slipFileId && (
        <div className="border border-default-200 rounded-xl p-4 flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-dark flex items-center gap-1.5">
            <Icon icon="tabler:receipt" className="text-base text-default-400" />
            สลิปการโอนเงิน
          </h4>
          <SlipViewer slipFileId={slipFileId} />
        </div>
      )}

      {/* S-12: ลิงก์ส่งมอบสินค้าดิจิทัล — แสดงเฉพาะ fulfillmentMode=NO_SHIPPING */}
      {fulfillmentMode === 'NO_SHIPPING' && (
        <div className="border border-default-200 rounded-xl p-4 flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-dark flex items-center gap-1.5">
            <Icon icon="tabler:link" className="text-base text-default-400" />
            ลิงก์เข้าถึงสินค้า/บริการดิจิทัล
          </h4>
          <p className="text-default-400 text-xs">
            กรอก URL เพื่อส่งมอบให้ผู้ซื้อ (ต้องเป็น http หรือ https)
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={accessUrlValue}
              onChange={(e) => setAccessUrlValue(e.target.value)}
              placeholder="https://example.com/download/..."
              className="form-input text-sm flex-1"
              disabled={accessUrlLoading}
            />
            <button
              type="button"
              onClick={handleSaveAccessUrl}
              disabled={accessUrlLoading}
              className="btn bg-primary text-white hover:bg-primary-hover px-4 py-2 text-sm font-medium disabled:opacity-60 whitespace-nowrap"
            >
              {accessUrlLoading ? 'กำลังบันทึก...' : 'บันทึกลิงก์'}
            </button>
          </div>
          {/* แสดง URL ที่บันทึกอยู่ปัจจุบัน (ถ้ามี) เพื่อ seller ยืนยันก่อน refresh */}
          {accessUrl && (
            <p className="text-xs text-default-400 break-all">
              <span className="font-medium text-default-600">บันทึกอยู่:</span> {accessUrl}
            </p>
          )}
        </div>
      )}

      {/* PENDING + fulfillmentMode=SHIPPED → บันทึกการจัดส่ง (spec §2 ship gate) */}
      {status === 'PENDING' && fulfillmentMode === 'SHIPPED' && (
        <>
          <button
            type="button"
            onClick={() => setShowShipForm((v) => !v)}
            disabled={loading !== null}
            className="btn bg-primary text-white hover:bg-primary-hover px-4 py-2 text-sm font-medium disabled:opacity-60 w-full"
          >
            {showShipForm ? 'ซ่อนฟอร์มจัดส่ง' : 'บันทึกการจัดส่ง'}
          </button>

          {showShipForm && (
            <form onSubmit={handleSubmit(handleShip)} className="card border border-default-200 rounded-xl p-4 flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-dark">ข้อมูลการจัดส่ง</h4>

              <div>
                <label className="form-label text-xs mb-1 block">ขนส่ง <span className="text-danger">*</span></label>
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
                        onChange={(opt: any) => field.onChange(opt?.value ?? '')}
                      />
                    )
                  }}
                />
                {errors.provider && <p className="text-danger text-xs mt-1">{errors.provider.message}</p>}
              </div>

              <div>
                <label className="form-label text-xs mb-1 block">เลขพัสดุ <span className="text-danger">*</span></label>
                <input
                  {...register('trackingNo')}
                  type="text"
                  placeholder="เช่น TH123456789"
                  className="form-input text-sm w-full"
                />
                {errors.trackingNo && <p className="text-danger text-xs mt-1">{errors.trackingNo.message}</p>}
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading !== null}
                  className="btn bg-primary text-white hover:bg-primary-hover px-4 py-2 text-sm font-medium disabled:opacity-60 flex-1"
                >
                  {loading === 'ship' ? 'กำลังบันทึก...' : 'ยืนยันจัดส่ง'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowShipForm(false); reset() }}
                  className="btn border border-default-300 bg-card hover:bg-default-50 text-default-700 px-4 py-2 text-sm"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {/* cancel — ทำได้เมื่อ PENDING หรือ SHIPPED (ก่อน CONFIRMED terminal) */}
      {(status === 'PENDING' || status === 'SHIPPED') && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading !== null}
          className="btn border border-danger text-danger hover:bg-danger/10 px-4 py-2 text-sm font-medium disabled:opacity-60 w-full"
        >
          {loading === 'cancel' ? 'กำลังยกเลิก...' : 'ยกเลิกออเดอร์'}
        </button>
      )}
    </div>
  )
}
