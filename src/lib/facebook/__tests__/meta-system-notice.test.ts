import { describe, expect, it } from 'vitest'
import { isMetaSystemNotice } from '../meta-system-notice'

describe('isMetaSystemNotice', () => {
  it.each([
    'Lead stage set to Qualified',
    'Lead stage set to Converted',
    'This message was automatically moved to spam.',
    'Oil Tanapatpiboon assigned this conversation to Oil Tanapatpiboon.',
  ])('จับ: %s', (t) => expect(isMetaSystemNotice(t)).toBe(true))

  it.each([null, '', 'สวัสดีค่ะ', 'Lead stage set to Qualified ครับ', 'ส่งของแล้วนะคะ This message was automatically moved to spam.'])(
    'ไม่จับ: %s',
    (t) => expect(isMetaSystemNotice(t)).toBe(false),
  )
})
