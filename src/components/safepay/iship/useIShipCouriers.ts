'use client'

/**
 * useIShipCouriers — รายชื่อขนส่งของบัญชีร้าน (feature 00022)
 *
 * โหลดผ่าน proxy ของเราเสมอ (token ไม่ลงมาถึงเบราว์เซอร์) และ cache ระดับโมดูล เพราะทั้ง
 * หน้าคำสั่งซื้อและโมดัลในแชทถามรายการเดียวกัน — รายชื่อนี้เปลี่ยนน้อยมาก ยิงซ้ำทุกครั้งที่
 * เปิดฟอร์มคือ round-trip ไป iShip ที่ไม่ได้อะไรเพิ่ม
 *
 * โหลดไม่ได้ = ไม่บล็อกการสร้างพัสดุ — ฟอร์มปล่อยช่องขนส่งว่างไว้แล้วใช้ค่าตั้งต้นของร้านแทน
 */

import { useEffect, useState } from 'react'
import { useIShipUrl } from '@/components/safepay/iship/iship-shop-context'

export interface IShipCourierOption {
  code: string
  name: string
}

let COURIER_CACHE: IShipCourierOption[] | null = null

export function useIShipCouriers(enabled = true): {
  couriers: IShipCourierOption[]
  loading: boolean
  error: boolean
} {
  // URL ของ iShip ต้องพก shopId ของแผงนี้ไปด้วยเสมอ (ดู iship-shop-context)
  const ishipUrl = useIShipUrl()
  const [couriers, setCouriers] = useState<IShipCourierOption[]>(COURIER_CACHE ?? [])
  const [loading, setLoading] = useState(enabled && !COURIER_CACHE)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!enabled || COURIER_CACHE) return
    let alive = true
    setLoading(true)
    fetch(ishipUrl('/api/seller/iship/couriers'), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: IShipCourierOption[]) => {
        COURIER_CACHE = data
        if (alive) setCouriers(data)
      })
      .catch(() => {
        if (alive) setError(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [enabled])

  return { couriers, loading, error }
}
