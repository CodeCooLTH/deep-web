/**
 * route-capability-inventory — ประตูพิสูจน์ 00071 P3 (S-12 · BRD FR-RP-02 "เทสที่แดงเมื่อพบ route ร้านที่ไม่ประกาศ capability")
 *
 * สแกนจากซอร์สจริงตามรูปร่างโค้ด (เรียกตัวหาร้าน) ไม่ใช่รายชื่อไฟล์ฮาร์ดโค้ด
 * (conventions/rule-must-be-enforced-not-described §4, mutation-silence-means-weak-corpus):
 * ตัวสแกนรับ Map<path, source> เพื่อให้ mutation test ฉีดซอร์สปลอมเข้าไปพิสูจน์ว่าแต่ละกฎ "แดงได้จริง"
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPABILITY_ROLES } from '@/lib/shop-permissions'
import {
  isClassEntry, lookupRouteEntry, PREFIX_CLASSES, ROUTE_CAPABILITIES,
  type Caps, type RouteClass, type RouteEntry,
} from '@/lib/route-capabilities'

const ROOT = process.cwd()
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const

// ตัวตัดสินสิทธิ์ที่รับ cap — เรียกด้วย literal cap ตรงทะเบียนจึงนับว่าเป็นด่าน
// wrapper โดเมนเดิม (F-6) อยู่ในรายการนี้เพราะ T2-T4 จะให้รับ cap บังคับ
const GUARDS = [
  'requireShopCapability', 'canAccessShopWith', 'listAccessibleShopIds', 'gatePage', 'resolveChatScope',
  'resolveScopedShopId', 'resolveConversationShopId',
  'requireShopContext', 'requireSellerShop', 'requireInspectionShop', 'requireAutoOrderShop',
  'requireBuilderShopContext', 'requireShopId', 'requireScope', 'resolveChatChannelForUser', 'requireDraftOwner',
  'requireGeneralShop', 'requireLodgingShop',
  'requireAccess', // line-report/_shared.ts: requireAccess(level, cap) ส่งต่อ cap ให้ requireShopCapability (T4)
]
// ตัวหาร้าน/สมาชิกแบบไม่มี cap — ใน route ที่ DECLARED ห้ามเหลือ (ตัดสินสิทธิ์ด้วย membership ล้วน = ต้นเหตุช่องโหว่ F-1/F-4)
const RAW_IN_DECLARED = ['canAccessShop', 'requireShopMember', 'isShopMember', 'assertShopsAccessible', 'getShopByUserId', 'getPersonalShop']
// ตัวหาร้านทั้งหมดที่ทำให้ไฟล์นับเป็น "resolve ร้าน"
const RESOLVERS = [
  ...GUARDS, ...RAW_IN_DECLARED,
  'requireActiveShop', 'resolveActiveShopContext', 'requireShopForRequest', 'resolveActiveShopRef',
  'resolveExpenseAccess', 'resolveAgentReportAccess', 'resolveProductReportAccess', 'resolveReportAccess',
  'requireAccess', 'requireReportAccess', 'assertReportAccess',
]
// ตัวหาร้านที่คลาสไม่ใช่ cap เรียกได้ (นอกนั้นห้าม) — MEMBER = "ร้านที่ active ของฉัน" ไม่ตัดสินบทบาท · SELF = ร้านส่วนตัวของตัวเอง
const CLASS_ALLOWED: Record<RouteClass, string[]> = {
  MEMBER: ['requireActiveShop', 'resolveActiveShopContext', 'requireShopForRequest'],
  SELF: ['getPersonalShop', 'getShopByUserId', 'isShopMember'], // isShopMember: switch-context ตรวจว่าเป็นสมาชิกร้านปลายทาง (ทุกบทบาทสลับได้)
  BUYER: [], PUBLIC: [], PLATFORM_ADMIN: [], CRON: [], WEBHOOK: [],
}
// รูปร่างอื่นที่บ่งว่า resolve ร้านเองโดยไม่ผ่านตัวช่วย
const SHAPE_HINT = /activeShopId|shopMember\.|prisma\.shop\.(findFirst|findUnique|findMany)/

// ไฟล์ตัวช่วยใน api ที่เรียกตัวหาร้านดิบแทน route — ต้องขึ้นรายการนี้พร้อมเหตุผล (เข้ารายการ = ต้องมีคนรีวิว)
const WRAPPERS: Record<string, string> = {
  'src/app/api/channels/line/rich-menu/_shared.ts': 'requireShopId — ด่านร้านของ rich-menu (H3 · T2 ให้รับ cap)',
  'src/app/api/line-report/_shared.ts': 'requireReportAccess/assertReportAccess — ด่านร้านของรายงานกลุ่ม LINE (T4 · T6 ให้รับ cap)',
  'src/app/api/follow-ups/_shared.ts': 'requireScope — ด่านร้านของ follow-up (X2 · T2 ให้รับ cap)',
  'src/app/api/orders/[token]/auto-order/_guard.ts': 'requireDraftOwner — ด่านร้านของแบบร่างออเดอร์อัตโนมัติ (O2 · T3 ให้รับ cap)',
  'src/app/api/seller/auctions/_shared.ts': 'requireSellerShop — ด่านร้านของประมูลผู้ขาย (X1 · T4 ให้รับ cap)',
  'src/app/api/seller/auto-order/_shared.ts': 'requireAutoOrderShop — ด่านร้านของตั้งค่าสร้างออเดอร์อัตโนมัติ (X3)',
  'src/app/api/seller/inspection/_shared.ts': 'requireInspectionShop — ด่านร้านของแผนตรวจสอบ (T4)',
  'src/app/api/shops/current/page-builder/_shared.ts': 'requireBuilderShopContext — ด่านร้านของ page builder (T1)',
  'src/app/api/uploads/_shared.ts': 'resolveChatChannelForUser — ด่านร้านของอัปโหลดแชท (H2 · T2)',
  'src/lib/line-report/active-shop.ts': 'resolveReportAccess — ตัวตัดสินสิทธิ์รายงาน LINE ของหน้า dashboard/shop (T4 · T6 ให้รับ cap)',
  'src/lib/auto-reply-route-context.ts': 'requireShopContext — ด่านร้านของ auto-reply/ai-settings/comment-reply (H3 · T2)',
}

// ---------- ตัวสแกน (รับ Map เพื่อทดสอบด้วยซอร์สปลอมได้) ----------

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*;?/gm, '')

/** อาร์กิวเมนต์ (ข้อความดิบในวงเล็บ) ของทุกการเรียก name( — นับวงเล็บซ้อน ไม่ใช่ regex ข้ามคำสั่ง */
function callArgs(code: string, names: readonly string[]): { name: string; args: string }[] {
  const out: { name: string; args: string }[] = []
  const rx = new RegExp(`(?<![\\w.])(${names.join('|')})\\s*\\(`, 'g')
  for (let m = rx.exec(code); m; m = rx.exec(code)) {
    let depth = 1, i = rx.lastIndex
    for (; i < code.length && depth > 0; i++) depth += code[i] === '(' ? 1 : code[i] === ')' ? -1 : 0
    out.push({ name: m[1], args: code.slice(rx.lastIndex, i - 1) })
  }
  return out
}

