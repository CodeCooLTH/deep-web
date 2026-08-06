# safe-area บน iOS — ใครเป็นคนเว้น และเว้นยังไง

> เหตุการณ์ 2026-08-06: user เทียบภาพหน้าจอเครื่องเดียวกันระหว่างแอปเรากับ Shopee/TrueMoney
> แล้วถามว่า "แถบล่างสูงเท่ากันไหม" — คำตอบคือแถบเราเนื้อหาไม่ได้เล็ก แต่ **ไม่มีเบาะ safe-area
> เลย** label จึงไปนอนคาบแถบ home indicator (เว้นขอบล่าง ~12pt ขณะที่อีกสองแอปเว้น ~36-38pt)

## กฎข้อเดียวที่ต้องจำ

**`env(safe-area-inset-*)` คืน 0 เสมอ ถ้า viewport ไม่มี `viewport-fit=cover`** — เขียน
`pb-[env(safe-area-inset-bottom)]` ไว้สวยแค่ไหนก็ไม่มีผล และ **ไม่มีอะไรฟ้อง**: tsc ผ่าน
build ผ่าน CSS ออกมาถูกต้องทุกบรรทัด มันแค่คำนวณเป็น 0 เงียบ ๆ บนเครื่องจริง

ตอนนี้ตั้งไว้แล้วทั้งสองฝั่ง:

| route group | ไฟล์ | สถานะ |
|---|---|---|
| buyer/landing `(marketing)` | `src/app/(marketing)/layout.tsx` | `viewportFit: 'cover'` (มาแต่เดิม) |
| seller/admin `(paces)` | `src/app/(paces)/layout.tsx` | `viewportFit: 'cover'` (2026-08-06) |

## box-sizing กินเบาะ: `h-18` + `pb-[env(...)]` = แถบไม่โตขึ้น

Tailwind ตั้ง `box-sizing: border-box` ให้ทุก element → padding อยู่ **ข้างใน** ความสูงที่ตั้งไว้
แถบสูง 72px ที่ใส่ `pb-[env(...)]` บน iPhone จึงเหลือเนื้อหา 38px ไม่ใช่ 72px + เบาะ 34px

- ผิด: `h-18 pb-[env(safe-area-inset-bottom)]`
- ถูก: `h-[calc(4.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]`
  (ความสูงรวม inset + padding ดันเนื้อหาขึ้นพ้นแถบ home indicator)

ค่าอื่นที่ผูกกับความสูงแถบต้องขยับตามชุดเดียวกัน — speed-dial, sticky footer ของหน้าอื่น,
`main { padding-bottom }` ใน `src/assets/css/safepay-overrides.css`

## ใครรับ inset

**หลักการ: surface ที่ยึดขอบจอเป็นคนรับ ไม่ใช่ parent** — เพราะ `sticky top-0`/`fixed` ยึดกับ
viewport ไม่ใช่กับ padding ของ wrapper ถ้าไปใส่ padding ที่ wrapper แทน พอเลื่อนหน้าจอ
หัวจะเด้งกลับไปมุดใต้นาฬิกาอยู่ดี

| surface | ที่รับ inset |
|---|---|
| topbar Paces (admin) | `.app-header { padding-top }` — CSS ที่เดียว (sticky + min-h โตตามเอง) |
| shell แชททั้งกลุ่ม `/inbox` | `.chat-shell { padding-top/bottom }` — หัว/แท็บ/ช่องพิมพ์อยู่ข้างในหมด |
| SellerMobileHeader | `pt-[env(safe-area-inset-top)]` ในตัว header เอง |
| หน้าที่ header คืน null | หน้านั้นรับเอง — `/orders` ที่ header sticky ของตัวเอง, `/dashboard` ได้ spacer จาก SellerMobileHeader |
| bottom nav | ความสูง = `calc(4.5rem + inset)` + `pb-[env(...)]` |
| แถบปุ่ม `fixed bottom-0` | `pb-[calc(<padding เดิม>+env(safe-area-inset-bottom))]` |
| แผ่นเต็มจอ `fixed inset-0` | เปลือกชั้นนอกรับ `pt`/`pb` (ถ้ามี variant เดสก์ท็อปที่ไม่เต็มจอ ให้ `lg:pt-0 lg:pb-0`) |

## ตรวจว่าได้ผลจริง

1. `rg "env\(safe-area" src/app/\(paces\)` แล้วถามว่าแต่ละจุดเป็น surface ที่ยึดขอบจริงไหม
2. หลัง build: `find .next -name '*.css' -path '*static*' -print0 | xargs -0 grep -oh 'calc([^;}]*safe-area[^;}]*)'`
   ต้องเห็น `calc(4.5rem + env(safe-area-inset-bottom))` (Tailwind เติมช่องว่างรอบ `+` ให้เอง —
   ถ้าไม่เห็นแปลว่า class ถูก drop ทิ้ง)
3. **ของจริงต้องดูบนเครื่อง** — desktop Chrome คืน 0 ทุกตัว บั๊กคลาสนี้จึงมองไม่เห็นจากเครื่อง dev
   เลย ต้องเปิดบน iPhone (โดยเฉพาะโหมด PWA ที่เพิ่มลงหน้าจอโฮม ซึ่ง inset ล่าง = 34pt)

## HR7

`env(safe-area-inset-*)` ไม่มี token ใน Paces → เป็น carve-out ที่อนุญาต แต่ **ต้องเขียน
comment กำกับบรรทัดเดียวกัน** (`.claude/hooks/theme-guard.sh` เช็คแบบ line-based — comment
อยู่บรรทัดบนไม่นับ)
