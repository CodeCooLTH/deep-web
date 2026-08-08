---
title: "SRS — กล่องแชทรวมหลายร้าน"
owner: shinobu22
status: implemented
created: 2026-08-08
tags: [srs, feature, chat, multi-shop]
related: ["[[BRD]]", "[[SDS]]", "[[API]]", "[[DATABASE]]"]
---

> **โมดูล:** M37-UnifiedInbox · **เวอร์ชัน:** 1.0 · **สถานะ:** Implemented

# SRS: กล่องแชทรวมหลายร้าน

## 1. ขอบเขตทางเทคนิค

ฟีเจอร์นี้ **ไม่เพิ่มชั้นสิทธิ์ใหม่** และ **ไม่เปลี่ยนโครงข้อมูลของแชท** — เปลี่ยนแค่ "ขอบเขตของ `WHERE`" จาก `shopId = X` เป็น `shopId IN (…)` และย้ายแหล่งที่มาของบริบทจาก `activeShopId` ไปเป็น `conversation.shopId`

## 2. Functional Requirements (ระดับสเปก)

### FR-UNI-01 — โหมดมุมมอง

- เก็บที่ `User.chatScopeMode` (`"SINGLE"` | `"UNIFIED"`, default `"SINGLE"`)
- เขียนผ่าน `PATCH /api/users/me` เท่านั้น (allow-list `UpdateProfileSchema`); ค่านอก picklist → 400
- อ่านผ่าน `resolveChatScope()` เท่านั้น; ค่าที่ไม่รู้จักในคอลัมน์ → ตีเป็น `SINGLE` (`normalizeChatScopeMode`)

### FR-UNI-02 — `resolveChatScope()` เป็น SSOT ของขอบเขต

```ts
resolveChatScope(session): Promise<ChatScope | null>
ChatScope = { mode, storedMode, shopIds, activeShopId, activeKind, activeRole, activeLocked, activeLockReason }
```

| เงื่อนไข | ผลลัพธ์ |
|---------|--------|
| ไม่มี session / resolve ร้าน active ไม่ได้ | `null` → caller แสดง error state **ห้าม fallback ไป PERSONAL** |
| `storedMode = SINGLE` | `shopIds = [activeShopId]`, **ไม่เรียก `listAccessibleShopIds`** (ไม่เพิ่ม query ให้โหมดเดิม) |
| `storedMode = UNIFIED` | `shopIds = listAccessibleShopIds(userId)` (เจ้าของ + สมาชิก, ตัดร้านที่ถูกลบ), dedupe |
| `UNIFIED` แต่ `shopIds.length === 1` | `mode = 'SINGLE'` (ลดตั้งแต่ที่ resolve — UI เช็ค `scope.mode` ที่เดียวพอ) แต่ `storedMode` ยังเป็น `UNIFIED` |

🛑 **กติกาบังคับ:** ไฟล์ใน `src/app/(paces)/seller/(chat)/**` และ `src/app/api/chat/**` ห้ามเรียก `resolveActiveShopContext`/`requireActiveShop` ตรง ๆ — ตรวจด้วย
```bash
rg "resolveActiveShopContext|requireActiveShop" "src/app/(paces)/seller/(chat)/" "src/app/api/chat/"   # ต้อง = 0 (ไม่นับคอมเมนต์)
```
ยกเว้น `src/app/api/channels/**` (ตั้งค่าเพจ = รายร้านตามเดิม โดยตั้งใจ)

### FR-UNI-03 — ตัวช่วยที่มาคู่กัน

| ฟังก์ชัน | ใช้เมื่อ | พฤติกรรมเมื่ออยู่นอกขอบเขต |
|---------|---------|---------------------------|
| `intersectScopedShopIds(scopeShopIds, requested)` | ตัวกรองร้าน/เพจของรายการ | คืน `[]` → รายการว่าง (**ห้ามคืนขอบเขตทั้งก้อน ห้าม 403**) |
| `resolveConversationShopId(session, conversationId)` | route ที่ทำงานกับเธรดหนึ่ง | คืน `null` → 404 (เหมือนกันทั้ง "ไม่มี" และ "ไม่มีสิทธิ์") |
| `resolveScopedShopId(session, requestedShopId)` | route ทรัพยากรรายร้าน (กลุ่ม/ข้อความด่วน/โควตา AI) | คืน `null` → 404; ไม่ส่ง `shopId` = ร้านที่ active |
| `assertShopsAccessible(shopIds, userId)` | service ที่รับ `shopIds` จากภายนอก | throw `FORBIDDEN` |

### FR-UNI-04 — Service signature ที่เปลี่ยน

| เดิม | ใหม่ |
|------|------|
| `listConversationsForShop(shopId, opts)` | `listConversationsForShops(shopIds, opts)` |
| `unreadConversationIdsForShop(shopId)` | `unreadConversationIdsForShops(shopIds)` |
| `countUnreadConversations(shopId)` | `countUnreadConversations(shopIds)` |
| `countUnreadSpamConversations(shopId)` | `countUnreadSpamConversations(shopIds)` |
| `conversationIdsByShipmentState(shopId, state)` | `conversationIdsByShipmentState(shopIds, state)` |
| `enrichWithOrderStage(items, shopId)` | `enrichWithOrderStage(items, shopIds)` — `Linkable` ต้องมี `shopId` |
| `countUnansweredForShop({shopId,…})` | `countUnansweredForShops({shopIds,…})` |
| `listCommentPosts({shopId,…})` | `listCommentPosts({shopIds,…})` — คืน `shop: {id,name}` เพิ่ม |
| `getShopTags(shopId)` | `getShopTags(shopIds)` |
| — | `listChannelsForShops(shopIds)` (ใหม่ — คืน `shopId`/`shopName` ต่อเพจ) |

