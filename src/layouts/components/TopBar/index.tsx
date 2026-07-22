/**
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/index.tsx
 *
 * การปรับจาก theme:
 * - ตัด widgets ที่ไม่ใช้ใน prod: AppsDropdownGrid, LanguageSelectorRounded,
 *   MegamenuApps, MegamenuColumns, SearchBoxRounded, CustomizerToggler,
 *   MonochromeToggler (theme switcher ต่างๆ ไม่เกี่ยวกับ SafePay)
 * - คงไว้: MenuToggler, NotificationDropdownPeople, ThemeDropdown,
 *   FullscreenToggler, UserDropdownDetailed
 * - UserDropdownDetailed ใช้ useSession() จาก next-auth/react ไม่ใช่ useAuth ของ Paces
 */
import useScrollEvent from '@/hooks/useScrollEvent'
import clsx from 'clsx'
import FullscreenToggler from './components/FullscreenToggler'
import MenuToggler from './components/MenuToggler'

import NotificationDropdownPeople from './components/NotificationDropdownPeople'

import ThemeDropdown from './components/ThemeDropdown'

import UserDropdownDetailed from './components/UserDropdownDetailed'

const TopBar = () => {
  const { scrollY } = useScrollEvent()

  return (
    <header className={clsx('app-header', { 'topbar-active': scrollY > 50 })}>
      <div className="container-fluid flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <MenuToggler />
        </div>
        <div className="flex items-center gap-3">
          <NotificationDropdownPeople />

          <ThemeDropdown />

          <FullscreenToggler />

          <UserDropdownDetailed />
        </div>
      </div>
    </header>
  )
}

export default TopBar
