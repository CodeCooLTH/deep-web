/**
 * ด่านของปุ่มแรกใน FAB "สร้าง" (แถบล่างของ seller บนมือถือ)
 *
 * user สั่ง 2026-08-23: *"เอาสร้างหมวดหมู่ออก ใส่ สร้างประเภทงานแทนสิ"* — สั่งจากหน้าจอของ
 * ร้าน `SERVICE_QUEUE` (BT Premium)
 *
 * ## 🛑 ทำไมเปลี่ยนแบบเหมารวมทุก vertical ไม่ได้
 *
 * `settings/job-types/page.tsx` เรียก **`notFound()`** เมื่อ `canUseAppointments()` ไม่ผ่าน
 * ⇒ ถ้าร้านขายออนไลน์ได้ปุ่มนี้ด้วย มันคือปุ่มที่พาไปหน้า 404 — แย่กว่าปุ่มเดิมที่ไม่ตรงงานเขา
 *
 * (คลาสเดียวกับ 00028: ระบบประมูล/Inventory เคยกันด้วยการซ่อนเมนูอย่างเดียว แล้วมีทางเข้าอื่น
 * หลุดอยู่ — `docs/conventions/rule-must-be-enforced-not-described.md`)
 *
 * ## 🛑 และต้องใช้เกณฑ์ตัวเดียวกับ guard ของหน้านั้น
 *
 * ถ้า FAB เขียน `vertical === 'SERVICE_QUEUE'` ซ้ำเอง วันที่เกณฑ์เปลี่ยน (เคยเปลี่ยนมาแล้ว —
 * 00028 ถอด `kind === 'BUSINESS'` ออกจาก `canUseAppointments`) ปุ่มกับหน้าจะไม่ตรงกัน
 * แล้วกลายเป็นปุ่มพาไป 404 อีกแบบ **โดยไม่มี `tsc`/build/เทสตัวไหนฟ้อง** เพราะทั้งสองนิพจน์
 * ถูกต้องตามชนิดทุกตัวอักษร (HR16)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { canUseAppointments } from '@/lib/appointments'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const NAV = 'src/app/(paces)/seller/(dashboard)/_shared/SellerBottomNav.tsx'
const LAYOUT = 'src/app/(paces)/seller/(dashboard)/layout.tsx'
const PAGE = 'src/app/(paces)/seller/(dashboard)/settings/job-types/page.tsx'

describe('ปุ่มแรกของ FAB ต้องไม่พาไปหน้า 404', () => {
  it('[blocker] หน้า /settings/job-types ยัง notFound() กับร้านที่ไม่ผ่านเกณฑ์', () => {
    /* ปักหมุดข้อเท็จจริงที่ทำให้ด่านนี้จำเป็น — วันที่หน้านั้นเลิก 404 กฎข้างล่างจะผ่อนได้
       แต่ต้องเป็นการตัดสินใจของคน ไม่ใช่หลุดไปเอง */
    const page = stripComments(read(PAGE))
    expect(page, 'ต้องมี guard ที่เรียก canUseAppointments').toMatch(/canUseAppointments\(/)
    expect(page, 'ไม่ผ่านเกณฑ์ต้อง notFound()').toMatch(/canUseAppointments\([^)]*\)\)\s*notFound\(\)/)
  })

  it('[blocker] FAB ต้องเลือกปลายทางด้วย canUseAppointments ไม่ใช่เทียบ vertical เอง', () => {
    const nav = stripComments(read(NAV))
    expect(nav, 'ต้องเรียก canUseAppointments').toMatch(/canUseAppointments\(\{/)
    expect(
      nav,
      "ห้ามเขียนเกณฑ์ซ้ำเอง — วันที่เกณฑ์เปลี่ยน ปุ่มกับหน้าจะไม่ตรงกันเงียบ ๆ",
    ).not.toMatch(/vertical === 'SERVICE_QUEUE'/)
  })

  it('[blocker] ต้องส่ง kind จริงเข้าเกณฑ์ ไม่ใช่ค่าปลอม', () => {
    /**
     * 🛑 ร่างแรกของงานนี้ส่ง `kind: ''` เพราะ component ไม่มีค่านั้น — ใช้ได้ *ตอนนี้* เพราะ
     * `canUseAppointments` อ่านแต่ `vertical` แต่เป็นระเบิดเวลา: 00028 เคยถอด
     * `kind === 'BUSINESS'` ออกจากเกณฑ์นี้มาแล้ว ⇒ วันที่ใครใส่กลับเข้าไป ค่าปลอมจะทำให้
     * ร้านบริการแบบธุรกิจเห็นปุ่มผิดโดยไม่มีอะไรฟ้อง
     */
    const nav = stripComments(read(NAV))
    expect(nav, 'FAB ต้องรับ kind มาจากผู้เรียก').toMatch(/kind: kind \?\? ''/)
    expect(read(LAYOUT), 'layout ต้องส่ง active.kind ลงไป').toMatch(/shopKind=\{active\.kind\}/)
  })

  it('[blocker] ร้านบริการได้ประเภทงาน · ร้านอื่นได้หมวดหมู่ (ทั้งสองปลายทางต้องมีจริง)', () => {
    const nav = stripComments(read(NAV))
    expect(nav, 'ร้านบริการต้องไปหน้าประเภทงาน').toContain("href: '/settings/job-types'")
    expect(nav, 'ร้านอื่นต้องยังไปหน้าหมวดหมู่เหมือนเดิม').toContain("href: '/categories'")
    expect(nav, 'ป้ายของร้านบริการต้องมาจาก dictionary ไม่ hardcode').toContain(
      't.dashboard.navCreateJobType',
    )
  })

  it('[blocker] เกณฑ์ต้องแยกร้านบริการออกจากร้านอื่นได้จริง', () => {
    /* พิสูจน์ตัวเกณฑ์เอง ไม่ใช่แค่ว่าโค้ดเรียกมัน — ถ้าวันหนึ่ง canUseAppointments คืน true
       ให้ทุกคน ปุ่มจะพาร้านขายออนไลน์ไป 404 ทั้งที่ด่านข้างบนยังเขียวหมด */
    expect(canUseAppointments({ kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' })).toBe(true)
    expect(canUseAppointments({ kind: 'PERSONAL', vertical: 'SERVICE_QUEUE' })).toBe(true)
    expect(canUseAppointments({ kind: 'BUSINESS', vertical: 'ONLINE_SALES' })).toBe(false)
    expect(canUseAppointments({ kind: 'BUSINESS', vertical: 'LODGING' })).toBe(false)
    /* ค่าที่ไม่รู้จัก/ว่าง ต้อง fail-closed → ตกไปหมวดหมู่ ไม่ใช่หลุดไปหน้าที่ 404 */
    expect(canUseAppointments({ kind: '', vertical: '' })).toBe(false)
    expect(canUseAppointments(null)).toBe(false)
  })

  it('[blocker] คีย์ i18n ต้องมีครบทั้งสองภาษา', () => {
    /* ขาดฝั่ง en แล้ว `t.dashboard.navCreateJobType` จะเป็น undefined ⇒ pill ไม่มีข้อความ
       (ปุ่มเปล่า ๆ ที่กดได้) โดย tsc อาจไม่ฟ้องถ้า dictionary ฝั่งนั้นเป็น Partial */
    for (const rel of ['src/i18n/dictionaries/th.ts', 'src/i18n/dictionaries/en.ts']) {
      expect(read(rel), `${rel} ต้องมี navCreateJobType`).toMatch(/navCreateJobType:\s*'[^']+'/)
    }
  })
})
