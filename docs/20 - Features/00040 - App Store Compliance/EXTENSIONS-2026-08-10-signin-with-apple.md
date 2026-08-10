# App Store 4.8 — Sign in with Apple

## ที่มา

App Store ปฏิเสธ build 1.0(2) เมื่อ 2026-08-04 (ข้อที่สองของรอบเดียวกับ 3.1.1)

> The app uses a third-party login service, but does not appear to offer as an equivalent login
> option another login service with all of the following features: limits data collection to the
> user's name and email address · allows users to keep their email address private · does not
> collect interactions with the app for advertising purposes without consent.

จริงตามนั้น — หน้าล็อกอินผู้ขายมีปุ่ม Facebook และ LINE ซึ่งตกทั้ง 3 ข้อ

**username + password ที่มีอยู่แล้วไม่นับ** — ข้อยกเว้นของกฎ 4.8 ให้เฉพาะแอปที่ใช้ระบบบัญชี
ของตัวเอง **อย่างเดียวล้วน** พอมีปุ่ม Facebook แม้ปุ่มเดียวก็หลุดจากข้อยกเว้นทันที

## ทางเลือกที่ไม่เลือก

ถอดปุ่ม Facebook/LINE ออกจะกลับเข้าข้อยกเว้นและใช้เวลา ~1 ชม. — **แต่ผู้ขาย 3 จาก 6 คนที่ใช้จริง
บน prod ไม่มีรหัสผ่าน** (ล็อกอินผ่าน OAuth ทางเดียว) เขาจะเข้าแอปไม่ได้เลย จึงเลือกทำของจริง

## ค่าที่ตั้งใน Apple Developer (2026-08-10)

| ค่า | |
|---|---|
| Team ID | `DT9C75X495` |
| Services ID (= `APPLE_CLIENT_ID`) | `com.deepthailand.seller.web` |
| Key ID | `6G2X8HBMGL` |
| Return URL | `https://seller.deepthailand.app/api/auth/callback/apple` |
| Domain | `seller.deepthailand.app` |

🛑 **`APPLE_CLIENT_ID` ต้องเป็น Services ID ไม่ใช่ bundle id ของแอป** (`com.deepthailand.seller`)
— สลับกันคือความผิดพลาดที่พบบ่อยที่สุด และ Apple ตอบแค่ `invalid_client` โดยไม่บอกว่าอะไรผิด

## 🛑 สองกับดักที่ทำให้ล็อกอินพังโดยไม่มีอะไรบอกสาเหตุ

### 1. client secret ต้องเซ็นสด ไม่ใช่ค่าคงที่

Apple ไม่ให้ client secret เป็นสตริงตายตัวเหมือน OAuth เจ้าอื่น — ต้องเซ็น **JWT ES256** ด้วย
private key จากไฟล์ `.p8`

`src/lib/apple-client-secret.ts` เซ็นสดทุกครั้งที่ประกอบ `authOptions` (ตอน cold start)

**ทำไมไม่เก็บ JWT ที่เซ็นไว้แล้วเป็น env var:** มันหมดอายุ (Apple ให้สูงสุด 6 เดือน) วันหนึ่ง
**ล็อกอิน Apple จะพังเงียบ ๆ** โดยไม่มีใครรู้จนมีคนบ่น และคนที่มาแก้ทีหลังจะไม่รู้ว่าต้องสร้างใหม่
ยังไง — เซ็นสดทำให้ระบบต่ออายุตัวเองเสมอ

**ไม่เพิ่ม dependency:** Node เซ็น ES256 ได้เองผ่าน `node:crypto` แบบ **synchronous** ซึ่งจำเป็น
เพราะ NextAuth v4 รับ `clientSecret` เป็นสตริงตอน module load ไม่รองรับ async

🛑 **`dsaEncoding: 'ieee-p1363'` ห้ามลืม** — ค่า default ของ Node คือ DER ซึ่ง JOSE ไม่รับ
ลายเซ็นจะถูกปฏิเสธทุกครั้ง (มีเทส `[blocker]` เช็คว่าลายเซ็นยาว 64 ไบต์)

### 2. คุกกี้ต้องเป็น SameSite=None เพราะ Apple ส่งกลับแบบ POST ข้ามเว็บ

Apple ใช้ `response_mode=form_post` (ดู `next-auth/providers/apple.js`) = ยิง **POST** จาก
`appleid.apple.com` มาที่ callback ของเรา ซึ่งเป็น cross-site request

เบราว์เซอร์จะ **ไม่แนบคุกกี้ SameSite=Lax** — และ next-auth v4 ตั้ง `lax` ให้ทุกตัวโดยไม่มีการ
จัดการพิเศษให้ Apple (ตรวจแล้วใน `core/lib/cookie.js`) ผลคือ `code_verifier` หายไป NextAuth
ตอบ error `OAuthCallback` ทั้งที่ทุกอย่างฝั่ง Apple ถูกหมด

`crossSiteOAuthCookies()` ใน `auth.ts` ทับเฉพาะ **3 ตัวที่ใช้ระหว่างเดินทางของ OAuth**
(`pkceCodeVerifier`, `state`, `nonce` — อายุ 15 นาที ใช้ครั้งเดียวทิ้ง) — **ไม่แตะคุกกี้ session**
ซึ่งยังเป็น `SameSite=Lax` ตามเดิม ความปลอดภัยของ session จึงไม่ลดลง

เปิดเฉพาะ production เพราะ `SameSite=None` บังคับต้องมี `Secure` = ต้อง https
(dev รันบน `http://seller.deepth.local` · Apple ไม่รับ http อยู่แล้ว — **เทสได้บน prod เท่านั้น**
เหมือน Facebook login ที่บันทึกไว้ตั้งแต่ 2026-06-17)

