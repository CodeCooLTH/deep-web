---
title: "API — ตัวจัดหน้าร้าน (Shop Page Builder)"
owner: shinobu22
status: draft
module: M00035-ShopPageBuilder
version: "1.0"
created: 2026-08-07
tags: [feature, api, shop-page-builder]
related: ["[[SDS]]", "[[SRS]]", "[[DATABASE]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00035-ShopPageBuilder
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-07
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** safepay-planner (ดู [[Feature-Docs-Ownership]])

# API Contract: ตัวจัดหน้าร้าน (Shop Page Builder)

---

## 1. Overview

API ชุดนี้รองรับ `BuilderClient` (§3 ของ SDS) — โหลดคลัง, mirror รูปโพสต์ตอนกดเพิ่ม, บันทึกผัง, สลับเผยแพร่ ทุก endpoint เป็นของ shop ที่ active อยู่ในเซสชัน (`requireActiveShop`) ไม่รับ `shopId` จาก client

- **เอกสารออกแบบต้นทาง:** [[SDS]] §3/§6 (ทุก endpoint trace กลับ component/TD)
- **Base URL:** `/api/shops/current/page-builder`
- **Content-Type:** `application/json`
- **Convention:** REST ปกติของโปรเจกต์ (Next.js Route Handler, nodejs runtime), response envelope แบบ flat object ตรง ๆ (ไม่มี `data`/`meta` wrapper — ตรงกับ pattern `shops/current/videos/route.ts` ที่มีอยู่แล้ว)
- **Caching:** ทุก route ต้องมี `export const dynamic = 'force-dynamic'` และ response header `Cache-Control: private, no-store` (Hard Rule/`feedback_auth_api_cache_control`)

---

## 2. Authentication

| รายการ | ค่า |
|--------|-----|
| **วิธี (Auth Method)** | NextAuth session (cookie) — ไม่ใช่ Bearer token (นี่คือ seller console เดิม ไม่ใช่ `/api/app/*`) |
| **Header** | ไม่มี header พิเศษ — cookie session มาตรฐาน (`getServerSession(authOptions)`) |
| **Token / Scope** | `session.user.id` + `session.user.activeShopId` → resolve ผ่าน `requireActiveShop()` (`src/lib/shop-context.ts:118`) แล้วยืนยันสิทธิ์ผ่าน `canAccessShop(shop.id, userId)` (`src/lib/shop-context.ts:25` — คืน `true` ทั้ง OWNER และ `ShopMember` ทุก role ที่มีอยู่จริงในระบบคือ OWNER/ADMIN เท่านั้น ตรงกับ FR-PGB-16 มติ 2026-08-07 ข้อ 4 พอดี ไม่ต้องเช็ค role แยก) |
| **กรณีไม่ผ่าน** | ไม่มี session → `401 UNAUTHORIZED`; มี session แต่ไม่มี active shop → `404 NOT_FOUND`; มี shop แต่ `canAccessShop` false (ทฤษฎีเกิดยากมากเพราะ `requireActiveShop` re-verify แล้ว — defense-in-depth) → `403 FORBIDDEN` |
| **CSRF / Rate-limit** | ครอบอัตโนมัติผ่าน `guardApi()` ใน `src/proxy.ts:11` (ทุก mutation ใต้ `/api/**`) — ไม่ต้องเขียนเพิ่ม |

---

## 3. Endpoint List

| Method | Path | คำอธิบาย |
|--------|------|----------|
| `GET` | `/api/shops/current/page-builder/library` | คลังบล็อกที่เพิ่มได้ (เหรียญ ACHIEVEMENT + โพสต์ Facebook, ค้นหาได้) |
| `POST` | `/api/shops/current/page-builder/facebook-posts/mirror` | Mirror รูปโพสต์ 1 โพสต์ ตอนกด "+" ในคลัง |
| `PUT` | `/api/shops/current/page-builder` | บันทึกผัง (`tabOrder` + `blocks`) แบบแทนที่ทั้งชุด |
| `PATCH` | `/api/shops/current/page-builder/publish` | สลับสถานะเผยแพร่ทั้งหน้า |

---

## 4. Endpoint Detail

### 4.1 `GET /api/shops/current/page-builder/library`

คลังของ builder — เหรียญ ACHIEVEMENT ที่ร้าน/ผู้ใช้นี้ได้รับจริง + โพสต์ Facebook ของเพจที่เชื่อมไว้ ใช้เติม `LibraryPanel` (ทั้งตอน initial load ผ่าน SSR ที่ `BuilderPage` และตอน paginate/search ต่อผ่าน client fetch)

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Query | `q` | `string` | ไม่ | ค้นหาชื่อเหรียญ/ข้อความโพสต์ (ตรงกับช่องค้นหา mockup "ค้นหาเนื้อหาหรือเหรียญตรา") |
| Query | `cursor` | `string` | ไม่ | offset-based (ตัวเลขเป็น string) สำหรับโหลดโพสต์เพิ่ม — ไม่ส่ง = เริ่มจาก 0 |
| Query | `take` | `number` | ไม่ | จำนวนโพสต์ต่อหน้า ค่าเริ่มต้น 20 สูงสุด 50 |

**Response — Success (200)**

| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| `badges` | `array` | เหรียญ ACHIEVEMENT ทั้งหมดที่ร้าน/ผู้ใช้นี้ได้รับ — `{id: UserBadge.id, badgeId, name, nameEN, icon}` |
| `facebookChannelConnected` | `boolean` | มี `ShopChannel` provider `MESSENGER` status `ACTIVE` อย่างน้อย 1 ไหม |
| `facebookPosts` | `array` | `{id, message, thumbnailUrl, mirroredFileId, imageUrl, mediaType, reactionCount, fbCommentCount, shareCount, permalink}` — `imageUrl` = resolve แล้ว (`mirroredFileId ? getFileUrl(...) : thumbnailUrl`) |
| `facebookPostsHasMore` | `boolean` | ยังมีโพสต์เหลือให้โหลดเพิ่มไหม |
| `alreadyAddedBadgeCount` | `number` | จำนวนเหรียญที่อยู่ใน draft ปัจจุบันแล้ว (คำนวณฝั่ง client จาก draft state จริง — field นี้**ไม่ส่งจาก server** เพราะ server ไม่รู้จัก draft; ตัด field นี้ออก ดูหมายเหตุด้านล่าง) |

> **หมายเหตุสำคัญ:** endpoint นี้ **ไม่รู้จัก draft state เลย** (draft อยู่ฝั่ง client ล้วนตาม [[DATABASE]] §6) — "เพิ่มแล้ว"/"เลือกแล้ว" ในคลัง (badge ป้าย "เพิ่มแล้ว", โพสต์ที่มีปุ่มบวกหายไป) คือ **UI state ที่ `LibraryPanel` คำนวณเองจาก draft ปัจจุบันเทียบกับผลลัพธ์ endpoint นี้** ไม่ใช่ field ที่ server ส่งมา (field `alreadyAddedBadgeCount` ข้างบนจึงถูกตัดออกจาก response จริง — ระบุไว้เพื่อกันคนเข้าใจผิดว่าต้องมี)

**Response — Error**

- `401 UNAUTHORIZED` — ไม่มี session
- `404 NOT_FOUND` — ไม่มี active shop
- `403 FORBIDDEN` — `canAccessShop` false (defense-in-depth)

**ตัวอย่าง JSON**

```json
// Response 200
{
  "badges": [
    { "id": "ub_1", "badgeId": "b_century", "name": "ร้อยออเดอร์", "nameEN": "Century Club", "icon": "💯" }
  ],
  "facebookChannelConnected": true,
  "facebookPosts": [
    {
      "id": "fp_1",
      "message": "รีวิวจากลูกค้าที่มาพักสุดสัปดาห์ที่ผ่านมา",
      "thumbnailUrl": "https://scontent.xx.fbcdn.net/...",
      "mirroredFileId": null,
      "imageUrl": "https://scontent.xx.fbcdn.net/...",
      "mediaType": "photo",
      "reactionCount": 412,
      "fbCommentCount": 38,
      "shareCount": 5,
      "permalink": "https://facebook.com/..."
    }
  ],
  "facebookPostsHasMore": true
}
```

---

### 4.2 `POST /api/shops/current/page-builder/facebook-posts/mirror`

Mirror รูปปกของโพสต์ 1 โพสต์ลง storage ของเรา — เรียกตอนผู้ใช้กด "+" ที่โพสต์นั้นในคลัง (**ก่อน** Save) idempotent — เรียกซ้ำได้ปลอดภัย ไม่สร้างสำเนาซ้ำ ไม่ persist `ShopPageBlock` ใด ๆ (ดู [[SRS]] TFR-006)

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Body | `facebookPostId` | `string` (uuid) | ใช่ | `FacebookPost.id` ที่ต้องการ mirror |

```ts
const Body = v.object({
  facebookPostId: v.pipe(v.string(), v.uuid()),
})
```

**Response — Success (200)**

| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| `facebookPostId` | `string` | echo กลับ |
| `mirrored` | `boolean` | `true` = mirror สำเร็จ (ครั้งนี้หรือครั้งก่อนหน้า), `false` = ล้ม/ไม่มีรูปให้ mirror |
| `imageUrl` | `string \| null` | URL ที่ใช้แสดงได้ทันที (mirrored → `/api/files/{fileId}`; ไม่ mirrored → `thumbnailUrl` ดิบ; ไม่มีรูปเลย → `null`) |

**Response — Error**

| Error Code | HTTP | เงื่อนไข |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `facebookPostId` ไม่ใช่ uuid / body parse ไม่ผ่าน |
| `UNAUTHORIZED` | 401 | ไม่มี session |
| `NOT_FOUND` | 404 | ไม่มี active shop |
| `NOT_OWNED` | 403 | `facebookPostId` ไม่ใช่โพสต์ของเพจที่ร้านนี้เชื่อม (throw `POST_NOT_OWNED` ที่ service) |
| `FORBIDDEN` | 403 | `canAccessShop` false |

**ตัวอย่าง JSON**

```json
// Request
{ "facebookPostId": "fp_1" }

// Response 200 (mirror สำเร็จ)
{ "facebookPostId": "fp_1", "mirrored": true, "imageUrl": "/api/files/2026/08/07/uuid.jpg" }

// Response 200 (mirror ล้ม — fallback)
{ "facebookPostId": "fp_1", "mirrored": false, "imageUrl": "https://scontent.xx.fbcdn.net/..." }
```

---

### 4.3 `PUT /api/shops/current/page-builder`

บันทึกผัง — แทนที่ `tabOrder` และ `ShopPageBlock` ทั้งชุดของร้านนี้ในทรานแซกชันเดียว (**ไม่แตะ `isPublished`** — ใช้ §4.4 แยก) ตรง FR-PGB-13

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Body | `tabOrder` | `string[]` | ใช่ (ส่ง `[]` ได้) | ลำดับ tab key — ค่าที่ไม่ใช่ 1 ใน 7 key ถูก**กรองทิ้งเงียบ ๆ**ที่ Valibot (custom transform) ไม่ reject ทั้ง request |
| Body | `blocks` | `array` | ใช่ (ส่ง `[]` ได้) | ลำดับตาม array index = `sortOrder` |
| Body | `blocks[].type` | `'BADGE_HIGHLIGHT' \| 'FACEBOOK_POST'` | ใช่ | discriminator |
| Body | `blocks[].badgeIds` | `string[]` (≤4) | เมื่อ `type=BADGE_HIGHLIGHT` | `UserBadge.id` ≤4 ตัว |
| Body | `blocks[].facebookPostId` | `string` (uuid) | เมื่อ `type=FACEBOOK_POST` | `FacebookPost.id` |

```ts
const TAB_KEYS = ['pinned', 'rooms', 'calendar', 'services', 'items', 'about', 'reviews'] as const

const BlockSchema = v.variant('type', [
  v.object({
    type: v.literal('BADGE_HIGHLIGHT'),
    badgeIds: v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(4)),
  }),
  v.object({
    type: v.literal('FACEBOOK_POST'),
    facebookPostId: v.pipe(v.string(), v.uuid()),
  }),
])

const Body = v.object({
  // ค่าที่ไม่รู้จักถูกกรองทิ้งด้วย transform — ไม่ reject ทั้ง request (mirror ปรัชญาเดียวกับ
  // Shop.categories/Shop.salesChannels ที่ validate แบบ allow-list เงียบ ไม่ error)
  tabOrder: v.pipe(
    v.array(v.string()),
    v.maxLength(TAB_KEYS.length),
    v.transform((arr) => arr.filter((k): k is (typeof TAB_KEYS)[number] => (TAB_KEYS as readonly string[]).includes(k))),
  ),
  blocks: v.pipe(v.array(BlockSchema), v.maxLength(200)), // เพดานกันส่ง array มหาศาล (โพสต์ปกติไม่ถึงหลักสิบ)
})
```

**Response — Success (200)**

| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| `tabOrder` | `string[]` | ค่าที่บันทึกจริง (query กลับจาก DB) |
| `blocks` | `array` | `{id, type, sortOrder, badgeIds?, facebookPostId?}` ตามที่บันทึกจริง |

**Response — Error**

| Error Code | HTTP | เงื่อนไข |
|---|---|---|
| `VALIDATION_ERROR` | 400 | shape ไม่ผ่าน Valibot, หรือ `blocks` มี `type=BADGE_HIGHLIGHT` มากกว่า 1 รายการ (`TOO_MANY_BADGE_BLOCKS`) |
| `UNAUTHORIZED` | 401 | ไม่มี session |
| `NOT_FOUND` | 404 | ไม่มี active shop |
| `FORBIDDEN` | 403 | `canAccessShop` false |
| `NOT_OWNED` | 403 | `badgeIds`/`facebookPostId` ไม่ใช่ของร้านนี้จริง (`BADGE_NOT_OWNED`/`POST_NOT_OWNED`) |
| `CONFLICT` | 409 | `facebookPostId` ซ้ำกันในชุดที่ส่งมา (`DUPLICATE_FACEBOOK_POST`) หรือชนกับ partial unique index จาก race (Prisma `P2002`) |

**ตัวอย่าง JSON**

```json
// Request
{
  "tabOrder": ["rooms", "calendar", "about", "reviews"],
  "blocks": [
    { "type": "BADGE_HIGHLIGHT", "badgeIds": ["ub_1", "ub_2", "ub_3", "ub_4"] },
    { "type": "FACEBOOK_POST", "facebookPostId": "fp_1" }
  ]
}

// Response 200
{
  "tabOrder": ["rooms", "calendar", "about", "reviews"],
  "blocks": [
    { "id": "spb_1", "type": "BADGE_HIGHLIGHT", "sortOrder": 0, "badgeIds": ["ub_1", "ub_2", "ub_3", "ub_4"] },
    { "id": "spb_2", "type": "FACEBOOK_POST", "sortOrder": 1, "facebookPostId": "fp_1" }
  ]
}
```

---

### 4.4 `PATCH /api/shops/current/page-builder/publish`

สลับสถานะเผยแพร่ทั้งหน้า — endpoint เดียวใช้ร่วมกันทั้ง desktop builder toolbar และ `/public-profile` มือถือ (`PublishToggleClient`) ตรง FR-PGB-14

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Body | `isPublished` | `boolean` | ใช่ | |

```ts
const Body = v.object({ isPublished: v.boolean() })
```

**Response — Success (200)**

| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| `isPublished` | `boolean` | ค่าที่บันทึกจริง |

**Response — Error**

- `VALIDATION_ERROR` 400 — body ไม่ใช่ boolean
- `UNAUTHORIZED` 401 / `NOT_FOUND` 404 / `FORBIDDEN` 403 — เหมือน endpoint อื่น

**ตัวอย่าง JSON**

```json
// Request
{ "isPublished": false }

// Response 200
{ "isPublished": false }
```

---

## 5. Error Code Table

| Error Code | HTTP Status | ความหมาย / เงื่อนไข |
|------------|-------------|----------------------|
| `VALIDATION_ERROR` | `400` | body/query ไม่ผ่าน Valibot, หรือ business-shape invariant (เช่น `TOO_MANY_BADGE_BLOCKS`) |
| `UNAUTHORIZED` | `401` | ไม่มี session ที่ใช้งานได้ |
| `NOT_FOUND` | `404` | ไม่มี active shop สำหรับ session นี้ |
| `FORBIDDEN` | `403` | `canAccessShop` false (ไม่ใช่ OWNER/ADMIN ของร้านนี้) |
| `NOT_OWNED` | `403` | resource ที่อ้างถึง (badge/facebook post) ไม่ใช่ของร้านนี้จริง — ตรวจซ้ำฝั่ง server แม้ UI กรองมาให้แล้ว |
| `CONFLICT` | `409` | โพสต์ซ้ำในชุดเดียวกัน หรือชนกับ partial unique index จาก concurrent save |

**โครง error response มาตรฐาน**

```json
{
  "error": {
    "code": "NOT_OWNED",
    "message": "มีโพสต์ที่ไม่ได้อยู่ในเพจที่เชื่อมไว้",
    "details": {}
  }
}
```

---

## 6. Sequence (ถ้า flow ซับซ้อน)

flow บันทึกผัง (ซับซ้อนพอที่ควรมี diagram) — ดู [[SRS]] §4.4 (sequence เดียวกัน ไม่ทำซ้ำที่นี่เพื่อไม่ให้ diagram สอง copy drift กัน) flow ที่เหลือ (library/mirror/publish) เป็น request-response เดี่ยวไม่ซับซ้อนพอต้องมี diagram แยก

---

## 7. Traceability

| Endpoint | SDS Component / Decision | BRD FR |
|----------|--------------------------|--------|
| `GET .../library` | `LibraryPanel`, `shop-page-layout.service.ts::getBuilderLibrary` | FR-PGB-05, FR-PGB-06 |
| `POST .../facebook-posts/mirror` | TD-004, `mirrorFacebookPostForBuilder` | FR-PGB-05, มติข้อ 2 (2026-08-07) |
| `PUT /page-builder` | Flow 4.1 (SRS §4.4), `saveShopPageLayout` | FR-PGB-08, FR-PGB-09, FR-PGB-13 |
| `PATCH .../publish` | TFR-009 (SRS), `setShopPagePublished` | FR-PGB-14 |

---

## 8. สรุป (Summary)

API contract นี้มี 4 endpoint ครอบคลุมทุกการเขียนของ feature 00035 — จุดสำคัญที่ developer ต้องจำ: **`GET .../library` ไม่รู้จัก draft เลย** (UI คำนวณ "เพิ่มแล้ว" เองจาก client state), **การเพิ่ม/ลบบล็อกไม่มี endpoint เดี่ยว ๆ** (เป็น client-only จนกว่าจะ `PUT` ทั้งชุด ยกเว้น mirror ที่ทำงานล่วงหน้าได้เพราะเขียนคนละ table), ทุก endpoint ตรวจความเป็นเจ้าของ resource ซ้ำฝั่ง server เสมอ (`NOT_OWNED`) ไม่พึ่ง UI

**Open Questions:** ดูหัวข้อ "คำถาม/ความเสี่ยงที่เหลือ" ท้ายรายงาน Planner
