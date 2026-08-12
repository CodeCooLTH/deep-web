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

    // 5. มีแถวให้กดจริงในหน้า /account
    expect(accountCard, `${provider} ต้องมีแถวใน ConnectedAccountsClient`).toContain(`provider="${provider}"`)
  })

  it('[blocker] apple ต้องอยู่ในรายการที่ signIn ตรวจบัญชีที่ถูกลบ', () => {
    // ถ้าหลุดจากรายการนี้ บัญชีที่ผู้ใช้สั่งลบจะล็อกอินกลับเข้ามาได้ผ่าน Apple
    // ซึ่งผิด App Store Guideline 5.1.1(v) ที่ฟีเจอร์ลบบัญชีเกิดมาเพื่อแก้
    expect(auth).toMatch(/\["facebook",\s*"line",\s*"instagram",\s*"apple"\]/)
  })
})
