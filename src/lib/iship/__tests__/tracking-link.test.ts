import { describe, it, expect } from 'vitest'
import { COURIER_BRANDS, courierBrandCode } from '../courier'
import { TRACKING_LINKS, trackingLinkFor, type TrackingLinkRow } from '../tracking-link'
import { detectScamLink } from '@/lib/scam-link-detector'

const fixture: Record<string, TrackingLinkRow | 'NONE'> = {
  KERRY: { form: 'DEEP', url: 'https://example.test/t/{เลข}', verifiedAt: '2026-10-17' },
  DHL: { form: 'PAGE', url: 'https://example.test/dhl', verifiedAt: '2026-10-17' },
}

describe('tracking-link', () => {
  it('[blocker] TC-190 ทุกแบรนด์ที่ไม่ใช่ ISHIP ประกาศในตารางชัดเจน', () => {
    for (const b of COURIER_BRANDS.filter((x) => x.code !== 'ISHIP')) {
      expect(Object.keys(TRACKING_LINKS), b.code).toContain(b.code)
    }
  })

  it('TC-191 ไม่มีแถว: ISHIP ได้ลิงก์ iShip · MANUAL ได้ null · ไม่รู้แบรนด์ null', () => {
    expect(trackingLinkFor({ courierCode: 'FlashExpressA', courierName: 'Flash Thunder', trackingNo: 'TH1', source: 'ISHIP' })).toBe(
      'https://app.iship.cloud/tracking?track=TH1',
    )
    expect(trackingLinkFor({ courierName: 'Kerry Express', trackingNo: 'TH1', source: 'MANUAL' })).toBeNull()
    expect(trackingLinkFor({ courierName: 'ขนส่งท้องถิ่น', trackingNo: 'X', source: 'MANUAL' })).toBeNull()
  })

  it('[blocker] TC-192 แถว DEEP encode เลข · PAGE ใช้ url ตรง ๆ', () => {
    expect(trackingLinkFor({ courierName: 'Kerry Express', trackingNo: 'A B&1', source: 'MANUAL' }, fixture)).toBe(
      'https://example.test/t/A%20B%261',
    )
    expect(trackingLinkFor({ courierName: 'DHL', trackingNo: '1', source: 'MANUAL' }, fixture)).toBe('https://example.test/dhl')
  })

  it('TC-193 ชื่อขนส่งที่เคยเก็บยังจับแบรนด์ได้', () => {
    const cases: Record<string, string> = {
      'Kerry Express': 'KERRY', 'Flash Express': 'FLASH', 'Thailand Post': 'THAIPOST',
      'J&T Express': 'JANDT', DHL: 'DHL', 'BEST Express': 'BEST', 'SPX Express': 'SPX', 'Fuze Post': 'FUZE',
    }
    for (const [name, code] of Object.entries(cases)) expect(courierBrandCode(null, name), name).toBe(code)
  })

  it('TC-194 ลิงก์ iShip ไม่ถูก scam detector เตือน', () => {
    expect(detectScamLink('ติดตามพัสดุ: https://app.iship.cloud/tracking?track=TH123').flagged).toBe(false)
  })
})
