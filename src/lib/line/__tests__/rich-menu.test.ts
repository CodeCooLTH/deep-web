/**
 * [blocker] เมนูลัดใน LINE — ตัวประกอบ payload / ตัวตรวจ / เทมเพลต (feature 00045)
 *
 * เคสที่อ้าง TC-xx อ้างถึง `docs/20 - Features/00045 - LINE Rich Menu/TestCase.md`
 *
 * 🛑 กลุ่มที่แดงแล้วห้าม merge เด็ดขาด:
 *   - พิกัดปุ่มไม่ตรงกับกรอบภาพ (TC-18) → **ลูกค้ากดโดนปุ่มผิด** โดยไม่มี tsc/build/theme-guard ฟ้อง
 *   - `chatBarText` ยาวเกิน 14 (TC-12/13) → LINE ปฏิเสธทั้งเมนูตอน deploy ไปแล้ว
 *   - เทมเพลตมีปุ่มที่ปลายทางยังไม่ทำงาน (TC-20) → ลูกค้ากดแล้วเงียบหาย
 */

import { describe, it, expect } from 'vitest'
import {
  RICH_MENU_CANVAS_HEIGHT,
  RICH_MENU_CANVAS_WIDTH,
  RICH_MENU_CHAT_BAR_MAX,
} from '../constants'
import {
  buildRichMenuName,
  buildRichMenuPayload,
  cellBounds,
  readImageSize,
  countChatBarText,
  gridFor,
  isChatBarTextValid,
  isOwnRichMenuName,
  richMenuNamePrefix,
  validateRichMenuImage,
  type RichMenuButton,
} from '../rich-menu'
import {
  allTemplates,
  findTemplate,
  resolveTemplateButtons,
  richMenuPostbackData,
  templatesFor,
} from '../rich-menu-templates'
import { SHOP_VERTICAL_KEYS } from '@/lib/lodging'

const btn = (key: string): RichMenuButton => ({ key, label: key, action: { type: 'location' } })

describe('chatBarText', () => {
  it('[blocker] TC-12 คำไทยที่ยาวเกินเพดานต้องถูกปฏิเสธ', () => {
    // "แตะเพื่อเปิดเมนู" = 16 ตัว → เกินเพดาน 14 ของ LINE
    expect(countChatBarText('แตะเพื่อเปิดเมนู')).toBe(16)
    expect(isChatBarTextValid('แตะเพื่อเปิดเมนู')).toBe(false)
    expect(isChatBarTextValid('เมนูลัด')).toBe(true)
  })

  /**
   * 🛑 เคสนี้มีไว้พิสูจน์ว่า `Array.from` **มีผลจริง** — ไม่ใช่โค้ดเผื่อที่ทดสอบไม่ได้ (บทเรียน P-7)
   *
   * อักษรไทยทุกตัวเป็น BMP ตัวเดียว `.length` จึงได้เลขเท่ากับ `Array.from().length` เป๊ะ เคสไทย
   * ข้างบนจึงพิสูจน์อะไรไม่ได้เลยถ้ามีคนเปลี่ยนกลับไปใช้ `.length` — ตัวที่แยกสองอย่างนี้ออกจากกัน
   * คืออักขระนอก BMP (อิโมจิ = surrogate pair = `.length` นับ 2)
   *
   * ทำไมต้องแคร์: `chatBarText` เป็นคำที่ **ผู้ขายพิมพ์เอง** และไปโผล่ในแอป LINE ของลูกค้า
   * (ไม่ใช่ UI ของเราจึงไม่อยู่ใต้ HR12) ร้านจำนวนมากใส่อิโมจิในคำเรียกเมนูจริง ๆ
   */
  it('[blocker] อักขระนอก BMP ต้องนับเป็น 1 ตัว — พิสูจน์ว่าใช้ code point ไม่ใช่ UTF-16 unit', () => {
    // เขียนด้วย fromCodePoint ไม่ใช่ literal โดยตั้งใจ: สิ่งที่ทดสอบคือ "อักขระนอก BMP"
    // ไม่ใช่ "อิโมจิ" — และ literal จะไปติด theme-guard ของ HR12 ซึ่งสแกนทั้งไฟล์
    const astral = String.fromCodePoint(0x1f44d)
    expect(astral.length).toBe(2) // ข้อเท็จจริงของ JS ที่ทำให้ .length ใช้แทนกันไม่ได้
    expect(countChatBarText(astral)).toBe(1)
    // 14 ตัวนี้ = 14 ตัวอักษรที่ LINE นับ แต่ .length จะได้ 28 แล้วปฏิเสธผิด
    expect(isChatBarTextValid(astral.repeat(RICH_MENU_CHAT_BAR_MAX))).toBe(true)
  })

  it('ว่าง/เว้นวรรคล้วน = ไม่ผ่าน (แถบที่ไม่มีคำ ลูกค้าไม่รู้ว่ากดอะไร)', () => {
    expect(isChatBarTextValid('')).toBe(false)
    expect(isChatBarTextValid('   ')).toBe(false)
  })

  it('ยาวเท่าเพดานพอดีต้องผ่าน (off-by-one)', () => {
    expect(isChatBarTextValid('ก'.repeat(RICH_MENU_CHAT_BAR_MAX))).toBe(true)
    expect(isChatBarTextValid('ก'.repeat(RICH_MENU_CHAT_BAR_MAX + 1))).toBe(false)
  })
})

