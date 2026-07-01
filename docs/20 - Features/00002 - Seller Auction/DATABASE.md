---
title: "DATABASE — Seller Auction + Realtime Bidding"
owner: shinobu22
status: draft
module: M00002-SellerAuction
version: "1.0"
created: 2026-06-23
tags: [feature, auction, database, schema, migration, prisma]
related: ["[[BRD]]", "[[PRD]]", "[[SRS]]"]
---

# DATABASE: Seller Auction + Realtime Bidding (M00002)

---

## 1. Existing Schema Review

อ่านจาก `prisma/schema.prisma` @ HEAD. **ของจริง — ห้าม invent ซ้ำ**

### 1.1 `Auction` (มีแล้ว)
id(uuid PK) · shopId(FK Shop) · productId?(FK Product) · title · imageUrl · images(Json `[]`) · startPrice(Decimal 12,2) · currentPrice · bidIncrement · endTime · **status(String default "live" — ปัจจุบัน "live"|"ended")** · bidCount(Int 0) · category? · createdAt · updatedAt
Index ที่มีแล้ว: `@@index([shopId])`, `@@index([status, endTime])`

### 1.2 `Bid` (มีแล้ว)
id · auctionId(FK) · bidderId(FK User) · amount(12,2) · createdAt
Index: `@@index([auctionId, createdAt])`, `@@index([bidderId])`

### 1.3 `Order` (เกี่ยวข้อง — มีแล้ว)
`auctionId String? @unique` (1 auction→1 Order) · `buyerUserId String?` (winner)

### 1.4 `User` (เกี่ยวข้อง)
`trustScore Int @default(0)` · **ไม่มี** field User Level ใด ๆ (ต้องเพิ่ม)

### 1.5 `WatchList` ครบแล้ว ไม่แก้

---

## 2. Schema Delta (field ใหม่)

### 2.1 `Auction` — เพิ่ม
| Field | Type | Null | Default | เหตุผล |
|---|---|---|---|---|
| `description` | String @db.Text | YES | null | คำอธิบายจาก create form |
| `startTime` | DateTime | YES | null | scheduled: เวลาเปิด; null = live ทันที |
| `reservePrice` | Decimal(12,2) | YES | null | bid สูงสุด < reserve → unsold |
| `buyNowPrice` | Decimal(12,2) | YES | null | ซื้อทันที; null = ไม่มี |
| `antiSnipeCount` | Int | NO | 0 | จำนวนครั้งต่อเวลา (max 5) |
| `cancelledAt` | DateTime | YES | null | timestamp เมื่อ cancelled |
| `expectedPrice` | Decimal(12,2) | YES | null | ราคาเป้าหมาย (FR-AUC-13, seller-only) — indicator ล้วน ไม่กระทบ settle/sold/unsold; **ห้ามส่งออกฝั่ง buyer** |

**status คงเป็น String** (ตาม convention โปรเจกต์ — Order/VerificationRecord ใช้ String). valid: `draft|scheduled|live|ended|unsold|cancelled`. ค่าเดิม "live"/"ended" ยัง valid → **ไม่ต้อง backfill**
**ไม่เพิ่ม `winnerId`/`finalPrice`** — derive จาก `Order WHERE auctionId` (buyerUserId=winner, totalAmount=final)

### 2.2 `User` — เพิ่ม User Level
| Field | Type | Null | Default | เหตุผล |
|---|---|---|---|---|
| `successfulBidCount` | Int | NO | 0 | cached count "bid สำเร็จ" (§5) |

**ไม่เพิ่ม `bidLevel`** — level คำนวณ runtime จาก successfulBidCount (threshold ปรับได้ไม่ต้อง migration)

### 2.3 `Badge`/`UserBadge` — ไม่แก้ schema (achievement seed เท่านั้น)

---

## 3. Mermaid erDiagram (หลัง delta)

