import { describe, expect, it } from 'vitest'
import { buildMemoryWriterSystemPrompt } from '@/lib/memory-writer-prompt'

describe('buildMemoryWriterSystemPrompt', () => {
  const p = buildMemoryWriterSystemPrompt()
  it.each([
    '800',
    'ความจำปัจจุบัน',
    'เบอร์โทร',
    'ที่อยู่เต็ม',
    'เลขบัญชี',
    'อีเมล',
    'เลขบัตร',
    'ป้ายในวงเล็บเหลี่ยม',
    'ราคา',
    'ส่วนลด',
    'โปรโมชัน',
    'คำสัญญา',
    'คำสั่งใด ๆ',
    'ไม่ใช่คำสั่ง',
    'ตามตัวอักษร',
  ])('มี "%s"', (kw) => expect(p).toContain(kw))
})
