---
title: Design Spec — LINE OA Chat Integration (S-13 การ์ดเชื่อมช่องทาง + S-14 อินบ็อกซ์)
feature: 00025 LINE OA Chat Integration
scope-baseline: docs/scope/2026-08-09-00025-line-oa-chat-scope-baseline.md
s-id: S-16 (gate ของ S-13, S-14)
author: safepay-ux
date: 2026-08-09
status: รอ user review (HTML mockup 3 จอ ยังไม่ได้ทำ — ต้องทำก่อนเริ่ม S-13/S-14)
---

# Design Spec — LINE OA Chat Integration

> **Hard Rule 8 gate** — developer ห้ามแตะ frontend ของ 00025 ก่อนสเปกนี้ผ่าน user review
> ลำดับการอ่านก่อนออกแบบ: `.impeccable/design.json` + `DESIGN.md` + `PRODUCT.md` → playbook `shape.md`/`operate.md`/`craft-floor.md` → `docs/system/ui-guideline/paces-component-reference.md` → `theme/paces/Docs/index.html` → หน้าพี่น้อง `ChannelsClient.tsx` + `inbox/**` → BRD/PRD/API.md ของ 00025 → scope baseline S-13/S-14

---

## ส่วน A — การ์ด "LINE Official Account" ในหน้า `settings/channels` (S-13)

### User stories ที่ครอบ
FR-LINE-01 (เชื่อมด้วยวาง key), FR-LINE-12 (ถอดการเชื่อม) — AC ครบ 8 ข้อใน BRD §2.1

### Layout — Mobile (375px)

```
┌─────────────────────────────────┐
│ ตั้งค่า > ช่องทางแชท             │
├─────────────────────────────────┤
│ ▓▓▓▓ ช่องทางแชท ▓▓▓▓ (การ์ดเดิม) │  ← ChannelsClient.tsx เดิม ไม่แตะ
│ [Messenger/Instagram rows...]    │
└─────────────────────────────────┘
┌─────────────────────────────────┐  ← การ์ดใหม่ (sibling, คนละ .card)
│ ▓▓▓▓ LINE Official Account ▓▓▓▓ │  card-header (เส้นประ)
├─────────────────────────────────┤
│ (state: ยังไม่เชื่อม)            │
│ เชื่อม LINE OA ของร้านเพื่อรับ   │
│ และตอบข้อความ LINE จากอินบ็อกซ์  │
│ เดียวกับช่องทางอื่น              │
│                                   │
│ [ (เชื่อม LINE OA) btn-primary ] │  full-width มือถือ
└─────────────────────────────────┘
```

กด "เชื่อม LINE OA" → การ์ดขยายเป็น wizard **inline** (ไม่ใช่ modal):

```
┌─────────────────────────────────┐
│ ตั้งค่าใน LINE Developers Console│
│ ① เข้า LINE Developers Console   │
│    เลือก/สร้าง Messaging API     │
│    channel ของร้าน                │
│ ② วาง Webhook URL ด้านล่าง       │
│    ในแท็บ Messaging API แล้วกด   │
│    Verify + เปิด "Use webhook"   │
│ ③ ปิด Auto-reply/Greeting        │
│    messages ใน LINE OA Manager   │
│ ④ คัดลอก Channel secret จาก      │
│    แท็บ Basic settings           │
│ ⑤ ออก Channel access token       │
│    (long-lived) แล้วคัดลอกมาวาง  │
│                                   │
│ Webhook URL ของ Deep             │
│ [ https://deepthailand.app/...   │
│   api/channels/line/webhook ][คัดลอก]│
│                                   │
│ Channel secret *                 │
│ [(lock) ●●●●●●●●●●●●   (eye)]    │
│                                   │
│ Channel access token *           │
│ [(key)  ●●●●●●●●●●●●   (eye)]    │
│                                   │
│ [ยกเลิก]   [ตรวจสอบและเชื่อมต่อ] │
└─────────────────────────────────┘
```

สถานะเชื่อมแล้ว / TOKEN_INVALID:

```
(state: เชื่อมแล้ว)
┌─────────────────────────────────┐
│ ▓▓▓▓ LINE Official Account ▓▓▓▓ │
├─────────────────────────────────┤
│ (i) ก่อนเริ่มใช้งาน โปรดทราบ      │  ← notice ถาวร (info tone)
│ • การตอบผ่าน Deep ใช้โควตา       │
│   ข้อความ LINE ของร้าน ยกเว้น    │
│   ข้อความที่ตอบใน 1 นาทีแรก      │
│ • ข้อความที่ตอบจากแอป LINE OA    │
│   เอง จะไม่ปรากฏในหน้านี้        │
├─────────────────────────────────┤
│ (avatar+LINE) ร้านตัวอย่าง        │
│               @example           │
│               เชื่อมแล้ว          │
│                          [ถอด]   │
└─────────────────────────────────┘

(state: TOKEN_INVALID)
│ (!) การเชื่อมต่อ LINE OA มีปัญหา  │
│     ต้องเชื่อมต่อใหม่              │
│ (avatar+LINE) ร้านตัวอย่าง        │
│               @example           │
│               โทเคนหมดอายุ        │
│            [เชื่อมต่อใหม่] [ถอด]  │
```

### Layout — Tablet (768–1023px)

การ์ดเต็มความกว้าง container เดียวกับการ์ด Messenger (ไม่แบ่ง 2 คอลัมน์ — เนื้อหาเป็นฟอร์มแนวตั้งโดยธรรมชาติ) wizard: webhook URL row มีที่พอให้ `CopyLinkButton` โชว์ preview เต็มบรรทัดข้าง label แทนวางซ้อน 2 บรรทัดแบบมือถือ

```
┌───────────────────────────────────────────────────────────┐
│ Webhook URL ของ Deep                                        │
│ [ https://deepthailand.app/api/channels/line/webhook ][คัดลอก] │
└───────────────────────────────────────────────────────────┘
Channel secret / Channel access token: 2 คอลัมน์ (sm:grid-cols-2 gap-4)
```

