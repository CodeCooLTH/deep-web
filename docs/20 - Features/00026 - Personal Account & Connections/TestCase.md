# TestCase — Personal Account & Connections (feature 00026)

- **วันที่:** 2026-08-02
- 🛑 **สถานะความจริง: ยังไม่เคยมี browser QA หรือ E2E เลยสักครั้ง** — ทุกอย่างที่ผ่านคือ static verification (tsc / build / unit test / Impeccable detector / grep gate) ซึ่งพิสูจน์ได้แค่ว่า "โค้ดคอมไพล์ผ่านและไม่ละเมิดกฎที่ grep จับได้" ไม่ได้พิสูจน์ว่าปุ่มกดติดหรือ OTP เข้าจริง
- เคสในเอกสารนี้จึงแบ่งเป็น **ที่รันแล้ว** กับ **ที่ยังไม่ได้รัน**

---

## 1. Unit test ที่รันแล้ว (21 เคส เขียวทั้งหมด)

### 1.1 `src/lib/onboarding-gate.test.ts` — 7 เคส

กฎนี้คุมว่า `proxy.ts` จะ "ขัง" user ไว้ที่ `/register` หรือ `/onboarding` หรือไม่ พังได้ 2 ทิศที่เจ็บทั้งคู่

| # | เคส | คาดหวัง |
|---|---|---|
| 1 | ผู้ถูกเชิญที่ยังไม่มีร้านส่วนตัว | ไม่โดนบังคับอะไรเลย |
| 2 | nobody (ไม่มีร้านเลย ยังไม่เลือกอะไร) | ไม่โดนบังคับ |
| 3 | seller ปกติ ยังไม่ตั้ง slug ยืนอยู่ในร้านตัวเอง | `needsOnboarding = true` (ยังบังคับเหมือนเดิม — กันทิศหลวม) |
| 4 | ยืนอยู่ในร้านตัวเอง ยังไม่มีเบอร์ | `needsRegistration = true` |
| 5 | **หัวใจของฟีเจอร์:** เพิ่งสร้างร้านส่วนตัว (ไม่มี slug/เบอร์) แต่ active อยู่ร้าน BUSINESS | ไม่โดนขังทั้งคู่ |
| 6 | ตั้ง slug ครบ ยืนอยู่ในร้านตัวเอง | ไม่โดนบังคับ |
| 7 | `activeShopId` เป็น null ทั้งที่มีร้านส่วนตัว (JWT เก่าก่อน feature 00008) | ไม่ขัง (fail-open ฝั่งไม่ขังคน) |

### 1.2 `src/app/api/users/me/route.test.ts` — 14 เคส

regression ของช่องโหว่ privilege escalation ที่อยู่บน prod

| # | เคส | คาดหวัง |
|---|---|---|
| 1 | PATCH `{displayName, isAdmin: true}` | 200 แต่ `isAdmin` ไม่ถูกส่งเข้า prisma |
| 2-7 | PATCH พร้อม `trustScore` / `passwordHash` / `phone` / `email` / `successfulBidCount` / `isShop` | field เหล่านั้นไม่ถึง prisma |
| 8 | PATCH ที่มีแต่ field นอก allow-list | 400 และ **ไม่แตะ DB เลย** |
| 9 | `username` ผิดรูปแบบ | 400 |
| 10 | `username` ซ้ำ user อื่น | 409 ไม่ update |
| 11 | `avatar: "javascript:alert(1)"` | 400 |
| 12 | `avatar: null` | 200 (ลบรูป) |
| 13 | ไม่มี session | 401 ไม่แตะ DB |
| 14 | GET | response ไม่มี `passwordHash` และ query มี `select` |

**คำสั่งรัน:** `./node_modules/.bin/vitest run src/lib/onboarding-gate.test.ts src/app/api/users/me/route.test.ts`

---

## 2. Static gate ที่รันแล้ว

| gate | ผล |
|---|---|
| `tsc --noEmit` | 0 error ในไฟล์ที่แตะ (78 error ที่เหลือเป็น image import ของ theme ซึ่งมีอยู่ก่อนแล้วทั้งหมด) |
| `npm run build` | ผ่าน — `/seller/account`, `/api/account/otp-for-password`, `/api/account/set-password-otp` ขึ้นใน route list |
| Impeccable detector | 0 findings ทั้ง 5 ไฟล์ target (ตรวจความน่าเชื่อถือด้วยการรันกับ `(paces)/seller` ทั้งกลุ่มแล้วได้ finding ของไฟล์อื่น = ไม่ใช่ scan ล้มเงียบ) |
| grep: emoji ใน UI | 0 |
| grep: arbitrary Tailwind value | 0 |
| grep: ม่วง Vuexy `#7367F0` ใน `(paces)` | 0 |
| grep: `react-toastify` ใน `(paces)` | 0 |
| CSS ที่ build ออกมา | ยืนยัน `size-14` = 56px, `size-6.5` = 26px, `min-h-11` = 44px generate จริง ไม่ใช่ class ผี |

