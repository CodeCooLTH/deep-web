/**
 * route-capability-inventory — ประตูพิสูจน์ 00071 P3 (S-12 · BRD FR-RP-02 "เทสที่แดงเมื่อพบ route ร้านที่ไม่ประกาศ capability")
 *
 * สแกนจากซอร์สจริงตามรูปร่างโค้ด (เรียกตัวหาร้าน) ไม่ใช่รายชื่อไฟล์ฮาร์ดโค้ด
 * (conventions/rule-must-be-enforced-not-described §4, mutation-silence-means-weak-corpus):
 * ตัวสแกนรับ Map<path, source> เพื่อให้ mutation test ฉีดซอร์สปลอมเข้าไปพิสูจน์ว่าแต่ละกฎ "แดงได้จริง"
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAPABILITY_ROLES } from '@/lib/shop-permissions'
import {
  isClassEntry, isMethodClass, lookupRouteEntry, PREFIX_CLASSES, ROUTE_CAPABILITIES,
  type AccountGate, type Caps, type MethodClass, type RouteClass, type RouteEntry,
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
  // T2: route ส่ง cap literal ให้ service ที่ตรวจ canAccessShopWith กับร้านเจ้าของแถวเอง (review T2 ยืนยันทั้ง 12 ตัว)
  'replyToComment', 'sendPrivateReplyToCommentById', 'commentOnPost', 'getPostComments', 'setCommentResolved',
  'getThreadMessagesPage', 'markRead', 'sendOutboundReaction', 'cancelFailedOutboundMessage',
  'claimConversationControl', 'notifyTyping', 'saveIceBreakers',
]
// ด่านระดับ "บัญชี" (ไม่ผูกร้านที่ active) — ใช้ได้เฉพาะรายการคลาส SELF ที่ทะเบียนประกาศ `account` (รายงานกลุ่ม LINE · มติ 00070)
// ไม่ใช่ GUARDS: ไม่รับ cap ร้าน จึงห้ามถูกนับเป็นด่านของรายการแบบ cap (กันใช้แทนด่านร้านโดยเงียบ)
const ACCOUNT_GATES = ['requireAccess', 'resolveReportAccess']
// ตัวหาร้านที่รายการ SELF แบบ account เรียกได้เพิ่ม: อ่านชื่อร้านที่ active "เพื่อแสดงข้อความขอบเขตกลุ่ม" เท่านั้น — ไม่ตัดสินสิทธิ์ (active-shop.ts หัวไฟล์)
const ACCOUNT_DISPLAY_ONLY = ['resolveActiveShopRef']
// ตัวหาร้าน/สมาชิกแบบไม่มี cap — ใน route ที่ DECLARED ห้ามเหลือ (ตัดสินสิทธิ์ด้วย membership ล้วน = ต้นเหตุช่องโหว่ F-1/F-4)
const RAW_IN_DECLARED = ['canAccessShop', 'requireShopMember', 'isShopMember', 'assertShopsAccessible', 'getShopByUserId', 'getPersonalShop']
// ตัวหาร้านทั้งหมดที่ทำให้ไฟล์นับเป็น "resolve ร้าน"
const RESOLVERS = [
  ...GUARDS, ...RAW_IN_DECLARED,
  'requireActiveShop', 'resolveActiveShopContext', 'requireShopForRequest', 'resolveActiveShopRef',
  'resolveExpenseAccess', 'resolveAgentReportAccess', 'resolveProductReportAccess', 'resolveReportAccess',
  ...ACCOUNT_GATES, 'requireReportAccess', 'assertReportAccess',
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
  // --- T10: helper ใต้ src/lib ที่ชื่อไม่ตรงแบบ wrapper แต่ route/หน้า import และเรียกตัวหาร้านดิบ (ตรวจแล้วทีละไฟล์) ---
  'src/lib/shop-capability.ts': 'ด่านกลางเอง (requireShopCapability/gatePage/canAccessShopWith) — เรียก requireShopForRequest เพื่อ re-verify สมาชิกภาพสดแล้วตัดสินด้วย can()',
  'src/lib/viewer-roles.ts': 'viewerRolesOf — อ่านบทบาทเพื่อป้อนการ์ด NoPermissionCard เท่านั้น (เรียกเฉพาะทางที่ถูกปฏิเสธแล้ว ไม่ตัดสินสิทธิ์)',
  'src/lib/shop-api-guard.ts': 'requireShopMember/requireLodgingShop/requireGeneralShop — ด่านของ /api/shops/current/** · requireShopMember แบบไม่มี cap เป็นหนี้ที่ route ต้องไม่ใช้ใน DECLARED (RAW_IN_DECLARED ดักอยู่) และจะถูกลบเมื่อไม่มีผู้ใช้',
  'src/lib/chat-scope.ts': 'resolveChatScope/resolveConversationShopId/resolveScopedShopId — ขอบเขตแชทรายร้าน cap บังคับ (H1/H2/X2) · isShopMember ใช้แยก 403 (สมาชิกขาดสิทธิ์) กับ 404 (คนนอก) บนทาง miss เท่านั้น',
  'src/lib/product-page-title.ts': 'อ่านประเภทร้านเพื่อเลือกคำในชื่อหน้า (metadata) เท่านั้น — ไม่ตัดสินสิทธิ์ ไม่คืนข้อมูลร้าน',
  'src/lib/auth.ts': 'NextAuth callbacks — isShopMember ตรวจว่า activeShopId ที่ขอสลับเป็นร้านที่ผู้ใช้เป็นสมาชิกจริงก่อนเขียนลง JWT (ตัวเลือก ไม่ใช่ด่านของ route)',
}

// ---------- ตัวสแกน (รับ Map เพื่อทดสอบด้วยซอร์สปลอมได้) ----------

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*;?/gm, '')

/** อาร์กิวเมนต์ (ข้อความดิบในวงเล็บ) ของทุกการเรียก name( — นับวงเล็บซ้อน ไม่ใช่ regex ข้ามคำสั่ง
 *  `(?<!function\s+)` = ประกาศฟังก์ชันชื่อนั้นเองไม่นับเป็นการเรียก (ไม่งั้นไฟล์ที่ "นิยาม" ตัวหาร้านถูกนับว่า "ใช้") */
