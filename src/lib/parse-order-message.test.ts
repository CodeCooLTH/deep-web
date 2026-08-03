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

  // ── bug user report 2026-08-02 (สร้างคำสั่งซื้อจากแชท) ──────────────────────
  // อาการ: กด "กระจายที่อยู่" แล้วปุ่มที่อยู่ขึ้นเหมือนเลือกสำเร็จ แต่กดบันทึกไม่ผ่าน
  // เพราะ 3 ช่องที่ระบบบังคับ (ที่อยู่ / จังหวัด / รหัสไปรษณีย์) มีช่องที่ยังว่างอยู่
  // โดยที่บรรทัดเด่นบนปุ่ม (ต./อ.) เต็มแล้วจึงดูเหมือนครบ

  it('ที่อยู่ กทม. (แขวง/เขต ไม่มี "จ.") → ต้องได้จังหวัด "กรุงเทพ"', () => {
    const r = parseOrderMessage(
      'ชื่อ: สมชาย ใจดี\nที่อยู่: 99/9 ซอยสุขุมวิท 24 แขวงคลองตัน เขตคลองเตย กรุงเทพ 10110\nโทร: 0812345678',
    )
    expect(r.subdistrict).toBe('คลองตัน')
    expect(r.district).toBe('คลองเตย')
    // ต้องสะกดตรงกับชุดข้อมูลของ iShip (public/data/iship-address.json)
    expect(r.province).toBe('กรุงเทพ')
    expect(r.postcode).toBe('10110')
    expect(r.addressLine).toBe('99/9 ซอยสุขุมวิท 24')
  })

  it('เขียน "กรุงเทพมหานคร"/"กทม." → normalize เป็น "กรุงเทพ" ให้ตรงชุดข้อมูล', () => {
    expect(
      parseOrderMessage('45 ถนนพระราม 4 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500').province,
    ).toBe('กรุงเทพ')
    expect(parseOrderMessage('แขวงสีลม เขตบางรัก กทม. 10500').province).toBe('กรุงเทพ')
  })

  it('จังหวัดต่างจังหวัดที่ไม่มี "จ." นำหน้า → จับได้จากรายชื่อจังหวัด', () => {
    const r = parseOrderMessage('88 ม.2 ต.บ้านสวน อ.เมือง ชลบุรี 20000')
    expect(r.province).toBe('ชลบุรี')
    expect(r.postcode).toBe('20000')
  })

  it('ข้อความบรรทัดเดียว (ชื่อ+ที่อยู่+เบอร์ ติดกัน) → ได้ทั้งชื่อและที่อยู่', () => {
    const r = parseOrderMessage('สมชาย ใจดี 99/9 ม.5 ต.บางรัก อ.เมือง จ.ชลบุรี 20000 โทร 0812345678')
    expect(r.name).toBe('สมชาย ใจดี')
    expect(r.phone).toBe('0812345678')
    expect(r.addressLine).toBe('99/9 ม.5')
    expect(r.subdistrict).toBe('บางรัก')
    expect(r.district).toBe('เมือง')
    expect(r.province).toBe('ชลบุรี')
    expect(r.postcode).toBe('20000')
  })

  it('บรรทัดที่มีแต่เบอร์โทร ต้องไม่ถูกหยิบมาเป็นที่อยู่', () => {
    const r = parseOrderMessage(
      'สมหญิง รักดี\nคอนโดลุมพินี ทาวเวอร์ ห้อง 1203\nแขวงทุ่งมหาเมฆ เขตสาทร\nกรุงเทพ 10120\n0891234567',
    )
    expect(r.phone).toBe('0891234567')
    expect(r.addressLine).not.toBe('0891234567')
    expect(r.addressLine).toBe('คอนโดลุมพินี ทาวเวอร์ ห้อง 1203')
    expect(r.province).toBe('กรุงเทพ')
  })
})