### Layout — Desktop (≥1280px)

เหมือน tablet แต่การ์ดทั้งสองใบ (ช่องทางแชท + LINE) ยังคง **เรียงแนวตั้ง** (ไม่ใช่ 2 คอลัมน์ข้างกัน) เพราะทั้งคู่เป็น full-width settings block ตาม pattern เดิมของหน้า `settings/*` (หน้านี้ไม่มี layout 2 คอลัมน์อยู่แล้ว) — ฟอร์ม wizard จำกัด `max-w-xl` ไม่ยืดเต็มจอกว้าง เพื่อไม่ให้ field ยาวเกินอ่านยาก

### Section breakdown

**Card header** — คัดลอกโครง `card-header` แบบเดียวกับการ์ด "ช่องทางแชท" เดิมในหน้านี้ทุกประการ (pill กลาง `border-dashed`) เพื่อให้สองการ์ดเป็นพี่น้องกันบนหน้าเดียว:
`<h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm w-full justify-center">`
icon เปลี่ยนจาก `message-circle` เป็นโลโก้จริง `/images/logos/line.svg` (16px `<img>`) แทน tabler icon เพราะมี asset แบรนด์จริงอยู่แล้ว (เหมือนที่ `ChannelBadge.tsx` เลือกโลโก้จริงเหนือ tabler icon) + ข้อความ "LINE Official Account"

**สถานะยังไม่เชื่อม** — บรรทัดอธิบาย + ปุ่ม `btn bg-primary text-white hover:bg-primary-hover` "เชื่อม LINE OA" (มีโลโก้ line.svg 16px นำหน้าข้อความ) กดแล้ว toggle state ภายใน component (`wizardOpen`) ไม่ navigate ไปหน้าอื่น เพราะ flow ต้องพาเห็น webhook URL + คู่มือในหน้าเดียวกันทันที (AC บังคับ "คู่มือครบทุกขั้นตอนในหน้าเดียว")

**Wizard (ขยายในการ์ดเดิม)** — ไม่ใช้ Swal (ฟอร์มหลายฟิลด์ + คู่มือยาว ไม่ใช่ confirm สั้น ๆ — craft-floor: "Modal is usually laziness… exhaust inline alternatives first")

- คู่มือ 5 ขั้น: วงกลมเลขลำดับ `size-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center` (ไม่ใช้ icon — เลขลำดับสื่อสารพอแล้ว และลดความเสี่ยงเดา icon)
- Webhook URL: reuse `CopyLinkButton` (`src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx`) ตรง ๆ ด้วย `showPreview` — ไม่ต้องสร้างใหม่
- Channel secret / Channel access token: input มาสก์ + eye toggle — คัดลอกโครงจาก `SignInForm.tsx` (password field pattern) เป๊ะ: `input-icon-group relative` + `Icon icon="lock"` (secret) / `Icon icon="key"` (token) + `type={show ? 'text' : 'password'}` + ปุ่ม toggle `eye`/`eye-off` มุมขวา — สอดคล้อง AC "แสดงแบบปิดบังเท่านั้น" ตั้งแต่ตอนพิมพ์ ไม่ใช่แค่ตอนบันทึกแล้ว
- ปุ่ม submit: "ตรวจสอบและเชื่อมต่อ" → loading: spinner + "กำลังตรวจสอบ..." (ปิด field ระหว่างยิง)
- Error: banner `bg-danger/15 text-danger-ink` เหนือฟอร์ม (**ไม่ล้าง field ที่กรอกไว้**) ใช้ข้อความจาก `API.md` §5 ตรงตัว (`TOKEN_INVALID` / `SECRET_FORMAT_INVALID` / `LINE_ACCOUNT_MISMATCH` / `CHANNEL_TAKEN`)
- Success: ยุบ wizard, `pacesToast.success('เชื่อม LINE OA สำเร็จ')`, การ์ดแสดงแถวที่เชื่อมแล้ว + notice ถาวร 2 ข้อ + ถ้ามี `warnings: ['CHAT_MODE_NOT_BOT']` แสดง banner เพิ่ม (tone warning ไม่บล็อก): "โหมดแชทของ LINE OA นี้ยังไม่ได้ตั้งเป็น Bot — ข้อความจากลูกค้าอาจไม่เข้า Deep จนกว่าจะเปลี่ยนที่ LINE Official Account Manager → การตั้งค่า → การตอบกลับ → โหมดแชท → Bot" (แสดงเฉพาะ session ที่เพิ่งเชื่อม/reconnect — API ไม่ persist ค่านี้ เช็คซ้ำทีหลังไม่ได้โดยไม่ยิง verify ใหม่)

**Notice ถาวร 2 ข้อ (FR-LINE-01 AC บังคับ)** — กล่อง `bg-info/15 text-info-ink rounded-lg px-3 py-2.5` อยู่ใต้ header เหนือรายการแถว แสดง **ตลอดเวลาที่มีช่องทาง LINE เชื่อมอยู่** (ไม่ใช่แค่ตอนเชื่อมเสร็จแวบเดียว) ไม่ dismiss เพราะเป็นข้อมูลที่ร้านต้อง "จำได้" ไม่ใช่แค่ "เห็นครั้งเดียว"

**แถวช่องทางที่เชื่อมแล้ว** — คัดลอกโครงแถวจาก `ChannelsClient.tsx` เป๊ะ (avatar + provider badge overlay + ชื่อ + badge สถานะ ซ้าย, ปุ่ม action ขวา) เพิ่ม `basicId` (@handle) เป็นบรรทัดเล็กใต้ชื่อ (ข้อมูลเฉพาะ LINE ที่ Messenger/IG ไม่มี)

