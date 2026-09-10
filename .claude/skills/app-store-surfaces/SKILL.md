---
name: app-store-surfaces
description: ใช้ทุกครั้งก่อนแก้อะไรที่เกี่ยวกับกฎ App Store ในเว็บ seller — ซ่อน/เปิดเมนู, ปุ่มจ่ายเงิน, ทางเข้าหน้าซื้อ, ด่าน hidePayments/isPaidFeatureRestricted/isSignUpRestricted. บังคับไล่ให้ครบทุก surface เพราะเมนูมีสองชุดและมือถือคือแอป Trigger เมื่อพูดถึง App Store, 3.1.1, IAP, ซ่อนปุ่มในแอป, hidePayments, ตีกลับ, rejection
---

# ไล่ให้ครบทุก surface ก่อนบอกว่า "แก้แล้ว"

## 🛑 ข้อเดียวที่ทำให้พลาดซ้ำ 3 รอบ

**แอป iOS คือ "มือถือ" ไม่ใช่ "เดสก์ท็อป"** — เมนูฝั่งร้านมีอยู่ **2 ชุดในโค้ด** ที่กรองด้วยกฎ
คนละที่ และ **sidebar ไม่มีอยู่บนมือถือเลย** (`lg:hidden` ครอบการ์ดของมือถือไว้)

| อุปกรณ์ | เมนูมาจาก | ตัวกรอง |
|---|---|---|
| เดสก์ท็อป | sidebar | `applyPaymentRestriction()` ใน `src/lib/seller-menu.ts` |
| **มือถือ = แอป** | การ์ด "จัดการร้าน" ใน `/shop` | `PAYMENT_LINK_URLS` ใน `ShopQuickLinks.tsx` (**สำเนา** ของรายการเมนู) |
| มือถือ (แถบล่าง) | `SellerBottomNav.tsx` | เขียน JSX ทีละช่องด้วยมือ ไม่ได้ map จาก SSOT |

⇒ **แก้ที่ SSOT อย่างเดียวไม่มีผลกับแอป** · นี่คือ Hard Rule 16 (ของสิ่งเดียวกัน สองนิยาม)
ตัวไฟล์เองเขียนเตือนไว้แล้ว — แต่คำเตือนอยู่ในไฟล์ที่คนแก้อีกไฟล์ไม่ได้เปิด

## เช็กลิสต์บังคับ — ทำครบทุกข้อก่อนบอกว่าเสร็จ

เวลาจะ **ซ่อน** หรือ **เปิด** ทางเข้าอะไรก็ตามในแอป ต้องไล่ทั้ง 6 จุดนี้:

- [ ] `src/lib/seller-menu.ts` — `applyPaymentRestriction()` (sidebar เดสก์ท็อป)
- [ ] `src/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks.tsx` — **มือถือ/แอป**
- [ ] `src/app/(paces)/seller/(dashboard)/_shared/SellerBottomNav.tsx` — แถบล่าง + FAB
- [ ] **หน้าปลายทางเอง** — ต้องมีด่าน `shouldHidePayments()` + `redirect()` (ซ่อนเมนู ≠ ควบคุมสิทธิ์ · พิมพ์ URL ตรงได้)
- [ ] **การ์ด/แบนเนอร์ที่มีปุ่มชวนจ่ายเงิน** — `LockedStateBanner` · `AiSettingForm` · `AiSuggestPanel` · `ProductStockCardV2` · หน้าเชิญพนักงาน
- [ ] `src/layouts/components/TopBar/components/UserDropdownDetailed.tsx` — เมนูบัญชี

**วิธีหาให้ครบ ไม่ใช่นึกเอา:**
```bash
grep -rln "hidePayments\|shouldHidePayments\|isPaymentRestricted\|isPaidFeatureRestricted" \
  "src/app/(paces)/seller" src/layouts src/lib | grep -v __tests__
```

## 🛑 กฎที่แยกกันคนละข้อ — อย่าเหมารวม

| ธง | ห้ามอะไร | ผ่อนได้เมื่อ |
|---|---|---|
| `isPaymentRestricted` | ช่องทางจ่ายเงิน **ที่ไม่ผ่าน Apple** + คำเชิญให้ไปจ่าย | ของนั้นขายเป็น IAP แล้ว |
| `isSignUpRestricted` | การสมัครบัญชีธุรกิจในแอป | Apple สั่งตรง ๆ ให้เอาออก (2026-08-23) — **ยังผ่อนไม่ได้** |
| `isPaidFeatureRestricted` | ใช้ของที่จ่ายเงินมาแล้วแต่ไม่มีขายเป็น IAP (3.1.3(b)) | ขายของนั้นเป็น IAP ด้วย |

**สามตัวนี้ค่าเท่ากัน (`ios`) แต่ตอบคนละคำถาม** — ผ่อนตัวเดียวแล้วอีกสองตัวหลุดตามคือบั๊ก
ที่ `app-shell.ts` เตือนไว้เองว่าห้ามยุบรวม

## 🛑 "ซ่อนหมด" ก็ผิดได้เหมือนกัน

ตอนที่ยังไม่มี IAP กฎคือ "ห้ามมีทางไปจ่ายเงินเลย" — **พอมี IAP แล้วกฎกลับด้าน**

