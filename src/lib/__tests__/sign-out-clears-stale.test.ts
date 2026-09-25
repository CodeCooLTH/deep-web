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
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

import { APPLE_NONCE_COOKIE } from '@/lib/apple/native-nonce'
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

  it('🛑 ต้องล้าง `deep_link_intent` — ค้างไว้ = รอบหน้าถูกตีความว่ากำลังเชื่อมบัญชี', () => {
    /* เพิ่ม 2026-09-25: mutation พิสูจน์ว่าถอดชื่อนี้ออกแล้วเทสยังเขียว — ไฟล์นิยามอธิบาย
       ความสำคัญไว้ครบ แต่ **ไม่มีเคสไหนคุมมันเลย** (ชุดข้อมูลทดสอบอ่อน ไม่ใช่กฎไม่สำคัญ) */
    expect(STALE_AUTH_COOKIES).toContain('deep_link_intent')
  })

  it('🛑 ต้องล้าง nonce ของรอบล็อกอินด้วยแผ่นของระบบ (feature 00040)', () => {
    /* ของใช้ครั้งเดียวทิ้งเหมือน pkce/state — ตัวตรวจลบให้ทุกทางออกอยู่แล้ว แต่ถ้าผู้ใช้
       กดออกจากระบบ **กลางทาง** มันจะค้างไว้ 10 นาที */
    expect(STALE_AUTH_COOKIES).toContain(APPLE_NONCE_COOKIE)
    expect(APPLE_NONCE_COOKIE, 'ชื่อคุกกี้เปลี่ยน = ตัวตรวจกับตัวล้างหลุดจากกัน').toBe(
      'deep_apple_nonce',
    )
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

/** ไล่ไฟล์ซอร์สจริงทั้งหมด (ข้ามเทส) */
function walkSrc(dir = 'src', out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue
      walkSrc(rel, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel)
  }
  return out
}

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const codeOf = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'))

describe('[blocker] ทุกจุดที่ออกจากระบบฝั่งผู้ขายต้องผ่านตัวกลาง', () => {
  /**
   * 🛑 **ไล่หาผู้เรียกเอง ไม่ฮาร์ดโค้ดรายชื่อไฟล์** (เปลี่ยน 2026-09-25)
   *
   * รายชื่อเดิมเขียนตายไว้ 6 ไฟล์ ⇒ จอ `ChooseShopClient` ที่เพิ่งได้ปุ่มออกจากระบบ
   * **ไม่เคยถูกด่านนี้ตรวจเลย** · ทางออกใหม่ที่เพิ่มทีหลังจะหลุดทุกครั้งโดยไม่มีใครรู้
   * (บทเรียนเดียวกับ `go-after-login.test.ts` ที่กวาดทั้ง `src/` ด้วยเหตุผลนี้)
   */
  const signOutCallers = walkSrc().filter(
    (f) => f !== 'src/lib/sign-out-seller.ts' && codeOf(f).includes('signOutSeller('),
  )

  it('🛑 ต้องเจอผู้เรียกจริง — เจอ 0 แปลว่าด่านนี้กำลังตรวจความว่างเปล่า', () => {
    expect(signOutCallers.length).toBeGreaterThanOrEqual(6)
  })

  it('🛑 ห้ามเรียก `signOut()` ตรง ๆ — จะได้คุกกี้ค้างเฉพาะทางนั้น', () => {
    for (const rel of signOutCallers) {
      const code = codeOf(rel)
      expect(/[^A-Za-z]signOut\(/.test(code), `${rel} ยังเรียก signOut() ตรง ๆ`).toBe(false)
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

describe('[blocker] ออกจากระบบต้องถอน push token ของเครื่องด้วย', () => {
  /**
   * ## บั๊กที่ทำให้ต้องมีด่านนี้ (พบ 2026-09-25 ตอนไล่ตรวจจอ "ยังไม่มีร้านค้าของคุณ")
   *
   * การถอน token เคยถูก **ก็อปไว้ใน 2 ไฟล์** (`SignOutCard`, `DeleteAccountCard`)
   * ⇒ ทางออกจากระบบอีก **5 ทางไม่เคยถอนเลย** รวมทั้ง **ดรอปดาวน์มุมขวาบน** กับ
   * **เมนูในแถบข้าง** ซึ่งเป็นทางที่ผู้ใช้จริงใช้บ่อยที่สุด
   *
   * ผลที่ผู้ใช้เจอ: ออกจากระบบแล้ว **เครื่องยังได้แจ้งเตือนแชทลูกค้าของบัญชีเดิมต่อไป**
   * คนถัดไปที่หยิบเครื่อง (หรือพนักงานที่ลาออก) เห็นข้อความลูกค้าที่ไม่ใช่ของตัวเองบนจอล็อก
   *
   * 🛑 ไม่มี gate ไหนจับได้เลย — tsc/build/เทสผ่านหมด เพราะโค้ดถูกทุกบรรทัด
   * สิ่งที่ผิดคือ **มันอยู่ผิดที่** (Hard Rule 16)
   */
  it('🛑 `signOutSeller` ต้องถอน token ให้ทุกทางออก', () => {
    expect(codeOf('src/lib/sign-out-seller.ts')).toMatch(/revokeDevicePushToken\(\)/)
  })

  it('🛑 ต้องถอน **ก่อน** signOut — หลังจากนั้นคุกกี้หายแล้ว จะได้ 401 แล้ว token ค้างถาวร', () => {
    const code = codeOf('src/lib/sign-out-seller.ts')
    const revokeAt = code.indexOf('revokeDevicePushToken()')
    const signOutAt = code.indexOf('signOut({')
    expect(revokeAt).toBeGreaterThan(-1)
    expect(revokeAt, 'ถอนหลัง signOut = ไม่มีโอกาสสำเร็จ').toBeLessThan(signOutAt)
  })

  it('🛑 ต้องมีนิยามเดียว — ห้ามใครก็อป `__DEEP_PUSH_TOKEN__` ไปอ่านเองอีก', () => {
    /* นี่คือรูปร่างของบั๊กเดิมเป๊ะ: โค้ดถูกทุกบรรทัด แต่มีแค่บางไฟล์ที่มี */
    const offenders = walkSrc().filter(
      (f) => f !== 'src/lib/native-bridge.ts' && codeOf(f).includes('__DEEP_PUSH_TOKEN__'),
    )
    expect(offenders, `อ่าน token เองแทนใช้ตัวกลาง: ${offenders.join(', ')}`).toEqual([])
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
