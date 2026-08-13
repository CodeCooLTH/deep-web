/**
 * i18n — นิยามภาษาที่ระบบรองรับ (feature 00047)
 *
 * ที่มา: Meta ตีกลับ App Review 2026-08-13 และระบุ best practice ว่าให้ใช้ภาษาอังกฤษ
 * เป็นภาษาของส่วนติดต่อผู้ใช้ (ดู docs/20 - Features/00047 - Bilingual UI/PRD.md)
 *
 * 🛑 BR-I18N-02 — การสลับภาษา "ห้ามเปลี่ยน URL" เด็ดขาด
 * เหตุผลไม่ใช่ความสวยงาม แต่เป็นความปลอดภัย: `src/proxy.ts` ทำ subdomain rewrite
 * (main / seller / admin) อยู่แล้ว การเพิ่ม path segment แบบ `/[locale]/...` จะชนกับ rewrite
 * ทุกเส้น และเป็นคลาสบั๊ก "404 เฉพาะบางโดเมน" ที่รีโปนี้พลาดมาแล้ว 2 ครั้ง
 * (docs/conventions/root-served-assets-and-proxy.md) — ตัดความเสี่ยงทิ้งตั้งแต่ต้น
 * ด้วยการเก็บภาษาไว้ใน cookie แทน
 *
 * 🛑 BR-I18N-03 — ห้ามเดาภาษาจาก Accept-Language ของเบราว์เซอร์
 * ผู้ขายไทยจำนวนมากตั้งเครื่องเป็นภาษาอังกฤษ ถ้าเดาจะเปลี่ยนภาษาให้คนที่ไม่ได้ขอ
 * ซึ่งขัดกับ FR-I18N-10 (ผู้ใช้เดิมต้องไม่เห็นความเปลี่ยนแปลงใด ๆ) โดยตรง
 *
 * ── ค่าภาษามาจากไหน (มติ D-I18N-4/5/6) ─────────────────────────────────────
 * `User.locale` ในฐานข้อมูลคือ **แหล่งความจริงเดียว** ตั้งค่าได้ที่หน้า `/account`
 * cookie ตัวนี้เป็นเพียง **เงา** ของค่านั้น มีไว้เพื่อกรณีเดียว: หน้าที่ยังไม่ล็อกอิน
 * (`/auth/sign-in`) ซึ่งไม่รู้ว่าใครกำลังดูอยู่ จึงอ่านค่าจาก DB ไม่ได้
 *
 * 🛑 ลำดับความสำคัญ: **มี session → DB ชนะเสมอ · ไม่มี session → ใช้ cookie**
 * ห้ามให้ cookie เขียนทับค่าใน DB ไม่ว่ากรณีใด — เครื่องหนึ่งเครื่องมีคนใช้ได้หลายคน
 * (เครื่องรวมหน้าร้าน/พนักงานยืมกัน) ถ้าปล่อยให้ทับ คนก่อนหน้ากด EN ทิ้งไว้แล้วเจ้าของ
 * บัญชีล็อกอินตาม จะถูกเปลี่ยนการตั้งค่าถาวรโดยไม่มีใครตั้งใจและไม่มีอะไรฟ้อง
 *
 * ทำไม cookie ไม่ใช่ localStorage (ต่างจาก useTextScale.ts ที่เป็นพี่น้องกันบน topbar):
 * `localStorage` เซิร์ฟเวอร์อ่านไม่ได้ ⇒ หน้า sign-in จะออกมาเป็นภาษาไทยเสมอแล้วค่อย
 * กระพริบเป็นอังกฤษหลัง hydrate ซึ่ง FR-I18N-02 ห้ามไว้ตรงตัว
 */

export const LOCALES = ['th', 'en'] as const

export type Locale = (typeof LOCALES)[number]

/** BR-I18N-01 — ค่าตั้งต้นคือไทยเสมอ ทุกบัญชี ทุกเครื่อง */
export const DEFAULT_LOCALE: Locale = 'th'

/** ชื่อ cookie ที่เก็บภาษา — ต้องตรงกันทั้งฝั่งอ่าน (server) และฝั่งเขียน (client) */
export const LOCALE_COOKIE = 'deep_locale'

/** อายุ cookie 1 ปี — FR-I18N-02 "ยังคงเดิมเมื่อกลับมาใช้งานในวันถัดไป" */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * BR-I18N-05 — ค่าที่ไม่รู้จักหรือเสียหาย ต้องถอยไปใช้ไทย ไม่ใช่ปล่อยผ่าน
 *
 * cookie เป็นค่าที่ client เขียนเองได้ทั้งหมด ⇒ ห้ามเอาไปใช้ตรง ๆ โดยไม่ตรวจ
 * (ค่าที่ไม่รู้จักจะทำให้ค้นหา dictionary ไม่เจอแล้วหน้าจอว่าง)
 */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** แปลงค่าดิบจาก cookie เป็น Locale ที่ใช้ได้เสมอ — fail-closed ไปที่ไทย */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}
