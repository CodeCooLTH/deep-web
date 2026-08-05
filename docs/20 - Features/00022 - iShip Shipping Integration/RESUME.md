---
title: "RESUME — iShip Shipping Integration (feat 00022)"
owner: shinobu22
status: active
created: 2026-07-26
tags: [resume, feature, 00022, iship, shipping]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[API]]", "[[DATABASE]]", "[[TestCase]]"]
---

# RESUME: เชื่อมระบบขนส่ง iShip (feat 00022)

> เอกสารสำหรับ "กลับมาทำต่อคนละ session" — อ่านไฟล์นี้ไฟล์เดียวก่อนแตะงานนี้ต่อ

---

## 0. อัปเดตล่าสุด 2026-08-05 — ส่วนขยาย "เปรียบเทียบราคาขนส่งทุกเจ้า"

**DEPLOYED PRODUCTION** — merge `7dfc7cb4` (2026-08-05) หลัง `0b067517` (§1/§9 ด้านล่างยังเป็น
snapshot ของเวอร์ชันแรก 2026-07-26 — ไม่ได้อัปเดตตามการ deploy รอบ 2026-08-01/2026-08-05 ทุกจุด
อ่าน `docs/20 - Features/00022 - iShip Shipping Integration/{PRD,BRD,SRS,API,TestCase}.md`
หัวข้อ "ส่วนขยาย 2026-08-05" สำหรับสเปกเต็ม)

ปุ่ม "เทียบราคา" ในฟอร์มสร้างพัสดุ (`ShipmentCreateForm.tsx`) → ยิง `POST
/api/seller/iship/price/compare` ครั้งเดียว server fan-out ไปทุกขนส่งของร้าน (`Promise.allSettled`)
→ `PriceCompareSheet.tsx` แสดงผลเรียงถูก→แพง พร้อม badge ถูกที่สุด/เร็วที่สุด — กด "ใช้ขนส่งนี้"
ตั้งค่ากลับเข้าฟอร์มหลัก ไม่เปิดพัสดุให้ทันที

**carry ที่ยังไม่ปิด:**
1. **ยังไม่เคย smoke test `check-price` กับบัญชี iShip จริง** — field ที่ใช้ (`price`,
   `fuel_surcharge_fee`, `remote_area`, `estimate_shipping_date`, `total_price`) อิงจาก curl จริง
   ของ user + ยืนยันกับบัญชีจริงเมื่อ 2026-07-31 ใน `src/lib/iship/client.ts` เท่านั้น — ยังไม่ได้
   ยิงซ้ำเฉพาะ endpoint เปรียบเทียบนี้ dev DB มีแต่บัญชีเทสที่ token ปลอม ยิงจริงไม่ได้ที่นี่.
   ช่อง "ค่าขนส่ง(ปริมาตร)"/"พื้นที่ท่องเที่ยว" ที่หน้า iShip เองมี **ไม่อยู่** ใน `IShipPrice`
   ที่เราอ้างอิง — ถ้ายิงจริงแล้วพบว่ามีมาด้วย ต้องเพิ่มเป็น optional field ใหม่
2. **browser QA เป็นของ user** — ยังไม่เคยกดจริงบนเบราว์เซอร์สักครั้ง user รับไปทดสอบเองบน prod
   2026-08-05 (เคส M-10..M-20 ใน `TestCase.md`)

**ไฟล์หลักที่เพิ่ม:** `src/lib/iship/compare.ts` (+`.test.ts`), `src/app/api/seller/iship/price/compare/route.ts`,
`src/components/safepay/iship/PriceCompareSheet.tsx`, `buildCheckPricePayload()` ใน `src/lib/iship/mapping.ts`
(รวม mapping payload check-price ที่เคยเขียนซ้ำใน `estimateShippingPrice` ให้เหลือจุดเดียว)

---

## 1. สถานะ ณ 2026-07-26

**DEPLOYED PRODUCTION แล้ว** — commit ล่าสุดบน main คือ `0b067517`

