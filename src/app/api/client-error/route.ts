import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'

// รับ error ฝั่งเบราว์เซอร์จากหน้า error (src/lib/report-client-error.ts) แล้วเขียนลง log
// ไม่ต้องล็อกอิน (จอพังได้ทุกที่ รวมหน้าล็อกอิน) — ตัดความยาวทุกช่อง กันคนยิงขยะก้อนใหญ่เข้า log
// rate-limit/Origin-check ได้จาก guardApi ใน proxy.ts เหมือน API อื่น
const cut = (n: number) => v.optional(v.pipe(v.string(), v.transform((s) => s.slice(0, n))))
const Schema = v.object({
  where: cut(40),
  name: cut(80),
  message: cut(500),
  stack: cut(3000),
  digest: cut(80),
  url: cut(300),
})

export async function POST(request: NextRequest) {
  const parsed = v.safeParse(Schema, await request.json().catch(() => null))
  if (parsed.success) {
    console.error(
      '[client-error]',
      JSON.stringify({ ...parsed.output, ua: request.headers.get('user-agent')?.slice(0, 200) }),
    )
  }
  return new NextResponse(null, { status: 204 })
}