const callsOf = (code: string, names: readonly string[]) => [...new Set(callArgs(code, names).map((c) => c.name))]

/** เนื้อ handler ของ method หนึ่ง: จาก export ของมันถึงประกาศระดับบนสุดถัดไป (function/const/export/class ที่ชิดขอบซ้าย) —
 *  helper ที่ไม่ได้ export คั่นระหว่าง handler จึงไม่ถูกนับเป็นเนื้อของ handler ก่อนหน้า */
function methodBody(code: string, method: string): string | null {
  const m = new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${method}\\b|const\\s+${method}\\b)`).exec(code)
  if (!m) return null
  const rest = code.slice(m.index + m[0].length)
  const next = rest.search(/\n(?:export|async\s+function|function|const|let|class)\s/)
  return next === -1 ? rest : rest.slice(0, next)
}

const exportedMethods = (code: string) => METHODS.filter((m) => methodBody(code, m) !== null)

const isRouteOrPage = (p: string) =>
  (/^src\/app\/api\/.*\/route\.ts$/.test(p) || /^src\/app\/\(paces\)\/seller\/(.*\/)?(page|layout)\.tsx$/.test(p)) &&
  !/\.test\.tsx?$/.test(p) && !p.includes('/__tests__/')

const isWrapperFile = (p: string) =>
  (/^src\/app\/api\/.*\/(_[^/]*\.ts|[^/]*-guard\.ts|[^/]*route-context[^/]*\.ts)$/.test(p) ||
    /^src\/lib\/[^/]*route-context[^/]*\.ts$/.test(p) || p === 'src/lib/line-report/active-shop.ts') &&
  !p.includes('/__tests__/') && !/\.test\.tsx?$/.test(p)

const capsOf = (c: Caps): string[] => (typeof c === 'string' ? [c] : [...c])

export function scan(
  sources: ReadonlyMap<string, string>,
  entryOf: (p: string) => RouteEntry | undefined,
  registryKeys: readonly string[],
  wrappers: Record<string, string>,
  opts: { checkStale: boolean },
): string[] {
  const v: string[] = []
  for (const [path, src] of sources) {
    const code = stripComments(src)
    if (isWrapperFile(path)) {
      if (callsOf(code, RESOLVERS).length && !(path in wrappers)) v.push(`WRAPPER_NOT_ALLOWLISTED ${path}`)
      continue
    }
    if (!isRouteOrPage(path)) continue
    const entry = entryOf(path)
    // default-deny: ทุก route/หน้า seller ต้องมีรายการ (ไม่ดูว่าเรียกตัวหาร้านหรือไม่ — route ที่ไม่เรียกอะไรเลยคือช่องโหว่ที่เงียบที่สุด)
    if (!entry) {
      v.push(`MISSING_ENTRY ${path}`)
      continue
    }
    if (isClassEntry(entry)) {
      if (entry.status === 'DECLARED') {
        const bad = callsOf(code, RESOLVERS).filter((n) => !CLASS_ALLOWED[entry.class].includes(n))
        if (bad.length) v.push(`CLASS_CALLS_RAW_RESOLVER ${path} [${entry.class}] → ${bad.join(',')}`)
      }
      continue
    }
    // รายการแบบ cap: method/หน้าในทะเบียนต้องตรงกับที่ไฟล์ export จริง (ทุก status)
    const declaredMethods = METHODS.filter((m) => entry[m] !== undefined)
    if (path.endsWith('/route.ts')) {
      for (const m of exportedMethods(code)) if (!declaredMethods.includes(m)) v.push(`UNDECLARED_METHOD ${path} ${m}`)
      for (const m of declaredMethods) if (methodBody(code, m) === null) v.push(`STALE_METHOD ${path} ${m}`)
    }
    if (entry.status !== 'DECLARED') continue
    const targets: [string, string | null, Caps | undefined][] = path.endsWith('/route.ts')
      ? declaredMethods.map((m) => [m, methodBody(code, m), entry[m]])
      : [['page', code, entry.page]]
    for (const [label, body, caps] of targets) {
      if (body === null || caps === undefined) continue
      const guardArgs = callArgs(body, GUARDS)
      for (const cap of capsOf(caps)) {
        if (!guardArgs.some((g) => new RegExp(`['"\`]${cap}['"\`]`).test(g.args))) {
          v.push(guardArgs.length ? `WRONG_CAP ${path} ${label} expects ${cap}` : `GUARD_MISSING ${path} ${label} expects ${cap}`)
        }
      }
      const raw = callsOf(body, RAW_IN_DECLARED)
      if (raw.length) v.push(`RAW_RESOLVER_IN_DECLARED ${path} ${label} → ${raw.join(',')}`)
    }
  }
  if (opts.checkStale) {
    for (const k of registryKeys) if (!sources.has(k)) v.push(`STALE_KEY ${k}`)
    for (const k of Object.keys(wrappers)) if (!sources.has(k)) v.push(`STALE_WRAPPER ${k}`)
  }
  return v
}

