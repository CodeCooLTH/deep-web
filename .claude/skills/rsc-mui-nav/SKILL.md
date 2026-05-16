---
name: rsc-mui-nav
description: Use เมื่อแก้/เขียน server component ใน SafePay/Deep ที่มี link หรือ navigation (MUI Button/Chip + next/link). ป้องกัน RSC serialization error จาก component={Link}.
---

# RSC + MUI Navigation — Hard Rule 2

RSC ปฏิเสธการ serialize component function prop ข้าม server→client boundary. ห้ามใช้ `component={Link}` บน MUI element ใน server component.

## ใช้แทน
- `LinkButton` / `LinkChip` wrapper ที่ `src/app/<group>/_components/mui-link.tsx`
- หรือ wrap `<Button>` ด้วย `<Link>` (Link นอก, Button ใน)

## เช็คก่อน commit
`grep -rn "component={Link}" <ไฟล์ที่แก้>` — ต้องไม่เจอใน server component.

## Deep reference (pattern เต็ม + ตัวอย่าง client-wrapper)
`docs/conventions/rsc-mui-navigation.md`
