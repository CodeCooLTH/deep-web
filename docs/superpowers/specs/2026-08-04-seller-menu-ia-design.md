# Seller Menu IA — จัดกลุ่มเมนูใหม่ + dropdown โปรไฟล์

**วันที่:** 2026-08-04
**สถานะ:** รอ user review → safepay-ux gate → implement
**ผู้ตัดสิน scope:** user (2026-08-04)

---

## 1. ปัญหาที่แก้

เมนู sidebar ฝั่งร้านโตมาตามลำดับที่ feature ถูกสร้าง ไม่ใช่ตามวิธีที่ผู้ขายคิด — ตอนนี้มี 7 กลุ่ม
(`ANALYTICS` `ORDERS` `PRODUCTS` `CUSTOMERS` `ผู้ช่วยอัตโนมัติ` `SHOPS` `STORE` `บัญชีของฉัน`)
โดยกลุ่ม `STORE` กลายเป็นถังรวมของ 8 อย่างที่ไม่เกี่ยวกัน (ตั้งค่าร้าน + สต็อก + กระเป๋าเงิน +
ค่าใช้จ่าย + พนักงาน + แพ็กเกจ + การจัดส่ง + โปรไฟล์สาธารณะ) และ `/settings/channels`
(ช่องทางการขาย) ไม่มีลิงก์ใน sidebar เลย เข้าได้จากหน้าแชทเท่านั้น

ส่วน dropdown มุมขวาบนมี 4 รายการที่ทับกับ sidebar (`แพ็กเกจธุรกิจ`, `โปรไฟล์ / ตั้งค่าร้าน`)
ทำให้ไม่ชัดว่าอะไรเป็นของ "ตัวคน" อะไรเป็นของ "ร้าน"

## 2. ขอบเขต

**อยู่ในขอบเขต**
- โครงกลุ่ม + ลำดับ + ป้ายชื่อของ `sellerMenuItems`
- การ์ดแพ็กเกจใน sidenav — เงื่อนไขการแสดง
- dropdown โปรไฟล์มุมขวาบน (`UserDropdownDetailed.tsx`)
- ป้าย `/orders` ที่เปลี่ยนตามประเภทกิจการ + จุดที่ต้องซิงค์ป้ายนั้น (bottom nav, ชื่อหน้าบนมือถือ)
- เพิ่ม `/settings/channels` เข้า sidebar

**นอกขอบเขต** — ไม่แตะรอบนี้
- เนื้อในของแต่ละหน้า (ไม่มีหน้าใหม่ ไม่ลบหน้า)
- `SellerBottomNav` โครงสร้าง 5 ช่อง + speed-dial (แก้เฉพาะป้ายช่อง "คำสั่งซื้อ")
- ระบบเมนูลัดปักหมุด (`shortcut.service`) — ได้ป้าย/กลุ่มใหม่อัตโนมัติเพราะอ่านจาก SSOT เดียวกัน
- ฝั่ง buyer (Vuexy) และ admin

## 3. โครงเมนูใหม่

### 3.1 การ์ดแพ็กเกจ (เหนือกลุ่มแรก)

| ประเภทบัญชีที่ active | การ์ด |
|---|---|
| `BUSINESS` | **แสดงเสมอ** ทุกสถานะ รวม Free (`NOT_SUBSCRIBED`) |
| `PERSONAL` | **ไม่แสดงเลย** — layout ไม่ส่ง `sidenavHeaderSlot` |

`ShopPackageSidenavCard` เองไม่ต้องแก้ (แสดง "Free" เมื่อ `NOT_SUBSCRIBED` อยู่แล้ว) —
เงื่อนไขอยู่ที่ `layout.tsx` ตรงที่ประกอบ slot

### 3.2 กลุ่มและรายการ (ร้าน `ONLINE_SALES`)

