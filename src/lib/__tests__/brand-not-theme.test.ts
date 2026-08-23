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
 * โลโก้ที่ถูกต้องถูกวางไว้ในรีโปตั้งแต่ 20 มิ.ย. โดยไม่มีใครเรียกใช้เลยอยู่พักใหญ่ — ตอนนี้เรียกใช้แล้ว
 * ผ่าน `logo-deep-app.png` / `logo-deep-mark.png` / `logo-deep-wordmark*.png`
 * (`logo-deep.png` ตัวเดิมถูกลบทิ้ง 2026-08-23 เพราะไม่มีใครอ้างถึงเลยสักที่)
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
    /**
     * 🛑 จับ `logo-deep*` ไม่ใช่ชื่อไฟล์เป๊ะ — ร่างแรกผูกกับ `logo-deep-app.png` แล้วแดงทันที
     * ที่เปลี่ยนไปใช้ตัวที่ตัดขอบขาวแล้ว ทั้งที่เจตนา (ใช้โลโก้ Deep) ยังถูกทุกประการ
     * ด่านที่ผูกกับ *วิธีสะกด* พังตอน refactor แล้วคนถัดไปจะปิดมันทิ้ง
     */
    expect(code, 'ต้อง import โลโก้ Deep').toMatch(/logo-deep[\w-]*\.png/)
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

  it('[blocker] ขนาดโลโก้ auth ต้องคุมที่ CSS ห้ามใส่ utility ที่ <img>', () => {
    /**
     * 🛑 `.auth-logo img` อยู่ใน `pages/_auth.css` ซึ่ง **ไม่ได้ห่อ `@layer`** ⇒ ชนะ utility
     * ที่อยู่ใน `@layer utilities` เสมอ ไม่ว่า specificity เป็นอย่างไร
     * (`docs/conventions/unlayered-css-beats-utilities.md`)
     *
     * เคสจริง 2026-08-19: ใส่ `className="h-12"` ที่ <img> แล้วโลโก้ยังเล็ก เพราะของจริง
     * เป็น `h-10` ตามที่ CSS สั่ง — **ไม่มีอะไรฟ้องเลย** คลาสถูกทุกตัวอักษร มันแค่แพ้
     *
     * ด่านนี้กันไม่ให้ใครเผลอใส่กลับมาแล้วเข้าใจผิดว่าคุมขนาดได้จากตรงนั้น
     */
    const tsx = blankComments(readFileSync(join(ROOT, 'src/components/AuthLogo.tsx'), 'utf8'))
    const imgTag = tsx.slice(tsx.indexOf('<img'), tsx.indexOf('/>', tsx.indexOf('<img')))
    expect(imgTag, 'ขนาดต้องอยู่ที่ _auth.css ที่เดียว').not.toMatch(/\bh-\d/)

    /**
     * 🛑 ต้องตัดคอมเมนต์ก่อนสแกน — คอมเมนต์ในไฟล์นั้น *อธิบายกฎนี้* จึงมีคำว่า `@layer` อยู่
     * ร่างแรกของด่านนี้จึงแดงใส่ไฟล์ที่ทำถูกอยู่แล้ว (คลาสเดียวกับ grep gate ของ HR9
     * ที่แดงค้างจากคำเตือนของตัวเองเมื่อ 2026-08-02→03)
     */
    const css = readFileSync(join(ROOT, 'src/assets/css/pages/_auth.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    expect(css, 'CSS ต้องเป็นคนกำหนดความสูง').toMatch(/\.auth-logo img[\s\S]{0,120}@apply[^;]*h-\d/)
    expect(css, 'ไฟล์นี้ต้องไม่ถูกห่อ @layer ไม่งั้นจะแพ้ utility').not.toMatch(/@layer/)
  })

  it('[blocker] หัวหน้าแชทต้องเป็นโลโก้ Deep ที่คลิกกลับหน้าหลักได้', () => {
    /**
     * 🛑 ช่องนี้ **กลับมติมาแล้ว 2 รอบ** — อ่านก่อนแก้ ไม่งั้นจะวนอีก:
     *   2026-07-23  user สั่งตัดปุ่ม Back ออก ให้คลิกโลโก้แทน
     *   2026-08-19  เปลี่ยนเป็นปุ่มย้อนกลับ (ตอนนั้นโลโก้ยังเป็นแบรนด์ "Paces" ของธีม)
     *   2026-08-19  **กลับมาเป็นโลโก้** หลังเปลี่ยนเป็นโลโก้ Deep จริง — user สั่งเอง
     *
     * ปัญหาเดิมไม่ใช่ "โลโก้ไม่ควรเป็นทางกลับ" แต่คือ **โลโก้เป็นแบรนด์ของคนอื่น**
     * ⇒ พอเป็นแบรนด์เราแล้ว การคลิกโลโก้กลับหน้าหลักคือแพตเทิร์นที่ผู้ใช้รู้จักอยู่แล้ว
     *
     * ด่านนี้กัน 2 ทิศพร้อมกัน: ห้ามกลับไปใช้โลโก้ธีม **และ** ห้ามหลุดปลายทาง /dashboard
     */
    const rel = 'src/app/(paces)/seller/(chat)/_components/ChatHeader.tsx'
    const code = blankComments(readFileSync(join(ROOT, rel), 'utf8'))
    expect(code, 'ต้องใช้เวิร์ดมาร์ก Deep ตัวเดียวกับหน้า login').toMatch(/logo-deep-wordmark\.png/)
    expect(code, 'โลโก้ต้องคลิกกลับหน้าหลักได้').toMatch(/href="\/dashboard"/)
    for (const f of THEME_LOGOS) {
      expect(code, `หัวแชทห้ามใช้ ${f} (โลโก้ของธีม)`).not.toContain(f)
    }
  })

  it('[blocker] --logo-lg-height ต้องไม่หดกลับไปค่าของธีม', () => {
    /**
     * 22px ของธีมคาลิเบรตไว้กับโลโก้ "Paces" ที่เป็น **ตัวหนังสือล้วน** — โลโก้ Deep มีมาร์กตัว D
     * อยู่ด้วย มาร์กกินความสูงไป 84% ของกรอบ เหลือให้คำว่า "Deep" แค่ 17.4px
     *
     * 🛑 หัวหน้าเห็นบน prod แล้วทักเอง (2026-08-20): *"ทำไมมันเล็กจิ๋ว"* พร้อมวัดเทียบมาให้
     * Paces `87.33 × 22` vs Deep `74.77 × 22` แล้วสั่ง *"ขยายคำว่า Deep ให้มัน fit กับความสูง"*
     *
     * ด่านนี้กัน **การก็อป `_root.css` จากธีมมาทับ** ซึ่งจะพาค่ากลับไป 22px เงียบ ๆ — ไม่มี
     * `tsc`/build/eslint/theme-guard ตัวไหนมองเห็น เพราะ CSS ที่ได้ยัง "ถูก" ทุกตัวอักษร
     * สิ่งที่ผิดคือ *ตัวเลข* (`docs/conventions/rule-must-be-enforced-not-described.md`)
     *
     * เกณฑ์เป็น "ไม่ต่ำกว่า" ไม่ใช่ "เท่ากับ" — ปรับขึ้นได้ถ้าอยากให้ใหญ่กว่านี้ ห้ามหดลง
     */
    const css = readFileSync(join(ROOT, 'src/assets/css/config/_root.css'), 'utf8')
    const m = css.match(/--logo-lg-height:\s*(\d+)px/)
    expect(m, 'ไม่เจอตัวแปร --logo-lg-height').not.toBeNull()
    expect(Number(m![1]), 'ต่ำกว่า 28px แล้วคำว่า "Deep" จะเล็กจนหัวหน้าทักอีก').toBeGreaterThanOrEqual(28)
  })
})
