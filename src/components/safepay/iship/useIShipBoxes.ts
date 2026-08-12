'use client'

/**
 * useIShipBoxes — กล่องที่บัญชีร้านใช้ได้ (feature 00022)
 *
 * เหตุผลเดียวกับ useIShipCouriers: โหลดผ่าน proxy ของเรา (token ไม่ลงเบราว์เซอร์)
 * และ cache ระดับโมดูล เพราะหน้าตั้งค่า/หน้าคำสั่งซื้อ/โมดัลแชทถามรายการเดียวกัน
 * และกล่องเปลี่ยนน้อยมาก (สร้างใหม่ต้องไปทำที่หลังบ้าน iShip)
 *
 * โหลดไม่ได้ = ไม่บล็อกอะไร — ร้านกรอกขนาดเองได้อยู่แล้ว ตัวเลือกกล่องเป็นแค่ทางลัด
 */

import { useEffect, useState } from 'react'
import { useIShipUrl } from '@/components/safepay/iship/iship-shop-context'

export interface IShipBoxOption {
  id: number
  name: string
  width: number
  length: number
  height: number
  /** null = กล่องมาตรฐานของ iShip · มีค่า = กล่องที่ร้านสร้างเองบนหลังบ้าน iShip
   *  (snake_case ตามที่ iShip คืนมา — route ส่งต่อ response ดิบ ไม่ได้แปลงชื่อ) */
  user_id?: number | null
}

let BOX_CACHE: IShipBoxOption[] | null = null

export function useIShipBoxes(enabled = true): {
  boxes: IShipBoxOption[]
  loading: boolean
} {
  // URL ของ iShip ต้องพก shopId ของแผงนี้ไปด้วยเสมอ (ดู iship-shop-context)
  const ishipUrl = useIShipUrl()
  const [boxes, setBoxes] = useState<IShipBoxOption[]>(BOX_CACHE ?? [])
  const [loading, setLoading] = useState(enabled && !BOX_CACHE)

  useEffect(() => {
    if (!enabled || BOX_CACHE) return
    let alive = true
    setLoading(true)
    fetch(ishipUrl('/api/seller/iship/boxes'), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: IShipBoxOption[]) => {
        BOX_CACHE = data
        if (alive) setBoxes(data)
      })
      .catch(() => {
        // เงียบ — ตัวเลือกกล่องหายไปเฉย ๆ ช่องกรอกขนาดยังใช้ได้ตามปกติ
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [enabled])

  return { boxes, loading }
}