describe('ชื่อเมนู = กลไกเก็บกวาด', () => {
  it('[blocker] TC-08 ลบได้เฉพาะเมนูของเพจตัวเอง', () => {
    const mine = buildRichMenuName('chan-1', 1700000000000)
    expect(isOwnRichMenuName(mine, 'chan-1')).toBe(true)
    // เพจอื่นของร้านเดียวกัน
    expect(isOwnRichMenuName(mine, 'chan-2')).toBe(false)
    // เมนูที่ร้านตั้งเองใน LINE OA Manager (ชื่ออะไรก็ได้) ต้องไม่ถูกแตะ
    expect(isOwnRichMenuName('เมนูหลักของร้าน', 'chan-1')).toBe(false)
    expect(isOwnRichMenuName(null, 'chan-1')).toBe(false)
    expect(isOwnRichMenuName(undefined, 'chan-1')).toBe(false)
  })

  it('prefix ผูกกับ shopChannelId', () => {
    expect(buildRichMenuName('abc', 123).startsWith(richMenuNamePrefix('abc'))).toBe(true)
  })
})

describe('กริดพิกัดปุ่ม', () => {
  it('จำนวนปุ่มที่ไม่รองรับ = ปฏิเสธ (fail-closed) ไม่ใช่เดากริดให้', () => {
    expect(gridFor(1)).toBeNull()
    expect(gridFor(5)).toBeNull()
    expect(gridFor(7)).toBeNull()
    expect(gridFor(2)).toEqual({ rows: 1, cols: 2 })
    expect(gridFor(4)).toEqual({ rows: 2, cols: 2 })
  })

  /**
   * 🛑 TC-18 หัวใจของความถูกต้องทั้งฟีเจอร์
   *
   * ถ้าพื้นที่กดไม่ครอบคลุมกรอบภาพทั้งใบ จะมีแถบที่ลูกค้ากดแล้วไม่โดนอะไรเลย และถ้าซ้อนทับกัน
   * ลูกค้าจะกดโดนปุ่มข้าง ๆ — ทั้งสองอาการ **ไม่มีเครื่องมือไหนในโปรเจกต์จับได้** และผู้ใช้
   * รายงานยากมาก ("กดแล้วบางทีไม่ติด")
   */
  it('[blocker] TC-18 ทุกกริด: พื้นที่กดต้องต่อกันสนิทและเต็มกรอบภาพพอดี ไม่เหลือเศษ ไม่ซ้อนกัน', () => {
    for (const count of [2, 3, 4, 6]) {
      const grid = gridFor(count)!
      const cells = Array.from({ length: count }, (_, i) => cellBounds(grid, i))

      // 1) ผลรวมพื้นที่ = พื้นที่ภาพเป๊ะ (ไม่ทับกัน + ไม่มีรู)
      const area = cells.reduce((s, c) => s + c.width * c.height, 0)
      expect(area, `กริด ${count} ปุ่ม`).toBe(RICH_MENU_CANVAS_WIDTH * RICH_MENU_CANVAS_HEIGHT)

      // 2) ขอบขวาสุด/ล่างสุดต้องชนขอบภาพพอดี (นี่คือจุดที่ 2500/3 = 833.33 ทำให้เหลือ 1px)
      expect(Math.max(...cells.map((c) => c.x + c.width))).toBe(RICH_MENU_CANVAS_WIDTH)
      expect(Math.max(...cells.map((c) => c.y + c.height))).toBe(RICH_MENU_CANVAS_HEIGHT)

      // 3) ไม่มีพิกัดติดลบหรือกล่องขนาดศูนย์
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.y).toBeGreaterThanOrEqual(0)
        expect(c.width).toBeGreaterThan(0)
        expect(c.height).toBeGreaterThan(0)
      }
    }
  })

  it('กริด 3 คอลัมน์: ช่องสุดท้ายกลืนเศษ (2500/3 ไม่ลงตัว)', () => {
    const g = gridFor(3)!
    expect(cellBounds(g, 0).width).toBe(833)
    expect(cellBounds(g, 1).width).toBe(833)
    expect(cellBounds(g, 2).width).toBe(834) // 2500 - 833*2
  })
})

