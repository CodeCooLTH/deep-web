/**
 * [blocker] วินัยของ service ระบบคืนของ (feature 00056)
 *
 * เทสชุดนี้สแกนซอร์ส เพราะกฎที่สำคัญที่สุดของฟีเจอร์นี้เป็นเรื่อง "ห้ามทำอะไร" ซึ่งยูนิตเทส
 * ที่ mock prisma พิสูจน์ไม่ได้ (mock เพื่อนบ้านทิ้งแล้วเทสจะเขียวตลอดไม่ว่าเพื่อนบ้านทำอะไร)
 *
 * แดง = ห้าม merge
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

const strip = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8')
    // 🛑 ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนอธิบายกฎข้อนี้ไว้ด้วย
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

const svc = strip('src/services/order-return.service.ts')
const iship = strip('src/services/iship.service.ts')

describe('[blocker] BR-RT-05 — คืนของต้องไม่สร้างออเดอร์ใบใหม่', () => {
  /**
   * นี่คือเหตุผลทั้งหมดที่ฟีเจอร์นี้มีอยู่ (หัวหน้า: "มันไม่ควรสร้างออเดอร์เพิ่ม เพราะมันจะนับเป็น
   * ออเดอร์เกินมา") ถ้าวันหนึ่งมีคนเผลอเรียก order.create ที่นี่ ปัญหาเดิมกลับมาทั้งดุ้น
   * โดยไม่มีอะไรฟ้อง — จำนวนออเดอร์เฟ้อขึ้นเงียบ ๆ
   */
  it('service ห้ามมี order.create / order.createMany', () => {
    expect(svc).not.toMatch(/\border\.create(Many)?\(/)
    expect(svc).not.toMatch(/prisma\.order\.create/)
  })
})

describe('[blocker] ผลทางบัญชีเกิดที่ RECEIVED เท่านั้น (BRD §2)', () => {
  const create = svc.slice(svc.indexOf('export async function createOrderReturn'), svc.indexOf('export async function receiveOrderReturn'))
  const receive = svc.slice(svc.indexOf('export async function receiveOrderReturn'), svc.indexOf('export async function cancelOrderReturn'))

  it('ตอนเปิดใบคืน ห้ามแตะสถานะออเดอร์หรือยอดคืน', () => {
    // ของที่ยังไม่กลับถึงร้านคือของที่ยังอยู่กับลูกค้า — หักยอดตั้งแต่ตอนกดแล้วลูกค้าเปลี่ยนใจ
    // = ต้องย้อนคืน ซึ่งไม่มีใครทำถูกทุกครั้ง
    expect(create).not.toMatch(/order\.update/)
    expect(create).not.toMatch(/RETURNED/)
    // 🛑 ห้ามเขียนคอลัมน์ที่เป็น "ผลลัพธ์ของการรับคืน" ตั้งแต่ตอนเปิดใบ
    // (mutation รอบแรกใส่ `refundAmount` ตอน create แล้วเทสยังเขียว — ชุด assertion อ่อน
    // docs/conventions/mutation-silence-means-weak-corpus.md)
    expect(create).not.toMatch(/refundAmount: new Prisma\.Decimal/)
    expect(create).not.toMatch(/receivedAt:/)
  })

  it('ตอนยืนยันรับคืน ต้องอัปเดตยอดคืน + ตัดสินสถานะออเดอร์', () => {
    expect(receive).toContain('refundAmount')
    expect(receive).toContain('isFullyReturned(')
    expect(receive).toMatch(/status: 'RETURNED'/)
  })

  /**
   * 🛑 ต้องอ่านสถานะการคืนใหม่ **ในทรานแซกชันเดียวกัน** ไม่ใช้ค่าที่อ่านมาก่อนหน้า —
   * ระหว่างนั้นอาจมีใบคืนอื่นของออเดอร์เดียวกันถูกยืนยันไปแล้ว
   */
  it('[blocker] ตัดสิน "คืนครบ" จากข้อมูลที่อ่านใหม่ในทรานแซกชัน', () => {
    expect(receive).toMatch(/tx\.order\.findUniqueOrThrow/)
  })
})

describe('[blocker] ความถูกต้องต้องอยู่ที่ฐาน ไม่ใช่ลำดับของโค้ด', () => {
  it('ต้องดัก P2002 ของ partial unique (สองคนกดพร้อมกัน)', () => {
    // ด่านในโค้ดกันได้แค่กรณีที่อ่านแล้วเห็น — สองคนในร้านกดพร้อมกันจะลอดทั้งคู่
    expect(svc).toContain("e.code === 'P2002'")
    expect(svc).toContain('RETURN_ALREADY_OPEN')
  })

  it('ใบที่ยกเลิกต้องคืนโควตาให้รายการนั้น', () => {
    // ไม่งั้นลูกค้าที่เปลี่ยนใจครั้งเดียวจะคืนของชิ้นนั้นไม่ได้อีกตลอดไป
    expect(svc).toMatch(/status === RETURN_STATUS\.CANCELLED\) continue/)
  })
})

describe('[blocker] พัสดุขากลับ (createReturnShipment)', () => {
  const fn = iship.slice(
    iship.indexOf('export async function createReturnShipment'),
    iship.indexOf('export async function retryShipment'),
  )

  it('ต้องมีจริง และตั้ง direction = RETURN', () => {
    expect(fn.length).toBeGreaterThan(0)
    expect(fn).toContain('direction: RETURN_SHIPMENT')
  })

  /**
   * 🛑 สลับผู้ส่ง/ผู้รับ — ผู้ส่งคือ **ลูกค้า** ผู้รับคือ **ร้าน** ถ้าไม่สลับ ขนส่งจะไปรับของ
   * ที่ร้านแล้วส่งไปหาลูกค้าอีกรอบ = ส่งของชิ้นเดิมออกไปสองครั้งโดยที่ร้านจ่ายค่าส่งทั้งสองขา
   */
  it('[blocker] ผู้ส่ง = ลูกค้า · ผู้รับ = ร้าน', () => {
    const sender = fn.slice(fn.indexOf('senderSnapshot'), fn.indexOf('receiverSnapshot'))
    const receiver = fn.slice(fn.indexOf('receiverSnapshot'), fn.indexOf('optionsSnapshot'))
    expect(sender).toContain('order.buyerName')
    expect(sender).toContain('order.buyerContact')
    expect(receiver).toContain('shopSender')
    expect(receiver).not.toContain('order.buyer')
  })

  /**
   * 🛑 พัสดุขากลับเก็บเงินปลายทางไม่ได้ — ร้านจะกลายเป็นคนจ่ายเงินให้ตัวเองผ่านขนส่ง
   * และค่าส่งตัดจากเครดิต iShip ของร้านอยู่แล้ว
   */
  it('[blocker] codAmount ต้องเป็น 0 เสมอ', () => {
    expect(fn).toMatch(/codAmount: 0/)
    expect(fn).not.toMatch(/codAmount: (override|account|order)/)
  })

  it('[blocker] ต้องใช้ dispatchShipment ตัวเดิม ห้ามก็อปตรรกะยิงมาเขียนใหม่', () => {
    expect(fn).toContain('dispatchShipment(')
    expect(fn).not.toContain('iship.createOrder(')
  })

  it('[blocker] สเปกกล่องตั้งต้นต้องอ่านจากพัสดุ **ขาไป** ของใบเดิม', () => {
    expect(fn).toContain('direction: FORWARD_SHIPMENT')
  })
})
