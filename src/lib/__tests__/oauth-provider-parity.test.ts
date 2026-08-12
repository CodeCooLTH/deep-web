import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ด่านกัน "provider หลุดจากกัน" — การรองรับ OAuth หนึ่งเจ้าต้องขยับ **4 ที่พร้อมกัน** ไม่งั้น
 * ผู้ใช้จะเจออาการที่วินิจฉัยยากมาก เพราะแต่ละที่พังคนละแบบ:
 *
 *   1. `lib/auth.ts` oauthMap (jwt)   ขาด → ล็อกอินสำเร็จแต่ไม่ผูก AuthAccount = ได้บัญชีใหม่ทุกครั้ง
 *   2. `lib/auth.ts` oauthMap (signIn) ขาด → บัญชีที่ถูกลบแล้วล็อกอินกลับเข้ามาได้ (App Store 5.1.1)
 *   3. `api/account/link/start`        ขาด → ปุ่ม "เชื่อมบัญชี" โผล่ แต่กดแล้ว 400
 *   4. `api/account/link/remove`       ขาด → เชื่อมได้แต่ยกเลิกไม่ได้ ค้างถาวร
 *
 * 🛑 ชั้นที่ 5 อยู่ **คนละรีโป** เทสนี้เอื้อมไม่ถึง: `OAUTH_HOSTS` ใน
 * `deep-seller-app/src/features/webview/SellerWebView.tsx` — โดเมนของ provider ต้องอยู่ใน
 * allowlist นั้น ไม่งั้น WebView จะเตะทั้ง flow ออกไป in-app browser (cookie jar คนละใบ)
 * แล้วผู้ใช้จบที่หน้า login โดยดูเหมือน "กดเชื่อมแล้วโดนเด้งออกจากระบบ"
 * เจอจริงกับ Apple 2026-08-12 และเคยเจอกับ fbsbx.com มาแล้ว 2026-08-01 — คลาสเดียวกันเป๊ะ
 *
 * 🛑 เคสจริง 2026-08-12: เพิ่มปุ่ม Apple ในหน้าล็อกอินแล้วแต่ลืมข้อ 3 — ผู้ใช้ที่มีบัญชีอยู่แล้ว
 * จึงผูก Apple ไม่ได้เลย เหลือทางเดียวคือกดปุ่มในหน้าล็อกอินซึ่ง **สร้างบัญชีใหม่คนละใบ**
 * แล้วไปตันที่ onboarding เพราะเบอร์โทรผูกกับบัญชีเดิมไปแล้ว (เบอร์ตั้งได้ครั้งเดียว)
 * ต้องเข้าไปลบบัญชีที่ค้างด้วยมือบน prod
 */

const ROOT = process.cwd()

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

/** provider ที่ระบบประกาศว่ารองรับ (แหล่งความจริง = ปุ่มที่ผู้ใช้เห็นในหน้าล็อกอิน) */
const SUPPORTED = ['facebook', 'line', 'apple'] as const

