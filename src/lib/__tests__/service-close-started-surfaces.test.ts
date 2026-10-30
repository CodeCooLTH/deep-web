import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isServiceJobStarted } from '@/lib/service-status'

/**
 * 00086 P3 — "เริ่มงานแล้ว ⇒ ไม่มีตัวเลือกไม่มาตามนัด" ต้องเหมือนกันทุกจอที่เปิด ServiceCloseSheet
 *
 * ชีตซ่อนตัวเลือกเองเมื่อได้ `serviceStarted` (เทสต์ render อยู่ที่ technician-no-money.ui.test.tsx)
 * แต่ prop เป็น optional — จอที่ลืมส่ง = ยังเห็น "ไม่มาตามนัด" แล้วกดได้ 409 ⇒ ด่านนี้ตรวจว่าทุกจอส่ง
 * ค่าจากตัวตัดสินเดียว (`isServiceJobStarted`) และ payload ของแชททั้ง 2 ทาง (20 ใบแรก + lazy-load) มีค่านี้จริง
 *
 * mutation ที่ต้องแดง: ลบ `serviceStarted={isServiceJobStarted(o)}` ใน CustomerPanel ⇒ เคส CustomerPanel แดง
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** ตัดคอมเมนต์ก่อนสแกน (คอมเมนต์ที่อธิบายกฎไม่นับเป็นการทำตามกฎ) */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const CHAT = 'src/app/(paces)/seller/(chat)/inbox/[conversationId]'
const SURFACES = [
  ['แถบสถานะในแชท (มือถือ)', `${CHAT}/components/OrderProgressBar.tsx`, 'closeOrder'],
  ['แผงลูกค้าด้านขวา (เดสก์ท็อป)', `${CHAT}/components/CustomerPanel.tsx`, 'o'],
  ['การ์ดคิวรายวัน', 'src/components/safepay/appointment-board/AppointmentDayCard.tsx', 'item'],
  ['หน้างาน', 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ServiceJobCard.tsx', null],
] as const

describe('isServiceJobStarted', () => {
  it('มีเวลาเริ่ม (Date/ISO) ⇒ true · null/ไม่มีคีย์ ⇒ false', () => {
    expect(isServiceJobStarted({ serviceStartedAt: '2026-10-29T03:00:00.000Z' })).toBe(true)
    expect(isServiceJobStarted({ serviceStartedAt: new Date() })).toBe(true)
    expect(isServiceJobStarted({ serviceStartedAt: null })).toBe(false)
    expect(isServiceJobStarted({})).toBe(false)
  })
})

describe('ทุกจอที่เปิดชีตปิดงานส่ง serviceStarted', () => {
  it('[blocker] ไม่มีจอเปิด ServiceCloseSheet นอกรายการนี้ (จอใหม่ต้องเข้าด่าน)', () => {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(rel) }
        else if (/\.tsx$/.test(e.name) && /<ServiceCloseSheet\b/.test(code(rel))) found.push(rel)
      }
    }
    walk('src')
    expect(found.sort()).toEqual(SURFACES.map((s) => s[1]).sort())
  })

  for (const [name, path, v] of SURFACES) {
    it(`[blocker] ${name} — ส่ง serviceStarted เข้า ServiceCloseSheet`, () => {
      const src = code(path)
      const block = src.slice(src.search(/<ServiceCloseSheet\b/)).split('/>')[0]
      if (v) expect(block, name).toMatch(new RegExp(`serviceStarted=\\{isServiceJobStarted\\(${v}\\)\\}`))
      else expect(block, name).toMatch(/serviceStarted=\{started\}/)
    })
  }

  it('[blocker] payload แผงแชททั้ง 2 ทางมี serviceStartedAt (select + map)', () => {
    for (const path of [`${CHAT}/page.tsx`, 'src/services/order.service.ts']) {
      const src = code(path)
      expect(src, `${path}: select`).toMatch(/serviceClosedAt: true,\s*serviceStartedAt: true,/)
      expect(src, `${path}: map`).toMatch(/serviceStartedAt: o\.serviceStartedAt \? o\.serviceStartedAt\.toISOString\(\) : null/)
    }
  })
})
