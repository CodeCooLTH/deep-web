# CSRF + Rate-Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม CSRF (Origin-check) + general rate-limit (per-IP) ระดับแอปบน custom API ของ Deep/SafePay ก่อนเปิด prod (NFR-2.2/2.3, ปิด PRD §11 #11)

**Architecture:** enforce รวมศูนย์ใน `src/proxy.ts` (Next 16 middleware = nodejs runtime). แยก pure logic เป็น 2 lib (`csrf-origin.ts`, `api-rate-limit.ts`) ที่ทดสอบอิสระได้ แล้ว proxy เรียกใช้ใน branch `/api`. otp/sms rate-limit เดิมคงไว้ที่ route handler.

**Tech Stack:** Next.js 16 proxy (`next/server`), `next-auth/jwt` getToken, in-memory globalThis Map, Vitest

อ้างอิง spec: `docs/superpowers/specs/2026-06-06-csrf-ratelimit-design.md`

---

## File Structure

| ไฟล์ | responsibility | ใหม่/แก้ |
|---|---|---|
| `src/lib/csrf-origin.ts` | `isAllowedOrigin(origin, isProd?)` — pure, allowlist by hostname suffix | Create |
| `src/lib/csrf-origin.test.ts` | unit test ของ isAllowedOrigin | Create |
| `src/lib/api-rate-limit.ts` | `checkApiRateLimit(key,max,windowMs)` globalThis sliding-window + `clientIp(req)` | Create |
| `src/lib/api-rate-limit.test.ts` | unit test ของ checkApiRateLimit + clientIp | Create |
| `src/proxy.ts` | wire `guardApi()` เข้า branch `/api` (แทน early-return skip), เก็บ subdomain routing เดิม | Modify (บรรทัด 10-13 + เพิ่ม import + function) |

---

## Task 1: CSRF origin allowlist (`csrf-origin.ts`)

**Files:**
- Create: `src/lib/csrf-origin.ts`
- Test: `src/lib/csrf-origin.test.ts`

- [ ] **Step 1: เขียน failing test**

`src/lib/csrf-origin.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isAllowedOrigin } from './csrf-origin'

describe('isAllowedOrigin (prod)', () => {
  const prod = true
  it('allow root deepthailand.app', () => {
    expect(isAllowedOrigin('https://deepthailand.app', prod)).toBe(true)
  })
  it('allow subdomain seller/admin', () => {
    expect(isAllowedOrigin('https://seller.deepthailand.app', prod)).toBe(true)
    expect(isAllowedOrigin('https://admin.deepthailand.app', prod)).toBe(true)
  })
  it('deny suffix-spoof deepthailand.app.evil.com', () => {
    expect(isAllowedOrigin('https://deepthailand.app.evil.com', prod)).toBe(false)
  })
  it('deny prefix-spoof notdeepthailand.app', () => {
    expect(isAllowedOrigin('https://notdeepthailand.app', prod)).toBe(false)
  })
  it('deny unrelated origin', () => {
    expect(isAllowedOrigin('https://evil.com', prod)).toBe(false)
  })
  it('deny null/empty/garbage', () => {
    expect(isAllowedOrigin(null, prod)).toBe(false)
    expect(isAllowedOrigin('', prod)).toBe(false)
    expect(isAllowedOrigin('not-a-url', prod)).toBe(false)
  })
  it('deny dev origin บน prod', () => {
    expect(isAllowedOrigin('http://seller.deepth.local:3001', prod)).toBe(false)
  })
})

describe('isAllowedOrigin (dev)', () => {
  const dev = false
  it('allow *.deepth.local ทุก port', () => {
    expect(isAllowedOrigin('http://seller.deepth.local:3001', dev)).toBe(true)
    expect(isAllowedOrigin('http://deepth.local:4000', dev)).toBe(true)
  })
  it('ยัง allow prod domain ใน dev', () => {
    expect(isAllowedOrigin('https://deepthailand.app', dev)).toBe(true)
  })
  it('ยัง deny evil ใน dev', () => {
    expect(isAllowedOrigin('https://evil.com', dev)).toBe(false)
  })
})
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npx vitest run src/lib/csrf-origin.test.ts`
Expected: FAIL — "Failed to resolve import './csrf-origin'"

