'use client'

// React Imports
import { useState } from 'react'
import type { SyntheticEvent } from 'react'

// MUI Imports
import Tab from '@mui/material/Tab'
import TabContext from '@mui/lab/TabContext'

// Component Imports
import CustomTabList from '@core/components/mui/TabList'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/index.tsx
// (Tab + TabContext + CustomTabList pattern ของหน้านี้เอง)
// Adapted: ตัด TabPanel/content-switch ออก — เป็น anchor-scroll nav (section render อยู่ทุกอันอยู่แล้วใน DOM, ไม่สลับ)
// ไม่ใส่ pill='true' ให้ CustomTabList → fallback เป็น underline ธรรมดาของ MUI Tabs (minimal ตาม spec ไม่ใช่ pill)
// คลิก = scrollIntoView ไป section id ตรงกัน ไม่เปลี่ยน route/URL

export type ProfileTabItem = { id: string; label: string }

const ProfileTabsNav = ({ items }: { items: ProfileTabItem[] }) => {
  const [activeTab, setActiveTab] = useState<string>(items[0]?.id ?? '')

  if (items.length === 0) return null

  const handleChange = (_event: SyntheticEvent, value: string) => {
    setActiveTab(value)
    document.getElementById(value)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <TabContext value={activeTab}>
      <CustomTabList onChange={handleChange} variant='scrollable' scrollButtons='auto'>
        {items.map((item) => (
          <Tab key={item.id} label={item.label} value={item.id} />
        ))}
      </CustomTabList>
    </TabContext>
  )
}

export default ProfileTabsNav