---

## 3. 🛑 เคสที่ยังไม่ได้รัน (หนี้ QA)

### 3.1 Browser QA — ต้องกดจริงทั้ง desktop และ mobile

switcher มี **2 implementation แยกกัน** ต้องกดทั้งคู่ ไม่ใช่กดอันเดียวแล้วเหมา

| # | เคส | จุดที่เสี่ยงพังที่สุด |
|---|---|---|
| B-1 | มือถือ หน้าแรก → กดแถบชื่อร้าน | sheet ต้องเปิดได้ **แม้บัญชีไม่มีร้าน business** (เพิ่งถอด gate ตัวนี้ออก) |
| B-2 | บัญชีที่ถูกเชิญ ยังไม่มีร้านส่วนตัว | ต้องเห็นแถวเส้นประ "สร้างร้านส่วนตัวของฉัน" ทั้ง dropdown เดสก์ท็อปและ sheet มือถือ |
| B-3 | กดสร้างจริง | Swal ยืนยัน → overlay ขึ้นข้อความ "กำลังเปิดร้านส่วนตัวให้คุณ…" ไม่ใช่ "กำลังสลับบัญชี" → เข้า `/onboarding` |
| B-4 | ปุ่ม "กลับไปที่ร้าน X" | ต้องอยู่**บนสุดเหนือโลโก้** และกลับไปร้านที่มาจากจริง ไม่ใช่ร้านอื่น |
| B-5 | บัญชีที่มีร้านส่วนตัวแล้ว | ต้อง **ไม่เห็น** แถวสร้างร้าน |
| B-6 | `/account` บนมือถือ | ต้องไม่มีคำว่า "ข้อมูลส่วนตัว" ซ้ำ 3 ชั้น |
| B-7 | `/account` บนเดสก์ท็อป 1440px | การ์ดต้องไม่ยืดเต็มจอ (`max-w-2xl`) |
| B-8 | อัปโหลด/ลบรูปโปรไฟล์ | รูปบน topbar เปลี่ยนทันทีโดยไม่ต้อง login ใหม่ |
| B-9 | แก้ชื่อผู้ใช้ | สถานะ "ชื่อนี้ว่างอยู่ ใช้ได้" ขึ้น**เขียว**ก่อน แล้วค่อยมีบรรทัดเตือนเรื่องลิงก์เดิม |
| B-10 | เพิ่มเบอร์โทร (บัญชี FB/LINE ที่ยังไม่มีเบอร์) | Swal 2 จอ มีปุ่ม "ส่งรหัสใหม่" และ OTP เข้าจริง |
| B-11 | ตั้งรหัสผ่าน | ปุ่ม disabled จนกว่าจะมีเบอร์ → ตั้งได้ → badge เป็น "ตั้งแล้ว" |
| B-12 | login ตรงด้วย username + รหัสผ่านที่เพิ่งตั้ง | เข้าได้จริง (provider `seller-credentials`) |
| B-13 | บัญชีที่ไม่มีทั้งเบอร์และรหัสผ่าน | เห็นแถบเตือนสีเหลืองบน `/account` |
| B-14 | `/settings` ของร้านที่พัก (vertical ≠ GENERAL) | เห็น empty state ไม่ใช่หน้าเปล่า |
| B-15 | เมนู sidebar | กลุ่ม "บัญชีของฉัน" อยู่**ล่างสุด** และ `/settings` ชื่อ "การจัดส่ง" |

### 3.2 E2E Playwright — ยังไม่เขียน (user ตัดสินให้ข้ามรอบนี้ 2026-08-02)

ถ้าจะเขียนภายหลัง bypass login ด้วย `e2e/helpers/auth.ts` และ **🛑 ห้ามคำสั่งลบข้อมูลแบบไม่ scope ตาม Hard Rule 13** — ล้างด้วย `deleteTestData({ userIds, shopIds })` เท่านั้น

### 3.3 เคสที่ต้องเตรียมข้อมูลก่อนถึงจะทดสอบได้

เคสหลักของฟีเจอร์ต้องมี **บัญชีที่ถูกเชิญเป็น ADMIN ของร้าน BUSINESS และยังไม่มีร้าน PERSONAL** ในฐาน — ถ้าไม่มีบัญชีลักษณะนี้ เคส B-2/B-3/B-4 ทดสอบไม่ได้เลย
