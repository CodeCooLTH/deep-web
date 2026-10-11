import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  IOS_SIGNUP_MIN_APP_VERSION,
  isAppVersionAtLeast,
  isSignUpRestricted,
  parseAppVersion,
  resolveAppShell,
  shouldBlockAppRegistration,
  shouldBlockOAuthSignup,
} from '@/lib/app-shell'

/**
 * [blocker] เปิดการสมัครในแอป iOS **ตั้งแต่ 1.0.3** (2026-10-11 · user สั่ง)
 *
 * แอปเป็น WebView ⇒ เปิดที่เว็บ = แอปทุกรุ่นบนเครื่องผู้ใช้ได้ทันที รวม 1.0.2 ที่ Apple อนุมัติไปแล้ว
 * *โดยไม่มี* การสมัคร ⇒ ต้องกั้นตามรุ่น · รุ่นเก่า/ไม่รู้รุ่น = ห้ามสมัครเหมือนเดิมทุกประการ
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const ANDROID = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36'
const ua = (base: string, v: string) => `${base} DeepSellerApp/${v}`

describe('parseAppVersion', () => {
  it('อ่านรุ่นจาก marker ใน User-Agent', () => {
    expect(parseAppVersion(ua(IOS, '1.0.3'))).toBe('1.0.3')
    expect(parseAppVersion(ua(IOS, '1.0'))).toBe('1.0')
    expect(parseAppVersion(`${ua(IOS, '2.10.1')} Extra/9`)).toBe('2.10.1')
  })
  it('ไม่มี marker / รูปแบบผิด → null', () => {
    expect(parseAppVersion(IOS)).toBeNull()
    expect(parseAppVersion(`${IOS} DeepSellerApp/`)).toBeNull()
    expect(parseAppVersion(`${IOS} DeepSellerApp/abc`)).toBeNull()
    expect(parseAppVersion(`${IOS} DeepSellerApp/1.0.3.4`)).toBeNull()
    expect(parseAppVersion(`${IOS} deepsellerapp/1.0.3`)).toBeNull()
  })
})

describe('isAppVersionAtLeast — เทียบเป็นตัวเลข ไม่ใช่ตัวอักษร', () => {
  it('กรณีหลัก', () => {
    expect(isAppVersionAtLeast('1.0.3', '1.0.3')).toBe(true)
    expect(isAppVersionAtLeast('1.0.10', '1.0.3')).toBe(true)
    expect(isAppVersionAtLeast('1.1', '1.0.3')).toBe(true)
    expect(isAppVersionAtLeast('2', '1.0.3')).toBe(true)
    expect(isAppVersionAtLeast('1.0.2', '1.0.3')).toBe(false)
    expect(isAppVersionAtLeast('1.0', '1.0.3')).toBe(false)
    expect(isAppVersionAtLeast(null, '1.0.3')).toBe(false)
    expect(isAppVersionAtLeast('', '1.0.3')).toBe(false)
  })
})

describe('[blocker] ใครสมัครได้', () => {
  it('ค่าตั้งต้น = 1.0.3 (รุ่นที่ยื่นรีวิวพร้อมการสมัคร)', () => {
    expect(IOS_SIGNUP_MIN_APP_VERSION).toBe('1.0.3')
  })

  it('🛑 แอป iOS บนสโตร์ (ส่ง DeepSellerApp/1.0) และแอปที่ไม่รู้รุ่น → ยังห้าม', () => {
    for (const v of ['1.0', '1.0.2']) {
      const u = ua(IOS, v)
      expect(isSignUpRestricted(resolveAppShell('app', u), parseAppVersion(u)), v).toBe(true)
    }
    /* build เก่าที่มีแต่คุกกี้ ไม่มี marker */
    expect(isSignUpRestricted(resolveAppShell('app', IOS), parseAppVersion(IOS))).toBe(true)
  })

  it('แอป iOS ตั้งแต่ 1.0.3 → สมัครได้', () => {
    for (const v of ['1.0.3', '1.0.4', '1.1', '2.0.0']) {
      const u = ua(IOS, v)
      expect(isSignUpRestricted(resolveAppShell(undefined, u), parseAppVersion(u)), v).toBe(false)
    }
  })

  it('เว็บ / Android ไม่ขึ้นกับรุ่น (สมัครได้เหมือนเดิม)', () => {
    expect(isSignUpRestricted('web', null)).toBe(false)
    expect(isSignUpRestricted(resolveAppShell('app', ua(ANDROID, '1.0')), '1.0')).toBe(false)
  })

  it('ด่าน OAuth + ด่านลงทะเบียนใช้เกณฑ์เดียวกัน', () => {
    const newIos = resolveAppShell('app', ua(IOS, '1.0.3'))
    expect(shouldBlockOAuthSignup(newIos, false, null, '1.0.3')).toBe(false)
    expect(shouldBlockOAuthSignup(newIos, false, null, '1.0')).toBe(true)
    expect(shouldBlockAppRegistration(newIos, { needsRegistration: true }, '1.0.3')).toBe(false)
    expect(shouldBlockAppRegistration(newIos, { needsOnboarding: true }, '1.0.3')).toBe(false)
    expect(shouldBlockAppRegistration(newIos, { needsRegistration: true }, null)).toBe(true)
  })
})

