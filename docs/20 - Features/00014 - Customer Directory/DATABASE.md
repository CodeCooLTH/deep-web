# 00014 — Customer Directory · DATABASE

migration: `prisma/migrations/20260705000000_add_customer/migration.sql` (hand-written, shared DB — ห้าม migrate dev)

## model Customer (ใหม่)
| field | type | note |
|---|---|---|
| id | String @id uuid | |
| phone | String @unique | normalize 0xxxxxxxxx (SSOT identity, BR-CUST-01/02) |
| email | String? | optional เสริม (ไม่ unique) |
| userId | String? @unique | link → User (Phase 2, SetNull) |
| createdAt/updatedAt | DateTime | |

relations: `user User?` (SetNull), `orders Order[]`

## Order (แก้)
- `customerId String?` + FK → Customer (onDelete SetNull) + `@@index([customerId])`
- คง buyerName/buyerContact/buyerUserId เดิม

## Backfill
`prisma/backfill-customers.ts` — order customerId=null + buyerContact เป็นเบอร์ → findOrCreate Customer → set customerId (idempotent, non-destructive)
