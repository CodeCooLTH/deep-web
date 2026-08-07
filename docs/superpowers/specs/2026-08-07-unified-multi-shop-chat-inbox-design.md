# กล่องแชทรวมหลายร้าน (Unified Multi-Shop Inbox) — Design Spec

- **วันที่:** 2026-08-07
- **สถานะ:** design approved (รอ review สเปก)
- **หมายเลข feature ที่จอง:** `00037` (ตรวจข้ามทุก branch แล้ว — `00036 - Service Order Surface` คือเลขล่าสุดที่ถูกใช้)
- **ผู้ตัดสินใจ:** user (4 มติหลัก ดู §1)
- **ขอบเขตไฟล์:** `src/app/(paces)/seller/(chat)/**`, `src/app/api/chat/**`, `src/services/chat.service.ts`, `src/services/page-comment.service.ts`, `src/lib/` (ไฟล์ใหม่ `chat-scope.ts`)

---

## 0. ปัญหา

ผู้ใช้ 1 คนถือหลายร้าน (เจ้าของ + ถูกเชิญเป็น `ShopMember`) แต่ละร้านผูก Facebook Page คนละเพจ ทุกวันนี้กล่องแชทผูกกับ `session.user.activeShopId` ร้านเดียว → ต้องสลับบัญชีไปมาเพื่อดูแชทของแต่ละร้าน ทั้งที่คนตอบเป็นคนเดียวกันและนั่งตอบพร้อมกันทั้งวัน

เป้าหมาย: เปิดกล่องแชทเดียวเห็นทุกร้าน โดยผู้ใช้เลือกเองได้ว่าจะรวมหรือแยก

---

## 1. มติที่ล็อกแล้ว

| # | ประเด็น | มติ |
|---|---------|-----|
| D-1 | รูปแบบตัวควบคุม | **สวิตช์ 2 โหมด** — `รวมทุกร้าน` / `ร้านเดียว (ตาม active)` ไม่มีการติ๊กเลือกบางร้าน |
| D-2 | Context ของเธรด | **ตามเธรด** — เปิดเธรดร้านไหน ทุกอย่างในเธรดนั้นเป็นของร้านนั้น **โดยไม่แตะ `activeShopId`** |
| D-3 | เก็บค่าโหมด | **ต่อผู้ใช้ ในฐานข้อมูล** (คอลัมน์ใหม่ใน `User`) — เปิดเครื่องไหนก็เหมือนกัน |
| D-4 | ขอบเขตแท็บ | **รวมทั้ง 2 แท็บ** — ทั้ง "ข้อความ" และ "ความคิดเห็น" (คอมเมนต์ Facebook) |
| D-5 | ระหว่างโหลด context | **กดปุ่มสร้างได้ทันที โมดัลเปิดแล้วโชว์สถานะกำลังโหลดข้างใน** (ไม่ disable ปุ่ม) |

**ทางที่ไม่เลือก และเหตุผล:** ใช้กลไก `ChatShopAutoSwitch` เดิม (สลับ `activeShopId` ตอนเปิดเธรดข้ามร้าน) — ถูกออกแบบมารับ **ทางเข้าจาก push notification ที่นาน ๆ ครั้ง** ไม่ใช่ลูปหลักของการนั่งตอบแชทสลับร้านทั้งวัน ทุกครั้งที่กดข้ามร้านจะเป็น `session.update()` + reload ทั้งหน้า และร้าน active ของทั้งแอปจะเดินตามเธรดที่เผลอกดดู แล้วไปสร้างของที่หน้าอื่นเข้าร้านผิดทีหลัง (คลาสเดียวกับ `feedback_context_switch_before_write`)

**กลไกเดิมไม่ถูกลบ** — ทางเข้าจาก push noti ของแอปมือถือยังต้องใช้ (payload มีแค่ `conversationId` เปลี่ยนไม่ได้โดยไม่ส่ง App Store ใหม่)

---

## 2. Data model

```prisma
// model User
chatScopeMode String @default("SINGLE") // "SINGLE" | "UNIFIED"
```

