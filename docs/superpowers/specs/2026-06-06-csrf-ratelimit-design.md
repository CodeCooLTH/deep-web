# Design Spec — CSRF + Rate-Limit (NFR-2.2 / NFR-2.3)

> วันที่ 2026-06-06 · branch `feat/seller-orders-phase-a` · backend-only (ไม่แตะ UI)
> ปิด PRD §11 #11 "general rate-limit (100/30) + CSRF ยังไม่มี — implement ก่อน prod"

## 1. Goal

เพิ่มชั้นป้องกัน abuse ระดับแอปให้ครบตาม PRD ก่อนเปิด prod:
- **NFR-2.2 CSRF protection** — custom API (orders/review/verification/wallet/...) ยังไม่มี (NextAuth ครอบแค่ `/api/auth/*`)
- **NFR-2.3 Rate limiting** — 100 req/min public, 30 req/min auth (OTP 5/min ทำแล้ว)

Success criteria:
- mutation request ข้าม subdomain ที่ไม่ใช่ origin ของเรา → ถูก reject (403)
- ยิง /api เกิน quota ต่อ IP → ถูก throttle (429)
- flow ปกติ (buyer/seller/admin ใช้งานจริง) ไม่สะดุด; OTP/SMS limit เดิมยังทำงาน
- type-check 0; unit test ผ่าน; curl negative ยืนยันพฤติกรรม

## 2. Decisions (locked จาก brainstorm 2026-06-06)

| ประเด็น | ตัดสิน | เหตุผล |
|---|---|---|
| จุด enforce | **middleware-centralized ใน `src/proxy.ts`** | DRY, ไม่มี route ลืม guard; proxy ถอด token อยู่แล้ว (รู้ auth tier) |
| proxy runtime | **nodejs** (Next 16 บังคับ, config ไม่ได้ — ยืนยันจาก docs) | globalThis store รัน Node เหมือน route handler เดิม (otp/sms) — consistent |
| CSRF กลไก | **Origin-header check (stateless)** | เบา, ไม่ต้อง plumb token ทุก form; เข้ากับ SameSite=Lax + cross-subdomain (PRD §556 hint) |
| Rate-limit store | **in-memory globalThis** (pattern `sms-consume-rl.ts`) | ตรง PRD scope (Redis = Phase 2). **Known-gap:** บน Vercel serverless = best-effort per-instance ไม่ใช่ hard global |
| client IP | `x-real-ip` → fallback `x-forwarded-for` (leftmost) | deploy บน Vercel (platform set header, 1 hop) |
| tier | **unauth 100/min/IP · auth 30/min/IP** | ตรง PRD ("100 public / 30 auth") — auth เข้มกว่าเพราะแตะ mutation/เงิน/trust |
| ขอบเขต | **`/api/*` เท่านั้น** (ไม่ครอบ page request) | abuse surface จริงคือ API; DDoS ระดับ network = Vercel WAF (นอก scope) |

## 3. Architecture

แก้ `src/proxy.ts` — เดิม early-return skip `/api` (บรรทัด 11). เปลี่ยนเป็น:

```
proxy(request):
  pathname = request.nextUrl.pathname
  if pathname.startsWith('/api'):
      return guardApi(request)        # ← ใหม่: CSRF + rate-limit, ไม่ rewrite
  if pathname.startsWith('/_next'):
      return next()
  ... (subdomain routing เดิมสำหรับ page ทั้งหมด — ไม่เปลี่ยน)
```

`guardApi(request)`:
```
1. ยกเว้น: ถ้า path เริ่ม /api/auth/ → return next()   # NextAuth จัดการ CSRF + session polling เอง
2. CSRF (เฉพาะ mutation): ถ้า method ∈ {POST,PUT,PATCH,DELETE}:
     origin = header('origin')
     ถ้า !origin OR !isAllowedOrigin(origin) → 403 {error:'CSRF check failed'}
   (OPTIONS preflight → ปล่อยผ่าน next(); same-origin ปกติไม่ trigger preflight)
3. Rate-limit: ip = clientIp(request)
     token = await getToken({req})            # proxy ถอดอยู่แล้วใน flow เดิม
     limit = token ? 30 : 100
     ถ้า !checkApiRateLimit(ip, limit, 60_000) → 429 {error:'Rate limit exceeded'} + Retry-After
4. return next()
```

### Components / files

| ไฟล์ | บทบาท | ใหม่/แก้ |
|---|---|---|
| `src/proxy.ts` | wire `guardApi` เข้า /api branch (แทน skip), เก็บ subdomain routing เดิม | แก้ |
| `src/lib/csrf-origin.ts` | `isAllowedOrigin(origin)` — parse `new URL(origin).hostname` แล้วเช็ค suffix: prod = `=== 'deepthailand.app'` หรือ `.endsWith('.deepthailand.app')`; dev (non-prod) = เพิ่ม `deepth.local` / `.deepth.local` (**ignore port** — match แค่ hostname) | ใหม่ |
| `src/lib/api-rate-limit.ts` | `checkApiRateLimit(key,max,windowMs)` globalThis sliding-window (copy logic `sms-consume-rl.ts`) + `clientIp(req)` | ใหม่ |
| `src/lib/__tests__/csrf-origin.test.ts` | unit: allow/deny origin (subdomain, wrong host, null) | ใหม่ |
| `src/lib/__tests__/api-rate-limit.test.ts` | unit: window trim, ชน limit, reset หลัง window, แยก key ต่อ IP | ใหม่ |

