/**
 * [blocker] ห้ามประกอบ URL รูปเองด้วยเงื่อนไข "2 กิ่ง" อีก — ต้องผ่าน toFileUrl/fileUrlOf
 *
 * ที่มา (user เจอเองบน prod 2026-08-14): รูปโปรไฟล์พนักงานไม่ขึ้นท้ายบับเบิลในแชท
 * `/account` เซฟค่าเป็น **`/api/files/{id}`** (ProfileForm.tsx) แต่ตัวเรนเดอร์เช็คแค่
 * `startsWith('http')` ⇒ ค่าที่ขึ้นต้นด้วย `/` ตกไป else ได้ `/api/files//api/files/{id}` → 404
 * แล้ว `onError` กลืนให้เป็น fallback ที่ดู "ตั้งใจ" จนไม่มีใครเอะใจ
 *
 * 🛑 ตอนพบ มี **34 จุด** ทั่วรีโปที่ก็อปเงื่อนไข 2 กิ่งนี้ไปเขียนซ้ำ ทั้งที่ `src/lib/file-url.ts`
 * ประกาศตัวเองเป็น SSOT มาตั้งแต่ต้นและ docstring เขียนเตือนเคสนี้ไว้ตรงตัวว่า
 * "ถ้าเติม prefix ให้จะกลายเป็น /api/files//images/... ซึ่งพัง" พร้อมประโยคว่า
 * "การมีจุดเดียวให้เรียกทำให้จุดที่สามไม่พลาดอีก" — แต่ไม่มีอะไรบังคับให้ใครเรียกมัน
 * (`AccountAvatar` เจอบั๊กเดียวกันเมื่อ 2026-07-26 "รูปร้านไม่ขึ้น" แล้วเติมกิ่ง `/` ไปฝั่งเดียว
 *  ⇒ ความรู้มีอยู่ในรีโปแล้ว แต่ไม่ได้เดินทางไปถึงอีก 33 จุด)
 * — `docs/conventions/rule-must-be-enforced-not-described.md`
 *
 * ไม่มี gate ไหนจับได้: ชนิดถูก คลาสถูก URL ถูกไวยากรณ์ มันแค่ชี้ไปที่ที่ไม่มีไฟล์
 *
 * ขอบเขตของด่านนี้ — จับ **เฉพาะรูปแบบ resolver 2 กิ่ง** ที่เป็นตัวบั๊กจริง ไม่ได้ห้าม
 * `` `/api/files/${...}` `` ดิบทั้งหมด เพราะยังมีที่ที่ถูกต้องอยู่จริง 2 กลุ่ม:
 *   1. **write site** — `/account` และหน้าโปรไฟล์ฝั่งผู้ซื้อ *เก็บ* ค่ารูปแบบนี้ลง DB
 *   2. ค่าที่เป็น storage key ล้วนแน่นอน (รูปสินค้า/สลิป/ไฟล์แนบแชท จาก `saveFile()`)
 *      ซึ่งไม่มีทางขึ้นต้นด้วย `/` จึงไม่เคยพังและไม่คุ้มเสี่ยงแก้ยกเข่ง
 * ค่าที่อันตรายจริงคือ `User.avatar` (เป็นได้ทั้ง URL ของ OAuth และ `/api/files/{id}`)
 * ส่วน `Shop.logo` เก็บเป็น storage key ดิบ (`ShopForm`: `logo: logoFileId`) จึงไม่อยู่ในกลุ่มเสี่ยง
 *
 * แดง = มีคนเขียน resolver ของตัวเองขึ้นมาใหม่ → บั๊กเดิมกลับมาที่จุดที่ 35
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SSOT = 'src/lib/file-url.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') walk(full, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) {
      out.push(full)
    }
  }
  return out
}

/**
 * 🛑 ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำ *ถูก* คือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย และคำเตือน
 * นั้นอ้างโค้ดผิดตัวอย่างเต็ม ๆ (ดูหัวไฟล์นี้เอง + คอมเมนต์ใน `ChatAvatar`) ⇒ สแกนดิบจะแดงค้าง
 * ตลอดกาลจากคำเตือนของตัวเอง แล้วถูกบันทึกเป็น "หนี้" ทั้งที่ไม่มีการละเมิดเลย
 * (เกิดมาแล้วกับ grep gate ของ HR9 เมื่อ 2026-08-02→03)
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

/** resolver 2 กิ่ง: เช็ค http แล้วต่อด้วยการเติม `/api/files/` ในนิพจน์เดียวกัน */
const TWO_BRANCH = /\.startsWith\(\s*['"]http['"]\s*\)[^;\n]{0,160}`\/api\/files\/\$\{/

describe('URL รูป — ต้องมาจาก src/lib/file-url.ts ที่เดียว', () => {
  const files = walk('src').filter((f) => f !== SSOT)

  it('ไม่มีใครเขียน resolver 2 กิ่งของตัวเอง', () => {
    const offenders = files.filter((f) => TWO_BRANCH.test(stripComments(readFileSync(f, 'utf8'))))
    expect(offenders, `ให้เรียก toFileUrl()/fileUrlOf() จาก '@/lib/file-url' แทน`).toEqual([])
  })

  it('SSOT มีทั้งสองสัญญา และตรรกะอยู่ที่เดียว (toFileUrl ต่อยอด fileUrlOf ไม่ได้ก็อปเงื่อนไข)', () => {
    const ssot = stripComments(readFileSync(SSOT, 'utf8'))
    expect(ssot).toMatch(/export function toFileUrl\(/)
    expect(ssot).toMatch(/export function fileUrlOf\(/)
    expect(ssot).toMatch(/return fileUrlOf\(value\)/)
    // เงื่อนไขจริงต้องปรากฏครั้งเดียวในไฟล์ — สองครั้ง = ก็อปไปเขียนซ้ำแล้ว
    const branches = ssot.match(/startsWith\("\//g) ?? []
    expect(branches.length).toBe(1)
  })

  it('กิ่ง "/" ยังอยู่ — นี่คือกิ่งที่ขาดไปแล้วทำให้เกิดบั๊ก', () => {
    const ssot = readFileSync(SSOT, 'utf8')
    expect(ssot).toContain('value.startsWith("/")')
  })
})