describe('provider ต้องรองรับครบทุกชั้น', () => {
  const auth = read('src/lib/auth.ts')
  const linkStart = read('src/app/api/account/link/start/route.ts')
  const linkRemove = read('src/app/api/account/link/remove/route.ts')
  const accountCard = read('src/app/(paces)/seller/(dashboard)/account/components/ConnectedAccountsClient.tsx')

  it.each(SUPPORTED)('[blocker] %s — อยู่ครบทั้ง 4 ชั้น', (provider) => {
    const upper = provider.toUpperCase()

    // 1+2. oauthMap ทั้งสองที่ใน auth.ts (jwt = ผูกบัญชี · signIn = กันบัญชีที่ถูกลบ)
    const oauthMapHits = auth.split(`${provider}:`).length - 1
    expect(oauthMapHits, `${provider} ต้องอยู่ใน oauthMap ทั้ง 2 ที่ของ auth.ts`).toBeGreaterThanOrEqual(2)
    expect(auth, `auth.ts ต้อง map ${provider} → ${upper}`).toContain(upper)

    // 3. เริ่มเชื่อมบัญชีได้
    //
    // 🛑 ต้องดึง "ตัวประกาศ LINKABLE_PROVIDERS" ออกมาเช็คโดยเฉพาะ ไม่ใช่ค้นทั้งไฟล์ —
    // พิสูจน์ด้วย mutation แล้วว่าการค้นทั้งไฟล์ลอดได้ เพราะคำว่า 'apple' ยังโผล่ในบรรทัดอื่น
    // (ข้อความ error และเงื่อนไข `provider === 'apple'` ของคุกกี้ cross-site)
    // ด่านที่ผ่านตลอดคือด่านที่ไม่มีอยู่จริง
    const linkable = linkStart.match(/LINKABLE_PROVIDERS\s*=\s*\[([^\]]*)\]/)?.[1] ?? ''
    expect(linkable, 'หา LINKABLE_PROVIDERS ในไฟล์ไม่เจอ').not.toBe('')
    expect(linkable, `${provider} ต้องอยู่ใน LINKABLE_PROVIDERS`).toContain(`'${provider}'`)

    // 4. ยกเลิกการเชื่อมได้ — เช็คว่า map เป็น enum ตัวใหญ่จริง ไม่ใช่แค่มีคำนั้นอยู่ในไฟล์
    expect(linkRemove, `${provider} ต้อง map → ${upper} ที่ link/remove`).toMatch(
      new RegExp(`${provider}:\\s*'${upper}'`),
    )

    /**
     * 5. มีแถวให้กดจริงในหน้า /account
     *
     * 🛑 ต้องดึง "ตัวประกาศ providers" ออกมาเช็คเฉพาะส่วน ไม่ใช่ค้นทั้งไฟล์ — ชื่อ provider
     * โผล่ในไฟล์นี้อย่างน้อย 2 ที่ที่ไม่ใช่แถวจริง (`type ProviderKey` และ `PROVIDER_LABEL`)
     * ทั้งคู่เป็นแค่ "คำประกาศ" ที่อยู่ต่อไปได้แม้แถวจะถูกลบไปแล้ว — ค้นทั้งไฟล์จะเขียวตลอด
     * ทั้งที่ผู้ใช้ไม่มีปุ่มให้กด (แบบเดียวกับ LINKABLE_PROVIDERS ด้านบนซึ่งพิสูจน์ด้วย mutation
     * มาแล้วว่าลอดได้จริง)
     *
     * เดิมเช็ค `provider="apple"` ตรง ๆ ซึ่งผูกกับ *วิธีเขียน JSX* ไม่ใช่ *สิ่งที่มีอยู่* —
     * พอแถวถูกรวบเป็นลิสต์ข้อมูลแล้ว `.map()` (2026-08-12) ด่านก็แดงทั้งที่ทุกแถวยังอยู่ครบ
     */
    const rows = accountCard.match(/const providers[\s\S]*?\n {2}\]/)?.[0] ?? ''
    expect(rows, 'หาตัวประกาศ providers ใน ConnectedAccountsClient ไม่เจอ').not.toBe('')
    expect(rows, `${provider} ต้องมีแถวใน ConnectedAccountsClient`).toContain(`key: '${provider}'`)
  })

  it('[blocker] apple ต้องอยู่ในรายการที่ signIn ตรวจบัญชีที่ถูกลบ', () => {
    // ถ้าหลุดจากรายการนี้ บัญชีที่ผู้ใช้สั่งลบจะล็อกอินกลับเข้ามาได้ผ่าน Apple
    // ซึ่งผิด App Store Guideline 5.1.1(v) ที่ฟีเจอร์ลบบัญชีเกิดมาเพื่อแก้
    expect(auth).toMatch(/\["facebook",\s*"line",\s*"instagram",\s*"apple"\]/)
  })
})

