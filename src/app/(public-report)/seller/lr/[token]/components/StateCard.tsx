// Base: theme/paces/Admin/TS/src/app/error/404/page.tsx (การ์ดกลางจอ — ตัดเลข 404 ไล่สี/uppercase/อังกฤษ/blob/AuthLogo ตาม spec §A9)
import Icon from '@/components/wrappers/Icon'
import logoWordmark from '@/assets/images/logo-deep-wordmark.png'

/** โลโก้ไม่เป็นลิงก์ — AuthLogo ห่อ <Link href="/"> ซึ่งพาคนนอกทีมไปหน้า login */
export function Brand() {
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center px-4 py-3 md:px-6 lg:max-w-6xl">
      <img src={logoWordmark.src} alt="Deep" className="h-6 w-auto" />
    </header>
  )
}

export const PLATE = {
  neutral: 'bg-default-200 text-default-700',
  warning: 'bg-warning/15 text-warning-ink',
  danger: 'bg-danger/15 text-danger-ink',
} as const

type Props = {
  icon: string
  plate?: keyof typeof PLATE
  title: string
  body: string
  /** กล่องวิธีไปต่อ */
  box?: string
  children?: React.ReactNode
}

export default function StateCard({ icon, plate = 'neutral', title, body, box, children }: Props) {
  return (
    <div className="bg-body-bg flex min-h-screen flex-col">
      <Brand />
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-10 md:items-center">
        <section className="card w-full max-w-md">
          <div className="card-body flex flex-col items-center px-6 py-8 text-center">
            <span className={`${PLATE[plate]} mb-4 flex size-14 items-center justify-center rounded-full`}>
              <Icon icon={icon} className="text-2xl" aria-hidden="true" />
            </span>
            <h1 className="text-default-900 m-0 text-lg font-semibold text-balance">{title}</h1>
            <p className="text-default-700 m-0 mt-2 text-sm text-balance">{body}</p>
            {box && <div className="bg-default-100 text-default-800 mt-4 w-full rounded-lg p-3 text-sm">{box}</div>}
            {children}
          </div>
        </section>
      </main>
    </div>
  )
}
