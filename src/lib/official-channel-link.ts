/**
 * official-channel-link — SSOT ของ "ลิงก์ของช่องทางที่ร้านเชื่อมไว้"
 *
 * 🛑 ทำไมต้องมีไฟล์นี้: ก่อนหน้านี้มี URL builder กระจายอยู่ **3 ที่ที่ไม่ตรงกัน**
 *   `v2/OfficialChannels.tsx` (แท็บช่องทาง) · `ChannelStrip` (หัวโปรไฟล์) · ปุ่มทักในหน้าโปรไฟล์
 * และตัวที่สามสร้าง URL จาก field ที่อีกสองตัว **ปฏิเสธที่จะใช้** — ผลคือปุ่มหลักของหน้าพา
 * ผู้ซื้อไปหน้า 404 ของแพลตฟอร์มอื่นในวินาทีที่เขาเพิ่งตัดสินใจเชื่อร้าน (critique 2026-08-13 P1)
 *
 * ── สองบทบาทที่ต้องแยกจากกัน ────────────────────────────────────────
 *   `profileUrl()` = "เปิดดูเพจ"  — พาไปหน้าเพจสาธารณะ ใช้ตรวจว่าเพจนี้ใช่ที่เคยเห็นในฟีดไหม
 *   `chatUrl()`    = "ทักข้อความ" — พาเข้าห้องแชทโดยตรง
 * สองอันนี้ใช้ host คนละตัวและบางแพลตฟอร์มใช้ **คนละ identifier** จึงรวมเป็นฟังก์ชันเดียวไม่ได้
 *
 * ── identifier ของแต่ละแพลตฟอร์มไม่ใช่ตัวเดียวกัน (จุดที่เคยพลาด) ──────
 *   MESSENGER  `externalId` = Page ID           → ใช้ได้ทั้งสองบทบาท
 *   INSTAGRAM  `externalId` = **IG Business Account ID (ตัวเลข)** ซึ่ง `instagram.com/` และ
 *              `ig.me/` **ไม่รับ** — ต้องใช้ handle ที่เก็บอยู่ใน `name` (รูปแบบ `@handle`)
 *              (กติกานี้ `OfficialChannels.tsx` เขียนกำกับไว้เองว่า "IG ใช้ username ไม่ใช่ business id")
 *   LINE       `externalId` = LINE user/bot id ภายใน **ไม่ใช่** Basic ID ที่ขึ้นต้นด้วย `@`
 *              ต้องใช้คอลัมน์ `basicId` ซึ่งมีอยู่ใน schema แล้ว
 *
 * 🛑 คืน `null` เมื่อประกอบไม่ได้เสมอ — ห้ามเดา ห้าม fallback ไปโครง URL ของแพลตฟอร์มอื่น
 * ผู้เรียกต้องซ่อนปุ่ม/ลิงก์นั้นไป ไม่ใช่ปล่อยให้กดแล้วพัง (ลิงก์ที่พาไป 404 บนหน้าที่ทั้งหน้า
 * มีไว้พิสูจน์ความน่าเชื่อถือ เสียหายกว่าไม่มีลิงก์)
 */

/** ข้อมูลขั้นต่ำที่ต้องใช้ประกอบลิงก์ — ตรงกับ subset ของ `ShopChannel` ที่หน้าสาธารณะ select มา */
export type ChannelLinkInput = {
  provider: string
  externalId: string
  /** ชื่อที่ cache ไว้ตอนเชื่อม — สำหรับ Instagram คือ handle รูปแบบ `@handle` */
  name: string
  /** LINE Basic ID (ขึ้นต้นด้วย `@`) — `null` สำหรับช่องทางอื่น หรือเพจที่เชื่อมก่อนมีคอลัมน์นี้ */
  basicId?: string | null
}

/** handle ของ IG จาก `name` — คืน null เมื่อค่าที่เก็บไว้ไม่ใช่รูปแบบ handle */
function instagramHandle(name: string): string | null {
  const trimmed = name.trim()
  return trimmed.startsWith('@') && trimmed.length > 1 ? trimmed.slice(1) : null
}

