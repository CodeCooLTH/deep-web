// MUI Imports
import Box from '@mui/material/Box'

// Component Imports
import UserProfileHeader from './UserProfileHeader'
import type { ProfileHeaderData } from './UserProfileHeader'
import ProfileTab from './profile'
import type { ProfileTabData } from './profile'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/index.tsx
// Adapted: ตัด Tabs wrapper ออก (มีแท็บเดียว — ไม่ต้องการ TabContext + CustomTabList)
// Rework: เปลี่ยนจาก Grid 2-คอลัมน์ → การ์ดเดียว max-width 640px ตาม mockup_shop_profile.html (D7 approved)
// โครง: Box การ์ดเดียว ครอบ Header + ProfileTab ไล่ลงตาม mockup
const UserProfile = ({
  profileHeader,
  profileTab,
}: {
  profileHeader: ProfileHeaderData
  profileTab: ProfileTabData
}) => {
  return (
    <Box
      sx={{
        maxWidth: 640,
        mx: 'auto',
        bgcolor: 'background.paper',
        borderRadius: '24px',
        overflow: 'hidden',
        position: 'relative',
        // เงาตาม mockup --shadow-xl
        boxShadow: '0 25px 70px rgba(15,23,42,.18), 0 8px 16px rgba(15,23,42,.08)',
      }}
    >
      {/* Header: trust banner + x-header + identity — render ภายในการ์ดเดียว */}
      <UserProfileHeader data={profileHeader} />

      {/* Tab content: platforms + stats + achievements + products — ต่อเนื่องไม่มี Card ซ้อน */}
      <ProfileTab data={profileTab} />
    </Box>
  )
}

export default UserProfile
