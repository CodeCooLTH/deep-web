import { describe, it, expect } from 'vitest'
import { parseMetaSystemNotice, parseMetaAiHandoffNotice, readMetaAiControlMarker } from '@/lib/meta-system-notice'

// ข้อความจริงที่เจอบน prod 2026-07-30 (เธรด 842dd8e1) — ตัด URL ให้สั้นลงพอทดสอบ
const REAL =
  'คุณกำลังตอบกลับความคิดเห็นของผู้ใช้ต่อโพสต์บนเพจของคุณ ดูความคิดเห็น(https://facebook.com/story.php?story_fbid=pfbid0w2q&id=61554820684661&comment_id=1431929899077432)'

describe('parseMetaSystemNotice', () => {
  it('ข้อความระบบจริงจาก Meta → แยกข้อความ/ป้ายลิงก์/URL ได้', () => {
    const r = parseMetaSystemNotice(REAL)
    expect(r?.text).toBe('คุณกำลังตอบกลับความคิดเห็นของผู้ใช้ต่อโพสต์บนเพจของคุณ')
    expect(r?.linkLabel).toBe('ดูความคิดเห็น')
    expect(r?.url).toContain('comment_id=1431929899077432')
  })

  it('รูปแบบเดียวกันแต่เป็นภาษาอังกฤษ → ต้องจับได้ด้วย (เพจตั้งภาษาต่างกันได้)', () => {
    const r = parseMetaSystemNotice(
      'You are replying to a comment on your post. See comment(https://www.facebook.com/story.php?id=1)',
    )
    expect(r?.linkLabel).toBe('comment')
    expect(r?.text).toBe('You are replying to a comment on your post. See')
  })

  describe('บรรทัดบอกสถานะที่ไม่มีลิงก์ (user report 2026-07-30 รอบสอง)', () => {
    it('"<ชื่อ> replied to an ad." → เป็นข้อความระบบ ไม่มีลิงก์', () => {
      const r = parseMetaSystemNotice('ปวรุจน์ ณ.ปางคิ้มอด replied to an ad.')
      expect(r?.text).toBe('ปวรุจน์ ณ.ปางคิ้มอด replied to an ad.')
      expect(r?.linkLabel).toBeNull()
      expect(r?.url).toBeNull()
    })

    it('ชื่ออื่นก็ต้องจับได้ (ส่วนหน้าคือชื่อคน เปลี่ยนทุกคน)', () => {
      expect(parseMetaSystemNotice('อานนท์ เจริญมโนพร replied to an ad.')).not.toBeNull()
    })

    it('ไม่มีจุดท้ายประโยคก็ยังจับได้', () => {
      expect(parseMetaSystemNotice('John Doe replied to an ad')).not.toBeNull()
    })

    it('ประโยคที่แค่มีคำว่า ad อยู่กลาง ๆ ต้องไม่จับ', () => {
      expect(parseMetaSystemNotice('ลูกค้าถามว่า ad นี้ยังมีของไหม')).toBeNull()
    })
  })

  describe('ต้องไม่จับข้อความจริงของร้านผิด', () => {
    it('ข้อความธรรมดาไม่มีลิงก์', () => {
      expect(parseMetaSystemNotice('สวัสดีค่า สนใจรุ่นไหนคะ')).toBeNull()
    })

    it('ลิงก์นอกโดเมน Meta (เช่นร้านส่งลิงก์ร้านตัวเอง)', () => {
      expect(
        parseMetaSystemNotice('ดูสินค้าที่นี่(https://deepthailand.app/u/shop)'),
      ).toBeNull()
    })

    it('หลายบรรทัด — ข้อความคนพิมพ์ที่มีลิงก์มักขึ้นบรรทัดใหม่', () => {
      expect(
        parseMetaSystemNotice('โปรโมชัน\nดูเพิ่ม(https://facebook.com/promo)'),
      ).toBeNull()
    })

    it('URL ลอย ๆ ไม่มีวงเล็บ', () => {
      expect(parseMetaSystemNotice('ดูที่ https://facebook.com/xxx')).toBeNull()
    })

    it('ป้ายลิงก์ยาวผิดปกติ = regex ไปคว้าคำท้ายประโยคธรรมดา ไม่ใช่ป้ายลิงก์', () => {
      const long = 'ข้อความ ' + 'ก'.repeat(50) + '(https://facebook.com/x)'
      expect(parseMetaSystemNotice(long)).toBeNull()
    })

    it('ค่าว่าง/null', () => {
      expect(parseMetaSystemNotice('')).toBeNull()
      expect(parseMetaSystemNotice(null)).toBeNull()
      expect(parseMetaSystemNotice(undefined)).toBeNull()
    })
  })
})