- [ ] **Step 3: เขียน implementation**

`src/lib/csrf-origin.ts`:
```ts
// CSRF protection (NFR-2.2) — stateless Origin-header allowlist
// prod = deepthailand.app + subdomain เท่านั้น; dev (non-prod) = + deepth.local (ทุก port)
// ตรวจด้วย hostname suffix — กัน spoof แบบ deepthailand.app.evil.com / notdeepthailand.app

const PROD_ROOT = 'deepthailand.app'
const DEV_ROOT = 'deepth.local'

/**
 * @param origin - ค่า Origin header (อาจ null/ว่าง/ไม่ใช่ URL)
 * @param isProd - default จาก NODE_ENV; รับ param เพื่อให้ test ฉีดได้
 * @returns true = origin อยู่ใน allowlist
 */
export function isAllowedOrigin(
  origin: string | null | undefined,
  isProd: boolean = process.env.NODE_ENV === 'production',
): boolean {
  if (!origin) return false
  let host: string
  try {
    host = new URL(origin).hostname
  } catch {
    return false
  }
  const matches = (root: string) => host === root || host.endsWith('.' + root)
  if (matches(PROD_ROOT)) return true
  if (!isProd && matches(DEV_ROOT)) return true
  return false
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx vitest run src/lib/csrf-origin.test.ts`
Expected: PASS (16 assertions)

- [ ] **Step 5: Commit**

```bash
git add src/lib/csrf-origin.ts src/lib/csrf-origin.test.ts
git commit -m "feat(security): isAllowedOrigin CSRF allowlist (NFR-2.2)

Base: spec docs/superpowers/specs/2026-06-06-csrf-ratelimit-design.md
hostname-suffix match กัน spoof; dev เปิด deepth.local เฉพาะ non-prod

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: In-memory rate-limit (`api-rate-limit.ts`)

**Files:**
- Create: `src/lib/api-rate-limit.ts`
- Test: `src/lib/api-rate-limit.test.ts`

- [ ] **Step 1: เขียน failing test**

`src/lib/api-rate-limit.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkApiRateLimit, clientIp } from './api-rate-limit'

describe('checkApiRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('ผ่านครบ max ครั้ง แล้วครั้งถัดไป fail', () => {
    const key = 't1-' + Math.random() // key เฉพาะ test (store เป็น globalThis singleton)
    for (let i = 0; i < 3; i++) expect(checkApiRateLimit(key, 3, 60_000)).toBe(true)
    expect(checkApiRateLimit(key, 3, 60_000)).toBe(false)
  })

  it('reset หลังพ้น window', () => {
    const key = 't2-' + Math.random()
    for (let i = 0; i < 3; i++) checkApiRateLimit(key, 3, 60_000)
    expect(checkApiRateLimit(key, 3, 60_000)).toBe(false)
    vi.advanceTimersByTime(61_000) // เลย window
    expect(checkApiRateLimit(key, 3, 60_000)).toBe(true)
  })

  it('แยก bucket ต่อ key', () => {
    const a = 'a-' + Math.random(), b = 'b-' + Math.random()
    expect(checkApiRateLimit(a, 1, 60_000)).toBe(true)
    expect(checkApiRateLimit(a, 1, 60_000)).toBe(false)
    expect(checkApiRateLimit(b, 1, 60_000)).toBe(true) // b ไม่โดน a
  })
})

