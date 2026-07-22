'use client'

/**
 * RoomForm — สร้าง/แก้ไขห้องพัก (feature 00017 Phase 1, FR-LODG-04/05/06)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx (field group)
 *   — chase ผ่าน src/app/(paces)/seller/(dashboard)/business/create/components/CreateBusinessForm.tsx
 *     ที่ใช้ pattern เดียวกันอยู่แล้ว (.card > .card-body > form-label/form-input/form-select + card-footer)
 *
 * Design Spec §4. RHF + yup ตาม convention ฝั่ง frontend ของโปรเจกต์
 * (backend ใช้ Valibot — คนละชั้น ไม่ปนกัน)
 */

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import {
  facilitiesByGroup,
  DEPOSIT_MODES,
  MAX_ROOM_NAME_LENGTH,
  MAX_ROOM_DESCRIPTION_LENGTH,
  MAX_ROOM_GUESTS,
} from '@/lib/lodging'
import RoomImages from './RoomImages'
import type { SerializedRoom } from '@/services/room.service'

/** จำนวนคืนสมมติในกล่องตัวอย่าง — 3 คืนเป็นค่าที่พบบ่อยสุดของบ้านพักพักผ่อน */
const PREVIEW_NIGHTS = 3

const schema = Yup.object({
  name: Yup.string()
    .trim()
    .min(1, 'กรุณากรอกชื่อห้อง')
    .max(MAX_ROOM_NAME_LENGTH, `ชื่อห้องต้องไม่เกิน ${MAX_ROOM_NAME_LENGTH} ตัวอักษร`)
    .required('กรุณากรอกชื่อห้อง'),
  description: Yup.string().max(MAX_ROOM_DESCRIPTION_LENGTH).default(''),
  pricePerNight: Yup.number()
    .typeError('กรุณากรอกราคาเป็นตัวเลข')
    .moreThan(0, 'ราคาต่อคืนต้องมากกว่า 0')
    .required('กรุณากรอกราคาต่อคืน'),
  maxGuests: Yup.number()
    .typeError('กรุณากรอกจำนวนเป็นตัวเลข')
    .integer('กรอกเป็นจำนวนเต็ม')
    .min(1, 'อย่างน้อย 1 คน')
    .max(MAX_ROOM_GUESTS, `สูงสุด ${MAX_ROOM_GUESTS} คน`)
    .nullable()
    // .defined() จำเป็น: .nullable() อย่างเดียวทำให้ InferType มองเป็น optional
    // แล้วชนกับ generic ของ useForm (TS2322) — defined = ต้องมี key แต่เป็น null ได้
    .defined()
    .transform((v, o) => (o === '' || o === null ? null : v)),
  depositMode: Yup.string().oneOf(['FIXED', 'PERCENT']).default('FIXED'),
  depositValue: Yup.number()
    .typeError('กรุณากรอกเป็นตัวเลข')
    .min(0, 'ต้องไม่ติดลบ')
    .default(0)
    .when('depositMode', {
      is: 'PERCENT',
      then: (s) => s.max(100, 'เปอร์เซ็นต์มัดจำต้องไม่เกิน 100'),
    }),
  images: Yup.array(Yup.string().required()).default([]),
  facilities: Yup.array(Yup.string().required()).default([]),
})

type FormValues = Yup.InferType<typeof schema>

type Props = { room?: SerializedRoom }

