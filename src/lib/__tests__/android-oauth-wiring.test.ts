/**
 * [blocker] OAuth ในแอปผู้ขาย Android ต้องออกไป Custom Tab ทุกทางเข้า
 *
 * Facebook ปิดล็อกอินใน Android WebView ⇒ ทางเข้าไหนลืมส่งให้แท็บ = ปุ่มนั้นใช้ไม่ได้บน Android
 * โดยไม่มีอะไรฟ้อง (iOS ยังใช้ได้ปกติ — จึงหลุดการทดสอบบน iPhone เสมอ)
 * สเปก docs/superpowers/specs/2026-10-01-android-oauth-custom-tabs-design.md
 *
 * สแกนซอร์สทั้ง `src/app/(paces)/seller` ไม่ใช่รายชื่อไฟล์ — ตัวอันตรายคือทางเข้าใหม่ที่ยังไม่มีใครเขียน
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(rel, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel)
  }
  return out
}

/** signIn ที่ไปหาผู้ให้บริการภายนอก (ไม่ใช่ credentials/mobile-ticket ซึ่งทำงานใน WebView ได้) */
const OAUTH_SIGNIN = /signIn\(\s*(?:'(?:facebook|line|instagram|apple)'|provider\b)/g

/** หน้าที่รันในแท็บเอง — เป็นปลายทางของ startAppOAuth ไม่ใช่ทางเข้า */
const TAB_SIDE = new Set(['src/app/(paces)/seller/auth/app-oauth/page.tsx'])

describe('[blocker] ทุกทางเข้า OAuth ในโซนผู้ขายส่งให้ Custom Tab ก่อน', () => {
  it('signIn(provider) ทุกจุดมี startAppOAuth นำหน้าในฟังก์ชันเดียวกัน', () => {
    const offenders: string[] = []
    let calls = 0
    for (const file of walk('src/app/(paces)/seller')) {
      if (TAB_SIDE.has(file)) continue
      const src = read(file)
      for (const m of src.matchAll(OAUTH_SIGNIN)) {
        calls += 1
        /* ดูเฉพาะตั้งแต่จุดเริ่มฟังก์ชันที่ครอบ signIn นี้ — มองย้อนเป็นระยะคงที่จะไปเจอ startAppOAuth
           ของฟังก์ชันข้างบน (เคยเขียวหลอกแบบนั้นจริง: handleApple อยู่เหนือ goToProvider) */
        const before = src.slice(0, m.index!)
        const starts = [...before.matchAll(/const \w+ = (?:useCallback\()?async\b|async function \w+/g)]
        const fnStart = starts.length ? starts[starts.length - 1].index! : 0
        if (!before.slice(fnStart).includes('startAppOAuth(')) offenders.push(`${file}@${m.index}`)
      }
    }
    expect(calls, 'ด่านต้องเจอทางเข้าจริง — 0 = regex พัง ไม่ใช่ไม่มีทางเข้า').toBeGreaterThanOrEqual(5)
    expect(offenders, `signIn ที่ไม่ส่งให้แท็บก่อน:\n${offenders.join('\n')}`).toEqual([])
  })

  it('ลิงก์เชื่อมเพจถูกดักที่ AppOAuthBridge ซึ่งแขวนที่ layout ชั้นนอกของผู้ขาย', () => {
    expect(read('src/app/(paces)/seller/layout.tsx')).toMatch(/<AppOAuthBridge \/>/)
    const bridge = read('src/components/paces/AppOAuthBridge.tsx')
    expect(bridge).toMatch(/APP_OAUTH_CONNECT_PATHS\.find/)
    expect(bridge).toMatch(/startAppOAuth\(\{ kind: 'connect'/)
    expect(bridge).toMatch(/addEventListener\('click', onClick, true\)/)
  })

  it('ตัวส่งกลับแอปไม่ทำงานใน WebView เอง และข้ามหน้ากลางสาย', () => {
    const bridge = read('src/components/paces/AppOAuthBridge.tsx')
    const i = bridge.indexOf('navigator.userAgent.includes(APP_UA_MARKER)')
    const j = bridge.indexOf('isAppOAuthInFlight(pathname)')
    const go = bridge.indexOf('window.location.replace(buildAppReturnUrl')
    expect(i).toBeGreaterThan(-1)
    expect(j).toBeGreaterThan(-1)
    expect(go).toBeGreaterThan(Math.max(i, j))
  })
})

describe('[blocker] ตั๋วขากลับผูก nonce ตลอดสาย', () => {
  it('เผาตั๋ว: เช็ค nonce ก่อน updateMany (คนดักได้แต่ตั๋วเผาทิ้งไม่ได้)', () => {
    const src = read('src/lib/mobile-ticket.ts')
    const burn = src.indexOf('export async function burnMobileTicket')
    const check = src.indexOf('if (!nonceMatches(payload, nonce)) return null', burn)
    const write = src.indexOf('prisma.mobileAuthTicket.updateMany', burn)
    expect(check).toBeGreaterThan(burn)
    expect(check).toBeLessThan(write)
  })

  it('provider mobile-ticket ส่ง nonce ต่อให้ตัวเผา', () => {
    expect(read('src/lib/auth.ts')).toMatch(/burnMobileTicket\(credentials\.ticket, "enter", credentials\.nonce \|\| null\)/)
  })

  it('ขากลับขอตั๋วพร้อม nonce · หน้าแลกส่ง nonce จาก localStorage', () => {
    expect(read('src/components/paces/AppOAuthBridge.tsx')).toMatch(/body: JSON\.stringify\(\{ nonce \}\)/)
    expect(read('src/app/(paces)/seller/auth/app-enter/page.tsx')).toMatch(/signIn\('mobile-ticket', \{ ticket, nonce: nonce \?\? ''/)
  })

  it('🛑 endpoint ออกตั๋วยืนยันด้วย cookie ⇒ ต้องอยู่ใต้ /api/seller (ได้ Origin-check) ไม่ใช่ /api/app', () => {
    const src = read('src/app/api/seller/app-ticket/route.ts')
    expect(src).toMatch(/getServerSession\(authOptions\)/)
    /* nonce รูปไม่ผ่านต้องปฏิเสธ ห้ามออกตั๋วที่ไม่ผูกแทน */
    expect(src).toMatch(/nonce !== undefined && !isValidNonce\(nonce\)/)
  })
})
