/**
 * [blocker] PaymentReceivedCard ต้องอ่าน badge จาก getPaymentBadge() SSOT เสมอ
 * (impeccable critique P1-4, 2026-08-29)
 *
 * ทำไม: เดิม `PaymentReceivedCard.tsx` คำนวณ badge เอง (`received ? info : warning`) โดยไม่รู้จัก
 * `Order.status` เลย ⇒ ออเดอร์ที่ผู้ซื้อกดยืนยันรับของเอง (status='CONFIRMED') โดยร้านไม่เคยกด
 * "ได้รับเงินแล้ว" — จอผู้ซื้อขึ้นเขียว "ชำระแล้ว" (`getPaymentBadge` เช็ค CONFIRMED เป็นกิ่งแรก)
 * ขณะที่จอผู้ขายใบเดียวกันขึ้นส้ม "ยังไม่ได้รับเงิน" ค้างตลอดไปพร้อมปุ่ม primary ที่ไม่มีวันหายไปเอง
 * (ละเมิด HR16 — สองจอตอบคำถามเรื่องเงินคนละคำตอบ)
 *
 * ทั้งไฟล์เป็น JSX + client component — รีโปนี้ไม่มี jsdom/testing-library (ดู CLAUDE.md
 * feedback_hook_return_in_deps_loops) จึงตรวจที่ระดับซอร์ส เหมือนแพตเทิร์น
 * `rail-single-source.test.ts`/`action-set-flags-wired.test.ts` ในโฟลเดอร์เดียวกัน
 *
 * แดง = ห้าม merge
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

const CARD = 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/PaymentReceivedCard.tsx'
const CLIENT = 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderDetailClient.tsx'

describe('PaymentReceivedCard: badge ต้องมาจาก getPaymentBadge() SSOT (P1-4)', () => {
  it('import getPaymentBadge จาก @/lib/order-display', () => {
    const src = stripComments(read(CARD))
    expect(src).toMatch(/import\s*\{\s*getPaymentBadge\s*\}\s*from\s*'@\/lib\/order-display'/)
  })

  it('badge span ใช้ paymentBadge.cls/paymentBadge.label ตรง ๆ ไม่คำนวณเอง', () => {
    const src = stripComments(read(CARD))
    // ต้องเรียก getPaymentBadge ด้วย 4 อาร์กิวเมนต์ตามซิกเนเจอร์ (status, paymentMethod, slipFileId, paymentConfirmedAt)
    expect(src).toMatch(/getPaymentBadge\(\s*status\s*,\s*paymentMethod\s*,\s*slipFileId\s*,\s*paymentConfirmedAtISO\s*\)/)
    // badge span (หัวการ์ด) ต้องอ่านจากผลลัพธ์นั้นตรง ๆ — ไม่ใช่ `received ? 'badge bg-info/15...' : ...` แบบเดิม
    expect(src).toMatch(/<span className=\{paymentBadge\.cls\}>\{paymentBadge\.label\}<\/span>/)
  })

  it('ปุ่ม "ได้รับเงินแล้ว" ต้องไม่แสดงเมื่อ status===CONFIRMED (แม้ยังไม่ received)', () => {
    const src = stripComments(read(CARD))
    // ต้องมีกิ่งที่คืน null เมื่อ status เป็น CONFIRMED ก่อนถึงปุ่ม onMarkReceived
    const guardIdx = src.search(/status === 'CONFIRMED' \? null/)
    const buttonIdx = src.indexOf('onClick={onMarkReceived}')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(buttonIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(buttonIdx)
  })

  it('OrderDetailClient ต้องส่ง prop status เข้า PaymentReceivedCard เสมอ', () => {
    const src = stripComments(read(CLIENT))
    const match = src.match(/<PaymentReceivedCard[\s\S]{0,400}?\/>/)
    expect(match).not.toBeNull()
    expect(match?.[0]).toMatch(/status=\{status\}/)
  })
})