- `String` ไม่ใช่ enum — ตาม convention เดิมของโปรเจกต์ (`Order.status`, `Product.type`, `ShopMember.role`) validate ที่ Valibot
- `default("SINGLE")` = ทุกผู้ใช้เดิมพฤติกรรมไม่เปลี่ยนแม้แต่คนเดียว (zero-regression backfill ในตัว)
- migration additive 1 ไฟล์ ไม่มี CHECK constraint แบบรายชื่อค่า (เลี่ยงคลาสชนกันข้าม branch ตาม `docs/conventions/migration-check-constraint-additive.md`)

> 🛑 **แจ้ง user ก่อนรัน:** `vercel.json` รัน `prisma migrate deploy` ตอน build → push `main` = migrate ขึ้น prod ในตัว ไม่ต้องสั่งเอง แต่ **ฐาน local ต้อง apply เอง** (`migrate deploy` ที่ปักหมุด localhost ตาม HR14) และ migrate ล้ม = build ล้ม = deploy ไม่ขึ้น (HR15)

**ไม่เพิ่ม** ตารางเก็บ "รายชื่อร้านที่เลือกรวม" — D-1 ตัดออกแล้ว

---

## 3. SSOT ของขอบเขต — `src/lib/chat-scope.ts` (ไฟล์ใหม่)

```ts
export interface ChatScope {
  mode: 'SINGLE' | 'UNIFIED'
  /** ร้านที่รายการแชทครอบคลุม — ใช้ใน WHERE ตั้งแต่ query แรกเสมอ */
  shopIds: string[]
  /** ร้านที่ active อยู่จริง — ใช้เป็นค่าตั้งต้นของ action ที่ "ไม่มีเธรด" เท่านั้น */
  activeShopId: string
}

export async function resolveChatScope(session): Promise<ChatScope | null>
```

- `SINGLE` → เรียก `resolveActiveShopContext()` เดิมเป๊ะ, `shopIds = [ctx.shopId]` (พฤติกรรมเท่าเดิมทุกประการ)
- `UNIFIED` → `listAccessibleShopIds(userId)` ที่มีอยู่แล้วใน `lib/shop-context.ts:44` (เจ้าของ + สมาชิก, กรอง `deletedAt`/`purgedAt` ให้แล้ว)
- resolve ไม่ได้ / `shopIds` ว่าง → คืน `null` (fail-closed) caller แสดง error state เดิม
- ผู้ใช้ที่เข้าถึงร้านเดียวแล้วตั้ง `UNIFIED` ไว้ → ได้ผลเท่ากับ `SINGLE` เอง ไม่ต้อง error

### 🛑 กฎบังคับ (reviewer gate)

**หลังรอบนี้ ห้ามไฟล์ใดในขอบเขตแชทอ่าน `activeShopId` หรือเรียก `resolveActiveShopContext` ตรง ๆ อีก** ทุกทางต้องผ่าน `resolveChatScope`

```bash
rg "resolveActiveShopContext|requireActiveShop" "src/app/(paces)/seller/(chat)/" "src/app/api/chat/"   # ต้อง = 0
```

เหตุผล: มี **17 route ใต้ `src/app/api/chat/`** ที่ scope ด้วยร้านเดียวอยู่ตอนนี้ ถ้าแก้ไม่ครบจะเหลือ surface ที่ยังเห็นร้านเดียวปนอยู่กับ surface ที่รวมแล้ว โดยไม่มีอะไรฟ้อง — คลาสเดียวกับ `feedback_or_rule_guard_every_operand` (กั้น operand เดียวแล้วคิดว่าจบ) และ `feedback_enumerate_by_code_shape_not_filename`

**รายการที่ต้องไล่ให้ครบ** (จาก `rg` ณ วันเขียนสเปก):
`chat/conversations/route.ts` · `chat/conversations/[id]/route.ts` · `.../crm` · `.../orders` · `.../preview` · `.../ai-suggest` · `.../customer-prefill` · `chat/inbox-tab-counts` · `chat/spam-unread` · `chat/problem-count` · `chat/groups` · `chat/groups/[id]` · `chat/tags` · `chat/ai-quota` · `chat/quick-messages` · `chat/quick-messages/[id]` · `chat/comments/posts`

`api/channels/**` (เชื่อม/ถอดเพจ) **ไม่อยู่ในขอบเขต** — เป็นการตั้งค่ารายร้าน ต้องคง `activeShopId` ไว้ตามเดิม

---

## 4. Service layer

### 4.1 รายการแชท

