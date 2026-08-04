# API — Personal Account & Connections (feature 00026)

- **วันที่:** 2026-08-02
- **สถานะ:** deployed prod
- **หมายเหตุ:** เขียนจากโค้ดจริงในรอบที่ deploy แล้ว ไม่ใช่จากสเปก — ทุก path/field/status ในเอกสารนี้เปิดไฟล์ route จริงมาไล่ทีละบรรทัด (บทเรียน `feedback_write_docs_from_code_not_memory`)

Endpoint ทั้งหมดอยู่หลัง `guardApi` ใน `src/proxy.ts` (Origin-check บน mutation + per-IP rate limit) ตามค่าเริ่มต้นของระบบ

---

## 1. Endpoint ที่สร้างใหม่ในฟีเจอร์นี้

### 1.1 `GET /api/account/check-username`

ไฟล์: `src/app/api/account/check-username/route.ts`

เช็คว่าชื่อผู้ใช้ว่างไหม ระหว่างพิมพ์ในหน้า `/account`

| | |
|---|---|
| Auth | **ต้องมี session** — ผลลัพธ์บอกได้ว่าชื่อไหนมีคนใช้ = enumerate บัญชี จึงไม่เปิดสาธารณะ (ต่างจาก `check-slug` ที่ slug ร้านเป็นข้อมูลสาธารณะอยู่แล้ว) |
| Query | `username` (string) |

**Response**

| สถานะ | body |
|---|---|
| 200 | `{ available: true }` |
| 200 | `{ available: false, reason: "invalid" }` — ไม่ตรง `^[a-z0-9_]{3,30}$` |
| 200 | `{ available: false, reason: "taken" }` — มี user อื่นใช้อยู่ (ของตัวเองถือว่าว่าง) |
| 401 | `{ error: "unauthorized" }` |

> endpoint นี้เป็นแค่ UX ไม่ใช่ guard — การเซฟจริงผ่าน `PATCH /api/users/me` ซึ่งเช็คซ้ำและจับ P2002 เอง

### 1.2 `POST /api/account/otp-for-password`

ไฟล์: `src/app/api/account/otp-for-password/route.ts`

ส่ง OTP ไปเบอร์ของบัญชีที่ล็อกอินอยู่ เพื่อเตรียมตั้ง/เปลี่ยนรหัสผ่าน

| | |
|---|---|
| Auth | ต้องมี session |
| Body | ไม่มี |

**ทำไมไม่ใช้ `/api/otp/send` เดิม:** endpoint นั้นรับ `contact` (เบอร์) จาก client ซึ่งแปลว่าหน้า `/account` ต้องรู้เบอร์ตัวเองก่อน = ต้องส่งเบอร์จริงลง RSC flight payload ทั้งที่หน้านั้นตั้งใจรับแค่ boolean (`feedback_rsc_pii_neutralize_at_source`) เส้นทางนี้จึง resolve เบอร์จาก session ฝั่ง server

**Response**

| สถานะ | body |
|---|---|
| 200 | `{ phoneMasked: "081xxxx678" }` |
| 401 | `{ error: "unauthorized" }` |
| 409 | `{ error: "บัญชีนี้ยังไม่มีเบอร์โทร กรุณาเพิ่มเบอร์ก่อน" }` |
| 429 | `{ error: "ขอ OTP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" }` |
| 503 | `{ error: "ไม่สามารถส่ง SMS ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" }` |

- rate-limit ใช้ `consumeOtpRequestQuota` **ตัวเดียวกับ `/api/otp/send`** (3 ครั้ง/10 นาที ต่อเบอร์) เพื่อไม่ให้เส้นทางนี้กลายเป็นช่องเลี่ยงโควตา
- test account (`isTestAccount`) ข้ามการส่ง SMS จริง แต่ยังคืน `phoneMasked` ปกติ — mirror พฤติกรรม `/api/otp/send`
- ไม่เป็น phone-existence oracle เพราะต้องมี session ถึงเรียกได้

### 1.3 `POST /api/account/set-password-otp`

ไฟล์: `src/app/api/account/set-password-otp/route.ts`

ตั้ง/เปลี่ยนรหัสผ่านของบัญชีที่ล็อกอินอยู่

| | |
|---|---|
| Auth | ต้องมี session |
| Body | `{ otp: string(6), password: string }` — **ไม่มี `phone`** |

`password` ผ่าน `PasswordSchema` → `isStrongPassword` (≥8 ตัว, มีตัวอักษร + ตัวเลข + อักขระพิเศษ) SSOT เดียวกับ seller auth เดิม

**Response**

