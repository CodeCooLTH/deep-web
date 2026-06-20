// ลบ `@charset "UTF-8";` ที่หัวไฟล์ CSS ของ vendor บางตัว
//
// ทำไม: animate.css / react-datepicker ฝัง `@charset` ไว้บรรทัดแรก. พอ Tailwind v4
// (@tailwindcss/postcss) inline ไฟล์เหล่านี้เข้า bundle, ตัว `@charset` ไม่ได้อยู่ที่
// byte แรกอีกต่อไป → Lightning CSS เตือน "Unknown at rule: @charset" แล้ว strip ทิ้ง.
// ผลลัพธ์ build ไม่เปลี่ยน (UTF-8 อยู่แล้ว) แต่ log มี warning กวนตา.
//
// แก้ที่ต้นทาง: ตัดบรรทัด `@charset` ออกจากไฟล์ vendor หลังติดตั้ง. idempotent —
// รันซ้ำได้, ไม่ fail ถ้าไฟล์หาย (เช่น install ไม่ครบ). chain ไว้ใน postinstall.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const targets = [
  'node_modules/animate.css/animate.min.css',
  'node_modules/react-datepicker/dist/react-datepicker.css',
]

// match `@charset "...";` (มี whitespace นำหน้าได้) ที่จุดไหนก็ตามในไฟล์
const charsetRule = /@charset\s+"[^"]*"\s*;\s*/gi

let stripped = 0

for (const file of targets) {
  if (!existsSync(file)) continue
  const css = readFileSync(file, 'utf8')
  if (!charsetRule.test(css)) continue
  writeFileSync(file, css.replace(charsetRule, ''), 'utf8')
  stripped++
  console.log(`[strip-vendor-charset] stripped @charset from ${file}`)
}

if (stripped === 0) {
  console.log('[strip-vendor-charset] no @charset to strip (already clean)')
}