```mermaid
erDiagram
    User {
        String id PK
        String displayName
        Int trustScore
        Int successfulBidCount "NEW default=0"
    }
    Shop { String id PK
        String userId FK }
    Auction {
        String id PK
        String shopId FK
        String productId FK_nullable
        String title
        String description_nullable "NEW"
        Decimal startPrice
        Decimal currentPrice
        Decimal bidIncrement
        Decimal reservePrice_nullable "NEW"
        Decimal buyNowPrice_nullable "NEW"
        DateTime startTime_nullable "NEW"
        DateTime endTime
        String status "draft|scheduled|live|ended|unsold|cancelled"
        Int bidCount
        Int antiSnipeCount "NEW default=0"
        DateTime cancelledAt_nullable "NEW"
        Decimal expectedPrice_nullable "NEW seller-only"
    }
    Bid { String id PK
        String auctionId FK
        String bidderId FK
        Decimal amount }
    WatchList { String userId FK
        String auctionId FK }
    Order { String id PK
        String buyerUserId FK_nullable
        String auctionId "nullable unique"
        Decimal totalAmount
        String status }
    Badge { String id PK
        String nameEN "unique"
        String audience }
    UserBadge { String userId FK
        String badgeId FK }

    User ||--o| Shop : owns
    Shop ||--o{ Auction : hosts
    Auction ||--o{ Bid : receives
    Auction ||--o| Order : settles_to
    User ||--o{ Bid : places
    User ||--o{ WatchList : watches
    Auction ||--o{ WatchList : watched_via
    Order }o--o| User : buyer
    User ||--o{ UserBadge : earns
    Badge ||--o{ UserBadge : awarded_as
```

---

## 4. Migration Plan (non-destructive)

### Migration 1: `auction_schema_delta`
```prisma
model Auction {
  // ... existing ...
  description    String?   @db.Text
  startTime      DateTime?
  reservePrice   Decimal?  @db.Decimal(12, 2)
  buyNowPrice    Decimal?  @db.Decimal(12, 2)
  antiSnipeCount Int       @default(0)
  cancelledAt    DateTime?
  expectedPrice  Decimal?  @db.Decimal(12, 2)
  @@index([status])
  @@index([shopId, status])
  @@index([startTime])
}
```
SQL (additive): `ALTER TABLE "Auction" ADD COLUMN ...` (ทุก column nullable/default → ไม่ทำลายข้อมูล). **Backfill: ไม่จำเป็น**

### Migration 2: `user_bid_level`
```prisma
model User { // ...
  successfulBidCount Int @default(0)
}
```
SQL: `ALTER TABLE "User" ADD COLUMN "successfulBidCount" INTEGER NOT NULL DEFAULT 0;`
**Backfill** (จาก Order ที่ชนะ+ไม่ cancel):
```sql
UPDATE "User" u SET "successfulBidCount" = (
  SELECT COUNT(*) FROM "Order" o
  WHERE o."buyerUserId"=u.id AND o."auctionId" IS NOT NULL AND o.status NOT IN ('CANCELLED')
) WHERE EXISTS (SELECT 1 FROM "Order" o2 WHERE o2."buyerUserId"=u.id AND o2."auctionId" IS NOT NULL);
```

ลำดับ: M1 → M2. แยก migration file (1 model ต่อ migration)

---

## 5. User Level Design

### 5.1 นิยาม "bid สำเร็จ"
ชนะ auction **และ** Order ไม่ถูก buyer ยกเลิก/เบี้ยว:
`Order WHERE buyerUserId=userId AND auctionId IS NOT NULL AND status NOT IN ('CANCELLED')`
**"ชิ่ง"** = ชนะแล้วไม่จ่าย (Order=CANCELLED) → **ไม่นับ**. ไม่นับ: bid ที่แพ้ / unsold / win-cancelled

### 5.2 Level Ladder (runtime — `src/lib/auction-level.ts` ไฟล์ใหม่ ไม่ใช่ migration)
| Level | Label | successfulBidCount | Icon |
|---|---|---|---|
| 1 | มือใหม่ | 0–2 | tabler-podium |
| 2 | นักประมูล | 3–9 | tabler-shield |
| 3 | เซียน | 10–29 | tabler-trophy |
| 4 | ระดับเพชร | 30–99 | tabler-diamond |
| 5 | ตำนาน | ≥100 | tabler-crown |

