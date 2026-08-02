import { describe, it, expect } from 'vitest'
import {
  ATTACHMENT_MAX_SIZE,
  IG_IMAGE_MAX_SIZE,
  attachmentKind,
  attachmentDisplayName,
  checkChannelSupport,
  extFromName,
  formatAttachmentSize,
  sanitizeAttachmentName,
} from '@/lib/chat-attachment'

/** helper — ประกอบ input ของ checkChannelSupport จากชื่อไฟล์ + ขนาด (mime เดาจาก kind ที่ derive) */
function f(name: string, size: number, mime = '') {
  const ext = extFromName(name)
  return { kind: attachmentKind(mime, ext), mime, ext, size }
}

const MB = 1024 * 1024

describe('attachmentKind', () => {
  it('MIME ชนะ ext เสมอ — ไฟล์ชื่อ .jpg แต่ MIME เป็น pdf ต้องเป็น FILE', () => {
    expect(attachmentKind('application/pdf', 'jpg')).toBe('FILE')
  })

  it('MIME ว่าง → fallback ที่ ext', () => {
    expect(attachmentKind('', 'png')).toBe('IMAGE')
    expect(attachmentKind('', 'mp4')).toBe('VIDEO')
    expect(attachmentKind('', 'm4a')).toBe('AUDIO')
  })

  it('ไม่รู้จักทั้ง MIME และ ext → FILE (ไม่เดาเป็น media)', () => {
    expect(attachmentKind('', 'psd')).toBe('FILE')
    expect(attachmentKind('', '')).toBe('FILE')
  })

  it('จัดกลุ่มจาก prefix ของ MIME ได้ทุกกลุ่ม', () => {
    expect(attachmentKind('image/webp', '')).toBe('IMAGE')
    expect(attachmentKind('video/quicktime', '')).toBe('VIDEO')
    expect(attachmentKind('audio/ogg', '')).toBe('AUDIO')
  })
})

describe('checkChannelSupport — กฎที่ใช้ทุกช่องทาง', () => {
  it.each(['virus.exe', 'run.sh', 'payload.apk', 'x.js', 'page.html', 'logo.svg', 'lib.dll'])(
    'บล็อกไฟล์รันได้/สคริปต์: %s',
    (name) => {
      for (const ch of ['DEEP', 'MESSENGER', 'INSTAGRAM']) {
        const r = checkChannelSupport(ch, f(name, 1024))
        expect(r.ok).toBe(false)
        expect(r.ok === false && r.reason).toContain('ความปลอดภัย')
      }
    },
  )

  it('ไฟล์ธุรกิจปกติไม่โดนบล็อก', () => {
    for (const name of ['ใบเสนอราคา.pdf', 'สต๊อก.xlsx', 'สัญญา.docx', 'ภาพ.zip', 'งาน.psd']) {
      expect(checkChannelSupport('DEEP', f(name, 1024)).ok).toBe(true)
    }
  })

  it('ขนาดพอดี 25MB ผ่าน / เกิน 1 ไบต์ไม่ผ่าน', () => {
    expect(checkChannelSupport('DEEP', f('a.pdf', ATTACHMENT_MAX_SIZE)).ok).toBe(true)
    const over = checkChannelSupport('DEEP', f('a.pdf', ATTACHMENT_MAX_SIZE + 1))
    expect(over.ok).toBe(false)
    expect(over.ok === false && over.reason).toContain('25MB')
  })

  it('ช่องทางที่ยังไม่ live = default deny ไม่ใช่ default allow', () => {
    for (const ch of ['LINE', 'TIKTOK', '']) {
      const r = checkChannelSupport(ch, f('a.pdf', 1024))
      expect(r.ok).toBe(false)
      expect(r.ok === false && r.reason).toContain('ยังไม่รองรับ')
    }
  })

  it('deny-list มาก่อนกฎช่องทาง — .exe บนช่องทางที่ไม่รู้จักก็ยังบอกเหตุผลความปลอดภัย', () => {
    const r = checkChannelSupport('LINE', f('virus.exe', 1024))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toContain('ความปลอดภัย')
  })
})

describe('checkChannelSupport — DEEP (แชทในแอป)', () => {
  it('รับทุกชนิดที่ไม่ติด deny-list', () => {
    for (const name of ['a.png', 'a.mp4', 'a.wav', 'a.7z', 'a.dwg', 'a.sketch']) {
      expect(checkChannelSupport('DEEP', f(name, 20 * MB)).ok).toBe(true)
    }
  })

  it('รูปใหญ่กว่าเพดาน IG แต่ไม่เกิน 25MB — DEEP ผ่าน', () => {
    expect(checkChannelSupport('DEEP', f('a.png', 20 * MB, 'image/png')).ok).toBe(true)
  })
})

describe('checkChannelSupport — MESSENGER', () => {
  it('รูปนอก jpg/png/gif/webp ไม่ผ่าน', () => {
    const r = checkChannelSupport('MESSENGER', f('a.heic', 1 * MB, 'image/heic'))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toContain('Messenger')
  })

  it('gif ผ่าน (ต่างจาก IG)', () => {
    expect(checkChannelSupport('MESSENGER', f('a.gif', 1 * MB, 'image/gif')).ok).toBe(true)
  })

  it('เอกสารทุกชนิดผ่าน — .docx ส่ง Messenger ได้ (ต่างจาก IG ที่รับแต่ PDF)', () => {
    expect(checkChannelSupport('MESSENGER', f('a.docx', 2 * MB)).ok).toBe(true)
  })

  it('รูป 20MB ผ่าน (เพดาน Messenger = 25MB ไม่ใช่ 8MB)', () => {
    expect(checkChannelSupport('MESSENGER', f('a.jpg', 20 * MB, 'image/jpeg')).ok).toBe(true)
  })
})

