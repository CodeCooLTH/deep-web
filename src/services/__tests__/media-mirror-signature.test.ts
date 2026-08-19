/**
 * media-mirror-signature.test.ts — feature 00051 (S-3) TC-SIG-01/02/03
 *
 * TFR-CMD-02/TD-01: mirrorRemoteImage/mirrorMediaBuffer ต้องรับ options-object ที่มี shopId
 * บังคับ ไม่ใช่ positional — เจตนาป้องกันบั๊ก "ส่ง string เป็น positional ตัวที่ 2 แล้ว compile
 * ผ่านแต่ค่าไหลผิดตัวแปร" (เคยเกิดจริงกับ 'ig-avatar' ที่ shop-channel.service.ts — ดู TC-SHOPID-01)
 *
 * 🛑 ด่านนี้เป็น compile-time ล้วน — บังคับผ่าน `npx tsc --noEmit` ไม่ใช่ runtime assertion
 * `@ts-expect-error` แต่ละบรรทัดจะกลาย "unused directive" (= tsc error ใหม่) เองถ้าวันหนึ่งมีคน
 * แก้ signature ให้ positional/optional กลับมาใช้ได้ — นั่นคือกลไก mutation-proof ของเคสนี้
 * (ลอง mutate `shopId: string` → `shopId?: string` ใน channel-chat.service.ts ชั่วคราวแล้วรัน
 * tsc --noEmit จะเห็น error ใหม่ตรง @ts-expect-error ของ TC-SIG-02/mirrorMediaBuffer)
 *
 * ฟังก์ชัน `_typeOnly_neverCalled` ด้านล่างไม่ถูกเรียกจริงที่ runtime (จะพยายามยิง fetch จริงด้วย
 * URL/args ปลอมถ้าเรียก) — มีไว้ให้ tsc ไล่ตรวจ type เท่านั้น
 */
import { describe, it, expect } from 'vitest'
import { mirrorRemoteImage, mirrorMediaBuffer } from '@/services/channel-chat.service'

function _typeOnly_neverCalled(url: string): void {
  // TC-SIG-01 (blocker): positional string เป็น argument ที่ 2 (รูปแบบเก่า) ต้อง compile ไม่ผ่าน
  // @ts-expect-error TC-SIG-01: mirrorRemoteImage ต้องรับ options-object ไม่ใช่ positional string
  void mirrorRemoteImage(url, 'some-string')

  // TC-SIG-02 (blocker): options-object ที่ไม่มี shopId เลย ต้อง compile ไม่ผ่าน
  // @ts-expect-error TC-SIG-02: shopId เป็น required field ของ options-object
  void mirrorRemoteImage(url, { filenamePrefix: 'ig-avatar' })

  // TC-SIG-03 (regression): options-object ที่มี shopId ครบ ต้อง compile ผ่านปกติ
  void mirrorRemoteImage(url, { shopId: 'x', filenamePrefix: 'ig-avatar' })
  void mirrorRemoteImage(url, { shopId: 'x' }) // filenamePrefix/sourceKey optional — ต้องผ่านด้วย

  // เช็คเดียวกันกับ mirrorMediaBuffer (มติเดียวกันจาก TD-01 — ครอบทั้งสองฟังก์ชัน)
  // @ts-expect-error TC-SIG-01 (mirrorMediaBuffer): positional string แบบเก่าต้อง compile ไม่ผ่าน
  void mirrorMediaBuffer(Buffer.from(''), 'image/png', 'some-string')
  // @ts-expect-error TC-SIG-02 (mirrorMediaBuffer): options-object ที่ไม่มี shopId ต้อง compile ไม่ผ่าน
  void mirrorMediaBuffer(Buffer.from(''), 'image/png', { filenamePrefix: 'line' })
  void mirrorMediaBuffer(Buffer.from(''), 'image/png', { shopId: 'x', filenamePrefix: 'line' })
}

describe('mirrorRemoteImage/mirrorMediaBuffer signature — compile-time only (TC-SIG-01/02/03)', () => {
  it('placeholder runtime assertion — ด่านจริงคือ tsc --noEmit บน _typeOnly_neverCalled ด้านบน (ไม่ถูกเรียกจริง)', () => {
    // ไม่เรียก _typeOnly_neverCalled() จริง — แค่ต้อง reference มันไว้เพื่อไม่ให้เป็น unused function
    // และไม่ให้ vitest ฟ้อง "no tests" ในไฟล์นี้
    expect(typeof _typeOnly_neverCalled).toBe('function')
  })
})