ถ้าไม่มีทางเข้าหน้าซื้อในแอปเลย **ทีมรีวิวของ Apple จะสรุปว่าเรายังไม่ได้ทำ IAP แล้วตีกลับ
ข้อเดิม** ทั้งที่โค้ดเสร็จหมดแล้ว · แอปเป็น WebView **พิมพ์ URL เองไม่ได้** ⇒ ไม่มีเมนู = ไม่มีทาง

⇒ ต้องมีทางเข้า **พอดี 1 ทาง** และต้องกดได้จริง **บนมือถือ**

## วิธีพิสูจน์ว่าแก้จริง ไม่ใช่คิดว่าแก้

1. **เทสระดับพฤติกรรม** ไม่ใช่แค่สแกนไฟล์ — ยืนยัน "เมนูนี้ต้องอยู่/ต้องหาย" จากผลลัพธ์ของฟังก์ชันจริง
2. **ยิง prod/local ด้วย cookie `deep_shell=app`** แล้วดูว่าเด้งไปไหนจริง
   ```bash
   curl -s -b "deep_shell=app" "https://seller.deepthailand.app/subscriptions" | grep -o "business/subscribe"
   ```
   🛑 Next ส่งหน้าแบบสตรีม ⇒ `redirect()` **ไม่โผล่เป็น HTTP 307** ต้องหาในเนื้อสตรีมแทน
3. **ถามตัวเองว่า "ผู้ใช้จะกดตรงไหน"** — ตอบเป็นลำดับการกดจริงบนมือถือให้ได้
   (เช่น `แถบล่าง → ร้านค้า → จัดการร้าน → แพ็กเกจของฉัน`) ถ้าตอบไม่ได้ = ยังไม่เสร็จ

## หลังแก้เสร็จ

### 🛑 เทสแดงเป็นร้อยพร้อมกัน = ต่อฐานข้อมูลไม่ติด ไม่ใช่โค้ดพัง

**อย่าเพิ่งอ่านชื่อเทสที่แดง** — ไปดูสาเหตุที่ต้นทางก่อนเสมอ:

```bash
# เก็บ log เต็มลงไฟล์ (ห้าม tail ทิ้ง — ดูข้อถัดไปว่าทำไม)
... npx vitest run src/ tests/ > /tmp/vitest.log 2>&1
grep -ciE "PrismaClientInitializationError" /tmp/vitest.log     # ต่อฐานไม่ติด?
grep -iE "Authentication failed|Can't reach" /tmp/vitest.log | head -3   # ไม่ติดเพราะอะไร
```

มี **2 อาการที่หน้าตาเหมือนกันเป๊ะ** แต่คนละเหตุ:

| อาการ | เหตุ | แก้ |
|---|---|---|
| `Can't reach database server` | Docker Desktop ปิดตัวเอง | `docker start deepweb-pg17` (ชื่อนี้ ไม่ใช่ `deepweb-db` ที่ exited ค้างไว้) |
| `Authentication failed ... for` **`postgres`** | **ใส่ user/password ผิด** container ขึ้นอยู่ปกติ | user/pass/db = **`safepay`** ทั้งสามค่า พอร์ต 5434 |

🛑 **`postgres:postgres` เป็นค่าที่คนเดาแล้วผิด** (เกิดจริง 2026-09-10 — เสียเวลาไล่ 141 เทส
ที่ไม่ได้พังสักตัว) เอาค่าจริงจาก container เสมอ ห้ามเดา:

```bash
docker inspect deepweb-pg17 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep ^POSTGRES
```

⚠️ `.env` ชี้ **Supabase (prod)** ⇒ ต้อง override `DATABASE_URL`/`DIRECT_URL` เป็น localhost ทุกครั้ง
ไม่งั้น `tests/setup.ts` fail-closed จะ **ข้ามเทสที่แตะฐานทั้งหมดเงียบ ๆ** แล้วขึ้นเขียวหลอก
(ดู memory `deep-web-local-test-run` · Hard Rule 14 บังคับว่าต้องพิมพ์ localhost ตรง ๆ ห้าม `$(...)`)

### 🛑 อย่าตัดผลลัพธ์ทิ้งก่อนอ่าน

`| tail -8` ให้แค่บรรทัดสรุป — สาเหตุจริงอยู่ต้น log **ผมเคย grep ไฟล์ที่ตัดแล้วได้ 0
แล้วสรุปผิดว่า "ไม่ใช่ปัญหาฐานข้อมูล"** ทั้งที่ในไฟล์เต็มมี 110 บรรทัด · เขียนลงไฟล์แล้วค่อย grep

### อื่น ๆ

- `npx prisma generate` ก่อน `tsc` เสมอถ้าเพิ่ง pull main (client เก่าทำให้เห็น error ที่ไม่มีจริง)
- 🛑 **`.claude/` อยู่ใน `.gitignore`** — สกิล/เอเจนต์ใหม่ต้อง `git add -f` ไม่งั้น commit ผ่านไป
  โดยไม่มีไฟล์นั้น (`git show --stat` ยืนยันจำนวนไฟล์ทุกครั้งที่คอมมิตเมสเสจอ้างถึงไฟล์ใน `.claude/`)
- ก่อน push: `node` อาจไม่อยู่ใน PATH ของ shell ที่รันเบื้องหลัง ⇒
  `export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"`
- แตะเทส `[blocker]` เมื่อไร PR ต้องติดป้าย **แตะด่าน** ไม่งั้นด่าน 0 แดง