## อีเมลซ่อนของ Apple

ผู้ใช้ที่เลือก "ซ่อนอีเมลของฉัน" จะได้อีเมล `x7k9m2p@privaterelay.appleid.com` ซึ่ง **ไม่ใช่อีเมล
จริง** และเป็นคนละค่ากันในแต่ละแอป

🛑 `isApplePrivateRelayEmail()` กันไม่ให้อีเมลแบบนี้ถูกใช้จับคู่ประวัติลูกค้าเก่า
(`linkBuyerHistory`) — ถ้าปล่อยผ่าน มันจะกลายเป็น "อีเมลของผู้ใช้คนนี้" ในระบบเรา ทั้งที่ส่งไปหา
ไม่ได้จริงถ้าเขากดตัดการส่งต่อทิ้ง และหน้าโปรไฟล์จะโชว์อีเมลที่เจ้าตัวเองไม่รู้จัก

ตรรกะเดิมของโปรเจกต์ใช้ธง `linkEmail` ต่อ provider อยู่แล้ว (FB=true, LINE/IG=false) — Apple
เป็น `true` แต่ผ่านด่าน relay ก่อนเสมอ · ฟังก์ชันคืน `false` ให้ provider อื่นเสมอ จึงไม่กระทบ FB/LINE

## ตำแหน่งปุ่ม

วาง **บนสุด** ของกลุ่มปุ่มล็อกอิน ทั้ง `SignInForm.tsx` (หน้าล็อกอินหลัก) และ
`InviteLandingClient.tsx` (หน้ารับคำเชิญ)

🛑 ต้องมีทั้งสองที่ — กฎ 4.8 ผูกกับ "ทุกที่ที่ให้ล็อกอินด้วยเจ้าอื่น" ไม่ใช่หน้าใดหน้าหนึ่ง
และ Apple บังคับให้อยู่ **ระดับเดียวกัน** กับปุ่มอื่น ห้ามซ่อนหลังลิงก์ "ตัวเลือกอื่น" หรือทำให้เล็กกว่า

โลโก้ใช้ `bxl:apple` สีดำตาม Human Interface Guidelines (ยืนยันว่ามีจริงใน iconify แล้ว)

## ตั้งค่าไม่ครบ = ไม่เปิด provider เลย

`appleProvider()` คืนอาร์เรย์ว่างเมื่อ env ไม่ครบ หรือคีย์เสีย — **ไม่ใช่เปิดแล้วปล่อยให้พังตอนกด**
(ต่างจาก FB/LINE ที่ใส่ `|| ""`) เพราะปุ่ม Apple ที่กดแล้วเด้ง error คือสิ่งแรกที่คนตรวจของ Apple
จะเจอ แล้วตีกลับด้วยเหตุผลที่แย่กว่าเดิม

## ยังไม่ได้ทำ / ข้อจำกัดที่รู้ตัว

- 🛑 **Apple ส่ง "ชื่อ" มาแค่ครั้งแรกครั้งเดียว** และส่งมาใน body ของ form_post ไม่ใช่ใน id_token
  ซึ่ง `profile()` ของ next-auth อ่านไม่เห็น → ผู้ที่สมัครด้วย Apple จะได้ `displayName = "User"`
  **ยอมรับได้เพราะ onboarding บังคับให้กรอกชื่อร้าน/ชื่อที่แสดงอยู่แล้ว** (ขั้นที่ 2) — ถ้าวันหนึ่ง
  ต้องการชื่อจริงตั้งแต่แรก ต้องอ่าน body ที่ route handler เองซึ่งซับซ้อนกว่ามาก
- **④ Register Email Sources** ในหน้า Apple Developer ยังไม่ได้ทำ — จำเป็นเฉพาะตอนจะ **ส่งอีเมล
  หาผู้ใช้ที่ซ่อนอีเมล** การล็อกอินทำงานได้โดยไม่ต้องทำ
- ยังไม่ได้กดล็อกอินจริง — ต้อง deploy + ตั้ง env บน Vercel ก่อน (ทดสอบบน localhost ไม่ได้)

## การพิสูจน์

- `tsc` 0 error · full suite แดง 19 เท่าเดิม (1965 ผ่าน จาก 1984)
- เทสใหม่ 10 ข้อ (`apple-client-secret.test.ts`) — คลุมโครงสร้าง JWT ทุกช่อง + รูปลายเซ็น +
  อีเมล relay + คีย์รูปแบบ env var
- **เซ็นด้วยคีย์ `.p8` จริงผ่านแล้ว** (`scripts/verify-apple-signin.ts`): ES256 · kid/iss/sub/aud
  ตรงทุกช่อง · ลายเซ็น 64 ไบต์ · อายุ 183 วัน
- ยืนยัน `bxl:apple` มีจริงใน iconify (HTTP 200)
- ไม่มีไฟล์ `.p8` หรือ `.env.local` หลุดเข้า git

## env ที่ต้องตั้งบน Vercel (production)

```
APPLE_CLIENT_ID   = com.deepthailand.seller.web
APPLE_TEAM_ID     = DT9C75X495
APPLE_KEY_ID      = 6G2X8HBMGL
APPLE_PRIVATE_KEY = <เนื้อไฟล์ AuthKey_6G2X8HBMGL.p8 ทั้งก้อน>
```

`APPLE_PRIVATE_KEY` วางได้ทั้งแบบหลายบรรทัดจริงและแบบบรรทัดเดียวที่มี `\n` เป็นตัวอักษร —
`normalizePrivateKey()` แปลงให้เอง (มีเทสคุม)
