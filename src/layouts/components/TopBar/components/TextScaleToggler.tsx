'use client'

/**
 * TextScaleToggler — ปุ่มขยายขนาดตัวอักษรทั้งหน้า (feat 00018, งาน 2, โผล่เฉพาะ /inbox วางข้าง
 * ปุ่มสลับธีมตามที่กำหนด)
 *
 * Base โครง dropdown: theme/paces/Admin/TS/src/layouts/components/TopBar/components/ThemeDropdown.tsx
 * (hs-dropdown + radio-list ตัวเลือก, [--auto-close:inside][--placement:bottom-right], class
 * `topbar-item`/`topbar-link`/`hs-dropdown-menu`/`dropdown-item`/peer-checked pattern ทั้งหมด
 * คัดลอกตรงจากไฟล์นั้น) — Paces ไม่มี component "text scale" ให้ copy ตรง (theme ไม่มีฟีเจอร์นี้)
 * จึงยึด pattern dropdown ที่ใกล้เคียงที่สุดในโปรเจกต์เดียวกัน (ThemeDropdown อยู่ topbar เดียวกัน
 * เป้าหมาย user สั่งให้วางข้างกันพอดี) แทน — บันทึกไว้ตาม Hard Rule 1
 *
 * icon: tabler-text-size (verify มีจริงใน src/assets/iconify-icons/generated-icons.css แล้ว)
 * aria-label/title: บอกระดับปัจจุบันเป็นภาษาไทยเสมอ ("ขนาดตัวอักษร: ปกติ/ใหญ่/ใหญ่มาก")
 */
import Icon from '@/components/wrappers/Icon'
import { TEXT_SCALE_OPTIONS, useTextScale } from '@/hooks/useTextScale'

const TextScaleToggler = () => {
  const { scale, setScale } = useTextScale()
  const currentLabel = TEXT_SCALE_OPTIONS.find((option) => option.value === scale)?.label ?? 'ปกติ'
  const currentDescription = `ขนาดตัวอักษร: ${currentLabel}`

  return (
    <div id="text-scale-toggler" className="sm:inline-flex hidden">
      <div className="topbar-item hs-dropdown relative inline-flex [--auto-close:inside] [--placement:bottom-right]">
        <button
          className="topbar-link hs-dropdown-toggle rounded-full"
          type="button"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label={currentDescription}
          title={currentDescription}
        >
          <Icon icon="text-size" className="text-xl" />
        </button>
        <div className="hs-dropdown-menu" role="menu" aria-orientation="vertical" aria-labelledby="text-scale-dropdown-menu">
          {TEXT_SCALE_OPTIONS.map((option) => (
            <div className="dropdown-item relative p-0" key={option.value}>
              <input
                value={option.value}
                className="peer invisible absolute size-0"
                type="radio"
                name="text-scale"
                id={`topbar-text-scale-${option.value}`}
                checked={scale === option.value}
                onChange={() => setScale(option.value)}
              />
              <label
                className="peer-checked:bg-default-100 w-full cursor-pointer rounded px-3.75 py-1.5"
                htmlFor={`topbar-text-scale-${option.value}`}
              >
                <span className="flex items-center gap-1">
                  <Icon icon="text-size" className="me-1 align-middle text-base" />
                  {option.label}
                </span>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TextScaleToggler
