# "มี session" ≠ "รู้ว่าเป็นใคร"

> เหตุการณ์จริง 2026-08-11 — หน้า `/o/[token]` ตอบ 500 ทั้งหน้าให้ผู้ซื้อที่ล็อกอินอยู่
> (`digest 3758181775`) ขณะที่จอ guest ของออเดอร์ใบเดียวกันเปิดได้ปกติ

## อาการ

```
Error [PrismaClientValidationError]:
Invalid `prisma.user.findUnique()` invocation:
{ where: { id: undefined }, select: { phone: true } }
Argument `where` of type UserWhereUniqueInput needs at least one of `id`, `username`, `phone` or `email`
```

## ต้นเหตุ

`session` callback ใน `src/lib/auth.ts` เติม `session.user.id` ให้ **เฉพาะเมื่อ**

```ts
if (token.userId) {                       // ① โทเคนต้องมีฟิลด์นี้
  const user = await prisma.user.findUnique({ where: { id: token.userId as string }, … })
  if (user) {                             // ② และต้องหาแถวเจอจริง
    session.user = { …, id: user.id, … }
  }
}
```

ทั้งสองข้อพลาดได้จริง — โทเคนที่ออกก่อนมีฟิลด์นั้น, ผู้ใช้ที่ถูก soft-delete/purge, หรือแถวหาย
ผลคือได้ **object session ที่ไม่เป็น null แต่ไม่มี `id`** ซึ่งเป็นสถานะที่โค้ดทั้งโปรเจกต์ไม่เคยคิดถึง

โค้ดที่พังเขียนแบบนี้ (แพตเทิร์นที่เคยมี **58 จุด** ทั่ว `src/app/**`):

```ts
if (!session?.user) return unauthorized()          // ตรวจ "กล่อง"
const userId = (session.user as { id: string }).id // ← cast บอกว่า string แน่ ๆ
await prisma.user.findUnique({ where: { id: userId } })
```

🛑 **`as { id: string }` คือสิ่งที่ปิดตา ไม่ใช่ตัวช่วย** — TypeScript เชื่อ cast ทุกตัวอักษร
`tsc`/build/เทส/grep จึงผ่านหมด สิ่งที่ผิดคือ *ข้อสมมติ* ไม่ใช่ *ชนิด*

## กติกา

1. **ตรวจสิ่งที่จะเอาไปใช้จริง (`id`) ไม่ใช่กล่องที่ห่อมันอยู่ (`session`/`user`)**
2. ใช้ `sessionUserId(session)` จาก `@/lib/session-user` เท่านั้น — คืน `string | null`
   (fail-closed: ไม่ใช่สตริง/สตริงว่าง → `null`)
3. `null` = ปฏิบัติเหมือนไม่ได้ล็อกอิน **ผู้เรียกตัดสินเองว่าจะทำอะไรต่อ**:
   - API → `401` เหมือนเดิม
   - หน้าที่บังคับล็อกอิน → `redirect('/auth/sign-in?callbackUrl=…')` เหมือนเดิม
   - **หน้าที่มีจอ guest อยู่แล้ว → ตกไปจอ guest** (เช่น `/o/[token]`) ห้ามพัง
4. 🛑 **ห้าม throw** ในตัว helper — throw = 500 ซึ่งคืออาการเดิมที่กำลังแก้

```ts
const session = await getServerSession(authOptions)
const userId = sessionUserId(session)
if (!session?.user || !userId) return unauthorized()
```

> `!session?.user` ยังอยู่เพื่อให้ TypeScript narrow `session` ให้โค้ดข้างล่าง — ตัวที่ตัดสิน
> ความถูกต้องจริงคือ `!userId`

## ด่านกันซ้ำ

`src/lib/__tests__/session-user.test.ts` มีเทส `[blocker]` ที่ **สแกนซอร์สทั้ง `src/app/`**
ห้ามมี `as { id: string }).id` เหลืออยู่ — สแกนจากซอร์สจริง ไม่ใช่รายชื่อไฟล์ที่ hardcode
(ไฟล์ใหม่ที่เขียนทีหลังจึงถูกจับด้วย) พิสูจน์ด้วย mutation แล้วว่าคืนแพตเทิร์นเดิมกลับไปจุดเดียวก็แดง

## บทเรียนที่ใหญ่กว่าตัวบั๊ก

- **หน้าเดียวที่ถูกรายงาน ≠ ขอบเขตของปัญหา** — จุดที่ผู้ใช้เจอเป็นจุดที่เขาบังเอิญเดินไปถึง
  ไม่ใช่จุดเดียวที่พังได้ (`feedback_missing_guard_is_a_class`)
- **`if (!X) …` ที่ตามด้วย cast เพื่อหยิบของข้างใน X คือกลิ่นเดียวกันเสมอ** — เจอที่ไหนให้ถามว่า
  "ของข้างในหายได้ไหม" ไม่ใช่ "X เป็น null ได้ไหม"
- ตัวที่ชี้จุดพังให้ได้ในนาทีเดียวคือ **stack trace ของจริง** ไม่ใช่การอ่านโค้ดเดา —
  Vercel plan นี้อ่าน runtime log ย้อนหลังไม่ได้ (403) แต่ `vercel logs <deployment>` สตรีมของใหม่ได้
  วิธีที่ใช้ได้จริงคือเปิดสตรีมค้างไว้แล้วให้ผู้ใช้กดซ้ำ
