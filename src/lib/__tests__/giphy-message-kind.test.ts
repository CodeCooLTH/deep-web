import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { giphyMessageKind, giphyPreviewLabel } from '@/lib/giphy-message-kind'
import { isStickerRawMessage } from '@/lib/chat-sticker'

const ROOT = process.cwd()

/**
 * URL จริงจาก payload บน prod (2026-08-27) — **ห้ามแต่งเอง**
 * ทั้งคู่หน้าตาเหมือนกันทุกประการยกเว้นค่า `ct=` ที่ฝังอยู่ใน base64 ของ path
 * (`ct=s` = สติกเกอร์ · `ct=g` = GIF) ซึ่งเป็นสิ่งเดียวที่แยกสองอย่างนี้ได้
 */
const STICKER_URL =
  'https://media4.giphy.com/media/v1.Y2lkPTQyMzA0NmQwdjc3aXRyZXBxamIwNTUyODA5eXBieWNpZ2l0cmJ3dThiYXo2aTM2cCZlcD12MV9naWZzX2dpZklkJmN0PXM/YrMpuzXd1aro5pAHiV/200.gif'
const GIF_URL =
  'https://media1.giphy.com/media/v1.Y2lkPTIwMmUwMjFmY241ZjUwMjVvc3Vqb24wenEwN3J2Nnp3djdkaHBna3VtbjJvaW9ldCZlcD12MV9naWZzX2dpZklkJmN0PWc/aBQK2SxwLTiSc/200.gif'

const igWebhookRaw = (url: string) => ({
  source: 'webhook',
  provider: 'INSTAGRAM',
  payload: {
    sender: { id: '17841436034417448' },
    recipient: { id: '1778524736525089' },
    message: { mid: 'x', is_echo: true, attachments: [{ type: 'image', payload: { url } }] },
  },
})

describe('[blocker] giphyMessageKind', () => {
  it('แยกสติกเกอร์ออกจาก GIF ได้จาก URL จริง', () => {
    expect(giphyMessageKind(STICKER_URL)).toBe('sticker')
    expect(giphyMessageKind(GIF_URL)).toBe('gif')
  })

  it('ไม่ใช่ GIPHY → null (ห้ามไปตีความ URL ของเจ้าอื่น)', () => {
    expect(giphyMessageKind('https://scontent.xx.fbcdn.net/v/t1.png')).toBeNull()
    expect(giphyMessageKind('https://media.giphy.com.evil.example/media/v1.Y3Q9cw/a/200.gif')).toBeNull()
  })

  it('[blocker] fail-open ทุกกรณีที่อ่านไม่ออก — ห้าม throw ห้ามคืนค่ามั่ว', () => {
    for (const bad of [null, undefined, '', 'ไม่ใช่ url', 'https://media.giphy.com/x/y.gif']) {
      expect(() => giphyMessageKind(bad as string)).not.toThrow()
      expect(giphyMessageKind(bad as string)).toBeNull()
    }
  })

  it('คำที่ใช้ในรายการแชทต้องสั้นและต่างกันจริง', () => {
    expect(giphyPreviewLabel('sticker')).toBe('[สติกเกอร์]')
    expect(giphyPreviewLabel('gif')).toBe('[GIF]')
    expect(giphyPreviewLabel('sticker')).not.toBe(giphyPreviewLabel('gif'))
  })
})

/**
 * 🛑 [blocker] สติกเกอร์ **ขาเข้า** ของ IG ต้องถูกทำเครื่องหมายว่าเป็นสติกเกอร์
 *
 * marker เดิม (`payload.kind === 'sticker'`) ใช้ได้เฉพาะของที่ **เราเป็นคนเขียน** — ขาเข้าเป็น
 * payload ของ Meta ซึ่งส่งสติกเกอร์มาเป็น `type: "image"` เหมือนรูปถ่ายจริง ⇒ สติกเกอร์ที่ลูกค้า
 * ส่งมาขึ้นเต็มความกว้าง **พร้อมปุ่ม "บันทึกรูป"** ขณะที่ใบที่ส่งจาก Deep เองแสดงถูก
 * (สองใบติดกันในเธรดเดียวหน้าตาไม่เหมือนกัน — user แจ้ง 2026-08-27)
 */
describe('[blocker] isStickerRawMessage — ขาเข้า Instagram', () => {
  it('สติกเกอร์ GIPHY ขาเข้า = สติกเกอร์', () => {
    expect(isStickerRawMessage(igWebhookRaw(STICKER_URL))).toBe(true)
  })

  it('GIF ไม่ใช่สติกเกอร์ — มีพื้นหลัง ต้องกว้างเท่ารูปปกติและบันทึกได้', () => {
    expect(isStickerRawMessage(igWebhookRaw(GIF_URL))).toBe(false)
  })

  it('รูปถ่ายจริงจากลูกค้า ยังไม่ใช่สติกเกอร์', () => {
    expect(isStickerRawMessage(igWebhookRaw('https://scontent.xx.fbcdn.net/v/t1.jpg'))).toBe(false)
  })

  it('marker เดิมของขาออก (payload.kind) ต้องยังทำงาน — ห้ามแก้ทางใหม่แล้วพังทางเก่า', () => {
    expect(isStickerRawMessage({ payload: { kind: 'sticker' } })).toBe(true)
    expect(isStickerRawMessage({ payload: { kind: 'image' } })).toBe(false)
  })

  it('payload ผิดรูป/ว่าง ต้องไม่ throw และตกไป "ไม่ใช่สติกเกอร์"', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { payload: null }, { payload: { message: {} } }]) {
      expect(() => isStickerRawMessage(bad)).not.toThrow()
      expect(isStickerRawMessage(bad)).toBe(false)
    }
  })
})

/**
 * [blocker] ป้ายในรายการแชท (คอลัมน์ซ้าย) ต้องใช้คำของ GIPHY ไม่ใช่ "[รูปภาพ]"
 *
 * Meta ส่งสติกเกอร์/GIF มาเป็น `type: image` เหมือนรูปถ่ายจริง ⇒ ถ้า ingest ไม่เรียกตัวแยกนี้
 * รายการแชทจะขึ้น "[รูปภาพ]" กับทุกอย่าง แล้วผู้ขายนึกว่าลูกค้าส่งรูปสินค้ามา (user แจ้ง 2026-08-27)
 *
 * เทสนี้สแกนซอร์สเพราะตรรกะอยู่กลาง `ingestInboundMessage` ซึ่งแยกออกมาเรียกตรง ๆ ไม่ได้
 * (ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำอธิบายของกฎนี้ไว้ด้วย)
 */
describe('[blocker] ingest ต้องใช้ป้ายของ GIPHY ในรายการแชท', () => {
  const src = () =>
    readFileSync(join(ROOT, 'src/services/channel-chat.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')

  it('เรียก giphyMessageKind กับ URL ของไฟล์แนบจริง', () => {
    expect(src()).toMatch(/const giphyKind = giphyMessageKind\(attUrl\)/)
  })

  it('ป้ายของ GIPHY ต้องมาก่อน previewByType ไม่งั้นตกไป "[รูปภาพ]" เหมือนเดิม', () => {
    expect(src()).toMatch(/giphyLabel \?\? previewByType\[type\]/)
  })
})