**ถอดการเชื่อม (FR-LINE-12)** — Swal ยืนยันเหมือน `ChannelsClient.handleDisconnect` เป๊ะ ต่างแค่ข้อความ (พูดถึง "LINE OA" ไม่ใช่ "เพจ") หลังถอดสำเร็จ: `pacesToast.success` แล้วตามด้วย **Swal ที่สอง** (`icon:'info', showCancelButton:false, confirmButtonText:'รับทราบ'`) แสดงข้อความจาก `postAction.message` ของ API เพราะเป็นสิ่งที่ร้านต้องไปทำเองนอกระบบ (ปิด webhook ใน LINE Console) — toast อย่างเดียวหายเร็วเกินไปสำหรับ action-item ที่สำคัญ

### Theme Source Mapping — ส่วน A

| Block | Theme/source file | Component | หมายเหตุ adapt |
|---|---|---|---|
| การ์ด + card-header | `src/app/(paces)/seller/(dashboard)/settings/channels/page.tsx` (ของเดิมในไฟล์เดียวกัน) | `.card`/`.card-header` pill pattern | คัดลอก markup header เป๊ะ เปลี่ยน title + icon เป็นโลโก้ LINE |
| แถวช่องทาง + badge สถานะ + Swal disconnect | `src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx` | ทั้งไฟล์เป็น pattern อ้างอิง | สร้างไฟล์ใหม่ `LineChannelCard.tsx` คัดลอกโครง row/badge/Swal จากไฟล์นี้ |
| Password-style masked input | `src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx` บรรทัด 195-224 | `input-icon-group` + eye toggle | ใช้ 2 ครั้ง (secret, token) เปลี่ยน icon เป็น `lock`/`key` |
| ปุ่มคัดลอก webhook URL | `src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx` | reuse ตรง ๆ ไม่แก้ | `showPreview value={webhookUrl}` |
| Numbered step list | **ไม่พบ theme match ตรง** — closest primitive: วง `size-6 rounded-full bg-primary/15 text-primary` (ประกอบจาก token ไม่ arbitrary) | custom composition จาก primitive | ตาม HR1 ระบุชัดว่าไม่มี theme match — Controller ตัดสินได้ถ้าอยากได้ pattern อื่น |
| Sweet Alert (disconnect confirm + postAction ack) | `theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx` | `Swal.fire` + `buttonsStyling:false` | เหมือน `ChannelsClient.handleDisconnect` + Swal ที่สองแบบ info-only |
| Toast | `src/lib/paces-toast.ts` (`pacesToast`) | — | success/error ตาม pattern ChannelsClient |
| Icon set | `@iconify/react` ตามที่ `ChannelsClient.tsx` ใช้ | `tabler:lock`, `tabler:key`, `tabler:link`, `tabler:alert-triangle`, `tabler:info-circle`, `tabler:refresh` (ยืนยันมีใช้จริงในโปรเจกต์แล้วทุกตัว) | โลโก้ LINE = asset จริง `/images/logos/line.svg` (มีอยู่แล้ว ไม่ต้องสร้าง) |

### User flow — ส่วน A

1. ร้านเข้า `settings/channels` → เห็นการ์ด "LINE Official Account" ว่าง → กด "เชื่อม LINE OA"
2. การ์ดขยาย wizard: อ่านคู่มือ 5 ขั้น, คัดลอก webhook URL ไปวางใน LINE Console
3. กลับมาวาง Channel secret + token → กด "ตรวจสอบและเชื่อมต่อ"
4. ระบบยิง verify → สำเร็จ: ยุบ wizard, เห็นชื่อ/รูป OA จริง + notice 2 ข้อถาวร / ล้มเหลว: banner เหตุผลเจาะจง ฟอร์มไม่ล้าง
5. token หมดอายุ → badge "โทเคนหมดอายุ" + banner แดง → กด "เชื่อมต่อใหม่" → wizard เปิดอีกครั้ง (ฟิลด์ว่าง ต้องวางใหม่) → PATCH แทน POST
6. เลิกใช้ → "ถอด" → Swal ยืนยัน → toast + Swal รับทราบเรื่องไปปิด webhook เอง

### Copy หลัก (ภาษาไทยจริง)

- หัวการ์ด: **LINE Official Account**
- คำอธิบายว่างเปล่า: **เชื่อม LINE OA ของร้านเพื่อรับและตอบข้อความ LINE จากอินบ็อกซ์เดียวกับช่องทางอื่น**
- ปุ่มเชื่อม: **เชื่อม LINE OA**
- Label ฟิลด์: **Channel secret** / **Channel access token** / **Webhook URL ของ Deep**
- ปุ่ม submit: **ตรวจสอบและเชื่อมต่อ** → **กำลังตรวจสอบ...**
- Error copy: ใช้ตรงจาก `API.md` §5 (ห้ามเขียนใหม่ กันข้อความสองที่ไม่ตรงกัน)

### Edge states — ส่วน A

| State | พฤติกรรม |
|---|---|
| ว่างเปล่า | ยังไม่เชื่อม LINE เลย |
| loading | ปุ่ม submit spinner, field disabled ระหว่างตรวจสอบ |
| error (verify ไม่ผ่าน) | banner เหตุผลเจาะจง ฟอร์มไม่ล้างค่า |
| `CHANNEL_TAKEN` | banner มีชื่อร้านที่ครองอยู่ (`{shopName}` อาจยาว — banner เป็น inline text wrap ได้) |
| `TOKEN_INVALID` | badge แดง + banner ด้านบน + ปุ่มเชื่อมต่อใหม่ |
| `LINE_ACCOUNT_MISMATCH` (ตอน reconnect) | banner เหตุผลเดียวกับ error ทั่วไป |
| `warnings: CHAT_MODE_NOT_BOT` | banner เหลืองไม่บล็อก หลังเชื่อมสำเร็จ |
| ถอดสำเร็จ | แถวหาย ถ้าเป็นแถวสุดท้าย → การ์ดกลับสู่สถานะว่างเปล่า |

---