describe('buildRichMenuPayload', () => {
  it('ประกอบครบและใช้กรอบเดียวกับ canvas', () => {
    const p = buildRichMenuPayload({ name: 'deep:x:1', chatBarText: 'เมนูลัด', buttons: [btn('a'), btn('b')] })
    expect(p.size).toEqual({ width: RICH_MENU_CANVAS_WIDTH, height: RICH_MENU_CANVAS_HEIGHT })
    expect(p.areas).toHaveLength(2)
    expect(p.selected).toBe(false) // หุบไว้ ไม่กางค้างบังบทสนทนา
  })

  it('ปฏิเสธก่อนถึง LINE: chatBarText เกิน · ปุ่มไม่มี label · จำนวนปุ่มไม่รองรับ', () => {
    expect(() =>
      buildRichMenuPayload({ name: 'n', chatBarText: 'แตะเพื่อเปิดเมนู', buttons: [btn('a'), btn('b')] }),
    ).toThrow('RICH_MENU_CHAT_BAR_INVALID')
    expect(() =>
      buildRichMenuPayload({ name: 'n', chatBarText: 'เมนู', buttons: [btn('a'), { ...btn('b'), label: '  ' }] }),
    ).toThrow('RICH_MENU_LABEL_REQUIRED')
    expect(() => buildRichMenuPayload({ name: 'n', chatBarText: 'เมนู', buttons: [btn('a')] })).toThrow(
      'RICH_MENU_LAYOUT_UNSUPPORTED',
    )
  })

  it('แปลง action ทุกชนิดเป็นรูปที่ LINE รับ และแนบ label ให้ทุกตัว', () => {
    const p = buildRichMenuPayload({
      name: 'n',
      chatBarText: 'เมนู',
      buttons: [
        { key: 'a', label: 'ลิงก์', action: { type: 'uri', uri: 'https://x.test' } },
        { key: 'b', label: 'ข้อความ', action: { type: 'message', text: 'hi' } },
        { key: 'c', label: 'ที่อยู่', action: { type: 'location' } },
      ],
    })
    expect(p.areas.map((a) => a.action)).toEqual([
      { type: 'uri', label: 'ลิงก์', uri: 'https://x.test' },
      { type: 'message', label: 'ข้อความ', text: 'hi' },
      { type: 'location', label: 'ที่อยู่' },
    ])
  })
})

