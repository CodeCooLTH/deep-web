/**
 * [blocker] OAuth ผ่าน Custom Tab ของแอปผู้ขาย Android — กฎล้วนใน lib/app-oauth.ts
 * สเปก docs/superpowers/specs/2026-10-01-android-oauth-custom-tabs-design.md
 */
import { describe, expect, it } from 'vitest'

import {
  buildAppOAuthStartPath,
  buildAppReturnUrl,
  encodeAppOAuthGo,
  isAppOAuthInFlight,
  isValidNonce,
  parseAppOAuthGo,
  sanitizeInternalPath,
} from '@/lib/app-oauth'

describe('[blocker] parseAppOAuthGo — allow-list เท่านั้น (แท็บถือ session ของผู้ใช้)', () => {
  it('ทางเข้าที่อนุญาต', () => {
    expect(parseAppOAuthGo('signin:facebook:/dashboard')).toEqual({ kind: 'signin', provider: 'facebook', callbackUrl: '/dashboard' })
    expect(parseAppOAuthGo('signin:line:/auth/callback/line?next=%2Fdashboard')).toEqual({
      kind: 'signin',
      provider: 'line',
      callbackUrl: '/auth/callback/line?next=%2Fdashboard',
    })
    expect(parseAppOAuthGo('link:apple')).toEqual({ kind: 'link', provider: 'apple' })
    expect(parseAppOAuthGo('connect:/api/channels/facebook/connect')).toEqual({
      kind: 'connect',
      path: '/api/channels/facebook/connect',
    })
  })

  it('🛑 ห้าม URL อิสระ / provider ที่ไม่รู้จัก / path ที่ไม่อยู่ในรายการ', () => {
    for (const bad of [
      'connect:https://evil.example',
      'connect:/api/account/delete',
      'connect://evil.example',
      'link:google',
      'signin:credentials:/dashboard',
      'signin:mobile-ticket:/dashboard',
      'goto:/dashboard',
      '',
      null,
    ]) {
      expect(parseAppOAuthGo(bad), String(bad)).toBeNull()
    }
  })

  it('callbackUrl นอกเว็บ ถูกแทนด้วย /dashboard ไม่ใช่พาไปที่นั่น', () => {
    expect(parseAppOAuthGo('signin:facebook://evil.example')).toEqual({ kind: 'signin', provider: 'facebook', callbackUrl: '/dashboard' })
    expect(parseAppOAuthGo('signin:facebook:https://evil.example')).toEqual({ kind: 'signin', provider: 'facebook', callbackUrl: '/dashboard' })
  })

  it('encode → parse ได้ค่าเดิม (ผ่าน URL จริง)', () => {
    const go = { kind: 'signin' as const, provider: 'instagram' as const, callbackUrl: '/auth/callback/instagram?next=%2Fi%2Fabc' }
    const path = buildAppOAuthStartPath(go, 'n'.repeat(43), 'tkt')
    const u = new URL(path, 'https://seller.deepthailand.app')
    expect(u.pathname).toBe('/auth/app-oauth')
    expect(parseAppOAuthGo(u.searchParams.get('go'))).toEqual(go)
    expect(u.searchParams.get('t')).toBe('tkt')
    expect(encodeAppOAuthGo({ kind: 'link', provider: 'line' })).toBe('link:line')
  })
})

describe('[blocker] isAppOAuthInFlight — หน้ากลางสายห้ามส่งกลับแอป', () => {
  it('หน้าเริ่ม · หน้ารอ session · หน้าเลือกเพจ (token อยู่ในคุกกี้ของแท็บ)', () => {
    expect(isAppOAuthInFlight('/auth/app-oauth')).toBe(true)
    expect(isAppOAuthInFlight('/auth/callback/line')).toBe(true)
    expect(isAppOAuthInFlight('/settings/channels/select')).toBe(true)
  })
  it('หน้าปลายทางจริง → ส่งกลับได้', () => {
    for (const p of ['/dashboard', '/account', '/settings/channels', '/register', '/onboarding', '/auth/sign-in', '/i/abc']) {
      expect(isAppOAuthInFlight(p), p).toBe(false)
    }
  })
})

describe('[blocker] buildAppReturnUrl / sanitizeInternalPath', () => {
  it('ขากลับ = deepseller://oauth · ไม่มีตั๋วก็ยังกลับ', () => {
    expect(buildAppReturnUrl('abc', '/account?linked=line')).toBe('deepseller://oauth?t=abc&next=%2Faccount%3Flinked%3Dline')
    expect(buildAppReturnUrl(null, '/auth/sign-in?error=x')).toBe('deepseller://oauth?next=%2Fauth%2Fsign-in%3Ferror%3Dx')
  })
  it('next นอกเว็บ → /dashboard', () => {
    expect(buildAppReturnUrl(null, '//evil.example')).toBe('deepseller://oauth?next=%2Fdashboard')
    expect(sanitizeInternalPath('/\\evil')).toBeNull()
    expect(sanitizeInternalPath('/a\nb')).toBeNull()
    expect(sanitizeInternalPath('https://x')).toBeNull()
  })
  it('nonce ต้องยาวพอ — ค่าสั้น/ว่างทำให้การผูกตั๋วไม่มีความหมาย', () => {
    expect(isValidNonce('a'.repeat(43))).toBe(true)
    expect(isValidNonce('short')).toBe(false)
    expect(isValidNonce('')).toBe(false)
    expect(isValidNonce(null)).toBe(false)
    expect(isValidNonce('a'.repeat(40) + '%2F')).toBe(false)
  })
})