/**
 * ด่านกันบั๊กชุด "เชื่อม/ยกเลิกแล้วจอไม่ตรงกับความจริง" (user report 2026-08-12)
 *
 * ทั้งสามตัวเกิดจากรูปแบบเดียวกัน: **โค้ดที่ไล่ if/ternary ทีละ provider** ซึ่งพอเพิ่ม
 * provider ที่ 4 เข้ามาแล้วสาขาของมันถูกลืม โดยไม่มี tsc/เทสไหนฟ้อง
 *
 *   1. ยกเลิกการเชื่อม Apple → toast ขึ้นว่าสำเร็จ แต่แถวยังโชว์ "เชื่อมแล้ว"
 *      (if/else อัปเดตแค่ facebook/line/instagram)
 *   2. เชื่อม Apple สำเร็จ → toast ขึ้นว่า "เชื่อมต่อ Instagram สำเร็จ"
 *      (ternary ตกท้ายเป็น 'Instagram')
 *   3. เชื่อมสำเร็จแล้วถูกเด้งไปหน้า "การจัดส่ง" (`router.replace('/settings')` ค้างจาก
 *      ตอนการ์ดนี้ยังอยู่ที่ /settings ก่อน feature 00026)
 */
describe('ConnectedAccountsClient — จอต้องตรงกับความจริง', () => {
  const card = read('src/app/(paces)/seller/(dashboard)/account/components/ConnectedAccountsClient.tsx')

  it('[blocker] ห้ามเด้งผู้ใช้ไป /settings หลังเชื่อม/ยกเลิก', () => {
    // การ์ดนี้อยู่ที่ /account — เด้งไป /settings = ผู้ใช้ไปโผล่หน้า "การจัดส่ง" ที่ไม่เกี่ยวข้อง
    expect(card).not.toContain("router.replace('/settings')")
    expect(card).not.toContain("callbackUrl: '/settings'")
  })

  it('[blocker] สถานะการเชื่อมต้องเก็บเป็น record เดียว ไม่ใช่ตัวแปรแยกต่อ provider', () => {
    // ตัวแปรแยก = ต้องไล่เพิ่มสาขาทุกครั้งที่มี provider ใหม่ ซึ่งเป็นต้นเหตุของบั๊ก 1
    expect(card).toContain('setLinkedMap')
    expect(card).not.toMatch(/set(Fb|Line|Ig|Apple)Linked/)
  })

  it('[blocker] ป้ายชื่อ provider ต้องมาจาก PROVIDER_LABEL ไม่ใช่ ternary ซ้อน', () => {
    // ternary ที่ตกท้ายเป็นชื่อ provider ตัวใดตัวหนึ่ง = ตัวที่ 4 จะได้ชื่อผิดเสมอ (บั๊ก 2)
    expect(card).not.toMatch(/linked === 'facebook' \? 'Facebook'/)
    expect(card).toContain('PROVIDER_LABEL[linked as ProviderKey]')
  })
})

/**
 * ด่านกันอาการ "แวบ ๆ" กลับมา (user report 2026-08-12: "ทำให้เนียนสิ ไม่แวบๆ")
 *
 * ทั้งสามข้อเป็นบั๊กสายตาที่ **ไม่มี gate ไหนของโปรเจกต์จับได้เลย** — tsc/build/เทส/theme-guard
 * ผ่านหมดเพราะโค้ดถูกต้องทุกตัวอักษร สิ่งที่ผิดคือ *ตำแหน่งที่ประกาศ* / *จังหวะที่ล้างสถานะ* /
 * *ตัวที่ import มา* ซึ่งไม่มีเครื่องมือ static ตัวไหนของเรารู้ความหมาย
 */
