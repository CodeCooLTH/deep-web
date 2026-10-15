# Retro — 00070 ส่วนขยาย หน้าสรุปรายละเอียดสาธารณะ (2026-10-14 → 15)

## ที่ไปได้ดี
- ล็อกสัญญาข้อมูล (`DetailSnapshotV1`, `getSnapshotView`) ก่อนขนาน ⇒ 4 dev ทำพร้อมกันได้ (service · หน้า · สวิตช์ · ด่าน server) ไฟล์ไม่ชน
- parity ฐานจริงจับเงื่อนไขชุดใบตั้งแต่ต้น (ก้อนสถานะ Σ = ยอดการ์ด) · mutation ทุก AC หลักแดงจริง
- QA หน้าจริงบนฐาน dev เจอบั๊กที่ unit test ไม่เห็น: `salesChannel = 'MESSENGER'` (ข้อมูลเก่า) โผล่เป็นคำดิบ

## ที่พลาด
- **PR #165 ทำเทส parity DB แดง 7 ข้อแล้วไม่มีใครเห็น** — ผมรันเฉพาะเทสที่ไม่แตะฐานก่อน merge และ CI ข้ามเทส DB ใต้ `src/` ⇒ บทเรียน: งานที่แตะ `src/services/**` ต้องรันเทส `*.db.test.ts` / parity ด้วย `DATABASE_URL` 5434 ก่อน push เสมอ
- ส่งงานเดียวกัน (รูปสินค้า+ช่องทาง) ให้ 2 agent เพราะส่ง SendMessage ถึง agent ที่จบแล้ว (มันถูกปลุกมาทำต่อ) แล้วสั่งซ้ำใน prompt ใหม่ ⇒ ก่อนสั่งซ้ำ ให้เช็คบนดิสก์ก่อนว่ามีอยู่หรือยัง
- mockup รอ UX spec ~14 นาที user รู้สึกนาน ⇒ ถ้า user อยากเห็นภาพ ส่ง mockup คร่าวก่อนแล้วค่อยผ่าน UX gate

## Convention ที่ควรจำ
- หน้า public ใต้ `(paces)` จะได้ Vercel Analytics + ปิดซูมจาก root layout ⇒ ต้องแยก route group เป็น root layout ของตัวเอง
- ใน Next 16 หน้า RSC ที่มี `loading.tsx` จะตอบ 200 แม้เรียก `notFound()` (stream ไปก่อน)
