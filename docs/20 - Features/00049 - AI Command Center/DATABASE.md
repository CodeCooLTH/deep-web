---
title: "DATABASE — AI Command Center + Agent Chain"
owner: shinobu22
status: draft
created: 2026-08-16
tags: [feature, database, 00049]
related: ["[[PRD]]", "[[BRD]]", "[[UX-Design-Spec]]"]
---

> **โมดูล:** 00049 — AI Command Center + Agent Chain
> **ประเภทเอกสาร:** DATABASE Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-16
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** safepay-database (ดู `docs/99 - Rules/Feature-Docs-Ownership.md`)

---

## 0. สรุปหัวเรื่อง (อ่านก่อนอย่างอื่นทั้งหมด)

🛑 **ฟีเจอร์นี้ไม่มีการเปลี่ยนแปลงฐานข้อมูลเลย** — ไม่มีตาราง Prisma ใหม่ ไม่มี migration
ไม่มีคอลัมน์ใหม่ ไม่มี index ใหม่ ไม่มี constraint ใหม่

นี่คือมติที่ตัดสินแล้วในดีไซน์ที่ user อนุมัติ (`docs/superpowers/specs/2026-08-16-ai-command-center-design.md`
§3 มติ D-8) และถูกยกเป็นกฎธุรกิจใน BRD:

- **BR-CC-08** — "ไม่มีตาราง Prisma ใหม่ ไม่มี migration สำหรับฟีเจอร์นี้เอง"
- **BR-CC-09** — "จอไม่เก็บ state ของตัวเอง อ่านจาก GitHub ตรงเสมอ"

เอกสารนี้จึงไม่ใช่เอกสารเปล่าที่รอเติมตาราง — เนื้อหาที่ต้องมีคือ **หลักฐานว่าไม่มีการเปลี่ยนแปลงจริง**,
**เหตุผลเชิงออกแบบว่าทำไม**, **สถานะของระบบเก็บอยู่ที่ไหนแทน** และ **กฎกันคนในอนาคตกลับมตินี้โดยไม่รู้ตัว**

---

## 1. Overview

Command Center (`admin.deepthailand.app/command-center`) เป็นหน้าจอที่แสดงสถานะของงานที่ AI agent
กำลังทำอยู่ ณ ขณะนั้น — วางแผน → ออกแบบ UX → เขียน → รีวิว → QA → sync เอกสาร → รอ user เคาะ "พร้อมขึ้น"

**store ที่ฟีเจอร์นี้เกี่ยวข้อง:**

| store | บทบาท |
|---|---|
| PostgreSQL 16 (Supabase, ผ่าน Prisma) | **ไม่แตะเลย** — ฟีเจอร์นี้ไม่สร้าง อ่าน หรือเขียนตารางใดใน store นี้ |
| GitHub (issue / PR / label / comment / repo variable) | **เป็นฐานข้อมูลจริงของฟีเจอร์นี้** — ดู §3 |

เอกสารนี้จึงไม่มีหัวข้อ ERD / Tables / Indexes / Migration Plan ตามโครงเทมเพลตมาตรฐาน
(`docs/99 - Rules/Feature-Templates/DATABASE.md`) เพราะไม่มีเนื้อหาให้ใส่จริง — แทนที่ด้วย §3–§5
ที่อธิบายว่าอะไรทำหน้าที่แทนสิ่งเหล่านั้น

---

## 2. หลักฐานว่าไม่มี migration

ยืนยันด้วยตาจากไฟล์จริง ณ วันที่เขียนเอกสารนี้ (2026-08-16):

```
$ ls prisma/migrations | wc -l
142

$ ls prisma/migrations | sort | tail -5
20260813100000_user_locale
20260813120000_customer_file_library
20260815100000_comment_auto_reply_per_comment
20260815160000_comment_public_reply_image
20260815180000_comment_reply_rule
```

ไม่มี migration ใดของฟีเจอร์ 00049 อยู่ในโฟลเดอร์ — migration ล่าสุดคือ
`20260815180000_comment_reply_rule` ซึ่งเป็นของ feature 00038 ส่วนขยาย (comment auto-reply)

```
$ grep -rni "command.center\|CommandCenter\|command_center" prisma/schema.prisma
(ไม่มีผลลัพธ์)
```

`prisma/schema.prisma` ไม่มี model, enum, หรือ comment ใดที่อ้างถึง "Command Center" / "AI agent chain"
เลยสักบรรทัด