## ส่วน B — อินบ็อกซ์: badge, Quota Meter, สถานะหน้าต่างฟรี, ตัวชี้ AI (S-14)

### User stories ที่ครอบ
FR-LINE-02 (badge ช่องทาง), FR-LINE-04/05/06/09 (ส่งข้อความ/หน้าต่างฟรี/quota/ความล้มเหลว — ส่วน UI), FR-LINE-08 (ตัวชี้ AI ใช้ของเดิม), FR-LINE-13 (บล็อก/ปิดช่องพิมพ์)

### Layout — Mobile (375px), เธรด LINE เปิดอยู่

```
┌─────────────────────────────────┐
│ ← [avatar+LINE] ชื่อลูกค้า      │  ← ChannelBadgeOverlay (โลโก้ line.svg มุมล่างขวา avatar)
├─────────────────────────────────┤
│ (i) ข้อความที่ตอบจากแอป LINE OA │  ← ThreadStatusBar (ยุบบรรทัดเดียว, tone info)
│     เอง จะไม่ขึ้นที่นี่        v│     (หัวแถวเสมอเมื่อไม่มีสถานะอื่นเร่งด่วนกว่า)
├─────────────────────────────────┤
│         [ข้อความในเธรด...]      │
├─────────────────────────────────┤
│ ┌───────────────────────────┐   │
│ │ พิมพ์ข้อความ...            │   │  composer box
│ │ ส่งฟรี            [ส่ง >]  │   │  ← caption + send ในแถวเดียวกัน
│ └───────────────────────────┘   │     (หน้าต่างฟรียังเปิด — เงียบ ไม่มีสี)
└─────────────────────────────────┘
```

สถานะอื่นของ composer caption:

```
(หน้าต่างฟรีปิดแล้ว — ต้องเสียโควตา)
│ ใช้โควตา 1 · เหลือ 248/300     [ส่ง >] │  ← กด caption เปิด popover รายละเอียด

(popover รายละเอียดโควตา)
        ┌─────────────────────────┐
        │ โควตาเดือนนี้             │
        │ ใช้ไป 52 จาก 300         │
        │ เหลือ 248                │
        │ อัปเดตล่าสุด 09 ส.ค. 12:0│
        │ ตัวเลขนี้มาจาก LINE       │
        │ โดยตรง                    │
        └─────────────────────────┘

(โควตาใกล้หมด — เหลือ ≤20%)
│ ใช้โควตา 1 · เหลือ 32/300 ใกล้หมด [ส่ง >] │  ← text-warning-ink

(โควตาหมด + หน้าต่างฟรีปิด — บล็อกส่ง)
├─────────────────────────────────┤
│ (X) โควตาข้อความหมดแล้ว — ส่งได้│  ← ThreadStatusBar หัวแถว (danger)
│     เฉพาะข้อความที่ยังไม่มี    v│
│     ค่าใช้จ่าย                   │
├─────────────────────────────────┤
│ โควตาหมดแล้ว ส่งไม่ได้ตอนนี้ [ส่ง ปิด] │

(ลูกค้าบล็อก)
├─────────────────────────────────┤
│ (X) ลูกค้าบล็อกบัญชีนี้แล้ว —   │  ← ThreadStatusBar (danger, หัวแถวเสมอ)
│     ส่งข้อความไม่ได้           v│
├─────────────────────────────────┤
│ [ลูกค้าบล็อกบัญชีนี้แล้ว ส่งข้อความไม่ได้] │  ← placeholder แทน textarea ทั้งกล่องปิด
```

### Layout — Tablet (768–1023px)

โครงเหมือนมือถือ (คอลัมน์เดียว ยังไม่มี `CustomerPanel` ข้าง — ตาม breakpoint เดิมของหน้านี้ที่ CustomerPanel โผล่ที่ `xl` เท่านั้น) caption เต็มประโยคแทนแบบย่อ: "ข้อความนี้ส่งฟรี (อยู่ในช่วงตอบด่วน)" / "ใช้โควตา 1 ข้อความ (เหลือ 248/300)"

### Layout — Desktop (≥1280px)

`CustomerPanel` โผล่ข้าง (คอลัมน์ขวา) เหมือน Messenger/IG — **ไม่ซ้ำ Quota Meter ที่นั่น** (กัน "ข้อมูลซ้ำที่อื่น" ตาม anti-slop) composer caption ยังคงเป็นแหล่งความจริงเดียวของโควตา

```
┌──────────────────────┬──────────────┐
│ [หัวเธรด + badge LINE]│ CustomerPanel│
│ [ThreadStatusBar]     │ - โปรไฟล์     │
│ [ข้อความ...]          │ - ออเดอร์     │
│                        │ - ช่องทาง:    │
│ [composer + caption]  │   LINE @handle│
└──────────────────────┴──────────────┘
```

### Section breakdown

**1. Badge ช่องทาง LINE** — **ไม่สร้าง component ใหม่** ขยาย registry ที่มีอยู่แล้วซึ่งขับทั้ง badge รายการ/หัวเธรด/แท็บกรองพร้อมกันจากจุดเดียว:

- `src/lib/chat-channel.ts`: `ChatChannel` เพิ่ม `'LINE'`, `resolveChatChannel` รับค่า `'LINE'`, `CHANNEL_LABEL.LINE = 'LINE'`
- `src/app/(paces)/seller/(chat)/inbox/components/ChannelBadge.tsx`: `CHANNEL_DISPLAY.LINE = { label: getChannelLabel('LINE'), icon: 'brand-line', logoSrc: '/images/logos/line.svg' }`
- `src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx`: `CHANNEL_TABS` เพิ่ม `'LINE'` ต่อท้าย array — แท็บกรองช่องทางโผล่เองอัตโนมัติจาก segmented control ที่มีอยู่แล้ว (บรรทัด 877-904)

ผลคือได้ badge วงกลมมุม avatar ในรายการเธรด, หัวเธรด (`ChannelBadgeOverlay`), แท็บกรอง "LINE" — โดยไม่สร้างอะไรใหม่เลย มีแค่ 3 จุดแก้

