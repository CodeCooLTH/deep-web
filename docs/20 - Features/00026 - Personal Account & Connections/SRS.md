# SRS — Personal Account & Connections (feature 00026)

- **วันที่:** 2026-08-02
- **สถานะ:** deployed prod
- ครอบเฉพาะสิ่งที่ฟีเจอร์นี้เพิ่ม/แก้ — ของเดิมอยู่ที่ `docs/SRS.md` (SSOT ระดับระบบ)

## 1. Routing

| path | subdomain | ประเภท | สิทธิ์ |
|---|---|---|---|
| `/account` | `seller.*` | server component | login แล้วเท่านั้น — resolve จาก `session.user.id` **ห้ามอ่าน `activeShopId`** |
| `/settings` | `seller.*` | server component (เดิม) | login; เนื้อหาเหลือเฉพาะการจัดส่งของ active shop |

หมายเหตุ: path จริงไม่มี prefix `/seller` เพราะ `proxy.ts` strip ให้แล้ว (ไฟล์อยู่ที่ `src/app/(paces)/seller/(dashboard)/account/`)

## 2. กฎ gate การบังคับ setup (แก้ของเดิม)

**ก่อนฟีเจอร์นี้**

```
needsRegistration = มี PERSONAL shop && ไม่มี phone
needsOnboarding   = มี PERSONAL shop && PERSONAL shop ไม่มี slug
```

**หลังฟีเจอร์นี้** (`src/lib/onboarding-gate.ts`)

```
onPersonalShop    = มี PERSONAL shop && activeShopId === PERSONAL shop id
needsRegistration = onPersonalShop && ไม่มี phone
needsOnboarding   = onPersonalShop && PERSONAL shop ไม่มี slug
```

**เหตุผล:** ผู้ถูกเชิญที่กด "สร้างร้านส่วนตัว" จะมี PERSONAL shop ที่ยังไม่มี slug ทันที ถ้าไม่ scope ด้วย `activeShopId` proxy จะเด้งเขาไป `/onboarding` ทุก route (และ `/register` ถ้ายังไม่มีเบอร์) = หลุดจากงานในร้าน BUSINESS ที่ทำค้างอยู่ ออกไม่ได้จนกว่าจะตั้ง slug เสร็จ

**ผลข้างเคียงที่ตั้งใจ:** ปุ่ม "กลับไปร้านเดิม" ไม่ต้องมี exempt path ใหม่ใน `proxy.ts` — พอสลับ context flag ตกเป็น false เอง แล้ว guard เดิมที่ `proxy.ts` ("setup เสร็จแล้วยังค้างที่ /onboarding → ออก") พาออกให้

**ข้อบังคับ:** ทั้ง `jwt` และ `session` callback ต้องเรียก `resolveOnboardingGate` **หลัง** block ที่ resolve `activeShopId` เสมอ

## 3. Validation

### 3.1 `UpdateProfileSchema` (`src/lib/validations.ts`)

| field | กติกา |
|---|---|
| `displayName` | optional · trim · 1–100 ตัว |
| `username` | optional · trim · lowercase · `^[a-z0-9_]{3,30}$` (regex เดียวกับ `/api/account/shop-info` = SSOT ของรูปแบบ username) |
| `avatar` | optional · nullable · ≤2048 ตัว · ต้องขึ้นต้น `/api/files/` หรือ `https://` |

**ห้ามเพิ่ม field ที่ user ไม่ควรตั้งเองเข้า schema นี้** และห้ามเปลี่ยนกลับไปรับ body ดิบ

### 3.2 รหัสผ่าน

ใช้ `PasswordSchema` → `isStrongPassword` (`src/lib/password.ts`): ยาว 8–`MAX_PASSWORD_LEN` ตัว ต้องมีตัวอักษร + ตัวเลข + อักขระพิเศษ — SSOT เดียวกับ seller auth เดิม ห้ามเขียนกฎซ้ำที่อื่น

### 3.3 OTP

- รูปแบบ 6 หลัก
- rate-limit `consumeOtpRequestQuota` 3 ครั้ง/10 นาที ต่อเบอร์ — **ทุก endpoint ที่ส่ง OTP ต้องใช้ตัวเดียวกัน** ไม่งั้นเส้นทางใหม่กลายเป็นช่องเลี่ยงโควตา
- `verifyOtp` consume แบบ single-use → ต้องเรียกท้ายสุดเท่าที่ทำได้

## 4. Authorization matrix

| การกระทำ | เงื่อนไข | บังคับที่ไหน |
|---|---|---|
| เห็นแถว "สร้างร้านส่วนตัวของฉัน" | ไม่มี PERSONAL shop (`context.personal === null`) | client (UI) — backend idempotent อยู่แล้วจึงไม่ต้อง gate ซ้ำ |
| สร้างร้านส่วนตัว | login แล้ว | `POST /api/shops/open-personal` เช็ค session |
| สร้างได้ครั้งเดียว | — | **DB**: partial unique index + `ensurePersonalShop` (resolve-before-create) |
| เห็นปุ่ม "กลับไปร้านเดิม" | `hasBusinessMembership = true` | client; การสลับจริง re-verify membership ที่ `jwt` callback |
| แก้ข้อมูลใน `/account` | เจ้าของบัญชีเท่านั้น | ทุก endpoint ผูก `session.user.id` ไม่รับ id จาก client |
| ตั้ง/เปลี่ยนรหัสผ่าน | login + **มีเบอร์** + ผ่าน OTP | `set-password-otp` |

## 5. NFR ที่เกี่ยวข้อง

| ด้าน | ข้อกำหนด |
|---|---|
| PII | หน้า seller อยู่ใต้ client layout → ทุกอย่างที่ส่งลง component ถูก serialize เข้า flight payload — การ์ด "วิธีเข้าสู่ระบบ" รับเฉพาะ boolean, endpoint รหัสผ่านคืนเฉพาะ `phoneMasked` |
| a11y | tap target ≥44px ทุก interactive (ใช้ `min-h-11` + negative margin ให้ระยะ visual ไม่ขยับ) · contrast ≥4.5:1 (ใช้ `*-ink` token กับตัวอักษรบนพื้น `/15`) |
| theme | `(paces)/**` ใช้ Paces primitive เท่านั้น ห้าม arbitrary value ห้ามม่วง Vuexy `#7367F0` |
| i18n | UI copy ภาษาไทยทั้งหมด ไม่มี ALL CAPS กับข้อความไทย |

## 6. สิ่งที่จงใจไม่ทำ

| เรื่อง | เหตุผล |
|---|---|
| แก้อีเมล | ต้องมี flow ยืนยันอีเมลก่อน ไม่งั้นเป็นช่องอ้างสิทธิ์อีเมลคนอื่น — ช่องจึง `disabled` |
| เปลี่ยนเบอร์โทร | กฎเดิม: เบอร์ immutable (มีผลต่อ Trust Score) |
| username cooldown 30 วัน | หนี้เดิมตั้งแต่ seller auth 2026-06-17 นอก scope |
| merge บัญชีซ้ำ | ชน partial-unique PERSONAL shop, ต้องย้าย order/review/wallet/แชท, trust score คำนวณใหม่ — ต้องเป็น feature หลัก |
| บังคับเพิ่มเบอร์ตอน login OAuth ครั้งแรก | เพิ่มแรงเสียดทานให้ผู้ถูกเชิญ ซึ่งเป็นกลุ่มเดียวกับที่ฟีเจอร์นี้เพิ่งลดให้ — เลือกเตือนแทน (FR-PAC-11) |