| สถานะ | body |
|---|---|
| 200 | `{ ok: true }` |
| 400 | `{ error: "รหัสผ่านต้องยาว 8 ตัวขึ้นไป มีตัวอักษร ตัวเลข และอักขระพิเศษ" }` |
| 401 | `{ error: "unauthorized" }` / `{ error: "รหัส OTP ไม่ถูกต้องหรือหมดอายุ" }` |
| 409 | `{ error: "บัญชีนี้ยังไม่มีเบอร์โทร กรุณาเพิ่มเบอร์ก่อน" }` |

**ทำไมยังบังคับ OTP ทั้งที่ล็อกอินอยู่แล้ว:** session อย่างเดียวไม่พอสำหรับการตั้งรหัสผ่าน — เครื่องที่เปิดทิ้งไว้จะถูกคนที่นั่งลงต่อตั้งรหัสผ่านแล้วยึดบัญชีทันที OTP บังคับให้ต้องถือเบอร์ด้วย

**ลำดับใน route มีความหมาย:** parse body → resolve เบอร์ → `verifyOtp` **ท้ายสุด** เพราะ `verifyOtp` consume แบบ single-use ถ้าเรียกก่อนแล้ว password ไม่ผ่าน validation จะเผา OTP ทิ้งฟรี

---

## 2. Endpoint เดิมที่ถูกแก้ในฟีเจอร์นี้

### 2.1 `PATCH /api/users/me` — ปิดช่องโหว่ privilege escalation

ไฟล์: `src/app/api/users/me/route.ts` · commit `eb32a937`

**ก่อนแก้:** `const body = await request.json()` แล้วส่งเข้า `prisma.user.update({ data: body })` ตรง ๆ — TS type บน `updateProfile()` กรองอะไรไม่ได้ตอน runtime → user ที่ล็อกอินคนไหนก็ได้ยิง `{"isAdmin": true}` แล้วเป็นแอดมินระบบ (และเซ็ต `trustScore`/`passwordHash`/`phone` ทับกฎ immutable)

**หลังแก้:** parse ด้วย `UpdateProfileSchema` (Valibot allow-list) ก่อนแตะ DB

| field | กติกา |
|---|---|
| `displayName` | optional, trim, 1–100 ตัว |
| `username` | optional, trim, lowercase, `^[a-z0-9_]{3,30}$` |
| `avatar` | optional, nullable, ≤2048 ตัว, ต้องขึ้นต้นด้วย `/api/files/` หรือ `https://` (กัน `javascript:`/`data:`) |

| สถานะ | เงื่อนไข |
|---|---|
| 200 | สำเร็จ — คืน user ที่ `select` เฉพาะ field ปลอดภัย |
| 400 | ไม่ผ่าน schema / body ว่างเปล่าหลัง parse |
| 401 | ไม่มี session |
| 409 | `username` ซ้ำ user อื่น (เช็คก่อน + จับ P2002 กัน TOCTOU) |

ชั้นกันที่สอง: `updateProfile()` ใน `src/services/user.service.ts` pick field ทีละอันแทน spread ทั้งก้อน

### 2.2 `GET /api/users/me` — เลิกคืน `passwordHash`

เดิม `findUnique` ไม่มี `select` → คืน `passwordHash` (bcrypt) ออก response ตอนนี้ `select` เฉพาะ field ที่ UI ใช้

---

## 3. Endpoint เดิมที่ฟีเจอร์นี้เรียกใช้โดยไม่แก้

| endpoint | ใช้ที่ไหน |
|---|---|
| `POST /api/shops/open-personal` | แถว "สร้างร้านส่วนตัวของฉัน" ใน switcher ทั้ง 2 ตัว (idempotent — `ensurePersonalShop`) |
| `GET /api/business/context` | switcher ทั้ง 2 ตัว + ปุ่ม "กลับไปร้านเดิม" (ใช้ `personal: null` ตัดสินว่าจะโชว์แถวสร้างร้าน) |
| `POST /api/business/switch-context` | ปุ่ม "กลับไปร้านเดิม" |
| `POST /api/otp/send` · `POST /api/account/set-phone` | flow "เพิ่มเบอร์โทร" ในการ์ดข้อมูลส่วนตัว |
| `POST /api/upload` | อัปโหลดรูปโปรไฟล์ → เก็บเป็น `/api/files/{fileId}` ลง `User.avatar` |
| `POST /api/account/link/start` · `/remove` · `/send-otp` | การ์ด "วิธีเข้าสู่ระบบ" (ของเดิมจาก feature 00001 — ไม่แตะ) |
