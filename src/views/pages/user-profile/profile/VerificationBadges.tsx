// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

type VerifyItem = {
  level: number
  label: string
  icon: string
  active: boolean
}

// Base: composed from Vuexy account-settings card primitives + UserProfileHeader icon patterns
// Since theme user-profile has no direct "verification badges" widget, we reuse the
// Card + icon-row pattern from AboutOverview to stay consistent with the profile tab.
const VerificationBadges = ({ items }: { items: VerifyItem[] }) => {
  return (
    <Card>
      <CardContent className='flex flex-col gap-4'>
        <Typography variant='body2' color='text.disabled'>
          การยืนยันตัวตน
        </Typography>
        <div className='flex flex-col sm:flex-row sm:flex-wrap gap-3'>
          {items.map((item) => (
            <div
              key={item.level}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border w-full sm:w-auto ${
                item.active
                  ? 'border-[var(--mui-palette-success-main)] bg-[var(--mui-palette-success-lightOpacity)]'
                  : 'border-[var(--mui-palette-divider)] opacity-60'
              }`}
            >
              <i
                className={`${item.icon} text-2xl ${
                  item.active
                    ? 'text-[var(--mui-palette-success-main)]'
                    : 'text-[var(--mui-palette-text-disabled)]'
                }`}
              />
              <div>
                <Typography className='text-xs' color='text.secondary'>
                  ระดับ {item.level}
                </Typography>
                <Typography className='text-sm font-medium'>{item.label}</Typography>
              </div>
              {item.active && (
                <i className='tabler-check text-lg text-[var(--mui-palette-success-main)] ms-2' />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default VerificationBadges