describe('clientIp', () => {
  const mk = (h: Record<string, string>) =>
    ({ headers: new Headers(h) }) as unknown as Request
  it('x-real-ip มาก่อน', () => {
    expect(clientIp(mk({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4')
  })
  it('fallback x-forwarded-for leftmost', () => {
    expect(clientIp(mk({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8')
  })
  it('ไม่มี header → unknown', () => {
    expect(clientIp(mk({}))).toBe('unknown')
  })
})
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npx vitest run src/lib/api-rate-limit.test.ts`
Expected: FAIL — "Failed to resolve import './api-rate-limit'"

- [ ] **Step 3: เขียน implementation**

`src/lib/api-rate-limit.ts`:
```ts
// General per-IP rate-limit (NFR-2.3) — in-memory globalThis singleton
// pattern เดียวกับ src/lib/sms-consume-rl.ts (route handler เป็นคนละ module instance →
// ต้อง globalThis เพื่อ share ใน process เดียว)
// Known-gap: บน Vercel serverless = best-effort per-instance ไม่ใช่ hard global (Redis = Phase 2)

const g = globalThis as unknown as { apiRlTimestamps?: Map<string, number[]> }
const store = g.apiRlTimestamps ?? (g.apiRlTimestamps = new Map<string, number[]>())

/**
 * sliding-window per key. นับทุก attempt (ไม่ใช่เฉพาะ fail)
 * @returns true = ยังไม่เกิน quota, false = เกิน → caller ตอบ 429
 */
export function checkApiRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs
  const recent = (store.get(key) ?? []).filter((t) => t > cutoff)
  if (recent.length >= max) {
    store.set(key, recent) // trim stale แต่ไม่เพิ่ม slot
    return false
  }
  recent.push(now)
  store.set(key, recent)
  return true
}

/** ดึง client IP จาก header ของ Vercel (x-real-ip ก่อน, fallback x-forwarded-for leftmost) */
export function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return 'unknown'
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx vitest run src/lib/api-rate-limit.test.ts`
Expected: PASS (6 assertions)

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-rate-limit.ts src/lib/api-rate-limit.test.ts
git commit -m "feat(security): in-memory per-IP rate-limit + clientIp (NFR-2.3)

Base: spec docs/superpowers/specs/2026-06-06-csrf-ratelimit-design.md
globalThis sliding-window (pattern sms-consume-rl); known-gap Vercel per-instance

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire guardApi เข้า proxy

**Files:**
- Modify: `src/proxy.ts` (บรรทัด 1-13 + เพิ่ม `guardApi`)

- [ ] **Step 1: เพิ่ม import (บนสุดของไฟล์)**

แก้ block import เดิม:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getSubdomain } from '@/lib/subdomain'
```
เป็น:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getSubdomain } from '@/lib/subdomain'
import { isAllowedOrigin } from '@/lib/csrf-origin'
import { checkApiRateLimit, clientIp } from '@/lib/api-rate-limit'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// CSRF + rate-limit สำหรับ /api (NFR-2.2/2.3) — proxy = nodejs runtime
// ยกเว้น /api/auth/* (NextAuth จัดการ CSRF + session polling เอง)
async function guardApi(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/auth/')) return NextResponse.next()

  // CSRF: Origin-check เฉพาะ mutation (OPTIONS preflight ปล่อยผ่าน)
  if (MUTATION_METHODS.has(request.method)) {
    if (!isAllowedOrigin(request.headers.get('origin'))) {
      return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 })
    }
  }

  // Rate-limit per-IP: unauth 100/min, auth 30/min (แยก bucket ด้วย suffix)
  const token = await getToken({ req: request })
  const limit = token ? 30 : 100
  const key = `${clientIp(request)}:${token ? 'auth' : 'pub'}`
  if (!checkApiRateLimit(key, limit, 60_000)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  return NextResponse.next()
}
```

- [ ] **Step 2: เปลี่ยน early-return skip ของ /api**

แก้ block เดิม (เดิมบรรทัด ~10-13):
```ts
  // Skip internal paths early (no auth checks, no rewrites)
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next()
  }
```
เป็น:
```ts
  // Internal Next paths — ปล่อยผ่าน
  if (pathname.startsWith('/_next')) {
    return NextResponse.next()
  }
  // API — CSRF + rate-limit (ไม่ rewrite, ไม่แตะ subdomain routing)
  if (pathname.startsWith('/api')) {
    return guardApi(request)
  }
```

> ส่วน subdomain routing เดิม (main/seller/admin) **ไม่เปลี่ยน** — ยังทำงานกับ page request เหมือนเดิม

- [ ] **Step 3: type-check**

Run: `npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(security): enforce CSRF + rate-limit บน /api ใน proxy (NFR-2.2/2.3)

Base: spec docs/superpowers/specs/2026-06-06-csrf-ratelimit-design.md
แทน early-return skip /api ด้วย guardApi (Origin-check mutation + per-IP RL);
/api/auth/* ยกเว้น; subdomain routing เดิมไม่เปลี่ยน

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Integration verify (curl negative) + docs

**Files:**
- Modify: `docs/PRD.md` (§11 #11 OPEN → CLOSED)

> ต้องมี dev server รันอยู่ (user start เอง). curl-probe หา SafePay port: ยิง `/api/orders/customers?q=08` ที่ port ต่าง ๆ ตัวที่คืน JSON `{"error":"Unauthorized"}` = SafePay (เช่น 3001). แทน `:PORT` ด้วย port ที่เจอ.

- [ ] **Step 1: CSRF — mutation ไม่มี Origin → 403**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://seller.deepth.local:PORT/api/orders" -H "Content-Type: application/json" -d '{}'
```
Expected: `403` (ไม่มี Origin → CSRF fail ก่อนถึง auth)

- [ ] **Step 2: CSRF — mutation Origin ถูก → ผ่าน guard (ไม่ใช่ 403)**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://seller.deepth.local:PORT/api/orders" -H "Origin: http://seller.deepth.local:PORT" -H "Content-Type: application/json" -d '{}'
```
Expected: ไม่ใช่ `403` (จะเป็น 401/400/422 จาก handler — แปลว่าผ่าน CSRF แล้ว)

- [ ] **Step 3: Rate-limit — ยิง GET เกิน 100/min (unauth) → 429**

Run:
```bash
for i in $(seq 1 110); do curl -s -o /dev/null -w "%{http_code} " "http://seller.deepth.local:PORT/api/orders/customers?q=08"; done; echo
```
Expected: เห็น `401` ช่วงแรก แล้วเปลี่ยนเป็น `429` หลังครบ 100 ครั้ง

- [ ] **Step 4: NextAuth session ไม่โดน rate-limit**

Run:
```bash
for i in $(seq 1 50); do curl -s -o /dev/null -w "%{http_code} " "http://seller.deepth.local:PORT/api/auth/session"; done; echo
```
Expected: `200` ทุกครั้ง (ไม่มี 429 — /api/auth/* ยกเว้น)

- [ ] **Step 5: OTP limit เดิมไม่ regress**

Run:
```bash
for i in $(seq 1 7); do curl -s -o /dev/null -w "%{http_code} " -X POST "http://seller.deepth.local:PORT/api/otp/send" -H "Origin: http://seller.deepth.local:PORT" -H "Content-Type: application/json" -d '{"phone":"0900000000"}'; done; echo
```
Expected: ผ่านช่วงแรกแล้วโดน throttle (429 หรือ error จาก OTP 5/min เดิม) — ยืนยัน special-case limit ยังทำงาน

- [ ] **Step 6: อัปเดต PRD §11 #11**

แก้แถวในตาราง `docs/PRD.md` (ค้นหา "general rate-limit (100/30)"):
```
| 11 | general rate-limit (100/30) + CSRF ยังไม่มี | implement ก่อน prod (NFR-2.2/2.3) | OPEN |
```
เป็น:
```
| 11 | general rate-limit (100/30) + CSRF | ✅ CLOSED 2026-06-06 — Origin-check + per-IP RL ใน proxy.ts (in-memory; Vercel per-instance = known-gap, Redis Phase 2) | CLOSED |
```

- [ ] **Step 7: Commit**

```bash
git add docs/PRD.md
git commit -m "docs(prd): ปิด §11 #11 CSRF + rate-limit (NFR-2.2/2.3 implemented)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review notes

- **Spec coverage:** CSRF Origin-check (Task 1+3) · rate-limit tiers unauth100/auth30 (Task 2+3) · IP source x-real-ip (Task 2) · /api/auth exclude + OPTIONS pass + mutation-only CSRF (Task 3) · otp/sms เดิมคงไว้ (Task 3 ไม่แตะ handler; Task 4 Step 5 verify) · known-gap + PRD update (Task 4). ครบ.
- **Types:** `isAllowedOrigin(origin, isProd?)`, `checkApiRateLimit(key,max,windowMs)`, `clientIp(req: Request)` — ใช้ชื่อตรงกันทุก task.
- **Security gate:** หลัง Task 3 ก่อน merge — dispatch safepay-security review proxy guard (mandate-before-commit per convention).