**2. หมายเหตุถาวร "ไม่มี echo"** — เพิ่ม entry ท้ายสุดของ `threadStatuses` array ใน `ChatThread.tsx` (เฉพาะเมื่อ `channel === 'LINE'`), tone `info`, icon `info-circle`:

- `short`: `ข้อความที่ตอบจากแอป LINE OA เอง จะไม่ขึ้นที่นี่`
- `detail`: `LINE ไม่ส่งสำเนาข้อความที่ร้านตอบจากแอปของบัญชีทางการกลับมาให้ Deep — ถ้าอยากให้ประวัติแชทอยู่ในที่เดียว แนะนำให้ตอบผ่าน Deep เสมอ`

วางเป็นตัว **สุดท้าย** ในลำดับ (priority ต่ำสุด) ตาม pattern เดิมของ `ThreadStatusBar` (array = ลำดับความสำคัญ, ตัวแรกคือหัวแถวตอนยุบ) — เมื่อไม่มีปัญหาอื่นเลย (กรณีปกติที่สุด) นี่จะกลายเป็นหัวแถวเอง ทำให้ "ถาวร" จริงในความหมายว่าไม่มีทางถูกซ่อนสนิท

**3. บล็อก (FR-LINE-13)** — entry ใหม่ tone `danger` icon `user-off`:

- `short`: `ลูกค้าบล็อกบัญชีนี้แล้ว — ส่งข้อความไม่ได้`
- `detail`: `ลูกค้าบล็อก LINE OA นี้แล้ว จึงส่งข้อความหาไม่ได้จนกว่าลูกค้าจะเพิ่มเพื่อนใหม่ด้วยตัวเอง — ประวัติแชทเดิมยังอ่านได้ตามปกติ`

+ ขยาย `composerDisabled` (`ChatThread.tsx` บรรทัด 988) จาก `isExternal && tokenInvalid` → `isExternal && (tokenInvalid || contactBlocked)` + placeholder เฉพาะเหตุผล: `contactBlocked ? 'ลูกค้าบล็อกบัญชีนี้แล้ว ส่งข้อความไม่ได้' : composerDisabled ? 'ส่งข้อความไม่ได้ในตอนนี้' : ...`

**4. Quota Meter + สถานะหน้าต่างตอบฟรี** — วางเป็น **แคปชันในแถวเดียวกับปุ่มส่ง** (ไม่ใช่แถบเต็มความกว้างแยก) เพราะ:

- ตอบโจทย์ "เห็นก่อนกดส่ง" ตรงตัวที่สุด — อยู่ติดปุ่มที่กำลังจะกด
- ไม่เพิ่ม chrome ถาวรอีกชั้น (หัวเธรดแน่นอยู่แล้ว — บทเรียน 2026-08-07 ความสูงบวม)
- เป็น "ข้อมูล ไม่ใช่การนับถอยหลัง" ตาม BRD AC-005-05 — **ไม่มีตัวเลขวินาทีนับถอยหลังเลย** มีแค่สถานะปัจจุบัน (ฟรี/เสียเงิน)

แก้ container ปุ่มส่ง (`ChatThread.tsx` ~บรรทัด 2864 `<div className="flex justify-end px-2 pb-2">`) เป็นเงื่อนไข:

```tsx
className={quotaCaption ? 'flex items-center justify-between gap-2 px-2 pb-2' : 'flex justify-end px-2 pb-2'}
```

(แคปชันมีเฉพาะเธรด LINE — non-LINE ไม่กระทบเลยเพราะ `quotaCaption` เป็น null → className เดิมทุกประการ)

**Copy ตามสถานะ** (caption เป็นปุ่ม กดแล้วเปิด popover รายละเอียด):

| สถานะ | ข้อความย่อ (มือถือ) | ข้อความเต็ม (≥sm) | สี |
|---|---|---|---|
| หน้าต่างฟรีเปิด | `ส่งฟรี` | `ข้อความนี้ส่งฟรี (อยู่ในช่วงตอบด่วน)` | `text-default-500` (เงียบ ไม่ใช้เขียว — ดู Impeccable compliance) |
| หน้าต่างปิด โควตาปกติ | `โควตา 248/300` | `ใช้โควตา 1 ข้อความ (เหลือ 248/300)` | `text-default-500` |
| หน้าต่างปิด โควตาใกล้หมด | `เหลือ 32/300 ใกล้หมด` | `ใช้โควตา 1 ข้อความ (เหลือ 32/300 ใกล้หมด)` | `text-warning-ink` |
| หน้าต่างปิด โควตาหมด | `โควตาหมด` | `โควตาหมดแล้ว ส่งไม่ได้ตอนนี้` | `text-danger-ink` + ปุ่มส่ง `disabled` |
| `type: "unlimited"` | `ส่งฟรี` (ถ้าหน้าต่างเปิด) / ไม่แสดง caption เลยถ้าหน้าต่างปิด | เหมือนกัน | — |
| อ่านโควตาไม่ได้ (`stale:true`) + หน้าต่างปิด | `ไม่ทราบยอดโควตา` | `ไม่ทราบยอดโควตาตอนนี้ — ยังส่งได้ตามปกติ` | `text-default-400` (ไม่บล็อก ตาม TFR-LINE-07) |

Popover รายละเอียด (แตะ/hover caption) — **reuse interaction pattern จาก `AutoReplyTag.tsx`** (fixed positioning หนี overflow ของ scroll container, hover บนเดสก์ท็อป + แตะบนมือถือ, ปิดด้วยคลิกนอก/Escape) เนื้อหาข้างในเปลี่ยนเป็นสรุปโควตา: `ใช้ไป X จาก Y · เหลือ Z · อัปเดตล่าสุด {formatDateTime(fetchedAt)} · ตัวเลขนี้มาจาก LINE โดยตรง`