`listConversationsForShops(shopIds: string[], opts)` เป็นตัวจริง — `listConversationsForShop(shopId, opts)` เดิมเหลือเป็น wrapper บาง ๆ เรียก `([shopId], opts)` เพื่อไม่ต้องไล่แก้ call site นอกแชทในรอบเดียว

- `where.shopId` → `{ in: shopIds }`
- **pagination ไม่ต้องรื้อ** — เรียง `lastMessageAt desc` + cursor ของ Prisma ทำงานกับ `where` อะไรก็ได้ cursor เดิมจึงข้ามร้านได้ทันที
- ตัวช่วยภายในที่รับ shopId เดี่ยวต้องแก้ตาม: `unreadConversationIdsForShop`, `conversationIdsByShipmentState`, `countUnreadConversations`
- `countUnreadByConversation(conversationIds)` รับ id อยู่แล้ว — ไม่ต้องแก้

### 4.2 ตัวอื่น

| ของเดิม | ของใหม่ |
|---------|---------|
| `countUnansweredForShop({ shopId })` | รับ `shopIds` (แท็บความคิดเห็น) |
| `listChannels(shopId)` | `listChannelsForShops(shopIds)` — ตัวกรอง "เพจ" ต้องเห็นเพจของทุกร้าน |
| `listChatGroups(shopId)` | ไม่แก้ (ดู §6.4 — โหมดรวมไม่แสดงแท็บกลุ่ม) |

### 4.3 ความปลอดภัย

- **route ห้ามรับ `shopIds` จาก query string เด็ดขาด** — ค่ามาจาก `resolveChatScope` เท่านั้น
- ตัวกรอง "ร้าน" ที่ client ส่งมา (`?shopId=`) ต้อง **intersect กับ `scope.shopIds`** เสมอ — ยิง id ที่ไม่มีสิทธิ์ = ได้ผลว่าง ไม่ใช่ 403 (403 บอกใบ้ว่าร้านนั้นมีอยู่จริง)
- ownership อยู่ใน `WHERE` ตั้งแต่ query แรก ไม่ใช่ post-check (`feedback_rsc_dal_authz`)
- **ไม่ต้องแก้ authz ของการเปิด/ตอบเธรด** — `assertParticipant` (`chat.service.ts:935`) และ `channel-chat.service.ts` ใช้ `canAccessShop(conversation.shopId, actorUserId)` อยู่แล้ว = ผูกกับเธรด ไม่ได้ผูกกับ `activeShopId` มาแต่แรก

---

## 5. Context ตามเธรด — ส่วนที่เสี่ยงที่สุดของงานนี้

### 5.1 ทำไมถึงเสี่ยง

ในโหมดรวม จอเดียวจะมีเธรดของร้านคนละ `vertical` ปนกันโดยตั้งใจ ซึ่งฟอร์มสร้างรายการต่างกันคนละเรื่อง:

| ร้าน `ONLINE_SALES` | ร้าน `SERVICE_QUEUE` |
|---|---|
| คำว่า "สร้างคำสั่งซื้อ" | คำว่า **"งานใหม่"** (`ORDER_VOCAB.createLabelShort`) |
| **บังคับที่อยู่จัดส่ง** | **ห้ามบังคับที่อยู่** |
| แคตตาล็อกสินค้า + `fulfillmentMode` | รายการบริการ (`ServiceResource`) + บล็อก "วันเข้าใช้บริการ" |
| ปุ่มเปิดพัสดุ iShip | ไม่มี |

ทั้งชุดนี้ปัจจุบันมาจาก `(chat)/layout.tsx:99-135` ที่ resolve จาก **ร้าน active ร้านเดียว** → ถ้าไม่แก้ จะได้ "เปิดเธรดร้านบริการ แต่ฟอร์มเป็นของร้านขายของ" ทันที ซึ่งเป็นบั๊กคลาสเดียวกับที่เพิ่งแก้ 2 รอบเมื่อ 2026-08-07 (`docs/conventions/stored-flag-vs-owner-truth.md` — ร้านบริการโดนบังคับที่อยู่) แต่รอบนี้เกิดง่ายกว่าเดิมมาก

### 5.2 ข้อกำหนดแข็ง