| ส่วน | สถานะ |
|------|-------|
| เอกสาร 7/7 (PRD/BRD/SRS/SDS/API/DATABASE/TestCase) | เสร็จ |
| schema + migration | apply บน Supabase แล้ว (dev=prod ใช้ตัวเดียวกัน) |
| backend (client / service / 14 API route / webhook) | เสร็จ |
| UI (ตั้งค่า / หน้าออเดอร์ / พิมพ์หลายใบ / ฝั่งผู้ซื้อ / 3 โหมด / แชท) | เสร็จ |
| unit test | 57/57 ผ่าน |
| tsc / build จริง | 0 error / exit 0 |
| reviewer 8-gate + security review | ทำแล้ว (Controller ทำเอง) |
| **browser QA / E2E จริง** | **ยังไม่เคยรัน** |
| Impeccable critique / clarify | ยังไม่ทำ |
| retro | ยังไม่ทำ |

branch `feat/i-ship-integrate` sync กับ main แล้ว

---

## 2. ฟีเจอร์นี้ทำอะไร

ร้านคัดลอก **Token** จากหลังบ้าน iShip มาวางที่ Deep ครั้งเดียว จากนั้น

- เปิดพัสดุกับขนส่ง (Flash / J&T / Kerry / SPX / ไปรษณีย์ไทย / DHL ฯลฯ) จากคำสั่งซื้อได้เลย
- พิมพ์ใบปะหน้า A6 จากหน้าเรา ทั้งทีละใบและหลายใบพร้อมกัน
- ติดตามสถานะ ยกเลิกพัสดุ เรียกรถเข้ารับ
- ผู้ซื้อเห็นเลขติดตามบนหน้าลิงก์คำสั่งซื้อ
- สร้างพัสดุ + แจ้งเลขติดตามในห้องแชทรวดเดียว
- เทียบราคาทุกขนส่งของร้านในคำขอเดียว ก่อนตัดสินใจเปิดพัสดุ (ส่วนขยาย 2026-08-05 — ดู §0)

**ฟรีทุกร้าน** ไม่แตะกระเป๋าเงินร้าน · **เฉพาะร้าน `Shop.vertical = "GENERAL"`** (ร้านบ้านพักไม่มีฟีเจอร์นี้เลย)

---

## 3. แผนที่ไฟล์

```
src/lib/iship/
├── errors.ts             error taxonomy 7 รหัส + redactToken + classifyUpstream
├── client.ts             HTTP client + โหมดจำลอง + timeout ต่อประเภทงาน
├── mapping.ts            แปลงข้อมูล Deep → iShip + ตรวจช่องที่ขาด + idempotencyKey
├── eligibility.ts        ออเดอร์นี้เปิดพัสดุได้ไหม (pure — เทสได้ไม่ต้องมี DB)
├── status.ts             แปลสถานะ 15 ตัวเป็นข้อความ/สี
├── route-helpers.ts      แปลง error เป็น HTTP + no-store header
├── after-order-create.ts โหมด AUTO/ASK ตอนสร้างคำสั่งซื้อ (client-safe)
└── *.test.ts             57 เคส (mapping 20 / errors 24 / eligibility 13)

src/services/iship.service.ts   จุดเดียวที่ถอดรหัส token — กฎธุรกิจ + สิทธิ์ + เขียน DB
src/lib/shop-api-guard.ts       requireGeneralShop() — guard 3 ชั้น
src/lib/validations.ts          Valibot schema ทั้งหมดของฟีเจอร์
src/proxy.ts                    ยกเว้น /api/webhooks/* จาก origin-check

src/app/api/seller/iship/       14 route
src/app/api/webhooks/iship/[secret]/   รับสถานะจาก iShip (ยังปิดอยู่)

src/app/(paces)/seller/(dashboard)/
├── settings/page.tsx                      การ์ดทางเข้า
├── settings/shipping/{page,ShippingClient} หน้าตั้งค่าการจัดส่ง
├── orders/[token]/components/ShipmentPanel ส่วนการจัดส่ง 4 สถานะ + ฟอร์มกรอกผู้รับ
├── orders/components/BulkActionBar         ปุ่มพิมพ์หลายใบ
└── orders/new/components/OrderCreateForm   hook โหมด AUTO/ASK

src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanel.tsx
                                            ปุ่ม "สร้างพัสดุ" + แจ้งเลขในแชท
src/app/(marketing)/o/[token]/page.tsx      ผู้ซื้อเห็นเลขติดตาม (fallback)
e2e/iship-shipping.spec.ts                  E2E 5 กลุ่ม (เขียนแล้ว ยังไม่รัน)
```

