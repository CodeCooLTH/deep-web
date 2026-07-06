# 00014 — Customer Directory · SRS
รายละเอียด spec เต็ม: `docs/superpowers/specs/2026-07-04-customer-directory-design.md` §3-9 + plan `docs/superpowers/plans/2026-07-04-customer-directory.md`

## Interfaces
- `normalizePhone(raw: string): string | null` (`src/lib/phone.ts`) — digits only, valid `^0[0-9]{9}$` → '0xxxxxxxxx', ไม่งั้น null
- `findOrCreateCustomer(tx: Prisma.TransactionClient, phone: string): Promise<string>` (`src/services/customer.service.ts`) — dedup by phone, P2002-safe → customerId
- `createOrder` (`src/services/order.service.ts`) — resolve customerId ใน tx (normalize buyerContact → findOrCreate) → order.customerId

## Validation
- Valibot/Yup เบอร์ `^0[0-9]{9}$`; Customer.phone unique (DB) = enforcement สุดท้าย
## Authz
- `/api/orders/customers` scope shopId session (เดิม) — ไม่ leak cross-shop (BR-CUST-03)
