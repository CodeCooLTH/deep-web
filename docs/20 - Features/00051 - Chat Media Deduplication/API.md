---
title: "API — Chat Media Deduplication"
owner: shinobu22
status: draft
module: M00051-ChatMediaDedup
version: "1.0"
created: 2026-08-19
tags: [feature, api, chat, storage, media, dedup]
related: ["[[SRS]]", "[[SDS]]", "[[DATABASE]]"]
---

> **โมดูล:** M00051-ChatMediaDedup
> **ประเภทเอกสาร:** API Specification
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-19
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** safepay-planner (ดู [[Feature-Docs-Ownership]])

# API: การกำจัดไฟล์สื่อซ้ำในระบบแชท

---

## ไม่มี HTTP endpoint ใหม่

ฟีเจอร์นี้ **ไม่เพิ่ม route handler ใหม่แม้แต่ตัวเดียว** — ยืนยันจากการอ่านโค้ดจริงทั้ง [[SRS]] และ
[[SDS]] (v1.1): เป็นการแก้ internal function signature ในชั้น service (`src/services/channel-chat.service.ts`,
`src/services/media-asset.service.ts` — ไฟล์ใหม่) และแก้พฤติกรรมภายในของ endpoint ที่**มีอยู่แล้ว** 1
ตัว (`POST /api/uploads/commit` — response shape เดิมไม่เปลี่ยน แค่ค่า `fileId` อาจถูกแทนที่ด้วย
survivor fileId เมื่อตรวจพบว่าไฟล์ที่เพิ่งอัปโหลดซ้ำกับไฟล์ที่มีอยู่แล้วในร้านเดียวกัน) บวกกับ CLI
script ใหม่ 1 ไฟล์ที่รันนอก HTTP surface โดยสิ้นเชิง (`scripts/backfill-media-dedup.ts`)

**Endpoint ที่มีการเปลี่ยนพฤติกรรมภายใน (ไม่ใช่ endpoint ใหม่):**

| Method | Path | สิ่งที่เปลี่ยน | Contract ภายนอก |
|--------|------|----------------|-------------------|
| `POST` | `/api/uploads/commit` | เพิ่ม logic ภายใน: เมื่อ `purpose==='CHAT'` และ resolve `shopId` ได้ จะ hash ไฟล์ที่เพิ่งอัปโหลดเทียบกับไฟล์เดิมในร้าน ถ้าซ้ำ จะลบไฟล์ที่เพิ่ง PUT ทิ้งแล้วคืน `fileId` ของไฟล์เดิมแทน | **ไม่เปลี่ยน** request/response shape (`{ fileId, name, size, mime, kind }`) — client เดิมทำงานได้โดยไม่ต้องแก้โค้ดฝั่งตัวเอง (`fileId` ที่ได้กลับมาใช้งานได้เหมือนเดิมทุกประการ ไม่ว่าจะเป็นไฟล์ใหม่หรือไฟล์ที่ถูก dedup) |

ดูรายละเอียดเชิง sequence/logic เต็มที่ [[SDS]] §4.3 (Path C) และ [[SRS]] TFR-CMD-10

---

## CLI Interface (แทนที่ตาราง endpoint ตาม template เดิม)

```
npx dotenv -e <env> -- npx tsx scripts/backfill-media-dedup.ts [flags]

  (ไม่มี flag)      dry-run — ค่าเริ่มต้น ปลอดภัยเสมอ ไม่เขียนอะไรลง DB/storage
  --apply           เขียนจริง
  --shop <shopId>   จำกัดเฉพาะร้านเดียว
  --batch-size <n>  จำนวน candidate ต่อรอบ query (default 200)
  --resume          เครื่องหมายยืนยันว่าตั้งใจรันต่อจากรอบก่อน (cosmetic — resumability เป็นคุณสมบัติ
                     โดยธรรมชาติของ query "NOT IN MediaAsset" ดู [[SRS]] TFR-CMD-06)
```

รันจากเครื่องทีมงาน Deep เท่านั้น (ต้องมี prod DB credential) — ไม่มี auth ระดับแอปเพราะไม่มี HTTP
surface ให้ authz (ควบคุมที่ระดับ infra/env access เหมือนสคริปต์ backfill เดิมทั้งหมดใน `scripts/`)

exit code: `0` = จบครบไม่มี failed, `1` = มี candidate ที่ประมวลผลล้มเหลว ≥ 1 รายการ

ดูรายละเอียดพฤติกรรมเต็มที่ [[SRS]] TFR-CMD-04 (dry-run), TFR-CMD-06 (apply/resume), TFR-CMD-08 (รายงาน)

---

## เหตุผลที่ไม่มี API.md แบบเต็มตาม template

Template `docs/99 - Rules/Feature-Templates/API.md` ออกแบบมาสำหรับฟีเจอร์ที่มี HTTP endpoint ใหม่จริง
(request/response schema, error codes, idempotency ต่อ endpoint) — ฟีเจอร์นี้เป็น **service-layer
refactor + CLI** ล้วน ๆ การพยายามเติมตารางตาม template เต็มรูปแบบจะกลายเป็นการแต่ง endpoint ที่ไม่มีอยู่
จริงขึ้นมา จึงเลือกเขียนไฟล์นี้สั้น ระบุข้อเท็จจริงตรง ๆ แล้วชี้กลับไปที่ [[SDS]]/[[SRS]] ซึ่งมีรายละเอียด
เชิง interface ที่ถูกต้องกว่า (internal function signature + CLI flags)