**ตารางใหม่ 4 ตัว:** `ShopShippingAccount` · `OrderShipment` · `ShipmentEvent` · `ShipmentPickup`
ไม่แตะ `Order` / `Shop` แม้แต่คอลัมน์เดียว (มีแค่ back-relation)

---

## 4. กับดักที่ต้องรู้ก่อนแก้โค้ดนี้

### 4.1 ชื่อฟิลด์ที่อยู่กลับหัวกัน (อันตรายที่สุด — BR-ISHIP-31)

| Deep | ความหมายจริง | ต้องส่งไปช่อง |
|------|--------------|--------------|
| `subdistrict` | **ตำบล/แขวง** | `dst_district` / `src_district` |
| `district` | **อำเภอ/เขต** | `dst_amphure` / `src_amphure` |

จับคู่ตามชื่อ = พัสดุส่งผิดตำบลทั้งระบบ **โดยไม่มีอะไรฟ้อง** เพราะ payload ผ่าน validation ทุกด่านและ iShip ก็รับ
มี unit test คุมเฉพาะ (blocker) และเทสต้องใช้ค่าตำบลกับอำเภอ **ต่างกัน** ไม่งั้นหลอกผ่านได้

### 4.2 ห้ามเขียน `ShipmentTracking` จากฝั่ง iShip

`ShipmentTracking.orderId` เป็น unique และ `shipOrder()` สร้างแถวนั้น**พร้อม**เปลี่ยน `Order.status` ในทรานแซกชันเดียว
ชิงเขียนก่อน = **ปุ่ม "แจ้งจัดส่ง" ของร้านพังถาวร** (ชน P2002) + badge ความเร็วจัดส่งเปลี่ยนความหมายเงียบ ๆ
→ หน้าผู้ซื้ออ่านแบบ fallback แทน (ของที่ร้านแจ้งเองมาก่อน แล้วค่อยพัสดุ iShip)

### 4.3 ห้ามใช้ `updateOrder()` แก้ที่อยู่

ตัวนั้นเขียนทับทั้งใบ (ลบ item เดิม + คืนสต็อก + สร้างใหม่) เอามาแก้แค่ที่อยู่จะพังสต็อกและรายการสินค้า
→ ใช้ `applyReceiverPatch()` ใน `iship.service.ts` ที่แตะแค่ 3 คอลัมน์ผู้รับ

### 4.4 ไม่มีระบบทดสอบแยกของ iShip

มีแต่ token production จริง — ทุกครั้งที่เปิดพัสดุ = **พัสดุจริง + เงินจริงของร้าน**
มีโหมดจำลอง: `ISHIP_DRY_RUN=1` **และ** `NODE_ENV !== "production"` (สองเงื่อนไขซ้อน)

### 4.5 เอกสาร iShip อ่านหน้าเว็บตรงไม่ได้

`api-docs.iship.cloud` เป็น Postman documenter ที่ render ด้วย JS → ดึง collection JSON แทน:
`https://api-docs.iship.cloud/api/collections/5330498/U16nLQCM?segregateAuth=true&versionTag=latest`

### 4.6 การตรวจ exit code

บทเรียนที่โดน 2 รอบใน session นี้ — `npm run build | tail` และ `... ; grep -c` ทำให้ exit code ที่ได้เป็นของคำสั่งท้ายสุด ไม่ใช่ของ build
เขียน log ลงไฟล์แล้วอ่าน `exit=$?` ทันทีหลัง build เท่านั้น

---

## 5. การตัดสินใจเชิงออกแบบ (พร้อมเหตุผล)