// ---------- โหลดต้นไม้จริง ----------
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
function loadReal(): Map<string, string> {
  const m = new Map<string, string>()
  const files = [...walk(join(ROOT, 'src/app')), ...readdirSync(join(ROOT, 'src/lib')).map((n) => join(ROOT, 'src/lib', n)), join(ROOT, 'src/lib/line-report/active-shop.ts')]
  for (const abs of files) {
    const p = relative(ROOT, abs).split('\\').join('/')
    if (isRouteOrPage(p) || isWrapperFile(p)) m.set(p, readFileSync(abs, 'utf8'))
  }
  return m
}

// ---------- เทส ----------
describe('route-capability inventory (ต้นไม้จริง)', () => {
  const real = loadReal()
  const violations = scan(real, lookupRouteEntry, Object.keys(ROUTE_CAPABILITIES), WRAPPERS, { checkStale: true })

  it('สแกนเจอพื้นผิวร้านจริง (กันตัวสแกนเงียบ)', () => {
    const resolving = [...real].filter(([p, s]) => isRouteOrPage(p) && (callsOf(stripComments(s), RESOLVERS).length > 0 || SHAPE_HINT.test(stripComments(s))))
    expect(resolving.length).toBeGreaterThan(250)
  })

  it('ไม่มีการละเมิดเลย: ทุกไฟล์ที่ resolve ร้านมีรายการ · key มีไฟล์จริง · DECLARED เรียกด่าน cap ตรง · wrapper อยู่ allow-list', () => {
    expect(violations).toEqual([])
  })

  it('ทุก cap ในทะเบียนมีในตารางสิทธิ์ · รายการคลาสมีเหตุผล', () => {
    const known = new Set(Object.keys(CAPABILITY_ROLES))
    const bad: string[] = []
    for (const [p, e] of Object.entries(ROUTE_CAPABILITIES)) {
      if (isClassEntry(e)) {
        if (!e.reason.trim()) bad.push(`NO_REASON ${p}`)
        continue
      }
      for (const k of [...METHODS, 'page'] as const) {
        const c = e[k]
        if (c !== undefined) for (const cap of capsOf(c)) if (!known.has(cap)) bad.push(`UNKNOWN_CAP ${p} ${k} ${cap}`)
      }
    }
    for (const c of PREFIX_CLASSES) if (!c.reason.trim()) bad.push(`NO_REASON prefix ${c.prefix}`)
    expect(bad).toEqual([])
  })

  it('สถิติทะเบียน (T10 ต้องให้ PENDING = 0)', () => {
    const entries = Object.values(ROUTE_CAPABILITIES)
    const pending = entries.filter((e) => e.status === 'PENDING').length
    // บันทึกไว้ในรายงานรอบนี้ — ไม่ assert ค่า เพราะ T2-T4 จะลดลงเรื่อย ๆ
    console.info(`[route-capabilities] total=${entries.length} pending=${pending} declared=${entries.length - pending}`)
    expect(entries.length).toBeGreaterThan(250)
  })
})