export default function RoomForm({ room }: Props) {
  const router = useRouter()
  const isEdit = !!room

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      name: room?.name ?? '',
      description: room?.description ?? '',
      pricePerNight: room ? Number(room.pricePerNight) : undefined,
      maxGuests: room?.maxGuests ?? null,
      depositMode: (room?.depositMode as 'FIXED' | 'PERCENT') ?? 'FIXED',
      depositValue: room ? Number(room.depositValue) : 0,
      images: room?.images ?? [],
      facilities: room?.facilities ?? [],
    },
  })

  const price = watch('pricePerNight')
  const depositMode = watch('depositMode')
  const depositValue = watch('depositValue')

  /**
   * ตัวอย่างการคำนวณ — แสดงผลเท่านั้น
   * IMPORTANT: ยอดจริงตอนสร้างการจองคำนวณที่ server เสมอ (SRS TFR-002) ที่นี่คำนวณซ้ำ
   * เพื่อ preview ให้เจ้าของเห็นผลลัพธ์ทันที ต้องใช้สูตรเดียวกันเป๊ะ รวมถึงปัดขึ้นบาทเต็ม
   */
  const preview = useMemo(() => {
    const p = Number(price)
    if (!p || p <= 0) return null
    const total = p * PREVIEW_NIGHTS
    const v = Number(depositValue) || 0
    const deposit = depositMode === 'PERCENT' ? Math.ceil((total * v) / 100) : v
    return { total, deposit: Math.min(deposit, total) }
  }, [price, depositMode, depositValue])

  const onSubmit = async (values: FormValues) => {
    const body = {
      name: values.name.trim(),
      ...(values.description ? { description: values.description } : {}),
      images: values.images,
      pricePerNight: Number(values.pricePerNight).toFixed(2),
      ...(values.maxGuests ? { maxGuests: values.maxGuests } : {}),
      facilities: values.facilities,
      depositMode: values.depositMode,
      depositValue: Number(values.depositValue ?? 0).toFixed(2),
    }
    try {
      const res = await fetch(
        isEdit ? `/api/shops/current/rooms/${room!.id}` : '/api/shops/current/rooms',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const map: Record<string, string> = {
          VALIDATION_ERROR: 'ข้อมูลบางช่องยังไม่ถูกต้อง ลองตรวจอีกครั้ง',
          NOT_LODGING_SHOP: 'ธุรกิจนี้ตั้งไว้เป็นประเภทสินค้าและบริการ จึงยังไม่มีระบบห้องพัก',
          TOO_MANY_ROOM_IMAGES: 'เพิ่มรูปได้สูงสุด 10 รูปต่อห้อง',
          ROOM_NOT_FOUND: 'ไม่พบห้องพักนี้ในร้าน',
          FORBIDDEN: 'บัญชีนี้ไม่ได้อยู่ในทีมของร้าน จึงจัดการรายการนี้ไม่ได้',
        }
        pacesToast.error(map[data?.error as string] ?? 'บันทึกไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      pacesToast.success(isEdit ? 'บันทึกห้องพักแล้ว' : 'เพิ่มห้องพักแล้ว')
      router.push('/rooms')
      router.refresh()
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {/* ── ข้อมูลห้อง ── */}
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">ข้อมูลห้องพัก</h4>
        </div>
        <div className="card-body">
          <div className="gap-base grid grid-cols-1 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <label className="form-label">
                ชื่อห้อง<span className="text-danger ms-0.5">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="เช่น พูลวิลล่า A"
                {...register('name')}
              />
              {errors.name && <p className="text-danger mt-1 text-sm">{errors.name.message}</p>}
            </div>

            <div className="lg:col-span-2">
              <label className="form-label">คำอธิบาย</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="เช่น วิลล่า 3 ห้องนอน พร้อมสระส่วนตัว"
                {...register('description')}
              />
            </div>

            <div>
              <label className="form-label">
                ราคาต่อคืน<span className="text-danger ms-0.5">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className="form-input"
                  placeholder="4500"
                  {...register('pricePerNight')}
                />
                <span className="text-default-500 shrink-0">บาท</span>
              </div>
              {errors.pricePerNight && (
                <p className="text-danger mt-1 text-sm">{errors.pricePerNight.message}</p>
              )}
            </div>

            <div>
              <label className="form-label">
                จำนวนผู้เข้าพักสูงสุด <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className="form-input"
                  placeholder="6"
                  {...register('maxGuests')}
                />
                <span className="text-default-500 shrink-0">คน</span>
              </div>
              {errors.maxGuests && (
                <p className="text-danger mt-1 text-sm">{errors.maxGuests.message}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── รูปภาพ ── */}
      <Controller
        control={control}
        name="images"
        render={({ field }) => (
          <RoomImages value={field.value ?? []} onChange={field.onChange} />
        )}
      />

      {/* ── สิ่งอำนวยความสะดวก ── */}
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">สิ่งอำนวยความสะดวก</h4>
        </div>
        <div className="card-body">
          <Controller
            control={control}
            name="facilities"
            render={({ field }) => {
              const selected = new Set(field.value ?? [])
              const toggle = (key: string) => {
                const next = new Set(selected)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                field.onChange([...next])
              }
              return (
                <div className="flex flex-col gap-4">
                  {/* 32 รายการเรียงแบนใช้งานยาก → แบ่งกลุ่มพร้อมหัวข้อคั่น (Design Spec §4) */}
                  {facilitiesByGroup().map((group) => (
                    <div key={group.group}>
                      <p className="text-default-500 mb-2 text-sm font-medium">{group.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((item) => {
                          const on = selected.has(item.key)
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => toggle(item.key)}
                              aria-pressed={on}
                              className={`badge inline-flex min-h-11 items-center gap-1.5 px-3 ${
                                on ? 'bg-primary/15 text-primary' : 'bg-default-100 text-default-700'
                              }`}
                            >
                              <Icon icon={item.icon} className="size-4" />
                              {item.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }}
          />
        </div>
      </div>

      {/* ── มัดจำเริ่มต้น ── */}
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">มัดจำเริ่มต้น</h4>
          <p className="text-default-500 mt-0.5 text-sm">
            ใช้เป็นค่าตั้งต้นของห้องนี้ ปรับเป็นรายการจองได้ตอนสร้างการจอง
          </p>
        </div>
        <div className="card-body">
          <div className="gap-base grid grid-cols-1 lg:grid-cols-2">
            <div>
              {/* HR6: field ที่ bind RHF ใช้ form-select native ไม่ใช่ hs-dropdown */}
              <label className="form-label">เก็บมัดจำแบบ</label>
              <select className="form-select" {...register('depositMode')}>
                {Object.entries(DEPOSIT_MODES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">จำนวน</label>
              <div className="flex items-center gap-2">
                <input
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
            {Number(depositValue) === 0 ? (
              <p className="text-default-600 text-sm">
                ไม่เก็บมัดจำ ผู้จองไม่ต้องโอนก่อน
              </p>
            ) : preview ? (
              <>
                <p className="text-default-500 text-sm">ตัวอย่าง: จอง {PREVIEW_NIGHTS} คืน</p>
                <p className="text-default-700 mt-1 text-sm">
                  ยอดรวม ฿{preview.total.toLocaleString('th-TH')}
                </p>
                <p className="text-default-800 font-medium">
                  มัดจำที่ต้องโอน ฿{preview.deposit.toLocaleString('th-TH')}
                </p>
              </>
            ) : (
              <p className="text-default-500 text-sm">กรอกราคาต่อคืนเพื่อดูตัวอย่างการคิดมัดจำ</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/rooms')}
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
          {isEdit ? 'บันทึก' : 'เพิ่มห้องพัก'}
        </button>
      </div>
    </form>
  )
}