1. **`vertical` ของฟอร์มมาจาก `conversation.shopId` เท่านั้น** — `ORDER_VOCAB`, บล็อกวันนัด, `serviceResources`, `appointmentGranularity`, `hasShipping`, `inventoryEnabled`, โควตา AI ผูกกับร้านของเธรดทั้งชุด ห้ามอ่านจาก `activeShopId` แม้แต่ค่าเดียว
2. **แคตตาล็อกต้องเป็นของร้านเดียวกับเธรด** สินค้าร้าน A ห้ามโผล่ในเธรดร้าน B แม้ชั่ววินาทีระหว่างโหลด — ไม่งั้นจะพา `Product.fulfillmentMode` ของอีกร้านติดไปด้วย ซึ่งเป็นตัวที่ทำให้ร้านบริการถูกบังคับที่อยู่
3. **ร่างออเดอร์พก `shopId` ติดตัว** ตอน submit เทียบกับ `conversation.shopId` — ไม่ตรง = ปฏิเสธ fail-closed ไม่ใช่ส่งตามร้าน active
4. **ด่าน "ร้านนี้ต้องจัดส่งไหม" ใน `createOrder`/`updateOrder`** ต้องยืนยันซ้ำว่าอ่านจากร้านของออเดอร์ — แพตช์ 2026-08-07 กั้นครบ 4 จุดแล้ว แต่ทางเข้าจากแชทในโหมดรวมเป็นเส้นใหม่ที่ยังไม่เคยถูกเดินผ่าน ต้องมีเทสยิงเส้นนี้ตรง ๆ
5. **ปุ่มสร้างในเธรดล็อกร้านไว้** แสดงเป็นป้ายชื่อร้าน เลือกไม่ได้ — เปลี่ยนร้านได้เฉพาะตอนกดสร้างจากหน้ารายการที่ไม่มีเธรดเปิด (ค่าตั้งต้น = `scope.activeShopId` แสดงชื่อร้านเด่นบนหัวโมดัล)

### 5.3 หน้าเธรด

`inbox/[conversationId]/page.tsx` เปลี่ยน `WHERE` จาก `{ id, shopId: activeCtx.shopId }` → `{ id, shopId: { in: scope.shopIds } }` แล้ว **ทุก query หลังบรรทัดนั้นอ่าน `conversation.shopId`** ไม่ใช่ `activeCtx.shopId`:
`shop.vertical` · `shop.logo` · `autoReplyConfig` · `aiChatbotTestThread` · `autoReplyKeyword` · iShip · โควตา AI

### 5.4 `DraftOrderProvider` — per-shop lazy

ปัญหา: provider อยู่ที่ `layout.tsx:188` เหนือ `children` **โดยตั้งใจ** ให้ร่างค้างข้ามแชท ย้ายลงมาที่เธรด = ร่างหายทุกครั้งที่เปลี่ยนห้อง (regression) ปล่อยไว้เฉย ๆ = ร่างร้าน A โผล่ในเธรดร้าน B พร้อมแคตตาล็อกผิดร้าน

ทางแก้: **provider อยู่ที่เดิม แต่เป็น per-shop**

- state ร่างเป็น `Map<shopId, draft>` → ร่างของแต่ละร้านค้างแยกกัน สลับไปมาไม่หาย ไม่ปนกัน
- context รายร้าน (catalog/bestSellers/vertical/serviceResources/iShip/inventory) **prefetch ตอนเปิดเธรด ไม่ใช่ตอนกดปุ่มสร้าง** แล้ว cache ต่อ `shopId` — ตอนผู้ใช้กดปุ่ม ข้อมูลพร้อมอยู่แล้วในเคสปกติ
- endpoint ใหม่ `GET /api/chat/shop-context?shopId=` (intersect กับ scope) — **ชิ้นงานใหม่ที่ใหญ่ที่สุดของแผนนี้**
- โหมด `SINGLE` ยัง preload ร้าน active จาก layout เหมือนเดิม → **ไม่มี regression ความเร็วสำหรับคนที่ไม่เปิดโหมดรวม**

### 5.5 สถานะระหว่างโหลด (D-5)