| กลุ่ม | ป้าย | route | slug (คงเดิม) | เปลี่ยนอะไร |
|---|---|---|---|---|
| **ANALYTICS** | ภาพรวมร้านค้า | `/dashboard` | `seller:dashboard` | — |
| | ภาพรวมกำไร/ขาดทุน | `/sales` | `seller:sales` | เปลี่ยนป้ายจาก "ภาพรวมยอดขาย" |
| **MANAGE** | คำสั่งซื้อ | `/orders` | `seller:orders` | ป้ายผันตาม vertical (§3.4) |
| | การประมูล | `/auctions` | `seller:auctions` | ย้ายจาก ORDERS |
| | สินค้า | `/products` | `seller:products` | ย้ายจาก PRODUCTS |
| | จัดการสต็อก | `/inventory` | `seller:inventory` | ย้ายจาก STORE |
| | ลูกค้า | `/customers` | `seller:customers` | ย้ายจาก CUSTOMERS |
| | ค่าใช้จ่าย | `/expenses` | `seller:expenses` | ย้ายจาก STORE |
| **CHAT** | ข้อความ | `/inbox` | `seller:inbox` | ย้ายจาก CUSTOMERS |
| | ตอบกลับอัตโนมัติ | `/settings/auto-reply` | `seller:settings-auto-reply` | เปลี่ยนป้ายจาก "Auto Reply" |
| | ผู้ช่วยอัตโนมัติ | `/settings/chatbot` | `seller:settings-chatbot` | เปลี่ยนป้ายจาก "ChatBot" |
| **SHOPS** | รีวิว | `/reviews` | `seller:reviews` | ย้ายจาก PRODUCTS |
| | ระดับร้าน | `/verification` | `seller:verification` | เปลี่ยนป้ายจาก "ยืนยันตน" |
| | ความสำเร็จ | `/badges` | `seller:badges` | — |
| | กระเป๋าเงิน | `/wallet` | `seller:wallet` | ย้ายจาก STORE |
| | แพ็กเกจของฉัน | `/subscriptions` | `seller:subscriptions` | ย้ายจาก STORE |
| | พนักงาน | `/admins` | `seller:admins` | ย้ายจาก STORE |
| **SETTING** | ร้านค้า | `/shop` | `seller:shop` | เปลี่ยนป้ายจาก "ตั้งค่าร้านค้า" |
| | ตั้งค่าหน้าร้าน | `/public-profile` | `seller:public-profile` | เปลี่ยนป้ายจาก "โปรไฟล์สาธารณะ" |
| | การจัดส่ง | `/settings` | `seller:settings` | — |
| | ช่องทางการขาย | `/settings/channels` | `seller:settings-channels` | **รายการใหม่** |

**หายไปทั้งกลุ่ม:** `บัญชีของฉัน` — `/account` ย้ายไปอยู่ใน dropdown อย่างเดียว

**เคยมีรายการ "โปรไฟล์ ↗" (ลิงก์ออกไปหน้าร้านจริง) ในกลุ่มนี้ — user ให้ถอดออก 2026-08-04**
ตอนถอดได้ลบ route `/go/profile` ที่สร้างมารองรับมันทิ้งด้วย และคืน `AppMenu.tsx` กลับสภาพเดิม
(การรองรับ `target='_blank'` ไม่มีผู้ใช้แล้ว) ทางเข้าหน้าร้านจริงเหลือที่ **dropdown มุมขวาบน**
(desktop) กับ **แผงบัญชีในหน้าแรก** (มือถือ) ซึ่งเป็นที่ของ "ตัวคน" อยู่แล้ว ไม่ใช่เมนูตั้งค่าร้าน

ป้าย "ตั้งค่าหน้าร้าน" (`/public-profile`) ยังคงชื่อใหม่ไว้ — เดิมชื่อ "โปรไฟล์สาธารณะ" ซึ่งอ่านแล้ว
แยกไม่ออกว่าเป็นหน้าตั้งค่าหรือหน้าร้านจริง ชื่อใหม่บอกตรง ๆ ว่าเป็นที่ตั้งว่าหน้าร้านจะโชว์อะไร

### 3.3 กลุ่ม MANAGE ตามประเภทกิจการ

