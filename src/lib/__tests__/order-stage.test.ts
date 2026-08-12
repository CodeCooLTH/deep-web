import { describe, it, expect } from 'vitest'
import { deriveOrderStage } from '@/lib/order-stage'

// เวลาอ้างอิงคงที่ — ห้ามใช้ Date.now() จริงในเทส (ผลจะเปลี่ยนตามเวลาที่รัน)
const NOW = new Date('2026-07-29T12:00:00Z').getTime()
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000)

const base = {
  status: 'PENDING',
  statusAt: hoursAgo(1),
  labelPrintedAt: null,
  carrierStatus: null,
}

describe('deriveOrderStage', () => {
  it('ไม่มีออเดอร์ → ไม่แสดงชิป', () => {
    expect(deriveOrderStage(null, NOW)).toBeNull()
  })

  it('เพิ่งสั่ง ยังไม่พิมพ์ใบปะหน้า → สั่งซื้อแล้ว', () => {
    expect(deriveOrderStage(base, NOW)?.label).toBe('สั่งซื้อแล้ว')
  })

  it('พิมพ์ใบปะหน้าแล้วแต่ยังไม่ส่ง → พิมพ์เอกสารแล้ว', () => {
    const s = deriveOrderStage({ ...base, labelPrintedAt: hoursAgo(1) }, NOW)
    expect(s?.label).toBe('พิมพ์เอกสารแล้ว')
  })

  it('ร้านแจ้งจัดส่งเองโดยไม่เปิดพัสดุ (SHIPPED, ไม่มีพัสดุ) → กำลังจัดส่ง', () => {
    expect(deriveOrderStage({ ...base, status: 'SHIPPED' }, NOW)?.label).toBe('กำลังจัดส่ง')
  })

  it('ขนส่งรับของแล้ว (carrierStatus=picked_up) → กำลังจัดส่ง แม้ Order ยัง PENDING', () => {
    // BR-ISHIP-40/41: สถานะขนส่งเป็นคนละชุดกับ Order.status และไม่ไปแก้ Order.status ให้
    // ป้ายจึงต้องอ่านทั้งสองทาง ไม่งั้นออเดอร์ที่ขนส่งรับไปแล้วจะยังขึ้น "พิมพ์เอกสารแล้ว"
    const s = deriveOrderStage(
      { ...base, hasShipment: true, labelPrintedAt: hoursAgo(5), carrierStatus: 'picked_up' },
      NOW,
    )
    expect(s?.label).toBe('กำลังจัดส่ง')
  })

  it('ส่งถึงแล้ว → จัดส่งสำเร็จ (ต้องชนะ labelPrintedAt ที่ยังติดอยู่)', () => {
    const s = deriveOrderStage(
      {
        status: 'PENDING', statusAt: hoursAgo(2), hasShipment: true,
        labelPrintedAt: hoursAgo(30), carrierStatus: 'delivered',
      },
      NOW,
    )
    expect(s?.label).toBe('จัดส่งสำเร็จ')
  })

  // ── บั๊กจริงที่ user เจอ 2026-07-29 ──────────────────────────────────────────
  // ออเดอร์ที่เพิ่งสร้างขึ้นป้าย "จัดส่งสำเร็จ" ทันที เพราะร้านกดปิดการขาย (CONFIRMED)
  // ตั้งแต่ขนส่งยังไม่มารับพัสดุ — ข้อมูลจริงตอนนั้น: hasShipment=true, carrierStatus=null
  describe('Order.status ต้องไม่ทับสถานะของพัสดุ (regression)', () => {
    it('มีพัสดุ + ร้านกด CONFIRMED แต่ขนส่งยังไม่แจ้ง → ต้องไม่ใช่ "จัดส่งสำเร็จ"', () => {
      const s = deriveOrderStage(
        {
          status: 'CONFIRMED', statusAt: hoursAgo(1), hasShipment: true,
          labelPrintedAt: null, carrierStatus: null,
        },
        NOW,
      )
      expect(s?.label).toBe('สร้างพัสดุแล้ว')
    })

    it('มีพัสดุ + พิมพ์แล้ว + ร้านกด CONFIRMED → ยังเป็น "พิมพ์เอกสารแล้ว"', () => {
      const s = deriveOrderStage(
        {
          status: 'CONFIRMED', statusAt: hoursAgo(1), hasShipment: true,
          labelPrintedAt: hoursAgo(1), carrierStatus: null,
        },
        NOW,
      )
      expect(s?.label).toBe('พิมพ์เอกสารแล้ว')
    })

    it('มีพัสดุ + ขนส่งแจ้งส่งถึงแล้ว → จัดส่งสำเร็จ (พัสดุยืนยันเอง)', () => {
      const s = deriveOrderStage(
        {
          status: 'CONFIRMED', statusAt: hoursAgo(1), hasShipment: true,
          labelPrintedAt: hoursAgo(20), carrierStatus: 'delivered',
        },
        NOW,
      )
      expect(s?.label).toBe('จัดส่งสำเร็จ')
    })
  })

  describe('ขายโดยไม่มีการส่งของ', () => {
    it('ไม่มีพัสดุ + CONFIRMED → "สำเร็จ" ไม่ใช่ "จัดส่งสำเร็จ" (ไม่มีอะไรถูกส่ง)', () => {
      const s = deriveOrderStage({ ...base, status: 'CONFIRMED', statusAt: hoursAgo(1) }, NOW)
      expect(s?.label).toBe('สำเร็จ')
    })

    it('ไม่มีพัสดุ + CONFIRMED เกิน 3 วัน → หายไป', () => {
      expect(deriveOrderStage({ ...base, status: 'CONFIRMED', statusAt: hoursAgo(73) }, NOW)).toBeNull()
    })
  })

  it('มีพัสดุแต่ยังไม่พิมพ์ ออเดอร์ยัง PENDING → สร้างพัสดุแล้ว', () => {
    expect(deriveOrderStage({ ...base, hasShipment: true }, NOW)?.label).toBe('สร้างพัสดุแล้ว')
  })

  describe('การหมดอายุของป้าย', () => {
    // ใช้เส้นทาง "พัสดุส่งถึงแล้ว" — เป็นทางเดียวที่ให้ป้าย "จัดส่งสำเร็จ" หลังแก้บั๊ก 2026-07-29
    const delivered = (h: number) => ({
      status: 'PENDING', statusAt: hoursAgo(h), hasShipment: true,
      labelPrintedAt: hoursAgo(h + 20), carrierStatus: 'delivered',
    })

    it('จัดส่งสำเร็จ 2 วัน 23 ชม. → ยังแสดง', () => {
      expect(deriveOrderStage(delivered(71), NOW)?.label).toBe('จัดส่งสำเร็จ')
    })

    it('จัดส่งสำเร็จเกิน 3 วัน → หายไปเลย ไม่ตกไปเป็นป้ายอื่น', () => {
      // ต้องเป็น null ไม่ใช่ตกไปเป็น "พิมพ์เอกสารแล้ว" ที่ labelPrintedAt ยังค้างอยู่
      expect(deriveOrderStage(delivered(73), NOW)).toBeNull()
    })

    it('ยกเลิกภายใน 1 วัน → ยกเลิกแล้ว (เตือนแอดมิน)', () => {
      const s = deriveOrderStage({ ...base, status: 'CANCELLED', statusAt: hoursAgo(23) }, NOW)
      expect(s?.label).toBe('ยกเลิกแล้ว')
      expect(s?.cls).toContain('danger')
    })

    it('ยกเลิกเกิน 1 วัน → หายไป', () => {
      const s = deriveOrderStage({ ...base, status: 'CANCELLED', statusAt: hoursAgo(25) }, NOW)
      expect(s).toBeNull()
    })

    it('ออเดอร์ที่ยังไม่จบไม่หมดอายุ — ค้างมา 10 วันก็ยังแสดง', () => {
      // งานที่ยังไม่จบต้องเห็นเสมอ ไม่งั้นออเดอร์ค้างจะหายไปจากสายตาแอดมินเงียบ ๆ
      const s = deriveOrderStage({ ...base, statusAt: hoursAgo(240) }, NOW)
      expect(s?.label).toBe('สั่งซื้อแล้ว')
    })
  })

  describe('จำนวนครั้งที่พิมพ์ใบปะหน้า', () => {
    it('พิมพ์เอกสารแล้ว + นับได้ 3 → มี printCount ไว้ทำป้ายเสริม', () => {
      const s = deriveOrderStage({ ...base, labelPrintedAt: hoursAgo(1), labelPrintCount: 3 }, NOW)
      expect(s?.label).toBe('พิมพ์เอกสารแล้ว')
      expect(s?.printCount).toBe(3)
    })

    it('แถวเก่าที่ไม่มีตัวนับ (0/null) → ไม่มี printCount ไม่เดาว่าพิมพ์ 1 ครั้ง', () => {
      expect(deriveOrderStage({ ...base, labelPrintedAt: hoursAgo(1), labelPrintCount: 0 }, NOW)?.printCount)
        .toBeUndefined()
      expect(deriveOrderStage({ ...base, labelPrintedAt: hoursAgo(1), labelPrintCount: null }, NOW)?.printCount)
        .toBeUndefined()
    })

    it('ขั้นอื่นไม่มี printCount แม้พัสดุจะเคยถูกพิมพ์มาแล้ว', () => {
      const s = deriveOrderStage(
        { ...base, status: 'SHIPPED', labelPrintedAt: hoursAgo(5), labelPrintCount: 4 },
        NOW,
      )
      expect(s?.label).toBe('กำลังจัดส่ง')
      expect(s?.printCount).toBeUndefined()
    })
  })

  it('รับ statusAt เป็น ISO string ได้ (ข้าม RSC boundary แล้ว Date กลายเป็น string)', () => {
    const s = deriveOrderStage({ ...base, statusAt: hoursAgo(1).toISOString() }, NOW)
    expect(s?.label).toBe('สั่งซื้อแล้ว')
  })

  // ── ออเดอร์นัดหมาย (ร้านคิวงาน) — user request 2026-08-08 ───────────────────
  // ป้ายต้องพูดเรื่องนัด ไม่ใช่ "สั่งซื้อแล้ว" ซึ่งไม่ได้บอกสิ่งที่ร้านต้องรู้ระหว่างคุยแชท
  describe('ออเดอร์ที่เป็นนัดหมาย', () => {
    // 16 ส.ค. 2026 09:00 เวลาไทย (= 02:00Z) — ตรงกับตัวอย่างที่ user ให้มา "16 ส.ค. 69"
    const serviceStart = new Date('2026-08-16T02:00:00Z')

    it('นัดที่ยังไม่ถูกยืนยัน → "นัด 16 ส.ค. 69" + สีของ SCHEDULED', () => {
      const s = deriveOrderStage({ ...base, serviceStart, appointmentStatus: 'SCHEDULED' }, NOW)
      expect(s?.label).toBe('นัด 16 ส.ค. 69')
      expect(s?.cls).toBe('bg-warning/15 text-warning-ink')
      expect(s?.icon).toBe('calendar-event')
      // key ต้องไม่เปลี่ยน — โค้ดอื่นยัง switch บนค่านี้อยู่ เปลี่ยนแค่หน้าตา
      expect(s?.key).toBe('ORDERED')
    })

    it('appointmentStatus ว่าง (แถวเก่า) → ถือเป็น SCHEDULED ตาม default เดียวกับปฏิทิน', () => {
      const s = deriveOrderStage({ ...base, serviceStart, appointmentStatus: null }, NOW)
      expect(s?.label).toBe('นัด 16 ส.ค. 69')
    })

    it('ลูกค้ายืนยันแล้ว → ยังโชว์วันนัด แต่เปลี่ยนสีเป็น primary (ไม่ใช่เขียว)', () => {
      const s = deriveOrderStage({ ...base, serviceStart, appointmentStatus: 'CONFIRMED_BY_BUYER' }, NOW)
      expect(s?.label).toBe('นัด 16 ส.ค. 69')
      // Verified-Means-Green: เขียวสงวนไว้กับสิ่งที่ "เกิดขึ้นแล้ว" — นี่แค่ลูกค้าบอกว่าจะมา
      expect(s?.cls).toBe('bg-primary/15 text-primary-ink')
    })

    it.each([
      ['RESCHEDULE_REQUESTED', 'ลูกค้าขอเลื่อน'],
      ['NO_SHOW', 'ไม่มาตามนัด'],
      ['COMPLETED', 'ให้บริการแล้ว'],
    ])('นัดที่ไม่ได้เดินตามแผน (%s) → โชว์คำสถานะแทนวันที่', (appointmentStatus, label) => {
      // setAppointmentOutcome ไม่แตะ Order.status (BR-RSV-33) ป้ายจึงค้างที่ ORDERED เสมอ —
      // ถ้ายังโชว์วันที่ นัดที่จบ/ถูกขอเลื่อนไปแล้วจะอ่านเหมือนนัดที่ยังรออยู่ตลอดไป
      const s = deriveOrderStage({ ...base, serviceStart, appointmentStatus }, NOW)
      expect(s?.label).toBe(label)
    })

    it('ยกเลิกทั้งใบ → "ยกเลิกแล้ว" ชนะข้อมูลนัด (ความจริงระดับออเดอร์อยู่เหนือรายละเอียดนัด)', () => {
      const s = deriveOrderStage(
        { ...base, status: 'CANCELLED', serviceStart, appointmentStatus: 'SCHEDULED' },
        NOW,
      )
      expect(s?.label).toBe('ยกเลิกแล้ว')
    })

    it('ออเดอร์ที่ไม่มี serviceStart → คำเดิมทุกประการ (ร้านขายของไม่ได้รับผลกระทบ)', () => {
      expect(deriveOrderStage({ ...base, serviceStart: null }, NOW)?.label).toBe('สั่งซื้อแล้ว')
    })

    it('serviceStart เป็น ISO string (ข้าม RSC boundary) ก็ยังได้วันเดียวกัน', () => {
      const s = deriveOrderStage({ ...base, serviceStart: serviceStart.toISOString() }, NOW)
      expect(s?.label).toBe('นัด 16 ส.ค. 69')
    })

    it('นัดหัวค่ำที่ข้ามวันเมื่อคิดเป็น UTC → ต้องได้วันตามเวลาไทย ไม่ใช่วันของ UTC', () => {
      // 16 ส.ค. 23:30 ไทย = 16:30Z ของวันเดียวกัน แต่ 17 ส.ค. 00:30 ไทย = 17:30Z วันที่ 16
      const s = deriveOrderStage({ ...base, serviceStart: new Date('2026-08-16T17:30:00Z') }, NOW)
      expect(s?.label).toBe('นัด 17 ส.ค. 69')
    })
  })

  // ── คำของขั้น ORDERED ผันตามประเภทกิจการ — user report 2026-08-12 ────────────
  // การ์ดในแชทของร้านคิวงานขึ้นชิป "สั่งซื้อแล้ว" ทั้งที่ไม่มีใครสั่งซื้ออะไร
  describe('ป้ายขั้นแรกผันตามประเภทกิจการ', () => {
    it.each([
      ['ONLINE_SALES', 'สั่งซื้อแล้ว'],
      ['SERVICE_QUEUE', 'รับงานแล้ว'],
      ['LODGING', 'เปิดบิลแล้ว'],
    ])('[blocker] %s → "%s"', (vertical, label) => {
      const s = deriveOrderStage({ ...base, vertical }, NOW)
      expect(s?.label).toBe(label)
      // เปลี่ยนแค่คำ — key/สี/ไอคอนต้องเหมือนกันทุก vertical (ตำแหน่งบนเส้นทางเดียวกัน)
      expect(s?.key).toBe('ORDERED')
      expect(s?.cls).toBe('bg-primary/15 text-primary-ink')
      expect(s?.icon).toBe('shopping-cart')
    })

    it('ไม่ส่ง vertical / ค่าที่ไม่รู้จัก → คำเดิมของ ONLINE_SALES (fail-safe เดียวกับ resolveOrderVocab)', () => {
      expect(deriveOrderStage(base, NOW)?.label).toBe('สั่งซื้อแล้ว')
      expect(deriveOrderStage({ ...base, vertical: 'SOMETHING_NEW' }, NOW)?.label).toBe('สั่งซื้อแล้ว')
      expect(deriveOrderStage({ ...base, vertical: null }, NOW)?.label).toBe('สั่งซื้อแล้ว')
    })

    it('[blocker] นัดหมายชนะคำของ vertical — ร้านคิวงานที่มีนัดต้องได้ "นัด <วันที่>" ไม่ใช่ "รับงานแล้ว"', () => {
      // สองตัวผันคำนี้ทับช่องเดียวกัน (ORDERED) ลำดับจึงเป็นเรื่องความหมาย ไม่ใช่เรื่องสไตล์:
      // "นัดวันไหน" คือสิ่งที่ร้านต้องรู้ระหว่างคุย ส่วน "รับงานแล้ว" บอกแค่ว่าใบถูกเปิดขึ้นมา
      const s = deriveOrderStage(
        { ...base, vertical: 'SERVICE_QUEUE', serviceStart: new Date('2026-08-16T02:00:00Z') },
        NOW,
      )
      expect(s?.label).toBe('นัด 16 ส.ค. 69')
    })

    it('ขั้นอื่นไม่ถูกแตะ — vertical ผันแค่ ORDERED ขั้นเดียว', () => {
      expect(deriveOrderStage({ ...base, vertical: 'SERVICE_QUEUE', status: 'CANCELLED' }, NOW)?.label).toBe('ยกเลิกแล้ว')
      expect(deriveOrderStage({ ...base, vertical: 'SERVICE_QUEUE', status: 'CONFIRMED' }, NOW)?.label).toBe('สำเร็จ')
      expect(deriveOrderStage({ ...base, vertical: 'LODGING', status: 'SHIPPED' }, NOW)?.label).toBe('กำลังจัดส่ง')
    })
  })
})
