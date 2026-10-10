import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 00071 T10 (seller-action-placement §5.1) — ปุ่ม `+` สร้างออเดอร์ในหัวหน้า /orders (full-screen มือถือ + ปุ่มเดสก์ท็อป)
 * ต้องโผล่เฉพาะผู้ถือ O2s: ผู้ที่ไม่มีสิทธิ์ (เช่น ผู้ดูแลที่ถูกถอด) ต้องไม่เห็นปุ่มที่กดแล้วเจอหน้า "ไม่มีสิทธิ์"
 * (ซ่อนปุ่มไม่ใช่ด่านจริง — ด่านคือ /orders/new gatePage O2s + POST /api/orders; ตรงนี้กันแค่ UI เสนอปุ่มผิด)
 */
const FILE = 'src/app/(paces)/seller/(dashboard)/orders/components/OrdersList.tsx'

/** จำนวน <Link href="/orders/new"> ที่ "ไม่" ถูกห่อด้วย `canCreate && (` ตรงหน้า */
export function ungatedCreateLinks(src: string): number {
  let bad = 0
  const rx = /<Link\s+href="\/orders\/new"/g
  for (let m = rx.exec(src); m; m = rx.exec(src)) {
    if (!/\bcanCreate\s*&&\s*\(\s*$/.test(src.slice(Math.max(0, m.index - 60), m.index))) bad++
  }
  return bad
}

describe('OrdersList — ปุ่มสร้างในหัวหน้า', () => {
  const src = readFileSync(FILE, 'utf8')

  it('canCreate ตัดสินด้วย O2s ของผู้ดู', () => {
    expect(src).toMatch(/const canCreate = useViewerCan\('O2s'\)/)
  })

  it('ทุกปุ่ม <Link href="/orders/new"> (มือถือ + เดสก์ท็อป) อยู่ใต้ canCreate', () => {
    expect([...src.matchAll(/<Link\s+href="\/orders\/new"/g)].length).toBe(2)
    expect(ungatedCreateLinks(src)).toBe(0)
  })

  it('mutation: ปุ่มที่หลุดจาก canCreate ถูกจับ', () => {
    const gated = `{canCreate && (\n  <Link href="/orders/new" />\n)}`
    expect(ungatedCreateLinks(gated)).toBe(0)
    expect(ungatedCreateLinks(gated.replace('canCreate && (', 'true && ('))).toBe(1)
    expect(ungatedCreateLinks(`<div><Link href="/orders/new" /></div>`)).toBe(1)
  })
})