/**
 * ตัดคอมเมนต์ทิ้งก่อนสแกน — แทนที่ด้วยช่องว่างเท่าเดิมเพื่อไม่ให้เลขบรรทัด/ย่อหน้าเพี้ยน
 *
 * 🛑 จำเป็นจริง ไม่ใช่ความละเอียดเกินเหตุ: ไฟล์ที่ **ทำถูกตามกฎ** คือไฟล์ที่มักเขียนคอมเมนต์
 * อธิบายกฎนั้นไว้ด้วย ("ห้ามมี `finally { setRedirecting(null) }`") ⇒ ด่านที่สแกนทั้งไฟล์จะแดง
 * ตลอดกาลเพราะเจอคำเตือนของตัวเอง แล้วถูกอ่านว่าเป็นหนี้ทั้งที่ไม่มีการละเมิดเลย
 * (เกิดกับ grep gate ของ Hard Rule 9 มาแล้ว 2026-08-02 → 08-03 — และเกิดซ้ำกับด่านนี้ตอนเขียน)
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

describe('ConnectedAccountsClient — ต้องไม่กระพริบ', () => {
  const raw = read('src/app/(paces)/seller/(dashboard)/account/components/ConnectedAccountsClient.tsx')
  const card = stripComments(raw)

  it('[blocker] component ย่อยต้องอยู่ module scope ไม่ใช่ในตัว render', () => {
    /**
     * ฟังก์ชัน component ที่ประกาศในตัว render = **ชนิดใหม่ทุก re-render** ⇒ React ถอด DOM
     * ทิ้งแล้วสร้างใหม่ทั้งแถวทุกครั้งที่ setState (ไม่ใช่ patch) = ไอคอนโหลดใหม่ · transition
     * เริ่มนับหนึ่ง · โฟกัสหลุดจากปุ่มที่เพิ่งกด
     *
     * เช็คด้วย "ย่อหน้า" เพราะนั่นคือสิ่งที่ต่างกันจริง: module scope = คอลัมน์ 0
     */
    for (const name of ['AccountRow', 'StatusBadge', 'ActionButton', 'ProviderRow', 'RedirectOverlay']) {
      expect(card, `${name} ต้องประกาศที่ module scope`).toMatch(new RegExp(`^function ${name}\\(`, 'm'))
      // 🛑 `[ \t]+` ไม่ใช่ `\s+` — `\s` กิน `\n` ได้ ทำให้ `^\s+function X(` ไปแมตช์
      //    "บรรทัดว่าง + บรรทัดที่ไม่มีย่อหน้า" = แดงทั้งที่ประกาศถูกที่แล้ว (false positive จริง)
      expect(card, `${name} ห้ามประกาศซ้อนในตัว render (มีย่อหน้านำหน้า)`).not.toMatch(
        new RegExp(`^[ \\t]+function ${name}\\(`, 'm'),
      )
    }
  })

  it('[blocker] ห้ามล้าง redirecting ใน finally หลังเรียก signIn', () => {
    /**
     * `signIn()` ตั้ง `window.location.href` แล้ว resolve promise ทันทีโดยที่เบราว์เซอร์ยังไม่ไป
     * ไหน (next-auth/react/index.js:263) — `finally` จึงถอดจอทับออก **ก่อน** หน้าจะเปลี่ยนจริง
     * ผู้ใช้เห็นจอทับวาบเดียวแล้วกลับมาเป็นหน้าเดิมค้าง = อาการที่ฟีเจอร์นี้เกิดมาแก้พอดี
     */
    expect(card, 'setRedirecting(null) ห้ามอยู่ใน finally').not.toMatch(
      /finally\s*\{[^}]*setRedirecting\(null\)/,
    )
    // ต้องยังมีทางคืนจอเมื่อ "ยังไม่ได้ไปไหน" จริง ๆ (link/start ล้ม) ไม่งั้นผู้ใช้ติดจอทับถาวร
    expect(card, 'ต้องคืนจอเมื่อ link/start ล้ม').toContain('setRedirecting(null)')
  })

  it('[blocker] ไอคอนต้อง import ผ่าน wrapper ไม่ใช่ @iconify/react ดิบ', () => {
    /**
     * ชื่อไม่มี namespace (`loader-2`, `check`, `key`) เป็นค่า default ของโปรเจกต์ = tabler
     * และ wrapper คือตัวเดียวที่เติม `tabler:` ให้ — ส่งเข้า `@iconify/react` ตรง ๆ จะได้ชื่อ
     * invalid แล้ว **ไอคอนไม่ขึ้นโดยไม่มี error สักตัว** เกิดจริง 2026-08-12: สปินเนอร์ของ
     * จอทับเป็นกล่องว่าง = จอโหลดที่ไม่มีอะไรหมุน
     */
    expect(card).toContain("import Icon from '@/components/wrappers/Icon'")
    expect(card, 'ห้าม import Icon ดิบจาก @iconify/react').not.toMatch(
      /import\s*\{[^}]*\bIcon\b[^}]*\}\s*from\s*'@iconify\/react'/,
    )
  })
})
