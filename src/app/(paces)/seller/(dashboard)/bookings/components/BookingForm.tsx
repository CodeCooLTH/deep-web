'use client'

/**
 * BookingForm — สร้างการจอง (feature 00017 Phase 2, FR-LODG-08/14/22)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/components/RoomForm.tsx
 *   (โครง .card > .card-body > form-label/form-input/form-select + RHF + yup เดียวกัน)
 *
 * IMPORTANT: ยอดรวม/มัดจำมาจาก server (endpoint quote) เสมอ ไม่คำนวณเองฝั่งนี้ —
 * สูตรมีที่เดียวใน booking.service (SRS TFR-002) ต่างจาก RoomForm ที่คำนวณ preview
 * ได้เพราะยังไม่มีข้อมูลจริงให้ถาม
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { CANCEL_REASONS } from '@/lib/lodging'

type Room = { id: string; name: string; pricePerNight: string }

type Quote = {
  nights: number
  pricePerNight: string
  totalAmount: string
  depositMode: string
  depositValue: string
  depositAmount: string
}

type CancellationSummary = { total: number; byReason: Record<string, number> }

const schema = Yup.object({
  roomId: Yup.string().required('เลือกห้องพัก'),
  checkIn: Yup.string().required('เลือกวันเข้าพัก'),
  checkOut: Yup.string().required('เลือกวันเช็คเอาท์'),
  guestName: Yup.string().trim().min(1, 'กรอกชื่อผู้จอง').max(100).required('กรอกชื่อผู้จอง'),
  guestPhone: Yup.string()
    .trim()
    .matches(/^0\d{8,9}$/, 'เบอร์โทรไม่ถูกต้อง')
    .required('กรอกเบอร์โทรผู้จอง'),
  depositAmount: Yup.string().default(''),
  internalNote: Yup.string().max(1000).default(''),
})

type FormValues = Yup.InferType<typeof schema>

function baht(v: string | number): string {
  return Number(v).toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

export default function BookingForm({ rooms }: { rooms: Room[] }) {
  const router = useRouter()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [history, setHistory] = useState<CancellationSummary | null>(null)
  const [conflict, setConflict] = useState<{ from: string; to: string } | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      roomId: rooms[0]?.id ?? '',
      checkIn: '',
      checkOut: '',
      guestName: '',
      guestPhone: '',
      depositAmount: '',
      internalNote: '',
    },
  })

  const roomId = watch('roomId')
  const checkIn = watch('checkIn')
  const checkOut = watch('checkOut')
  const guestPhone = watch('guestPhone')

  // ขอ quote จาก server ทุกครั้งที่ห้อง/ช่วงวันเปลี่ยน — ไม่คำนวณเอง
  useEffect(() => {
    if (!roomId || !checkIn || !checkOut || checkOut <= checkIn) {
      setQuote(null)
      return
    }
    let cancelled = false
    setQuoting(true)
    setConflict(null)
    fetch('/api/shops/current/bookings/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, checkIn, checkOut }),
      cache: 'no-store',
    })
      .then(async (r) => (r.ok ? ((await r.json()) as Quote) : null))
      .then((q) => {
        if (cancelled) return
        setQuote(q)
        // เติมยอดมัดจำที่คำนวณได้ให้ก่อน เจ้าของแก้ทับได้ (BR-LODG-14)
        if (q) setValue('depositAmount', q.depositAmount)
      })
      .catch(() => {})
      .finally(() => !cancelled && setQuoting(false))
    return () => {
      cancelled = true
    }
  }, [roomId, checkIn, checkOut, setValue])

  /** ค้นประวัติผู้จองเมื่อกรอกเบอร์ครบ — เตือนเท่านั้น ไม่บล็อก (BR-LODG-39) */
  const lookupGuest = useCallback(async () => {
    if (!/^0\d{8,9}$/.test(guestPhone)) {
      setHistory(null)
      return
    }
    try {
      const res = await fetch(
        `/api/shops/current/customers/lookup?phone=${encodeURIComponent(guestPhone)}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return
      const data = (await res.json()) as {
        found: boolean
        name: string | null
        cancellationSummary?: CancellationSummary
      }
      setHistory(data.found ? (data.cancellationSummary ?? null) : null)
      // เติมชื่อให้ถ้าเคยสั่งกับร้านนี้ (ลดการพิมพ์ซ้ำ) แต่ไม่ทับถ้าเจ้าของพิมพ์ไปแล้ว
      if (data.name && !watch('guestName')) setValue('guestName', data.name)
    } catch {
      /* ค้นไม่ได้ไม่ควรขวางการสร้างการจอง — เงียบไว้ */
    }
  }, [guestPhone, setValue, watch])

  const onSubmit = async (values: FormValues) => {
    setConflict(null)
    try {
      const res = await fetch('/api/shops/current/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: values.roomId,
          checkIn: values.checkIn,
          checkOut: values.checkOut,
          guestName: values.guestName.trim(),
          guestPhone: values.guestPhone.trim(),
          ...(values.depositAmount ? { depositAmount: Number(values.depositAmount).toFixed(2) } : {}),
          ...(values.internalNote ? { internalNote: values.internalNote } : {}),
        }),
        cache: 'no-store',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data?.error === 'ROOM_UNAVAILABLE') {
          // server ส่งช่วงวันที่ชนมาด้วย — แสดงให้เห็นเลยว่าติดวันไหน ไม่ต้องไปเปิดปฏิทินหา
          setConflict(data.conflict ?? null)
          pacesToast.error(
            data.conflict
              ? `ห้องนี้มีการจองอยู่แล้ววันที่ ${data.conflict.from} ถึง ${data.conflict.to}`
              : 'ห้องนี้ถูกจองในช่วงวันที่เลือกแล้ว ลองเลือกวันอื่นหรือห้องอื่น',
          )
          return
        }
        const map: Record<string, string> = {
          VALIDATION_ERROR: 'ข้อมูลบางช่องยังไม่ถูกต้อง ลองตรวจอีกครั้ง',
          INVALID_DATE_RANGE: 'วันเช็คเอาท์ต้องอยู่หลังวันเข้าพักอย่างน้อย 1 คืน',
          DEPOSIT_EXCEEDS_TOTAL: 'ยอดมัดจำมากกว่ายอดรวมของการจอง ลองลดยอดมัดจำลง',
          ROOM_INACTIVE: 'ห้องนี้ปิดรับจองอยู่ เปิดใช้งานห้องก่อนจึงจะสร้างการจองได้',
          // feature 00028 — ห้ามระบุชื่อประเภทที่เดาเอา: ร้านที่ไม่ใช่บ้านพักมีได้ 2 ประเภทแล้ว
          NOT_LODGING_SHOP: 'ร้านนี้ไม่ได้ตั้งไว้เป็นประเภทบ้านพัก จึงยังไม่มีระบบห้องพัก',
        }
        pacesToast.error(map[data?.error as string] ?? 'สร้างการจองไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      const created = (await res.json()) as { token: string }
      pacesToast.success('สร้างการจองแล้ว')
      router.push(`/bookings/${created.token}`)
      router.refresh()
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    }
  }

  if (rooms.length === 0) {
    return (
      <div className="card">
        <div className="card-body flex flex-col items-center gap-3 py-12 text-center">
          <Icon icon="tabler:building-cottage" className="text-default-400 size-8" />
          <p className="text-default-600">ยังไม่มีห้องพักที่เปิดรับจอง</p>
          <a href="/rooms/new" className="btn bg-primary text-white hover:bg-primary-hover">
            เพิ่มห้องพักก่อน
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">รายละเอียดการจอง</h4>
        </div>
        <div className="card-body">
          <div className="gap-base grid grid-cols-1 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <label className="form-label">
                ห้องพัก<span className="text-danger ms-0.5">*</span>
              </label>
              {/* HR6: field ที่ bind RHF ใช้ form-select native */}
              <select className="form-select" {...register('roomId')}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · ฿{baht(r.pricePerNight)}/คืน
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">
                วันเข้าพัก<span className="text-danger ms-0.5">*</span>
              </label>
              <input type="date" className="form-input" {...register('checkIn')} />
              {errors.checkIn && <p className="text-danger mt-1 text-sm">{errors.checkIn.message}</p>}
            </div>

            <div>
              <label className="form-label">
                วันเช็คเอาท์<span className="text-danger ms-0.5">*</span>
              </label>
              <input type="date" className="form-input" min={checkIn || undefined} {...register('checkOut')} />
              {errors.checkOut && <p className="text-danger mt-1 text-sm">{errors.checkOut.message}</p>}
            </div>
          </div>

          {conflict && (
            <div className="border-danger bg-danger/10 mt-4 rounded-lg border p-3">
              <p className="text-danger text-sm">
                ห้องนี้มีการจองอยู่แล้ววันที่ {conflict.from} ถึง {conflict.to} — เลือกวันอื่นหรือห้องอื่น
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h4 className="card-title">ผู้จอง</h4>
        </div>
        <div className="card-body">
          <div className="gap-base grid grid-cols-1 lg:grid-cols-2">
            <div>
              <label className="form-label">
                เบอร์โทร<span className="text-danger ms-0.5">*</span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                className="form-input"
                placeholder="08xxxxxxxx"
                {...register('guestPhone')}
                onBlur={lookupGuest}
              />
              {errors.guestPhone && (
                <p className="text-danger mt-1 text-sm">{errors.guestPhone.message}</p>
              )}
            </div>

            <div>
              <label className="form-label">
                ชื่อผู้จอง<span className="text-danger ms-0.5">*</span>
              </label>
              <input type="text" className="form-input" {...register('guestName')} />
              {errors.guestName && (
                <p className="text-danger mt-1 text-sm">{errors.guestName.message}</p>
              )}
            </div>
          </div>

          {/* คำเตือนประวัติ — เป็นข้อเท็จจริง ไม่ตัดสินผู้จอง และไม่บล็อกการสร้าง (BR-LODG-39) */}
          {history && history.total > 0 && (
            <div className="border-warning bg-warning/10 mt-4 rounded-lg border p-3">
              <p className="text-default-800 text-sm font-medium">
                เบอร์นี้มีประวัติการจองที่ถูกยกเลิก {history.total} ครั้ง
              </p>
              <p className="text-default-600 mt-0.5 text-sm">
                {Object.entries(history.byReason)
                  .map(([k, n]) => `${CANCEL_REASONS[k as keyof typeof CANCEL_REASONS]?.label ?? k} ${n}`)
                  .join(' · ')}
              </p>
            </div>
          )}

          <div className="mt-4">
            <label className="form-label">
              บันทึกภายใน <span className="text-default-400 text-xs">(ผู้จองไม่เห็น)</span>
            </label>
            <textarea className="form-input" rows={2} {...register('internalNote')} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h4 className="card-title">ยอดเงิน</h4>
        </div>
        <div className="card-body">
          {quoting ? (
            <p className="text-default-500 flex items-center gap-2 text-sm">
              <Icon icon="tabler:loader-2" className="size-4 animate-spin" />
              กำลังคำนวณ
            </p>
          ) : quote ? (
            <>
              <div className="bg-default-50 border-default-200 rounded-lg border p-3">
                <p className="text-default-600 text-sm">
                  {quote.nights} คืน × ฿{baht(quote.pricePerNight)}
                </p>
                <p className="text-default-800 mt-1 font-medium">
                  ยอดรวม ฿{baht(quote.totalAmount)}
                </p>
              </div>

              <div className="mt-4">
                <label className="form-label">ยอดมัดจำที่ให้ผู้จองโอน</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="form-input"
                    {...register('depositAmount')}
                  />
                  <span className="text-default-500 shrink-0">บาท</span>
                </div>
                <p className="text-default-400 mt-1 text-xs">
                  ค่าเริ่มต้นของห้อง{' '}
                  {quote.depositMode === 'PERCENT'
                    ? `${Number(quote.depositValue)}% = ฿${baht(quote.depositAmount)}`
                    : `฿${baht(quote.depositValue)}`}
                  {' · '}ใส่ 0 หากไม่เก็บมัดจำ
                </p>
              </div>
            </>
          ) : (
            <p className="text-default-500 text-sm">เลือกห้องและช่วงวันเพื่อดูยอดเงิน</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/bookings')}
          className="btn bg-default-200 text-default-800 min-h-11"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !quote}
          className="btn bg-primary min-h-11 text-white hover:bg-primary-hover"
        >
          {isSubmitting && <Icon icon="tabler:loader-2" className="me-1 size-4 animate-spin" />}
          สร้างการจอง
        </button>
      </div>
    </form>
  )
}
