import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] จอโหลดของโซนผู้ขาย — 3 กติกาที่ตกลงกับหัวหน้าไว้ 2026-08-20
 *
 * ## บริบท
 *
 * หัวหน้าเห็นจอ "กำลังสลับไปที่ร้าน …" (`ShopSwitchOverlay`) แล้วอยากได้จอโหลดสวย ๆ แบบนั้น
 * แต่เมื่อคุยกันจบ ได้ข้อสรุป 3 ข้อที่ *ขัดกับสัญชาตญาณ* พอที่จะถูกแก้กลับโดยไม่ตั้งใจ:
 *
 *   1. จอแบรนด์เอา **เฉพาะตอนเปิดครั้งแรก** (*"เอาแค่หน้าตอนแรกไหม"*)
 *   2. หน้าอื่น ๆ **คง skeleton ไว้เหมือนเดิม** (*"หน้าอื่นๆเป็น Skeleton เหมือนเดิมนะ"*)
 *   3. ใช้ **โลโก้ Deep** ไม่ใช่รูปร้าน (*"ถ้าหน้าอื่นๆ logo deep ก็ OK"*)
 *
 * ## ทำไมต้องมีด่าน ทั้งที่เขียนคอมเมนต์ไว้แล้ว
 *
 * ข้อ 2 คือข้อที่เสี่ยงที่สุด — จอโลโก้กลางจอ **สวยกว่า** skeleton เทา ๆ อย่างเห็นได้ชัด
 * คนที่มาเห็นทีหลังจะอยากยกไปใช้ให้ครบทุกหน้าโดยสุจริตใจ ทั้งที่มันคือการ **ถอยหลัง**:
 * skeleton ที่เลียนโครงหน้าจริงทำให้ผู้ใช้เห็นล่วงหน้าว่าหน้ากำลังจะมีอะไร จึง *รู้สึกเร็วกว่า*
 * overlay ทับจอเปล่า — เป็นข้อดีที่วัดจากภาพนิ่งไม่เห็น จึงไม่มีอะไรฟ้องถ้าถูกแก้กลับ
 *
 * `tsc`/build/eslint/theme-guard ผ่านหมดทุกกรณีข้างบน เพราะโค้ดถูกทุกตัวอักษร
 * สิ่งที่ผิดคือ **จอนี้อยู่ตรงไหน** ไม่ใช่ *เขียนยังไง*
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const SELLER = 'src/app/(paces)/seller'

