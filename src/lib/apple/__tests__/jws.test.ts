import { readFileSync, readdirSync, statSync } from 'node:fs'
import { X509Certificate, createPrivateKey, sign as cryptoSign } from 'node:crypto'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { APPLE_ROOT_CA_G3_PEM, APPLE_ROOT_CA_G3_SHA256 } from '@/lib/apple/root-ca'
import {
  decodeAppleJwsWithoutVerifying,
  verifyAppleJws,
  verifyAppleJwsWithRoot,
} from '@/lib/apple/jws'

const ROOT_DIR = process.cwd()
const fx = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/test-chain.json'), 'utf8'),
) as Record<string, string>

/** DER (base64 ไม่มีหัว/ท้าย) — รูปแบบที่ `x5c` ใช้ */
const der = (pem: string) => new X509Certificate(pem).raw.toString('base64')
const b64url = (b: Buffer | string) =>
  Buffer.from(b as never).toString('base64url')

/** ประกอบ JWS แบบเดียวกับที่ Apple ส่งมา — เซ็นด้วยกุญแจของใบปลาย */
function makeJws(opts: {
  payload: unknown
  x5c: string[]
  signWithPem: string
  alg?: string
  tamperPayloadAfterSigning?: unknown
}) {
  const header = { alg: opts.alg ?? 'ES256', x5c: opts.x5c }
  const h = b64url(JSON.stringify(header))
  const p = b64url(JSON.stringify(opts.payload))
  const sig = cryptoSign(
    'sha256',
    Buffer.from(`${h}.${p}`, 'ascii'),
    { key: createPrivateKey(opts.signWithPem), dsaEncoding: 'ieee-p1363' },
  )
  /* เปลี่ยน payload **หลัง** เซ็นแล้ว = จำลองคนที่ดักแก้เนื้อหาระหว่างทาง */
  const finalP = opts.tamperPayloadAfterSigning
    ? b64url(JSON.stringify(opts.tamperPayloadAfterSigning))
    : p
  return `${h}.${finalP}.${b64url(sig)}`
}

const TEST_ROOT = new X509Certificate(fx.root_pem)
const GOOD_CHAIN = [der(fx.leaf_pem), der(fx.inter_pem), der(fx.root_pem)]
const PAYLOAD = { productId: 'com.deepthailand.seller.pkg.growth', originalTransactionId: '1000' }

/**
 * ด่าน — ตัวตรวจลายเซ็นของ Apple (feature 00064)
 *
 * 🛑 **ความน่าเชื่อถือของทั้งฟีเจอร์วางอยู่บนไฟล์เดียวคือ `apple/jws.ts`** — ถ้าตรวจหลวม
 * ใครก็ยิง payload ปลอมมาที่ `/api/iap/apple/verify` แล้วได้สิทธิ์ Business Package ฟรี
 * โดยที่เราเห็นเป็นการซื้อปกติทุกประการ
 *
 * เทสชุดนี้สร้าง **ห่วงโซ่ใบรับรองจริง** ขึ้นมาเอง (root → intermediate → leaf ด้วย openssl
 * เก็บเป็น fixture) แล้วประกอบ JWS จริงเซ็นด้วยกุญแจจริง ⇒ ทดสอบได้ทั้งทางผ่านและทางปฏิเสธ
 * ไม่ใช่ mock ที่ยืนยันแค่ว่า "โค้ดทำตามที่คนเขียนเทสคิด"
 */
