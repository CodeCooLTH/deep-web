# Lightbox เปิดสินค้า/คลิปปักหมุดบนเดสก์ท็อป — `/u/[username]` + `/b/[slug]`

> ที่มา: user 2026-08-11 ส่งภาพ lightbox โพสต์ของ Instagram มา "อยากให้เวลาอยู่บน desktop
> แล้วเปิดสินค้า หรือคลิปบนปักหมุด แสดงแบบนี้" — ผ่าน `safepay-ux` 2 รอบ (สเปก + delta)
> **ยังไม่ได้เริ่ม implement เลย**

## มติที่ user เคาะแล้ว

| ข้อ | มติ |
|---|---|
| deep link (`?p=`) | **ทำ** |
| swipe บนมือถือ | **ไม่ทำ** |
| carousel รูปย่อยในสินค้าเดียว | **ทำ** |
| ปุ่มถูกใจของคลิป | **ไม่ทำ** (เป็นตัวเลข snapshot อ่านอย่างเดียว) |

## โครง

**shell ตัวเดียว** (`ProfileLightbox.tsx` ใหม่ วางข้าง `v2/ResponsiveSheet.tsx`) รับ `mediaSlot`/`panelSlot`
เป็น render prop — สินค้ากับคลิปสลับแค่ 2 อย่าง: ตัวสื่อ (`<img>` vs `<iframe>` ที่ต้องกดเล่นก่อน)
และเนื้อในแผง · **เหตุผลไม่ใช่โค้ดง่ายกว่า** แต่เพราะ chrome (ฉากหลัง · scroll-lock · focus trap ·
ปุ่มปิด · ลูกศร · history) เหมือนกันหมด และกลุ่มนี้คือจุดที่โปรเจกต์นี้พลาดซ้ำมาหลายรอบ
(`overlay-scroll-lock.md`) ก็อปไปสองที่ = วางกับดักสองใบ

- **เดสก์ท็อป ≥900px** (Vuexy `md`): สื่อซ้าย + แผงขวาคงที่ 380px · **<900px**: ซ้อนแนวตั้ง สื่อบน แผงล่าง CTA sticky
  (เลข 900 มาจาก: แผงต้องการ ≥380px ถึงอ่านออก ถ้าตัดที่ 768 สื่อเหลือ ~388px แคบเกิน)
- **ฉากหลัง `rgba(47,43,61,.94)` ไม่ใช่ดำสนิท** — `DESIGN.md` ระบุว่า Photo-Scrim Exception ใช้ได้เฉพาะตอนทับรูปของผู้ใช้ พื้นของโมดัลต้องมาจาก Ink Plum
- ลูกศร ‹ › และ ✕ ขนาด 44×44 **แสดงตลอด ไม่ hover-only** (PRODUCT.md ระบุกลุ่มผู้ใช้ digital-literacy ต่ำ)
- ที่ใบแรก/ใบสุดท้าย ปุ่ม **disabled ไม่วนกลับ** (ต่างจาก `ProfileTabs` ที่วน เพราะแท็บคือหมวดหมู่ปิด ส่วนนี่คือฟีดที่มีจุดจบ)

## แผงขวา — ตัดจากภาพ IG 6 อย่าง เพราะไม่มีของจริงรองรับ

Follow (ปุ่มติดตามในระบบเราก็ disabled "เร็ว ๆ นี้" อยู่แล้ว) · เมนู ⋯ · รายการคอมเมนต์
(`Review` ผูก `Order` แบบ 1:1 ไม่ได้ผูกสินค้า) · แชร์ · บันทึก · ช่องพิมพ์คอมเมนต์

**ที่เหลืออยู่จริง:** อวตาร+ชื่อร้าน (non-interactive) · badge ปักหมุด · ชื่อสินค้า ·
`shortDescription` · **ราคา (เด่นสุด 22px/800)** · `ProductLikeButton` ของจริง · `soldCount` ·
**CTA "สอบถามสินค้านี้"** (แทนที่ช่องพิมพ์คอมเมนต์) — คลิปได้ โลโก้แพลตฟอร์ม + `@account` +
`caption` + สถิติ non-interactive + CTA "แชทกับร้าน"

## Deep link

```
/u/[username]?p=<productId>       → แท็บสินค้า + lightbox
/u/[username]?clip=<shopVideoId>  → แท็บปักหมุด + lightbox
```
แยกคีย์ ไม่ใช้คีย์เดียว เพราะคีย์เดียวบังคับให้โค้ดต้อง "เดา" ว่า id นี้เป็นของแท็บไหน

- 🛑 **ห้ามให้ Server Component เริ่ม `await searchParams`** — ตอนนี้ประกาศ type ไว้แต่ไม่เคยใช้จริง
  ถ้าเริ่มอ่าน Next จะเปลี่ยน navigation เป็น server refetch เต็มรูป **ทุกครั้งที่กด ‹ ›** = โหลดใหม่ทั้งหน้า
  ⇒ อ่าน `useSearchParams()` ที่ `ShopProfile.tsx` (client อยู่แล้ว) แทน
- `ProfileTabs` ต้องรับ prop ใหม่ `initialActiveKey` และใช้ **lazy initializer** `useState(() => ...)`
  ไม่ใช่ `useEffect` (กันเฟรมที่กระพริบไปทับแท็บ 0 ก่อน)
- **id ไม่มีจริง/สินค้าปิดขาย** → ไม่เปิด lightbox ไม่ toast **ตัด param ทิ้งเงียบด้วย `router.replace`**
  (ลิงก์เก่าที่สินค้าถูกปิดไปแล้วเป็นเรื่องปกติ ไม่ใช่ความผิดพลาดที่ต้องแจ้ง)