describe('checkChannelSupport — INSTAGRAM', () => {
  it('ไฟล์เอกสาร: PDF ผ่าน / นอกนั้นไม่ผ่าน', () => {
    expect(checkChannelSupport('INSTAGRAM', f('a.pdf', 2 * MB, 'application/pdf')).ok).toBe(true)
    const r = checkChannelSupport('INSTAGRAM', f('a.docx', 2 * MB))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toContain('PDF')
  })

  it('รูป: เพดาน 8MB — 7MB ผ่าน, 9MB ไม่ผ่าน', () => {
    expect(checkChannelSupport('INSTAGRAM', f('a.jpg', 7 * MB, 'image/jpeg')).ok).toBe(true)
    const r = checkChannelSupport('INSTAGRAM', f('a.jpg', 9 * MB, 'image/jpeg'))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toContain('8MB')
  })

  it('รูปพอดี 8MB ผ่าน (ขอบเขตแบบ inclusive)', () => {
    expect(checkChannelSupport('INSTAGRAM', f('a.png', IG_IMAGE_MAX_SIZE, 'image/png')).ok).toBe(true)
  })

  it('รูป webp/gif ไม่ผ่าน (IG รับแต่ jpg/png)', () => {
    expect(checkChannelSupport('INSTAGRAM', f('a.webp', 1 * MB, 'image/webp')).ok).toBe(false)
    expect(checkChannelSupport('INSTAGRAM', f('a.gif', 1 * MB, 'image/gif')).ok).toBe(false)
  })

  it('วิดีโอ: mp4/mov ผ่าน, mkv ไม่ผ่าน', () => {
    expect(checkChannelSupport('INSTAGRAM', f('a.mp4', 10 * MB, 'video/mp4')).ok).toBe(true)
    expect(checkChannelSupport('INSTAGRAM', f('a.mov', 10 * MB, 'video/quicktime')).ok).toBe(true)
    expect(checkChannelSupport('INSTAGRAM', f('a.mkv', 10 * MB, 'video/x-matroska')).ok).toBe(false)
  })

  it('เสียง: m4a ผ่าน, mp3 ไม่ผ่าน', () => {
    expect(checkChannelSupport('INSTAGRAM', f('a.m4a', 3 * MB, 'audio/mp4')).ok).toBe(true)
    expect(checkChannelSupport('INSTAGRAM', f('a.mp3', 3 * MB, 'audio/mpeg')).ok).toBe(false)
  })
})

describe('sanitizeAttachmentName', () => {
  it('เปลี่ยน path separator เป็น _ (ไม่ให้ชื่อกลายเป็น path)', () => {
    expect(sanitizeAttachmentName('../../etc/passwd')).toBe('.._.._etc_passwd')
    expect(sanitizeAttachmentName('a\\b.pdf')).toBe('a_b.pdf')
  })

  it('ตัด control char และ quote (กัน header injection ตอน Content-Disposition)', () => {
    expect(sanitizeAttachmentName('bill\r\nX-Evil: 1.pdf')).toBe('billX-Evil: 1.pdf')
    expect(sanitizeAttachmentName('"quote".pdf')).toBe('quote.pdf')
  })

  it('cap 200 ตัว', () => {
    expect(sanitizeAttachmentName('ก'.repeat(500))).toHaveLength(200)
  })

  it('ชื่อไทยปกติไม่ถูกแตะ', () => {
    expect(sanitizeAttachmentName('ใบเสนอราคา-สมชาย.pdf')).toBe('ใบเสนอราคา-สมชาย.pdf')
  })
})

describe('attachmentDisplayName', () => {
  it('มีชื่อเดิม → ใช้ชื่อเดิม', () => {
    expect(attachmentDisplayName('2026/08/02/uuid.pdf', 'ใบเสนอราคา.pdf')).toBe('ใบเสนอราคา.pdf')
  })

  it('ไม่มีชื่อเดิม (ข้อความเก่า/ไฟล์ mirror จาก Meta) → "ไฟล์แนบ.<ext>" ไม่ใช่ uuid', () => {
    expect(attachmentDisplayName('2026/08/02/6f1c-uuid.pdf')).toBe('ไฟล์แนบ.pdf')
  })

  it('ไม่มีนามสกุลเลย → "ไฟล์แนบ"', () => {
    expect(attachmentDisplayName('2026/08/02/uuid')).toBe('ไฟล์แนบ')
  })
})

describe('formatAttachmentSize', () => {
  it.each([
    [512, '512 B'],
    [88_000, '86 KB'],
    [1_258_291, '1.2 MB'],
    [12 * MB, '12 MB'],
  ])('%i → %s', (bytes, expected) => {
    expect(formatAttachmentSize(bytes)).toBe(expected)
  })

  it('null/ไม่มีค่า → null (UI ซ่อนบรรทัดขนาดไปเลย)', () => {
    expect(formatAttachmentSize(null)).toBeNull()
    expect(formatAttachmentSize(undefined)).toBeNull()
  })
})

describe('extFromName', () => {
  it.each([
    ['a.PDF', 'pdf'],
    ['ชื่อ.ไทย.docx', 'docx'],
    ['noext', ''],
    ['trailing.', ''],
  ])('%s → "%s"', (name, expected) => {
    expect(extFromName(name)).toBe(expected)
  })
})
