# 00014 — Customer Directory · BRD (Business Rules — SSOT)

- **BR-CUST-01 (unique phone):** Customer.phone unique global (normalize `^0[0-9]{9}$` ก่อนเขียนเสมอ). ห้ามมี 2 record เบอร์เดียวกันเด็ดขาด
- **BR-CUST-02 (cross-shop identity):** เบอร์เดียวกัน = Customer id เดียว ไม่ว่าสั่งจากกี่ร้าน (findOrCreate by phone)
- **BR-CUST-03 (privacy):** seller เห็น/ค้นลูกค้าเฉพาะจากออเดอร์ของร้านตัวเอง; ชื่อลูกค้าเก็บต่อออเดอร์ (`order.buyerName`) — ร้าน A ไม่เห็นชื่อที่ร้าน B ตั้งให้เบอร์เดียวกัน
- **BR-CUST-04 (phone-only entity):** สร้าง Customer เฉพาะเมื่อมีเบอร์ valid; email-only/เบอร์ผิด → order สร้างได้ (buyerContact เดิม) แต่ไม่มี Customer / customerId=null
- **BR-CUST-05 (denormalized keep):** คง `order.buyerName`/`buyerContact` เสมอ (display + backward compat + buyer-history-linking เดิมไม่พัง)
- **BR-CUST-06 (link User = Phase 2):** Customer.userId (link → registered buyer) เป็น Phase 2 — MVP ไม่ auto-link

## Acceptance
- 2 ออเดอร์เบอร์เดียว (ร้านเดียว/ต่างร้าน) → customerId เดียวกัน
- เบอร์รูปแบบผิด → ไม่สร้าง Customer; order ผ่านถ้า contact เป็น email/ว่าง
- concurrent create เบอร์เดียว → ไม่ error (P2002 re-find)

## Edge / risk
- race สร้างพร้อมกัน → unique + P2002 catch (BR-CUST-01 enforce ที่ DB)
- backfill order เก่า email-only → ข้าม (BR-CUST-04)

**User ack:** ไม่มี BR pre-tick ที่ต้อง defer — ทุก rule active ตั้งแต่ MVP
