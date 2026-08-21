/**
 * ด่านของการเก็บชื่อจาก Sign in with Apple
 *
 * 🛑 Apple ตีกลับเรื่องนี้ **2 รอบ** (Guideline 4 - Design · 2026-08-19 และ 2026-08-21) และรอบที่
 * สองคือรอบที่แพตช์เดิมขึ้น prod ไปแล้ว — แปลว่าการ "แก้แล้วเชื่อว่าแก้แล้ว" ไม่พอสำหรับเรื่องนี้
 * มันต้องมีอะไรที่แดงเมื่อพฤติกรรมถอยหลัง
 *
 * ไฟล์นี้ปักหมุด 2 อย่างที่ถ้าพังแล้วจะเงียบสนิท (ไม่มี tsc/build/eslint ตัวไหนเห็น เพราะชนิด
 * ถูกต้องหมด สิ่งที่ผิดคือ *ความหมาย*):
 *   1. รูปร่าง payload ของ Apple — ชื่ออยู่ใน `user.name.{firstName,lastName}` ไม่ใช่ที่อื่น
 *   2. `sub` ต้องอ่านออกจาก ID token ได้ (เป็นกุญแจของทั้งกลไก) และห้าม throw เมื่อ token พัง
 *
 * ส่วนกติกาของหน้าจอ (`/register`) อยู่ที่ `apple-signin-no-extra-fields.test.ts` — ดูท้ายไฟล์
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  parseAppleUserField,
  rememberAppleSignupName,
  subFromIdToken,
  takeAppleSignupName,
} from '../apple-signup-name'

/** ประกอบ ID token ปลอมให้มีรูปร่างเหมือนของจริง (เราไม่ตรวจลายเซ็น ใช้ sub เป็นกุญแจเท่านั้น) */
function fakeIdToken(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.signature`
}

describe('parseAppleUserField', () => {
  it('[blocker] อ่านชื่อจากรูปร่างจริงที่ Apple ส่งมา', () => {
    const raw = JSON.stringify({
      name: { firstName: 'สมชาย', lastName: 'ใจดี' },
      email: 'a@privaterelay.appleid.com',
    })
    expect(parseAppleUserField(raw)).toBe('สมชาย ใจดี')
  })

  it('[blocker] ไม่มีชื่อ = null ห้ามคืนสตริงว่าง', () => {
    /* ผู้เรียกใช้ `||` เลือกค่าสำรอง — สตริงว่างจะ "ผ่าน" ไปเป็นชื่อว่างเปล่าบนหน้าจอ
       ซึ่งแย่กว่าค่าสำรองที่ตั้งใจไว้ */
    for (const raw of [null, undefined, '', '{}', '{"name":{}}', 'ไม่ใช่ json', '[]']) {
      expect(parseAppleUserField(raw)).toBeNull()
    }
    expect(parseAppleUserField(JSON.stringify({ name: { firstName: '  ', lastName: '' } }))).toBeNull()
  })

  it('มีแค่ชื่อต้นหรือแค่นามสกุลก็ยังใช้ได้ (Apple ปล่อยให้ผู้ใช้แก้ก่อนส่ง)', () => {
    expect(parseAppleUserField(JSON.stringify({ name: { firstName: 'สมชาย' } }))).toBe('สมชาย')
    expect(parseAppleUserField(JSON.stringify({ name: { lastName: 'ใจดี' } }))).toBe('ใจดี')
  })
})

describe('subFromIdToken', () => {
  it('[blocker] อ่าน sub ออกจาก ID token ได้ — เป็นกุญแจของทั้งกลไก', () => {
    expect(subFromIdToken(fakeIdToken({ sub: '001234.abcdef.5678', aud: 'x' }))).toBe('001234.abcdef.5678')
  })

  it('token พัง/ไม่มี sub = null ห้าม throw (throw = ล็อกอิน Apple พังทั้งเส้น)', () => {
    for (const t of [null, undefined, '', 'abc', 'a.b', fakeIdToken({ aud: 'x' })]) {
      expect(subFromIdToken(t)).toBeNull()
    }
  })
})

describe('remember / take', () => {
  it('[blocker] ฝากแล้วรับได้ด้วย sub เดียวกัน และ **อ่านได้ครั้งเดียว**', () => {
    rememberAppleSignupName('sub-1', 'สมชาย ใจดี')
    expect(takeAppleSignupName('sub-1')).toBe('สมชาย ใจดี')
    /* ครั้งที่สองต้องว่าง — ชื่อจริงของคนไม่ควรค้างในหน่วยความจำนานกว่าที่จำเป็น */
    expect(takeAppleSignupName('sub-1')).toBeNull()
  })

  it('sub ที่ไม่เคยฝาก = null (ไม่ใช่ค่าของคนอื่น)', () => {
    rememberAppleSignupName('sub-a', 'คนเอ')
    expect(takeAppleSignupName('sub-b')).toBeNull()
    expect(takeAppleSignupName(null)).toBeNull()
  })
})

/* 🛑 กติกาของหน้า `/register` (ซ่อนช่องชื่อผู้ใช้ / ไม่ปล่อยค่าสำรอง "User" รั่ว) **ไม่ได้อยู่ที่นี่**
   มันอยู่ที่ `apple-signin-no-extra-fields.test.ts` ซึ่งเป็นเจ้าของเรื่องนั้นมาตั้งแต่รอบก่อน
   เขียนซ้ำสองที่ = วันหนึ่งจะแก้ที่เดียวแล้วอีกที่ค้างเป็นกฎเก่าที่ขัดกันเอง (HR16) */

describe('route handler ที่ดักชื่อจาก Apple', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/auth/[...nextauth]/route.ts'), 'utf8')

  it('[blocker] ต้องประกอบ NextRequest ไม่ใช่ Request ธรรมดา', () => {
    /**
     * 🛑 `NextAuthRouteHandler` อ่าน `req.nextUrl.searchParams` (ยืนยันในซอร์สของ next-auth
     * `next/index.js`) ซึ่งมีเฉพาะใน `NextRequest` — ส่ง `Request` เปล่าไปจะได้
     * `undefined.searchParams` ⇒ **ล็อกอิน Apple พังทั้งเส้น**
     *
     * `tsc` จับไม่ได้เพราะพารามิเตอร์ของ handler ที่ `NextAuth()` คืนมาเป็น any
     * และไม่มีเทสไหนยิงเส้นทางนี้จริง ⇒ จะรู้ตัวตอนคนกดปุ่มบน prod เท่านั้น
     */
    expect(src, 'ต้อง import NextRequest').toMatch(/import \{ NextRequest \} from "next\/server"/)
    expect(src, 'ต้องสร้างด้วย new NextRequest').toMatch(/new NextRequest\(/)
    expect(src, 'ห้ามกลับไปใช้ new Request').not.toMatch(/new Request\(/)
  })

  it('[blocker] ต้องดักเฉพาะ callback ของ Apple และส่ง body ต่อครบ', () => {
    /* ดักกว้างเกิน = ทุกเส้นทางของ next-auth (signin/signout/csrf/provider อื่น) ถูกอ่าน body
       แล้วประกอบใหม่โดยไม่จำเป็น · ไม่ส่ง body ต่อ = next-auth ได้ก้อนว่าง แลก code ไม่ได้ */
    expect(src).toMatch(/endsWith\("\/callback\/apple"\)/)
    expect(src).toMatch(/body,/)
  })

  it('[blocker] ชั้นนี้ห้ามทำให้ล็อกอินพัง — ต้อง try/catch แล้วปล่อยผ่าน', () => {
    /* ชั้นนี้มีไว้เก็บ "ชื่อ" ซึ่งเป็นของแถม ส่วนล็อกอินคือของหลัก
       ถ้า throw ที่นี่ = ยอมให้ล็อกอินพังเพื่อแลกชื่อ ซึ่งไม่คุ้มเลย */
    expect(src).toMatch(/catch\s*\{/)
    expect(src.match(/return handler\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})