// 2026-08-07: backfill ดึงเนื้อหาการ์ดจริงมาได้แล้ว (แทน placeholder เดิม) — ยังต้องเป็นบรรทัดระบบ
describe('การ์ดจาก Facebook ที่มีเนื้อหาจริง', () => {
  it('การ์ดปุ่มโทร → บรรทัดระบบ ไม่ใช่บับเบิลสีร้าน', () => {
    const notice = parseMetaSystemNotice(
      '[การ์ดจาก Facebook] โทรหา ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง — ส่งข้อความกระตุ้นให้โทรด้วยเสียงแล้ว',
    )
    expect(notice).not.toBeNull()
    expect(notice!.linkLabel).toBeNull()
  })

  it('การ์ดโฆษณา → บรรทัดระบบ', () => {
    expect(parseMetaSystemNotice('[การ์ดจาก Facebook] ราคานี้ฟรีปลายทาง — แจ้งรุ่นมอไซที่ใช้อยู่ได้เลย')).not.toBeNull()
  })

  it('ข้อความจริงของร้านที่ขึ้นต้นด้วยวงเล็บเหลี่ยม ต้องไม่ถูกจับเป็นบรรทัดระบบ', () => {
    expect(parseMetaSystemNotice('[ด่วน] ของหมดแล้วนะคะ')).toBeNull()
  })
})

// 2026-08-07 รอบสอง — บรรทัดที่ Meta ส่งมาเป็น message เปล่า ๆ ในนามลูกค้า (user report + screenshot)
describe('บรรทัดระบบที่ Meta ส่งในนามลูกค้า', () => {
  it.each([
    'Pakasit sent a ฿15,000.00 payment.',
    'Supot sent a ฿360.00 payment.',
    'มาลาตรี sent a payment.',
    'เชื่อมต่อบัญชีธนาคารของคุณเพื่อตรวจสอบความถูกต้องของสลิป',
  ])('“%s” → บรรทัดระบบ', (line) => {
    expect(parseMetaSystemNotice(line)).not.toBeNull()
  })

  it.each([
    'ลูกค้าโอนแล้วนะครับ payment ไปแล้ว',
    'ผมยังไม่ได้ sent a payment ให้เลย ขอเวลาแป๊บ',
  ])('ข้อความที่คนพิมพ์เองต้องไม่ถูกจับ: “%s”', (line) => {
    expect(parseMetaSystemNotice(line)).toBeNull()
  })
})

/**
 * parseMetaAiHandoffNotice — ข้อความสลับสิทธิ์คุมเธรด AI ↔ คน (2026-08-08)
 *
 * สตริงอังกฤษทั้ง 4 ตัวด้านล่าง **คัดลอกตรงตัวจากฐาน prod** (`SELECT DISTINCT body ...`
 * 2026-08-08) ไม่ใช่ค่าที่แต่งขึ้นตามความเข้าใจของคนเขียนโค้ด — จุดนี้สำคัญเพราะเทสที่แต่งค่าเอง
 * ตามข้อสันนิษฐานของโค้ด ยืนยันได้แค่ว่า "โค้ดทำตามที่คนเขียนคิด" ไม่ใช่ว่า "คนเขียนคิดถูก"
 * (docs/conventions/external-payload-schema.md) — และรอบนี้เกิดขึ้นจริง: ตอนออกแบบเดาสตริงที่ 4
 * ว่าลงท้าย "because your customer is requesting a human" แต่ของจริงคือ "...is ready to buy"
 * ซึ่งคนละความหมายกันคนละเรื่อง
 */