`getUnreadCountForShop(shopId)` **คงเดิม** — ผู้เรียกอยู่นอกขอบเขตแชท (`(dashboard)/layout.tsx`)

ทุกตัวคืนค่าว่าง/0 เมื่อ `shopIds.length === 0` — ต้องตัดจบก่อนลง SQL ไม่ปล่อยให้เกิด `IN ()`

### FR-UNI-05 — บริบทตามเธรด

หน้า `/inbox/[conversationId]`:
1. หา `conversation` ด้วย `{ id, shopId: { in: scope.shopIds } }`
2. `const threadShopId = conversation.shopId`
3. **ทุก query หลังจากนั้นใช้ `threadShopId`** — `Shop.vertical`/`logo`/`shopName`, `AutoReplyConfig`, `AiChatbotTestThread`, `AutoReplyKeyword`, `AutoReplyKeywordTestThread`, `Order` (ประวัติในแผงลูกค้า)
4. ห่อ subtree ด้วย `<ThreadShopProvider shopId={threadShopId}>`

`useDraftOrders()` ฉีด `shopId` ของเธรดให้ `openDraft` อัตโนมัติจาก `ThreadShopContext` — call site ทั้ง 8 จุดไม่ต้องแก้ และจุดที่เพิ่มใหม่ทีหลังได้ค่าถูกต้องเอง

### FR-UNI-06 — บริบทรายร้านของฟอร์มสร้างรายการ

`DraftOrderProvider` เก็บ `Record<shopId, ShopChatContext>`:

```ts
ShopChatContext =
  | { status:'ready'; catalog; bestSellers; inventoryEnabled; vocab; shopVertical;
      serviceResourcesEnabled; serviceResources; appointmentGranularity }
  | { status:'loading' }
  | { status:'error'; forbidden: boolean }
```

- ร้าน `activeShopId` ถูก seed จาก layout (RSC) ตั้งแต่ mount → **โหมด SINGLE ไม่มี fetch เพิ่มและไม่เห็น skeleton**
- ร้านอื่นโหลดผ่าน `GET /api/chat/shop-context?shopId=` **ตอนเปิดร่าง** (`openDraftWithContext`)
- 🛑 เงื่อนไข render ฟอร์ม = `status === 'ready'` **ไม่ใช่ `catalog.length > 0`**
- `forbidden` (403) แยกจาก error ทั่วไป — ไม่แสดงปุ่ม "ลองใหม่" เพราะไม่มีวันสำเร็จ

### FR-UNI-07 — Realtime

`subscribeShopChat`/`subscribeShopComments` เป็น refcounted singleton ต่อ `shopId` อยู่แล้ว → ผู้เรียกวน `shopIds.map(...)` แล้วคืน unsubscribe รวม; dependency ของ `useEffect` ใช้ `shopIds.join(',')` (array prop สร้างใหม่ทุก render)

เสียงแจ้งเตือน: `playChatBeep({ shopId: <ร้านของเธรดนั้น> })` — throttle key รายร้าน ทำให้ข้อความของ 3 ร้านที่มาพร้อมกันไม่ถูกยุบเหลือเสียงเดียว

## 3. Non-Functional

| NFR | วิธีที่ทำจริง |
|-----|--------------|
| โหมด SINGLE ต้องไม่ช้าลง | `resolveChatScope` ไม่เรียก `listAccessibleShopIds` เมื่อ SINGLE · `where` ใช้ `shopId: X` (equality) เมื่อมีร้านเดียว ไม่ใช่ `IN` · layout ยัง preload บริบทของร้าน active เหมือนเดิม |
| ห้ามรับขอบเขตจาก client | ทุก route คำนวณ `shopIds` เองจาก session; `?shopId=` เป็นแค่ "ตัวกรองภายในขอบเขต" ที่ต้องผ่าน intersect |
| ไม่รั่วว่ามีร้าน/เธรดนั้นอยู่จริง | นอกขอบเขต → ผลว่าง/404 ไม่ใช่ 403 (ยกเว้น `shop-context` ที่ผู้เรียกรู้อยู่แล้วว่าร้านนี้มีตัวตน) |
| ไม่เพิ่ม channel realtime เกินจำเป็น | refcount ต่อ shopId — สอง instance ของ `InboxList` (rail + list) แชร์ channel เดียวกันเหมือนเดิม |

## 4. ข้อจำกัดที่รู้ตัว

1. บนมือถือขณะอยู่ในเธรด สวิตช์โหมดเข้าไม่ถึง (`ChatHeader` เป็น `hidden lg:flex` ในหน้าเธรดมาแต่เดิม) — ต้องกลับหน้ารายการก่อน
2. โหมดรวมไม่แสดงแท็บกลุ่ม (ดู BR-UNI-09) และไม่มีทางสร้างกลุ่มจากโหมดนั้น
3. ยังไม่มีเพดานจำนวน channel realtime ต่อผู้ใช้ (ปัจจุบันร้านต่อผู้ใช้อยู่ในหลักหน่วย)
4. ไม่มีปุ่มสร้างรายการจาก "หน้ารายการ" ในรอบนี้ — โมดัลร่างผูกกับ `conversationId` ตามสถาปัตยกรรมเดิม การเพิ่มทางเข้าที่ไม่มีเธรดต้องรื้อสัญญาของ `OpenDraftInput` (เลื่อนไปรอบถัดไป)
