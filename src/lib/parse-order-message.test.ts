import { describe, it, expect } from 'vitest'
import { parseOrderMessage } from './parse-order-message'

describe('parseOrderMessage — heuristic แยกข้อมูลจากข้อความแชท', () => {
  it('ฟอร์แมตหลายบรรทัด (ชื่อ/ที่อยู่/ต./อ./จ./รหัส/โทร)', () => {
    const r = parseOrderMessage(
      'เชาวลิต เอกกุล\n6ม.4 บ้านปุหรน\nต.ช้างให้ตก อ.โคกโพธิ์\nจ.ปัตตานี\n94120\nโทร 081-7971726',
    )
    expect(r.name).toBe('เชาวลิต เอกกุล')
    expect(r.phone).toBe('0817971726')
    expect(r.postcode).toBe('94120')
    expect(r.province).toBe('ปัตตานี')
    expect(r.district).toBe('โคกโพธิ์')
    expect(r.subdistrict).toBe('ช้างให้ตก')
    expect(r.addressLine).toBe('6ม.4 บ้านปุหรน')
  })

  it('"ชื่อผู้รับ:" + ที่อยู่ไม่เว้นวรรค + "เบอร์โทร:"', () => {
    const r = parseOrderMessage(
      'ชื่อผู้รับ: จักรสิน ชินนอก\nที่อยู่: 233ม.13ต.โพนงามอ.หนองหานจ.อุดรธานี41130\nเบอร์โทร: 0988480695',
    )
    expect(r.name).toBe('จักรสิน ชินนอก')
    expect(r.phone).toBe('0988480695')
    expect(r.postcode).toBe('41130')
    expect(r.province).toBe('อุดรธานี')
    expect(r.district).toBe('หนองหาน')
    expect(r.subdistrict).toBe('โพนงาม')
    expect(r.addressLine).toBe('233ม.13')
  })

  it('เบอร์หลายตัว → เอาตัวแรก', () => {
    const r = parseOrderMessage('สมชาย ใจดี\nโทร 0612929865/ 0843642147')
    expect(r.phone).toBe('0612929865')
    expect(r.name).toBe('สมชาย ใจดี')
  })

  it('เบอร์เว้นวรรค (094 412 3939)', () => {
    const r = parseOrderMessage('โทรศัพท์ 094 412 3939')
    expect(r.phone).toBe('0944123939')
  })

  it('บรรทัดแรกเป็นชื่อ (ไม่มี label) + ต./อ./จ. เว้นวรรค', () => {
    const r = parseOrderMessage('ธนัชพร แซ่จ๋าว\n91 ม.7 ต.บ่อ อ.เมืองน่าน จ.น่าน\n55000\nโทร 0612929865')
    expect(r.name).toBe('ธนัชพร แซ่จ๋าว')
    expect(r.subdistrict).toBe('บ่อ')
    expect(r.district).toBe('เมืองน่าน')
    expect(r.province).toBe('น่าน')
    expect(r.postcode).toBe('55000')
  })

  it('"ถึงคุณ" ไม่เว้นวรรค → ตัด prefix', () => {
    const r = parseOrderMessage('ถึงคุณรุ่งรัตน์\nต.อ่างทอง อ.เมือง จ.กำแพงเพชร')
    expect(r.name).toBe('รุ่งรัตน์')
    expect(r.province).toBe('กำแพงเพชร')
  })

  it('ที่อยู่ใช้ underscore แทนจุด (ต_/อ_/จ_) — รับได้', () => {
    const r = parseOrderMessage(
      'เกรียงศักดิ์_ชุมภูธิมา\n1040/153โฮมกาเดนร์2\nหมู่2ต_สุระนารี\nอ_เมือง\nจ_นครราชสีมา\n30000\nT0983344300',
    )
    expect(r.name).toBe('เกรียงศักดิ์ ชุมภูธิมา') // _ → เว้นวรรค
    expect(r.subdistrict).toBe('สุระนารี')
    expect(r.district).toBe('เมือง')
    expect(r.province).toBe('นครราชสีมา')
    expect(r.postcode).toBe('30000')
    expect(r.phone).toBe('0983344300')
  })

  it('ข้อความว่าง/ไม่มีข้อมูล → คืน object ว่าง (ไม่ throw)', () => {
    expect(parseOrderMessage('')).toEqual({})
    expect(parseOrderMessage('สวัสดีครับ')).toEqual({ name: 'สวัสดีครับ' })
  })
})