| เรื่อง | ทำอะไร | ทำไม |
|-------|--------|------|
| โหมด AUTO | ยิงจากเบราว์เซอร์หลังบันทึกออเดอร์ ไม่ใช่งานเบื้องหลัง | Vercel ไม่มีเซิร์ฟเวอร์ประจำ งานค้างหลังตอบ response ไม่รับประกันว่าได้รัน จะเกิดออเดอร์ที่ "ควรมีพัสดุแต่ไม่มี" เงียบ ๆ |
| จุดเรียก | หลังออเดอร์สำเร็จ **ก่อน** เปลี่ยนหน้าเสมอ | เปลี่ยนหน้าก่อน = component unmount แล้วหน้าต่างถามหายกลางอากาศ |
| กันเปิดซ้ำ | `idempotencyKey` UNIQUE + partial unique `orderId WHERE status <> 'CANCELLED'` | กลไกเดียวที่กันคำขอพร้อมกันได้จริง — เช็คก่อนเขียนที่ระดับแอปมีช่องว่างเสมอ |
| retry | ใช้คีย์เดิม ไม่สร้างแถวใหม่ | เคส "iShip สำเร็จแต่คำตอบหาย" — ยิงซ้ำจะชน unique แทนเปิดใบที่สอง |
| ไม่ retry อัตโนมัติ | ให้ร้านกดเอง | ทุกครั้งคือเงินจริง ระบบไม่ควรตัดสินใจใช้เงินแทนร้าน |
| ใบปะหน้า | proxy ผ่านเซิร์ฟเวอร์เสมอ | ถ้าให้เบราว์เซอร์ยิงตรง ต้องส่ง token ลงหน้าเว็บ = ทุกคนที่เปิด devtools เห็น |
| ไม่ poll สถานะ | พึ่ง webhook + กดดูเอง | poll ทุกพัสดุ = ค่าใช้จ่ายโตตามจำนวนออเดอร์โดยไม่มีคนดู |
| ห้ามแตะ `Order.status` | สถานะจากขนส่งไม่เปลี่ยนสถานะออเดอร์ | กันปั่น Trust Score ด้วยพัสดุปลอม — การยืนยันรับของโดยผู้ซื้อยังเป็นเงื่อนไขเดียว |
| snapshot ที่อยู่ | freeze ไม่อ้างอิงสด | อ้างสดแล้วร้านแก้ค่าตั้งต้นทีหลัง = ประวัติพัสดุเก่าเปลี่ยนตาม อธิบายกับขนส่งไม่ได้ |
| ไม่เก็บยอดเงิน iShip | โดยเจตนา | เก็บแล้วสื่อผิดว่า Deep ดูแลเงินก้อนนั้น |

---

## 6. ที่ค้างอยู่ (carry)

### ต้องทำ
1. **browser QA** — ยังไม่เคยกดใช้ในเบราว์เซอร์เลยสักครั้ง ผ่านแต่ static/unit
   (บทเรียนโปรเจกต์: grep+tsc ผ่าน ≠ ใช้งานได้ — เคยเจอ 4 บั๊ก POS ที่ผ่าน static แต่พังจริง)
2. **รัน E2E** `e2e/iship-shipping.spec.ts` — ต้องมี dev server + `ISHIP_DRY_RUN=1`
   ```
   node_modules/.bin/dotenv -e <path>/.env.local -- npx playwright test e2e/iship-shipping.spec.ts
   ```
3. **smoke test ของจริงบน prod** — ตาม checklist ใน `TestCase.md` §8 (สร้าง 1 ใบ → ตรวจ → ยกเลิกทันที)
   จุดที่ต้องพิสูจน์ให้ได้: **ตำบล/อำเภอลงถูกช่องที่หลังบ้าน iShip**
4. **Impeccable** — `/impeccable critique` + `/impeccable clarify`
5. **retro** ปลาย phase

### รอตัดสินใจ
- **webhook** — user พักไว้ก่อน (2026-07-26) โค้ดอยู่ครบ ไม่ตั้ง `ISHIP_WEBHOOK_SECRET` = route ตอบ 404 ทุกคำขอ
  เปิดใช้ = สุ่ม secret + ใส่ env ทั้ง dev/prod + แจ้ง URL `/api/webhooks/iship/<secret>` ให้ iShip
- **known-gap**: ปุ่ม "สร้างพัสดุ" ในแชทใช้ค่าตั้งต้นของร้านล้วน ปรับขนาด/น้ำหนักรายใบไม่ได้ (ต้องไปหน้าคำสั่งซื้อ)
- **known-gap**: `worktree feat-i-ship-integrate` ไม่มี `.env.local` ของตัวเอง — ยืมจาก `main-3` ตอน build/migrate