describe('[blocker] ตรวจลายเซ็น Apple JWS', () => {
  it('🛑 ห่วงโซ่ถูกต้อง + ลายเซ็นถูกต้อง → ผ่าน และได้ payload กลับมาครบ', () => {
    const token = makeJws({ payload: PAYLOAD, x5c: GOOD_CHAIN, signWithPem: fx.leaf_key_pem })
    const r = verifyAppleJwsWithRoot<typeof PAYLOAD>(token, TEST_ROOT)
    expect(r.ok, r.ok ? '' : `ถูกปฏิเสธด้วยเหตุผล ${r.reason}`).toBe(true)
    if (r.ok) expect(r.payload).toEqual(PAYLOAD)
  })

  it('🛑 แก้ payload หลังเซ็น → ต้องถูกปฏิเสธ', () => {
    /* นี่คือเคสที่สำคัญที่สุด — คนที่ดักได้ token จริงแล้วแก้ tier เป็น BUSINESS */
    const token = makeJws({
      payload: PAYLOAD,
      x5c: GOOD_CHAIN,
      signWithPem: fx.leaf_key_pem,
      tamperPayloadAfterSigning: { ...PAYLOAD, productId: 'com.deepthailand.seller.pkg.business' },
    })
    const r = verifyAppleJwsWithRoot(token, TEST_ROOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('BAD_SIGNATURE')
  })

  it('🛑 เซ็นด้วยกุญแจที่ไม่ใช่ของใบปลาย → ปฏิเสธ', () => {
    const token = makeJws({ payload: PAYLOAD, x5c: GOOD_CHAIN, signWithPem: fx.evilleaf_key_pem })
    const r = verifyAppleJwsWithRoot(token, TEST_ROOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('BAD_SIGNATURE')
  })

  it('🛑 สายของคนอื่นที่ตั้งชื่อ subject ว่า "Apple Root CA - G3" → ปฏิเสธ', () => {
    /* 🛑 เคสนี้คือเหตุผลที่ต้องเทียบ **ไบต์ของใบ** ไม่ใช่ชื่อ — ใครก็ออกใบที่ CN ตรงกันได้
       fixture `evil-root` ตั้งชื่อเลียนแบบทุกฟิลด์ (CN/OU/O/C) */
    const evilChain = [der(fx.evil_leaf_pem), der(fx.evil_root_pem)]
    const token = makeJws({ payload: PAYLOAD, x5c: evilChain, signWithPem: fx.evilleaf_key_pem })
    const r = verifyAppleJwsWithRoot(token, TEST_ROOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('ROOT_NOT_APPLE')
  })

  it('🛑 alg = "none" → ปฏิเสธ (ช่องโหว่คลาสสิกของ JWT)', () => {
    const header = b64url(JSON.stringify({ alg: 'none', x5c: GOOD_CHAIN }))
    const payload = b64url(JSON.stringify(PAYLOAD))
    const r = verifyAppleJwsWithRoot(`${header}.${payload}.`, TEST_ROOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('UNSUPPORTED_ALG')
  })

  it('🛑 ไม่มี x5c เลย → ปฏิเสธ ไม่ใช่เชื่อ payload', () => {
    const header = b64url(JSON.stringify({ alg: 'ES256' }))
    const payload = b64url(JSON.stringify(PAYLOAD))
    const r = verifyAppleJwsWithRoot(`${header}.${payload}.AAAA`, TEST_ROOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('NO_CERT_CHAIN')
  })

  it('🛑 ห่วงโซ่ขาด (ตัดใบกลางออก) → ปฏิเสธ', () => {
    /* leaf ถูกเซ็นโดย intermediate ไม่ใช่ root ⇒ ข้าม intermediate แล้วสายต้องขาด */
    const broken = [der(fx.leaf_pem), der(fx.root_pem)]
    const token = makeJws({ payload: PAYLOAD, x5c: broken, signWithPem: fx.leaf_key_pem })
    const r = verifyAppleJwsWithRoot(token, TEST_ROOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('CHAIN_BROKEN')
  })

  it('🛑 ใบหมดอายุ → ปฏิเสธ แม้ลายเซ็นถูกต้อง', () => {
    /* ยิงเวลาไปข้างหน้า 20 ปี — fixture ออกอายุ 10 ปี ⇒ ต้องหมดอายุแน่นอน
       ใช้การฉีดเวลาแทนการรอ เพราะเทสที่ผูกกับนาฬิกาจริงจะพังเองในอนาคต */
    const token = makeJws({ payload: PAYLOAD, x5c: GOOD_CHAIN, signWithPem: fx.leaf_key_pem })
    const future = new Date(Date.now() + 20 * 365 * 86_400_000)
    const r = verifyAppleJwsWithRoot(token, TEST_ROOT, future)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('CERT_EXPIRED')
  })

  it('🛑 รูปร่างพัง (ไม่ครบ 3 ท่อน / base64 ผิด) → MALFORMED ไม่ใช่ throw', () => {
    /* webhook ของ Apple เข้ามาจากภายนอก — โยน exception = 500 แล้ว Apple ยิงซ้ำไม่รู้จบ */
    for (const bad of ['', 'abc', 'a.b', 'a.b.c.d', '!!!.???.***']) {
      const r = verifyAppleJwsWithRoot(bad, TEST_ROOT)
      expect(r.ok, `"${bad}" ควรถูกปฏิเสธ`).toBe(false)
    }
  })
})

describe('[blocker] ใบรากที่ปักหมุด', () => {
  it('🛑 ต้องเป็น Apple Root CA - G3 ตัวจริง (เทียบลายนิ้วมือ)', () => {
    const cert = new X509Certificate(APPLE_ROOT_CA_G3_PEM)
    const fp = cert.fingerprint256.replace(/:/g, '').toUpperCase()
    expect(fp, 'PEM ที่ฝังไว้ไม่ตรงกับลายนิ้วมือที่ปักหมุด').toBe(APPLE_ROOT_CA_G3_SHA256)
    expect(cert.subject).toContain('Apple Root CA - G3')
    /* self-signed — ใบรากต้องเซ็นตัวเอง ถ้าไม่ใช่แปลว่าเอาใบกลางมาใส่ผิด */
    expect(cert.verify(cert.publicKey)).toBe(true)
  })

  it('🛑 `verifyAppleJws` ต้องปฏิเสธสายทดสอบของเราเอง', () => {
    /* พิสูจน์ว่าตัวที่โค้ดจริงเรียก **ใช้ใบรากของ Apple จริง ๆ** ไม่ได้รับใบไหนก็ได้
       — ถ้าเทสนี้ผ่านเป็น ok:true แปลว่ามีคนเปลี่ยนไปเชื่อ trust store ของระบบ */
    const token = makeJws({ payload: PAYLOAD, x5c: GOOD_CHAIN, signWithPem: fx.leaf_key_pem })
    const r = verifyAppleJws(token)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('ROOT_NOT_APPLE')
  })
})

describe('[blocker] ห้ามมีทางลัดข้ามการตรวจ', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(join(ROOT_DIR, dir))) {
      const rel = `${dir}/${name}`
      if (statSync(join(ROOT_DIR, rel)).isDirectory()) {
        if (name === 'node_modules' || name === '__tests__') continue
        walk(rel, out)
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel)
    }
    return out
  }

  it('🛑 โค้ดจริงห้ามเรียก `verifyAppleJwsWithRoot` — มีไว้ให้เทสเท่านั้น', () => {
    /* ตัวนั้นรับใบรากจากผู้เรียก ⇒ ถ้าโค้ดจริงเรียกได้ วันหนึ่งจะมีคนส่งใบของตัวเองเข้าไป
       (rule-must-be-enforced-not-described.md — คอมเมนต์ "ห้ามเรียก" กันได้แค่คนที่อ่านเจอ) */
    const offenders = walk('src').filter(
      (f) => f !== 'src/lib/apple/jws.ts' && readFileSync(join(ROOT_DIR, f), 'utf8').includes('verifyAppleJwsWithRoot'),
    )
    expect(offenders, `เรียกตัวที่ฉีดใบรากได้: ${offenders.join(', ')}`).toEqual([])
  })

  it('🛑 ทุกจุดที่เรียก `decodeAppleJwsWithoutVerifying` ต้องมี carve-out กำกับบรรทัดนั้น', () => {
    /**
     * 🛑 **allow-list ทั้งไฟล์หลวมเกินไป** — พอไฟล์ถูกอนุญาตแล้ว การเรียกครั้งที่สอง
     * ในไฟล์เดียวกัน (ซึ่งอาจเอาไปใช้ให้สิทธิ์จริง) จะลอดเข้ามาโดยไม่มีอะไรฟ้อง
     *
     * ⇒ บังคับ **รายบรรทัด** ตามแพตเทิร์น carve-out ที่โปรเจกต์ใช้อยู่ (HR7):
     * คนเขียนต้องบอกเหตุผลตรงจุดที่เรียก ไม่ใช่ไปเพิ่มชื่อไฟล์ในรายการที่อื่น
     *
     * 🛑 carve-out ต้องอยู่ **บรรทัดเดียวกัน** — คอมเมนต์บรรทัดบนกันไม่ได้
     * (บทเรียนซ้ำจาก theme-guard 2026-08-07)
     */
    const offenders: string[] = []
    for (const f of walk('src')) {
      if (f === 'src/lib/apple/jws.ts') continue // ไฟล์ที่ประกาศตัวมันเอง
      const lines = readFileSync(join(ROOT_DIR, f), 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!line.includes('decodeAppleJwsWithoutVerifying')) return
        if (line.includes('import ')) return
        if (!line.includes('carve-out:')) offenders.push(`${f}:${i + 1}`)
      })
    }
    expect(offenders, `เรียกตัวถอดที่ไม่ตรวจลายเซ็นโดยไม่มี carve-out: ${offenders.join(', ')}`).toEqual([])
  })

  it('🛑 ตัวถอดที่ไม่ตรวจลายเซ็น ต้องอ่าน payload ที่ปลอมได้จริง (ยืนยันว่ามันไม่ตรวจ)', () => {
    /* ปักหมุดพฤติกรรมไว้ ไม่ใช่เพื่อชม แต่เพื่อให้ชัดว่าทำไมห้ามใช้ตัดสินใจ */
    const header = b64url(JSON.stringify({ alg: 'none' }))
    const payload = b64url(JSON.stringify({ productId: 'ของปลอม' }))
    expect(decodeAppleJwsWithoutVerifying(`${header}.${payload}.`)).toEqual({ productId: 'ของปลอม' })
  })
})