**เมื่อ implement จริง (P4 ตามลำดับงานใน design spec §10):** ก่อนเปิด PR ทุกใบของฟีเจอร์นี้
ให้รันคำสั่งเดียวกันนี้ซ้ำเป็นด่านสุดท้ายก่อนขอรีวิว — ถ้าคืนผลลัพธ์ที่ไม่ใช่ค่าว่าง/142 (หรือเลขที่มากขึ้น
จากฟีเจอร์อื่นที่ merge แทรกเข้ามา) แปลว่ามีคนแอบเบี่ยงจากมติ D-8 ต้องหยุดแล้วถามก่อน ไม่ใช่ปล่อยผ่าน

---

## 3. เหตุผลเชิงออกแบบ — ทำไมถึงเลือก "ไม่เก็บ state"

### 3.1 ตัวเลขที่ไม่ตรงกับความจริง อันตรายกว่าไม่มีตัวเลข (HR16)

CLAUDE.md Hard Rule 16 บันทึกบทเรียนไว้ว่าตัวเลขที่ "ดูเหมือนครบ" แต่ผิด อันตรายกว่าไม่มีตัวเลขเลย
เพราะผู้ใช้ไม่มีทางรู้ว่ามันผิดจนกว่าจะเชื่อไปทำอะไรผิดพลาดตามมัน — บทเรียนเดิมของโปรเจกต์นี้คือ
"กำไร" สองนิยามที่ชนกันในไฟล์เดียวกัน (feature 00016 ส่วนขยาย, 2026-08-08)

Command Center มีความเสี่ยงแบบเดียวกัน **แต่รุนแรงกว่า** ถ้าเลือกเก็บ state คู่ขนาน: สถานะจริงของ
PR/issue เปลี่ยนบน GitHub ได้ตลอดเวลาโดยไม่ผ่านหน้าจอนี้เลย (คนแก้ป้ายตรง ๆ บน GitHub UI, agent
เปลี่ยนป้ายผ่าน API, workflow อื่นแตะป้าย) — cache ใด ๆ ในฐานของเราจะ **drift ออกจากความจริงทันทีที่มี
การเปลี่ยนแปลงที่ไม่ได้เดินผ่าน API ของเรา** และไม่มีทางรู้ว่า drift ไปแล้วจนกว่าจะมีคนเทียบเอง

การไม่เก็บ state คู่ขนานเลย คือวิธีเดียวที่รับประกันว่า **สิ่งที่จอแสดง = สิ่งที่ GitHub ว่าไว้ ณ วินาทีนั้น
เสมอ** ไม่มีทางเป็นอย่างอื่นได้ เพราะไม่มีค่าที่สองให้ผิดจากค่าแรก

### 3.2 ฐาน prod เคยถูกล้างทั้ง 64 ตารางมาแล้ว

2026-07-31 ฐาน prod ของโปรเจกต์นี้ถูกล้างทั้ง 64 ตารางจากคำสั่ง Prisma ที่ชี้ผิดที่
(`docs/conventions/prod-db-safety.md`, CLAUDE.md Hard Rule 14) — เหตุการณ์นี้เป็นเหตุผลโดยตรงที่
design spec มติ D-1 จำกัดอำนาจ agent ไว้แค่ "เปิด PR ได้อย่างเดียว ห้ามแตะ DB"

ฟีเจอร์ที่ **ไม่มี migration และไม่มี write path เข้าฐานเลยแม้แต่บรรทัดเดียว** คือฟีเจอร์ที่เป็นไปไม่ได้
โดยโครงสร้างที่จะทำให้เกิดเหตุการณ์แบบ 2026-07-31 ซ้ำผ่านโค้ดของฟีเจอร์นี้ — ไม่ใช่เพราะมีด่านป้องกัน
แต่เพราะไม่มีเส้นทางให้เกิดเรื่องนั้นได้ตั้งแต่ต้น

### 3.3 ทำไมไม่ "cache ไว้หน่อยเพื่อลด GitHub API call"

ตัวเลือกที่ถูกพิจารณาและปฏิเสธ: เก็บ snapshot สถานะล่าสุดไว้ในตารางเพื่อให้จอโหลดเร็วขึ้น/ลด rate limit

