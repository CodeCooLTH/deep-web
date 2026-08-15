# การวัดต้องไม่ตัดสินสิ่งที่ตัวเองวัด

> เหตุการณ์ 2026-08-15 — user ส่งคลิปจาก iPhone: หน้าโปรไฟล์สาธารณะ **กระพริบทั้งหน้าไม่หยุด**
> วัดจากเฟรมได้ว่าสลับสองสถานะ A,B,A,B ตลอด 3.6 วินาทีที่อัด (เฟรม N ≈ เฟรม N-2)

## กฎ

**ถ้าโค้ดวัด DOM (`scrollHeight`/`clientHeight`/`getBoundingClientRect`) แล้วเอาผลไปเปลี่ยน
แท็ก/คลาส/สไตล์ของ *อิลิเมนต์ที่เพิ่งวัด* → นั่นคือวงจรปิด** ต้องแยกให้ได้อย่างใดอย่างหนึ่ง:

1. **วัดจากโพรบ** — โหนดที่ซ่อนไว้ (`absolute` + `invisible` + `aria-hidden`) ซึ่งมีเนื้อหา
   และฟอนต์เหมือนของจริงแต่ **ไม่เคยเปลี่ยนรูปร่างตามสถานะ** ⇒ ให้คำตอบเดิมเสมอ
2. **ย้ายสิ่งที่เปลี่ยนออกไปนอกโหนดที่วัด** — เช่นความเป็นปุ่มไปอยู่ที่ *ตัวห่อ* ไม่ใช่ที่ตัวข้อความ

และ **ห้ามใส่ค่าที่ effect เป็นคนตั้ง กลับเข้า dep array ของ effect นั้นเอง**

## ทำไมมันไม่พังตอนทดสอบ แต่พังบนเครื่องผู้ใช้

เคสจริง: คำอธิบายร้านย่อ 2 บรรทัด มีปุ่ม "เพิ่มเติม" เมื่อข้อความล้น

```tsx
component={bioOverflows ? 'button' : 'p'}      // แท็กขึ้นกับผลการวัด
setBioOverflows(isClampOverflowing(el.scrollHeight, el.clientHeight))  // วัดอิลิเมนต์นั้นเอง
}, [bioExpanded, bioOverflows, data.bio])      // ผลของตัวเองอยู่ใน deps
```

| เอนจิน | สถานะ `<p>` | สถานะ `<button>` | ผล |
|---|---|---|---|
| Chrome | clamp ติด → ล้น | clamp ติด → ล้น | **ค่าตรงกัน → นิ่ง** |
| WebKit (iOS Safari) | clamp ติด → ล้น | **clamp หลุด** → ไม่ล้น | **ค่าสวนกัน → วนไม่จบ** |

`-webkit-line-clamp` ของ WebKit ไม่ทำงานเมื่ออิลิเมนต์เป็น form control ⇒ พอกลายเป็น `<button>`
ข้อความกางเต็ม การวัดจึงบอกว่า "ไม่ล้น" → กลับเป็น `<p>` → clamp ติด → "ล้น" → วนที่ ~30 ครั้ง/วินาที
**ทุกอย่างใต้บรรทัดนั้นขยับขึ้นลงทุกเฟรม**

🛑 **ไม่มี gate ไหนจับได้** — `tsc`/build/eslint/theme-guard/detector ผ่านหมด และ
`react-hooks/exhaustive-deps` **สั่งให้เขียนแบบที่พังเป๊ะ ๆ** (deps ครบถ้วนและผิด — คลาสเดียวกับ
`hook-return-identity-in-deps.md`) · บนเครื่อง dev ที่เป็น Chrome จะ **ไม่เห็นอะไรเลย**

## `scrollHeight` ของกล่องที่ถูก clamp เชื่อไม่ได้ ไม่ใช่แค่ข้ามเอนจิน

วัดจริงบน Chrome หน้าเดียวกัน: `scrollHeight` = **53 ตอนโหลดครั้งแรก** (เท่ากับ `clientHeight`
= "ไม่ล้น") แล้วกลายเป็น **105 หลัง reflow** — Chrome รุ่นใหม่ตัดเนื้อหาที่เกิน clamp ออกจาก
`scrollHeight` ด้วย ⇒ คำตอบขึ้นกับ *จังหวะที่วัด* ไม่ใช่แค่เบราว์เซอร์

⇒ อย่าถาม "กล่องนี้ล้นไหม" กับกล่องที่ถูกย่อ ให้ถาม **"ข้อความเต็ม ๆ สูงกว่าโควตากี่บรรทัด"**
กับโพรบที่ไม่ถูกย่อ: `isClampOverflowing(probe.scrollHeight, lineHeight * MAX_LINES)`

## วิธีสร้าง loop ที่แดงได้ทั้งที่เครื่อง dev เป็น Chrome

จำลองเงื่อนไขของ WebKit ด้วย CSS แล้วนับการสลับแท็ก:

```js
document.head.appendChild(Object.assign(document.createElement('style'), {
  textContent: 'button{-webkit-line-clamp:none !important;display:block !important;max-height:none !important;}',
}))
// แล้ว sample el.tagName ทุก 16ms — นับว่าสลับกี่ครั้ง
```

วัดได้จริง: โค้ดเดิมบน prod = **46 ครั้ง / 1.5 วินาที** (`P→BUTTON→P→BUTTON…`) · โค้ดที่แก้แล้ว = **0**
(ต้องรีไซซ์หนึ่งครั้งก่อนฉีด เพื่อให้ธง "ล้น" ขึ้นมาก่อน ไม่งั้นไม่มีอะไรให้วน)

ด่านกันซ้ำ: `src/views/pages/user-profile/v2/__tests__/bio-clamp-no-feedback-loop.test.ts` (`[blocker]`)

## ญาติของกฎนี้

- `hook-return-identity-in-deps.md` — ค่าที่ไม่เสถียรใน dep array ทำให้ effect วนยิงไม่หยุด
- `component-declared-in-render.md` — identity ที่ไม่เสถียรทำให้ subtree remount ทุก setState
- `ui-boolean-needs-a-testable-home.md` — boolean ที่ตัดสิน UI ต้องมีที่ให้เทสจับ