**เมื่อโควตาหมดจริง (บล็อกกด)** — เพิ่ม entry ใน `threadStatuses` (tone `danger`, priority สูงกว่าโน้ต no-echo):

- `short`: `โควตาข้อความหมดแล้ว — ส่งได้เฉพาะข้อความที่ยังไม่มีค่าใช้จ่าย`
- `detail`: `โควตาข้อความ LINE ของเดือนนี้หมดแล้ว ยังตอบได้ฟรีถ้าลูกค้าเพิ่งทักมาไม่เกิน 1 นาที นอกเหนือจากนั้นต้องรอโควตารอบใหม่ อัปเกรดแพ็กเกจกับ LINE หรือตอบจากแอป LINE Official Account แทน (ไม่ใช้โควตา)`

**5. ตัวชี้ AI ตอบอัตโนมัติ** — **ไม่สร้างใหม่** ใช้ `AutoReplyTag.tsx` ตรง ๆ ไม่ต้องแก้อะไรเลย เพราะดึงข้อมูลจาก `AutoReplyLog`/`autoReplyKind` ซึ่งไม่สนใจ provider อยู่แล้ว (channel-agnostic ตั้งแต่แรก) — S-14 แค่ต้องยืนยันว่า data pipeline ของ LINE เขียนลงตารางเดียวกันจริง (งาน backend S-12)

**6. TOKEN_INVALID ของ LINE** — entry เดิมที่มีอยู่แล้ว (`isExternal && tokenInvalid`, บรรทัด 1377-1400) ใช้กับ LINE ได้ทันทีเพราะ `isExternal` เป็น generic flag แต่ **ต้องแก้ copy ที่เขียนว่า "เพจนี้"** (คำเฉพาะ Facebook) ให้ผัน branch ตาม provider: LINE → `การเชื่อมต่อ LINE OA มีปัญหา — ไปที่ตั้งค่าช่องทางเพื่อเชื่อมต่อใหม่` (Messenger/IG คงคำเดิม)

### Theme Source Mapping — ส่วน B

| Block | Theme/source file | หมายเหตุ adapt |
|---|---|---|
| Badge ช่องทาง (registry) | `src/lib/chat-channel.ts` + `inbox/components/ChannelBadge.tsx` + `InboxList.tsx` (`CHANNEL_TABS`) | เพิ่ม 3 จุด ไม่สร้างไฟล์ใหม่ — asset `/images/logos/line.svg` มีอยู่แล้ว |
| ThreadStatusBar entries (no-echo, blocked, quota exceeded) | `inbox/[conversationId]/components/ThreadStatusBar.tsx` + array ที่ประกอบใน `ChatThread.tsx` บรรทัด 1373-1504 | เพิ่ม object เข้า array ตาม `ThreadStatusItem` interface เดิม — ไม่แก้ตัว component |
| Quota caption + popover | Base ปุ่มส่ง: `ChatThread.tsx` บรรทัด 2864-2877 · Base popover interaction: `AutoReplyTag.tsx` (fixed positioning + hover/tap + `POPUP_CLASS`) | caption เป็น element ใหม่ในไฟล์เดิม, popover ยืม CSS/JS pattern จาก AutoReplyTag ไม่ยืม UI (บับเบิลชิป) |
| composerDisabled + placeholder เหตุผล | `ChatThread.tsx` บรรทัด 988, 2834 | ขยายเงื่อนไข ไม่ใช่ pattern ใหม่ |
| AutoReplyTag (AI indicator) | `inbox/[conversationId]/components/AutoReplyTag.tsx` | **reuse 100% ไม่แก้ไฟล์** |
| Icon | `@/components/wrappers/Icon` (ตาม convention ของ `ChatThread.tsx`/`ThreadStatusBar.tsx`) — `user-off`, `info-circle`, `alert-triangle` | ยืนยันมีใช้จริงในโปรเจกต์แล้ว |

### User flow — ส่วน B

1. ลูกค้า LINE ทักเข้ามา → เธรดโผล่ในอินบ็อกซ์พร้อม badge LINE → ร้านเปิดแท็บกรอง "LINE" เห็นเฉพาะช่องทางนี้ได้
2. เปิดเธรด → เห็นแถบสถานะบรรทัดเดียว (ปกติคือโน้ต no-echo) → พิมพ์ → เห็น caption "ส่งฟรี" ข้างปุ่มส่ง → กดส่ง
3. ตอบช้าเกิน 1 นาที → caption เปลี่ยนเป็น "ใช้โควตา 1 ข้อความ (เหลือ X/Y)" อัตโนมัติ ไม่ต้อง reload → กดส่งได้ตามปกติ (แค่รู้ต้นทุน)
4. โควตาใกล้หมด → caption เปลี่ยนสีเตือน → ร้านเลือกได้ว่าจะส่งผ่าน Deep หรือสลับไปตอบในแอป LINE เอง
5. โควตาหมดสนิท + หน้าต่างฟรีปิด → แถบสถานะแดงขึ้นหัวแถว + ปุ่มส่ง disabled พร้อม caption อธิบายทางเลือก
6. ลูกค้าบล็อก → แถบสถานะแดง + ช่องพิมพ์ทั้งกล่องปิดพร้อม placeholder บอกเหตุผลตรง ๆ

### Edge states — ส่วน B

| State | พฤติกรรม |
|---|---|
| empty (ยังไม่มีเธรด LINE) | ใช้ empty state เดิมของ `InboxList.tsx` (generic ไม่ต้องแก้) |
| loading (เปิดเธรด) | ใช้ `[conversationId]/loading.tsx` เดิม (generic skeleton ไม่ผูก provider) |
| error/stale (อ่านโควตาไม่ได้) | caption สีเทา "ไม่ทราบยอดโควตาตอนนี้" **ไม่บล็อกการส่ง** |
| `TOKEN_INVALID` | copy ผันตาม provider |
| blocked | composer ปิดทั้งกล่อง + เหตุผลเจาะจง |
| โควตาหมด | บล็อกเฉพาะเมื่อหน้าต่างฟรีปิดด้วย ตาม AC |
| `unlimited` package | ไม่มีสถานะเตือน/บล็อกใด ๆ เลย |
| ชื่อลูกค้า/basicId ยาวผิดปกติ | `truncate` + `title` เหมือน pattern ทั้งไฟล์ |
| ตัวเลขโควตาหลักพัน | `tabular-nums` + `toLocaleString('th-TH')` กัน digit ล้น caption แคบ |

