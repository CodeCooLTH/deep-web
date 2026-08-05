# ไฟล์ที่เสิร์ฟจาก root ต้องขึ้นทะเบียนใน `proxy.ts` — ไม่งั้น 404 เฉพาะบน subdomain

## กฎ

🛑 **เพิ่มไฟล์/route ที่เสิร์ฟจาก root ด้วยนามสกุลที่ยังไม่มีใน allow-list ของ `src/proxy.ts` → ต้องเติมนามสกุลนั้นในคอมมิตเดียวกัน**

```ts
// src/proxy.ts — static assets ที่ห้าม rewrite ตาม subdomain
if (/\.(?:json|webmanifest|png|jpe?g|svg|gif|webp|ico|txt|woff2?|css|js|map|m4a|mp3|wav|ogg|aac)$/i.test(pathname)) {
  return NextResponse.next()
}
```

## ทำไม

`proxy.ts` route ตาม subdomain โดย **rewrite path ไปใต้โฟลเดอร์ของ role** — `seller.deepthailand.app/x` → `/seller/x`

ไฟล์ที่เสิร์ฟจาก **root** (ทั้งของใน `public/` และ route ที่ Next สร้างเอง เช่น `src/app/manifest.ts` → `/manifest.webmanifest`) ไม่มีสำเนาอยู่ใต้ `/seller/` หรือ `/admin/` พอโดน rewrite จึงกลายเป็น **404 เฉพาะบน subdomain** ส่วนบน main domain ยังปกติทุกอย่าง

นี่คือเหตุผลที่มันหลุด review ง่ายมาก: เทสบน `deepthailand.app` แล้วผ่าน แต่พังบน `seller.*` / `admin.*` ซึ่งเป็นที่ที่ผู้ใช้จริงอยู่

## เคสที่เกิดขึ้นจริงแล้ว 2 ครั้ง

| วันที่ | นามสกุลที่ลืม | อาการที่ผู้ใช้เจอ |
|---|---|---|
| 2026-07-24 | `.m4a` (+ `mp3/wav/ogg/aac`) | เสียงแจ้งเตือนแชท `/sounds/*.m4a` ไม่ดัง — user report ว่า "ไม่มีเสียง" |
| 2026-08-05 | `.webmanifest` | `/manifest.webmanifest` 404 → PWA "เพิ่มลงหน้าจอโฮม" บน seller/admin **ไม่เคยทำงานเลย** ตั้งแต่เพิ่ม `src/app/manifest.ts` มา |

ทั้งสองครั้ง **user เป็นคนเจอ ไม่ใช่เรา** และครั้งที่สองเจอโดยบังเอิญระหว่าง debug เรื่องอื่น (เห็น 404 ใน console)

🛑 **คอมเมนต์เล่าเหตุการณ์อดีตไม่ได้กันเหตุการณ์ซ้ำ** — ตอนพลาด `.webmanifest` คอมเมนต์ที่อธิบายบั๊ก `.m4a` ครั้งก่อน **อยู่เหนือ regex บรรทัดเดียวกันเป๊ะ** แต่ไม่มีใครกลับมาอ่านตอนเพิ่ม `manifest.ts` เพราะคนเพิ่ม manifest ไม่ได้เปิด `proxy.ts` เลย

## เช็คก่อน merge

เมื่อคอมมิตแตะสิ่งเหล่านี้ — `public/**`, `src/app/manifest.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/opengraph-image.*`, หรือ route handler ใดก็ตามที่ตอบเป็นไฟล์ที่ root — ให้ตอบคำถามนี้ให้ได้:

```bash
# 1. นามสกุลที่เพิ่มเข้ามาอยู่ใน allow-list แล้วหรือยัง
rg -n "webmanifest|json\|" src/proxy.ts

# 2. ยิงจริงบน subdomain (dev) ต้องไม่ใช่ 404
curl -sI http://seller.deepth.local:4000/manifest.webmanifest | head -1
curl -sI http://admin.deepth.local:4000/manifest.webmanifest | head -1
```

**ทดสอบบน main domain อย่างเดียวไม่พอ** — บั๊กคลาสนี้มองไม่เห็นจาก main domain โดยนิยาม

## หมายเหตุ

`matcher` ท้ายไฟล์ (`_next/static|_next/image|favicon.ico|images|icons`) เป็นคนละชั้นกับ regex นี้ — ตัว matcher กันไม่ให้ proxy ทำงานเลย ส่วน regex นี้อยู่ในตัว proxy เพื่อ "ปล่อยผ่านโดยไม่ rewrite" การเติมนามสกุลต้องเติมที่ **regex** ไม่ใช่ matcher
