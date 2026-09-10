import { describe, it, expect } from 'vitest'
import { isMetaPlaceholderName, normalizeMetaContactName } from '@/lib/meta-contact-name'

/**
 * [blocker] — ชื่อสำรองของ Meta ต้องไม่ถูกเก็บเป็น "ชื่อที่มีค่า"
 *
 * เคสจริง prod 2026-09-08: ห้องที่เปิดจาก private reply ใต้คอมเมนต์ได้ชื่อ "Facebook user"
 * มาจาก `/me/conversations` แล้วค้างถาวร เพราะ `ingestInboundMessage` ถามโปรไฟล์ใหม่เฉพาะตอน
 * `!contact.name`. ยิง Graph สดวันถัดมาด้วย token ใบเดิมได้ "Somkeat Konkayan" — ชื่อจริงมีอยู่
 * ตลอด เราแค่ไม่เคยถามซ้ำ
 */
describe('[blocker] ชื่อสำรองของ Meta', () => {
  it('จับ "Facebook user" ที่พบจริงบน prod (ตัว u เล็ก)', () => {
    expect(isMetaPlaceholderName('Facebook user')).toBe(true)
    expect(normalizeMetaContactName('Facebook user')).toBeNull()
  })

  it('ไม่สนตัวพิมพ์ใหญ่เล็กและช่องว่างหัวท้าย — Meta สลับได้', () => {
    for (const v of ['Facebook User', 'facebook user', '  FACEBOOK USER  ', 'Instagram User']) {
      expect(normalizeMetaContactName(v)).toBeNull()
    }
  })

  /**
   * 🛑 เคสที่บังคับให้ด่านเป็น "เทียบทั้งสตริง" ห้ามเป็น includes()
   * ถ้าใครเปลี่ยนไปใช้ includes/startsWith เทสนี้จะแดงทันที
   */
  it('ไม่กลืนชื่อจริงที่บังเอิญมีคำว่า Facebook/Instagram อยู่ข้างใน', () => {
    for (const v of [
      'Facebook Marketing',
      'Instagram user shop',
      'Somkeat Konkayan',
      'ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง',
      'user',
    ]) {
      expect(isMetaPlaceholderName(v)).toBe(false)
      expect(normalizeMetaContactName(v)).toBe(v.trim())
    }
  })

  it('ค่าว่าง/ช่องว่างล้วน/null = ยังไม่รู้ ไม่ใช่ชื่อ', () => {
    expect(normalizeMetaContactName(null)).toBeNull()
    expect(normalizeMetaContactName(undefined)).toBeNull()
    expect(normalizeMetaContactName('')).toBeNull()
    expect(normalizeMetaContactName('   ')).toBeNull()
    // null ไม่ใช่ "ชื่อสำรอง" — คนละความหมาย ห้ามยุบสองอันนี้เข้าด้วยกัน
    expect(isMetaPlaceholderName(null)).toBe(false)
  })

  it('ตัดช่องว่างหัวท้ายของชื่อจริง แต่ไม่แตะข้างใน', () => {
    expect(normalizeMetaContactName('  Somkeat  Konkayan  ')).toBe('Somkeat  Konkayan')
  })
})

/**
 * [blocker] — ด่านต้องอยู่ใน getContactProfile ทั้ง 3 ทางออก (IG · ชั้น 1 · ชั้น 2)
 * ไม่ใช่แค่ทางที่บังเอิญเจอบั๊ก. สแกนซอร์สเพราะ getContactProfile ยิง Graph จริง
 */
describe('[blocker] getContactProfile ต้อง normalize ทุกทางออก', () => {
  it('ไม่มีทางไหนคืนชื่อดิบจาก Graph', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync('src/lib/facebook/graph.ts', 'utf8')
    const body = src.slice(
      src.indexOf('export async function getContactProfile('),
      src.indexOf('export async function getLastInboundTime'),
    )
    expect(body.length).toBeGreaterThan(200)
    // ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
    const code = body
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).not.toMatch(/return \{ name: me\.name/)
    expect(code).not.toMatch(/name: \(json\.name as string \| undefined\) \|\|/)
    // ต้องเรียก normalize อย่างน้อย 3 ครั้ง (IG name+username, ชั้น 1, ชั้น 2)
    expect((code.match(/normalizeMetaContactName\(/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})

/**
 * [blocker] — ด่านที่ทำให้แถวที่เก็บค่าผิดไปแล้ว "ซ่อมตัวเอง"
 *
 * ตัว normalize ใน getContactProfile กันได้แค่ของใหม่ · แถวเก่าบน prod ที่มี name='Facebook user'
 * อยู่แล้วจะผ่าน `!existingContact.name` ทุกครั้ง ⇒ ต้องมี isMetaPlaceholderName ใน needsProfile ด้วย
 * (สแกนซอร์สเพราะ ingestInboundMessage แตะ prisma และรีโปนี้ไม่มี jsdom)
 */
describe('[blocker] ingestInboundMessage ต้องถามชื่อใหม่เมื่อของเดิมเป็นชื่อสำรอง', () => {
  it('needsProfile รวมเงื่อนไขชื่อสำรองไว้ด้วย', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync('src/services/channel-chat.service.ts', 'utf8')
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).toMatch(/import \{ isMetaPlaceholderName \} from '@\/lib\/meta-contact-name'/)
    // ต้องถูก "ใช้" ในนิพจน์ที่ตัดสิน needsProfile ไม่ใช่แค่ import มาวางไว้เฉย ๆ
    const decl = code.slice(code.indexOf('const hasPlaceholderName'), code.indexOf('const profile ='))
    expect(decl).toMatch(/isMetaPlaceholderName\(/)
    expect(decl).toMatch(/needsProfile[\s\S]*hasPlaceholderName/)
  })
})
