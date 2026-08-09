# ค่าที่ hook คืน กับ dependency array — อย่าใส่ทั้งก้อน

> เหตุการณ์จริง 2026-08-09 (user เจอเองบน prod): `/inbox/comments` ยิง
> `GET /api/chat/comments/posts` **ไม่หยุด** — `tsc`/`build`/detector/grep gate เขียวหมด
> commit ที่แก้: `3abcfba4` · retro: `docs/retro/2026-08-09-comment-inbox-fetch-loop-retrospective.md`

---

## กฎ

🛑 **ห้ามใส่ค่าที่ custom hook คืนมา "ทั้งก้อน" ลงใน dep array ของ `useEffect`/`useCallback`/`useMemo`
ถ้า hook นั้น `return` เป็น object/array literal** — ให้ destructure เอาเฉพาะฟังก์ชันที่ห่อ
`useCallback` (หรือ ref) ไปใส่แทน

```tsx
// ✗ ผิด — listBusy เป็นอ็อบเจกต์ใหม่ทุก render
const listBusy = useListBusy()
useEffect(() => {
  listBusy.begin()
  void refreshPosts(...)
}, [channelId, refreshPosts, listBusy])

// ✓ ถูก — begin เป็น useCallback จึงเสถียรข้าม render
const listBusy = useListBusy()
const beginBusy = listBusy.begin
useEffect(() => {
  beginBusy()
  void refreshPosts(...)
}, [channelId, refreshPosts, beginBusy])
```

---

## ทำไมมันกลายเป็นลูปไม่รู้จบ

`return { busy, run, begin }` สร้างอ็อบเจกต์ใหม่ทุกครั้งที่ component เรนเดอร์ — ไม่มีวันเท่ากับของ
render ก่อนตาม `Object.is` ซึ่งเป็นวิธีที่ React ใช้เทียบ deps

ถ้า effect นั้นทำงานที่ทำให้เกิด state ใหม่ (fetch แล้ว `setState`) วงจรจะปิดตัวเอง:

```
fetch เสร็จ → setState → re-render → อ็อบเจกต์ใหม่ → deps ไม่ตรง → effect รันใหม่ → fetch อีก
```

ไม่มีเงื่อนไขไหนหยุดเลย และมันเร็วเท่า round-trip ของ API

## 🛑 การ memo อ็อบเจกต์ที่ hook คืน **ไม่ใช่ทางแก้**

ทางที่ดูเป็นธรรมชาติที่สุดคือไปห่อ `return` ด้วย `useMemo` ที่ตัว hook — ไม่จบ เพราะค่าที่เป็น
**สถานะ** (เช่น `busy`) ต้องเปลี่ยนตามงานอยู่แล้วโดยนิยาม อ็อบเจกต์จึงยังเปลี่ยน identity ทุกครั้งที่
สถานะพลิก ลูปเดิมยังอยู่ แค่เดินช้าลงเป็นจังหวะ (ในเคสจริงคือทุก ~350ms ตาม `MIN_VISIBLE_MS`)
= **อาการเบาลงจนดูเหมือนหาย แต่ไม่หาย** ซึ่งแย่กว่าเดิมเพราะจะไม่มีใครสังเกตอีกเลย

hook ที่คืน "สถานะที่เปลี่ยน" ปนกับ "ฟังก์ชันที่เสถียร" ในอ็อบเจกต์เดียว จะ memo ให้ปลอดภัยไม่ได้
ทางแก้อยู่ที่ **ฝั่งผู้เรียก dep เฉพาะฟังก์ชัน** เท่านั้น

---

## ทำไมไม่มี gate ไหนจับได้

- `tsc` / `next build` — เขียว ไม่มีอะไรผิดชนิด
- `theme-guard` / detector / grep gate — ไม่เกี่ยวเลย
- **`react-hooks/exhaustive-deps` จะบอกให้เขียนแบบที่พังเป๊ะ ๆ** ถ้าถามมัน

