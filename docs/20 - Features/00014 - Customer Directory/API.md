# 00014 — Customer Directory · API

## GET /api/orders/customers?q= (เดิม — คงพฤติกรรม)
- session-scoped shopId; ค้นลูกค้าจากออเดอร์ของร้านตัวเอง (ชื่อ/เบอร์) → `[{name, contact, orderCount}]`
- privacy: ไม่คืนลูกค้าข้ามร้าน (BR-CUST-03)

## POST /api/orders (เดิม — เพิ่มพฤติกรรม server-side)
- ไม่เพิ่ม field ใน request (customerId derive จาก buyerContact ที่ server, ไม่รับจาก client)
- server: normalize buyerContact → findOrCreateCustomer → order.customerId