describe('route-capability inventory (mutation: ฉีดซอร์สปลอม — กฎแต่ละข้อต้องแดงได้จริง)', () => {
  const P = 'src/app/api/fake/route.ts'
  const run = (src: string, entry?: RouteEntry, path = P) =>
    scan(new Map([[path, src]]), () => entry, entry ? [path] : [], {}, { checkStale: false })
  const decl = (cap: 'O1' | 'H1'): RouteEntry => ({ GET: cap, status: 'DECLARED' })

  const OK = `import { x } from 'y'
export async function GET() {
  const g = await requireShopCapability(session, 'O1', { shopId })
  return Response.json(g)
}`

  it('ตัวควบคุมบวก: ซอร์สที่ถูกต้องไม่มีการละเมิด', () => {
    expect(run(OK, decl('O1'))).toEqual([])
  })

  it('M1 ไม่มีด่านเลย → GUARD_MISSING', () => {
    const src = `export async function GET() {\n  return Response.json(await prisma.order.findMany())\n}`
    expect(run(src, decl('O1'))).toEqual([expect.stringContaining('GUARD_MISSING')])
  })

  it('M2 ยังเรียก canAccessShop ดิบควบคู่ → RAW_RESOLVER_IN_DECLARED', () => {
    const src = OK.replace('return', 'if (!(await canAccessShop(a, b))) return Response.json({}, { status: 403 })\n  return')
    expect(run(src, decl('O1'))).toEqual([expect.stringContaining('RAW_RESOLVER_IN_DECLARED')])
  })

  it('M3 literal cap ไม่ตรงทะเบียน → WRONG_CAP', () => {
    expect(run(OK, decl('H1'))).toEqual([expect.stringContaining('WRONG_CAP')])
  })

  it('M3b cap ที่ขึ้นต้นเหมือนกัน (O2s ≠ O2) ไม่ถูกนับว่าตรง', () => {
    const src = OK.replace("'O1'", "'O2s'")
    expect(run(src, { GET: 'O2', status: 'DECLARED' })).toEqual([expect.stringContaining('WRONG_CAP')])
  })

  it('M4 literal cap อยู่นอกวงเล็บของด่าน (เรียกด่านด้วย cap อื่น แล้วมี string ตรงที่อื่น) → ไม่นับ', () => {
    const src = `export async function GET() {\n  await requireShopCapability(session, cap)\n  const x = 'O1'\n}`
    expect(run(src, decl('O1'))).toEqual([expect.stringContaining('WRONG_CAP')])
  })

  it('M5b route ที่ไม่เรียกตัวหาร้านเลย (service ล้วน) และไม่มีรายการ → MISSING_ENTRY (default-deny)', () => {
    const src = `export async function POST() { return Response.json(await orderService.cancelAll()) }`
    expect(run(src, undefined)).toEqual([`MISSING_ENTRY ${P}`])
  })

  it('M5 route resolve ร้านแต่ไม่มีรายการ → MISSING_ENTRY', () => {
    const src = `export async function GET() { return Response.json(await requireActiveShop(s)) }`
    expect(run(src, undefined)).toEqual([expect.stringContaining('MISSING_ENTRY')])
  })

  it('M6 handler method ที่ไม่ได้ประกาศในทะเบียน → UNDECLARED_METHOD (แม้ PENDING)', () => {
    const src = `${OK}\nexport async function DELETE() { return Response.json({}) }`
    expect(run(src, { GET: 'O1', status: 'PENDING' })).toEqual([expect.stringContaining('UNDECLARED_METHOD')])
  })

  it('M6b helper ที่ไม่ export คั่นระหว่าง handler ไม่ถูกนับเป็นเนื้อของ handler ก่อนหน้า', () => {
    const src = `export async function GET() { return Response.json({}) }
async function helper() { return requireShopCapability(s, 'O1') }
export async function POST() { return Response.json({}) }`
    expect(run(src, { GET: 'O1', POST: 'O1', status: 'DECLARED' })).toEqual([expect.stringContaining('GUARD_MISSING'), expect.stringContaining('GUARD_MISSING')])
  })

  it('M7 ด่านอยู่ใน method อื่น (GET มีด่าน POST ไม่มี) → ตรวจต่อ method', () => {
    const src = `${OK}\nexport async function POST() { return Response.json({}) }`
    expect(run(src, { GET: 'O1', POST: 'O2', status: 'DECLARED' })).toEqual([expect.stringContaining('GUARD_MISSING')])
  })

  it('M8 cap แบบ AND (อาร์เรย์) ขาดตัวหนึ่ง → แดง', () => {
    const src = `export async function PATCH() {\n  await requireShopCapability(s, 'Q1')\n}`
    expect(run(src, { PATCH: ['Q1', 'O4'], status: 'DECLARED' })).toEqual([expect.stringContaining('expects O4')])
  })

  it('M9 คลาส SELF เรียก canAccessShop → CLASS_CALLS_RAW_RESOLVER', () => {
    const src = `export async function POST() { await canAccessShop(a, b) }`
    expect(run(src, { class: 'SELF', reason: 'x', status: 'DECLARED' })).toEqual([expect.stringContaining('CLASS_CALLS_RAW_RESOLVER')])
  })

  it('M10 คลาส MEMBER เรียกด่าน cap (ขัดกับที่ประกาศ) → แดง · เรียก requireActiveShop ได้', () => {
    const bad = `export async function GET() { await requireShopCapability(s, 'O1') }`
    expect(run(bad, { class: 'MEMBER', reason: 'x', status: 'DECLARED' })).toEqual([expect.stringContaining('CLASS_CALLS_RAW_RESOLVER')])
    const ok = `export async function GET() { await requireActiveShop(s) }`
    expect(run(ok, { class: 'MEMBER', reason: 'x', status: 'DECLARED' })).toEqual([])
  })

  it('M11 หน้า RSC: gatePage ต้องมี cap ตรง', () => {
    const page = 'src/app/(paces)/seller/(dashboard)/fake/page.tsx'
    const good = `export default async function P() { const g = await gatePage(session, 'F1') }`
    expect(run(good, { page: 'F1', status: 'DECLARED' }, page)).toEqual([])
    expect(run(good, { page: 'F3', status: 'DECLARED' }, page)).toEqual([expect.stringContaining('WRONG_CAP')])
  })

  it('M12 wrapper ใหม่ที่เรียกตัวหาร้านดิบแต่ไม่อยู่ allow-list → แดง', () => {
    const w = 'src/app/api/fake/_shared.ts'
    const src = `export async function requireFoo() { return requireActiveShop(s) }`
    expect(run(src, undefined, w)).toEqual([expect.stringContaining('WRAPPER_NOT_ALLOWLISTED')])
  })

  it('M12b wrapper ใหม่ที่เรียก requireAccess/assertReportAccess แต่ไม่อยู่ allow-list → แดง', () => {
    const w = 'src/app/api/fake/_shared.ts'
    expect(run(`export const a = () => assertReportAccess(s)`, undefined, w)).toEqual([expect.stringContaining('WRAPPER_NOT_ALLOWLISTED')])
    expect(run(`export const a = () => requireAccess(s)`, undefined, w)).toEqual([expect.stringContaining('WRAPPER_NOT_ALLOWLISTED')])
  })

  it('M13 key ในทะเบียนที่ไม่มีไฟล์ → STALE_KEY', () => {
    expect(scan(new Map(), () => undefined, ['src/app/api/gone/route.ts'], {}, { checkStale: true })).toEqual(['STALE_KEY src/app/api/gone/route.ts'])
  })

  it('ความคิดเห็นที่มีชื่อด่านไม่นับเป็นการเรียก', () => {
    const src = `export async function GET() {\n  // requireShopCapability(session, 'O1')\n  return Response.json({})\n}`
    expect(run(src, decl('O1'))).toEqual([expect.stringContaining('GUARD_MISSING')])
  })
})
