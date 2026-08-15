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

  it('[blocker] UI ต้องถามยืนยันก่อนยิง endpoint ยึดคืน', () => {
    const fn = card.match(/const askReclaim = useCallback\([\s\S]*?\n  \)/)?.[0] ?? ''
    expect(fn, 'หา askReclaim ไม่เจอ').not.toBe('')
    const confirmAt = fn.indexOf('Swal.fire(')
    const fetchAt = fn.indexOf("fetch('/api/account/link/reclaim'")
    expect(confirmAt, 'ต้องมี Swal ถามยืนยัน').toBeGreaterThan(-1)
    expect(fetchAt, 'ต้องมีการยิง endpoint').toBeGreaterThan(-1)
    expect(confirmAt, 'Swal ต้องมาก่อนการยิง endpoint').toBeLessThan(fetchAt)
    expect(fn, 'ผู้ใช้กดยกเลิกต้องไม่ยิงอะไรเลย').toMatch(/if \(!r\.isConfirmed\) return/)
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
