/**
 * LoginProviderLogo — โลโก้ช่องทางล็อกอิน (AuthAccount.provider) ใช้ร่วมกันทุกหน้าจอ
 *
 * ย้ายมาจาก `account/components/ConnectedAccountsClient.tsx` (2026-10-05) ตอนหน้า `/admins`
 * ต้องโชว์ช่องทางล็อกอินของสมาชิก — โลโก้แบรนด์ชุดเดียว ห้ามก็อปไปวาดซ้ำ
 *
 * ไม่รู้จัก provider = คืน null (ไม่เดาเป็นเจ้าใดเจ้าหนึ่ง — ดู `src/lib/oauth-provider-display.ts`)
 * สีแบรนด์ = ตัวตนของโลโก้ ไม่อยู่ใต้กฎ token สี (HR7 carve-out · contrast-fix-keeps-hue)
 */
import Icon from '@/components/wrappers/Icon'

/** PASSWORD = มีรหัสผ่าน (User.passwordHash) ไม่ใช่แถว AuthAccount — ผู้เรียกเติมเอง */
export type LoginProvider = 'APPLE' | 'FACEBOOK' | 'LINE' | 'INSTAGRAM' | 'PHONE' | 'PASSWORD'

export const LOGIN_PROVIDER_LABEL: Record<LoginProvider, string> = {
  APPLE: 'Apple',
  FACEBOOK: 'Facebook',
  LINE: 'LINE',
  INSTAGRAM: 'Instagram',
  PHONE: 'เบอร์โทร',
  PASSWORD: 'รหัสผ่าน',
}

export function isLoginProvider(v: string): v is LoginProvider {
  return v in LOGIN_PROVIDER_LABEL
}

export default function LoginProviderLogo({ provider, size = 18 }: { provider: LoginProvider; size?: number }) {
  const label = LOGIN_PROVIDER_LABEL[provider]
  switch (provider) {
    case 'APPLE':
      // โลโก้ Apple ขาว/ดำตามพื้น (Apple HIG อนุญาต) — text-default-900 สลับเองตอน dark mode ไม่หายบนการ์ดเข้ม
      return <Icon icon="bxl:apple" width={size} height={size} className="text-default-900" aria-label={label} />
    case 'FACEBOOK':
      return <Icon icon="bxl:facebook-circle" width={size} height={size} style={{ color: '#1877F2' }} aria-label={label} /> // HR7 carve-out: Facebook brand blue
    case 'INSTAGRAM':
      return <Icon icon="bxl:instagram" width={size} height={size} style={{ color: '#E1306C' }} aria-label={label} /> // HR7 carve-out: Instagram brand pink
    case 'PASSWORD':
      return <Icon icon="key" width={size} height={size} className="text-default-600" aria-label={label} />
    case 'PHONE':
      return <Icon icon="phone" width={size} height={size} className="text-default-600" aria-label={label} />
    case 'LINE':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label}>
      <path
      d="M19.952 12.255c0-3.78-3.79-6.855-8.452-6.855S3.048 8.475 3.048 12.255c0 3.39 3.006 6.23 7.068 6.768.275.059.65.182.745.418.085.213.056.549.028.764l-.12.726c-.037.213-.17.833.728.454.9-.38 4.86-2.862 6.63-4.9 1.222-1.341 1.825-2.703 1.825-4.23z"
        fill="#06C755" /* HR7 carve-out: LINE brand green — แบรนด์กำหนดค่าตายตัว ใช้ token แทนไม่ได้ */
      />
      <path
      d="M10.26 10.49H9.577a.197.197 0 0 0-.197.197v4.24c0 .109.088.197.197.197h.682a.197.197 0 0 0 .197-.197v-4.24a.197.197 0 0 0-.197-.197zm4.673 0h-.682a.197.197 0 0 0-.197.197v2.518l-1.942-2.624a.196.196 0 0 0-.016-.02l-.001-.002a.202.202 0 0 0-.014-.013l-.004-.004a.202.202 0 0 0-.013-.009l-.005-.003a.198.198 0 0 0-.014-.008l-.005-.002a.198.198 0 0 0-.015-.005l-.005-.002a.198.198 0 0 0-.015-.003H11.3a.197.197 0 0 0-.197.197v4.24c0 .109.088.197.197.197h.682a.197.197 0 0 0 .197-.197v-2.518l1.944 2.627a.196.196 0 0 0 .05.048l.002.001a.198.198 0 0 0 .051.02l.007.001a.2.2 0 0 0 .05.007h.65a.197.197 0 0 0 .197-.197v-4.24a.197.197 0 0 0-.197-.197zm-6.396 3.362H7.463v-3.165a.197.197 0 0 0-.197-.197h-.682a.197.197 0 0 0-.197.197v4.24c0 .053.021.1.055.136l.003.003.003.003a.196.196 0 0 0 .136.055h3.953a.197.197 0 0 0 .197-.197v-.682a.197.197 0 0 0-.197-.193zm10.017-3.362h-3.953a.197.197 0 0 0-.197.197v4.24a.197.197 0 0 0 .197.197h3.953a.197.197 0 0 0 .197-.197v-.682a.197.197 0 0 0-.197-.197h-3.074v-.73h3.074a.197.197 0 0 0 .197-.197v-.682a.197.197 0 0 0-.197-.197h-3.074v-.73h3.074a.197.197 0 0 0 .197-.197v-.682a.197.197 0 0 0-.197-.193z"
        fill="#fff" /* HR7 carve-out: ตัวอักษรขาวในมาร์ก LINE — เป็นส่วนหนึ่งของโลโก้ ไม่ใช่สีข้อความ */
      />
        </svg>
      )
  }
}
