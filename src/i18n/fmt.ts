/**
 * fmt — แทรกค่าลงในข้อความที่มี placeholder (feature 00047)
 *
 *   fmt(t.channels.connectedN, { n: 3 })   // "Connected 3 channels"
 *
 * 🛑 ทำไมต้องมีตัวนี้แทนการต่อสตริงเอง
 * ลำดับคำของสองภาษาไม่ตรงกัน — "เชื่อมต่อสำเร็จ {n} ช่องทาง" กับ "Connected {n} channels"
 * วางตัวเลขไว้คนละตำแหน่ง ถ้าต่อสตริงในโค้ด (`'เชื่อมต่อสำเร็จ ' + n + ' ช่องทาง'`) จะแปลไม่ได้เลย
 * เพราะโครงประโยคถูกฝังอยู่ในโค้ด ไม่ได้อยู่ใน dictionary
 *
 * 🛑 ห้ามใส่ฟังก์ชันลงใน dictionary แทนวิธีนี้
 * ค่าใน dictionary ต้อง serialize ได้เสมอ (ดูเหตุผลที่หัว th.ts) และการเก็บเป็นสตริงล้วนทำให้
 * เทสเทียบคีย์/สแกนหาคำที่ลืมแปลได้ ซึ่งเป็นด่านหลักของฟีเจอร์นี้
 *
 * placeholder ที่ไม่มีค่าส่งมาจะ "คงไว้ตามเดิม" ไม่ใช่กลายเป็นช่องว่างหรือ undefined —
 * `{n}` ที่โผล่บนหน้าจอเป็นสิ่งที่คนเห็นแล้วรู้ทันทีว่าผิด ส่วนช่องว่างเงียบ ๆ ไม่มีใครสังเกต
 */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  )
}
