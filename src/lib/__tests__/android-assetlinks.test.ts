/**
 * [blocker] `public/.well-known/assetlinks.json` — Android App Links ของแอปผู้ขาย
 *
 * ทำให้ลิงก์ `https://seller.deepthailand.app/{inbox,orders,i,products,queues}/…` กดแล้ว **เปิดเข้าแอป**
 * แทนเบราว์เซอร์ (path ที่ครอบอยู่ที่ `intentFilters` ใน deep-seller-app `app.config.ts` — แคบโดยตั้งใจ
 * ห้ามครอบ `/api/auth/callback` ดูสเปก `docs/superpowers/specs/2026-10-01-android-oauth-custom-tabs-design.md`)
 *
 * Android ตรวจไฟล์นี้ **ตอนติดตั้งแอป** (`autoVerify: true`) — ลายนิ้วมือไม่ตรงกับใบรับรองที่เซ็นแอป
 * = ไม่ผ่านเงียบ ๆ ลิงก์ไปเปิดในเบราว์เซอร์ ไม่มี error ให้ใครเห็น ⇒ เทสนี้กันรูปแบบพัง
 *
 * 🛑 ลายนิ้วมือต้องมี **ทุกใบรับรองที่เซ็นแอปที่ผู้ใช้ถืออยู่**:
 *   1. upload key ของ EAS (`npx eas-cli credentials -p android` → SHA256 Fingerprint) — เซ็น apk ทดสอบ
 *      ที่แจกด้วยลิงก์ (2026-10-06: 71:D7:6B:AC:…:CB:56)
 *   2. **App signing key ของ Google Play** (Play Console → Setup → App signing) — Play เซ็นแอปใหม่
 *      ด้วย key ของ Google ก่อนส่งถึงผู้ใช้ ⇒ แอปจาก Play Store จะไม่ผ่านถ้าขาดตัวนี้
 *      (2026-10-11 หลังอัปโหลด build แรก 5 (1.0.2) เข้า Internal testing: F5:43:49:26:…:F5:80)
 *      — อยู่ต่อท้ายลิสต์ ห้ามแทนที่ตัวแรก
 *
 * ทดสอบบนเครื่องหลัง deploy: `adb shell pm verify-app-links --re-verify com.deepthailand.seller`
 * แล้ว `adb shell pm get-app-links com.deepthailand.seller` ต้องได้ `seller.deepthailand.app: verified`
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
/** ต้องตรงกับ `android.package` ใน deep-seller-app `app.config.ts` (สัญญาข้ามรีโป) */
const SELLER_PACKAGE = 'com.deepthailand.seller'
/** upload key ของ EAS ที่เซ็น apk ทดสอบ — ถ้า keystore บน EAS เปลี่ยน ต้องแก้ทั้งที่นี่และในไฟล์ */
const EAS_UPLOAD_KEY_SHA256 =
  '71:D7:6B:AC:B6:A9:B9:FB:4E:4D:89:81:F6:61:8C:19:71:FF:98:14:09:91:23:25:F6:39:AB:3E:9D:42:CB:56'

/** App signing key ของ Google Play (Play Console → ได้รับการปกป้องด้วย Google Play → การลงนามแอป) */
const PLAY_APP_SIGNING_SHA256 =
  'F5:43:49:26:05:47:77:D0:8F:37:B7:DB:F7:AA:91:5D:8E:86:01:49:E4:E1:A9:A6:B2:25:17:95:2F:05:F5:80'

type Statement = {
  relation: string[]
  target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] }
}

const statements = JSON.parse(readFileSync(join(ROOT, 'public/.well-known/assetlinks.json'), 'utf8')) as Statement[]
const seller = statements.find((s) => s.target?.package_name === SELLER_PACKAGE)

describe('[blocker] assetlinks.json — Android App Links ของแอปผู้ขาย', () => {
  it('มี statement ของแอปผู้ขาย ด้วย relation ที่ Android ใช้ตรวจ App Links', () => {
    expect(Array.isArray(statements)).toBe(true)
    expect(seller, `ไม่มี statement ของ ${SELLER_PACKAGE}`).toBeDefined()
    expect(seller!.target.namespace).toBe('android_app')
    expect(seller!.relation).toContain('delegate_permission/common.handle_all_urls')
  })

  it('ลายนิ้วมือทุกตัวเป็น SHA-256 รูปแบบที่ Android รับ (32 ไบต์ hex ตัวใหญ่ คั่น :)', () => {
    const fps = seller!.target.sha256_cert_fingerprints
    expect(fps.length).toBeGreaterThan(0)
    for (const fp of fps) expect(fp, fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    expect(new Set(fps).size, 'ลายนิ้วมือซ้ำ').toBe(fps.length)
  })

  it('🛑 ยังมี upload key ของ EAS — ถอดออก = apk ทดสอบที่แจกไปแล้วเปิดลิงก์เข้าแอปไม่ได้', () => {
    expect(seller!.target.sha256_cert_fingerprints).toContain(EAS_UPLOAD_KEY_SHA256)
  })

  it('🛑 มี App signing key ของ Google Play — ขาด = แอปที่ติดตั้งจาก Play เปิดลิงก์เข้าแอปไม่ได้ (เงียบ)', () => {
    expect(seller!.target.sha256_cert_fingerprints).toContain(PLAY_APP_SIGNING_SHA256)
  })

  it('proxy ปล่อย /.well-known/* ผ่านบน subdomain (ไม่งั้น 404 เฉพาะ seller.*)', () => {
    expect(readFileSync(join(ROOT, 'src/proxy.ts'), 'utf8')).toMatch(/pathname\.startsWith\('\/\.well-known\/'\)/)
  })
})