### 5.3 Trigger update (post-commit best-effort)
- `settleAuction()` มี winner → `successfulBidCount += 1` (winnerId)
- Order(auctionId) ถูก cancel (เบี้ยว) → `GREATEST(0, count - 1)`
- ไม่อัปเดตเมื่อ placeBid / unsold

### 5.4 Trust Score — User Level **ไม่กระทบ** Trust Score (สูตรเดิม); auction badge นับใน Badge 10% ตามปกติ (แยกระบบ)

---

## 6. Achievement Badge — Seed (BRD §11)

### 6.1 Seed MVP (เพิ่มใน `prisma/badge-seed-data.ts` — upsert by nameEN)
```ts
{ name:"นักประมูลมือใหม่",  nameEN:"First Auctioneer", icon:"tabler-gavel",  type:"ACHIEVEMENT", audience:"SELLER", criteria:{ type:"AUCTION_HOSTED", count:1 } },
{ name:"เจ้าแห่งประมูล 10", nameEN:"Auction Host 10",  icon:"tabler-gavel",  type:"ACHIEVEMENT", audience:"SELLER", criteria:{ type:"AUCTION_HOSTED", count:10 } },
{ name:"ปิดดีลประมูล",     nameEN:"First Auction Win",icon:"tabler-trophy", type:"ACHIEVEMENT", audience:"SELLER", criteria:{ type:"AUCTION_SOLD",   count:1 } },
{ name:"ขายประมูลได้ 10 ดีล", nameEN:"Auction Closer 10",icon:"tabler-trophy",type:"ACHIEVEMENT", audience:"SELLER", criteria:{ type:"AUCTION_SOLD",   count:10 } },
{ name:"ประมูลครั้งแรก",   nameEN:"First Bidder",     icon:"tabler-podium", type:"ACHIEVEMENT", audience:"BUYER",  criteria:{ type:"AUCTION_BID_COUNT", count:1 } },
{ name:"ชนะประมูลครั้งแรก", nameEN:"First Winner",    icon:"tabler-medal",  type:"ACHIEVEMENT", audience:"BUYER",  criteria:{ type:"AUCTION_WON",       count:1 } },
```

### 6.2 Criteria types ใหม่ (`src/types/badge.ts` union BadgeCriteria)
`AUCTION_HOSTED{count}` · `AUCTION_SOLD{count}` · `AUCTION_HIGH_BID_COUNT{minBidCount}` · `AUCTION_BID_COUNT{count}` · `AUCTION_WON{count}` · `AUCTION_WON_COMPLETED{count,statuses?}`

### 6.3 ยืนยัน MVP badge **ไม่ต้อง migration** — `Order.auctionId` + `Bid.bidderId` + `Auction.bidCount` มีแล้ว

---

## 7. Index ใหม่บน Auction
`@@index([status])` (chip filter) · `@@index([shopId, status])` (seller list) · `@@index([startTime])` (scheduled→live lazy/cron)
มีแล้ว (คงไว้): `[shopId]`, `[status, endTime]`, Bid `[auctionId,createdAt]`/`[bidderId]`, Order auctionId @unique, WatchList `[userId,auctionId]@unique`

---

## 8. Data Integrity

### 8.1 Application-layer (validate ก่อน write)
startPrice>0 · reservePrice≥startPrice · buyNowPrice>reservePrice (หรือ>startPrice ถ้าไม่มี reserve) · endTime≥now+30นาที · startTime<endTime · antiSnipeCount≤5 (ใน placeBid txn) · self-bid block (bidderId≠shop.userId →403) · amount≥currentPrice+bidIncrement · expectedPrice>0 (ถ้าระบุ — optional, ไม่มีข้อผูกกับ reserve/buyNow)

