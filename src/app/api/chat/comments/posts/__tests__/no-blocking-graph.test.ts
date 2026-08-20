/**
 * [blocker] เปิดเธรดคอมเมนต์ต้องไม่รอ Graph — งานคุยกับ Meta ต้องอยู่ใน `after()` เท่านั้น
 *
 * user รายงาน 2026-08-20: กดเข้าเธรดคอมเมนต์แล้วรอเกิน 1 วินาที
 *
 * ต้นเหตุ: `getPostComments()` `await` งาน 2 ตัวเรียงกันก่อนตอบอะไรกลับไป ทั้งที่คอมเมนต์ที่จะแสดง
 * อยู่ในฐานเราครบแล้ว —
 *   1. `backfillPostComments()` เดินทางไป-กลับเซิร์ฟเวอร์ของ Meta 1 รอบ **และตั้งแต่ 98f5c531
 *      ยังดาวน์โหลด/เขียนไฟล์แนบทีละใบแบบ sequential สูงสุด 30 ใบ** (งานที่เพิ่มเข้าไปวันเดียวกัน)
 *   2. `refreshPostStats()` เดินทางไปหา Meta อีกรอบ + mirror รูปปกโพสต์
 *
 * ทั้งคู่ throttle 5 นาทีต่อโพสต์ ⇒ **ช้าเฉพาะครั้งแรกที่กดเข้าโพสต์นั้น** ซึ่งเป็นรูปแบบที่หลอกคน
 * พัฒนาได้ง่ายมาก: กดทดสอบซ้ำ ๆ ตอนเดฟจะเร็วทุกครั้งหลังครั้งแรก แล้วสรุปว่า "ไม่ช้า"
 *
 * 🛑 ทำไมต้องมีเทส ไม่ใช่แค่คอมเมนต์: `comments/page.tsx` แก้ปัญหาเดียวกันนี้ไปแล้วด้วย `after()`
 * พร้อมคอมเมนต์เขียนไว้ตรงตัวว่า "รันใน after() = ไม่ถ่วงเวลาเปิดหน้าเลย" — **แต่ route ของเธรด
 * ไม่ได้ทำตาม** คำอธิบายที่ถูกต้องในไฟล์หนึ่งไม่ได้กันไฟล์ข้าง ๆ ทำผิดแบบเดิม
 * (docs/conventions/rule-must-be-enforced-not-described.md)
 *
 * ทำไมสแกนซอร์ส: vitest ตั้ง `environment: "node"` และรีโปไม่มี jsdom/testing-library
 *
 * 🛑 ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย และคำเตือนนั้นอ้าง
 * ชื่อฟังก์ชันที่ห้ามเรียกแบบ blocking เต็ม ๆ (บทเรียน grep gate ของ HR9 2026-08-02→03)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE = join(
  process.cwd(),
  'src/app/api/chat/comments/posts/[postId]/route.ts',
)

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

describe('[blocker] GET /api/chat/comments/posts/[postId] ต้องไม่รอ Graph', () => {
  const src = stripComments(readFileSync(ROUTE, 'utf8'))

  it('ต้องสั่ง getPostComments แบบ skipBackfill', () => {
    // ไม่ส่ง = service จะ await Graph 2 รอบก่อนตอบ (พฤติกรรมเดิมที่ทำให้ช้าเกิน 1 วินาที)
    expect(src, 'ข้อมูลที่จะแสดงอยู่ในฐานครบแล้ว ไม่มีเหตุให้รอ Meta').toMatch(/skipBackfill: true/)
  })

  it('งานคุยกับ Graph ต้องอยู่ใน after() ทั้งคู่', () => {
    expect(src).toMatch(/after\(/)
    const afterIdx = src.indexOf('after(')
    const backfillIdx = src.indexOf('backfillPostComments(')
    const statsIdx = src.indexOf('refreshPostStats(')
    expect(backfillIdx, 'ต้องมีการเรียก backfillPostComments').toBeGreaterThan(-1)
    expect(statsIdx, 'ต้องมีการเรียก refreshPostStats').toBeGreaterThan(-1)
    // แดง = มีคนย้ายกลับมาไว้ก่อน after() คือกลับเข้าเส้นทางที่ผู้ใช้รออีกครั้ง
    expect(backfillIdx, 'backfillPostComments ต้องอยู่หลัง after(').toBeGreaterThan(afterIdx)
    expect(statsIdx, 'refreshPostStats ต้องอยู่หลัง after(').toBeGreaterThan(afterIdx)
  })

  it('after() ต้องลงทะเบียนหลังด่านสิทธิ์ ไม่ใช่ก่อน', () => {
    // getPostComments เป็นตัวที่ throw FORBIDDEN — ลงทะเบียน after() ก่อนมัน แปลว่าคนที่ไม่มีสิทธิ์
    // ก็สั่งให้เรายิง Graph แทนเขาได้
    const callIdx = src.indexOf('getPostComments(')
    const afterIdx = src.indexOf('after(')
    expect(callIdx).toBeGreaterThan(-1)
    expect(afterIdx, 'after( ต้องอยู่หลัง getPostComments(').toBeGreaterThan(callIdx)
  })
})
