# ตรวจความ smooth ของหน้าแชทผู้ขาย (2026-09-29)

> ที่มา: agent ไล่โค้ดบน branch `feat/activity-and-chat-smooth` (แตกจาก `feat/chat-instant-render-delta`) — **อ่านโค้ดล้วน ยังไม่ได้วัดบนเครื่องจริง**
> อาการที่ user ยืนยันบน prod: (1) เปิดห้องแล้วกระพริบ/ว่าง (2) รายการแชทซ้ายเด้ง (3) เลื่อนดูของเก่ากระตุก (4) ช้าบนมือถือ/แอป
> ข้อสรุป: branch delta แก้ "ข้อมูลถูกแทนที่ทั้งก้อน" (หัวข้อ 6) แต่ต้นเหตุที่ใหญ่กว่าอยู่ชั้น render/route ที่ยังไม่มีใครแตะ

## ต้นเหตุ (เรียงตามผลกระทบ)
1. **ChatThread วาดใหม่ทั้งเธรดทุก 1 วิ + ทุกครั้งที่กดแป้น** — `setInterval(setNowTs, 1000)` (`ChatThread.tsx:1438`) ทุกเธรดช่องทางนอก, component 4,794 บรรทัด ไม่มี memo ที่บับเบิล, `groupByDate`/`buildAlbumRows` คำนวณใหม่ทุก render → อาการ 4, 3
2. **เปิดห้องที่ยังไม่ prefetch เห็นสเกเลตันของรายการ** — `inbox/loading.tsx` ครอบห้อง (`[conversationId]/loading.tsx` ถูกลบใน `e3248a1f`); `getThreadMessagesPage` ถูก await ท้ายสุด (`page.tsx:693`) → อาการ 1 · พ่วง: `isXlUp` อ่าน matchMedia ใน lazy init (`:1283`) = hydration mismatch บนจอ ≥1280
3. **รายการแชทที่ซ่อนด้วย CSS ยัง mount** — `ChatRailColumn.tsx:46` `hidden lg:flex` → มือถือยังยิง groups/conversations, subscribe realtime, poll 20 วิ; เดสก์ท็อปกลับกันที่ `inbox/page.tsx:366` → อาการ 4, 2
4. **เลื่อนดูของเก่าแล้วจอกระโดด** — ชดเชยด้วย rAF หลัง setState (ไม่รับประกันว่า commit ก่อน) · สูตรไม่บวก `prevTop` · sentinel สูงไม่คงที่ · `<img>` ไม่จองขนาด · WebKit ไม่มี scroll anchoring (ต้องยืนยัน) → อาการ 3
5. **รายการซ้ายเด้ง** — refresh สร้าง array ใหม่ทุกรอบ, แถวไม่มี memo, มือถือกดกลับมาวาดบนสุดก่อนแล้วกระโดด → อาการ 2 · 🛑 HR17: main `6ae2653ce` (`mergeRefreshedFirstPage`) แก้บรรทัดเดียวกับ `patchConversationRows` ของ branch — ต้องรวมเป็นฟังก์ชันเดียว (ตรรกะ `hasMore` ของ main + คง identity ของ branch)
6. poll แทนที่ข้อความทั้งก้อน — **branch แก้ครบแล้ว**
7. **`<Link prefetch>` ทุกแถวในจอ** ยิง RSC ทั้งหน้าห้อง (`InboxList.tsx:1741`) → อาการ 4, 1

## งานที่เสนอ
| # | งาน | ไฟล์ | อาการ |
|---|---|---|---|
| S1 | ตัวจับเวลาปรับความถี่: 1 วิเฉพาะ LINE หรือเหลือ <2 นาที, นอกนั้น 30 วิ | `ChatThread.tsx:1435-1440` | 4,3 |
| S2 | ไม่ mount รายการชุดที่ซ่อน (matchMedia ค่าเริ่มต้น false) | `ChatRailColumn.tsx`, `inbox/page.tsx:366` | 4,2 |
| S3 | ชดเชยตำแหน่ง prepend ใน layout effect `scrollTop = prevTop + (scrollHeight - prevHeight)` + sentinel สูงคงที่ | `useSellerChatThread.ts:1071-1096`, `ChatThread.tsx:3009-3019` | 3 |
| S4 | `[conversationId]/loading.tsx` → `SellerThreadSkeleton` (**มติ user 2026-09-29: เลือกโครงรูปห้องแชท**) | ใหม่ | 1 |
| S5 | `isXlUp` เริ่ม false | `ChatThread.tsx:1283` | 1 |
| S6 | ยิง `getThreadMessagesPage` ทันทีหลังได้ conversation | `[conversationId]/page.tsx` | 1,4 |
| R | รวม `patchConversationRows` + `mergeRefreshedFirstPage` ตอน rebase | `inbox-row-patch.ts`, `inbox-refresh-merge.ts` | 2 |
| M1 | `ThreadMessageList` เป็น `React.memo` ระดับ module | `ChatThread.tsx` | 4,3 |
| M2 | `InboxRow` เป็น `React.memo` | `InboxList.tsx:1608-2100` | 2,4 |
| M3 | จองขนาดรูป (เก็บ w/h) | schema + ingest | 3,1 |
| L1 | ลด prefetch (N แถวบน / prefetch ตอน pointerdown) | `InboxList.tsx:1741` | 4,1 |
| L2 | กดกลับมารายการบนมือถือไม่วาดบนสุดก่อน | `InboxList.tsx:560-625` | 2 |

## วิธีวัด (ยังไม่ได้รัน)
React DevTools Highlight updates/Profiler 10 วิ ก่อน-หลัง S1/M1 · Slow 3G เปิด `/inbox/<id>?panel=orders` + `?debug=timing` · นับ request `Next-Router-Prefetch` บนมือถือ · อยู่ในห้องบนมือถือ 60 วิแล้วนับ `/api/chat/conversations` · Safari Web Inspector เข้า WebView ดูลำดับ rAF/commit + Layout Shift Regions · console hydration error บนจอ ≥1280

## ต้องยืนยันก่อนลงมือ
WebKit scroll anchoring · rAF มาก่อน commit บ่อยแค่ไหน · Next 16.1 cache `prefetch={true}` ตาม `staleTimes.static` จริงไหม