- ปุ่มสร้าง **กดได้เสมอ** ไม่ disable (ปุ่มที่กดไม่ได้ชั่วขณะถูกอ่านว่าพัง และเราเคยเจอคลาส "ปุ่มหายไปเฉย ๆ" มาแล้ว — `feedback_fullscreen_hides_nav_actions`)
- โมดัลเปิดขึ้นมาแล้วโชว์สถานะกำลังโหลดข้างใน
- 🛑 **ห้าม render ฟอร์มด้วยแคตตาล็อกว่างเด็ดขาด** — แคตตาล็อกว่างอ่านเหมือน "ร้านนี้ไม่มีสินค้า" ซึ่งเป็นข้อมูลผิด ไม่ใช่แค่ว่าง
- โหลดไม่สำเร็จ → error + ปุ่มลองใหม่ (ไม่ตกลงไปเป็นฟอร์มว่าง)

---

## 6. UI

> 🛑 ทุกส่วนใน §6 ต้องผ่าน `safepay-ux` gate (HR8) ออก Design Spec + mockup 3 จอ **ก่อน** เขียนโค้ด — สเปกนี้กำหนดแค่ "ต้องมีอะไร" ไม่ใช่ "หน้าตายังไง"

### 6.1 สวิตช์โหมด
อยู่บนหัวหน้าแชท (`ChatHeader`) — `ร้านทั้งหมด ▾` / `ร้าน X` กดแล้วเปลี่ยนทันที (optimistic + `PATCH /api/users/me`)

**มีร้านเดียว = ซ่อนสวิตช์** (ไม่มีอะไรให้รวม)

### 6.2 API ของสวิตช์
เพิ่ม `chatScopeMode` เข้า `UpdateProfileSchema` (`src/lib/validations.ts:119`) — **ไม่สร้าง endpoint ใหม่** schema เป็น Valibot allow-list อยู่แล้วด้วยเหตุผลด้านความปลอดภัย (เคยมีช่องยิง `{"isAdmin":true}`) `chatScopeMode` เป็นค่าที่ผู้ใช้ตั้งเองได้จริง จึงเข้าเกณฑ์ของ allow-list นี้

```ts
chatScopeMode: v.optional(v.picklist(['SINGLE', 'UNIFIED'])),
```

### 6.3 แถวในรายการ + หัวเธรด
- โหมดรวม: แต่ละแถวบอกร้านเจ้าของเธรด (ชื่อ/โลโก้) — **โหมดเดี่ยวไม่เพิ่ม** ของเดิมจะได้ไม่รกขึ้น
- หัวเธรด: ป้ายร้านชัดเจน — ผู้ใช้ต้องรู้ว่ากำลังตอบในนามร้านไหน **ก่อนพิมพ์** ไม่ใช่รู้ตอนส่งไปแล้ว
- ตัวกรอง "เพจ" (`PageFilterDropdown`): จัดกลุ่มหัวข้อตามร้าน

### 6.4 แท็บกลุ่ม
`ChatGroup` มี `@@unique([shopId, name])` = ชื่อกลุ่มซ้ำข้ามร้านได้ (ร้าน A กับ B ต่างมี "รอโอน" คนละอัน ยุบรวมกันไม่ได้เพราะเป็นคนละแถว คนละความหมาย)

→ **โหมดรวมแสดงแค่แท็บ "ทั้งหมด" แล้วแท็บกลุ่มกลับมาเมื่อกรองเหลือร้านเดียว**

### 6.5 แท็บความคิดเห็น (D-4)
`comments/page.tsx` + `page-comment.service.ts` เปลี่ยนเป็น `shopIds` · การ์ดโพสต์ติด badge ร้าน/เพจ

**การตอบคอมเมนต์ไม่ต้องแก้** — ยืนยันจากโค้ดแล้ว: `page-comment.service.ts:395,543` เรียก `resolveChannelToken(post.shopChannelId)` = token มาจากเพจของโพสต์นั้นเอง ไม่ได้อ่านจากร้าน active จึงตอบข้ามร้านได้ทันทีเมื่อรายการรวมแล้ว

---

## 7. Realtime + เสียง

`subscribeShopChat(shopId, cb)` เป็น refcounted singleton ต่อ `shopId` อยู่แล้ว (`lib/chat-shop-realtime.ts`) → เพิ่ม `subscribeShopsChat(shopIds[], cb)` ที่วนเรียกตัวเดิมแล้วคืน unsubscribe รวม **ไม่แตะข้างใน** (การ refcount ต่อ shopId ยังจำเป็นเหมือนเดิม เพราะ `InboxList` mount 2 instance พร้อมกันทุก breakpoint)

