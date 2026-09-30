import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// [blocker] bug prod 2026-09-29: unread ไม่หายหลังกลับจากห้องแชท จนกว่าจะปิดแอป
// InboxList รับ initialItems จาก router cache (back/forward ใช้ของเก่าไม่จำกัดอายุ) จึงต้อง refresh ตอน mount
// ทดสอบด้วยการสแกนซอร์ส (รีโปไม่มี jsdom) — effect ที่ตั้ง poll 20 วิต้องเรียก scheduleRefresh() ก่อน setInterval
describe('InboxList refresh on mount', () => {
  it('[blocker] effect ของ poll เรียก scheduleRefresh() ทันทีตอน mount', () => {
    const src = readFileSync(
      new URL('../../app/(paces)/seller/(chat)/inbox/components/InboxList.tsx', import.meta.url),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    // ตัดเฉพาะ effect ที่มี 20_000 — จาก useEffect ตัวสุดท้ายก่อนตำแหน่งนั้น (regex non-greedy จาก useEffect
    // ตัวแรกของไฟล์จะกวาด effect อื่นที่เรียก scheduleRefresh อยู่แล้วเข้ามาด้วย = เทสเขียวเปล่า — พิสูจน์ด้วย mutation)
    const end = src.indexOf('}, 20_000)')
    expect(end, 'ต้องมี effect poll 20 วิ').toBeGreaterThan(-1)
    const start = src.lastIndexOf('useEffect(() => {', end)
    const beforeInterval = src.slice(start, end).split('setInterval(')[0]
    expect(beforeInterval).toMatch(/\bscheduleRefresh\(\)/)
  })
})