- **ประวัติ: `push` ตอนเปิดครั้งแรก · `replace` ตอนกด ‹ ›** ⇒ back ปิด lightbox เสมอ และไม่ว่าเลื่อนกี่ใบ
  ก็ไม่ต้องกด back ซ้ำ ๆ · ทุกคำสั่งต้องมี `{ scroll: false }` (🛑 `SearchBox.tsx` ที่มีอยู่ไม่ได้ใส่ อย่าก็อปมา)
- ⚠️ `useSearchParams()` ต้องเช็คเรื่อง `<Suspense>` กับเอกสาร Next 16 ใน `node_modules/next/dist/docs` ก่อน (AGENTS.md)

## Carousel รูปย่อย

- `SerializedProduct` เพิ่ม `images: string[]` (คง `imageUrl` ไว้ ให้ derive `= images[0] ?? null` กัน drift)
- แก้ **2 ที่**: `u/[username]/page.tsx::serializeProductRow()` (บรรทัด ~178-189) + ฟังก์ชันเทียบเท่าใน `b/[slug]/page.tsx` (**เปิดยืนยันชื่อจริงก่อน ไม่เดาว่าเหมือนกัน**)
- pattern แปลง Json→URL มีอยู่แล้วในไฟล์เดียวกัน: `((r.images as string[]) ?? []).map(toFileUrl).filter(Boolean)`
- 🛑 **`Product.images` ไม่มี `maxLength` ใน `validations.ts:709` เลย** (ต่างจาก `Room.images` และรีวิวที่ cap 4)
  ⇒ **cap 10 รูปตอน serialize** ไม่งั้น payload ของกริดบวมตามจำนวนรูปของทุกสินค้ารวมกัน
  (เลือก cap แทน lazy-fetch เพราะ lazy ต้องมี endpoint + skeleton + prefetch กันกระพริบตอนกด ‹ › รัว)
- 🛑 **ลูกศร ‹ › = ข้ามสินค้าเท่านั้น ทั้งเมาส์และคีย์บอร์ด ไม่เปลี่ยนความหมาย**
  รูปย่อยใช้คนละกลไก: **แตะโซนซ้าย/ขวาของตัวรูป (40/40 เว้นกลาง 20%)** + จุดบอกตำแหน่งที่เป็น
  `<button>` จริงกดได้ · คีย์บอร์ดใช้ Tab ไปที่จุดแล้ว Enter **ไม่ยึดปุ่มลูกศรซ้ำ**
- สินค้ารูปเดียว = ไม่มีจุด ไม่มี tap-zone ไม่มีแม้ `cursor:pointer`
- carousel **ไม่แตะ URL ไม่เข้าประวัติ** (local state ล้วนใน media slot) · shell ไม่รู้จักคำว่ารูปย่อยเลย

## 🛑 2 อย่างที่ต้องแก้พ่วง ไม่งั้นพังเงียบ

1. **hover overlay บนไทล์จะกลายเป็นคำโกหก** — ตอนนี้ขึ้น "สอบถามสินค้านี้" + ไอคอนแชท (เพราะคลิกแล้วไปแชทจริง)
   พอเปลี่ยนเป็นเปิด lightbox ต้องเปลี่ยนเป็น "ดูสินค้านี้" + `tabler-zoom-in` **ในคอมมิตเดียวกัน**
2. **ปุ่มถูกใจจะไม่ sync** — ถ้าไทล์กับแผงต่างคนต่างถือ state กดในแผงแล้วปิดกลับมาไทล์โชว์เลขเก่า
   ⇒ ยก `liked`/`count` ขึ้นไปที่ `ProfileRightContent`
3. **ปุ่มทักแชทต้องไม่หายไป** — ตอนนี้ทั้งไทล์คือปุ่มทักแชท พอเปลี่ยนเป็นเปิด lightbox ทางเข้าเดิมหายทันที
   (คลาสเดียวกับ `seller-action-placement.md` §5.1) → ย้ายไปเป็น CTA ในแผง

## บังคับ

`useLockBodyScroll` (`docs/conventions/overlay-scroll-lock.md`) · ทุก `overflow-y-auto` ข้างในต้องมี
`overscroll-contain` · focus trap + คืนโฟกัสไปที่ไทล์เดิมตอนปิด · ปิดได้ 4 ทาง (✕ / Esc / คลิกฉากหลัง /
ปุ่ม back) **คลิกบนตัวรูปเองไม่ปิด** · ทุก interaction ต้องทำงานได้โดยไม่มี session

## ไฟล์ที่เกี่ยวข้อง

`v2/ShopProfile.tsx` · `v2/ProfileTabs.tsx` · `v2/ShopVideos.tsx` (`VideoCell` — reuse กลไก gate
ก่อนโหลด iframe ทั้งหมด) · `v2/ProductLikeButton.tsx` · `v2/ResponsiveSheet.tsx` ·
`profile/index.tsx` (`ProductCard.handleAskClick`) · `UserProfileHeader.tsx` (`handleChatClick`) ·
`src/hooks/useLockBodyScroll.ts` · อ้างอิงพฤติกรรม dots+counter: `(paces)/seller/(dashboard)/reviews/components/ReviewImageGallery.tsx`

## ยังไม่ตัดสิน

`MAX_PRODUCT_IMAGES` ตอนอัปโหลด (ตอนนี้ไม่มีเพดานเลย) — เป็น business rule ต้องผ่าน `safepay-product`
