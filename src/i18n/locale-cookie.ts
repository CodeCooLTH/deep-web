/**
 * เงา cookie ของภาษา — ฝั่ง client (feature 00047)
 *
 * 🛑 cookie ตัวนี้ไม่ใช่แหล่งความจริง `User.locale` ในฐานข้อมูลคือแหล่งความจริง
 * cookie มีไว้เพื่อกรณีเดียวเท่านั้น: หน้าที่ยังไม่ล็อกอิน (`/auth/sign-in`) ซึ่งเซิร์ฟเวอร์
 * ไม่รู้ว่าใครกำลังดูอยู่ จึงอ่านค่าจาก DB ไม่ได้ (มติ D-I18N-5)
 *
 * แยกออกมาเป็นไฟล์ของตัวเองเพราะมีผู้เรียก 2 ฝั่งที่เจตนาต่างกันมาก:
 *   - `LocaleProvider` เรียกเพื่อ "ตามให้ทัน" ค่าใน DB (เงา)
 *   - ตัวสลับภาษาบนหน้า sign-in เรียกเพื่อ "ตั้งค่าชั่วคราวก่อนล็อกอิน"
 * ถ้าปล่อยฟังก์ชันนี้ไว้ใน provider จะมีคนหยิบไปใช้ในหน้าที่ล็อกอินแล้ว ซึ่งจะเขียน cookie
 * โดยไม่แตะ DB แล้วค่าจะถูก DB ทับกลับทันทีที่ refresh = ผู้ใช้เห็นภาษาเด้งกลับโดยไม่มี
 * คำอธิบาย และไม่มีอะไรฟ้องว่าใครทำ
 */
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from './locales'

/**
 * เขียน cookie ภาษาที่เบราว์เซอร์
 *
 * ไม่ตั้ง `domain=` โดยตั้งใจ — cookie ผูกกับ host ที่กด (seller.deepthailand.app) ซึ่งครอบ
 * ขอบเขตรอบนี้ครบแล้ว การเปิดเป็น `.deepthailand.app` จะทำให้ค่าไหลไปฝั่งผู้ซื้อและฝั่งแอดมิน
 * ที่ยังไม่ได้แปล โดยไม่มีใครขอ
 *
 * `secure` ใส่เฉพาะบน https — บน dev (`deepth.local` ผ่าน http) ถ้าใส่ เบราว์เซอร์จะทิ้ง
 * cookie เงียบ ๆ แล้วการสลับภาษาจะไม่ทำงานโดยไม่มี error ให้เห็นสักตัว
 */
export function writeLocaleCookie(next: Locale) {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`
}

/** อ่าน cookie ภาษาที่เบราว์เซอร์ — คืน null ถ้าไม่มี (ไม่ตีความเป็นค่าตั้งต้นที่นี่) */
export function readLocaleCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}
