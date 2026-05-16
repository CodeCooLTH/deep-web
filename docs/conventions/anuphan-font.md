# Anuphan-only Font Rule

> ทุก surface ของ Deep (buyer/seller/admin ทุก subdomain ทุก skin) ต้องแสดงผลด้วย font **Anuphan** เป็น primary เท่านั้น — enforce ผ่าน skill `ui-theme-sourcing` (auto-trigger ก่อน UI Write) + reviewer gate. ไม่ block dev loop ด้วย CI hard-fail (ตัดสิน 2026-05-16).

## กฎ

1. body text + heading ทุก element ทุก subdomain → `font-family` ต้อง resolve เป็น **Anuphan** เป็น segment แรก
2. fallback stack ที่อนุญาต: `var(--font-anuphan), "Noto Sans Thai", system-ui, -apple-system, "Segoe UI", sans-serif` (Noto Sans Thai = fallback ลำดับสอง ไม่ใช่ primary)
3. Anuphan ครอบ weight 100–700 (กัน faux-bold)

## ข้อยกเว้น (อนุญาตชัดแจ้ง — เท่านี้)

| ยกเว้น | เหตุผล |
|---|---|
| `monospace` (Consolas/Monaco/...) ใน code block `<pre>`/`<code>`/prismjs | code ต้อง monospace |
| icon font ของ `@iconify/react` | เป็น glyph ไม่ใช่ text font |
| third-party widget ใน iframe/Shadow DOM (chat, map embed) | CSS เราเข้าไม่ถึง — out of scope |

นอกเหนือจากนี้ **ห้าม** hardcode `font-family`/`fontFamily` เป็นค่าอื่น (Inter, Public Sans, Poppins, Nunito, Roboto, Google Sans ฯลฯ) ใน `src/app/**`, `src/views/**`, `src/components/**`, theme override CSS, หรือ MUI/Tailwind theme token.

## วิธี enforce (developer + reviewer + safepay-ux)

- **ก่อน Write UI:** skill `ui-theme-sourcing` เตือน — theme file ที่ copy มามักมี default font ของ theme เดิม (Vuexy=Public Sans, Paces=Poppins/Nunito) ต้องไม่ปล่อยให้ default นั้นทับ Anuphan
- **reviewer:** เช็ก grep `font-family|fontFamily` ในไฟล์ที่แตะ — ต้องเป็น Anuphan/CSS-variable/ข้อยกเว้น
- **safepay-ux:** ห้ามระบุ font อื่นใน design spec

## จุดที่เป็น source of truth (ห้ามแก้ให้หลุด Anuphan)

| ไฟล์ | บทบาท |
|---|---|
| `src/app/(marketing)/layout.tsx` | Vuexy: `next/font/google` Anuphan → `--font-anuphan` |
| `src/app/(marketing)/marketing.css` | `--font-sans` / `.marketing-body` ชี้ Anuphan |
| `src/@core/theme/index.ts` | ส่ง `anuphan.style.fontFamily` เข้า MUI typography |
| `src/@core/theme/typography.ts` | fallback default (กรณี arg ว่าง) ต้องเป็น Anuphan stack — **ไม่ใช่** Public Sans |
| `src/assets/css/safepay-overrides.css` | Paces: override `--font-body`/`--font-secondary` = Anuphan ทุก skin |
| `src/assets/css/config/_root.css` | Paces base `@theme` — `--font-body`/`--font-secondary` ต้องชี้ Anuphan โดยตรง (ไม่พึ่ง cascade จาก override อย่างเดียว) |
| `src/app/(paces)/layout.tsx` | Paces โหลด Anuphan |

## Known non-compliant (พบจาก survey 2026-05-16 — remediation รออนุมัติเป็น phase แยก)

ตัดสินแล้วว่า scope แก้ = แปลง Paces เป็น `next/font` + ตัด `@import` ฟอนต์อื่นออก แต่ยังไม่ลงมือ (เป็น phase ≥3 tasks ต้องผ่าน agent-team):

1. `src/app/(paces)/layout.tsx` — โหลด Anuphan ผ่าน `<link>` Google Fonts → ต้องเปลี่ยนเป็น `next/font/google` (FR-FONT-2)
2. `src/assets/css/config/_root.css` `@theme` — `--font-body: "Nunito"`, `--font-secondary: "Google Sans"` base default ไม่มี Anuphan; พึ่ง `safepay-overrides.css` cascade เท่านั้น (FR-FONT-3) — เสี่ยงถ้า override load order เพี้ยน
3. `src/@core/theme/typography.ts` — fallback default เป็น `"Public Sans"` ถ้า fontFamily arg ว่าง (FR-FONT-4)
4. `src/assets/css/config/_font.css` — `@import` 20+ ฟอนต์ที่ไม่ใช้ (Nunito/Poppins/Inter/Roboto/...) โหลดทุก request บน Paces (FR-FONT-5, nice-to-have)

> remediation เหล่านี้เป็น code change ที่แตะ theme/layout — ต้อง plan เป็น phase + ผ่าน reviewer/QA (AC: computed `font-family` ของ body/heading ทุก subdomain ขึ้นต้น Anuphan; network ฝั่ง seller ไม่มี request Poppins/Nunito/Inter)

## Acceptance (เมื่อ remediate)

- `getComputedStyle(document.body).fontFamily` ที่ deepthailand.app / seller.* / admin.* → ขึ้นต้น Anuphan
- `h1..h6` ทุก subdomain → ขึ้นต้น Anuphan
- `<code>`/prismjs → ยัง monospace
- Network seller.* → ไม่มี request font Poppins/Nunito/Inter/Public Sans/Google Sans/Roboto
- `next build` ผ่าน, LCP ไม่ถดถอย >5%