describe('validateRichMenuImage', () => {
  const ok = { bytes: 500_000, width: 2500, height: 1686, mime: 'image/jpeg' }

  it('ภาพที่เรนเดอร์จากกรอบมาตรฐานของเราต้องผ่าน', () => {
    expect(validateRichMenuImage(ok)).toEqual({ ok: true })
  })

  it('[blocker] TC-14/15 คืนเหตุผล "ทุกข้อ" ที่ไม่ผ่านพร้อมกัน ไม่ใช่ข้อแรกที่เจอ', () => {
    const r = validateRichMenuImage({ bytes: 2_000_000, width: 400, height: 400, mime: 'image/gif' })
    expect(r.ok).toBe(false)
    // gif + เกิน 1MB + กว้างไม่ถึง 800 + สัดส่วน 1.0 < 1.45 = 4 ข้อ
    if (!r.ok) expect(r.reasons).toHaveLength(4)
  })

  it('สัดส่วนต่ำกว่า 1.45 ไม่ผ่าน แม้ขนาดอื่นถูกหมด', () => {
    const r = validateRichMenuImage({ ...ok, width: 1000, height: 800 }) // 1.25
    expect(r.ok).toBe(false)
  })

  it('ความสูง 0 ต้องไม่ทำให้หารด้วยศูนย์', () => {
    expect(() => validateRichMenuImage({ ...ok, height: 0 })).not.toThrow()
  })
})

describe('readImageSize', () => {
  /** PNG: [8 signature][4 len][4 "IHDR"][4 width][4 height] — width มาก่อน height */
  function png(width: number, height: number): Uint8Array {
    const b = Buffer.alloc(24)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
    b.write('IHDR', 12, 'ascii')
    b.writeUInt32BE(width, 16)
    b.writeUInt32BE(height, 20)
    return b
  }

  /** JPEG: [FFD8][FFC0][len:2][precision:1][height:2][width:2] — 🛑 height มาก่อน width */
  function jpeg(width: number, height: number): Uint8Array {
    const b = Buffer.alloc(20)
    b.writeUInt16BE(0xffd8, 0)
    b.writeUInt16BE(0xffc0, 2)
    b.writeUInt16BE(17, 4) // length ของ segment
    b.writeUInt8(8, 6) // precision
    b.writeUInt16BE(height, 7)
    b.writeUInt16BE(width, 9)
    return b
  }

  /**
   * 🛑 เคสนี้จับบั๊กที่ทำให้ **ร้านเปิดเมนูไม่ได้เลยสักร้าน**: JPEG เก็บความสูงก่อนความกว้าง
   * ถ้าอ่านสลับ ภาพ 2500×1686 จะกลายเป็น 1686×2500 → สัดส่วน 0.67 → `validateRichMenuImage`
   * ตีตกด้วยเหตุผลที่ฟังดูสมเหตุสมผล ("ภาพแบนเกินไป") ทั้งที่ภาพถูกต้องทุกประการ
   */
  it('[blocker] JPEG ต้องอ่าน width/height ไม่สลับกัน', () => {
    expect(readImageSize(jpeg(RICH_MENU_CANVAS_WIDTH, RICH_MENU_CANVAS_HEIGHT), 'image/jpeg')).toEqual({
      width: RICH_MENU_CANVAS_WIDTH,
      height: RICH_MENU_CANVAS_HEIGHT,
    })
    // ภาพจากกรอบมาตรฐานของเราต้องผ่านเกณฑ์ของ LINE เมื่ออ่านขนาดถูก
    const dim = readImageSize(jpeg(RICH_MENU_CANVAS_WIDTH, RICH_MENU_CANVAS_HEIGHT), 'image/jpeg')!
    expect(validateRichMenuImage({ bytes: 900_000, mime: 'image/jpeg', ...dim })).toEqual({ ok: true })
  })

  it('[blocker] PNG ต้องอ่าน width/height ไม่สลับกัน', () => {
    expect(readImageSize(png(2500, 1686), 'image/png')).toEqual({ width: 2500, height: 1686 })
  })

  it('ไฟล์ที่อ่านหัวไม่ออก = null (แล้วผู้เรียกจะตีตกด้วย 0×0 ซึ่งถูกต้อง)', () => {
    expect(readImageSize(new Uint8Array([1, 2, 3]), 'image/png')).toBeNull()
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0, 0, 0, 0]), 'image/jpeg')).toBeNull()
  })
})

