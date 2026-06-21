// Фон игры: полутёмный салон. Над столом качается лампа и роняет тёплый конус
// света, по краям ложится нуар-вигнетка, в луче плавает пыль. Та же техника
// кинематографичного света, что у сцен соседних игр семейства.
export function LoungeScene() {
  return (
    <svg className="loungescene" viewBox="0 0 375 720" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="ls-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#26404a" />
          <stop offset="48%" stopColor="#182a32" />
          <stop offset="100%" stopColor="#0d191e" />
        </linearGradient>
        <radialGradient id="ls-cone" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="#f5d795" stopOpacity="0.55" />
          <stop offset="38%" stopColor="#f0c878" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#f0c878" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ls-bulb" cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor="#fff6df" />
          <stop offset="60%" stopColor="#f6dc9a" />
          <stop offset="100%" stopColor="#e7b85f" />
        </radialGradient>
        <radialGradient id="ls-table" cx="50%" cy="40%" r="62%">
          <stop offset="0%" stopColor="#3a5a5f" />
          <stop offset="70%" stopColor="#22383d" />
          <stop offset="100%" stopColor="#162a2e" />
        </radialGradient>
        <radialGradient id="ls-vign" cx="50%" cy="40%" r="72%">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="66%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>

      {/* room */}
      <rect x="0" y="0" width="375" height="720" fill="url(#ls-room)" />

      {/* noir blinds on the back wall */}
      <g opacity="0.06" stroke="#bfe6df" strokeWidth="3">
        {BLINDS.map((y, i) => (
          <line key={i} x1="232" y1={y} x2="375" y2={y - 26} />
        ))}
      </g>

      {/* hanging lamp: cord, shade, bulb AND the warm cone live in one group with
          one pivot, so the beam stays welded to the lamp as it sways */}
      <g className="ls-lamp">
        {/* warm light cone (drawn first, behind the lamp body) */}
        <path d="M187 96 L86 470 L288 470 Z" fill="url(#ls-cone)" className="ls-glow" />
        <line x1="187" y1="0" x2="187" y2="70" stroke="#0c1519" strokeWidth="3" />
        <path d="M167 70 L207 70 L199 96 L175 96 Z" fill="#1a2a30" stroke="#0c1519" strokeWidth="1.5" />
        <ellipse cx="187" cy="96" rx="12" ry="4" fill="#0c1519" />
        <circle cx="187" cy="100" r="7" fill="url(#ls-bulb)" className="ls-glow" />
      </g>

      {/* table catching the light */}
      <ellipse cx="187" cy="470" rx="170" ry="58" fill="url(#ls-table)" />
      <ellipse cx="187" cy="470" rx="170" ry="58" fill="none" stroke="#4a6f73" strokeWidth="1.5" opacity="0.4" />
      <ellipse cx="187" cy="464" rx="120" ry="34" fill="#f5d795" opacity="0.07" />

      {/* dust motes drifting in the beam, each on its own staggered float */}
      <g fill="#f5e3b0">
        {MOTES.map((m, i) => (
          <circle key={i} cx={m[0]} cy={m[1]} r={m[2]} opacity={m[3]} className="ls-mote"
            style={{ ['--td' as never]: `${(i % 5) * 1.3}s` }} />
        ))}
      </g>

      {/* vignette */}
      <rect x="0" y="0" width="375" height="720" fill="url(#ls-vign)" />
    </svg>
  )
}

const BLINDS = [120, 150, 180, 210, 240, 270, 300]
const MOTES: [number, number, number, number][] = [
  [150, 200, 1.6, 0.5], [210, 250, 1.2, 0.4], [180, 320, 1.8, 0.55], [140, 360, 1.1, 0.35],
  [225, 380, 1.4, 0.45], [165, 280, 1.0, 0.4], [200, 420, 1.5, 0.5], [120, 300, 1.2, 0.3],
]