**ปฏิเสธเพราะ:** design spec §7.2 แก้ปัญหาโควตา GitHub API (5,000 req/ชม.) ด้วย **poll ห่าง ๆ (15–30 วิ)
+ ETag/conditional request** อยู่แล้ว ซึ่งแก้ปัญหาเดียวกัน (โควตา) โดยไม่ต้องสร้างแหล่งความจริงที่สอง
— ทางออกที่ไม่ต้องแลกด้วยความเสี่ยง drift ควรถูกเลือกก่อนทางที่ต้องแลก

---

## 4. สถานะของระบบ เก็บอยู่ที่ไหนแทน

ตารางนี้แทนที่หัวข้อ "3. Tables" ของเทมเพลตมาตรฐาน — ไม่มี Prisma table ให้ list แต่มี "ที่เก็บสถานะ"
จริงที่กระจายอยู่บน GitHub (อ้างอิง design spec §5–§7):

| ที่เก็บ | เก็บอะไร | ใครเขียน | ใครอ่าน | อ่านยังไง |
|---|---|---|---|---|
| ป้าย `stage:plan` / `stage:ux` / `stage:build` / `stage:review` / `stage:qa` / `stage:docs` บน issue/PR | ใบงานอยู่ขั้นไหนในสายงาน 6 ขั้น (routing) | agent ตัวที่ทำขั้นนั้นเสร็จ (เปลี่ยนป้ายเป็นขั้นถัดไป), หรือ user (สั่งงานใหม่ = `stage:plan`) | Command Center (poll), `auto-merge.yml`, agent ตัวถัดไปในสาย | GitHub REST `.labels` ของใบเอง — **ห้ามใช้ `gh pr list --label`** (BR-CC-10: พิสูจน์แล้วว่าคืนใบที่ไม่มีป้ายด้วย) |
| ป้าย `พร้อมขึ้น` | ประตูอนุมัติเดียวที่ user ติดเองเท่านั้น | **user เท่านั้น** (ปุ่ม "เคาะพร้อมขึ้น" บนจอ → API route ของเรา → GitHub API — ไม่มี agent เขียนป้ายนี้ได้) | `auto-merge.yml` ด่าน 1 | เช่นเดียวกับข้างบน |
| comment โครงตายตัว (`<!-- deep:stage=... from=... at=... -->` + ผลของขั้น) บน PR/issue | payload ที่ส่งต่อระหว่างขั้น (สรุป, ไฟล์ที่แตะ, Theme Source, ข้อควรระวัง) | agent ที่เพิ่งทำขั้นนั้นเสร็จ | agent ขั้นถัดไป (อ่านจาก PR เพื่อสร้าง context ใหม่ — ไม่มี context ส่งต่อแบบอื่น, design spec §5.2), Command Center (แสดงสรุปบนจอ) | GitHub REST comments ของ PR/issue นั้น |
| repo variable `HERMES_HEARTBEAT` | timestamp (Unix epoch) ล่าสุดที่เครื่อง Hermes ยังทำงานอยู่ | เครื่อง Hermes เขียนทับค่าเดิมทุกครั้งที่ poll (ไม่สร้าง commit ไม่สร้าง notification) | `watchdog.yml` (cron ทุก 30 นาที) | `gh api repos/:owner/:repo/actions/variables/HERMES_HEARTBEAT` |
| GitHub issue "เครื่อง Hermes ขาดการติดต่อ" | สัญญาณเตือนเมื่อ `HERMES_HEARTBEAT` เก่ากว่า 2 ชม. | `watchdog.yml` (เปิด/อัปเดตอัตโนมัติ) | Command Center (แสดงแถบแดง), user | GitHub issue list/search |
| `head_sha` ของ main + CI check-run status | main สงบพอจะ merge หรือยัง, main แดงอยู่หรือไม่ | GitHub เอง (จาก push event / workflow run) | `auto-merge.yml` ด่าน 2/3/4 | GitHub Checks API ผูกกับ `head_sha` ของ main ปัจจุบันเท่านั้น (ไม่ใช้ run ล่าสุดของ branch เฉย ๆ) |

**ไม่มีแถวไหนในตารางนี้อยู่ใน PostgreSQL ของเรา** — ทุกแถวคือ state ที่ GitHub เป็นเจ้าของ

