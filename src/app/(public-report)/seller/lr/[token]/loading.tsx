// Base: theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx (bg-default-300 animate-pulse) — โครงตรงกับหน้าจริง
import { Brand } from './components/StateCard'

const bar = 'bg-default-300 animate-pulse motion-reduce:animate-none rounded'

export default function Loading() {
  return (
    <div className="bg-body-bg min-h-screen" aria-busy="true">
      <Brand />
      <span className="sr-only" role="status">กำลังโหลดสรุปรายงาน</span>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-base px-4 md:px-6 lg:grid lg:max-w-6xl lg:grid-cols-12 lg:items-start">
        <div className="card lg:col-span-4">
          <div className="card-header"><div className={`${bar} h-5 w-40`} /></div>
          <div className="card-body flex flex-col gap-3">
            <div className={`${bar} h-4 w-32`} />
            <div className={`${bar} h-9 w-48`} />
            <div className={`${bar} h-2 w-full rounded-full`} />
            <div className={`${bar} h-16 w-full`} />
          </div>
        </div>
        <div className="card lg:col-span-8">
          <div className="card-header"><div className={`${bar} h-5 w-32`} /></div>
          <div className="card-body flex flex-col gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className={`${bar} h-10 w-full`} />)}
          </div>
        </div>
      </main>
    </div>
  )
}
