# ปิดสิทธิ์ข้อมูล = ไล่ตามแถว ไม่ใช่ตามจอ

ที่มา: 00071 P1 (2026-10-10) — retro `docs/retro/2026-10-10-00071-p1-finance-lockdown-retrospective.md`

## กฎ

เมื่อต้องกันฟิลด์ X ของตาราง T จากบทบาทใด (เช่น `OrderItem.cost`, ยอดกระเป๋า, revenue):

1. **ไล่จากข้อมูล ไม่ใช่จากจอ** — grep ทุกที่ที่แถว T ออกจาก server แล้วตัดสินทีละจุด:
   - `include: { <relation>: true }` / `select` ที่มี X / `findMany`-`findFirst` ที่คืนทั้งแถว
   - `NextResponse.json(<ผลจาก prisma/service>)` ตรง ๆ — **รวม route ที่ไม่มีจอไหนเรียก** (ยังยิงตรงได้)
   - prop ที่ส่งทั้งก้อนเข้า `'use client'` component (ทุกฟิลด์ลง RSC flight payload แม้ไม่ render)
   - response ของ POST/PATCH ที่คืนแถวที่เพิ่งเขียน (มักลืม เพราะคิดว่า "เป็นของที่ผู้ใช้เพิ่งส่งมาเอง")
   - เส้นทางผู้ซื้อ/สาธารณะ (`/api/public/*`, buyer orders) ที่ include แถวของร้าน
2. **ตัดด้วย "ไม่มีคีย์"** ไม่ใช่ `null`/`0` (null = ยังไม่ตั้ง, 0 = โกหก) · ถ้าเป็น service ที่ทุกผู้เรียกไม่ต้องใช้ X ให้ `omit` ที่ service เลย
3. **พารามิเตอร์/context ที่ตัดสินสิทธิ์ห้ามมีค่าตั้งต้นที่เปิด** — ทำเป็น required ให้ tsc บังคับ caller หรือ default = ปิด (ห้าม `canSeeX = true`, `opts.canSeeX ?? true`, `createContext(true)`)
4. **ด่านต้องอยู่ระดับฟิลด์** — เทสสแกน "ไฟล์นี้มีตัวตัดสินไหม" ไม่พอ ต้องมีเทสที่ไล่คีย์ของ payload จริง (route test ด้วย session ของบทบาทที่ไม่มีสิทธิ์ → assert ว่าไม่มีคีย์ X ทุกชั้น)

## เคสจริง (00071 P1)

- กราฟแนวโน้มรายงานแอดมินซ่อน revenue ใน JSX แต่ส่ง `trend[]` ทั้งก้อนเข้า client chart
- `createOrder`/`updateOrder` คืน `items: true` → response POST/PATCH มีต้นทุนรายบรรทัดถึงผู้ดูแล
- `/api/public/reviews/[username]` (ไม่ต้องล็อกอิน) คืนต้นทุนรายบรรทัด + เบอร์/อีเมลผู้รีวิว — ไม่มีจอไหนเรียก route นี้เลย จึงไม่มีใครเห็นมาตลอด
- `canSeeBalance ?? true` ใน 2 service · `CanTopUpContext` default true