describe('[blocker] ทุกจุดส่งรุ่นแอปเข้าเกณฑ์ — ลืมที่เดียว = ประตูนั้นปิดหรือเปิดผิดรุ่น', () => {
  it('server helper · proxy · signIn callback', () => {
    expect(code('src/lib/app-shell-server.ts')).toMatch(
      /isSignUpRestricted\(await getAppShell\(\), await getAppVersion\(\)\)/,
    )
    expect(code('src/proxy.ts')).toMatch(/parseAppVersion\(request\.headers\.get\('user-agent'\) \?\? ''\)/)
    expect(code('src/lib/auth.ts')).toMatch(/await currentAppVersion\(\),\s*\)/)
  })
})

describe('[blocker] Apple ในแอป: สร้างบัญชีเฉพาะรุ่นที่สมัครได้ · พร้อมชื่อจาก Apple', () => {
  const route = code('src/app/api/login/apple-native/route.ts')

  it('บัญชีถูกลบ → NO_ACCOUNT เสมอ (5.1.1(v)) ก่อนเรื่องสมัคร', () => {
    const del = route.indexOf('isDeletedUser(account.user)')
    const create = route.indexOf('upsertAppleNativeUser(')
    expect(del).toBeGreaterThan(-1)
    expect(create).toBeGreaterThan(del)
  })

  it('🛑 ตัดสินด้วยเกณฑ์เดียวกัน (shell + รุ่นจาก UA) ก่อนสร้าง', () => {
    expect(route).toMatch(
      /if \(isSignUpRestricted\(shell, parseAppVersion\(userAgent\)\)\) \{\s*return replyClearingAppleNonce\(\{ ok: false, reason: 'NO_ACCOUNT' \}\)/,
    )
    expect(route.indexOf('isSignUpRestricted(shell')).toBeLessThan(route.indexOf('upsertAppleNativeUser('))
  })

  it('🛑 ชื่อจาก Apple ถูกส่งไปสร้างบัญชี · อีเมลจากโทเคนที่ตรวจแล้ว (ไม่ใช่จากหน้าเว็บ)', () => {
    expect(route).toMatch(/verifiedEmail: verified\.claims\.email \?\? null/)
    expect(route).toMatch(/fullName: v\.optional\(/)
    expect(route).toMatch(/\bname,\s*\}\)/)
    const client = code('src/lib/apple-native-signin.ts')
    expect(client).toMatch(/JSON\.stringify\(fullName \? \{ identityToken, fullName \} : \{ identityToken \}\)/)
  })

  it('🛑 ใช้ตัวสร้างบัญชีตัวเดียวกับทางเว็บ (HR16)', () => {
    const auth = code('src/lib/auth.ts')
    const fn = auth.slice(auth.indexOf('export async function upsertAppleNativeUser'))
    expect(fn).toMatch(/return upsertOAuthUser\(account, user, "APPLE", "apple", trustEmail\)/)
    expect(fn).toMatch(/!isApplePrivateRelayEmail\(/)
  })
})