ตัวกรอง `applyVerticalMenu` คงกติกาเดิมทุกบรรทัด เปลี่ยนแค่ว่ารายการไปอยู่กลุ่มไหน

| vertical | MANAGE ประกอบด้วย |
|---|---|
| `ONLINE_SALES` | คำสั่งซื้อ · การประมูล · สินค้า · จัดการสต็อก · ลูกค้า · ค่าใช้จ่าย |
| `SERVICE_QUEUE` | ใบสั่งงาน · สินค้า · คิวงาน · ลูกค้า · ค่าใช้จ่าย |
| `LODGING` | บิลเข้าพัก · ห้องพัก · ปฏิทินการจอง · การจอง · แม่บ้าน · ลูกค้า · ค่าใช้จ่าย |

### 3.4 ป้าย `/orders` ผันตามประเภทกิจการ

| vertical | ป้าย |
|---|---|
| `ONLINE_SALES` | คำสั่งซื้อ |
| `SERVICE_QUEUE` | ใบสั่งงาน |
| `LODGING` | บิลเข้าพัก |
| ค่าที่ไม่รู้จัก | คำสั่งซื้อ (fail-safe ตรงกับ `applyVerticalMenu`) |

เลี่ยงคำว่า "การจอง" สำหรับ `LODGING` เพราะชนกับเมนู `/bookings` ที่มีอยู่แล้วตรงตัว

ทำเป็น transform ตัวใหม่ `applyOrderLabel(items, vertical)` วางใน `resolveVisibleSellerMenu`
ไม่แก้ค่าใน `sellerMenuItems` ต้นฉบับ (pattern เดียวกับ `applyInventoryGate`) — เพราะ
`getSellerPageTitle.ts` import array ต้นฉบับตรง ๆ ตอน module load ซึ่งไม่รู้จัก vertical

**จุดที่ต้องซิงค์ป้ายเดียวกัน** (ไม่งั้นผู้ใช้เห็นคนละคำใน 3 ที่บนหน้าจอเดียว)
1. sidebar — ผ่าน `applyOrderLabel`
2. `SellerBottomNav` ช่อง "คำสั่งซื้อ" — รับ prop `orderLabel` จาก layout
3. ชื่อหน้าบน `SellerMobileHeader` — `getSellerPageTitle` รับ override สำหรับ prefix `/orders`

`ShopQuickLinks.tsx` ก็คัดป้ายมาจากเมนูเช่นกัน — อัปเดตป้ายที่เปลี่ยนให้ตรง SSOT

## 4. dropdown โปรไฟล์มุมขวาบน

```
┌ กล่อง active (ชื่อ + บทบาท)          ─ คงเดิม
│
├ บัญชีทั้งหมด                          ─ เปลี่ยนป้ายจาก "สลับบัญชี", แสดงเสมอ
│   · ร้านส่วนตัว        (ไม่มี → ปุ่ม "สร้างร้านส่วนตัวของฉัน")
│   · ธุรกิจอื่น ๆ
│   · ไม่มีบัญชีอื่นเลย  → ปุ่ม "สร้างธุรกิจใหม่" → /business/create
├ ─────────
├ ข้อมูลส่วนตัว   → /account
├ โปรไฟล์ ↗       → /b/{slug} | /u/{username}
├ ─────────
└ ออกจากระบบ
```

- รายการบัญชี **ไม่รวมตัวที่ active** (อยู่ในกล่องบนสุดแล้ว)
- หัวข้อ "บัญชีทั้งหมด" แสดงเสมอ — เดิมซ่อนทั้งบล็อกเมื่อไม่มี business membership ทำให้คน
  ที่มีแต่ร้านส่วนตัวไม่มีทางสร้างธุรกิจจากที่นี่
- ตัดออก 2 รายการ: **แพ็กเกจธุรกิจ** (การ์ดใน sidenav พาไป `/business` แล้ว) และ
  **โปรไฟล์ / ตั้งค่าร้าน** (= `/shop` ซึ่งอยู่ในกลุ่ม SETTING แล้ว)
