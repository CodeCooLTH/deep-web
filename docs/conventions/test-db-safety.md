# ความปลอดภัยของข้อมูลในไฟล์เทส (Hard Rule 13)

> **สรุปข้อเดียว:** ห้ามมีคำสั่งลบข้อมูลแบบไม่ scope ในไฟล์เทสเด็ดขาด ไม่มีข้อยกเว้น

---

## 1. ทำไมถึงเข้มกว่าปกติมาก

โครงการนี้ **dev DB กับ prod DB เป็นตัวเดียวกัน** (Supabase แชร์ — ดู `CLAUDE.md` §Current State Snapshots 2026-06-07 และ memory `project_prod_deploy_setup`)

แปลว่าโค้ดแบบนี้ในไฟล์เทส:

```ts
await prisma.order.deleteMany();
await prisma.shop.deleteMany();
await prisma.user.deleteMany();
```

**ไม่ใช่ "การล้างข้อมูลเทส"** — มันคือคำสั่งลบข้อมูลลูกค้าจริงทั้งฐาน ที่รอแค่ให้ใครสัก connection ชี้ถูกที่ ระยะห่างระหว่าง "ปลอดภัย" กับ "ข้อมูลหายทั้งระบบ" คือ environment variable ตัวเดียว

สถานการณ์ที่เกิดขึ้นได้จริงและเกือบเกิดแล้ว:

1. worktree ของ feature ไม่มี `.env` ของตัวเอง จึงมีคำแนะนำให้ `set -a && . /Users/craftman/Projects/safepay/.env.local && set +a` ก่อนรัน prisma
2. `.env.local` ชี้ไป Supabase (= prod)
3. รัน `npx vitest run tests/` ต่อในเชลล์เดียวกัน
4. ข้อมูลจริงหายทั้งฐาน

---

## 2. อะไรที่ห้าม

ห้ามปรากฏใน `tests/**`, `e2e/**`, `**/__tests__/**`, `*.test.ts`, `*.spec.ts`:

| รูปแบบ | ทำไมถึงห้าม |
|--------|-------------|
| `deleteMany()` / `deleteMany({})` | ไม่มี `where` = ลบทั้งตาราง |
| `TRUNCATE` | ลบทั้งตาราง |
| `DELETE FROM ...` ที่ไม่มี `WHERE` | ลบทั้งตาราง |
| `DROP TABLE` / `DROP SCHEMA` / `DROP DATABASE` | ทำลาย schema |
| `prisma migrate reset` | reset ทั้งฐาน |
| `prisma db push --force-reset` | reset ทั้งฐาน |
| `prisma db pull` | ทับ `schema.prisma` และลบ EXCLUDE constraint ของ 00008/00017/00024 ที่ introspection มองไม่เห็น |

**carve-out เดียว:** บรรทัดที่เป็นคอมเมนต์ (ขึ้นต้นด้วย `//`, `*`, `/*`) — คอมเมนต์รันไม่ได้ และเอกสาร/คอมเมนต์ที่อธิบายกฎข้อนี้ต้องพิมพ์ชื่อคำสั่งที่ห้ามได้ โค้ดจริงที่มีคอมเมนต์ต่อท้าย เช่น `await x.deleteMany() // ล้างก่อน` **ยังโดนจับ**

---

## 3. ทำแทนยังไง

### ทางที่ดีที่สุด — ไม่แตะ DB เลย

แยกตรรกะที่อยากเทสออกมาเป็นฟังก์ชันบริสุทธิ์ แล้ววาง unit test ไว้ที่ `src/**/__tests__/` (ไม่ผ่าน `tests/setup.ts`)

ตัวอย่างที่ทำแล้ว: `src/services/__tests__/appointment-deposit.test.ts` เทสกฎมัดจำทั้ง 14 เคสโดยไม่แตะ DB สักครั้ง — เร็วกว่า เสถียรกว่า และลบข้อมูลใครไม่ได้เลยโดยธรรมชาติ

### ถ้าจำเป็นต้องแตะ DB จริง — scope ด้วย id ที่เทสสร้างเอง

```ts
import { prisma, deleteTestData } from "../setup";

let userIds: string[] = [];
let shopIds: string[] = [];

afterEach(async () => {
  await deleteTestData({ userIds, shopIds });
  userIds = [];
  shopIds = [];
});

it("...", async () => {
  const user = await prisma.user.create({ data: { ... } });
  userIds.push(user.id);          // เก็บ id ทันทีที่สร้าง
  // ...
});
```

`deleteTestData()` ใน `tests/setup.ts` ลบตามลำดับ dependency (ลูกก่อนแม่) และ **scope ด้วย id ที่ส่งเข้ามาเสมอ** — ส่ง array ว่างเข้าไปคือ no-op ไม่ใช่ "ลบทั้งหมด"

---

## 4. การป้องกัน 3 ชั้น

| ชั้น | กลไก | กันอะไร |
|------|------|---------|
| ตอนเขียน | hook `.claude/hooks/test-db-guard.sh` (PostToolUse บน Write/Edit) | block ไม่ให้เขียนคำสั่งต้องห้ามลงไฟล์เทสตั้งแต่แรก |
| ตอนรัน | allowlist ใน `tests/setup.ts` | `DATABASE_URL` ที่ไม่ใช่ localhost → throw ทันทีก่อนต่อ DB |
| ตอนเรียก | `cleanDatabase()` throw | ไฟล์เก่าที่ยังเรียกอยู่ fail ดัง ๆ แทนที่จะลบเงียบ ๆ |

**ชั้นที่ 2 เป็น allowlist ไม่ใช่ denylist โดยตั้งใจ** — ของเดิมเช็คว่า URL มีคำว่า `supabase` ซึ่งพลาดได้ถ้า host เปลี่ยนหรือต่อผ่าน proxy ตอนนี้ผ่านเฉพาะ `localhost` / `127.0.0.1` / `host.docker.internal` เท่านั้น อะไรที่ไม่ได้ระบุว่าปลอดภัย = ถือว่าอันตรายไว้ก่อน

---

## 5. หนี้ที่ค้างอยู่

ไฟล์ต่อไปนี้ยังเรียก `cleanDatabase()` อยู่ และจะ **fail ทันที** จนกว่าจะแก้ให้ track id เอง — ตั้งใจให้ fail ดังกว่าปล่อยผ่านเงียบ ๆ:

- `tests/integration/signup-achievement.test.ts`
- `tests/services/badge.test.ts`
- `tests/services/order.test.ts`
- `tests/services/order-state-machine.test.ts`
- `tests/services/product-capability.test.ts`
- `tests/services/review.test.ts`
- `tests/services/seed-badges.test.ts`
- `tests/services/trust-score.test.ts`

ชุดนี้ต้องมี local Docker Postgres ถึงจะรันได้อยู่แล้ว (ตาม allowlist) การแก้ให้ scope จึงเป็นงานแยกที่ทำเมื่อจะกลับมาใช้ชุดนี้จริง

---

เกี่ยวข้อง: `docs/conventions/seed-and-env.md` · memory `project_shared_db_drift_no_migrate_dev`, `project_prisma_migration_env_targets`, `feedback_qa_agent_no_prisma_pull`
