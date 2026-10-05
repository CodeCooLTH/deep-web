/**
 * [blocker] กล่อง "ขั้นถัดไป" ของผู้ซื้อ (00068 B4-L3 · TC-054/055/067/069/070/071/072)
 *
 * เทสอ่านซอร์สโดย path ตรง (ไม่ผ่าน helper allow-list — ไฟล์ใหม่ยังไม่ถูกลงทะเบียน)
 * 🛑 ชุดนี้ "ปักว่ากล่องนี้ไม่มีนิยามที่สองของ 'กล่องไหนแสดง'" — ตัวตัดสินอยู่ที่ buyer-next-action.ts ที่เดียว
 * แดง = ห้าม merge
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { stripComments } from '../../../../../lib/__tests__/helpers/buyer-order-sources'

const DIR = join(process.cwd(), 'src/app/(marketing)/o/[token]')
const read = (f: string) => stripComments(readFileSync(join(DIR, f), 'utf8'))

const BOXES = ['NextActionCard.tsx', 'NextActionShell.tsx', 'NextActionTransfer.tsx', 'NextActionShipment.tsx', 'NextActionPickup.tsx', 'NextActionStatus.tsx']

/** ตัวตัดสินกล่อง — ห้ามโผล่ในไฟล์กล่องเลย (ใช้ป้ายคำผ่าน paymentMethodLabel ได้ ซึ่งไม่อยู่ในรายการนี้) */
const DECIDERS = [
  /\bisCODPayment\(/,
  /\bisCashPayment\(/,
  /\bneedsPayoutAccount\(/,
  /\bisPickupOrder\(/,
  /\bshowSlipZone\(/,
  /\bresolveBuyerNextAction\(/, // เรียกที่ shell ครั้งเดียว (TC-055)
  /\bpaymentMethod\s*[!=]==/,
  /\bfulfillmentMode\s*[!=]==/,
  /\bprimary\s*[!=]==/,
  /\bstatus\s*[!=]==\s*'PENDING'/,
]

describe('[blocker] ไม่มีเงื่อนไขกิ่งของตัวเองในกล่อง', () => {
  it('มีไฟล์กล่องครบ (กันเทสว่างเปล่า)', () => {
    const present = readdirSync(DIR).filter(f => f.startsWith('NextAction'))
    expect(present.sort()).toEqual([...BOXES].sort())
  })

  for (const f of BOXES) {
    it(`${f} ไม่ตัดสิน "กล่องไหนแสดง" เอง`, () => {
      const src = read(f)

      for (const re of DECIDERS) expect(src, `${f} มี ${re}`).not.toMatch(re)
    })
  }

  it('NextActionCard สลับด้วยผลของ planNextActionCards เท่านั้น', () => {
    const src = read('NextActionCard.tsx')

    expect(src).toContain('planNextActionCards(')
    expect(src).toContain('action.transferNoAccount') // R-7 มาจากธงของฟังก์ชัน
    expect(src).not.toMatch(/\bswitch\s*\(/)
  })

  it('ยอดโอนมาจาก resolveTransferAmount ไม่ใช่ totalAmount ตรง ๆ (D-4)', () => {
    const card = read('NextActionCard.tsx')

    expect(card).toContain('resolveTransferAmount(')
    expect(card).not.toMatch(/amountDue=\{order\.totalAmount\}/)
    expect(read('NextActionTransfer.tsx')).not.toMatch(/totalAmount/)
  })
})

describe('[blocker] useSlipUpload — เส้นทางอัปโหลดเดิม + deps', () => {
  const hook = () => read('useSlipUpload.ts')

  it('direct upload → POST slip { fileId } · ข้อความจาก uploadFileId มาก่อนข้อความกลาง · ไม่ส่งไฟล์ผ่าน body', () => {
    expect(hook()).toContain("uploadFileId(file, 'DOCUMENT')")
    expect(hook()).toContain('`/api/orders/${token}/slip`')
    expect(hook()).toContain('JSON.stringify({ fileId })')
    expect(hook()).toContain('err instanceof Error ? err.message')
    expect(hook()).not.toContain('new FormData()')
    expect(hook()).toMatch(/from '@\/lib\/upload-client'/)
  })

  it('upload เป็น useCallback และคืนคีย์ตามสัญญา', () => {
    expect(hook()).toMatch(/const upload = useCallback\(/)
    expect(hook()).toMatch(/return \{ slipFileId, slipPreview, slipName, uploading, inputRef, upload \}/)
  })

  it('ข้อความล้มเหลวลงท้ายตามกติกา (error-copy-consistency ไม่สแกนไฟล์ .ts จึงเช็คที่นี่)', () => {
    const msgs = [...hook().matchAll(/'([^']*ไม่สำเร็จ[^']*)'/g)].map(m => m[1])

    expect(msgs.length).toBeGreaterThan(0)
    for (const m of msgs) expect(m).toMatch(/กรุณาลองใหม่อีกครั้ง$/)
  })

  it('🛑 ผู้เรียกทุกไฟล์ destructure — ไม่เก็บค่าที่ hook คืนทั้งก้อนเป็นตัวแปร (จะหลุดเข้า deps ได้)', () => {
    const callers = readdirSync(DIR)
      .filter(f => /\.tsx?$/.test(f) && f !== 'useSlipUpload.ts')
      .filter(f => /\buseSlipUpload\(/.test(read(f)))

    expect(callers, 'ไม่มีผู้เรียก hook เลย — เทสนี้ว่างเปล่า').toContain('NextActionTransfer.tsx')

    for (const f of callers) {
      const src = read(f)

      expect(src, f).toMatch(/const \{[^}]+\} = useSlipUpload\(/)
      expect(src, f).not.toMatch(/(?:const|let)\s+\w+\s*=\s*useSlipUpload\(/)
    }
  })

  it('🛑 dep array ในผู้เรียกไม่มีค่าที่ hook คืนทั้งก้อน', () => {
    const src = read('NextActionTransfer.tsx')

    for (const m of src.matchAll(/use(?:Callback|Effect|Memo|LayoutEffect)\([\s\S]*?\[([^\]]*)\]\s*\)/g)) {
      expect(m[1]).not.toMatch(/\bslip\b|\bslipUpload\b|\bupload\b/)
    }
  })
})

describe('[blocker] NextActionTransfer', () => {
  const src = () => read('NextActionTransfer.tsx')

  it('เพดานไฟล์อ่านจาก uploadMaxSize(DOCUMENT) ไม่พิมพ์เลข MB ตรง', () => {
    expect(src()).toContain("uploadMaxSize('DOCUMENT')")
    expect(src()).not.toMatch(/\b(5|10|25)\s*MB/)
  })

  it('มีบรรทัดนำทางและไม่มีคำสัญญาแทนร้าน', () => {
    const all = src() + read('../../../../lib/buyer-next-action.ts')

    expect(all).toContain('โอนแล้วแนบสลิปเพื่อแจ้งร้าน')
    expect(src()).not.toMatch(/ร้านตรวจแล้ว|ร้านจะ/)
  })

  it('ไม่มีบัญชีร้าน: ไม่มี QR/บัญชีว่าง — ออกจาก component ก่อนถึง PayoutAccountCard', () => {
    const s = src()
    const noAccountReturn = s.indexOf('if (noAccount)')

    expect(noAccountReturn).toBeGreaterThan(-1)
    expect(noAccountReturn).toBeLessThan(s.indexOf('<PayoutAccountCard'))
    expect(s).toContain('ติดต่อร้านค้า')
  })

  it('ใช้ PayoutAccountCard แบบ embedded พร้อม amountDue', () => {
    expect(src()).toMatch(/variant='embedded'/)
    expect(src()).toMatch(/amountDue=\{amountDue\}/)
  })

  it('แนบสลิปแล้วไม่ใช้สีเขียว (การแนบไม่ใช่การยืนยัน) + ปุ่มเปลี่ยนสลิป ≥44', () => {
    expect(src()).not.toMatch(/success|VERIFIED_INK|#18804A/)
    expect(src()).toMatch(/เปลี่ยนสลิป/)
    expect(src()).toMatch(/minHeight: 44/)
  })
})

describe('[blocker] NextActionShipment', () => {
  const src = () => read('NextActionShipment.tsx')

  it('ใช้ ParcelTimeline + buyerShipmentStatus ตัวเดียว ไม่วาดแถบเอง ไม่พิมพ์คำของ SHIPMENT_STAGES', () => {
    expect(src()).toContain('<ParcelTimeline')
    expect(src()).toContain('buyerShipmentStatus(')
    expect(src()).not.toMatch(/SHIPMENT_STAGES|SHIPPING_STAGE_LABEL|deriveShippingStage|resolveOrderStatusHeadline/)
    expect(src()).not.toMatch(/รับเข้าระบบ|ส่งสำเร็จ|กำลังจัด/)
  })

  it('ปุ่มคัดลอกเลขพัสดุ minHeight 44 ที่ ParcelTimeline (AC-BOP-06-2)', () => {
    const pt = readFileSync(join(DIR, 'ParcelTimeline.tsx'), 'utf8')
    const btn = pt.slice(pt.indexOf('<ButtonBase'), pt.indexOf('</ButtonBase>'))

    expect(btn).toMatch(/minHeight: 44/)
  })
})

describe('[blocker] NextActionPickup / NextActionStatus', () => {
  it('Pickup: ห้ามเขียว ห้ามพิมพ์เลขชั่วโมงปิดอัตโนมัติ ข้อความมอบของมาจาก handedOverAt', () => {
    const s = read('NextActionPickup.tsx')

    expect(s).not.toMatch(/success|VERIFIED_INK|VERIFIED_BG|#18804A|green/i)
    // 48 ที่อนุญาตมีแค่ความสูงปุ่ม CTA (`minHeight: 48`) — เลขชั่วโมงปิดอัตโนมัติอยู่ที่ PICKUP_AUTOCONFIRM_HOURS ที่เดียว
    expect(s).not.toMatch(/(?<!minHeight: )\b48\b/)
    expect(s).toContain('computeAutoConfirmDeadline(')
    expect(s).toMatch(/if \(handedOverAt\)/)
  })

  it('Status: ไม่มีโอน/สลิป/QR · ป้ายวิธีชำระมาจากฟังก์ชันกลาง', () => {
    const s = read('NextActionStatus.tsx')

    expect(s).not.toMatch(/PayoutAccountCard|useSlipUpload|slip|QR/i)
    expect(s).toContain('buildStatusBoxView(')
    expect(read('../../../../lib/buyer-next-action.ts')).toContain('paymentMethodLabel(')
  })

  it('ทุกกล่อง: ไม่มี emoji · ไม่มี component={Link} (ใช้ LinkButton)', () => {
    for (const f of BOXES) {
      const s = read(f)

      expect(s, f).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(s, f).not.toMatch(/component=\{Link\}/)
    }
  })
})