/** LINE Basic ID — ยอมรับทั้งที่มีและไม่มี `@` นำหน้า แล้ว normalize ให้เหลือรูปเดียว */
function lineBasicId(basicId: string | null | undefined): string | null {
  const trimmed = basicId?.trim()
  if (!trimmed) return null
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

/** ลิงก์ "เปิดดูเพจ" — หน้าสาธารณะของช่องทางนั้น */
export function channelProfileUrl(c: ChannelLinkInput): string | null {
  switch (c.provider) {
    case 'MESSENGER':
      return `https://www.facebook.com/${c.externalId}`
    case 'INSTAGRAM': {
      const handle = instagramHandle(c.name)
      return handle ? `https://www.instagram.com/${handle}` : null
    }
    case 'LINE': {
      const id = lineBasicId(c.basicId)
      return id ? `https://line.me/R/ti/p/@${id}` : null
    }
    default:
      return null
  }
}

/**
 * ลิงก์ "ทักข้อความ" — เข้าห้องแชทโดยตรง
 *
 * LINE ไม่มี deep link แยกสำหรับ "เปิดห้องแชท" ที่ต่างจากหน้าโปรไฟล์ของ OA
 * (`line.me/R/ti/p/@id` เปิดหน้าบัญชีซึ่งมีปุ่มแชทอยู่ในตัว) จึงคืนค่าเดียวกับ `channelProfileUrl`
 */
export function channelChatUrl(c: ChannelLinkInput): string | null {
  switch (c.provider) {
    case 'MESSENGER':
      return `https://m.me/${c.externalId}`
    case 'INSTAGRAM': {
      const handle = instagramHandle(c.name)
      return handle ? `https://ig.me/m/${handle}` : null
    }
    case 'LINE':
      return channelProfileUrl(c)
    default:
      return null
  }
}

/**
 * ชื่อแพลตฟอร์มแบบสั้นสำหรับ **ป้ายปุ่ม**
 *
 * 🛑 ห้ามใช้ชื่อเพจในป้ายปุ่ม — ชื่อเพจจริงยาวได้ถึง 34 ตัวอักษร ("ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง")
 * ซึ่งล้นปุ่มทันทีที่ 390px และชื่อเพจก็แสดงอยู่ในบล็อกเพจทางการด้านล่างอยู่แล้ว
 * ปุ่มต้องตอบแค่ "กดแล้วไปไหน"
 */
export const CHANNEL_SHORT_LABEL: Record<string, string> = {
  MESSENGER: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINE: 'LINE',
}

/** ป้ายเต็มของชนิดช่องทาง — ใช้ในรายการ ไม่ใช่บนปุ่ม */
export const CHANNEL_FULL_LABEL: Record<string, string> = {
  MESSENGER: 'Facebook Page',
  INSTAGRAM: 'Instagram',
  LINE: 'LINE Official Account',
}

/** คำเรียกยอดตามแพลตฟอร์ม — Instagram/LINE ไม่มี "ถูกใจ" ของบัญชี มีแต่ผู้ติดตาม */
export const CHANNEL_FOLLOWER_LABEL: Record<string, string> = {
  MESSENGER: 'ถูกใจ',
  INSTAGRAM: 'ผู้ติดตาม',
  LINE: 'ผู้ติดตาม',
}

/** ช่องทางแรกที่ "ทักได้จริง" — ผู้เรียกใช้เลือกปลายทางของปุ่มหลัก
 *  คืน null เมื่อไม่มีช่องทางไหนประกอบลิงก์แชทได้ ⇒ หน้าจอต้องไม่แสดงปุ่มทัก */
export function firstChattableChannel<T extends ChannelLinkInput>(channels: T[]): T | null {
  return channels.find((c) => channelChatUrl(c) !== null) ?? null
}
