'use client'

/**
 * ResourceForm — สร้าง/แก้ไขคิวงานที่รับได้ (feature 00024, FR-RSV-01 + FR-RSV-12)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/components/RoomForm.tsx
 *   — โครงเดียวกัน: .card > .card-body > form-label/form-input/form-select + ปุ่มท้ายฟอร์ม
 *     ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx
 *   ตัดออกจากต้นแบบ: รูปภาพ, สิ่งอำนวยความสะดวก, ราคาต่อคืน, จำนวนผู้เข้าพัก
 *   เก็บไว้เหมือนเดิม: บล็อกมัดจำ (โหมด + จำนวน + กล่องตัวอย่าง)
 *   เพิ่ม: ระยะเวลามาตรฐาน, จำนวนคิวที่รับพร้อมกัน, กล่องเตือนตอนลดคิวไม่ได้
 *
 * Design Spec: safepay-ux ส่วน A. RHF + yup ตาม convention ฝั่ง frontend
 * (backend ใช้ Valibot — คนละชั้น ไม่ปนกัน)
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { APPOINTMENT_DEPOSIT_MODES } from '@/lib/appointments'
import { formatDateTime } from '@/lib/format-date'
import type { SerializedServiceResource } from '@/services/service-resource.service'

/** ยอดสมมติในกล่องตัวอย่าง — 1,000 บาท อ่านง่ายและคิดเปอร์เซ็นต์ในใจได้ทันที */
const PREVIEW_TOTAL = 1000

const schema = Yup.object({
  name: Yup.string()
    .trim()
    .min(1, 'ใส่ชื่อไว้เพื่อให้เลือกได้ตอนสร้างออเดอร์')
    .max(100, 'ชื่อยาวได้ไม่เกิน 100 ตัวอักษร')
    .required('ใส่ชื่อไว้เพื่อให้เลือกได้ตอนสร้างออเดอร์'),
  description: Yup.string().max(1000).default(''),
  durationMinutes: Yup.number()
    .typeError('ใส่เป็นตัวเลข')
    .integer('ใส่เป็นจำนวนเต็ม เช่น 60')
    .min(1, 'ระยะเวลาต้องมากกว่า 0 นาที')
    .nullable()
    // .defined() จำเป็น: .nullable() อย่างเดียวทำให้ InferType มองเป็น optional
    // แล้วชนกับ generic ของ useForm (TS2322) — defined = ต้องมี key แต่เป็น null ได้
    .defined()
    .transform((v, o) => (o === '' || o === null ? null : v)),
  capacity: Yup.number()
    .typeError('ใส่เป็นตัวเลข')
    .integer('จำนวนคิวใส่เป็นจำนวนเต็ม เช่น 1')
    .min(1, 'รับได้อย่างน้อย 1 คิว')
    .default(1)
    .required('ใส่จำนวนคิวที่รับพร้อมกันได้'),
  depositMode: Yup.string().oneOf(['FIXED', 'PERCENT']).default('FIXED'),
  depositValue: Yup.number()
    .typeError('ใส่เป็นตัวเลข')
    .min(0, 'มัดจำติดลบไม่ได้ ใส่ 0 ถ้าไม่เก็บมัดจำ')
    .default(0)
    .when('depositMode', {
      is: 'PERCENT',
      then: (s) => s.max(100, 'เปอร์เซ็นต์มัดจำใส่ได้ไม่เกิน 100'),
    }),
})

type FormValues = Yup.InferType<typeof schema>

type Props = {
  resource?: SerializedServiceResource
}

/** รายละเอียดของนัดที่ทำให้ลดจำนวนคิวไม่ได้ (409 CAPACITY_REDUCTION_BLOCKED) */
type BlockedBy = { orderNo: string | null; start: string; end: string }

