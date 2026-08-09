# เงื่อนไข boolean ที่ตัดสินพฤติกรรม UI ต้องมีที่ให้เทสจับ

> เกิดจริง 2026-08-09 — เขียน guard กลับด้านแล้วปล่อยขึ้น prod, user เจอเองภายในไม่กี่นาที

## อาการ

ปุ่ม "ย่อกลับเป็น 08:00–20:00" **ไม่ทำอะไรเลยทุกกรณี** ตรรกะที่เขียนไว้คือ:

```tsx
onClick={() => setShowAllHours((v) => (v ? !startsOutsideDefaultWindow : true))}
//                                          ^ กลับด้าน
```

- กรณีปกติ (เวลาที่เลือกอยู่ใน 08:00–20:00 → `startsOutside = false`) → `!false = true` = **ค้างกาง**
- กรณีที่ตั้งใจจะห้ามย่อ (`startsOutside = true`) → `!true = false` = **ย่อได้** ซึ่งคือสิ่งที่ guard นั้นมีไว้ห้าม

สลับกันครบทั้งคู่ ค่าที่ถูกคือ `v ? startsOutsideDefaultWindow : true`

## ทำไมไม่มีอะไรจับได้

ผ่าน `tsc` · `next build` · `detect.mjs` · `theme-guard.sh` · grep gate **ครบทุกด่าน**
เพราะมันเป็น **boolean ที่ถูกต้องตามชนิดทุกประการ** — ไม่มี type error, ไม่มี class ผี,
ไม่มี pattern ต้องห้าม สิ่งที่ผิดคือ *ความหมาย* ไม่ใช่ *รูปแบบ*

และไม่มีเทสไหนเอื้อมถึง เพราะมันเป็นเทอร์นารีบรรทัดเดียวฝังอยู่ใน `onClick` กลาง JSX

## กติกา

🛑 **เงื่อนไข boolean ที่ตัดสินว่า UI จะทำอะไร/ไม่ทำอะไร ห้ามอยู่ในเทอร์นารีกลาง JSX
ต่อให้สั้นแค่ไหน** — ยกเป็นฟังก์ชันบริสุทธิ์ใน `src/lib/**` แล้วผูกเทส

**เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม" แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม"**
ถ้าคำตอบคือไม่มี → ต้องมีเทส

```ts
// src/lib/appointments.ts
export function nextShowAllHours(currentlyExpanded: boolean, startsOutside: boolean): boolean {
  if (!currentlyExpanded) return true
  return startsOutside
}
```

## เทสต้องพิสูจน์ด้วย mutation ไม่ใช่แค่เขียนให้เขียว

เทสที่เขียนตามโค้ดที่มีอยู่จะเขียวเสมอไม่ว่าโค้ดจะถูกหรือผิด — ต้อง**ลองคืนตรรกะที่ผิดกลับไป
แล้วยืนยันว่าแดง**:

```
# คืน `return !startsOutside` → ต้องแดง 2 ข้อ
# คืน `return startsOutside`  → ต้องเขียวครบ
```

ติดป้าย `[blocker]` ที่ชื่อเทสเพื่อบอกคนถัดไปว่าแดงเมื่อไหร่ห้าม merge

## เกี่ยวข้อง

- `docs/conventions/domain-term-single-definition.md` — gate ทุกตัวตรวจ "รูปแบบ" ไม่มีอันไหนตรวจ "ความหมาย"
- memory `feedback_spike_must_match_production_path` — เทสต้องแตะเส้นทางจริง