/**
 * ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
 * (คลาสเดียวกับ grep gate ของ HR9 ที่เคยแดงค้างจากคำเตือนตัวเอง 2026-08-02→03)
 *
 * 🛑 ต้องเก็บคอมเมนต์ **ท้ายบรรทัด** ด้วย (`const X = 1 // เหตุผลไทย`) ไม่ใช่เฉพาะบรรทัดที่
 * ขึ้นต้นด้วย `//` — `NavigationLoader.tsx` มีคอมเมนต์ไทยท้ายบรรทัดค่าคงที่ 2 จุด ถ้าตัดไม่ครบ
 * ด่านข้อ 1 จะแดงใส่ไฟล์ที่ทำถูกแล้ว
 */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)
    // ท้ายบรรทัด: ตัดเฉพาะ `//` ที่ตามหลังช่องว่าง และไม่ได้อยู่ในสตริง/URL (`https://`)
    .replace(/^([^'"`\n]*?)\s\/\/[^\n]*$/gm, '$1')

const read = (rel: string) => blankComments(readFileSync(join(ROOT, rel), 'utf8'))
const THAI = /[฀-๿]/

const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name === 'loading.tsx' ? [`${dir}/${e.name}`] : [],
  )

const ALL_LOADING = walk(SELLER)
const BOOT = `${SELLER}/loading.tsx`

describe('[blocker] จอโหลดโซนผู้ขาย', () => {
  /**
   * ## 1. จอโหลดที่เป็น "ระดับทั้งแอป" ห้ามฝังภาษาไทยตายตัว
   *
   * จอโหลดคือ **จอแรกที่ผู้ใช้เห็น** — ผู้ใช้ที่ตั้งภาษาอังกฤษจะเห็นไทยแวบหนึ่งทุกครั้ง
   * แล้วค่อยเปลี่ยนเป็นอังกฤษ (กฎนี้ `dashboard/loading.tsx` เขียนไว้เองตั้งแต่ feature 00047)
   *
   * 🛑 ขอบเขตคือ **3 จอระดับทั้งแอป** เท่านั้น ไม่ใช่ทุก `loading.tsx` — ตอนเขียนด่านนี้
   * (2026-08-20) ยังมี **13 ไฟล์ที่ฝังไทยอยู่** ซึ่งเป็นงานค้างของ feature 00047 ที่หัวหน้า
   * กำลังไล่แปลอยู่ การลากมาไว้ในด่านนี้ = ด่านแดงตั้งแต่วันแรกแล้วถูกปิดทิ้ง
   * (`docs/conventions/rule-must-be-enforced-not-described.md`)
   *
   * เพิ่มไฟล์เข้ารายการนี้ได้เรื่อย ๆ เมื่อ 00047 ไล่แปลถึง — ห้ามถอดออก
   */
  const I18N_REQUIRED = [BOOT, `${SELLER}/NavigationLoader.tsx`, `${SELLER}/(fullscreen)/loading.tsx`]

  for (const rel of I18N_REQUIRED) {
    it(`${rel.split('/').slice(-2).join('/')} — ห้ามฝังภาษาไทยตายตัว`, () => {
      const hits = read(rel)
        .split('\n')
        .map((l, i) => ({ l, i: i + 1 }))
        .filter(({ l }) => THAI.test(l))
        .map(({ l, i }) => `${rel}:${i}  ${l.trim().slice(0, 70)}`)
      expect(hits, 'ใช้ useT() แทนการเขียนคำไทยลงไปตรง ๆ').toEqual([])
    })
  }

  /**
   * ## 2. จอเปิดครั้งแรกห้ามเอ่ยถึง "ร้าน"
   *
   * fallback ตัวนี้ทำงาน **ก่อน** `(dashboard)/layout.tsx` เรียก `requireActiveShop()`
   * ⇒ ณ จังหวะนั้นระบบยังไม่รู้ว่า active อยู่ร้านไหน ชื่อ/รูปร้านที่ใส่ลงไปจะเป็นการเดา
   * แล้วกระพริบเปลี่ยนตอนโหลดเสร็จ — แย่กว่าไม่บอกเลย
   *
   * และในเชิงความหมาย รูปร้าน+วงแหวนสงวนไว้สื่อ "กำลังสลับร้าน" (`ShopSwitchOverlay`)
   * ถ้าโผล่ตอนโหลดธรรมดาด้วย จะไม่เหลือสัญญาณให้ผู้ใช้แยกสองเหตุการณ์
   */
  it('seller/loading.tsx — ห้ามอ้างชื่อ/รูปร้าน (ยังไม่รู้ว่า active ร้านไหน)', () => {
    const code = read(BOOT)
    const banned = /AccountAvatar|activeShopName|activeShopLogo|shopName|shopLogo|useSession|switchingTo/
    const hits = code
      .split('\n')
      .map((l, i) => ({ l, i: i + 1 }))
      .filter(({ l }) => banned.test(l))
      .map(({ l, i }) => `${BOOT}:${i}  ${l.trim().slice(0, 70)}`)
    expect(hits, 'ใช้โลโก้ Deep (logo-deep-mark) เท่านั้น').toEqual([])
    // และต้องใช้โลโก้ Deep จริง ๆ ไม่ใช่สปินเนอร์เปล่า — นี่คือสิ่งที่หัวหน้าขอ
    expect(code, 'จอเปิดครั้งแรกต้องมีโลโก้ Deep').toMatch(/logo-deep-mark/)
  })

  /**
   * ## 3. `loading.tsx` ระดับ "หน้า" ห้ามกลายเป็น overlay เต็มจอ
   *
   * เกณฑ์ที่จับได้จริงคือ `fixed inset-0` — ลายเซ็นของ overlay ทับทั้งจอ ซึ่งเป็นรูปร่างของ
   * การ "ยกจอเปิดครั้งแรกไปใช้ทุกหน้า" ที่มติข้อ 2 ห้ามไว้
   *
   * carve-out: `seller/loading.tsx` เอง (จอเปิดครั้งแรก — ต้องเป็น overlay เต็มจอ)
   */
  it('loading.tsx ระดับหน้า ต้องเป็น skeleton ไม่ใช่ overlay เต็มจอ', () => {
    const offenders = ALL_LOADING.filter((f) => f !== BOOT)
      .filter((f) => /fixed\s+inset-0/.test(read(f)))
      .map((f) => f.replace(`${SELLER}/`, ''))
    expect(
      offenders,
      'skeleton ที่เลียนโครงหน้าจริง "รู้สึกเร็วกว่า" overlay ทับจอเปล่า — หัวหน้าเคาะแล้ว 2026-08-20',
    ).toEqual([])
  })
})
