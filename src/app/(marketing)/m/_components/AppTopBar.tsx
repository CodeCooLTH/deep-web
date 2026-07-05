// Top bar ของ mobile web app (/m) — โลโก้ Deep + ช่องเช็กก่อนโอน (signature). sticky, server component.
import Link from 'next/link'

import Logo from '@components/layout/shared/Logo'

export default function AppTopBar() {
  return (
    <header
      className='sticky top-0 z-20 bg-[var(--mui-palette-background-paper)] shadow-[0_2px_10px_rgb(47_43_61_/_0.06)]'
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className='flex items-center gap-3 pli-4 plb-3'>
        <Link href='/dashboard' className='shrink-0 no-underline flex items-center'>
          <Logo />
        </Link>
        <Link
          href='/check'
          className='flex-1 flex items-center gap-2 h-10 pli-4 rounded-full bg-[var(--mui-palette-action-hover)] border border-[var(--mui-palette-divider)] no-underline min-w-0 transition-colors hover:border-[var(--mui-palette-primary-main)]'
        >
          <i className='tabler-search text-[1.25rem] text-[var(--mui-palette-primary-main)] shrink-0' />
          <span className='text-sm text-[var(--mui-palette-text-secondary)] truncate'>เช็กก่อนโอน — เบอร์ / บัญชี / ร้าน</span>
        </Link>
      </div>
    </header>
  )
}
