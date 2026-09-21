'use client'

// ตัวรองรับสุดท้ายเมื่อ root layout เอง (เช่น (paces)/layout.tsx) พัง — แทนที่ทั้ง <html>
// จึงไม่มี CSS/ฟอนต์/i18n ของแอปให้ใช้ ต้องเขียน style ในตัวและเป็นภาษาไทยตายตัว
// (หน้าปกติไปใช้ src/app/(paces)/error.tsx ซึ่งมีธีมครบ)
import { Anuphan } from 'next/font/google'
import { useEffect } from 'react'

import { reportClientError } from '@/lib/report-client-error'

// โหลด Anuphan เองได้ (HR5) — next/font ไม่ต้องพึ่ง layout ที่พังไปแล้ว
const anuphan = Anuphan({ subsets: ['thai', 'latin'], weight: ['400', '600'], display: 'swap' })

const btn = { padding: '10px 18px', borderRadius: 8, fontSize: 15, cursor: 'pointer' } as const

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportClientError(error, 'global')
  }, [error])

  return (
    <html lang="th">
      <body className={anuphan.className} style={{ margin: 0, background: '#f5f6f8', color: '#333' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, textAlign: 'center' }}>
            <div role="alert">
            <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>หน้านี้แสดงผลไม่ได้</h1>
            <p style={{ color: '#666', margin: 0 }}>ระบบบันทึกปัญหาไว้แล้ว ลองโหลดใหม่อีกครั้ง หรือกลับไปหน้าก่อนหน้า</p>
            </div>
            <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{ ...btn, background: '#fff', border: '1px solid #ccc', color: '#333' }}
                onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign('/'))}
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                // #236dc9 = --color-primary (Paces token, ดู DESIGN.md) — hardcode เพราะไฟล์นี้ไม่มี Tailwind/CSS
                // pipeline (แทนที่ทั้ง <html> เมื่อ root layout เองพัง) · carve-out ของ HR7
                style={{ ...btn, background: '#236dc9', border: 'none', color: '#fff' }}
                onClick={() => window.location.reload()}
              >
                ลองใหม่อีกครั้ง
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
