/**
 * [blocker] ออกจากระบบต้องล้างของที่ค้างให้ครบ และห้ามล้างของที่ระบบต้องใช้ (2026-09-17)
 *
 * ## ที่มา
 *
 * `signOut()` ของ next-auth **ล้างแค่คุกกี้ session ตัวเดียว** (`core/routes/signout.js`
 * → `sessionStore.clean()`) ที่เหลือค้างหมด — และเคยทำให้เกิดบั๊ก prod จริง:
 * `callback-url` ค้างเป็น `/auth/sign-in` ⇒ ล็อกอิน Apple สำเร็จแล้วถูกส่งกลับหน้าล็อกอิน
 *
 * ## 🛑 ด้านที่อันตรายกว่าคือ "ล้างเกิน"
 *
 * ล้าง `deep_shell` แล้วทุกอย่างยังทำงานปกติทุกประการ **ยกเว้นว่าปุ่มจ่ายเงินกับทางสมัคร
 * โผล่กลับมาในแอป iOS** ⇒ ไม่มีใครสังเกตจนกว่าจะถูก Apple ตีกลับ
 * ล้าง `csrf-token` = ปลุกบั๊ก "กดครั้งแรกไม่ไปไหน" ที่เพิ่งแก้ไปเมื่อ 2026-09-16
 */
import { describe, expect, it } from 'vitest'

import { NEVER_CLEAR_COOKIES, STALE_AUTH_COOKIES } from '@/lib/stale-auth-cookies'

describe('[blocker] รายชื่อคุกกี้ที่ล้างตอนออกจากระบบ', () => {
  it('🛑 ต้องล้าง `callback-url` — ตัวที่ทำให้เกิดบั๊ก 2026-09-17', () => {
    expect(STALE_AUTH_COOKIES).toContain('__Secure-next-auth.callback-url')
    expect(STALE_AUTH_COOKIES, 'dev ใช้ชื่อไม่มี __Secure- ต้องล้างด้วย').toContain(
      'next-auth.callback-url',
    )
  })

  it('ต้องล้างของใช้ครั้งเดียวทิ้งของ OAuth ครบทั้งชุด', () => {
    for (const base of ['state', 'nonce', 'pkce.code_verifier']) {
      expect(STALE_AUTH_COOKIES, `ขาด ${base}`).toContain(`__Secure-next-auth.${base}`)
      expect(STALE_AUTH_COOKIES, `ขาด ${base} (ชื่อ dev)`).toContain(`next-auth.${base}`)
    }
  })

  it('🛑 ห้ามล้าง `deep_shell` — ล้างแล้วด่าน App Store ทั้งชุดหลุดโดยไม่มีอะไรฟ้อง', () => {
    expect(STALE_AUTH_COOKIES).not.toContain('deep_shell')
  })

  it('🛑 ห้ามล้าง csrf — ปลุกบั๊ก "กดครั้งแรกไม่ไปไหน" ที่เพิ่งแก้', () => {
    for (const n of ['__Host-next-auth.csrf-token', 'next-auth.csrf-token']) {
      expect(STALE_AUTH_COOKIES).not.toContain(n)
    }
  })

  it('🛑 ห้ามล้าง session เอง — next-auth ล้างอยู่แล้ว ล้างซ้ำเสี่ยงชนจังหวะ', () => {
    for (const n of ['__Secure-next-auth.session-token', 'next-auth.session-token']) {
      expect(STALE_AUTH_COOKIES).not.toContain(n)
    }
  })

  it('🛑 สองรายการต้องไม่ทับกันเลยสักชื่อ', () => {
    const overlap = STALE_AUTH_COOKIES.filter((c) => NEVER_CLEAR_COOKIES.includes(c))
    expect(overlap, `ชื่อที่อยู่ทั้งสองฝั่ง: ${overlap.join(', ')}`).toEqual([])
  })
})