นี่คือดีเพนเดนซีที่ *ครบถ้วนและผิด* — เครื่องมือทุกตัวตรวจ "รูปแบบ" ส่วนสิ่งที่ผิดคือ
**ความเสถียรของ identity** ซึ่งไม่มีอะไรในรีโปวัดได้ (คลาสเดียวกับ Hard Rule 16: gate ตรวจรูปแบบ
ไม่ตรวจความหมาย)

---

## กับดักที่ทำให้ไม่มีใครสงสัย hook

`useListBusy` เขียนขึ้นเพื่อ `/orders` เมื่อ 2026-08-07 และที่นั่นเรียก `run()` จาก
**event handler อย่างเดียว ไม่เคยมี effect ผูกกับมันเลย** — hook จึงมีประวัติ "ใช้มาแล้วไม่พัง"
ที่เป็นจริงเฉพาะกับท่าเรียกแบบเดียว

`/inbox/comments` หยิบไปใช้ด้วยเหตุผล `sibling-surface-parity.md` (ถูกต้องแล้ว) แต่ใช้คนละท่า
เพราะตัวกรองหน้านั้น trigger ผ่าน state ไม่ใช่ผ่าน handler เดียว

🛑 **การหยิบของที่ "พิสูจน์แล้วว่าใช้ได้" ไปใช้ ไม่ได้พาการพิสูจน์นั้นติดไปด้วย ถ้ารูปแบบการเรียก
ต่างกัน** — ก่อนหยิบ hook จากหน้าพี่น้อง ให้ดูว่ามันถูกเรียกจากตรงไหน (effect / handler / render)
ไม่ใช่ดูแค่ว่ามันถูกใช้ที่นั่นแล้วไม่พัง

---

## หน้าที่ของคนเขียน hook

hook ที่คืนหลายค่ารวมกัน **ต้องเขียนไว้ที่ตัว hook เอง** ว่าอันไหนเอาไป dep ได้ อันไหนไม่ได้
ห้ามปล่อยให้ผู้เรียกอนุมานเอาจากตัวอย่างการใช้งานของหน้าอื่น (ดูหัวข้อ 🛑 เหนือ `useListBusy` ใน
`src/app/(paces)/seller/(dashboard)/_shared/ListBusyOverlay.tsx` เป็นตัวอย่าง)

---

## ด่านกันซ้ำที่มีอยู่

`src/app/(paces)/seller/(dashboard)/_shared/__tests__/useListBusy-deps.test.ts` — `[blocker]`

สแกน **ทุกไฟล์ที่เรียก `useListBusy()`** (ไม่ hardcode รายชื่อ หน้าใหม่ที่หยิบไปใช้ทีหลังถูกตรวจ
อัตโนมัติ) แล้วห้ามตัวแปรที่รับค่าไปโผล่ใน dep array · มีเคสที่สองยืนยันว่า "ยังหาไฟล์เจออยู่จริง"
กันเทสเขียวเพราะไม่เจออะไรเลย · พิสูจน์ด้วย mutation แล้ว

**ทำไมเป็นเทสที่อ่านซอร์ส ไม่ใช่เทสที่ render hook จริง:** vitest ของโปรเจกต์ตั้ง
`environment: "node"` และรีโปไม่มี `jsdom`/`@testing-library/react` — การพิสูจน์ referential
stability ต้อง render จริงถึงจะวัดได้ ซึ่งทำไม่ได้โดยไม่เพิ่มดีเพนเดนซีชุดใหญ่ สิ่งที่ตรวจได้จริงและ
ตรงกับต้นเหตุคือ **รูปร่างของ dep array**

ถ้าวันไหนรีโปมี jsdom แล้ว ควรเสริมเทสที่ render จริงแล้ววัด identity ของ `begin`/`run`

---

## เกี่ยวข้อง

- `docs/conventions/sibling-surface-parity.md` — ยกของจากหน้าพี่น้องมาใช้ซ้ำ (ยังใช้อยู่ แค่ต้อง
  ดูท่าเรียกด้วย)
- Hard Rule 16 — gate ของโปรเจกต์ตรวจรูปแบบ ไม่ตรวจความหมาย
