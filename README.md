# Deep (codename: SafePay)

> แพลตฟอร์มสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์ C2C — แก้ปัญหา "โอนแล้วไม่ได้ของ / มิจฉาชีพ" ด้วยการทำให้ **ความน่าเชื่อถือมองเห็นและตรวจสอบได้ก่อนโอนเงิน** ผ่าน Verify ตัวตน, Trust Score, Badge และ Order History

- **ชื่อทางการค้า:** Deep (UI copy, prod `deepthailand.app`)
- **Codename:** SafePay (repo, identifiers, DB ยังใช้ชื่อนี้)
- **เอกสารหลัก:** ภาพรวม → [`docs/PRD.md`](docs/PRD.md) · สเปก dev → [`docs/SRS.md`](docs/SRS.md) · กฎ/workflow → [`CLAUDE.md`](CLAUDE.md)

---

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) · TypeScript strict |
| UI (dual theme) | **Buyer/landing** = Vuexy (MUI v9 + Emotion + Tailwind 4) · **Seller/admin** = Paces (Preline 4 + Tailwind 4, no MUI) |
| Database | PostgreSQL 16 (Supabase) · Prisma ORM |
| Auth | NextAuth v4 (Facebook OAuth + Phone OTP) |
| SMS/OTP | apitel (phone OTP + paid SMS order link) |
| Validation | Valibot (API) · Yup (form) |
| Font | Anuphan (ทุก surface) |
| Test | Vitest |

ดูรายละเอียดเต็ม: [`docs/SRS.md` §5 Tech Stack](docs/SRS.md)

---

## สถาปัตยกรรม (ย่อ)

- **Profile-Centric** — ทุก account มี trust profile เดียวกัน, เปิดร้านเพิ่มได้ (`isShop` flag) — ไม่แบ่ง role buyer/seller แต่กำเนิด
- **Subdomain routing** (`src/proxy.ts`) — แยก 3 surface + session แยกตาม subdomain (host-scoped cookie):

  | Subdomain (dev) | สำหรับ |
  |---|---|
  | `deepth.local:4000` | Public + Buyer (Vuexy) |
  | `seller.deepth.local:4000` | Seller (Paces) |
  | `admin.deepth.local:4000` | Admin (Paces) |

- **Service layer** (`src/services/`) แยกจาก API layer (`src/app/api/`)
- โครงไดเรกทอรี + core systems: ดู [`CLAUDE.md`](CLAUDE.md) · data model + API: ดู [`docs/SRS.md`](docs/SRS.md) §6–§7

---

## เริ่มต้น (Local Dev)

### Prerequisites
- Node.js (LTS) + npm
- เข้าถึง Supabase dev DB (ใช้ร่วม — connection string อยู่ใน `.env.local`)
- **แก้ `/etc/hosts`** เพิ่ม subdomain dev (จำเป็นสำหรับ session แยก subdomain):
  ```
  127.0.0.1  deepth.local seller.deepth.local admin.deepth.local
  ```

### Setup
```bash
npm install                      # + prisma generate (postinstall)
cp .env.example .env.local       # แล้วเติมค่า (DB, NEXTAUTH_SECRET, FB/apitel creds)
npm run migrate                  # prisma migrate dev
npm run seed:supabase            # seed dev DB (Supabase, ใช้ .env.local)
```

> ⚠️ **dev DB = Supabase ผ่าน `.env.local`** (ไม่ใช่ Docker `.env`) — Next.js โหลด `.env.local` ก่อน. `migrate`/`test`/`seed:local` ผูก `.env`; `seed:supabase` ผูก `.env.local`. ดู [`docs/conventions/seed-and-env.md`](docs/conventions/seed-and-env.md)

### รัน dev server
```bash
npm run dev -- -p 4000           # ⚠️ port 4000 (3000-3002 = โปรเจกต์อื่น)
```
เปิด: `http://deepth.local:4000` (buyer) · `http://seller.deepth.local:4000` (seller) · `http://admin.deepth.local:4000` (admin)

### คำสั่งอื่น
```bash
npm test                         # Vitest (critical services)
npm run lint                     # next lint
npm run format                   # prettier
npm run migrate                  # prisma migrate dev
npm run clean                    # rm -rf .next (แก้ phantom crash)
```

### Env vars หลัก (ดู `.env.example` เต็ม)
`DATABASE_URL` · `NEXTAUTH_SECRET` `NEXTAUTH_URL` · `FACEBOOK_ID/SECRET` · `APITEL_API_KEY/SECRET/BASE_URL/SENDER_NAME` (SMS) · `NEXT_PUBLIC_BUYER_URL` `NEXT_PUBLIC_SELLER_URL` · `STORAGE_DRIVER`

---

## QA (E2E)

- User รัน dev server เอง (Claude/agent ไม่ start ให้) — QA ผ่าน **Chrome DevTools MCP** ที่ subdomain จริง `*.deepth.local:4000`
- seed ผ่าน Prisma client เท่านั้น (**ห้าม `prisma db pull`** — ทับ schema)

---

## เอกสาร (Documentation)

| เอกสาร | เนื้อหา |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | **Product** — vision, personas, user stories, feature overview, scope, business model, roadmap |
| [`docs/SRS.md`](docs/SRS.md) | **Software spec** — FR detail (สูตร/acceptance), state machine, routing, NFR, **data model, API reference, enums, authorization matrix, validation** |
| [`CLAUDE.md`](CLAUDE.md) | กฎโปรเจกต์ (Hard Rules), architecture, conventions, current state |
| [`docs/10 - Business Rules/`](docs/10%20-%20Business%20Rules/) | Tier Lists (SSOT ของ trust tier) |
| [`docs/conventions/`](docs/conventions/) | engineering conventions (agent workflow, font, RSC nav, security, seed/env ...) |
| [`docs/system/ui-guideline/`](docs/system/ui-guideline/) | UI guideline + page-sourcing (must-read ก่อนงาน frontend) |
| [`docs/retro/`](docs/retro/) | post-mortems รายเฟส (อ่านอันล่าสุดก่อนเริ่มเฟสใหม่) |

---

## License

Private / proprietary — Deep Thailand
