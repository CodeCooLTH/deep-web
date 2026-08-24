/**
 * Skeleton ของหน้าโปรไฟล์ลูกค้า — mirror โครงจริง (feature 00057)
 *
 * โครงต้องตรงกับ `page.tsx`: เดสก์ท็อป 2 คอลัมน์ 70/30 (ประวัติซ้าย / สรุปขวา)
 * ถ้า skeleton วางคนละโครงกับของจริง จอจะกระโดดตอนข้อมูลมาถึง ซึ่งอ่านเป็น "โหลดผิด"
 * มากกว่า "โหลดเสร็จ"
 */
export default function Loading() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 xl:grid-cols-10">
      <div className="xl:col-span-7">
        <div className="card">
          <div className="card-header">
            <div className="bg-default-200 h-4 w-40 rounded" />
          </div>
          <div className="flex flex-col">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="border-default-100 flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <div className="flex-1">
                  <div className="bg-default-200 mb-2 h-3.5 w-32 rounded" />
                  <div className="bg-default-100 h-3 w-24 rounded" />
                </div>
                <div className="text-right">
                  <div className="bg-default-200 mb-2 h-3.5 w-16 rounded" />
                  <div className="bg-default-100 h-4 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 xl:col-span-3">
        <div className="card">
          <div className="card-body flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-default-200 size-14 shrink-0 rounded-full" />
              <div className="flex-1">
                <div className="bg-default-200 mb-2 h-4 w-32 rounded" />
                <div className="bg-default-100 h-3 w-24 rounded" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="bg-default-100 h-9 w-20 rounded" />
              <div className="bg-default-100 h-9 w-24 rounded" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body flex flex-col gap-3">
            <div className="bg-default-200 h-8 w-32 rounded" />
            <div className="border-default-100 flex flex-col gap-2 border-t pt-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="bg-default-100 h-3.5 w-24 rounded" />
                  <div className="bg-default-200 h-3.5 w-16 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
