import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * [blocker] ทุกคำขอของ iShip ต้องผูกกับ "ร้านที่ผู้ใช้กำลังมองอยู่" ไม่ใช่ร้านที่ active
 * (feature 00022 × 00037)
 *
 * กล่องแชทรวมหลายร้านเปิดเธรดของร้าน B ได้โดยที่ `activeShopId` ยังเป็นร้าน A (BR-UNI-07)
 * แผงพัสดุในเธรดนั้นจึงถาม iShip ของร้านผิดใบ → `resolveOrderIdByToken` หาออเดอร์ไม่เจอ →
 * "ไม่พบคำสั่งซื้อนี้" พร้อมปุ่ม "ลองใหม่" ที่**กดกี่ครั้งก็ไม่มีวันผ่าน**
 *
 * 🛑 สแกนจากซอร์สจริง ไม่ใช่รายชื่อไฟล์ที่ hardcode — ไฟล์/endpoint ที่เพิ่มทีหลังถูกจับด้วย
 * ซึ่งเป็นทั้งหมดที่กันไม่ให้ "จุดที่ลืม" กลับมาอีก (guard ที่หายไป = หายทั้งคลาส)
 */

function grep(pattern: string, path: string): string[] {
  try {
    return execFileSync('grep', ['-rn', '--include=*.ts', '--include=*.tsx', '-E', pattern, path], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return [] // grep exit 1 = ไม่เจอ
  }
}

describe('[blocker] iShip — ทุก request ผูกกับร้านที่ระบุ', () => {
  it('ไม่มี route ของ iShip ที่เรียก requireGeneralShop โดยไม่ส่ง shopId', () => {
    // ผ่านได้เฉพาะรูปที่มี shopId อยู่ในอ็อบเจกต์ตัวเลือก
    const calls = grep('requireGeneralShop\\(', 'src/app/api/seller/iship')
    const missing = calls.filter((line) => !line.includes('shopId'))
    expect(missing).toEqual([])
  })

  it('ไม่มี component/hook ที่ยิง /api/seller/iship ตรง ๆ โดยไม่ผ่าน ishipUrl()', () => {
    const calls = grep("fetch\\(['\"`]/api/seller/iship", 'src/components/safepay/iship')
    // ทุกเส้นต้องเขียนเป็น fetch(ishipUrl('/api/seller/iship/...')) — ตัวที่ยิงตรงคือตัวที่ลืม
    expect(calls).toEqual([])
  })

  it('after-order-create ส่ง shopId ต่อไปให้ endpoint เปิดพัสดุ', () => {
    const src = readFileSync('src/lib/iship/after-order-create.ts', 'utf8')
    // ต้องมีการต่อ query จริง ไม่ใช่แค่รับพารามิเตอร์มาแล้วไม่ใช้
    expect(src).toMatch(/shopId \? `\?shopId=\$\{encodeURIComponent\(shopId\)\}` : ''/)
    expect(src).toMatch(/postShipment\(orderId, shopId\)/)
  })
})