function callArgs(code: string, names: readonly string[]): { name: string; args: string }[] {
  const out: { name: string; args: string }[] = []
  const rx = new RegExp(`(?<![\\w.])(?<!function\\s+)(${names.join('|')})\\s*\\(`, 'g')
  for (let m = rx.exec(code); m; m = rx.exec(code)) {
    let depth = 1, i = rx.lastIndex
    for (; i < code.length && depth > 0; i++) depth += code[i] === '(' ? 1 : code[i] === ')' ? -1 : 0
    out.push({ name: m[1], args: code.slice(rx.lastIndex, i - 1) })
  }
  return out
}

const callsOf = (code: string, names: readonly string[]) => [...new Set(callArgs(code, names).map((c) => c.name))]

/** ตัดจากจุดประกาศถึงประกาศระดับบนสุดถัดไป (function/const/export/class ที่ชิดขอบซ้าย) —
 *  helper ที่ไม่ได้ export คั่นระหว่าง handler จึงไม่ถูกนับเป็นเนื้อของ handler ก่อนหน้า */
const topLevelSlice = (rest: string) => {
  const next = rest.search(/\n(?:export|async\s+function|function|const|let|class)\s/)
  return next === -1 ? rest : rest.slice(0, next)
}

/** เนื้อของประกาศชื่อ name (ไม่ต้อง export) — ใช้ตามรอย `export { handler as GET }` / `export const POST = GET` */
function declBody(code: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\n)[ \\t]*(?:export\\s+)?(?:async\\s+function|function|const|let)\\s+${name}\\b`).exec(code)
  return m ? topLevelSlice(code.slice(m.index + m[0].length)) : null
}

/** `export { a as GET, b }` — รายการ specifier + มี `from` (re-export จากไฟล์อื่น) หรือไม่ */
function exportLists(code: string): { local: string; exported: string; reexport: boolean }[] {
  const out: { local: string; exported: string; reexport: boolean }[] = []
  const rx = /export\s*\{([^}]*)\}(\s*from\s*['"][^'"]+['"])?/g
  for (let m = rx.exec(code); m; m = rx.exec(code)) {
    for (const part of m[1].split(',')) {
      const sp = /^\s*(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(part)
      if (sp) out.push({ local: sp[1], exported: sp[2] ?? sp[1], reexport: !!m[2] })
    }
  }
  return out
}

/**
 * เนื้อ handler ของ method หนึ่ง — รองรับทุกรูปการ export ที่ Next ยอมรับ (หนี้ T1 → T10):
 *   export [async] function GET · export const GET = … · export { handler as GET } · export const POST = GET (alias)
 * re-export จากไฟล์อื่น (`export { GET } from './x'`) = มองไม่เห็นเนื้อ → คืน '' (ด่านไม่ปรากฏ = เทสแดง ไม่ใช่เงียบ)
 * null = ไฟล์ไม่ export method นี้
 */
function methodBody(code: string, method: string): string | null {
  let body: string | null = null
  const m = new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${method}\\b|const\\s+${method}\\b)`).exec(code)
  if (m) body = topLevelSlice(code.slice(m.index + m[0].length))
  else {
    const spec = exportLists(code).find((e) => e.exported === method)
    if (!spec) return null
    body = spec.reexport ? '' : (declBody(code, spec.local) ?? '')
  }
  // alias: `export const POST = GET` → เนื้อของ GET
  for (let hop = 0; hop < 3; hop++) {
    const alias = /^\s*=\s*(\w+)\s*;?\s*$/.exec(body)
    if (!alias) break
    body = declBody(code, alias[1]) ?? ''
  }
  return body
}

