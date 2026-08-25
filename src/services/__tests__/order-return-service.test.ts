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

/**
 * [blocker] ค่าส่งขากลับต้องเข้าระบบกำไรจริง (P5 · D-3c)
 *
 * 🛑 หัวหน้าสั่งตรงว่า "ค่าส่งต้องเข้าระบบกำไรเลย" — ถ้าคำนวณแล้วไม่บวกเข้า totalExpense
 * ตัวเลขจะถูกเก็บไว้เฉย ๆ โดยไม่มีผลกับอะไรเลย ซึ่งอ่านจากภายนอกไม่ต่างจากไม่ได้ทำ
 */
describe('[blocker] ค่าส่งขากลับใน P&L', () => {
  const pnl = strip('src/services/pnl.service.ts')

  it('ต้องคิดจากใบคืนที่ RECEIVED และตัดช่วงด้วย receivedAt', () => {
    // ใช้ createdAt จะทำให้ค่าใช้จ่ายโผล่ในเดือนที่ยังไม่มีอะไรเกิดขึ้นจริง
    expect(pnl).toContain('orderReturn.findMany')
    expect(pnl).toContain('status: RETURN_STATUS.RECEIVED')
    expect(pnl).toContain('receivedAt:')
  })

  it('[blocker] ต้องบวกเข้า totalExpense ไม่ใช่คำนวณแล้ววางทิ้ง', () => {
    // 🛑 regex ต้องข้ามวงเล็บชั้นใน (`Number(...)`) ได้ — `[^)]*` หยุดที่ `)` ตัวแรก
    // แล้วด่านจะแดงค้างทั้งที่โค้ดถูก (ด่านที่พังเองอ่านเหมือนโค้ดพัง)
    expect(pnl).toMatch(/totalExpense = round2\([\s\S]{0,160}?returnShippingCost/)
  })

  it('[blocker] ช่วงก่อนหน้าต้องคิดด้วยเกณฑ์เดียวกัน (ไม่งั้น %เปลี่ยนแปลงเทียบคนละชนิด)', () => {
    expect(pnl).toContain('prevReturnCost')
    expect(pnl).toMatch(/prevExpense = round2\([\s\S]{0,160}?prevReturnCost\.total/)
  })

  it('[blocker] ต้องส่งจำนวนใบที่ยังไม่รู้ราคาออกไปให้หน้าจอติดป้าย', () => {
    // ใบที่ยังไม่รู้ราคาถูกนับเป็น 0 ซึ่งหน้าตาเหมือน "ไม่มีค่าส่ง" ทุกประการ
    expect(pnl).toContain('returnShippingUnknownCount')
    const card = strip('src/app/(paces)/seller/(dashboard)/expenses/components/PnlReportCard.tsx')
    expect(card).toContain('returnShippingUnknownCount')
  })

  /**
   * ไม่สร้างแถวใน Expense โดยเจตนา — ราคาจริงจาก iShip มาทีหลังการเปิดพัสดุ ถ้าสร้างแถวตอน
   * รับคืนแล้วราคาเปลี่ยน แถวนั้นจะค้างเป็นค่าเก่าตลอดไป
   */
  it('[blocker] ห้ามสร้างแถว Expense อัตโนมัติจากใบคืน', () => {
    expect(svc).not.toMatch(/expense\.create/)
    expect(pnl).not.toMatch(/expense\.create/)
  })
})

/**
 * [blocker] ตำแหน่ง UI ของ "คืนของ" ในห้องแชท (user ทักเอง 2026-08-24)
 *
 * เคยวางเป็น **การ์ดคงที่ห้อยใต้ออเดอร์ทุกใบ** → ในรายการที่มีออเดอร์หลายใบมันกลายเป็น N การ์ด
 * ที่กินพื้นที่เท่ากับรายการจริง และขึ้นแม้ใบนั้นคืนไม่ได้ = เสียงรบกวนล้วน
 * ที่ถูกคือเป็น action ของออเดอร์ใบนั้นในเมนู `⋮` (docs/conventions/seller-action-placement.md)
 */
describe('[blocker] ตำแหน่งปุ่มคืนของในห้องแชท', () => {
  const panel = strip(
    'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanel.tsx',
  )

  /**
   * หน้ารายละเอียดออเดอร์ก็เหมือนกัน — user ทักซ้ำหลังแก้ฝั่งแชทว่า "order detail ก็เหมือนเดิม"
   * เดิมเป็นการ์ดของตัวเองต่อท้ายการ์ดการจัดส่ง/หลักฐาน ⇒ หน้ากลายเป็นกองการ์ดที่ต้องเลื่อน
   * ผ่านทุกครั้ง ทั้งที่การคืนของเป็น **การกระทำ** ไม่ใช่ข้อมูล
   */
  it('[blocker] หน้ารายละเอียดออเดอร์ต้องเป็นชีตจากเมนู ⋮ ไม่ใช่การ์ดในหน้า', () => {
    const page = strip('src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx')
    const client = strip(
      'src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderDetailClient.tsx',
    )
    // การ์ดในหน้า (server component) ห้ามกลับมา
    expect(page).not.toContain('ReturnPanel')
    // ต้องเป็นรายการในเมนู + เปิดเป็นชีต
    expect(client).toContain("key: 'return-order'")
    expect(client).toContain('asSheet')
    expect(client).toContain("case 'return-order'")
  })

  it('ต้องอยู่ในเมนู ⋮ ของออเดอร์ ไม่ใช่การ์ดคงที่', () => {
    expect(panel).toContain("key: 'return-order'")
    expect(panel).toMatch(/items=\{\[\.\.\.returnItems, \.\.\.cancelItems\]\}/)
    // การ์ดคงที่ห้ามกลับมา — ต้องเป็นชีตที่เปิดจากเมนูเท่านั้น
    expect(panel).toContain('asSheet')
    expect(panel).not.toMatch(/<ReturnPanel[^>]*compact/)
  })

  /**
   * 🛑 ชีตที่ประกอบเองด้วย React state ต้องล็อก scroll ของหน้าเสมอ — การแปลง hs-overlay เป็น
   * controlled div ทิ้งการล็อกที่เคยได้ฟรีไปทุกใบ ไม่มีใครสังเกตจนผู้ใช้เจอบนมือถือ
   * (docs/conventions/overlay-scroll-lock.md)
   */
  it('[blocker] ชีตต้องล็อก scroll + มี aria-modal คู่กับ role="dialog"', () => {
    const rp = strip(
      'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ReturnPanel.tsx',
    )
    expect(rp).toContain('useLockBodyScroll(')
    expect(rp).toContain('overscroll-contain')
    expect(rp).toMatch(/role="dialog"/)
    expect(rp).toMatch(/aria-modal="true"/)
  })

  /**
   * เนื้อหาต้องมาจากตัวเดียว — โหมดการ์ด (หน้ารายละเอียด) กับโหมดชีต (แชท) เขียนสองชุดเมื่อไร
   * กติกา/ปุ่มจะเลื่อนออกจากกันแน่นอน
   */
  /**
   * [blocker] ชีตเปิดจาก `⋮ → คืนของ` = ผู้ใช้บอกเจตนาไปแล้ว ห้ามให้กดยืนยันเจตนาเดิมซ้ำ
   *
   * หัวหน้าทักเอง 2026-08-25 ("ทำไมยังต้องกดเปิดเรื่องคืนของ") — ชีตที่เปิดมาแล้วมีแต่ปุ่ม
   * ใบเดียวกลางจอคือคลิกที่ไม่ได้ตัดสินใจอะไรเพิ่ม · กันไม่ให้แพตเทิร์นนี้กลับมาเงียบ ๆ
   * ตอนมีคนแก้เงื่อนไขในอนาคต
   */
  it('[blocker] โหมดชีตต้องเข้าฟอร์มทันที ไม่มีปุ่ม "เปิดเรื่องคืนของ" คั่น', () => {
    const rp = strip(
      'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ReturnPanel.tsx',
    )
    // ปุ่มยังต้องมีอยู่สำหรับโหมดการ์ด แต่ต้องถูกกั้นด้วย !asSheet เสมอ
    expect(rp).toContain('เปิดเรื่องคืนของ')
    expect(rp).toMatch(/!form && !asSheet \?/)
  })

  it('[blocker] โหมดการ์ดกับโหมดชีตใช้เนื้อหาชุดเดียวกัน', () => {
    const rp = strip(
      'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ReturnPanel.tsx',
    )
    expect(rp).toContain('function renderBody()')
    expect((rp.match(/function renderBody\(\)/g) ?? []).length).toBe(1)
  })
})
