/**
 * พิมพ์ payload ตัวอย่างของ QR พร้อมเพย์ (feature 00062, TFR-011) ออกทาง stdout
 * เอาไปสร้าง QR แล้วสแกนด้วยแอปธนาคารไทยจริงอย่างน้อย 1 แอป ก่อนถือว่า FR-BANK-05 เสร็จ
 * (`docs/conventions/external-payload-schema.md` — payload ที่คำนวณถูกตามสเปกกระดาษไม่พอ
 * ต้องพิสูจน์ด้วยการสแกนจริง)
 *
 * รัน: npx tsx scripts/promptpay-qr-sample.ts
 * เอา payload string ที่ได้ไปสร้าง QR ที่เว็บ generator ใด ๆ (เช่น https://www.the-qrcode-generator.com/
 * โหมด "Plain Text") แล้วสแกนด้วยแอปธนาคาร ต้องเห็นยอด 1,250.00 บาท และเลข/ชื่อบัญชีผูกกับ
 * promptPayId ด้านล่างถูกต้อง
 *
 * ไม่แตะ DB / ไม่ import prisma — เรียก buildPromptPayPayload() ตรง ๆ
 */
import { buildPromptPayPayload } from '@/lib/promptpay-qr'

const promptPayId = '0812345678'
const amount = 1250

const payload = buildPromptPayPayload({ promptPayId, amount })

if (!payload) {
  console.error(`[promptpay-qr-sample] buildPromptPayPayload คืน null — ตรวจ input: promptPayId=${promptPayId} amount=${amount}`)
  process.exit(1)
}

console.log('=== ตัวอย่าง payload พร้อมเพย์ (feature 00062) ===')
console.log(`promptPayId : ${promptPayId} (มือถือ 10 หลัก)`)
console.log(`amount      : ${amount.toFixed(2)} บาท`)
console.log(`payload     : ${payload}`)
console.log(`ความยาว     : ${payload.length} ตัวอักษร`)
console.log('')
console.log('ขั้นตอนต่อไป: เอาบรรทัด payload ด้านบนไปสร้าง QR (plain text, ไม่ใช่ URL)')
console.log('แล้วสแกนด้วยแอปธนาคารไทยจริงอย่างน้อย 1 แอป (K PLUS / SCB Easy / ฯลฯ)')
console.log('ต้องเห็นยอด 1,250.00 บาท ก่อนถือว่า FR-BANK-05 (SRS TFR-011) ผ่าน')
