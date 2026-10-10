/**
 * finance-surface-guard — ประตูพิสูจน์ 00071 P1 (S-3/S-5/S-7)
 *
 * กฎ: page/layout/route ใดที่ "เรียก" แหล่งตัวเลขเงินต้องเรียก "ตัวตัดสินสิทธิ์" ในไฟล์เดียวกันด้วย
 * หรืออยู่ใน ALLOW พร้อมเหตุผลรายบรรทัด · สแกนจากซอร์สจริง ไม่มีรายชื่อไฟล์ฮาร์ดโค้ด
 * (conventions/rule-must-be-enforced-not-described §4) — หน้า/route ใหม่ที่ลืม guard จะแดงเอง
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const APP = join(ROOT, 'src/app')

const MONEY_SOURCES = [
  'getBalance', 'getTransactions', 'getPnlReport', 'getSalesSeries', 'getReceivables', 'listExpenses',
  'getBestSellerProducts', 'getProvinceSales', 'getPortfolioSeries', 'getAiSuggestQuotaStatus', 'computeOrderProfit',
]
const DECIDERS = [
  'can', 'moneyLevel', 'dashboardMoney', 'resolveExpenseAccess', 'resolveAgentReportAccess',
  'resolveProductReportAccess', 'resolveReportAccess', 'forbiddenRoleResponse', 'isShopOwnerRole', 'isShopOwnerOfShop',
]

// ขอบเขตที่ไม่สแกน (แต่ละอันมีเหตุผล)
const EXCLUDED_PREFIXES = [
  'src/app/api/app/', // แอปมือถือผู้ซื้อ (buyer) — ไม่มีบทบาทร้าน/ไม่ใช่พื้นผิวการเงินของร้าน
  'src/app/(paces)/admin/', // แอดมินแพลตฟอร์ม (ไม่ใช่สมาชิกร้าน) — สิทธิ์ผ่าน admin session
  'src/app/api/admin/', // เช่นเดียวกัน
  'src/app/api/cron/', // เรียกด้วย CRON_SECRET ไม่มีผู้ใช้/บทบาท
]

// ไฟล์ที่เรียกแหล่งเงินโดยไม่มีตัวตัดสินในไฟล์ — เหตุผลบรรทัดเดียวต่อไฟล์ · เข้ารายการนี้ต้องมีคนรีวิว
const ALLOW: Record<string, string> = {
  'src/app/api/seller/portfolio-series/route.ts': 'ภาพรวมรวมร้านส่วนตัว (PERSONAL) ของผู้ใช้เอง เจ้าของ 100% ไม่มีร้านที่เป็น ADMIN ปนเข้ามา',
  'src/app/(paces)/seller/(dashboard)/business/page.tsx': 'ยอดกระเป๋าของ "ร้านส่วนตัวของผู้ใช้เอง" ใช้คำนวณเตือนต่ออายุแพ็กเกจ ไม่ผูกร้านที่ active',
}

function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*;?/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"]\s*;?/gm, '')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const calls = (code: string, names: string[]) => names.filter(n => new RegExp(`(?<![\\w.])${n}\\s*\\(`).test(code) || new RegExp(`\\.${n}\\s*\\(`).test(code))

function scan() {
  const hits: { path: string; money: string[]; deciders: string[] }[] = []
  for (const abs of walk(APP)) {
    const path = relative(ROOT, abs).split('\\').join('/')
    if (!/\/(page|layout)\.tsx$/.test(path) && !/\/api\/.*\/route\.ts$/.test(path)) continue
    if (/\.test\.tsx?$/.test(path) || path.includes('/__tests__/')) continue
    if (EXCLUDED_PREFIXES.some(p => path.startsWith(p))) continue
    const code = strip(readFileSync(abs, 'utf8'))
    const money = calls(code, MONEY_SOURCES)
    if (money.length) hits.push({ path, money, deciders: calls(code, DECIDERS) })
  }
  return hits
}

describe('finance surface guard', () => {
  const hits = scan()

  it('สแกนเจอพื้นผิวเงินจริง (กันตัวสแกนเงียบ)', () => {
    expect(hits.length).toBeGreaterThan(10)
  })

  it('ทุกไฟล์ที่เรียกแหล่งเงินต้องมีตัวตัดสิน หรืออยู่ใน ALLOW', () => {
    const bad = hits.filter(h => h.deciders.length === 0 && !(h.path in ALLOW)).map(h => `${h.path} → ${h.money.join(',')}`)
    expect(bad).toEqual([])
  })

  it('ALLOW ไม่ค้างเก่า: ไฟล์ต้องมีอยู่ ยังเรียกแหล่งเงิน และมีเหตุผล', () => {
    const byPath = new Map(hits.map(h => [h.path, h]))
    const stale = Object.entries(ALLOW)
      .filter(([p, why]) => !byPath.has(p) || !why.trim())
      .map(([p]) => p)
    expect(stale).toEqual([])
  })
})
