# 00014 — Customer Directory · Tests

## Unit (Vitest — ผ่านแล้ว)
- `src/lib/__tests__/phone.test.ts` (4): valid / strip / ผิด→null / email-ว่าง→null
- `src/services/__tests__/customer.service.test.ts` (3): เจอ→id เดิม / ไม่เจอ→สร้าง / P2002 race→re-find

## E2E (Playwright + Chrome MCP — Task 8)
1. คีย์ชื่อ/เบอร์ → สร้าง order → DB: Customer + order.customerId
2. เบอร์เดิม order ที่ 2 → customer id เดียว
3. 2 ร้านเบอร์เดียว → customer เดียว (cross-shop) + ร้าน B ไม่เห็นชื่อร้าน A (privacy)
4. เบอร์ผิดรูปแบบ → ไม่สร้าง Customer
5. email-only → customerId null
6. search ลูกค้าตัวเองเจอ
7. backfill: order เก่า → customerId set
