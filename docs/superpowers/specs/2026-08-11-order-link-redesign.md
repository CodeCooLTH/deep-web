# Order Link `/o/[token]` — ยกเครื่องให้อยู่ระดับเดียวกับหน้าโปรไฟล์

> ที่มา: user 2026-08-11 "UI บน Orderlink เทียบไม่ได้กับ Public Profile เลย"
> ผ่าน `safepay-ux` 2 รอบ (วินิจฉัย + สเปก implement + delta) — ไฟล์นี้คือมติสุดท้าย

## สถานะ: 2/9 คอมมิตขึ้น prod แล้ว

| # | คอมมิต | สถานะ |
|---|---|---|
| 1 | `shop.logo ?? user.avatar` ทั้ง 2 branch | ✅ `ee000870` |
| 1.5 | สถิติร้าน (`completedOrders`/`avgRating`/`reviewCount`/`channels`) เข้า `PublicOrderData` | ✅ `61c208ac` |
| 2 | ตัด `FrontLayout` ออกจาก `layout.tsx` | ⬜ **มีด่านต้องผ่านก่อน — ดู §ด่าน** |
| 3 | ปก: ตัด `ProfileBanner` (dot-mesh + ปุ่มย้อนกลับ) → `getTierGradient()` ตรง + พิลแบรนด์ · ปก authenticated 140→104 ให้เท่า guest | ⬜ |
| 4 | รวม verify badge + tier chip เป็นแพตเทิร์นเดียวทั้ง 2 จอ | 🟡 ทำบางส่วนแล้วที่ `cc2c3b67` (ชิปได้ `(ระดับ N)` + เลิก hardcode เขียว) เหลือรวม 3 ชิปของ authenticated ให้เหลือทรงเดียวกับ guest |
| 5 | render บล็อกหลักฐานร้าน (สถิติ 2 คอลัมน์ + `ChannelStrip`) **ทั้ง 2 จอ** | ⬜ data พร้อมแล้วจากคอมมิต 1.5 |
| 6 | `PublicProfileFooter` แทน `Footer` การตลาด | ⬜ |
| 7 | CTA authenticated `sticky+mt:auto` → `position:fixed` เหมือน guest | ⬜ |
| 8 | เพิ่ม `lg:880` ให้ guest `maxWidth` (authenticated มีแล้ว) | ⬜ |

## 🛑 ด่านที่ต้องผ่านก่อนคอมมิต 2 (ตรวจกับโค้ดแล้ว ไม่ใช่สมมติฐาน)

ux สรุปว่า "3 จอ auth มีตราแบรนด์ในตัวแล้ว ตัด `FrontLayout` ได้เลย" — **จริงแค่ 1 ใน 3**

| จอ | ทางออกไปหน้าอื่น |
|---|---|
| `OrderAccessBlock.tsx` | มีลิงก์ "กลับหน้าหลัก" จริง (บรรทัด 104) ✅ |
| `ClaimOtpPrompt.tsx` | มีแต่ `<Logo />` — **`Logo.tsx` ไม่มี `href`/`Link` กดไม่ได้** ❌ |
| `PhoneVerifyPrompt.tsx` | เหมือนกัน ❌ |

ตัด `FrontLayout` แบบดิบ ๆ = **2 จอนี้ไม่มีทางออกเลย** ซึ่งคือบั๊กที่ `layout.tsx` ถูกสร้างมาแก้พอดี
(FR-019 เขียนในหัวไฟล์เองว่า "ผู้ซื้อที่เพิ่งล็อกอินสำเร็จมาถึงหน้านี้แล้วไปไหนต่อไม่ได้")
⇒ **ต้องทำ Logo ของ 2 จอนั้นเป็นลิงก์ `/` ในคอมมิตเดียวกัน** คลาสเดียวกับ `seller-action-placement.md` §5.1

## มติที่ user เคาะแล้ว

- **สถิติร้านต้องเห็นทั้ง guest และหลังล็อกอิน** ("ต้องเห็นทั้งคู่ครับ")
- **ปกไล่สี tier ล้อตาม public profile** → ตรวจแล้ว **ไม่ต้องแก้อะไร** ทุกจุดเรียก `getTierGradient()` ตัวเดียวกัน ปกบน order link เจือจางถูกอยู่แล้ว
- **ความสูงปกคง 104px ไม่ยกไปเท่าโปรไฟล์ (176/200/224)** — Operate ต้องประหยัดที่ให้หลักฐานออเดอร์ · เขียนเหตุผลกำกับไว้ในโค้ดด้วย จะได้ไม่มีใครมา "ทำให้เหมือนกัน" ทีหลัง
- **จอหลังล็อกอินเข้ารอบเดียวกัน** ไม่แยกรอบ (ปัญหาที่แก้คือ "สองจอเดินแยกกัน" — แก้จอเดียว = สร้างบั๊กเดิมเวอร์ชันใหม่)

## 🛑 กับดักที่ต้องระวัง

1. **`ShopChannel` มี `accessTokenEnc` + คอลัมน์ตั้งค่าตอบกลับอัตโนมัติในแถวเดียวกัน** สคีมาเขียนกำกับเองว่าห้ามส่งกลับ client — ปลายทางเป็น client component ⇒ **allow-list 5 คีย์เท่านั้น** (`provider`/`name`/`avatarUrl`/`externalId`/`followerCount`) ห้าม `include`
2. **`100dvh` ซ้อน 2 ชั้น** — `FrontLayout` ตั้งที่ root แล้ว `OrderDetailMobile:576` / `OrderAccessBlock:70` ตั้งอีก ⇒ ทุกจอเลื่อนเกินจำเป็น ~64px + ความสูง footer เสมอแม้เนื้อหาสั้นกว่าจอ (คอมมิต 2 แก้ให้)
3. **`getOrderByToken()` ใช้ `include` กับ shop** ⇒ คืน scalar ของ Shop ครบทุกตัวอยู่แล้ว **ไม่ต้องเพิ่ม select** (ux รายงานผิดรอบแรก ตรวจกับโค้ดแล้ว)
4. เกณฑ์ `null` vs `0` ของสถิติต้องตรงกันทั้ง 2 จอ (`null` = ยังไม่มีประวัติ จึงไม่แสดงบล็อก ≠ `0` ที่แปลว่านับแล้วได้ศูนย์)

## ห้ามแตะ

flow การยืนยันทั้งหมด (`resolveOrderAccess()` · discriminator ใน `page.tsx` · `guaranteeOrderLink()`) ·
ข้อความในปุ่ม CTA ทุกคำ (คอมเมนต์ในโค้ดอธิบายไว้ว่าเขียนแบบนั้นเพื่อกันสแกม) ·
การ mask PII ที่ server boundary (`maskPhoneForGuest` · allow-list ใน `guest-order-data.ts`) ·
mutation logic ทั้งชุดใน `OrderDetailMobile`/`PublicOrderClient` ·
state machine ของ 3 จอ auth

## หนี้ที่เจอระหว่างทาง (ไม่ใช่ scope นี้ แต่บันทึกไว้)

- `OrderDetailMobile.tsx` มี font-size นอกแรมป์ 5 จุด (impeccable hook รายงานทุกครั้งที่แตะไฟล์)
- `ProfileTabData.verifiedLevels` ใน `profile/index.tsx` เป็นโค้ดตายจากก่อนรีดีไซน์ 2026-07-26