```mermaid
flowchart TB
    subgraph GH["GitHub — เจ้าของ state ทั้งหมด"]
        L["ป้าย stage:* / พร้อมขึ้น"]
        C["comment โครงตายตัว"]
        V["repo variable HERMES_HEARTBEAT"]
        I["issue แจ้งเตือน"]
        CH["check-run / head_sha"]
    end
    CC["Command Center<br/>(RSC + client poll 15-30วิ + ETag)"] -->|อ่านอย่างเดียว ไม่มี cache ตัวกลาง| GH
    CC -->|เขียนผ่าน API route ของเรา<br/>(สร้าง issue / ติดป้าย / comment)| GH
    PG[("PostgreSQL 16<br/>ของโปรเจกต์")]
    CC -.->|ไม่มีเส้นทางนี้อยู่จริง| PG
```

---

## 5. 🛑 กฎสำหรับอนาคต — ห้ามใครกลับมติ D-8 โดยไม่รู้ตัว

ถ้าวันหนึ่งมีคนอยากเพิ่มตาราง Prisma เพื่อ cache สถานะ (เหตุผลที่มักฟังดูสมเหตุสมผล เช่น "ลด GitHub
API call" หรือ "อยากมีประวัติย้อนหลังที่ query ได้เร็วกว่า GitHub Search") **ต้องอ่านหัวข้อนี้ก่อน:**

1. **นั่นคือการสร้าง "ค่าเดียวกันสองที่" ซึ่ง Hard Rule 16 ห้าม** — สถานะของใบงาน (ป้าย/comment)
   จะมีอยู่ทั้งบน GitHub (ความจริง) และในตารางใหม่ (cache) พร้อมกัน สองแหล่งนี้ **รับประกันไม่ได้ว่า
   sync กันเสมอ** เพราะ GitHub เปลี่ยนได้จากหลายทาง (คนแก้ตรง GitHub UI, agent อื่นที่ไม่ผ่าน API
   ของเรา, workflow อื่น) โดยไม่มีอะไรบังคับให้แจ้ง cache ของเรา — นี่คือรูปแบบเดียวกับ "กำไร" สองนิยาม
   ที่ชนกันใน 00016 ส่วนขยาย ต่างกันแค่ว่ารอบนี้เรารู้ล่วงหน้าก่อนสร้างปัญหา

2. **`.github/workflows/auto-merge.yml` มีด่านที่บล็อก PR ที่แตะ `prisma/migrations/**` ไม่ให้
   auto-merge** (design spec §6.2 ด่าน 5, BR-CC-04) — เหตุผลคือ `vercel.json` ของโปรเจกต์นี้คือ

   ```
   prisma migrate deploy && prisma generate && next build
   ```

   ⇒ **merge เข้า main = migration รันบน prod ทันที** (CLAUDE.md Hard Rule 15) การเพิ่มตารางสำหรับ
   ฟีเจอร์นี้จึงไม่ใช่แค่ "เพิ่ม field" — มันคือการเปิดเส้นทางที่ merge อัตโนมัติของฟีเจอร์ command-center
   เองไปแตะ prod schema โดยไม่มีคนอ่าน SQL ก่อน (เว้นแต่จะยอมให้ PR ประเภทนี้ตกไปที่ merge มือเสมอ)

3. **ถ้ายืนยันว่าจำเป็นจริง ๆ** ต้องผ่านขั้นตอนเดียวกับฟีเจอร์อื่นทุกอย่าง (Hard Rule 11:
   Documentation-First) — เขียน PRD/BRD ใหม่ที่พลิกมติ D-8 อย่างชัดเจน ผ่าน user review ก่อน แล้ว
   `safepay-database` เขียน DATABASE.md ฉบับใหม่แทนที่ฉบับนี้ พร้อม ERD/Tables/Indexes/Migration Plan
   เต็มรูปแบบตามเทมเพลตมาตรฐาน — **ห้ามเพิ่มตารางเงียบ ๆ ในคอมมิตที่อ้างว่าเป็นแค่ "ปรับปรุงประสิทธิภาพ"**

---

## 6. สิ่งที่ฟีเจอร์นี้ *อ่าน* จากฐานเดิม

ฟีเจอร์นี้ไม่สร้างตารางใหม่ แต่หน้าจออยู่ใต้ route group ที่มี guard เดิมอยู่แล้ว — ต้องบันทึกไว้ให้ชัด
ว่าพึ่งพา field อะไรของ schema เดิมบ้าง เพื่อไม่ให้ใครมาแก้ field เหล่านี้โดยไม่รู้ว่ากระทบหน้านี้ด้วย

**ยืนยันจากโค้ดจริง** (`src/app/(paces)/admin/(dashboard)/layout.tsx`, อ่านเมื่อ 2026-08-16):

```ts
const session = await getServerSession(authOptions)
const user = (session as any)?.user as
  | { id: string; displayName: string; username: string; avatar: string | null
    ; isShop: boolean; isAdmin: boolean; trustScore: number }
  | undefined

if (!session || !user?.id) redirect('/auth/sign-in')
if (!user.isAdmin) redirect('/auth/sign-in')
```

หน้า `command-center/page.tsx` (design spec §7.1) จะอยู่ใต้ `(paces)/admin/(dashboard)/` — layout นี้
เป็นตัวเดียวที่ guard สิทธิ์ (comment ในไฟล์เขียนไว้ตรง ๆ ว่า "หน้าลูกไม่ต้องเช็คซ้ำ") ดังนั้นหน้านี้
**พึ่งพา field เดียว** จาก `User` model ทางอ้อมผ่าน session:

| Field | Model | หน้าที่ต่อฟีเจอร์นี้ |
|---|---|---|
| `User.isAdmin` (`Boolean @default(false)`, `prisma/schema.prisma:20`) | `User` | ตัวตัดสินว่าเข้า `/admin/command-center` ได้ไหม — อ่านผ่าน NextAuth session (`session.user.isAdmin`) ไม่ใช่ query ตรงในหน้านี้ |

**ไม่มีการ query ตาราง PostgreSQL อื่นใดจากหน้านี้หรือ API route ของฟีเจอร์นี้** — ทุก read/write อื่น
ของฟีเจอร์เดินผ่าน GitHub API ทั้งหมดตาม §4

---

## 7. Traceability

| หัวข้อใน SDS/BRD | สถานะ |
|---|---|
| BR-CC-08 (ไม่มีตาราง Prisma ใหม่ ไม่มี migration) | ✅ ยืนยันแล้ว §2 |
| BR-CC-09 (จอไม่เก็บ state ของตัวเอง อ่านจาก GitHub ตรงเสมอ) | ✅ ยืนยันแล้ว §3–§4 |
| BR-CC-04 (PR ที่แตะ `prisma/migrations/**` ห้าม auto-merge) | ✅ บันทึกเป็นกฎกันอนาคต §5.2 — บังคับจริงอยู่ใน `.github/workflows/auto-merge.yml` (P2, ยังไม่ implement ณ วันที่เขียนเอกสารนี้) |
| Design spec D-8 | ✅ สอดคล้อง — เอกสารนี้คือ artifact ที่ยืนยันมติ D-8 |
| Admin guard (`(dashboard)/layout.tsx`) | ✅ ยืนยันจากโค้ดจริง §6 |

---

## 8. สรุป (Summary)

เอกสาร DATABASE ฉบับนี้ของ **AI Command Center + Agent Chain (00049)** ยืนยันว่า **ไม่มีการเปลี่ยนแปลง
ฐานข้อมูล PostgreSQL ของโปรเจกต์เลย** — ไม่มีตาราง ไม่มี migration ไม่มีคอลัมน์ ไม่มี index ใหม่
สถานะทั้งหมดของฟีเจอร์นี้เป็นของ GitHub (ป้าย, comment, repo variable, issue, check-run) และหน้าจอ
อ่านจากที่นั่นตรง ๆ ทุกครั้งที่ render — ทางเลือกนี้เกิดจากบทเรียนสองเรื่องของโปรเจกต์เอง: ตัวเลขที่ผิด
อันตรายกว่าไม่มีตัวเลข (HR16) และฐาน prod เคยถูกล้างทั้งฐานมาแล้วจากคำสั่งที่ชี้ผิดที่ (2026-07-31)

จุดเดียวที่ฟีเจอร์นี้แตะ schema เดิมคือการ **อ่าน** `User.isAdmin` ผ่าน session ที่ layout เดิมทำ guard
ให้อยู่แล้ว ไม่มี query ใหม่ ไม่มี write ใหม่

**Open Questions:**
- ไม่มี — มติ D-8 ปิดประเด็นนี้แล้วในดีไซน์ที่ user อนุมัติ ถ้ามีคนต้องการเปิดใหม่ ให้เดินตาม §5 ข้อ 3
  (เขียน PRD/BRD ใหม่ ผ่าน user review ก่อนแตะ schema)
