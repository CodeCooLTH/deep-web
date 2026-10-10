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
// ด่านสิทธิ์กลาง P3 (shop-capability.ts) — รับ cap อะไรก็ได้ จึง "ไม่" นับเป็นตัวตัดสินเรื่องเงินเอง:
// ต้องเรียกด้วย literal ตระกูล F (F1-F4 = การเงิน) ในวงเล็บของการเรียกนั้น ไม่งั้นหน้าที่ gatePage(session,'H1')
// แล้วดึงยอดขายจะผ่านเทสทั้งที่ผู้ถือ H1 (ผู้ดูแล/แชท) เห็นเงินได้ (T10 · review T4)
const CAP_DECIDERS = ['gatePage', 'requireShopCapability']
const MONEY_CAP = /['"`]F[1-4]['"`]/

// ขอบเขตที่ไม่สแกน (แต่ละอันมีเหตุผล)
const EXCLUDED_PREFIXES = [
  'src/app/api/app/', // แอปมือถือผู้ซื้อ (buyer) — ไม่มีบทบาทร้าน/ไม่ใช่พื้นผิวการเงินของร้าน
  'src/app/(paces)/admin/', // แอดมินแพลตฟอร์ม (ไม่ใช่สมาชิกร้าน) — สิทธิ์ผ่าน admin session
  'src/app/api/admin/', // เช่นเดียวกัน
  'src/app/api/cron/', // เรียกด้วย CRON_SECRET ไม่มีผู้ใช้/บทบาท
]

// ไฟล์ที่เรียกแหล่งเงินโดยไม่มีตัวตัดสินในไฟล์ — เหตุผลบรรทัดเดียวต่อไฟล์ · เข้ารายการนี้ต้องมีคนรีวิว
const ALLOW: Record<string, string> = {
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

/** อาร์กิวเมนต์ดิบในวงเล็บของทุกการเรียก name( — นับวงเล็บซ้อน */
function callArgs(code: string, names: string[]): string[] {
  const out: string[] = []
  const rx = new RegExp(`(?<![\\w.])(?:${names.join('|')})\\s*\\(`, 'g')
  for (let m = rx.exec(code); m; m = rx.exec(code)) {
    let depth = 1, i = rx.lastIndex
    for (; i < code.length && depth > 0; i++) depth += code[i] === '(' ? 1 : code[i] === ')' ? -1 : 0
    out.push(code.slice(rx.lastIndex, i - 1))
  }
  return out
}

/** ด่านกลางที่เรียกด้วย cap การเงิน (F1-F4) — คืนชื่อไว้แสดงใน deciders */
const moneyCapGates = (code: string): string[] =>
  CAP_DECIDERS.filter(n => callArgs(code, [n]).some(a => MONEY_CAP.test(a)))

const calls = (code: string, names: string[]) => names.filter(n => new RegExp(`(?<![\\w.])${n}\\s*\\(`).test(code) || new RegExp(`\\.${n}\\s*\\(`).test(code))

/** แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้ mutation test ฉีดซอร์สปลอมได้ */
function analyze(src: string) {
  const code = strip(src)
  return { money: calls(code, MONEY_SOURCES), deciders: [...calls(code, DECIDERS), ...moneyCapGates(code)] }
}

function scan() {
  const hits: { path: string; money: string[]; deciders: string[] }[] = []
  for (const abs of walk(APP)) {
    const path = relative(ROOT, abs).split('\\').join('/')
    if (!/\/(page|layout)\.tsx$/.test(path) && !/\/api\/.*\/route\.ts$/.test(path)) continue
    if (/\.test\.tsx?$/.test(path) || path.includes('/__tests__/')) continue
    if (EXCLUDED_PREFIXES.some(p => path.startsWith(p))) continue
    const { money, deciders } = analyze(readFileSync(abs, 'utf8'))
    if (money.length) hits.push({ path, money, deciders })
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

describe('finance surface guard — mutation (ตัวตัดสินกลางต้องมี cap การเงิน)', () => {
  const page = (gate: string) => `export default async function P() { const g = await ${gate}; return getSalesSeries(g) }`

  it('ตัวควบคุมบวก: gatePage(…, F1) นับเป็นตัวตัดสิน', () => {
    expect(analyze(page("gatePage(session, 'F1')")).deciders).toEqual(['gatePage'])
    expect(analyze(page('requireShopCapability(session, "F3")')).deciders).toEqual(['requireShopCapability'])
  })

  it('M1 gatePage ด้วย cap ที่ไม่ใช่ F (H1/O1) ไม่นับ → ไฟล์ที่ดึงเงินไม่มีตัวตัดสิน', () => {
    expect(analyze(page("gatePage(session, 'H1')")).deciders).toEqual([])
    expect(analyze(page("requireShopCapability(session, 'O1')")).deciders).toEqual([])
  })

  it('M2 literal F อยู่นอกวงเล็บของด่าน (ที่อื่นในไฟล์) ไม่นับ', () => {
    expect(analyze(page("gatePage(session, cap)") + "\nconst x = 'F1'").deciders).toEqual([])
  })

  it('M3 cap เป็น F-class แต่ชื่อใกล้เคียง (F10/AF1) ไม่นับ', () => {
    expect(analyze(page("gatePage(session, 'F10')")).deciders).toEqual([])
  })
})
