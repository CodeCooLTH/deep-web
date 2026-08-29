import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { shouldShowOrderOrigin } from '@/lib/order-display'

/**
 * [blocker] แถว "จากการคุยที่ …" บนหน้าออเดอร์ผู้ซื้อ `/o/[token]`
 *
 * 🛑 บล็อกหลักฐานร้าน (`ShopEvidence`) ลิสต์ **ทุกเพจของร้าน** อยู่เหนือแถวนี้พอดี
 * ร้านที่มีเพจเดียวจึงได้ชื่อเพจเดียวกันสองบรรทัดติดกัน — หัวหน้าเห็นบนจอจริง 2026-08-29:
 *
 *     BT Premium Auto Xenon คลอง4 ธนบุรี        ← ShopEvidence
 *     Facebook Page
 *     จากการคุยที่ BT Premium Auto Xenon คลอง4 ธนบุรี   ← แถวนี้
 *
 * เป็นคลาส "ค่าเดียวกันสองที่บนจอเดียว" ที่หน้านี้ไล่ปิดมาแล้วหลายจุด
 * (ยอดคงเหลือในชิป · วันเวลาในการ์ดนัด · ระยะเวลาในการ์ดเดียวกัน)
 */
describe('[blocker] shouldShowOrderOrigin', () => {
  it('ร้านมีเพจเดียวและเป็นเพจเดียวกัน → ต้องซ่อน (ไม่งั้นชื่อซ้ำสองบรรทัดติดกัน)', () => {
    expect(shouldShowOrderOrigin('BT Premium Auto Xenon คลอง4 ธนบุรี', ['BT Premium Auto Xenon คลอง4 ธนบุรี'])).toBe(
      false,
    )
  })

  it('ร้านมีหลายเพจ → ต้องแสดง แม้เพจต้นทางจะอยู่ในลิสต์ด้วย', () => {
    /* 🛑 นี่คือเหตุผลที่แถวนี้มีอยู่ — ลิสต์ด้านบนบอกว่า "ร้านนี้มีเพจอะไรบ้าง"
       แถวนี้บอกว่า "ใบนี้เกิดที่เพจไหน" ซึ่งเป็นคนละคำถามทันทีที่มีเพจให้สับสน */
    expect(shouldShowOrderOrigin('เพจ ก', ['เพจ ก', 'เพจ ข'])).toBe(true)
  })

  it('เพจต้นทางไม่ได้อยู่ในลิสต์ → ต้องแสดง (ไม่มีอะไรซ้ำ)', () => {
    expect(shouldShowOrderOrigin('เพจ ค', ['เพจ ก'])).toBe(true)
  })

  it('ร้านไม่มีเพจผูกเลย → ต้องแสดง', () => {
    expect(shouldShowOrderOrigin('เพจ ก', [])).toBe(true)
  })

  it('ไม่รู้ชื่อเพจ → ต้องแสดงเสมอ — ตัวเรนเดอร์ขึ้นชื่อ *ช่องทาง* ซึ่งไม่ใช่ชื่อเพจ', () => {
    /* 🛑 `null` ที่นี่ไม่ได้แปลว่า "ไม่มีที่มา" แต่แปลว่า "มีที่มาแต่ไม่รู้ชื่อ" —
       ตัวเรนเดอร์ถอยไปใช้ `getChannelLabel()` ("Messenger"/"LINE") ซึ่งไม่มีทางซ้ำกับชื่อเพจ
       ตีเป็นซ่อนจะทำให้ผู้ซื้อเสียข้อมูลที่มาไปทั้งกลุ่มโดยไม่มีอะไรฟ้อง */
    expect(shouldShowOrderOrigin(null, ['เพจ ก'])).toBe(true)
    expect(shouldShowOrderOrigin(undefined, ['เพจ ก'])).toBe(true)
  })

  it('ชื่อต่างกันแค่ช่องว่าง/ตัวพิมพ์ → ยังถือว่าไม่ซ้ำ (เทียบตรงตัวเท่านั้น)', () => {
    /* จงใจไม่ normalize — ชื่อเพจที่ต่างกันจริงมักต่างแค่หางสาขา
       ถ้า normalize แรงเกินจะซ่อนแถวที่กำลังแยกสองเพจที่ชื่อคล้ายกัน ซึ่งอันตรายกว่าซ้ำ */
    expect(shouldShowOrderOrigin('เพจ ก', ['เพจ  ก'])).toBe(true)
  })

  it('[blocker] หน้าจอต้องเรียกตัวตัดสินนี้จริง ไม่ใช่เขียนเงื่อนไขซ้ำเอง', () => {
    /* `rule-must-be-enforced-not-described.md` — ฟังก์ชันที่ถูกต้องแต่ไม่มีใครเรียก
       คือสิ่งที่เกิดมาแล้วสองครั้งในงานนี้ (`FORWARD_OUTCOME` · กิ่ง RETURN ทั้งกิ่ง) */
    const src = readFileSync(
      join(process.cwd(), 'src/app/(marketing)/o/[token]/OrderDetailMobile.tsx'),
      'utf8',
    )
      .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

    const at = src.indexOf('order.originPage &&')
    expect(at, 'ต้องมีแถวที่มาของออเดอร์').toBeGreaterThan(-1)
    expect(src.slice(at, at + 200), 'ตัวกั้นต้องเรียก shouldShowOrderOrigin').toMatch(
      /shouldShowOrderOrigin\(/,
    )
  })
})

/**
 * [blocker] หัวข้อการ์ดรายการ ต้องไม่ขึ้นคร่อมความว่างเปล่า
 *
 * กติกาเดียวกับแถวที่มา และกับขั้น "ลูกค้ายืนยันนัด" ที่ถูกตัดออกจากรางเมื่อไม่มีนัด:
 * **ไม่มีอะไรจะบอก = ไม่ต้องขึ้นหัวข้อ** (หัวหน้าสั่งเป็นกฎรวม 2026-08-29)
 */
describe('[blocker] การ์ดรายการต้องไม่ขึ้นหัวข้อเปล่า', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/app/(marketing)/o/[token]/OrderDetailMobile.tsx'),
    'utf8',
  )
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

  it('หัวข้อ + ตัวนับ ต้องอยู่ใต้ตัวกั้น items.length', () => {
    const guard = src.indexOf('order.items.length > 0')
    expect(guard, 'ต้องมีตัวกั้นจำนวนรายการ').toBeGreaterThan(-1)

    const counter = src.indexOf('{order.items.length} รายการ')
    expect(counter, 'ต้องมีตัวนับรายการ').toBeGreaterThan(-1)
    expect(counter, 'ตัวนับต้องอยู่หลังตัวกั้น').toBeGreaterThan(guard)
  })

  it('🛑 ห้ามกั้นทั้ง <Card> — แถวยอดรวมอยู่ในใบเดียวกัน กั้นทั้งใบ = ยอดเงินหาย', () => {
    /* เคยเขียนพลาดแบบนี้จริงระหว่างทำงานรอบนี้ — ตัวกั้นต้องอยู่ **หลัง** `<Card>` เปิด
       ไม่ใช่ก่อนหน้ามัน ไม่งั้นใบที่ไม่มีรายการจะไม่มีที่ให้ผู้ซื้ออ่านยอดที่ต้องโอน

       🛑 ต้องหา `<Card>` ของ **ใบรายการ** โดยเดินถอยหลังจากหัวข้อของมันเอง —
       ร่างแรกใช้ `indexOf('<Card>', indexOf('order.isServiceShop ? ') - 2000)` ซึ่งไปเจอ
       `order.isServiceShop` ตัวแรกของไฟล์ (หัวข้อ "สถานะงานบริการ") แล้วได้การ์ดคนละใบ
       ⇒ เทสเขียวแม้ย้ายตัวกั้นไปครอบทั้งใบ (พิสูจน์ด้วย mutation แล้วว่าเงียบจริง —
       `mutation-silence-means-weak-corpus.md` เจอเป็นครั้งที่สี่ในงานนี้) */
    const heading = src.indexOf("'รายการบริการ' : 'รายการสินค้า'")
    expect(heading, 'ต้องเจอหัวข้อการ์ดรายการ').toBeGreaterThan(-1)

    /* 🛑 ต้องมีตัวกั้นนี้ **ใบเดียวในไฟล์** — ไม่งั้นการ *เพิ่ม* ตัวกั้นชั้นนอกครอบ `<Card>`
       (ซึ่งตัดยอดรวมทิ้งเหมือนกัน) จะรอดสายตา เพราะเทสยังเจอตัวในที่ยังอยู่ถูกที่
       พิสูจน์แล้วว่าร่างก่อนหน้าเงียบกับ mutation นี้จริง */
    const all = [...src.matchAll(/order\.items\.length > 0/g)].map((m) => m.index)
    expect(all, 'ตัวกั้นจำนวนรายการต้องมีที่เดียว').toHaveLength(1)

    const guard = all[0]
    const card = src.lastIndexOf('<Card>', heading)
    const total = src.indexOf('{formatBaht(order.totalAmount)}', heading)

    expect(card, 'ต้องเจอ <Card> ที่ครอบหัวข้อนี้').toBeGreaterThan(-1)
    expect(total, 'ต้องมีแถวยอดรวมหลังหัวข้อ').toBeGreaterThan(-1)

    expect(guard, 'ตัวกั้นต้องอยู่ข้างใน <Card> ไม่ใช่ครอบมัน').toBeGreaterThan(card)
    expect(total, 'ยอดรวมต้องอยู่หลังตัวกั้น = ไม่ถูกตัดไปด้วย').toBeGreaterThan(guard)
  })
})
