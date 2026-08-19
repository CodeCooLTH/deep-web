import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] โลโก้ที่ผู้ใช้เห็นต้องเป็นแบรนด์ของเรา ไม่ใช่ของธีมที่ก็อปมา
 *
 * ## บั๊กที่ด่านนี้กัน (พบ 2026-08-19 ตอนตรวจสกรีนช็อตก่อนส่ง App Store)
 *
 * หน้า login ของผู้ขายแสดงเวิร์ดมาร์ก **"Paces"** ซึ่งเป็นแบรนด์ของธีมที่โปรเจกต์ก็อปโครงมา
 * ไฟล์ `logo.png` / `logo-black.png` / `logo-sm.png` ลงวันที่เดียวกับวันที่ก็อปธีมเข้ามา
 * แล้วไม่มีใครเปลี่ยน — **หน้าจอแรกที่ผู้ใช้ทุกคนเห็นเป็นชื่อบริษัทอื่นมาตลอด**
 *
 * 🛑 ไม่มี gate ไหนของโปรเจกต์มองเห็นคลาสนี้เลย: `tsc`/build/eslint/theme-guard ผ่านหมด
 * เพราะ import รูปถูกทุกตัวอักษร สิ่งที่ผิดคือ **เนื้อในไฟล์รูป** ซึ่งไม่มีเครื่องมือไหนอ่าน
 * และ `logo-deep.png` (โลโก้ที่ถูกต้อง) ถูกวางไว้ในรีโปตั้งแต่ 20 มิ.ย. โดยไม่มีใครเรียกใช้เลย
 *
 * ## เกณฑ์
 *
 * ผูกกับ **ชื่อไฟล์** เพราะเป็นสิ่งเดียวที่ตรวจได้จากซอร์ส — ไฟล์ 3 ตัวที่มากับธีมห้ามถูก
 * import เข้า component ที่ผู้ใช้เห็น (ยังอยู่ในโฟลเดอร์ได้ ธีมอ้างอิงถึงมัน)
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const THEME_LOGOS = ['logo.png', 'logo-black.png', 'logo-sm.png']

const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : [],
  )

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

describe('[blocker] แบรนด์บนจอต้องเป็น Deep ไม่ใช่ธีม', () => {
  it('หน้า auth ของผู้ขายต้องใช้โลโก้ Deep', () => {
    const code = blankComments(readFileSync(join(ROOT, 'src/components/AuthLogo.tsx'), 'utf8'))
    expect(code, 'ต้อง import โลโก้ Deep').toMatch(/logo-deep-app\.png/)
    for (const f of THEME_LOGOS) {
      expect(code, `AuthLogo ห้ามใช้ ${f} (โลโก้ของธีม)`).not.toContain(f)
    }
  })

  it('[blocker] ไม่มีหน้าไหนของ seller ใช้โลโก้ของธีมอีก', () => {
    /**
     * สแกนทั้งต้นไม้ ไม่ hardcode รายชื่อไฟล์ ⇒ component ใหม่ที่เผลอ import ของธีมจะแดงเอง
     * (ตัวที่พลาดจริงคือ `AppLogo.tsx` ซึ่งไม่ได้ชื่อว่า "auth" อะไรเลย — รายชื่อที่คิดเองจะตกมัน)
     */
    const offenders: string[] = []
    for (const rel of [...walk('src/components'), ...walk('src/layouts'), ...walk('src/app/(paces)')]) {
      const code = blankComments(readFileSync(join(ROOT, rel), 'utf8'))
      for (const f of THEME_LOGOS) {
        if (code.includes(`images/${f}`)) offenders.push(`${rel} → ${f}`)
      }
    }
    expect(offenders, 'เปลี่ยนไปใช้ logo-deep-app.png').toEqual([])
  })

  it('[blocker] หัวหน้าแชทต้องมีปุ่มย้อนกลับ ไม่ใช่โลโก้กดได้', () => {
    /**
     * user สั่ง 2026-08-19 — **กลับมติ** ของ 2026-07-23 ที่เคยสั่งตัดปุ่มนี้ออก
     *
     * เหตุผลที่กลับมติมีน้ำหนัก: คอมเมนต์เดิมอ้างว่ามีทางกลับ 2 ทาง (โลโก้ + ปุ่ม storefront)
     * แต่ปุ่ม storefront **ไม่มีอยู่จริงแล้ว** ⇒ เหลือ "คลิกโลโก้" ซึ่งมองไม่เห็นว่ากดได้
     *
     * ด่านนี้กันการ "แก้กลับโดยไม่รู้ประวัติ" — ใครอ่านโค้ดเฉย ๆ จะเห็นแค่ว่าหัวแชทไม่มีโลโก้
     * แล้วคิดว่าเป็นความพลาด
     */
    const rel = 'src/app/(paces)/seller/(chat)/_components/ChatHeader.tsx'
    const code = blankComments(readFileSync(join(ROOT, rel), 'utf8'))
    expect(code, 'ต้องใช้ปุ่มย้อนกลับตัวเดียวกับหน้าเปิดซ้อน').toMatch(/<FullscreenBackButton/)
    expect(code, 'ปลายทางต้องปักหมุด /dashboard ไม่ใช่ router.back()').toMatch(
      /backHref="\/dashboard"/,
    )
    expect(code, 'ห้ามกลับไปใช้โลโก้เป็นทางกลับ').not.toMatch(/<AppLogo/)
  })
})
