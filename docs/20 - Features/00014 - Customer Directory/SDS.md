# 00014 — Customer Directory · SDS
รายละเอียด design + task breakdown: `docs/superpowers/plans/2026-07-04-customer-directory.md` (8 tasks)

## Flow (Mermaid)
```mermaid
flowchart TD
  A[createOrder: buyerContact] --> B{normalizePhone valid?}
  B -- ไม่ valid/email/ว่าง --> C[customerId = null]
  B -- valid --> D[findOrCreateCustomer tx phone]
  D --> E{เจอ Customer?}
  E -- เจอ --> F[คืน id เดิม cross-shop]
  E -- ไม่เจอ --> G[create Customer]
  G -- P2002 race --> H[re-find คืน id เดิม]
  F & G & H & C --> I[order.create customerId]
```
- customer resolution อยู่ใน `$transaction` เดียวกับ order.create (atomic; rollback พร้อมกัน)