---

## Impeccable compliance

**Mode: Operate** — ทั้งสองส่วนเป็น seller console (task-in-progress UI ไม่ใช่ brand surface) ตาม `operate.md`: "earned familiarity", ไม่มี display font, ไม่มี page-load choreography, ใช้ semantic color เป็น state indicator ไม่ใช่ของตกแต่ง

- **One Voice Rule** — `bg-primary` (น้ำเงิน Counter Blue) ใช้เฉพาะปุ่ม primary เดียวต่อหน้าจอ ("เชื่อม LINE OA" / "ตรวจสอบและเชื่อมต่อ" / ปุ่ม "ส่ง") ไม่มีจุดอื่นที่ทาน้ำเงินทึบเพิ่ม — พื้นที่ที่เหลือทั้งหมด (การ์ด badge caption) เป็นโทนเทา/semantic tint

- **Verified-Means-Green Rule** — 🛑 **จุดตัดสินใจสำคัญที่สุดของสเปกนี้:** caption "ส่งฟรี" (หน้าต่างตอบด่วนเปิด) **ตั้งใจไม่ใช้สีเขียว/success** ทั้งที่สัญชาตญาณแรกอยากใช้เขียวสื่อ "ดี/ฟรี" — เพราะ "หน้าต่างฟรี" เป็นสถานะ **ชั่วคราว** (เปิด-ปิดสลับตลอดตามเวลา ไม่ใช่สิ่งที่ "ยืนยันแล้ว/ผ่านแล้ว") การผูกเขียวเข้ากับมันจะทำให้เขียวเฟ้อและขัดกับความหมายที่เขียวถูกสงวนไว้ทั่วทั้งแอป (verified chip, ออเดอร์สำเร็จ) → ใช้ `text-default-500` (เงียบ เป็นกลาง) แทน. ส่วนสถานะ "เชื่อมแล้ว" ของช่องทาง **ยังคงใช้ `text-success`** ตามที่ Paces ใช้อยู่แล้ว (ตรงกับความหมาย "ยืนยันว่าเชื่อมต่อทำงานได้จริง" = trust signal จริง)

- **สองโทน (สีเป็นพื้น vs สีเป็นหมึก)** — element ใหม่ทุกตัวที่วางตัวหนังสือบนพื้น `/15` ใช้ token `-ink` ตามมติ Impeccable 2026-08-03 (`text-warning-ink`, `text-danger-ink`, `text-info-ink`) **แม้ไฟล์พี่น้องที่มีอยู่ก่อน** (`ChannelsClient.tsx`, `ThreadStatusBar.tsx`) ยังใช้ `text-success`/`text-danger`/`text-warning` เฉย ๆ (สร้างก่อนมติ) — ตัดสินใจ **ไม่ลอกความเก่าตรงจุดนี้** เพราะเป็น debt ของไฟล์เดิมที่ยังไม่ migrate ไม่ใช่ pattern ที่ควรสืบทอด งานใหม่ยึด token ที่ผ่าน contrast จริง (`warning-ink` 6.57:1)

- **Ink-Tinted Shadow** — ไม่มี shadow ใหม่ที่ประดิษฐ์เอง ทุก popover/card ใช้ `shadow`/`shadow-lg` token ของ Paces (ตระกูลเดียวกับที่ AutoReplyTag ใช้)

- **Sentence case** — ทุก label/copy เป็นประโยคปกติ ไม่มี ALL CAPS

- **anti-slop** — ไม่มี gradient ตกแต่ง, ไม่มีการ์ดซ้อนการ์ด (LINE card เป็น sibling `.card` ไม่ nested), ไม่มี hero-metric template (ตัวเลขโควตาอยู่ในบรรทัดข้อความปกติ ไม่ยกเป็นตัวเลขใหญ่โชว์เดี่ยว — เจตนา: เป็นข้อมูลสนับสนุนการตัดสินใจ ไม่ใช่ metric ที่ต้อง celebrate), ไม่มี eyebrow ตัวพิมพ์เล็กจิ๋วเหนือ section

- **น้ำเสียงข้อความ** — คำเตือนโควตาหมด/บล็อก **บอกทางออกเสมอ** ("รออีกเดือน / อัปเกรดแพ็กเกจ / ตอบจากแอป LINE OA แทน") ไม่ใช่แค่บอกว่าทำไม่ได้; ไม่ใช้ "ไม่สามารถ...ได้" แบบราชการ — ใช้ "ส่งไม่ได้ตอนนี้" + เหตุผล + ทางเลือก

- **พระเอกของแต่ละหน้า** — ส่วน A คือปุ่ม "เชื่อม LINE OA" (จุดตัดสินใจเดียวที่ผลักดัน flow ทั้งหมด), ส่วน B คือช่องพิมพ์ + ปุ่มส่ง (งานหลักที่ผู้ใช้มาทำ) — ทุกอย่างอื่น (badge, caption, แถบสถานะ) ถอยเป็นข้อมูลสนับสนุนที่น้ำหนักเบากว่าโดยเจตนา

- **จุดที่ theme ขัดกับ Impeccable** — ไม่พบจุดขัดจริง ทุก primitive ที่เลือกมาจาก Paces เดิมรองรับ token ที่ Impeccable ต้องการ (ink variants) ครบ จุดเดียวที่ต้อง "เบี่ยงจากไฟล์พี่น้อง" คือใช้ `-ink` token ที่ใหม่กว่าไฟล์เก่า (อธิบายไว้ข้างบน)