describe('เทมเพลต', () => {
  it('[blocker] TC-13 chatBarText ของ "ทุก" เทมเพลตต้องไม่เกินเพดานของ LINE', () => {
    for (const t of allTemplates()) {
      expect(isChatBarTextValid(t.chatBarText), `${t.key} = "${t.chatBarText}"`).toBe(true)
    }
  })

  it('[blocker] TC-20 ทุกปุ่มของทุกเทมเพลตต้องมี label และ action ที่อยู่ใน allow-list', () => {
    const allowed = new Set(['uri', 'message', 'postback', 'location', 'datetimepicker'])
    for (const t of allTemplates()) {
      expect(t.buttons.length, `${t.key} ต้องมีปุ่ม`).toBeGreaterThan(0)
      // จำนวนปุ่มต้องอยู่ในกริดที่รองรับ ไม่งั้น buildRichMenuPayload จะโยนตอน runtime
      expect(gridFor(t.buttons.length), `${t.key} จำนวนปุ่มต้องมีกริดรองรับ`).not.toBeNull()
      for (const b of t.buttons) {
        expect(b.label.trim(), `${t.key}/${b.key}`).not.toBe('')
        expect(allowed.has(b.action.type), `${t.key}/${b.key} = ${b.action.type}`).toBe(true)
      }
    }
  })

  it('[blocker] ทุก vertical ต้องมีเทมเพลตอย่างน้อยหนึ่งชุด (D-RM-1)', () => {
    for (const v of SHOP_VERTICAL_KEYS) {
      expect(templatesFor(v).length, `vertical ${v}`).toBeGreaterThan(0)
    }
  })

  it('postback data ต้องมี src=rm เสมอ (FR-RM-08 วัดผลไม่ได้ถ้าไม่มี)', () => {
    const qs = new URLSearchParams(richMenuPostbackData('order_status', 'เช็คสถานะ'))
    expect(qs.get('src')).toBe('rm')
    expect(qs.get('action')).toBe('order_status')
    expect(qs.get('label')).toBe('เช็คสถานะ')
    // ทุกปุ่ม postback/datetimepicker ในเทมเพลตต้องมี marker นี้ด้วย
    for (const t of allTemplates()) {
      for (const b of t.buttons) {
        if (b.action.type === 'postback' || b.action.type === 'datetimepicker') {
          expect(new URLSearchParams(b.action.data).get('src'), `${t.key}/${b.key}`).toBe('rm')
        }
      }
    }
  })

  it('[blocker] TC-21 ร้านที่ไม่มีหน้าร้านสาธารณะ ต้องถูก "ตัดปุ่มทิ้ง" ไม่ใช่ได้ลิงก์เสีย', () => {
    const t = findTemplate('online_sales_v1')!
    const withUrl = resolveTemplateButtons(t, { publicUrl: 'https://deepthailand.app/u/shop' })
    const without = resolveTemplateButtons(t, { publicUrl: null })
    expect(withUrl).toHaveLength(t.buttons.length)
    expect(without).toHaveLength(t.buttons.length - 1)
    expect(without.some((b) => b.key === 'catalog')).toBe(false)
    // และสิ่งที่เหลือต้องยังประกอบเป็นเมนูได้จริง (มีกริดรองรับ)
    expect(gridFor(without.length)).not.toBeNull()
  })

  it('[blocker] BR-RM-07 ลิงก์ที่ไม่ใช่ https ต้องถูกตัดทิ้ง (LINE ปฏิเสธทั้งเมนู)', () => {
    const t = findTemplate('online_sales_v1')!
    const http = resolveTemplateButtons(t, { publicUrl: 'http://deepthailand.app/u/shop' })
    expect(http.some((b) => b.key === 'catalog')).toBe(false)
  })

  it('เทมเพลตที่ resolve แล้วต้องประกอบ payload ได้จริงทุกชุด (end-to-end ของฝั่ง pure)', () => {
    for (const t of allTemplates()) {
      const buttons = resolveTemplateButtons(t, { publicUrl: 'https://deepthailand.app/u/shop' })
      expect(() =>
        buildRichMenuPayload({ name: buildRichMenuName('c1', 1), chatBarText: t.chatBarText, buttons }),
      ).not.toThrow()
    }
  })
})
