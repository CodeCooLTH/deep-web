import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ด่านกันการ "ยึดบัญชีคืนโดยไม่ถาม" กลับมา
 *
 * 🛑 ร่างแรกของฟีเจอร์นี้ (2026-08-15) ปิดบัญชีค้างให้อัตโนมัติทันทีที่เจอ ด้วยเหตุผลว่า
 * "บัญชีนั้นว่างเปล่า ไม่มีอะไรจะเสีย" — **user ทักท้วงและเขาถูก**: "ข้อมูลว่างเปล่า" ตอบว่า
 * *ความเสียหายน้อย* ไม่ได้ตอบว่า *มีสิทธิ์ทำโดยไม่ถามไหม* และเราไม่มีทางรู้ว่าเขาตั้งใจทิ้ง
 * บัญชีนั้นจริง หรือกำลังสมัครค้างไว้อีกเครื่อง
 *
 * เหตุผลที่ต้องมีด่าน ไม่ใช่แค่คอมเมนต์: การรวมสองขั้นให้เหลือขั้นเดียว "ดูสะอาดกว่า" เสมอ
 * สำหรับคนที่มาอ่านทีหลังและไม่รู้ที่มา — และการถอยกลับไปแบบนั้นจะไม่มีอะไรฟ้องเลย
 * (`tsc`/build/เทสอื่นเขียวหมด เพราะโค้ดถูกทุกตัวอักษร ผู้ใช้แค่เสียบัญชีไปเงียบ ๆ)
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกตามกฎคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย (บทเรียน HR9) */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

