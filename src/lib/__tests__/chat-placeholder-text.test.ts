import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  metaAppName,
  attachmentFailedText,
  emptyMessageText,
  emptyMessagePreview,
} from '@/lib/chat-placeholder-text'

const ROOT = process.cwd()

/**
 * 🛑 [blocker] ทั้งไฟล์
 *
 * บั๊กที่ไฟล์นี้มาปิด (พบบน prod 2026-08-26):
 *  1. ผู้ขายส่งสติกเกอร์ใน **Instagram** แล้วบับเบิลขึ้นว่า *"[ข้อความพิเศษ เช่น คำขอโทรกลับ —
 *     ระบบยังไม่รองรับ **เปิดดูใน Messenger**]"* — ผิดทั้งชนิดและผิดแอป
 *  2. ตารางคำแทนไฟล์แนบฮาร์ดโค้ด "Messenger" ทุกบรรทัด ทั้งที่ IG ใช้ตารางเดียวกัน
 */
describe('[blocker] chat-placeholder-text', () => {
  it('คำว่า Messenger ต้องไม่โผล่ในข้อความของ Instagram เลยสักที่', () => {
    const types = [
      'image', 'sticker', 'video', 'reel', 'ig_reel', 'audio', 'file',
      'location', 'fallback', 'post', 'ig_post', 'template', 'ไม่รู้จัก',
    ]
    for (const t of types) {
      expect(attachmentFailedText('INSTAGRAM', t), t).not.toContain('Messenger')
    }
    expect(emptyMessageText('INSTAGRAM')).not.toContain('Messenger')
    expect(emptyMessageText('INSTAGRAM', { isUnsupported: true })).not.toContain('Messenger')
    expect(emptyMessageText('INSTAGRAM', { aiGenerated: true })).not.toContain('Messenger')
  })

  it('ฝั่ง Messenger ต้องไม่ชี้ผู้ขายไป Instagram (ยกเว้นสตอรี่ ซึ่งเป็นของ IG เสมอ)', () => {
    for (const t of ['image', 'video', 'audio', 'file', 'template']) {
      expect(attachmentFailedText('MESSENGER', t), t).not.toContain('Instagram')
    }
    // story_mention เป็นฟีเจอร์ของ Instagram ล้วน — ต้องพูดว่า Instagram แม้ provider จะเป็นอย่างอื่น
    expect(attachmentFailedText('MESSENGER', 'story_mention')).toContain('Instagram')
  })

  it('provider ที่ไม่รู้จักถอยไป Messenger (fail-safe — ห้ามได้สตริงว่างหรือ undefined)', () => {
    expect(metaAppName('LINE')).toBe('Messenger')
    expect(metaAppName('')).toBe('Messenger')
    expect(attachmentFailedText('อะไรก็ไม่รู้', 'image').length).toBeGreaterThan(0)
  })

  it('[blocker] ห้ามเดาว่าเป็น "คำขอโทรกลับ" อีก — คำเดิมผิด 2 ใน 3 เคสจริงบน prod', () => {
    for (const flags of [{}, { isUnsupported: true }, { aiGenerated: true }]) {
      for (const p of ['MESSENGER', 'INSTAGRAM']) {
        expect(emptyMessageText(p, flags)).not.toContain('โทรกลับ')
      }
    }
  })

  it('[blocker] มีธงบอกชนิดเมื่อไหร่ ต้องพูดชื่อชนิดนั้น — ไม่มีธงห้ามเดา', () => {
    // สติกเกอร์ IG = เคสเดียวที่ยืนยันด้วย payload จริง (is_unsupported + is_echo, 17:37 น.)
    expect(emptyMessageText('INSTAGRAM', { isUnsupported: true })).toContain('สติกเกอร์')
    // ฝั่ง Messenger ยังไม่เคยเห็นตัวอย่าง ⇒ ห้ามพูดว่าสติกเกอร์
    expect(emptyMessageText('MESSENGER', { isUnsupported: true })).not.toContain('สติกเกอร์')
    // ไม่มีธง = ไม่รู้ ⇒ ห้ามพูดชื่อชนิดใด ๆ
    const unknown = emptyMessageText('MESSENGER')
    expect(unknown).not.toContain('สติกเกอร์')
    expect(unknown).not.toContain('AI')
  })

  it('[blocker] ai_generated ชนะ is_unsupported เมื่อมาพร้อมกัน (บอกว่ามีคนตอบไปแล้วสำคัญกว่า)', () => {
    const both = emptyMessageText('MESSENGER', { isUnsupported: true, aiGenerated: true })
    expect(both).toContain('AI ของ Meta')
    expect(emptyMessagePreview({ isUnsupported: true, aiGenerated: true })).toContain('AI ของ Meta')
  })

  it('[blocker] preview ต้องสั้นกว่า body เสมอ (รายการแชทมีที่จำกัด)', () => {
    for (const flags of [{}, { isUnsupported: true }, { aiGenerated: true }]) {
      const preview = emptyMessagePreview(flags)
      expect(preview.length, JSON.stringify(flags)).toBeLessThanOrEqual(30)
      expect(preview.length).toBeLessThan(emptyMessageText('INSTAGRAM', flags).length)
    }
  })

  it('[blocker] Valibot ต้องเก็บ 3 ธงนี้ไว้ ไม่งั้นค่าไปไม่ถึงฟังก์ชันข้างบนเลย', () => {
    // ธงเหล่านี้เคยถูก schema ตัดทิ้งทั้งหมด — ค่ามีใน rawMessage แต่โค้ดใช้ไม่ได้
    // (คลาสเดียวกับ AttachmentSchema.type ที่ทำรูป 6 ใบหายทั้งชุด 2026-08-04)
    const schema = readFileSync(join(ROOT, 'src/lib/facebook/webhook-types.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    for (const f of ['is_unsupported', 'ai_generated', 'app_id']) {
      expect(schema, f).toMatch(new RegExp(`${f}:\\s*v\\.optional\\(`))
    }
  })

  it('[blocker] ingest ต้องอ่านธงจาก event จริง ไม่ใช่เรียกฟังก์ชันเปล่า ๆ', () => {
    const src = readFileSync(join(ROOT, 'src/services/channel-chat.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    expect(src).toMatch(/isUnsupported:\s*event\.message\?\.is_unsupported/)
    expect(src).toMatch(/aiGenerated:\s*event\.message\?\.ai_generated/)
    // และต้องส่ง provider เข้าไปจริง ไม่ใช่ hardcode ช่องทาง
    expect(src).toMatch(/attachmentFailedText\(provider,/)
    expect(src).toMatch(/emptyMessageText\(provider,/)
  })
})

/**
 * 🛑 [blocker] `share` — ชนิดของ Instagram ที่หายไปจากตารางมาตั้งแต่ต้น
 *
 * เอกสาร IG Messaging ระบุ attachment 8 ชนิด: audio · file · image · **share** ·
 * story_mention · video · ig_reel · reel — ของเรามีครบทุกตัว **ยกเว้น share**
 * ⇒ ลูกค้าแชร์โพสต์/รีลมาถามว่า "มีตัวนี้ไหม" ร้านเห็นเป็นกล่องเปล่า
 *
 * จัดเป็น "ลิงก์" ไม่ใช่ "สื่อ" เพราะเอกสารเขียนว่า *"Only the URL for the shared media or
 * post is included"* — ไม่มี asset ให้ mirror การเอาไปใส่ MEDIA_TYPE จะทำให้ระบบพยายาม
 * mirror URL ภายนอกซึ่ง host allow-list บล็อกอยู่แล้ว = ได้กล่องเปล่าเหมือนเดิม
 */
describe('[blocker] attachment type ของ Instagram ต้องครบตามเอกสาร', () => {
  const IG_TYPES = ['audio', 'file', 'image', 'share', 'story_mention', 'video', 'ig_reel', 'reel']

  it('ทุกชนิดต้องมีคำเฉพาะของตัวเอง ไม่ตกไปคำกลาง "[ไฟล์แนบ]"', () => {
    const generic = attachmentFailedText('INSTAGRAM', 'ชนิดที่ไม่มีจริง')
    for (const t of IG_TYPES) {
      if (t === 'file') continue // 'file' ใช้คำเดียวกับคำกลางโดยตั้งใจ
      expect(attachmentFailedText('INSTAGRAM', t), t).not.toBe(generic)
    }
  })

  it('share ต้องถูกจัดเป็น "ลิงก์" ใน LINK_TYPES ของ ingest (ไม่ใช่ MEDIA_TYPE)', () => {
    const src = readFileSync(join(ROOT, 'src/services/channel-chat.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
    const linkTypes = src.match(/const LINK_TYPES = new Set\(\[([^\]]*)\]\)/)
    expect(linkTypes, 'หา LINK_TYPES ไม่เจอ').not.toBeNull()
    expect(linkTypes![1]).toContain("'share'")
    // และต้องไม่โผล่ใน MEDIA_TYPE — ไม่มี asset ให้ mirror
    const mediaTypes = src.match(/const MEDIA_TYPE: Record<string, string> = \{([\s\S]*?)\}/)
    expect(mediaTypes, 'หา MEDIA_TYPE ไม่เจอ').not.toBeNull()
    expect(mediaTypes![1]).not.toContain('share')
  })
})
