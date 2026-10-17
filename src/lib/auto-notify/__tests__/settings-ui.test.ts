import { describe, expect, it } from 'vitest'
import { parseDailyCap, settingsBanner } from '../settings-ui'

describe('parseDailyCap ขอบ 1..20', () => {
  it.each([['1', 1], ['5', 5], ['20', 20], [' 7 ', 7]])('%s -> %s', (raw, n) => expect(parseDailyCap(raw)).toBe(n))
  it.each(['', '0', '21', '-1', '5.5', 'abc', '1e1', '００', '999999'])('"%s" ตก', (raw) => expect(parseDailyCap(raw)).toBeNull())
})

describe('settingsBanner', () => {
  it('อ่านอย่างเดียวชนะแถบเหลือง', () => {
    expect(settingsBanner({ canEdit: false, hasChannel: false })).toBe('readOnly')
    expect(settingsBanner({ canEdit: false, hasChannel: true })).toBe('readOnly')
  })
  it('แก้ได้: ไม่มีช่องทาง = เหลือง · มี = ไม่มีแถบ', () => {
    expect(settingsBanner({ canEdit: true, hasChannel: false })).toBe('noChannel')
    expect(settingsBanner({ canEdit: true, hasChannel: true })).toBeNull()
  })
})