describe('ยึดคืนการเชื่อมบัญชี — ต้องถามก่อนเสมอ', () => {
  const auth = stripComments(read('src/lib/auth.ts'))
  const route = stripComments(read('src/app/api/account/link/reclaim/route.ts'))
  const card = stripComments(
    read('src/app/(paces)/seller/(dashboard)/account/components/ConnectedAccountsClient.tsx'),
  )

  it('[blocker] auth.ts ห้ามปิดบัญชี/ย้ายการเชื่อมเอง — ออกได้แค่ตั๋ว', () => {
    /**
     * signIn callback ทำงาน "ระหว่างทางกลับจาก OAuth" ซึ่งไม่มีทางถามผู้ใช้ได้เลย
     * ⇒ อะไรที่ทำตรงนั้น = ทำโดยไม่ได้รับความยินยอม โดยนิยาม
     */
    expect(auth, 'auth.ts ห้ามเขียน deletedAt (ปิดบัญชีคนอื่น)').not.toMatch(/deletedAt:\s*new Date\(\)/)
    expect(auth, 'auth.ts ห้ามย้ายเจ้าของ AuthAccount').not.toMatch(/authAccount\.update\(/)
    // ต้องออกตั๋วแทน
    expect(auth).toContain('signReclaimTicket(')
    expect(auth).toContain('link_error=reclaimable')
  })

  it('[blocker] ต้องจัดการคอลัมน์ @unique ของ User ให้ครบทุกตัว ไม่ใช่ไล่ปะทีละอาการ', () => {
    /**
     * 🛑 บทเรียนตรง ๆ ของรอบนี้: ผมแก้ `username` ไปแล้วประกาศว่าจบ — user ทดสอบแล้วยังค้าง
     * เหมือนเดิม เพราะชนต่อที่ `email` ซึ่งบัญชีที่ถูกปิดถือไว้เหมือนกัน
     *
     * `User` มี unique 3 ตัว: username · email · phone
     *   username/email ← มาจากข้อมูลของผู้ให้บริการ คงที่ตลอดกาล ⇒ ชนได้ ต้องจัดการ
     *   phone          ← ไม่ได้ตั้งตอนสมัคร (null) ⇒ ชนไม่ได้ในเส้นทางนี้
     *
     * เทสนี้ผูกกับ **จำนวนคอลัมน์ unique จริงในสคีมา** — เพิ่มคอลัมน์ unique ใหม่แล้วจะแดง
     * บังคับให้คนเพิ่มมาทบทวนว่าเส้นทางสมัคร OAuth ต้องรับมือกับมันไหม
     */
    const userModel = read('prisma/schema.prisma').match(/^model User \{[\s\S]*?^\}/m)?.[0] ?? ''
    const uniqueCols = [...userModel.matchAll(/^\s+(\w+)\s+\S+\s+@unique/gm)].map((m) => m[1])
    expect(uniqueCols.sort()).toEqual(['email', 'phone', 'username'])

    expect(auth, 'ต้องอ่าน meta.target เพื่อรู้ว่าชนคอลัมน์ไหน').toContain('meta?.target')

    /**
     * 🛑 ต้องเช็คว่า **ทำอะไรกับสิ่งที่ตรวจเจอ** ไม่ใช่แค่ว่า "ตรวจเจอ"
     *
     * ร่างแรกของเทสนี้เช็คแค่ `target.includes("email")` ซึ่งเป็นแค่การ *ตรวจจับ* —
     * พิสูจน์ด้วย mutation แล้วพบว่าลบบรรทัดที่ *แก้ปัญหา* ทิ้ง (`trustedEmail = undefined`)
     * เทสยังเขียวอยู่ = ด่านที่ผ่านตลอดคือด่านที่ไม่มีอยู่จริง
     */
    expect(auth, 'ชน username แล้วต้องเปลี่ยนชื่อจริง').toMatch(
      /if \(hitUsername\) username = /,
    )
    expect(auth, 'ชน email แล้วต้องทิ้งอีเมลจริง').toMatch(
      /if \(hitEmail\) trustedEmail = undefined/,
    )
    expect(auth, 'unique ตัวที่ไม่รู้จักต้อง throw ห้ามกลืนเงียบ').toMatch(
      /if \(!hitUsername && !hitEmail\) throw err/,
    )
  })

  it('[blocker] username ชนกัน ต้องตั้งชื่อใหม่ ไม่ใช่ล้มทั้งการล็อกอิน', () => {
    /**
     * username ตั้งจาก id ของผู้ให้บริการซึ่งคงที่ตลอดกาล — ชนได้แม้ไม่มีใครล็อกอินอยู่
     * (บัญชีที่ถูกปิดไปแล้วยังถือชื่อไว้จนกว่าจะถึงรอบล้างข้อมูลจริง)
     *
     * เคสจริง 2026-08-15: เชื่อม Apple → ยกเลิกการเชื่อม → ออกจากระบบ → ล็อกอิน Apple เดิม
     * ⇒ P2002 บน `username` ไม่ใช่บน AuthAccount ⇒ ตัวดักเดิมหา AuthAccount ไม่เจอแล้ว throw
     * ⇒ **ล็อกอินค้าง ไม่พาไปไหนเลย** (ผู้ใช้ไม่มีทางรู้เลยว่าเกิดอะไรขึ้น)
     *
     * ⇒ P2002 มี 2 สาเหตุที่ต้องแยกกัน ห้ามเหมารวมว่าเป็น race เสมอ
     */
    expect(auth, 'ต้องมีชื่อฐานแยกไว้เพื่อเติมส่วนต่อท้ายได้').toContain('baseUsername')
    expect(auth, 'ต้องมีการลองชื่อใหม่ ไม่ใช่ throw ทันทีเมื่อไม่ใช่ race').toMatch(
      /attempt >= \d+\) throw err/,
    )
    // ต้องยังคืน user ของอีก request เมื่อชนที่ AuthAccount จริง ๆ (เส้นทาง race เดิมห้ามหาย)
    expect(auth).toMatch(/if \(existing\) return existing\.id/)
  })

  it('[blocker] endpoint ยึดคืนต้องผูกตั๋วกับ session ของผู้กดยืนยัน', () => {
    // ตั๋วเดินทางใน URL → ติด Referer/ประวัติเบราว์เซอร์ได้ ต้องถือว่าอาจรั่วเสมอ
    expect(route, 'ต้องเทียบ ticket.userId กับ session').toMatch(/ticket\.userId\s*!==\s*userId/)
  })

  it('[blocker] endpoint ต้องตรวจสถานะซ้ำ ไม่เชื่อตั๋วอย่างเดียว', () => {
    /**
     * ตั๋วมีอายุ 10 นาที — ระหว่างที่ผู้ใช้อ่านคำถามอยู่ บัญชีค้างอาจถูกกรอกเบอร์
     * จนกลายเป็นบัญชีจริงไปแล้ว ตั๋วบอกได้แค่สถานะ ณ ตอนออกตั๋ว
     */
    expect(route).toContain('classifyLinkConflict(')
    expect(route, 'ต้องปฏิเสธเมื่อผลตรวจซ้ำเป็น BLOCKED').toMatch(/verdict === 'BLOCKED'/)
    expect(route, 'ต้องเทียบเจ้าของปัจจุบันกับที่ระบุในตั๋ว').toMatch(
      /existing\.userId\s*!==\s*ticket\.holderUserId/,
    )
  })

  it('[blocker] ย้ายการเชื่อม + ปิดบัญชีค้าง ต้องอยู่ในทรานแซกชันเดียว', () => {
    /**
     * ถ้าปิดบัญชีสำเร็จแต่ย้ายไม่สำเร็จ จะได้สถานะที่ **แย่กว่าเดิม**: id ติดอยู่กับบัญชีที่ปิดไปแล้ว
     * = ไม่มีใครใช้ id นั้นได้ และไม่มีใครเข้าไปแก้ได้อีก (ทางตันเดิมแต่ถาวรกว่า)
     */
    const tx = route.match(/\$transaction\(async \(tx\) => \{[\s\S]*?\n  \}\)/)?.[0] ?? ''
    expect(tx, 'หา $transaction ในไฟล์ไม่เจอ').not.toBe('')
    expect(tx, 'การย้ายเจ้าของต้องอยู่ในทรานแซกชัน').toContain('authAccount.update(')
    expect(tx, 'การปิดบัญชีต้องอยู่ในทรานแซกชันเดียวกัน').toContain('user.updateMany(')
  })

  it('[blocker] ปิดบัญชีค้างต้องทำครบชุดเดียวกับ deleteAccount()', () => {
    /**
     * "ปิดบัญชี" คือ 4 อย่าง ไม่ใช่การตั้ง `deletedAt` อย่างเดียว — ตัวที่ลืมง่ายที่สุดคือ
     * **PushToken**: `/api/seller/push-token` ต้องการแค่ session ไม่มีด่าน onboarding
     * ⇒ บัญชีค้างที่ยืนอยู่หน้า /register ในแอปก็ลงทะเบียน token ไปแล้ว ไม่ถอน = เครื่องนั้น
     * ยังถือ token ที่ผูกกับบัญชีที่ถูกปิดไปแล้ว
     *
     * ผมทำไม่ครบในรอบแรก (ตั้ง deletedAt อย่างเดียว) — จับได้ตอน user สั่งให้ไล่ตรวจซ้ำ
     * ไม่ใช่จาก tsc/เทส เพราะโค้ดถูกทุกตัวอักษร แค่ทำงานไม่ครบ
     */
    const tx = route.match(/\$transaction\(async \(tx\) => \{[\s\S]*?\n  \}\)/)?.[0] ?? ''
    expect(tx).not.toBe('')
    for (const [what, needle] of [
      ['ปิดบัญชี', 'user.updateMany('],
      ['soft-delete ร้าน', 'shop.updateMany('],
      ['ถอน push token', 'pushToken.deleteMany('],
      ['ถอดสมาชิกร้าน', 'shopMember.deleteMany('],
    ] as const) {
      expect(tx, `ทรานแซกชันยึดคืนต้อง${what}`).toContain(needle)
    }
  })

  it('[blocker] เหตุผลที่บันทึกต้องตรงกับสิ่งที่เกิดจริง ไม่ใช่ USER_DELETED', () => {
    /**
     * ผู้ใช้ไม่ได้กดปุ่มลบบัญชีนั้นด้วยตัวเอง — เราปิดให้เพราะเขาขอย้ายตัวตนคืน
     * ประวัติที่บอกเหตุผลผิดคือประวัติที่หลอกคนอ่านในวันที่ต้องสืบสวนย้อนหลัง
     */
    expect(route).toContain('ACCOUNT_DELETE_REASON.ABANDONED_RECLAIMED')
    expect(route, 'ห้ามใช้ USER_DELETED ที่นี่').not.toContain('ACCOUNT_DELETE_REASON.USER_DELETED')
  })

  it('[blocker] UI ต้องถามยืนยันก่อนยิง endpoint ยึดคืน', () => {
    const fn = card.match(/const askReclaim = useCallback\([\s\S]*?\n  \)/)?.[0] ?? ''
    expect(fn, 'หา askReclaim ไม่เจอ').not.toBe('')
    /**
     * 🛑 ตรวจ "ถามก่อนทำ" ไม่ใช่ตรวจชื่อฟังก์ชัน — ด่านที่ผูกกับ *วิธีเขียน* จะแดงทุกครั้งที่
     * refactor ทั้งที่พฤติกรรมยังถูก (เจอเองรอบนี้ตอนเปลี่ยนจาก `Swal.fire` ดิบมาใช้
     * `pacesConfirm` ซึ่งเป็นตัวมาตรฐานของโปรเจกต์ — ด่านแดงทันทีทั้งที่ยังถามผู้ใช้อยู่)
     * สิ่งที่ต้องคงไว้จริง ๆ คือ **มีการถาม และการถามเกิดก่อนการยิง**
     */
    const confirmAt = fn.search(/pacesConfirm\.|pacesAlert\(|Swal\.fire\(/)
    const fetchAt = fn.indexOf("fetch('/api/account/link/reclaim'")
    expect(confirmAt, 'ต้องมีการถามยืนยัน').toBeGreaterThan(-1)
    expect(fetchAt, 'ต้องมีการยิง endpoint').toBeGreaterThan(-1)
    expect(confirmAt, 'การถามต้องมาก่อนการยิง endpoint').toBeLessThan(fetchAt)
    // ผู้ใช้กดยกเลิก = ต้องออกจากฟังก์ชันทันที ไม่ยิงอะไรเลย
    expect(fn, 'ต้องมีทางออกเมื่อผู้ใช้ไม่ยืนยัน').toMatch(/if \(!(confirmed|r\.isConfirmed)\) return/)
  })

  it('[blocker] ทุกการเปลี่ยนสถานะเชื่อม/ถอด ต้องเคลียร์แคชครบ 3 ชั้น', () => {
    /**
     * user สั่งตรง ๆ: "ต้องเคลียร์ข้อมูลให้ครบ ไม่ต้องเปิดปิด app ใหม่ กลัวติดแคช"
     * 3 ชั้นคือ state ในหน้า · RSC payload ฝั่ง client · JWT ของ next-auth
     * เคลียร์ไม่ครบ = กดแล้วเหมือนไม่มีอะไรเกิดขึ้น ซึ่งอ่านไม่ออกว่าพังหรือสำเร็จ
     */
    const fn = card.match(/const syncAfterLinkChange = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\)/)?.[0] ?? ''
    expect(fn, 'หา syncAfterLinkChange ไม่เจอ').not.toBe('')
    expect(fn, 'ชั้น JWT — ต้องเรียก update() ของ next-auth').toMatch(/updateRef\.current\(\)/)
    expect(fn, 'ชั้น RSC — ต้องเรียก router.refresh()').toContain('router.refresh()')
    // ชั้น state อยู่ใน markLinked ซึ่งเรียก syncAfterLinkChange ต่อ
    expect(card).toMatch(/setLinkedMap\(\(prev\) => \(\{ \.\.\.prev, \[provider\]: linked \}\)\)/)
    expect(card).toContain('syncAfterLinkChange()')
  })
})
