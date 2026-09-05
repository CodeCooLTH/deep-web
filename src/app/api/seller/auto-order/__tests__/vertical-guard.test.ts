import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 00061 — ทุก endpoint ของฟีเจอร์นี้ต้องผ่านด่านร่วม (AC-ACO-09)
 *
 * 🛑 ด่านต้องอยู่ที่ **route ทุกเส้น** ไม่ใช่แค่จุดเปิดใช้งาน — AC-09 พูดถึง "route" ไม่ใช่
 * "ปุ่ม" ถ้ากันแค่จุดเปิด ร้านคิวงานจะตั้งวลี/เลือกเพจเก็บไว้ได้แล้วเจอ 403 ตอนกดเปิดเท่านั้น
 *
 * 🛑 เป็นเทสสแกนซอร์สเพราะ **จุดที่ยังไม่มีคนเขียน** คือความเสี่ยงจริง — เทสพฤติกรรมครอบได้
 * เฉพาะ route ที่มีอยู่แล้ว ตัวใหม่ที่ลืมใส่ด่านจะไม่มีอะไรฟ้องเลย
 */
const ROOT = 'src/app/api/seller/auto-order'

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) routeFiles(p, out)
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

const FILES = routeFiles(ROOT)

describe('ด่านของ /api/seller/auto-order/*', () => {
  it('มี route อย่างน้อย 6 เส้น (ถ้าน้อยกว่านี้แปลว่าโครงหาย)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(6)
  })

  it.each(FILES)('[blocker] %s เรียก requireAutoOrderShop เป็นด่านแรก', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).toContain('requireAutoOrderShop()')
    // ต้อง return response ทันทีเมื่อไม่ผ่าน ไม่ใช่เรียกแล้วเมินผล
    expect(src).toMatch(/if\s*\(!guard\.ok\)\s*return guard\.response/)
    // 🛑 ห้ามรับ shopId จาก body/query — membership guard ทั้งชุดได้มาจาก active shop เท่านั้น
    expect(src).not.toMatch(/shopId:\s*(body|parsed\.output|searchParams)/)
  })

  it('[blocker] ด่านร่วมกันทั้ง 3 อย่าง: ล็อกอิน · มีร้าน · vertical', () => {
    const shared = readFileSync(join(ROOT, '_shared.ts'), 'utf8')
    expect(shared).toContain('getServerSession')
    expect(shared).toContain('requireActiveShop')
    expect(shared).toMatch(/resolveShopVertical\([^)]*\)\s*!==\s*'ONLINE_SALES'/)
    // สถานะต้องเป็น 403 ไม่ใช่ 404 — ร้านมีอยู่จริง แค่ใช้ฟีเจอร์นี้ไม่ได้
    const at = shared.indexOf("!== 'ONLINE_SALES'")
    expect(shared.slice(at, at + 400)).toContain('status: 403')
  })

  it('[blocker] ปุ่มบนการ์ดร่างเป็นของฝั่งร้านเท่านั้น — ไม่มีเส้นทางของผู้ซื้อ', () => {
    const guard = readFileSync('src/app/api/orders/[token]/auto-order/_guard.ts', 'utf8')
    expect(guard).toContain('canAccessShop')
    // ร่างเป็นของภายในที่ลูกค้าไม่เคยเห็น ⇒ ต้องไม่มีสาขา buyerUserId เลย
    expect(guard).not.toContain('buyerUserId')
  })
})
