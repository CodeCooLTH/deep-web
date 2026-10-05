/**
 * [blocker] ShopHeaderBar + ShopInfoCard (feature 00068 B4-L2 · TFR-001/002 · D-10/D-11)
 *
 * สแกนซอร์ส (vitest ของโปรเจกต์เป็น node ไม่มี jsdom) — กันการแก้กลับของ 4 กติกาที่ tsc จับไม่ได้:
 *   1. บรรทัดย่อมาจาก buildShopSummaryLine เท่านั้น (0/null ไม่เขียน)
 *   2. ปกโหลดล้ม 2 ชั้น (lg → ต้นฉบับ → ซ่อนทั้งแถบ)
 *   3. ไม่มีรูปปก = ไม่ render
 *   4. พิล "ร้านใหม่" ตัดสินด้วย isNewShop · แถว "ออเดอร์สำเร็จ" ไม่ gate ด้วย `!= null` เปล่า ๆ
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const DIR = join(process.cwd(), 'src/app/(marketing)/o/[token]')

/** ตัดคอมเมนต์ก่อนตรวจ — ไฟล์เขียนคำเตือนด้วยตัวอักษรเดียวกับที่ห้าม */
const code = (f: string) =>
  readFileSync(join(DIR, f), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

describe('[blocker] ShopHeaderBar', () => {
  const src = code('ShopHeaderBar.tsx')

  it('บรรทัดย่อมาจาก buildShopSummaryLine เท่านั้น — ไม่ประกอบข้อความ/ตัวเลขเอง', () => {
    expect(src).toContain("from '@/lib/buyer-order-summary'")
    expect(src).toMatch(/buildShopSummaryLine\(\{ avgRating, completedOrders \}\)/)
    expect(src).not.toMatch(/ออเดอร์สำเร็จ|toFixed|toLocaleString/)
    expect(src).not.toMatch(/['"`] ครั้ง|`[^`]*ดาว/)
  })

  it('ปกมี onError สองชั้น: ลองรูป lg แล้วต้นฉบับ แล้วถอดแถบ', () => {
    expect(src).toMatch(/\[lg, original\]/)
    expect(src).toMatch(/onError=\{\(\) => setFailed\(\(n\) => n \+ 1\)\}/)
    expect(src).toMatch(/failed >= sources\.length\) return null/)
  })

  it('ไม่มีรูปปก = ไม่ render (ไม่มีพื้นสีแทน) และซ่อนจาก assistive tech', () => {
    expect(src).toMatch(/\.filter\(\(s, i, a\): s is string => !!s/)
    expect(src).toMatch(/alt=''/)
    expect(src).toMatch(/aria-hidden='true'\s+loading='eager'/)
    expect(src).not.toMatch(/getTierGradient|linear-gradient|blur\(/)
  })

  it('ความสูงปก 72/96/128/160 · จุดตัดใช้ ORDER_TWO_COL_MQ ห้ามเขียน 861 ซ้ำ', () => {
    for (const h of ['height: 72', 'height: 96', 'height: 128', 'height: 160']) expect(src).toContain(h)
    expect(src).toContain("objectPosition: '50% 40%'")
    expect(src).toMatch(/ORDER_TWO_COL_MQ/)
    expect(src).not.toMatch(/861/)
  })

  it('โลโก้ซ้อนขอบด้วย sibling selector — ปกถูกถอด layout กลับเอง', () => {
    expect(src).toContain("className='order-cover'")
    expect(src).toContain("'.order-cover + &")
  })

  it('ชื่อร้านเป็น h1 clamp 3 บรรทัดที่ <360 และ 2 บรรทัดที่ ≥360 · lineHeight ≥ 1.4', () => {
    expect(src).toMatch(/component='h1'/)
    expect(src).toMatch(/WebkitLineClamp: 3,\s*\[MQ_360\]: \{ WebkitLineClamp: 2 \}/)
    expect(src).toMatch(/lineHeight: 1\.4,/)
  })

  it('บรรทัดย่อตกบรรทัดทีละหน่วย ไม่ ellipsis', () => {
    expect(src).toMatch(/flexWrap: 'wrap'/)
    expect(src).toMatch(/whiteSpace: 'nowrap'/)
    expect(src).not.toMatch(/textOverflow|noWrap/)
  })
})

describe('[blocker] ShopInfoCard', () => {
  const src = code('ShopInfoCard.tsx')

  it('พิลร้านใหม่ใช้ isNewShop + โทน neutral', () => {
    expect(src).toMatch(/\{isNewShop && \(/)
    expect(src).toMatch(/<TrustPill tone='neutral' label='ร้านใหม่ · ยังไม่มีประวัติเพียงพอ' \/>/)
    expect(src).not.toMatch(/completedOrders == null|completedOrders === null/)
  })

  it('แถวออเดอร์สำเร็จ/คะแนนรีวิวตัดสินด้วยฟังก์ชันร่วมกับบรรทัดย่อ ไม่ใช่ != null เปล่า', () => {
    expect(src).toMatch(/hasOrders && completedOrders != null/)
    expect(src).toMatch(/hasRating && avgRating != null/)
    expect(src).toContain("from '@/lib/buyer-order-summary'")
    expect(src).not.toMatch(/\{completedOrders != null && /)
  })

  it('tier มาจาก SSOT ไม่ hardcode ชื่อ', () => {
    expect(src).toContain("from '@/lib/trust-tier'")
    expect(src).not.toMatch(/Deep (Classic|Silver|Gold|Diamond|Star)/)
  })

  it('ลิงก์/เพจต้นทางใช้ตัวตัดสินเดิม', () => {
    expect(src).toContain('shouldShowOrderOrigin(')
    expect(src).toContain('isRenderableChannel')
    expect(src).not.toMatch(/861/)
  })
})