เหมือนกันกับ `subscribeShopComments` และ `ChatSoundListener` — **เสียงต้องดังจากทุกร้านในโหมดรวม**

`inbox-tab-counts` รวมเลขทั้ง 2 แท็บข้ามร้าน

---

## 8. Edge cases

| กรณี | พฤติกรรม |
|------|----------|
| ร้านถูกลบ/หลุดสิทธิ์ระหว่างเปิดค้าง | `listAccessibleShopIds` กรองให้แล้ว → เธรดหาไม่เจอ → error state เดิม |
| Business ที่ `packageLockedAt` (read-only) | gate ต่อเธรดจาก `conversation.shopId` — โหมดรวมห้ามทำให้กฎ read-only ของร้านนั้นหลุด |
| ตั้ง `UNIFIED` แต่มีร้านเดียว | ได้ผลเท่ากับ `SINGLE` ไม่ error, ซ่อนสวิตช์ |
| เข้าจาก push noti | `ChatShopAutoSwitch` เดิมยังทำงาน (โหมดรวมจะแทบไม่เรียกเพราะเห็นทุกร้านอยู่แล้ว) |
| ผู้ใช้มีร้านจำนวนมาก | subscribe realtime N channel บน socket เดียว — ตอนนี้ร้านต่อผู้ใช้จริง ≤ ไม่กี่ร้าน ยังไม่ตั้งเพดาน แต่บันทึกไว้เป็นข้อจำกัดที่รู้ตัว |

---

## 9. ไม่ทำในรอบนี้ (out of scope)

เลือกรวมเฉพาะบางร้าน · กลุ่ม/แท็กข้ามร้าน · unified ให้หน้าอื่น (`/orders`, `/customers`, Command Center) · สถิติ/รายงานข้ามร้าน · ส่งข้อความเดียวออกหลายร้าน · รวม `api/channels/**` (ตั้งค่าเพจ = รายร้านตามเดิม)

---

## 10. เทส

**Unit (ไม่แตะ DB จริง — HR13)**

- `resolveChatScope` 4 เคส: `SINGLE` / `UNIFIED` / ไม่มีสิทธิ์ร้านใดเลย / ร้านถูก soft-delete
- 🛑 **intersect ตัวกรองกับ scope** — ยิง `?shopId=` ที่ผู้ใช้ไม่มีสิทธิ์ ต้องได้ผลว่าง (ไม่ใช่ 403 ไม่ใช่ข้อมูลหลุด)
- `listConversationsForShops` — cursor ข้ามร้านเรียงตาม `lastMessageAt` ถูกต้อง ไม่มีแถวซ้ำ/หายที่รอยต่อหน้า
- **ร้าน `SERVICE_QUEUE` ในโหมดรวม สร้างรายการแล้วต้องไม่ถูกบังคับที่อยู่** และร้าน `ONLINE_SALES` ต้องยังถูกบังคับ (ยิงผ่านเส้นแชท ไม่ใช่เรียก service ตรง)
- ร่างที่ `shopId` ไม่ตรงกับเธรด → ถูกปฏิเสธ

**Browser QA:** user ตรวจเองบน prod ตามปกติ (`feedback_user_does_visual_qa`) — แต่ต้องกัน "หน้าไม่ render" ด้วย static check ก่อน push

---

## 11. ลำดับงานที่แนะนำ (รายละเอียดอยู่ในแผน implementation)

1. เอกสาร feature `00037` (PRD + BRD ผ่าน review ก่อน — HR11 ห้ามข้าม)
2. migration + `resolveChatScope` + เทส (ยังไม่มี UI — โหมด `SINGLE` ต้องเหมือนเดิม 100%)
3. service/route sweep ทั้ง 17 route (grep gate ต้องเหลือ 0)
4. `safepay-ux` gate → UI สวิตช์ + badge ร้าน + ตัวกรอง
5. `GET /api/chat/shop-context` + `DraftOrderProvider` per-shop (ชิ้นใหญ่สุด — §5)
6. แท็บความคิดเห็น
7. sync `docs/SRS.md` (คอลัมน์ใหม่ใน `User` + endpoint ใหม่) — HR11 ระบุว่างานที่แตะ data model/API ต้อง sync SRS ไม่ใช่แค่ feature docs