### Open Question ที่ตอบเองไม่ได้
| # | คำถาม | ผลกระทบ |
|---|--------|---------|
| OQ-1 | iShip มีลายเซ็นยืนยัน webhook ไหม | ตอนนี้พึ่ง secret ใน path — ถ้ามีลายเซ็นควรเปลี่ยนไปตรวจลายเซ็น |
| OQ-2 | iShip dedupe ตาม `custom_order_id` จริงไหม | ถ้าไม่ เรากันซ้ำได้เฉพาะฝั่งเรา — พิสูจน์ตอน smoke test |
| OQ-3 | ตั้ง webhook URL ที่ไหนในหลังบ้าน iShip | เอกสารบอกแค่ "แจ้ง URL ให้ผู้ให้บริการ" ไม่มี endpoint ให้ตั้งเอง |

---

## 7. env

| ตัวแปร | จำเป็น | หมายเหตุ |
|-------|--------|----------|
| `CHANNEL_TOKEN_KEY` | ใช่ | **มีอยู่แล้ว** (feat 00018) — ใช้เข้ารหัส token ของร้าน |
| `ISHIP_BASE_URL` | ไม่ | ว่าง = production ของ iShip |
| `ISHIP_DRY_RUN` | ไม่ | `1` = โหมดจำลอง (dev/QA เท่านั้น) |
| `ISHIP_WEBHOOK_SECRET` | ยังไม่ตั้ง | ตั้งเมื่อจะเปิด webhook |

**token ของร้านไม่ได้อยู่ใน env** — ร้านวางเองผ่านหน้าตั้งค่า ระบบเข้ารหัสเก็บใน DB

---

## 8. คำสั่งที่ใช้บ่อย

```bash
# type-check (worktree นี้ไม่มี node_modules/.bin/tsc ตรง ๆ)
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json

# unit test
npx vitest run src/lib/iship

# build จริง (ต้องยืม env — worktree นี้ไม่มี .env.local)
set -a; . <path>/main-3/.env.local; set +a
npm run build > /tmp/b.log 2>&1; echo "exit=$?"

# migration (ต้องขอ user ยืนยันก่อน — dev=prod แชร์ DB)
cd <worktree ที่มี .env.local> && set -a && . ./.env.local && set +a
./node_modules/.bin/prisma migrate deploy --schema <path>/prisma/schema.prisma

# ห้ามรัน: prisma migrate dev, prisma db pull  (จะลบ partial unique index ที่เขียนมือ)
```

---

## 9. ประวัติ commit สำคัญ

| commit | เรื่อง |
|--------|-------|
| `56caafad` | PRD + BRD |
| `db7d25fc` | schema + migration |
| `f85cc730` | lib/iship (client + mapping + errors) |
| `ef330397` | service layer + guard |
| `7633b392` | API routes 14 ตัว + webhook |
| `04b07a30` | SRS + SDS + API docs |
| `81f7962b` | หน้าตั้งค่าการจัดส่ง |
| `9d33b0d4` | ส่วนการจัดส่งในหน้าออเดอร์ |
| `f2eed565` | โหมด AUTO/ASK ตอนสร้างออเดอร์ |
| `18ea494b` | พิมพ์ใบปะหน้าหลายใบ |
| `b652264f` | ผู้ซื้อเห็นเลขติดตาม + prefill ฟอร์มแจ้งจัดส่ง |
| `d737dd12` | E2E spec + timing-safe webhook secret |
| `6a8549c4` | **merge → main รอบแรก (deploy prod)** |
| `dc78363c` | กรอกข้อมูลผู้รับตรงจุดสร้างพัสดุ + เขียนกลับเข้าออเดอร์ |
| `0b067517` | สร้างพัสดุ + แจ้งเลขในแชท |
| `dea044c8` | ส่วนขยาย: แผน implement เปรียบเทียบราคาขนส่ง iShip (9 tasks) |
| `0aa01051` | refactor: รวม mapping payload ของ check-price ไว้ที่เดียว (`buildCheckPricePayload`) |
| `6f0da506` | `assembleCompareResult` — รวม/เรียงผลเทียบราคาหลายขนส่ง (pure + tests) |
| `4d48985e` | `compareShippingPrices` — fan-out check-price ทุกขนส่งของร้านในคำขอเดียว |
| `e2018f5c` | `POST /api/seller/iship/price/compare` — endpoint เทียบราคาทุกขนส่ง |
| `7dfc7cb4` | **merge → main (deploy prod ล่าสุด) — รวม UI `PriceCompareSheet` + wiring ใน `ShipmentCreateForm`** |
