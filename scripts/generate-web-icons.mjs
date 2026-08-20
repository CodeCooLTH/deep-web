/**
 * สร้างชุดไอคอนของเว็บจากโลโก้ Deep ตัวเดียว (logo-deep-mark.png — พื้นโปร่งใส)
 *
 * 🛑 apple-icon ต้อง "ทึบ" เสมอ — iOS ไม่รองรับ alpha ใน apple-touch-icon
 *    มันจะ composite ส่วนโปร่งใสเป็น "ดำ" ⇒ ไอคอนบนหน้าจอโฮมกลายเป็นกล่องดำ
 * 🛑 maskable ต้องเผื่อ safe zone — Android ครอปเป็นวงกลม/สี่เหลี่ยมมนตามเครื่อง
 *    เนื้อโลโก้ต้องอยู่ในวงกลมกลางภาพ 80% ไม่งั้นขอบถูกกินหาย
 */
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const SRC = 'src/assets/images/logo-deep-mark.png'
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

/** วางโลโก้กลางผืนสี่เหลี่ยมจัตุรัส — `inset` = สัดส่วนขอบที่เว้นไว้ */
async function square(size, inset, background) {
  const art = Math.round(size * (1 - inset * 2))
  const logo = await sharp(SRC).resize(art, art, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
  const merged = await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer()
  if (background.alpha !== 1) return merged
  /**
   * 🛑 ต้องเป็น "รอบที่สอง" เสมอ — sharp เรียงลำดับ operation ของมันเองตายตัว และ `flatten`
   * ถูกจัดไว้ *ก่อน* `composite` ⇒ ต่อ .flatten() ท้าย chain เดียวกันจะไปแบนผืนเปล่า
   * แล้วโลโก้ที่มี alpha ถูกวางทับทีหลัง ไฟล์ที่ได้จึงยังมี alpha channel ติดมาเหมือนเดิม
   * (พิสูจน์แล้ว: hasAlpha ยังเป็น true ทั้ง 4 ไฟล์)
   *
   * ทำไมต้องถอดให้หมด: iOS ดูว่า apple-touch-icon "มี alpha channel ไหม" ไม่ได้ดูว่าโปร่งจริงไหม
   * ไฟล์ที่ทึบทุกพิกเซลแต่ยังพกแชนเนลมา ยังเสี่ยงถูก composite เป็นพื้นดำบนหน้าจอโฮม
   */
  return sharp(merged).flatten({ background }).png().toBuffer()
}

/** ICO ที่ฝัง PNG ไว้ข้างใน (รองรับตั้งแต่ Vista/IE9 — เบราว์เซอร์ปัจจุบันอ่านได้หมด) */
function buildIco(pngs) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(pngs.length, 4)
  let offset = 6 + pngs.length * 16
  const entries = pngs.map(({ size, buf }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2); e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12)
    offset += buf.length
    return e
  })
  return Buffer.concat([dir, ...entries, ...pngs.map((p) => p.buf)])
}

const out = []

// favicon — พื้นโปร่งใส อ่านออกทั้งแท็บสว่างและมืด · inset น้อยเพราะ 16px ต้องใหญ่สุดเท่าที่ได้
const icoSizes = [16, 32, 48]
const icoPngs = []
for (const size of icoSizes) icoPngs.push({ size, buf: await square(size, 0.02, { r: 0, g: 0, b: 0, alpha: 0 }) })
writeFileSync('src/app/favicon.ico', buildIco(icoPngs))
out.push(['src/app/favicon.ico', `${icoSizes.join('/')} px · โปร่งใส`])

// apple-touch-icon — Next.js อ่านชื่อไฟล์นี้แล้วใส่ <link rel="apple-touch-icon"> ให้เอง
writeFileSync('public/deep-icon-180.png', await square(180, 0.12, WHITE))
out.push(['public/deep-icon-180.png', '180 px · พื้นขาวทึบ'])

// PWA (Android/Chrome)
for (const size of [192, 512]) {
  writeFileSync(`public/deep-icon-${size}.png`, await square(size, 0.10, WHITE))
  out.push([`public/deep-icon-${size}.png`, `${size} px · พื้นขาว`])
}
writeFileSync('public/deep-icon-maskable-512.png', await square(512, 0.20, WHITE))
out.push(['public/deep-icon-maskable-512.png', '512 px · safe zone 20%'])

for (const [f, note] of out) console.log(`  ${f.padEnd(34)} ${note}`)