describe('[blocker] ทุกจุดที่ออกจากระบบฝั่งผู้ขายต้องผ่านตัวกลาง', () => {
  const SELLER_SIGNOUT_FILES = [
    'src/app/(paces)/seller/(dashboard)/shop/components/SignOutCard.tsx',
    'src/app/(paces)/seller/(dashboard)/account/components/DeleteAccountCard.tsx',
    'src/layouts/components/Sidenav/components/UserProfileSettings.tsx',
    'src/layouts/components/TopBar/components/UserDropdownDetailed.tsx',
    'src/app/(paces)/seller/register/RegisterClient.tsx',
    'src/app/(paces)/seller/i/[slug]/components/InviteLandingClient.tsx',
  ]

  it('🛑 ห้ามเรียก `signOut()` ตรง ๆ — จะได้คุกกี้ค้างเฉพาะทางนั้น', async () => {
    const fs = await import('fs')
    for (const rel of SELLER_SIGNOUT_FILES) {
      const code = fs
        .readFileSync(rel, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      expect(/[^A-Za-z]signOut\(/.test(code), `${rel} ยังเรียก signOut() ตรง ๆ`).toBe(false)
      expect(code, `${rel} ไม่ได้ใช้ตัวกลาง`).toContain('signOutSeller(')
    }
  })

  it('🛑 ตัวกลางต้องล้าง "ก่อน" ออกจากระบบ ไม่ใช่หลัง', async () => {
    const fs = await import('fs')
    const code = fs.readFileSync('src/lib/sign-out-seller.ts', 'utf8')
    const cleanupAt = code.indexOf("'/api/auth/cleanup'")
    const signOutAt = code.indexOf('signOut({')
    expect(cleanupAt, 'ไม่ได้เรียก cleanup เลย').toBeGreaterThan(-1)
    expect(signOutAt, 'ไม่ได้เรียก signOut เลย').toBeGreaterThan(-1)
    expect(cleanupAt, 'เรียกหลัง signOut = ไม่มีโอกาสทำงาน หน้าถูกพาออกไปแล้ว').toBeLessThan(
      signOutAt,
    )
  })

  it('🛑 ล้มก็ต้องออกจากระบบได้ — ต้องมี try/catch ครอบการล้าง', async () => {
    const fs = await import('fs')
    const code = fs.readFileSync('src/lib/sign-out-seller.ts', 'utf8')
    expect(code, 'เน็ตล่ม = กดออกจากระบบไม่ได้ ซึ่งแย่กว่าคุกกี้ค้าง').toContain('catch')
  })
})

describe('[blocker] Apple ต้องเดินผ่านหน้ารอ ไม่ชี้ตรงปลายทาง', () => {
  it('🛑 `handleApple` ต้องส่งไป /auth/callback/apple', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')

    const i = code.indexOf('const handleApple')
    expect(i, 'ไม่พบ handleApple').toBeGreaterThan(-1)
    /**
     * 🛑 ตัดถึง **ตัวจัดการถัดไป** ไม่ใช่นับตัวอักษรตายตัว (เดิม `i + 400`)
     *
     * เพิ่ม 2026-09-25 ตอนทำ Sign in with Apple แบบ native: `handleApple` ยาวขึ้นเพราะ
     * ต้องลองทาง native ก่อนแล้วค่อยถอยมาทางเว็บ ⇒ หน้าต่าง 400 ตัวอักษรตัดจบ **ก่อน**
     * ถึงบรรทัดที่ด่านนี้ต้องการ แล้วแดงทั้งที่เจตนายังถูกครบทุกข้อ
     *
     * ด่านที่ผูกกับ *ความยาวของโค้ด* จะแดงทุกครั้งที่มีคนเพิ่มเส้นทาง — ซึ่งสอนให้คนถัดไป
     * ผ่อนด่านเพื่อให้เขียว แทนที่จะอ่านว่ามันกันอะไรอยู่
     */
    const next = code.indexOf('const handleFacebook', i)
    const body = code.slice(i, next > -1 ? next : i + 2000)
    expect(
      body,
      'ชี้ตรงปลายทาง = คำขอถัดไปอาจยังไม่เห็นคุกกี้ session ที่เพิ่งตั้ง',
    ).toContain('/auth/callback/apple')
  })

  it('🛑 หน้ารอต้องถามซ้ำก่อนยอมแพ้ ไม่ใช่เตะกลับตั้งแต่ครั้งแรก', async () => {
    const fs = await import('fs')
    const code = fs.readFileSync('src/app/(paces)/seller/auth/callback/[provider]/page.tsx', 'utf8')
    expect(code).toContain('SESSION_RETRY_COUNT')
    expect(code, 'ต้องเรียก update() เพื่อถามใหม่').toMatch(/update\(\)/)
  })
})