### 8.2 DB CHECK (เพิ่มในมือใน migration SQL)
```sql
ALTER TABLE "Auction"
  ADD CONSTRAINT "Auction_startPrice_positive" CHECK ("startPrice" > 0),
  ADD CONSTRAINT "Auction_currentPrice_nonneg" CHECK ("currentPrice" >= 0),
  ADD CONSTRAINT "Auction_bidIncrement_positive" CHECK ("bidIncrement" > 0),
  ADD CONSTRAINT "Auction_antiSnipeCount_range" CHECK ("antiSnipeCount" >= 0 AND "antiSnipeCount" <= 5),
  ADD CONSTRAINT "Auction_reservePrice_gte_startPrice" CHECK ("reservePrice" IS NULL OR "reservePrice" >= "startPrice"),
  ADD CONSTRAINT "Auction_buyNowPrice_gt_zero" CHECK ("buyNowPrice" IS NULL OR "buyNowPrice" > 0),
  ADD CONSTRAINT "Auction_expectedPrice_gt_zero" CHECK ("expectedPrice" IS NULL OR "expectedPrice" > 0);
ALTER TABLE "User" ADD CONSTRAINT "User_successfulBidCount_nonneg" CHECK ("successfulBidCount" >= 0);
```
(`buyNowPrice>reservePrice` enforce ที่ app layer — reserve nullable)

---

## 9. Supabase Realtime (infra step — แยกจาก Prisma migration)

> **🛑 แก้แล้ว 2026-07-01 (OQ-1 sign-off):** เปลี่ยนจาก `postgres_changes` (ALTER PUBLICATION) → **Broadcast from Database (trigger)**. เหตุผล: `postgres_changes` broadcast **แถวเต็มทั้งแถว** + โปรเจกต์ **ไม่มี RLS** → `reservePrice`/`expectedPrice` จะรั่วถึง buyer ทุกคนที่ subscribe (ขัด FR-AUC-13-AC-04) แม้ REST DTO กรองถูกแล้วก็ตาม เพราะ Realtime เป็นคนละเส้นจาก REST. ดู [[SRS]] §2.4 (Option A) + [[SDS]] §10 (Migration M3).

**Migration M3 — trigger function (เลือกคอลัมน์เอง, ไม่ผ่าน publication):**
```sql
-- รันใน Supabase SQL Editor (ต้อง user approve — แตะ prod DB เดียวกับ dev)
CREATE OR REPLACE FUNCTION public.auction_realtime_broadcast() RETURNS trigger AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'id', NEW.id,
      'currentPrice', NEW."currentPrice",
      'bidCount', NEW."bidCount",
      'endTimeMs', extract(epoch from NEW."endTime") * 1000,
      'status', NEW.status,
      'antiSnipeCount', NEW."antiSnipeCount",
      'hasReserve', (NEW."reservePrice" IS NOT NULL)
      -- 🛑 ห้ามใส่ reservePrice / expectedPrice / cancelledAt (leak — FR-AUC-13-AC-04)
    ),
    'update', 'auction:' || NEW.id, false
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;  -- fail-safe: Realtime ล่มต้องไม่ rollback UPDATE หลัก (FR-AUC-10-AC-03)
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auction_realtime_broadcast_trigger
  AFTER UPDATE ON "Auction" FOR EACH ROW EXECUTE FUNCTION public.auction_realtime_broadcast();
```
broadcast payload = currentPrice/bidCount/endTimeMs/status/antiSnipeCount/hasReserve (sanitized) → client subscribe
**RLS:** โปรเจกต์ไม่ใช้ RLS → `private=false` ใช้ anon key ได้; Broadcast-from-DB ไม่ผ่าน publication `supabase_realtime` (ไม่ต้อง ALTER PUBLICATION)
**Prerequisite:** ต้องยืนยัน Supabase project รองรับ `realtime.send()` (Realtime ≥ 2.x) ก่อน apply; ถ้าไม่รองรับ → fallback Option B (แยกตาราง sensitive fields, [[SRS]] §2.4)
Client: `supabase.channel('auction:'+id).on('broadcast',{event:'update'},cb).subscribe()` — ต้องเพิ่ม `@supabase/supabase-js` + anon key
**Rollback:** `DROP TRIGGER auction_realtime_broadcast_trigger ON "Auction"; DROP FUNCTION public.auction_realtime_broadcast();`

