# rebase ที่ผ่านสะอาด ไม่ใช่หลักฐานว่าปลอดภัย

> เหตุการณ์จริง 2026-08-08 — `b51afb48`
> ดู `docs/retro/2026-08-08-product-cost-00016-ext-retrospective.md` §P-6

## สิ่งที่เกิดขึ้น

ผมเพิ่มชิปตัวกรอง "ยังไม่ตั้งต้นทุน" ใน `ProductsListing.tsx` โดยก็อปแพตเทิร์นจากชิปสถานะที่อยู่ในไฟล์เดียวกัน — รวมถึงบรรทัดนี้:

```
'badge shrink-0 cursor-pointer whitespace-nowrap transition-colors focus:outline-none'
```

ระหว่างนั้น `052981b3 (a11y audit รอบ 2)` ขึ้น `main` และ **แก้บรรทัดนั้นพอดี** เพราะธีมไม่มี `.badge:focus` มาชดเชย outline ที่ถูกถอด → คีย์บอร์ดโฟกัสแล้วไม่เห็นอะไรเลย:

```
'badge shrink-0 cursor-pointer whitespace-nowrap transition-colors',
'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
```

`git rebase` **ผ่านโดยไม่มี conflict** เพราะเป็นคนละบรรทัด — ถ้าปล่อยไป จะได้ปุ่ม 2 ตัวในแถวเดียวกัน ห่างกัน 20 บรรทัด ที่ตัวหนึ่งโฟกัสเห็นและอีกตัวไม่เห็น = **เอาบั๊กที่เพิ่งถูกปิดกลับเข้ามาเงียบ ๆ**

## ทำไม git มองไม่เห็น

git ตรวจ **บรรทัดที่ชนกัน** ไม่ได้ตรวจ **แพตเทิร์นที่ควรเหมือนกัน**

โค้ดที่เขียนคู่ขนานโดยก็อปต้นแบบจากไฟล์เดียวกัน จะกลายเป็น "เวอร์ชันก่อนแก้" ทันทีที่อีกฝั่งแก้ต้นแบบ — และยิ่ง merge สะอาดเท่าไหร่ ยิ่งไม่มีอะไรเรียกให้ไปดู

**คลาสนี้เกิดบ่อยเป็นพิเศษในรีโปนี้** เพราะหลายคน/หลาย session push แข่งกันบน `main` และแพตเทิร์น UI ถูกก็อปข้ามไฟล์เป็นเรื่องปกติ (ดู `sibling-surface-parity.md`)

## กฎ

### ก่อน rebase — หาไฟล์ที่ทั้งสองฝั่งแตะ

```bash
git fetch origin
comm -12 <(git diff --name-only origin/main...HEAD | sort) \
         <(git diff --name-only HEAD...origin/main | sort)
```

**ว่าง = rebase ได้เลย · ไม่ว่าง = ต้องอ่านก่อน ไม่ว่าจะ conflict หรือไม่**

### สำหรับทุกไฟล์ที่ทับกัน — อ่าน diff ของอีกฝั่งในไฟล์นั้น

```bash
git log --oneline HEAD..origin/main -- "<ไฟล์>"   # เขาแก้อะไรบ้าง
git diff HEAD...origin/main -- "<ไฟล์>"           # แก้ยังไง
```

คำถามที่ต้องตอบ: **"ของที่ผมเพิ่งเขียนในไฟล์นี้ ก็อปมาจากบรรทัดที่เขาเพิ่งแก้หรือเปล่า"**

### หลัง rebase — เทียบแพตเทิร์นในไฟล์นั้น

ถ้าเพิ่ม element ที่ควรมีพฤติกรรมเดียวกับ element เดิม ให้ grep แพตเทิร์นทั้งไฟล์แล้วดูว่ามันเหมือนกันจริงไหม:

```bash
rg -n "focus:outline-none|focus-visible:ring" "<ไฟล์>"
```
ได้ผลไม่เหมือนกันในไฟล์เดียว = มีตัวใดตัวหนึ่งตกยุค

### verify ต้องอยู่หลัง rebase เสมอ และเช็ค fast-forward ซ้ำก่อน push

```bash
git rebase origin/main
# tsc / vitest / next build  ← ต้องอยู่ตรงนี้ ไม่ใช่ก่อน rebase
git fetch origin
[ "$(git rev-parse origin/main)" = "$(git rev-parse HEAD~N)" ] || echo "มีคนแทรก — rebase ใหม่"
git push origin HEAD:main   # แยกคำสั่ง ห้ามรวมกับ verify
```

รอบเดียวกันนี้ ขั้นตอนข้างบนจับได้ 3 อย่างคนละชนิด:
1. **Prisma client เก่า** — เวิร์กทรีคัด `node_modules` มาก่อนที่ feature อื่นจะเพิ่มคอลัมน์ `chatScopeMode` → `tsc` แดง 4 ตัว, build ล้ม (แก้ด้วย `prisma generate` ซึ่งไม่แตะฐานข้อมูล)
2. **มีคน push แทรกตอนกำลัง build** — จับได้เพราะเช็ค FF ซ้ำก่อนกด push
3. เคสในเอกสารนี้

## เกี่ยวข้อง

- `feedback_build_after_rebase_not_before` (memory)
- `feedback_verify_then_push_separately` (memory)
- `docs/conventions/sibling-surface-parity.md` — เหตุผลที่แพตเทิร์นถูกก็อปข้ามไฟล์ตั้งแต่แรก
