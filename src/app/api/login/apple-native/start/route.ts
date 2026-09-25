/**
 * POST /api/login/apple-native/start — ออก nonce ให้รอบการล็อกอินหนึ่งครั้ง
 * (feature 00040 · ภาคผนวก 7)
 *
 * ## 🛑 ทำไม nonce ต้องมาจากเซิร์ฟเวอร์ ไม่ใช่ให้หน้าเว็บสุ่มเอง
 *
 * ร่างแรกของงานนี้ให้หน้าเว็บสุ่ม nonce แล้วส่งมาพร้อมโทเคน — **ซึ่งกันการเล่นโทเคนซ้ำ
 * ไม่ได้เลย** เพราะผู้โจมตีคุมทั้งสองฝั่งของการเทียบ: เขาส่งโทเคนที่ขโมยมา พร้อมกับ
 * ค่า `nonce` ที่อ่านออกมาจากโทเคนใบนั้นเอง แล้วด่านก็ผ่านทุกครั้ง
 * (คอมเมนต์ในร่างแรกอ้างว่ากันได้ — เป็นคำอ้างที่ผิด จับได้ตอนทบทวนก่อน merge
 * · คลาสเดียวกับ `docs/conventions/value-fate-decided-at-write-site.md`)
 *
 * ค่าที่เซิร์ฟเวอร์ออกแล้ว **เก็บไว้ในคุกกี้ httpOnly** ทำให้:
 *   - จาวาสคริปต์ในหน้าอ่านหรือแก้ไม่ได้ ⇒ ค่าที่ใช้เทียบไม่ได้มาจากฝั่งที่เชื่อไม่ได้
 *   - โทเคนเก่าที่ขโมยมาถือ nonce ของรอบอื่น ⇒ ไม่มีวันตรงกับคุกกี้ของรอบนี้
 *   - ใช้ได้ครั้งเดียว (ตัวตรวจลบคุกกี้ทิ้งทันทีที่อ่าน)
 *
 * ## ทำไมไม่เก็บลงฐานข้อมูล
 *
 * ผู้เขียนกับผู้อ่านคือคนเดียวกันและห่างกันไม่กี่วินาที · คุกกี้ httpOnly ให้คุณสมบัติที่
 * ต้องการครบโดยไม่ต้องมีตารางใหม่ ไม่ต้องมีตัวเก็บกวาด และไม่มี round trip ไปฐานข้อมูล
 * ในเส้นทางล็อกอินซึ่งเป็นเส้นที่ต้องไวที่สุด
 */
import { randomBytes } from 'node:crypto'

import { NextResponse } from 'next/server'

import { APPLE_NONCE_COOKIE, APPLE_NONCE_MAX_AGE_SEC } from '@/lib/apple/native-nonce'

export async function POST() {
  const nonce = randomBytes(32).toString('hex')

  const res = NextResponse.json({ nonce })
  res.cookies.set(APPLE_NONCE_COOKIE, nonce, {
    httpOnly: true,
    /**
     * `Lax` ไม่ใช่ `None` — ตัวตรวจถูกเรียกด้วย `fetch` แบบ same-origin จากหน้าเดียวกัน
     * ไม่ได้เดินทางข้ามเว็บเหมือนขากลับของ OAuth (ซึ่งเป็นเหตุผลที่คุกกี้ชุดนั้นต้องเป็น
     * `None` — ดู `crossSiteOAuthCookies` ใน lib/auth.ts) · ตั้งหลวมกว่าที่จำเป็นไม่มีประโยชน์
     */
    sameSite: 'lax',
    /* dev รันบน http://seller.deepth.local ⇒ ตั้ง Secure ไม่ได้ ไม่งั้นเบราว์เซอร์ทิ้งคุกกี้
       แล้วล็อกอิน Apple ในแอปจะพังเฉพาะบนเครื่อง dev โดยไม่มีอะไรบอกสาเหตุ */
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: APPLE_NONCE_MAX_AGE_SEC,
  })
  return res
}
