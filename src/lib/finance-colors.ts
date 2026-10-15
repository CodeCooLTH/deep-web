/**
 * สีของตัวเลขการเงิน — **ตัวกลางเดียวทั้งระบบ** (00073 ภาคต่อ FR-016 · user สั่ง 2026-10-12 "สีกำหนดให้ชัดเจน ให้เหมือนกัน")
 *
 * หลัก: สีเดียว = ความหมายเดียว ทุกจอ (การ์ดหน้าแรก · การ์ดคอม · ชีตมือถือ · /sales · รายงานกลุ่ม LINE)
 *   🟩 counted     เขียว  = นับเป็นยอดขายแล้ว — ร้านบริการ "ปิดงานแล้ว"/"รับเงินแล้ว" · ร้านขายของ "ยืนยันแล้ว"
 *   🟨 notCounted  เหลือง = ยังไม่นับเป็นยอดขาย — ร้านบริการ "ยังไม่ปิดงาน" · ร้านขายของ "รอยืนยัน"
 *   🟦 outstanding ฟ้า    = ค้างรับ (ปิดงานแล้วแต่ยังเก็บเงินไม่ครบ) — ร้านบริการเท่านั้น
 *   🔵 count       น้ำเงิน = เส้นจำนวนงาน/คำสั่งซื้อ
 *   🟥 outflow     แดง   = ค่าใช้จ่าย/รายจ่าย · cost = ต้นทุน (สีกราฟ beta)
 *
 * 🛑 เดิม "ค้างรับ" ในจอข้างในใช้เหลือง ขณะที่การ์ดหน้าแรกใช้เหลือง = ยังไม่ปิดงาน ⇒ เหลืองมีสองความหมาย
 *    จึงย้ายค้างรับเป็นฟ้า (ร้านบริการ) · ร้านขายของไม่มีค้างรับ — สีเดิมทุกจุด
 *
 * token = ชื่อที่ส่งให้ getColor()/colorVar() (`--color-<token>`) · dot/soft/ink = คลาส Tailwind ของธีม
 * lineHex = สีในข้อความ Flex ของ LINE (LINE ไม่รู้จัก CSS var — ต้องเป็น hex)
 */
export const FINANCE_COLORS = {
  counted: { token: 'success', dot: 'bg-success', soft: 'bg-success/15', ink: 'text-success-ink' },
  /** "ยืนยันแล้ว" ของหน้าสรุปรายละเอียด /lr = น้ำเงิน ตรงแท่ง CONFIRMED_BAR บนการ์ด LINE (มติ Controller 2026-10-15) — ต่างจาก counted (เขียว) ที่ใช้ในแอป */
  confirmed: { token: 'primary', dot: 'bg-primary', soft: 'bg-primary/15', ink: 'text-primary-ink' },
  notCounted: { token: 'warning', dot: 'bg-warning', soft: 'bg-warning/15', ink: 'text-warning-ink', lineHex: '#f5b400', lineInkHex: '#92400e' },
  outstanding: { token: 'info', dot: 'bg-info', soft: 'bg-info/15', ink: 'text-info-ink' },
  count: { token: 'primary', dot: 'bg-primary' },
  /** เงินออก — ค่าใช้จ่ายร้าน/รายจ่ายรวม (แดง) · ต้นทุน (สีกราฟ beta) */
  outflow: { token: 'danger', dot: 'bg-danger' },
  cost: { token: 'chart-beta' },
  /** ตัวเลขที่ไม่ใช่สถานะเงิน (เฉลี่ย/งาน · มัดจำล่วงหน้า) — เทากลาง ห้ามยืมสีของสถานะ (เคยใช้ฟ้าซึ่งตอนนี้ = ค้างรับ) */
  neutral: { soft: 'bg-default-100', ink: 'text-default-700', bullet: 'text-default-500' },
} as const