> ขอบเขตข้อมูล: ทั้ง 2 lib เป็น pure function + globalThis Map. ไม่มี DB, ไม่มี state ข้าม request นอกจาก rate-limit Map. ทดสอบแยกได้อิสระ.

## 4. Data flow

```
browser (seller.deepthailand.app) ──POST /api/orders──▶ proxy (nodejs)
   │ Origin: https://seller.deepthailand.app                 │
   │                                                          ├─ /api/auth/* ? → next()
   │                                                          ├─ mutation + Origin ∉ allow → 403
   │                                                          ├─ rate-limit(ip, auth?30:100) เกิน → 429
   │                                                          └─ ผ่าน → next() → route handler
   ▼
route handler (เดิม) — auth/validation/service เหมือนเดิม (otp/sms RL ซ้อนได้)
```

## 5. Error handling

| กรณี | response |
|---|---|
| mutation ไม่มี Origin / Origin ไม่อยู่ใน allowlist | `403 {error:'CSRF check failed'}` |
| เกิน rate-limit | `429 {error:'Rate limit exceeded'}` + header `Retry-After: <sec ถึงปลาย window>` |
| OPTIONS preflight | `next()` (ไม่ block) |
| `/api/auth/*` | `next()` (ยกเว้นทั้ง CSRF + RL) |

## 6. Edge cases / ข้อควรระวัง

- **NextAuth session polling** (`/api/auth/session` เรียกบ่อย) — ยกเว้นจาก rate-limit ผ่าน `/api/auth/` prefix → ไม่โดน 30/min
- **OTP/SMS เดิม** — `/api/otp/*` (5/min/เบอร์) + `/api/o/sms/[code]` (RC-1 per-IP) คงไว้ที่ handler; general RL ซ้อนเพิ่ม (ไม่ขัดกัน — general นับ per-IP/นาที, OTP นับ per-เบอร์/10นาที)
- **GET consume link** `/api/o/sms/[code]` = GET → CSRF ไม่แตะ (ตรวจแค่ mutation); RL general ครอบได้ปกติ
- **dev origin** — `deepth.local` (+ subdomain) ต้องอยู่ใน allowlist เมื่อ `NODE_ENV !== 'production'` เท่านั้น (กัน dev origin ผ่านบน prod)
- **missing IP** — ถ้าไม่มี `x-real-ip`/`x-forwarded-for` → fallback key `'unknown'` (รวม bucket; ยอมรับได้ — บน Vercel header มีเสมอ)
- **Vercel per-instance** — globalThis ไม่ share ข้าม instance → ผู้โจมตี burst ได้ ~limit×จำนวน instance; document เป็น known-gap, แก้จริง = Upstash Redis (Phase 2)

## 7. Testing

- **Vitest unit:**
  - `csrf-origin`: allow `https://seller.deepthailand.app`, `https://admin.deepthailand.app`, `https://deepthailand.app`; deny `https://evil.com`, `null`, `https://deepthailand.app.evil.com`; dev allow `http://seller.deepth.local:3001` เฉพาะเมื่อ non-prod
  - `api-rate-limit`: ยิง max ครั้งผ่าน, ครั้งที่ max+1 fail, หลัง window reset, key คนละ IP ไม่ปนกัน
- **curl negative (dev server `*.deepth.local`):**
  - POST /api mutation ไม่มี Origin → 403
  - POST พร้อม Origin ถูก → ผ่าน
  - ยิง GET /api/... > 100 ครั้ง/นาที (unauth) → 429
  - authed > 30 ครั้ง/นาที → 429
  - `/api/auth/session` ยิงรัว ๆ → ไม่ 429
  - OTP send 6 ครั้ง → ยังโดน 5/min เดิม (ไม่ regress)

## 8. Out of scope (อย่าทำใน task นี้)

- Upstash Redis / distributed rate-limit (Phase 2 ตาม PRD §11 #12)
- Vercel WAF / BotID (platform layer — แยกเรื่อง)
- Per-route fine-grained limit ต่าง ๆ (general 100/30 พอสำหรับ baseline)
- CSRF token (double-submit) — Origin-check เพียงพอกับ SameSite=Lax setup
- rate-limit บน page request (เฉพาะ /api)

## 9. Known gaps (document หลังทำเสร็จ)

- in-memory rate-limit บน Vercel = best-effort per-instance (→ Redis Phase 2)
- อัปเดต PRD §11 #11 จาก OPEN → CLOSED (พร้อม note Vercel limitation)