const exportedMethods = (code: string) => METHODS.filter((m) => methodBody(code, m) !== null)

const isRouteOrPage = (p: string) =>
  (/^src\/app\/api\/.*\/route\.ts$/.test(p) || /^src\/app\/\(paces\)\/seller\/(.*\/)?(page|layout)\.tsx$/.test(p)) &&
  !/\.test\.tsx?$/.test(p) && !p.includes('/__tests__/')

// ชื่อไฟล์ที่ "ดูเป็น wrapper" — ถ้าเรียกตัวหาร้านดิบต้องอยู่ allow-list เสมอ (ไม่ต้องรอให้ route import)
const isWrapperFile = (p: string) =>
  (/^src\/app\/api\/.*\/(_[^/]*\.ts|[^/]*-guard\.ts|[^/]*route-context[^/]*\.ts)$/.test(p) ||
    /^src\/lib\/[^/]*route-context[^/]*\.ts$/.test(p) || p === 'src/lib/line-report/active-shop.ts') &&
  !p.includes('/__tests__/') && !/\.test\.tsx?$/.test(p)

/** helper ใดก็ได้ใต้ src/lib และ src/app/api (ชื่ออะไรก็ได้) ที่ไม่ใช่ route/หน้า/เทส — ตัวเลือกของ "wrapper ที่ชื่อไม่ตรงแบบ" */
const isHelperCandidate = (p: string) =>
  /^src\/(lib|app\/api)\/.+\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) && !p.includes('/__tests__/') &&
  !isRouteOrPage(p) && !/\/(route|page|layout)\.tsx?$/.test(p)

/** ไฟล์ที่ route/หน้า import ตรง ๆ (relative หรือ `@/`) — ใช้ตัดสินว่า helper ที่ชื่อไม่ตรงแบบ "อยู่ในเส้นทางของ route" จริง */
function importedByRoutes(sources: ReadonlyMap<string, string>): Set<string> {
  const out = new Set<string>()
  for (const [path, src] of sources) {
    if (!isRouteOrPage(path)) continue
    const rx = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g
    for (let m = rx.exec(src); m; m = rx.exec(src)) {
      const spec = m[1]
      const base = spec.startsWith('@/') ? posix.join('src', spec.slice(2)) : spec.startsWith('.') ? posix.join(posix.dirname(path), spec) : null
      if (!base) continue
      for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) if (sources.has(c)) out.add(c)
    }
  }
  return out
}

