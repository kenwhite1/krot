// Эмблема «Крота»: дружелюбный крот-сыщик в шляпе с лупой. Свой вектор, без
// заимствований. Тёплая ламповая палитра в тон семейству.
import { t } from '../i18n'

export function Logo({ size = 132 }: { size?: number }) {
  return (
    <svg className="brand-logo" width={size} height={size} viewBox="0 0 132 132" fill="none" role="img" aria-label={t('Крот')}>
      <defs>
        <radialGradient id="kl-fur" cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#7d654c" />
          <stop offset="60%" stopColor="#624d39" />
          <stop offset="100%" stopColor="#47372a" />
        </radialGradient>
        <linearGradient id="kl-snout" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e7c79b" />
          <stop offset="100%" stopColor="#cfa978" />
        </linearGradient>
        <linearGradient id="kl-hat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f4951" />
          <stop offset="100%" stopColor="#1c3138" />
        </linearGradient>
        <radialGradient id="kl-glass" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#e7f6f2" />
          <stop offset="55%" stopColor="#bfe6df" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#8fc9c0" stopOpacity="0.35" />
        </radialGradient>
        <linearGradient id="kl-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4cf86" />
          <stop offset="100%" stopColor="#c5841c" />
        </linearGradient>
      </defs>

      {/* soft ground shadow */}
      <ellipse cx="62" cy="118" rx="34" ry="7" fill="#3a2c1d" opacity="0.18" />

      {/* head */}
      <circle cx="60" cy="64" r="38" fill="url(#kl-fur)" />
      {/* ears */}
      <circle cx="30" cy="40" r="9" fill="#5a4634" />
      <circle cx="90" cy="40" r="9" fill="#5a4634" />

      {/* little digging paws */}
      <ellipse cx="34" cy="96" rx="11" ry="8" fill="#5a4634" transform="rotate(-18 34 96)" />
      <ellipse cx="86" cy="96" rx="11" ry="8" fill="#5a4634" transform="rotate(18 86 96)" />

      {/* snout */}
      <ellipse cx="60" cy="74" rx="22" ry="18" fill="url(#kl-snout)" />
      {/* nose */}
      <ellipse cx="60" cy="68" rx="7.5" ry="6" fill="#d8453f" />
      <ellipse cx="57.5" cy="66" rx="2.4" ry="1.8" fill="#ef9a8f" opacity="0.85" />
      {/* shy smile */}
      <path d="M52 80 Q60 86 68 80" stroke="#9c7a52" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      {/* eyes (content squint) */}
      <path d="M44 58 Q49 54 54 58" stroke="#2c2018" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M70 58 Q75 54 80 58" stroke="#2c2018" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* detective hat */}
      <ellipse cx="60" cy="34" rx="40" ry="11" fill="url(#kl-hat)" />
      <path d="M34 34 Q36 12 60 11 Q84 12 86 34 Z" fill="url(#kl-hat)" />
      <rect x="34" y="29" width="52" height="8" rx="4" fill="#d8453f" />
      <ellipse cx="60" cy="34" rx="40" ry="11" fill="none" stroke="#0f2127" strokeWidth="1.4" opacity="0.5" />

      {/* magnifier (soft halo lifts it off the fur so it reads as held in front) */}
      <circle cx="101" cy="88" r="22" fill="#160f06" opacity="0.22" />
      <g transform="rotate(12 100 98)">
        <rect x="96" y="98" width="9" height="30" rx="4.5" fill="url(#kl-brass)" stroke="#a86a10" strokeWidth="1" />
      </g>
      <circle cx="100" cy="86" r="18" fill="url(#kl-glass)" />
      <circle cx="100" cy="86" r="18" fill="none" stroke="url(#kl-brass)" strokeWidth="6" />
      <circle cx="100" cy="86" r="18" fill="none" stroke="#a86a10" strokeWidth="1" opacity="0.6" />
      <path d="M92 80 Q96 76 102 78" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.7" />
    </svg>
  )
}
