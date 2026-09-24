/**
 * thaiBahtText — ยอดเงินเป็นคำอ่านภาษาไทย แบบ BAHTTEXT ของ Excel (feature 00065 ใบเสร็จรับเงิน)
 *
 *   3500   → "สามพันห้าร้อยบาทถ้วน"
 *   350.5  → "สามร้อยห้าสิบบาทห้าสิบสตางค์"
 *   0.25   → "ยี่สิบห้าสตางค์"
 *
 * ปัดเป็นสตางค์ก่อนเสมอ (`Math.round(x*100)`) — ยอดเงินในระบบเป็น Decimal(12,2) อยู่แล้ว
 * แต่ number ของ JS มีเศษทศนิยมลอย (0.1+0.2) ถ้าตัดด้วย floor จะได้ "…เก้าสิบเก้าสตางค์" ผิด
 */

const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/** อ่านเลข 0–999,999 · `hasHigher` = มีหลักล้านอยู่ข้างหน้า (หน่วย 1 ต้องเป็น "เอ็ด" ไม่ใช่ "หนึ่ง") */
function readGroup(n: number, hasHigher: boolean): string {
  const digits = String(n).split('').map(Number).reverse()
  let out = ''
  for (let place = digits.length - 1; place >= 0; place--) {
    const d = digits[place]
    if (d === 0) continue
    if (place === 0 && d === 1 && (hasHigher || digits.length > 1)) out += 'เอ็ด'
    else if (place === 1 && d === 1) out += 'สิบ'
    else if (place === 1 && d === 2) out += 'ยี่สิบ'
    else out += DIGITS[d] + PLACES[place]
  }
  return out
}

function readInt(n: number, hasHigher = false): string {
  if (n >= 1_000_000) {
    const rest = n % 1_000_000
    return readInt(Math.floor(n / 1_000_000), hasHigher) + 'ล้าน' + (rest ? readGroup(rest, true) : '')
  }
  return readGroup(n, hasHigher)
}

export function thaiBahtText(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  const totalSatang = Math.round(Math.abs(amount) * 100)
  const baht = Math.floor(totalSatang / 100)
  const satang = totalSatang % 100
  const sign = amount < 0 && totalSatang > 0 ? 'ลบ' : ''

  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน'
  const bahtPart = baht > 0 ? readInt(baht) + 'บาท' : ''
  const satangPart = satang > 0 ? readInt(satang) + 'สตางค์' : 'ถ้วน'
  return sign + bahtPart + satangPart
}
