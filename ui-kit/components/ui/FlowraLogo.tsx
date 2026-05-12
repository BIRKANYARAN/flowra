'use client'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
}

const SIZES = {
  sm: { icon: 'w-7 h-7', text: 'text-sm', sub: 'text-[10px]' },
  md: { icon: 'w-8 h-8', text: 'text-sm', sub: 'text-xs' },
  lg: { icon: 'w-10 h-10', text: 'text-lg', sub: 'text-xs' },
}

export function FlowraLogo({ size = 'md', showText = true }: Props) {
  const s = SIZES[size]

  return (
    <div className="flex items-center gap-2.5">
      <div className={`${s.icon} rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center flex-shrink-0 shadow-sm`}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="w-[60%] h-[60%]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9c1.66 0 3.22-.45 4.56-1.24l-1.46-1.46A6.97 6.97 0 0112 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7c0 1.05-.23 2.05-.65 2.95l1.52 1.52A8.96 8.96 0 0021 12c0-4.97-4.03-9-9-9z"
            fill="white"
            opacity="0.9"
          />
          <circle cx="12" cy="12" r="3" fill="white" />
        </svg>
      </div>
      {showText && (
        <div className="min-w-0">
          <div className={`font-black ${s.text} leading-tight tracking-tight bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent`}>
            Flowra
          </div>
          <div className={`${s.sub} text-gray-400 font-medium`}>ERP</div>
        </div>
      )}
    </div>
  )
}
