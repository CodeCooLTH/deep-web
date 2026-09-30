/**
 * [blocker] `apple-app-site-association` ต้องเสิร์ฟจาก root ได้จริง — รวมบน subdomain ผู้ขาย
 *
 * ## ที่มา (2026-09-30)
 *
 * หัวหน้าขอให้ *"สแกน (Face ID) เติมรหัสให้ ไม่ต้องกรอกใหม่"* — iOS ทำได้ผ่าน Password AutoFill
 * แต่ต้องมีไฟล์นี้ตอบรับที่ root ของโดเมน · ก่อนหน้านี้ **404 มาตลอด** ⇒ `associatedDomains`
 * ที่แอปประกาศไว้ตั้งแต่วันแรก **ไม่เคยทำงานเลยสักครั้ง**
 *
 * ## 🛑 กับดักที่ทำให้ของนี้พังเงียบ ๆ ได้ — และรีโปนี้โดนมาแล้ว 2 ครั้ง
 *
 * `src/proxy.ts` rewrite **ทุก path** บน subdomain ผู้ขายเป็น `/seller/...`
 * ตัวยกเว้นของ static asset จับจาก **นามสกุลไฟล์** แต่ไฟล์นี้ **ห้ามมีนามสกุล**
 * (Apple กำหนดชื่อตายตัว) ⇒ ไม่มีทางแมตช์ regex นั้น ⇒ กลายเป็น
 * `/seller/.well-known/...` = **404 เฉพาะบน subdomain** ส่วนโดเมนหลักปกติ
 * ⇒ หลุด review ได้ง่ายมาก เพราะทดสอบผิดโดเมนก็เห็นว่าผ่าน
 *
 * เคสเดียวกันเป๊ะที่เคยเกิด: เสียงแจ้งเตือน `.m4a` (2026-07-24) และ `.webmanifest`
 * ของ PWA (2026-08-05) — **user เป็นคนเจอทั้งสองครั้ง**
 * (`docs/conventions/root-served-assets-and-proxy.md`)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const AASA = 'public/.well-known/apple-app-site-association'

describe('[blocker] ไฟล์ AASA', () => {
  it('🛑 ต้องเป็น JSON ที่ parse ได้ และมีส่วน webcredentials', () => {
    const j = JSON.parse(read(AASA)) as { webcredentials?: { apps?: string[] } }
    const apps = j.webcredentials?.apps ?? []
    expect(apps.length, 'ไม่มี webcredentials = Face ID เติมรหัสไม่ได้').toBeGreaterThan(0)
  })

  it('🛑 appID ต้องเป็นรูป `<TeamID>.<bundle id>` ของแอปผู้ขาย', () => {
    const j = JSON.parse(read(AASA)) as { webcredentials?: { apps?: string[] } }
    for (const a of j.webcredentials?.apps ?? []) {
      expect(a, `รูปแบบผิด: ${a}`).toMatch(/^[A-Z0-9]{10}\.com\.deepthailand\.seller$/)
    }
  })

  it('🛑 ชื่อไฟล์ห้ามมีนามสกุล — Apple กำหนดตายตัว', () => {
    /* ใส่ `.json` ต่อท้าย = Apple หาไม่เจอ และจะไม่มีอะไรฟ้องเลยนอกจากฟีเจอร์ไม่ทำงาน */
    expect(() => read(`${AASA}.json`)).toThrow()
  })
})

describe('[blocker] proxy ต้องปล่อยผ่าน ไม่ rewrite ไป /seller/...', () => {
  const proxy = code('src/proxy.ts')

  it('🛑 ต้องยกเว้นด้วย **path** ไม่ใช่นามสกุล', () => {
    expect(
      proxy,
      'ไม่มีข้อยกเว้น /.well-known/ ⇒ 404 เฉพาะบน subdomain ผู้ขาย (บั๊กคลาส .m4a / .webmanifest)',
    ).toMatch(/startsWith\('\/\.well-known\//)
  })

  it('🛑 ข้อยกเว้นต้องมาก่อน rewrite ของ subdomain ผู้ขาย', () => {
    const exempt = proxy.indexOf("/.well-known/")
    const rewrite = proxy.indexOf('`/seller${pathname}`')
    expect(exempt, 'หาข้อยกเว้นไม่เจอ').toBeGreaterThan(-1)
    expect(rewrite, 'หา rewrite ไม่เจอ').toBeGreaterThan(-1)
    expect(exempt, 'ข้อยกเว้นอยู่หลัง rewrite = ไม่มีผล').toBeLessThan(rewrite)
  })
})

describe('[blocker] ต้องเสิร์ฟเป็น application/json', () => {
  it('🛑 ไฟล์ไม่มีนามสกุล ⇒ Next เดา content-type ไม่ได้ ต้องตั้งเองใน next.config', () => {
    /* ปล่อยเป็น application/octet-stream = เครื่องมือตรวจของ Apple ไม่รับ */
    const cfg = code('next.config.ts')
    expect(cfg).toMatch(/source:\s*'\/\.well-known\/apple-app-site-association'/)
    expect(cfg).toMatch(/'content-type'[\s\S]{0,60}application\/json/)
  })
})