describe('parseMetaAiHandoffNotice', () => {
  it('[blocker] AI เริ่มตอบ → แปลไทย และ **ไม่มีลิงก์** (AI เปิดอยู่แล้ว ไม่มีอะไรให้เปิดกลับ)', () => {
    const r = parseMetaAiHandoffNotice('Your AI agent will respond.')
    expect(r?.text).toBe('เอเจนต์ AI ของ Meta เริ่มตอบแทนคุณในแชทนี้แล้ว')
    expect(r?.linkLabel).toBeNull()
    expect(r?.url).toBeNull()
  })

  it('[blocker] คนแย่งกลับ → ต้องใช้คำที่ Meta ใช้เองใน Business Suite ไทย ห้ามคิดคำใหม่', () => {
    const r = parseMetaAiHandoffNotice('You took over this chat from your AI agent.')
    expect(r?.text).toBe('คุณเข้ามาดูแลแชทนี้แทนเอเจนต์ AI')
    expect(r?.linkLabel).toBe('เปิด AI กลับใน Business Suite')
  })

  it('AI ส่งคืนให้คน (ชวนไปสอน AI ต่อ) → แปลไทย + มีลิงก์', () => {
    const r = parseMetaAiHandoffNotice(
      'Your AI agent transferred this chat to you. Teach your AI so it can respond next time.',
    )
    expect(r?.text).toBe('เอเจนต์ AI ส่งต่อแชทนี้ให้คุณดูแล — สอน AI เพิ่มเพื่อให้ตอบเองได้ครั้งหน้า')
    expect(r?.url).toContain('business.facebook.com')
  })

  it('AI ส่งคืนเพราะลูกค้าพร้อมซื้อ → ความหมายต้องเป็น "พร้อมซื้อ" ไม่ใช่ "ขอคุยกับคน"', () => {
    const r = parseMetaAiHandoffNotice(
      'Your AI agent transferred this chat to you because your customer is ready to buy.',
    )
    expect(r?.text).toBe('เอเจนต์ AI ส่งต่อแชทนี้ให้คุณดูแล เพราะลูกค้าพร้อมสั่งซื้อแล้ว')
  })

  it('สตริงที่ไม่รู้จัก/ข้อความลูกค้าทั่วไป → null (fail-soft ตกไปเป็นบับเบิลปกติ ไม่พัง)', () => {
    expect(parseMetaAiHandoffNotice('Your AI agent did something new we have never seen')).toBeNull()
    expect(parseMetaAiHandoffNotice('สวัสดีครับ')).toBeNull()
    expect(parseMetaAiHandoffNotice(null)).toBeNull()
    expect(parseMetaAiHandoffNotice('')).toBeNull()
  })

  it('มีช่องว่างหัว/ท้าย (Meta เติมมาได้) → ยังต้องจับได้', () => {
    expect(parseMetaAiHandoffNotice('  Your AI agent will respond.  ')).not.toBeNull()
  })
})

/**
 * readMetaAiControlMarker — สัญญาณ "ใครถือห้อง" ที่ UI ใช้ตัดสินว่าจะบล็อกช่องพิมพ์ไหม
 *
 * 🛑 เกิดจากบั๊ก prod 2026-08-09: เดิม UI อ่านจาก `ChatMessage.viaStandby` ซึ่งแปลว่า
 * "เราไม่ใช่เจ้าของเธรด" (จริงตลอดเวลา เจ้าของคือ Page Inbox เสมอ) ไม่ได้แปลว่า "AI ถือห้อง"
 * → พอ AI คืนสิทธิ์แล้วคนตอบเอง ธงยังค้าง true แล้ว **ช่องพิมพ์ถูกบล็อกค้าง 18 เธรดพร้อมกัน**
 * ทั้งที่ผู้ขายกำลังคุยกับลูกค้าอยู่
 */
describe('readMetaAiControlMarker', () => {
  it('[blocker] "will respond" = AI ถือห้อง', () => {
    expect(readMetaAiControlMarker('Your AI agent will respond.')).toBe('AI')
  })

  it('[blocker] ทุกสตริงที่แปลว่า "ส่งคืนให้คน" ต้องเป็น HUMAN — ไม่ใช่แค่ตัวที่คนกด take over เอง', () => {
    // เคสที่หลุดตอนแรก: ทดสอบเจอแต่ "คนกด take over" เลยเชื่อว่า viaStandby พลิกเสมอ
    // แต่เคส "AI ส่งคืนเอง" สิทธิ์ไม่ได้เปลี่ยนมือ ธงจึงค้าง — ต้องครอบทั้ง 3 สตริง
    expect(readMetaAiControlMarker('You took over this chat from your AI agent.')).toBe('HUMAN')
    expect(
      readMetaAiControlMarker('Your AI agent transferred this chat to you. Teach your AI so it can respond next time.'),
    ).toBe('HUMAN')
    expect(
      readMetaAiControlMarker('Your AI agent transferred this chat to you because your customer is ready to buy.'),
    ).toBe('HUMAN')
  })

  it('ข้อความทั่วไป/ว่าง → null (ไม่ใช่ marker ห้ามตีความเป็นสถานะ)', () => {
    expect(readMetaAiControlMarker('หนูเชื่อมต่อคุณ Dang กับทีมงานให้แล้วนะคะ')).toBeNull()
    expect(readMetaAiControlMarker('ไม่มีคา')).toBeNull()
    expect(readMetaAiControlMarker(null)).toBeNull()
    expect(readMetaAiControlMarker('')).toBeNull()
  })

  it('marker ทุกตัวที่ parseMetaAiHandoffNotice แปลได้ ต้องอ่าน control ได้ด้วย (กันเพิ่มสตริงแล้วลืมใส่ control)', () => {
    for (const en of [
      'Your AI agent will respond.',
      'You took over this chat from your AI agent.',
      'Your AI agent transferred this chat to you. Teach your AI so it can respond next time.',
      'Your AI agent transferred this chat to you because your customer is ready to buy.',
    ]) {
      expect(parseMetaAiHandoffNotice(en)).not.toBeNull()
      expect(readMetaAiControlMarker(en)).not.toBeNull()
    }
  })
})