- การเรียก `/api/business/context` เดิม fetch เฉพาะเมื่อ `hasBusinessMembership` — ต้องเรียก
  ทุกกรณี เพราะตอนนี้ต้องรู้ว่ามีร้านส่วนตัวหรือยัง แม้ไม่มี business เลย

## 5. กติกาที่ห้ามพลาด

1. **slug ของรายการห้ามเปลี่ยน** — `SellerShortcutPreference.slugs` ในฐานข้อมูลเก็บ slug ไว้ ถ้าเปลี่ยนแล้ว
   เมนูลัดที่ผู้ใช้ปักหมุดไว้จะหลุดทั้งหมดเงียบ ๆ (`ShortcutSlugNotInCatalogError`).
   slug ของ **กลุ่ม** เปลี่ยนได้ (grep แล้วไม่มีใครอ้างถึงนอกไฟล์เมนู)
2. **การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์** — ทุก route ยังต้องมี server-side guard เดิมครบ
   งานนี้ไม่แตะ guard สักตัว
3. **ห้าม emoji** ทุกจุด ใช้ icon tabler ที่ verify แล้วว่ามีจริง (Hard Rule 12)
4. icon ของรายการเดิมใช้ตัวเดิมทั้งหมด — ตัวใหม่มีตัวเดียวคือ "ช่องทางการขาย"
   (เสนอ `plug-connected`; ต้อง verify กับ tabler ก่อนใช้ และให้ ux เคาะ)
5. `applyChatBadge` ยังเกาะ `seller:inbox` เหมือนเดิม — ไม่มีตัวกรองไหนซ่อนเมนูนั้น

## 6. ไฟล์ที่จะแตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/seller-menu.ts` | จัดกลุ่ม/ป้ายใหม่ + เพิ่ม `applyOrderLabel` + เพิ่มรายการ channels |
| `src/app/(paces)/seller/(dashboard)/layout.tsx` | ซ่อนการ์ดแพ็กเกจเมื่อ PERSONAL + ส่ง `orderLabel` |
| `src/layouts/components/TopBar/components/UserDropdownDetailed.tsx` | โครง dropdown ใหม่ |
| `src/app/(paces)/seller/(dashboard)/_shared/SellerBottomNav.tsx` | รับ `orderLabel` |
| `src/app/(paces)/seller/(dashboard)/_shared/SellerMobileHeader.tsx` | ส่ง override ชื่อหน้า `/orders` |
| `src/app/(paces)/seller/(dashboard)/_shared/getSellerPageTitle.ts` | รับ override |
| `src/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks.tsx` | ซิงค์ป้ายที่เปลี่ยน |

## 7. การตรวจ

- `tsc` ผ่าน
- browser QA บน `seller.deepth.local:4000` — ร้าน `ONLINE_SALES` และ `PERSONAL`
  (ตรวจว่าการ์ดแพ็กเกจหายจริง), dropdown ทั้ง 3 กรณี (มีธุรกิจ / มีแต่ร้านส่วนตัว / ไม่มีร้านส่วนตัว)
- ปักหมุดเมนูลัดไว้ก่อนแก้ แล้วเช็คว่ายังอยู่ครบหลังแก้ (พิสูจน์ว่า slug ไม่หลุด)
- `/impeccable critique` + `/impeccable clarify` ตามที่ Hard Rule 8 บังคับ

## 8. หนี้ที่รับไว้โดยรู้ตัว

- **ไม่มีชุดเอกสาร feature ตาม Hard Rule 11** — user ตัดสิน 2026-08-04 ให้ใช้ spec สั้นฉบับนี้
  แทน PRD/BRD/SRS เต็มชุด เพราะเป็นการจัดวางของเดิม ไม่มี data model / API / business rule ใหม่
- ป้าย "คำสั่งซื้อ" ที่ฝังอยู่ใน heading ของหน้า `/orders` เองและใน copy อื่น ๆ ยังไม่ผันตาม
  vertical รอบนี้ — ทำเฉพาะ 3 จุดใน §3.4