export default function ResourceForm({ resource }: Props) {
  const router = useRouter()
  const isEdit = !!resource
  const [blockedBy, setBlockedBy] = useState<BlockedBy | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: resource?.name ?? '',
      description: resource?.description ?? '',
      durationMinutes: resource?.durationMinutes ?? null,
      capacity: resource?.capacity ?? 1,
      depositMode: (resource?.depositMode as 'FIXED' | 'PERCENT') ?? 'FIXED',
      depositValue: resource ? Number(resource.depositValue) : 0,
    },
  })

  const depositMode = watch('depositMode')
  const depositValue = watch('depositValue')

  /**
   * ตัวอย่างการคำนวณมัดจำ — แสดงผลเท่านั้น
   *
   * IMPORTANT: ยอดจริงคำนวณที่ server เสมอ (computeAppointmentDeposit) ที่นี่คำนวณซ้ำ
   * เพื่อให้เจ้าของเห็นผลลัพธ์ทันที ต้องใช้สูตรเดียวกันเป๊ะ รวมถึงการตัดไม่ให้เกินยอดรวม
   */
  const preview = useMemo(() => {
    const v = Number(depositValue) || 0
    if (v <= 0) return null
    const raw = depositMode === 'PERCENT' ? (PREVIEW_TOTAL * v) / 100 : v
    const deposit = Math.min(Math.round(raw * 100) / 100, PREVIEW_TOTAL)
    return { deposit, remaining: PREVIEW_TOTAL - deposit }
  }, [depositMode, depositValue])

  const onSubmit = async (values: FormValues) => {
    setBlockedBy(null)
    const body = {
      name: values.name.trim(),
      ...(values.description ? { description: values.description } : {}),
      ...(values.durationMinutes ? { durationMinutes: values.durationMinutes } : {}),
      capacity: values.capacity,
      depositMode: values.depositMode,
      depositValue: Number(values.depositValue ?? 0).toFixed(2),
    }
    try {
      const res = await fetch(
        isEdit
          ? `/api/shops/current/service-resources/${resource!.id}`
          : '/api/shops/current/service-resources',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))

        // ลดคิวไม่ได้ — แสดงในฟอร์มใต้ช่องคิว ไม่ใช่ toast เพราะผู้ใช้ยังต้องแก้ค่าต่อ
        if (data?.error === 'CAPACITY_REDUCTION_BLOCKED' && data?.blockedBy) {
          setBlockedBy(data.blockedBy as BlockedBy)
          return
        }

        const map: Record<string, string> = {
          VALIDATION_ERROR: 'มีบางช่องที่กรอกยังไม่ครบหรือไม่ถูกรูปแบบ',
          // feature 00028 BR-SBT-11 — ตัด "บัญชีธุรกิจ" ออก: เงื่อนไขเหลือ vertical เดียว
          // (บัญชีบุคคลที่เป็นร้านสินค้าและบริการใช้คิวงานได้แล้ว) ข้อความเดิมจึงบอกผิด
          FEATURE_NOT_AVAILABLE: 'ระบบนัดหมายใช้ได้เฉพาะร้านประเภทสินค้าและบริการ',
          RESOURCE_NOT_FOUND: 'ไม่พบประเภทงานนี้ในร้าน',
          FORBIDDEN: 'บัญชีนี้ไม่ได้อยู่ในทีมของร้าน จึงจัดการรายการนี้ไม่ได้',
        }
        pacesToast.error(map[data?.error as string] ?? 'บันทึกไม่สำเร็จ ลองกดบันทึกอีกครั้ง')
        return
      }
      pacesToast.success(isEdit ? 'บันทึกแล้ว' : 'เพิ่มประเภทงานแล้ว')
      router.push('/settings/job-types')
      router.refresh()
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {/* การรับนัด (รายวัน/ระบุช่วงเวลา) ย้ายมาเป็นการ์ดแยกใบในหน้านี้แล้ว (2026-08-08 → แยกหน้า 2026-08-12)
          — มันเป็นค่าระดับ **ร้าน** ไม่ใช่ของประเภทงานใบใดใบหนึ่ง และการฝังไว้ที่นี่แปลว่า
          ร้านที่ตั้งประเภทงานเสร็จแล้วจะหาไม่เจออีกเลย (ร้าน BT รายงานจริง: สรุปว่าระบบระบุ
          เวลานัดไม่ได้ ทั้งที่แค่ยังไม่ได้สลับโหมด) ผลพลอยได้: ฟอร์มนี้เหลือปุ่มบันทึก/ยกเลิก
          ชุดเดียวที่คุมทุกอย่างในหน้าจริง ๆ แล้ว ไม่มีการ์ดที่บันทึกทันทีปนอยู่ให้สับสน */}

      {/* ── ข้อมูลประเภทงาน ── */}
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">ข้อมูลประเภทงาน</h4>
        </div>
        <div className="card-body">
          <div className="gap-base grid grid-cols-1 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <label htmlFor="res-name" className="form-label">
                ชื่อประเภทงาน<span className="text-danger ms-0.5">*</span>
              </label>
              <input
                id="res-name"
                type="text"
                className="form-input"
                placeholder="เช่น หมอนวด A"
                {...register('name')}
              />
              {errors.name && <p className="text-danger mt-1 text-sm">{errors.name.message}</p>}
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="res-description" className="form-label">
                คำอธิบาย <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
              </label>
              <textarea
                id="res-description"
                className="form-input"
                rows={3}
                placeholder="เช่น นวดแผนไทย นวดน้ำมัน"
                {...register('description')}
              />
            </div>

            <div>
              <label htmlFor="res-duration" className="form-label">
                ระยะเวลามาตรฐาน <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="res-duration"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className="form-input"
                  placeholder="60"
                  {...register('durationMinutes')}
                />
                <span className="text-default-500 shrink-0">นาที</span>
              </div>
              <p className="text-default-500 mt-1 text-sm">
                ใช้เติมเวลาสิ้นสุดให้อัตโนมัติตอนสร้างออเดอร์ แก้ทีหลังได้เสมอ
                ไม่กระทบนัดที่บันทึกไว้แล้ว
              </p>
              {errors.durationMinutes && (
                <p className="text-danger mt-1 text-sm">{errors.durationMinutes.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="res-capacity" className="form-label">
                จำนวนคิวที่รับพร้อมกัน<span className="text-danger ms-0.5">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="res-capacity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className="form-input"
                  placeholder="1"
                  {...register('capacity')}
                />
                <span className="text-default-500 shrink-0">คิว</span>
              </div>
              <p className="text-default-500 mt-1 text-sm">
                จำนวนนัดที่รับพร้อมกันได้ในช่วงเวลาเดียวกัน เช่น หมอนวด 1 คนตั้ง 1 คิว
                คลาสโยคะรับได้ 8 คนตั้ง 8 คิว
              </p>
              {errors.capacity && (
                <p className="text-danger mt-1 text-sm">{errors.capacity.message}</p>
              )}

              {/* ลดคิวไม่ได้ — บอกช่วงเวลาที่ติด พร้อมทางออกที่ทำต่อได้จริง */}
              {blockedBy && (
                <div className="bg-warning/10 border-warning/30 mt-3 rounded-lg border p-3">
                  <p className="text-default-800 font-medium">ลดจำนวนคิวตอนนี้ไม่ได้</p>
                  <p className="text-default-600 mt-1 text-sm">
                    มีนัดจองไว้ในช่วง {formatDateTime(new Date(blockedBy.start))} –{' '}
                    {formatDateTime(new Date(blockedBy.end))}
                    {blockedBy.orderNo ? ` (ออเดอร์ ${blockedBy.orderNo})` : ''}
                  </p>
                  <p className="text-default-600 mt-1 text-sm">
                    ปรับจำนวนคิวให้ไม่ต่ำกว่าจำนวนที่จองไว้แล้ว หรือย้าย/ยกเลิกนัดนั้นก่อน
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── มัดจำเริ่มต้น (FR-RSV-12) ── */}
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">มัดจำเริ่มต้น</h4>
          <p className="text-default-500 mt-0.5 text-sm">
            ใช้เป็นค่าตั้งต้นของประเภทงานนี้ ปรับเป็นรายออเดอร์ได้ตอนสร้างออเดอร์
          </p>
        </div>
        <div className="card-body">
          <div className="gap-base grid grid-cols-1 lg:grid-cols-2">
            <div>
              {/* field ที่ bind RHF ใช้ form-select native ไม่ใช่ hs-dropdown */}
              <label htmlFor="res-deposit-mode" className="form-label">เก็บมัดจำแบบ</label>
              <select id="res-deposit-mode" className="form-select" {...register('depositMode')}>
                {Object.entries(APPOINTMENT_DEPOSIT_MODES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="res-deposit-value" className="form-label">จำนวน</label>
              <div className="flex items-center gap-2">
                <input
                  id="res-deposit-value"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="form-input"
                  {...register('depositValue')}
                />
                <span className="text-default-500 shrink-0">
                  {depositMode === 'PERCENT' ? '%' : 'บาท'}
                </span>
              </div>
              {errors.depositValue && (
                <p className="text-danger mt-1 text-sm">{errors.depositValue.message}</p>
              )}
            </div>
          </div>

          {/* กล่องตัวอย่าง — เจ้าของต้องเห็นผลลัพธ์จริง ไม่ใช่เดาจากโหมดที่เลือก */}
          <div className="bg-default-50 border-default-200 mt-4 rounded-lg border p-3">
            {preview ? (
              <>
                <p className="text-default-500 text-sm">
                  ตัวอย่าง: ออเดอร์ ฿{PREVIEW_TOTAL.toLocaleString('th-TH')}
                </p>
                <p className="text-default-800 mt-1 font-medium">
                  มัดจำ ฿{preview.deposit.toLocaleString('th-TH')}
                </p>
                <p className="text-default-600 text-sm">
                  ลูกค้าจ่ายหน้างานอีก ฿{preview.remaining.toLocaleString('th-TH')}
                </p>
              </>
            ) : (
              <p className="text-default-600 text-sm">
                ไม่เก็บมัดจำ ลูกค้าจ่ายทั้งหมดหน้างาน
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/settings/job-types')}
          className="btn bg-default-200 text-default-800 min-h-11"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn bg-primary min-h-11 text-white hover:bg-primary-hover"
        >
          {isSubmitting && <Icon icon="tabler:loader-2" className="me-1 size-4 animate-spin" />}
          {isEdit ? 'บันทึก' : 'เพิ่มประเภทงาน'}
        </button>
      </div>
    </form>
  )
}