---

## Design decisions + rationale

1. **LINE card แยกจากการ์ด Messenger/IG โดยสิ้นเชิง** — AC บังคับคำว่า "การ์ด" เอกพจน์เจาะจง + flow เชื่อมต่อต่างกันโดยพื้นฐาน (paste-credential wizard vs OAuth redirect) รวมในการ์ดเดียวจะทำให้สอง flow ปนกันจนสับสน
2. **Wizard เป็น inline expand ไม่ใช่ Swal/modal** — เนื้อหายาว (คู่มือ 5 ขั้น + 2 ฟิลด์มาสก์ + webhook URL) ไม่เข้าเกณฑ์ Swal (confirm สั้น ๆ) ตาม craft-floor
3. **Quota caption อยู่ติดปุ่มส่ง ไม่ใช่แถบแยก** — ตอบโจทย์ "เห็นก่อนกดส่ง" ตรงที่สุดและไม่เพิ่ม chrome ถาวรอีกชั้น (บทเรียน 2026-08-02/2026-08-07: หัวเธรดบวมจากการซ้อนกล่องสถานะ)
4. **หมายเหตุ no-echo ใช้ ThreadStatusBar เดิมแทนแบนเนอร์ใหม่** — ระบบยุบ/กางมีอยู่แล้วและถูกออกแบบมาแก้ปัญหา "กล่องสถานะเยอะเกิน" มาก่อน เพิ่ม entry เข้า array คือใช้ระบบเดิมให้ถูกจุด ไม่ใช่สร้างระบบคู่ขนาน
5. **เขียวไม่ใช้กับ "ตอบฟรี"** — ดูหัวข้อ Impeccable compliance (ตัดสินใจนี้เสี่ยงถูกมองว่า "น่าจะเขียวสิ ฟรีนี่" จึงเขียนเหตุผลไว้ชัดกันสับสนตอน implement/review)

---

## 🛑 Open questions — ต้องตอบก่อน implement S-13/S-14

1. **เกณฑ์ "โควตาเหลือน้อย"** — BRD บอกว่า "เกณฑ์กำหนดใน SRS" แต่ **SRS ไม่ได้ระบุตัวเลขจริง** (grep ทั้งไฟล์แล้วไม่พบ % หรือจำนวน) สเปกนี้เสนอ **≤20% ของ total** เป็นค่าเริ่มต้น (300 → เตือนที่เหลือ ≤60) แต่เป็นเกณฑ์ที่ ux ประดิษฐ์เอง ไม่ใช่ business rule ที่มีแหล่งอ้างอิง → **ต้องให้ `safepay-product`/user ยืนยันตัวเลขจริงก่อน implement** (ux ห้ามกำหนด business rule ใหม่)
2. **icon `tabler:brand-line`** — ใช้เป็น fallback เฉย ๆ (กรณี logo asset โหลดไม่ขึ้น) เชื่อว่ามีใน Tabler Icons แต่ไม่มีใน gallery ของ Paces docs ให้ยืนยันตรง ๆ (เหมือน `brand-facebook`/`brand-messenger`/`brand-instagram` ที่ใช้อยู่แล้วก็ไม่อยู่ใน gallery เช่นกัน) ความเสี่ยงต่ำเพราะมี `/images/logos/line.svg` เป็น primary display — developer ต้อง verify ตอน implement (เห็นกล่องว่าง = ไม่มีจริง ต้องเปลี่ยน)
3. **สี hex ของ LINE brand `#06C755`** — เสนอไว้เผื่อใช้เป็น `colorHex` fallback ใน `CHANNEL_DISPLAY` (pattern เดียวกับ Messenger `#0084FF` ที่มีอยู่แล้ว) เป็น carve-out ที่ HR6 อนุญาต (asset สี = ตามแบรนด์จริงได้) แต่ต้องกำกับ comment เหมือนไฟล์เดิม
4. **entry no-echo จะกลายเป็น "หัวแถวเสมอ" ในเธรด LINE ที่ไม่มีปัญหาอื่น** — ux ถือว่า "ถาวร" พอ (ไม่ถูกซ่อนสนิท พับเป็น `+N` เฉพาะเมื่อมีเรื่องสำคัญกว่า) ถ้า user ต้องการให้เด่นกว่านี้ (แบนเนอร์ที่ dismiss ไม่ได้เลย ไม่ปนกับระบบยุบ) ต้องแจ้งก่อน implement

---

## ไฟล์ที่เกี่ยวข้อง (developer หยิบไป Read + cp)

| Path | สถานะ |
|---|---|
| `src/app/(paces)/seller/(dashboard)/settings/channels/page.tsx` | **แก้** — เพิ่มการ์ด LINE + fetch/filter `listChannels` แยก provider |
| `src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx` | Base pattern — **ไม่แก้** |
| `src/app/(paces)/seller/(dashboard)/settings/channels/LineChannelCard.tsx` | **ไฟล์ใหม่** — คัดลอกโครงจาก ChannelsClient.tsx |
| `src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx` | Base masked input — **ไม่แก้** |
| `src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx` | reuse ตรง — **ไม่แก้** |
| `src/lib/chat-channel.ts` | **แก้** — เพิ่ม LINE |
| `src/app/(paces)/seller/(chat)/inbox/components/ChannelBadge.tsx` | **แก้** — เพิ่ม LINE ใน `CHANNEL_DISPLAY` |
| `src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx` | **แก้** — `CHANNEL_TABS` |
| `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx` | **แก้** — `threadStatuses` array, composer caption, `composerDisabled` |
| `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ThreadStatusBar.tsx` | ใช้ interface เดิม — **ไม่แก้ตัว component** |
| `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/AutoReplyTag.tsx` | reuse 100% — **ไม่แก้** |
| `public/images/logos/line.svg` | asset มีอยู่แล้ว — **ไม่ต้องสร้าง** |