---

## 10. Query Impact + DTO
- `settleAuction()`: เพิ่มตรวจ reservePrice — `currentPrice < reserve` → status='unsold' (ไม่สร้าง Order)
- `placeBid()`: เพิ่ม anti-snipe — `endTime-now<60s AND antiSnipeCount<5` → `endTime+=60s, antiSnipeCount+=1` (ใน txn) + buy-now path (ถ้า amount≥buyNowPrice → settle ทันที)
- `browseAuctions()`: lazy `scheduled AND startTime<=now()` → flip live
- seller list: query ใหม่ `WHERE shopId ORDER BY createdAt` (index [shopId,status])
- **AuctionDTO เพิ่ม:** startTimeMs · `hasReserve:boolean` (ไม่ส่ง reservePrice จริงให้ buyer) · buyNowPrice · antiSnipeCount · description. **reservePrice + expectedPrice ส่งเฉพาะ seller endpoint ของร้านตัวเอง** (buyer DTO ต้องไม่มี 2 field นี้ — FR-AUC-13-AC-04)
- `settleAuction()` **manual (end early, FR-AUC-12):** เพิ่ม caller ฝั่ง seller เรียก settle ก่อน endTime ที่ currentPrice — reuse logic เดิม (reserve check → ended/unsold), guard `shop.userId` + `status='live'`; ไม่ต้อง field ใหม่

---

## 11. Migration Safety Checklist
1. อ่าน schema HEAD (ทำแล้ว §1) 2. แก้ schema additive-only 3. `prisma validate` 4-5. `migrate dev --name auction_schema_delta` / `user_bid_level` (local generate) 6. review SQL ไม่มี DROP/ALTER COLUMN 7. เพิ่ม CHECK ในมือ (§8.2) 8. `prisma generate` 9. `tsc --noEmit`=0 10. **ขอ user approve ก่อน prod** 11. `migrate deploy` (.env.local) 12. backfill SQL (approve ก่อน) 13. `ALTER PUBLICATION ... ADD TABLE Auction` (approve ก่อน) 14. ตรวจ DB หลัง apply
**ห้าม:** `prisma db pull` (ทับ schema) · `migrate dev` กับ `.env` (Docker ไม่มี DIRECT_URL) · drop/rename column

---

## 12. Rollback (risk ต่ำ — column nullable/default)
M1: `ALTER TABLE "Auction" DROP CONSTRAINT/COLUMN ...` (description/startTime/reservePrice/buyNowPrice/antiSnipeCount/cancelledAt)
M2: `ALTER TABLE "User" DROP ... successfulBidCount`
Realtime: `ALTER PUBLICATION supabase_realtime DROP TABLE "Auction"`

---

## 13. Risks
| # | Risk | ระดับ | Mitigation |
|---|---|---|---|
| R1 | Supabase dev/prod แชร์ — migrate deploy กระทบ prod ทันที | สูง | approve ก่อนทุกครั้ง + off-peak |
| R2 | antiSnipeCount race เกิน 5 | กลาง | ตรวจใน txn + DB CHECK ≤5 |
| R3 | Realtime delay/drop | กลาง | ไม่ block write; client REST poll fallback |
| R4 | lazy settle timeout เมื่อ pending เยอะ | กลาง | sweep take:100 + cron แยก (SRS) |
| R5 | RLS เปิดอนาคต → Realtime หยุด | ต่ำ | known risk + policy plan §9 |
| R6 | successfulBidCount drift | ต่ำ | GREATEST(0,..) + reconcile job Phase 2 |
| R7 | reservePrice หลุดไป buyer | กลาง | DTO ส่งแค่ hasReserve; seller endpoint guard ownership |