const definedNames = (code: string) =>
  new Set([...code.matchAll(/(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]))

const capsOf = (c: Caps): string[] => (typeof c === 'string' ? [c] : [...c])

/** ด่านระดับบัญชีของคลาส SELF — เมธอดต้องเรียก requireAccess(literal level ตรงทะเบียน) · หน้าต้องเรียก resolveReportAccess */
function accountViolations(path: string, code: string, account: AccountGate): string[] {
  const v: string[] = []
  if (path.endsWith('/route.ts')) {
    const declared = METHODS.filter((m) => account[m] !== undefined)
    for (const m of exportedMethods(code)) if (!declared.includes(m)) v.push(`UNDECLARED_METHOD ${path} ${m}`)
    for (const m of declared) {
      const body = methodBody(code, m)
      if (body === null) { v.push(`STALE_METHOD ${path} ${m}`); continue }
      const level = account[m]
      if (!callArgs(body, ['requireAccess']).some((g) => new RegExp(`['"\`]${level}['"\`]`).test(g.args))) {
        v.push(`ACCOUNT_GATE_MISSING ${path} ${m} expects requireAccess('${level}')`)
      }
    }
  } else if (account.page && callsOf(code, ['resolveReportAccess']).length === 0) {
    v.push(`ACCOUNT_GATE_MISSING ${path} page expects resolveReportAccess`)
  }
  return v
}

export function scan(
  sources: ReadonlyMap<string, string>,
  entryOf: (p: string) => RouteEntry | undefined,
  registryKeys: readonly string[],
  wrappers: Record<string, string>,
  opts: { checkStale: boolean },
): string[] {
  const v: string[] = []
  const imported = importedByRoutes(sources)
  for (const [path, src] of sources) {
    const code = stripComments(src)
    if (isWrapperFile(path) || isHelperCandidate(path)) {
      const defined = definedNames(code)
      const used = callsOf(code, RESOLVERS.filter((n) => !defined.has(n)))
      // ชื่อตรงแบบ wrapper = บังคับ allow-list เสมอ · ชื่ออื่น = บังคับเมื่อมี route/หน้า import (อยู่ในเส้นทางตัดสินสิทธิ์จริง)
      if (used.length && (isWrapperFile(path) || imported.has(path)) && !(path in wrappers)) v.push(`WRAPPER_NOT_ALLOWLISTED ${path} → ${used.join(',')}`)
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
        const allowed = [...CLASS_ALLOWED[entry.class], ...(entry.class === 'SELF' && entry.account ? [...ACCOUNT_GATES, ...ACCOUNT_DISPLAY_ONLY] : [])]
        const bad = callsOf(code, RESOLVERS).filter((n) => !allowed.includes(n))
        if (bad.length) v.push(`CLASS_CALLS_RAW_RESOLVER ${path} [${entry.class}] → ${bad.join(',')}`)
        if (entry.account) {
          if (entry.class !== 'SELF') v.push(`ACCOUNT_GATE_ON_NON_SELF ${path} [${entry.class}]`)
          else v.push(...accountViolations(path, code, entry.account))
        }
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
    const targets: [string, string | null, Caps | MethodClass | undefined][] = path.endsWith('/route.ts')
      ? declaredMethods.map((m) => [m, methodBody(code, m), entry[m]])
      : [['page', code, entry.page]]
    for (const [label, body, caps] of targets) {
      if (body === null || caps === undefined) continue
      if (isMethodClass(caps)) {
        // คลาสรายเมธอด (เช่น POST = BUYER): เมธอดนั้นห้ามเรียกตัวหาร้านนอกที่คลาสอนุญาต
        const bad = callsOf(body, RESOLVERS).filter((n) => !CLASS_ALLOWED[caps.class].includes(n))
        if (bad.length) v.push(`CLASS_CALLS_RAW_RESOLVER ${path} ${label} [${caps.class}] → ${bad.join(',')}`)
        continue
      }
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

// ---------- ด่านของคลาสตามคำนำหน้า (admin / cron / webhook) ----------
// คลาสพวกนี้ข้ามด่านร้านโดยตั้งใจ — จึงต้องพิสูจน์ว่าแต่ละไฟล์เรียก "ด่านของตัวเอง" จริง ไม่ใช่แค่ถูกจัดหมวด (หนี้ T1 → T10)
// scope: 'method' = ทุก handler ที่ export ต้องมี · 'file' = มีที่ไหนก็ได้ในไฟล์ (webhook: GET ยืนยัน token กับ POST ตรวจลายเซ็นคนละด่าน)
// `src/app/api/app/` (BUYER) ไม่อยู่ในรายการ: ผสมเส้นทางสาธารณะ (search/categories/auth) กับเส้นทางที่ต้อง Bearer — ต้องคัดรายไฟล์ ไม่ใช่กฎคำนำหน้า
type PrefixGuard = { prefix: string; scope: 'method' | 'file'; rx: RegExp; what: string; skip?: string[] }
export const PREFIX_GUARDS: PrefixGuard[] = [
  { prefix: 'src/app/api/admin/', scope: 'method', rx: /(?<![\w.])(?<!function\s+)requireAdmin(?:Actor)?\s*\(/, what: 'admin session — requireAdmin/requireAdminActor' },
  { prefix: 'src/app/api/cron/', scope: 'method', rx: /process\.env\.CRON_SECRET/, what: 'CRON_SECRET (Authorization: Bearer)' },
  { prefix: 'src/app/api/webhooks/', scope: 'file', rx: /(?<![\w.])(?<!function\s+)(?:timingSafeEqual|verifyAppleJws)\s*(?:<[^>]*>)?\s*\(/, what: 'secret ใน path เทียบแบบ timing-safe (iShip) หรือลายเซ็น JWS ของ Apple' },
  { prefix: 'src/app/api/channels/facebook/webhook/', scope: 'file', rx: /(?<![\w.])(?<!function\s+)(?:verifyWebhookSignature|timingSafeEqual)\s*\(/, what: 'ลายเซ็น x-hub-signature ของ Meta' },
  { prefix: 'src/app/api/channels/line/webhook/', scope: 'file', rx: /(?<![\w.])(?<!function\s+)validateSignature\s*\(/, what: 'ลายเซ็น x-line-signature' },
  { prefix: 'src/app/api/line-report/webhook/', scope: 'file', rx: /(?<![\w.])(?<!function\s+)validateSignature\s*\(/, what: 'ลายเซ็น x-line-signature (OA กลาง)' },
]
// หน้าแอดมิน: ต้องเรียก requireAdmin() ในหน้าเอง ก่อนดึงข้อมูล
const ADMIN_PAGE_PREFIX = 'src/app/(paces)/admin/'
const ADMIN_PAGE_SKIP = ['src/app/(paces)/admin/auth/'] // หน้า sign-in/verify-otp ของแอดมิน — ก่อนล็อกอิน
const ADMIN_PAGE_GUARD = /(?<![\w.])(?<!function\s+)requireAdmin\s*\(/
// การดึงข้อมูลแรก: prisma.* หรือ await อะไรก็ตามที่ไม่ใช่ guard/params/searchParams (service call ทุกแบบ)
const ADMIN_PAGE_DATA = /\bprisma\.|\bawait\s+(?!requireAdmin\b|params\b|searchParams\b)/

export function scanPrefixGuards(sources: ReadonlyMap<string, string>): string[] {
  const v: string[] = []
  for (const [path, src] of sources) {
    const code = stripComments(src)
    for (const g of PREFIX_GUARDS) {
      if (!path.startsWith(g.prefix) || !/\/route\.ts$/.test(path) || /\.test\.tsx?$/.test(path)) continue
      if (g.scope === 'file') {
        if (!g.rx.test(code)) v.push(`PREFIX_GUARD_MISSING ${path} expects ${g.what}`)
        continue
      }
      for (const m of exportedMethods(code)) {
        const body = methodBody(code, m) ?? ''
        if (!g.rx.test(body)) v.push(`PREFIX_GUARD_MISSING ${path} ${m} expects ${g.what}`)
      }
    }
    if (path.startsWith(ADMIN_PAGE_PREFIX) && /\/page\.tsx$/.test(path) && !ADMIN_PAGE_SKIP.some((s) => path.startsWith(s))) {
      // ด่านต้องอยู่ในหน้าเอง และมาก่อนการดึงข้อมูลแรกใน default export — layout ถูกข้ามได้ตอน client navigation
      // (partial rendering) ฉะนั้น layout ที่ตรวจ isAdmin ไม่นับเป็นด่านของหน้า (00071 P3 security review)
      const start = code.search(/export default (async )?function/)
      const body = start < 0 ? code : code.slice(start)
      const g = body.search(ADMIN_PAGE_GUARD)
      const d = body.search(ADMIN_PAGE_DATA)
      if (g < 0) v.push(`PREFIX_GUARD_MISSING ${path} expects requireAdmin() ในหน้าเอง (layout ไม่นับ)`)
      else if (d >= 0 && d < g) v.push(`PREFIX_GUARD_MISSING ${path} requireAdmin() ต้องมาก่อนการดึงข้อมูลแรก`)
    }
  }
  return v
}

/** รายการทะเบียนที่ยังเป็น PENDING — ปิดงาน T10 ต้องว่าง (เพิ่มรายการใหม่เป็น PENDING = เทสแดง) */
export const pendingKeys = (reg: Record<string, RouteEntry>) =>
  Object.entries(reg).filter(([, e]) => e.status === 'PENDING').map(([k]) => k)

// ---------- โหลดต้นไม้จริง ----------
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const isPrefixSurface = (p: string) =>
  PREFIX_GUARDS.some((g) => p.startsWith(g.prefix) && /\/route\.ts$/.test(p)) ||
  (p.startsWith(ADMIN_PAGE_PREFIX) && /\/(page|layout)\.tsx$/.test(p))

function loadReal(): Map<string, string> {
  const m = new Map<string, string>()
  for (const abs of [...walk(join(ROOT, 'src/app')), ...walk(join(ROOT, 'src/lib'))]) {
    const p = relative(ROOT, abs).split('\\').join('/')
    if (!/\.tsx?$/.test(p) || /\.test\.tsx?$/.test(p) || p.includes('/__tests__/')) continue
    if (isRouteOrPage(p) || isWrapperFile(p) || isHelperCandidate(p) || isPrefixSurface(p)) m.set(p, readFileSync(abs, 'utf8'))
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
        if (c === undefined) continue
        if (isMethodClass(c)) {
          if (!c.reason.trim()) bad.push(`NO_REASON ${p} ${k}`)
          continue
        }
        for (const cap of capsOf(c)) if (!known.has(cap)) bad.push(`UNKNOWN_CAP ${p} ${k} ${cap}`)
      }
    }
    for (const c of PREFIX_CLASSES) if (!c.reason.trim()) bad.push(`NO_REASON prefix ${c.prefix}`)
    expect(bad).toEqual([])
  })

  it('[T10] ทะเบียนไม่เหลือ PENDING — ทุก route/หน้าย้ายเข้าด่านกลาง หรือจัดคลาสพร้อมเหตุผล', () => {
    expect(Object.values(ROUTE_CAPABILITIES).length).toBeGreaterThan(250)
    expect(pendingKeys(ROUTE_CAPABILITIES)).toEqual([])
  })

  it('คลาสตามคำนำหน้า (admin/cron/webhook) เรียกด่านของตัวเองจริงทุกไฟล์', () => {
    const surfaces = [...real.keys()].filter(isPrefixSurface)
    expect(surfaces.length).toBeGreaterThan(40) // กันตัวสแกนเงียบ: admin API + cron + webhook + หน้าแอดมิน
    expect(scanPrefixGuards(real)).toEqual([])
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

  // ---------- T10: รูปการ export ของ handler ----------
  it('M14 `export { handler as GET }` — อ่านเนื้อ handler จริง: มีด่านผ่าน · ไม่มีด่านแดง', () => {
    const ok = `async function handler() {\n  await requireShopCapability(s, 'O1')\n}\nexport { handler as GET }`
    const bad = `async function handler() {\n  return Response.json({})\n}\nexport { handler as GET }`
    expect(run(ok, decl('O1'))).toEqual([])
    expect(run(bad, decl('O1'))).toEqual([expect.stringContaining('GUARD_MISSING')])
  })

  it('M14b `export { GET, POST }` (ชื่อเดียวกัน) ถูกนับเป็น method ที่ export — ไม่ประกาศในทะเบียน = UNDECLARED_METHOD', () => {
    const src = `async function GET() { await requireShopCapability(s, 'O1') }\nasync function POST() { return 1 }\nexport { GET, POST }`
    expect(run(src, decl('O1'))).toEqual([expect.stringContaining('UNDECLARED_METHOD')])
  })

  it('M14c re-export จากไฟล์อื่น `export { GET } from` — มองเนื้อไม่เห็น → ด่านไม่ปรากฏ = แดง (ไม่ใช่เงียบ)', () => {
    expect(run(`export { GET } from '../other/route'`, decl('O1'))).toEqual([expect.stringContaining('GUARD_MISSING')])
  })

  it('M14d alias `export const POST = GET` ตามรอยไปที่เนื้อของ GET', () => {
    const ok = `export async function GET() { await requireShopCapability(s, 'O1') }\nexport const POST = GET`
    const bad = `export async function GET() { return 1 }\nexport const POST = GET`
    expect(run(ok, { GET: 'O1', POST: 'O1', status: 'DECLARED' })).toEqual([])
    expect(run(bad, { GET: 'O1', POST: 'O1', status: 'DECLARED' })).toEqual([expect.stringContaining('GUARD_MISSING'), expect.stringContaining('GUARD_MISSING')])
  })

  it('M15 `export const GET = wrap(async () => …)` — ด่านในตัวห่อถูกนับ · ไม่มีแดง', () => {
    const ok = `export const GET = wrap(async () => {\n  await requireShopCapability(s, 'O1')\n})`
    const bad = `export const GET = wrap(async () => {\n  return 1\n})`
    expect(run(ok, decl('O1'))).toEqual([])
    expect(run(bad, decl('O1'))).toEqual([expect.stringContaining('GUARD_MISSING')])
  })

  // ---------- T10: คลาสรายเมธอด ----------
  const mixed: RouteEntry = { POST: { class: 'BUYER', reason: 'ผู้ซื้อเริ่มแชท' }, GET: 'H1', status: 'DECLARED' }
  it('M16 คลาสรายเมธอด: POST = BUYER ไม่เรียกตัวหาร้านก็ผ่าน · GET = H1 ต้องมีด่าน', () => {
    const ok = `export async function POST() { return getOrCreateConversation(u, s) }\nexport async function GET() { await resolveChatScope(s, 'H1') }`
    expect(run(ok, mixed)).toEqual([])
  })

  it('M16b เมธอดคลาส BUYER เรียก requireShopCapability/canAccessShop → CLASS_CALLS_RAW_RESOLVER · GET ไร้ด่านก็แดงแยกกัน', () => {
    const bad = `export async function POST() { await requireShopCapability(s, 'H2') }\nexport async function GET() { return 1 }`
    expect(run(bad, mixed)).toEqual([expect.stringContaining('GUARD_MISSING'), expect.stringContaining('CLASS_CALLS_RAW_RESOLVER')])
  })

  // ---------- T10: ด่านระดับบัญชีของ SELF ----------
  const acct = (account: AccountGate): RouteEntry => ({ class: 'SELF', reason: 'x', status: 'DECLARED', account })
  const ACCT_OK = `export const GET = handle(async () => json(await listGroups(await requireAccess('READ'))))`

  it('M17 SELF+account: requireAccess ระดับตรงทะเบียนผ่าน', () => {
    expect(run(ACCT_OK, acct({ GET: 'READ' }))).toEqual([])
  })

  it('M17b ระดับไม่ตรง (ทะเบียน PAID ที่โค้ดเรียก READ) → ACCOUNT_GATE_MISSING', () => {
    expect(run(ACCT_OK, acct({ GET: 'PAID' }))).toEqual([expect.stringContaining('ACCOUNT_GATE_MISSING')])
  })

  it('M17c ไม่เรียกด่านบัญชีเลย → แดง', () => {
    expect(run(`export const GET = handle(async () => json(1))`, acct({ GET: 'READ' }))).toEqual([expect.stringContaining('ACCOUNT_GATE_MISSING')])
  })

  it('M17d method ที่ export แต่ไม่ประกาศใน account → UNDECLARED_METHOD', () => {
    const src = `${ACCT_OK}\nexport const DELETE = handle(async () => json(1))`
    expect(run(src, acct({ GET: 'READ' }))).toEqual([expect.stringContaining('UNDECLARED_METHOD')])
  })

  it('M17e ไม่ทำให้ด่านอื่นอ่อน: SELF ที่ไม่ประกาศ account เรียก requireAccess → แดง · รายการ cap ใช้ requireAccess แทนด่านร้านไม่ได้', () => {
    expect(run(ACCT_OK, { class: 'SELF', reason: 'x', status: 'DECLARED' })).toEqual([expect.stringContaining('CLASS_CALLS_RAW_RESOLVER')])
    expect(run(ACCT_OK, { GET: 'O1', status: 'DECLARED' })).toEqual([expect.stringContaining('GUARD_MISSING')])
    expect(run(ACCT_OK, { class: 'MEMBER', reason: 'x', status: 'DECLARED', account: { GET: 'READ' } })).toEqual(
      expect.arrayContaining([expect.stringContaining('ACCOUNT_GATE_ON_NON_SELF')]),
    )
  })

  it('M17f SELF+account เรียก requireShopCapability/canAccessShop ปน → แดง (ไม่ได้สิทธิ์พิเศษ)', () => {
    const src = `export const GET = handle(async () => { await requireAccess('READ'); await canAccessShop(a, b) })`
    expect(run(src, acct({ GET: 'READ' }))).toEqual([expect.stringContaining('CLASS_CALLS_RAW_RESOLVER')])
  })

  it('M17g หน้า SELF+account ต้องเรียก resolveReportAccess', () => {
    const page = 'src/app/(paces)/seller/(dashboard)/fake/page.tsx'
    expect(run(`export default async function P() { await resolveReportAccess(session) }`, acct({ page: 'OWNER' }), page)).toEqual([])
    expect(run(`export default async function P() { return null }`, acct({ page: 'OWNER' }), page)).toEqual([expect.stringContaining('ACCOUNT_GATE_MISSING')])
  })

  // ---------- T10: wrapper ที่ชื่อไม่ตรงแบบ ----------
  const ROUTE = 'src/app/api/fake/route.ts'
  const HELPER = 'src/lib/fake-tenant-helper.ts'
  const routeImports = `import { tenant } from '@/lib/fake-tenant-helper'\nexport async function GET() { await requireShopCapability(s, 'O1') }`
  const helperSrc = `export async function tenant() { return requireActiveShop(session) }`
  const scanMulti = (files: [string, string][], wrappers: Record<string, string> = {}) =>
    scan(new Map(files), (p) => (p === ROUTE ? ({ GET: 'O1', status: 'DECLARED' } as RouteEntry) : undefined), [], wrappers, { checkStale: false })

  it('M18 helper ชื่ออะไรก็ได้ใต้ src/lib ที่เรียกตัวหาร้านดิบ + route import → WRAPPER_NOT_ALLOWLISTED', () => {
    expect(scanMulti([[ROUTE, routeImports], [HELPER, helperSrc]])).toEqual([expect.stringContaining(`WRAPPER_NOT_ALLOWLISTED ${HELPER}`)])
  })

  it('M18b ขึ้น allow-list แล้วผ่าน · ไม่มี route import → ไม่ใช่ wrapper ของใคร · ไม่เรียกตัวหาร้านเลย → ไม่เกี่ยว', () => {
    expect(scanMulti([[ROUTE, routeImports], [HELPER, helperSrc]], { [HELPER]: 'เหตุผล' })).toEqual([])
    expect(scanMulti([[ROUTE, `export async function GET() { await requireShopCapability(s, 'O1') }`], [HELPER, helperSrc]])).toEqual([])
    expect(scanMulti([[ROUTE, routeImports], [HELPER, `export const tenant = () => 1`]])).toEqual([])
  })

  it('M18c import แบบ relative และ dynamic import ก็นับ · ไฟล์ที่ "นิยาม" ตัวหาร้านเองไม่ถูกนับว่าเรียก', () => {
    const rel = `import { t } from '../../lib/fake-tenant-helper'\nexport async function GET() { await requireShopCapability(s, 'O1') }`
    expect(scanMulti([['src/app/api/fake/route.ts', rel.replace('../../lib', '../../../lib')], [HELPER, helperSrc]])).toEqual([expect.stringContaining('WRAPPER_NOT_ALLOWLISTED')])
    const dyn = `export async function GET() { const m = await import('@/lib/fake-tenant-helper'); await requireShopCapability(s, 'O1') }`
    expect(scanMulti([[ROUTE, dyn], [HELPER, helperSrc]])).toEqual([expect.stringContaining('WRAPPER_NOT_ALLOWLISTED')])
    expect(scanMulti([[ROUTE, routeImports], [HELPER, `export async function requireActiveShop(s) { return 1 }`]])).toEqual([])
  })

  // ---------- T10: ด่านของคลาสตามคำนำหน้า ----------
  const pg = (files: [string, string][]) => scanPrefixGuards(new Map(files))
  const ADMIN = 'src/app/api/admin/fake/route.ts'
  const CRON = 'src/app/api/cron/fake/route.ts'
  const WH = 'src/app/api/webhooks/fake/route.ts'
  const APAGE = 'src/app/(paces)/admin/(dashboard)/fake/page.tsx'
  const ALAYOUT = 'src/app/(paces)/admin/(dashboard)/layout.tsx'

  it('M19 admin API: ทุก handler ต้องเรียก requireAdmin/requireAdminActor', () => {
    expect(pg([[ADMIN, `export async function GET() { await requireAdmin() }\nexport async function POST() { await requireAdminActor() }`]])).toEqual([])
    expect(pg([[ADMIN, `export async function GET() { await requireAdmin() }\nexport async function POST() { return 1 }`]])).toEqual([expect.stringContaining('POST')])
    expect(pg([[ADMIN, `export async function GET() { // requireAdmin()\n  return 1 }`]])).toEqual([expect.stringContaining('PREFIX_GUARD_MISSING')])
  })

  it('M19b cron: ต้องอ่าน CRON_SECRET · POST = GET ตามรอย alias', () => {
    const ok = `export async function GET() { const s = process.env.CRON_SECRET }\nexport const POST = GET`
    expect(pg([[CRON, ok]])).toEqual([])
    expect(pg([[CRON, `export async function GET() { return 1 }\nexport const POST = GET`]])).toEqual([expect.stringContaining('GET'), expect.stringContaining('POST')])
  })

  it('M19c webhook: ต้องมีการตรวจลายเซ็น/secret ในไฟล์ · generic ของ verifyAppleJws<T>(…) นับ', () => {
    expect(pg([[WH, `export async function POST() { const v = verifyAppleJws<X>(p) }`]])).toEqual([])
    expect(pg([[WH, `export async function POST() { if (!timingSafeEqual(a, b)) return 1 }`]])).toEqual([])
    expect(pg([[WH, `export async function POST() { return 1 }`]])).toEqual([expect.stringContaining('PREFIX_GUARD_MISSING')])
  })

  it('M19d หน้าแอดมิน: requireAdmin ในหน้าเอง ก่อนดึงข้อมูล · layout ไม่นับ', () => {
    const page = `export default async function P() { return null }`
    const layoutOk = `export default async function L() { if (!user.isAdmin) redirect('/auth/sign-in') }`
    expect(pg([[APAGE, page], [ALAYOUT, layoutOk]])).toEqual([expect.stringContaining('PREFIX_GUARD_MISSING')])
    expect(pg([[APAGE, page]])).toEqual([expect.stringContaining('PREFIX_GUARD_MISSING')])
    expect(pg([[APAGE, `export default async function P() { const a = user.isAdmin }`]])).toEqual([expect.stringContaining('PREFIX_GUARD_MISSING')])
    expect(pg([[APAGE, `export default async function P() { await requireAdmin() }`]])).toEqual([])
    expect(pg([[APAGE, `async function h() { await prisma.x.findMany() }\nexport default async function P() { await requireAdmin(); await prisma.x.findMany() }`]])).toEqual([])
    expect(pg([[APAGE, `export default async function P() { const r = await prisma.x.findMany(); await requireAdmin() }`]])).toEqual([expect.stringContaining('ก่อนการดึงข้อมูล')])
    expect(pg([[APAGE, `export default async function P() { const r = await getStuff(); await requireAdmin() }`]])).toEqual([expect.stringContaining('ก่อนการดึงข้อมูล')])
  })

  it('M20 ทะเบียนที่ยังเหลือ PENDING → pendingKeys คืนรายการนั้น', () => {
    expect(pendingKeys({ a: { GET: 'O1', status: 'PENDING' }, b: { GET: 'O1', status: 'DECLARED' } })).toEqual(['a'])
    expect(pendingKeys({})).toEqual([])
  })
})

