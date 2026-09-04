interface Props {
  size?: number;
  label?: string;
}

export function HakiLoader({ size = 80, label }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 460" width={size} height={size}>
        <defs>
          <radialGradient id="haki-goldCircle" cx="38%" cy="32%" r="68%">
            <stop offset="0%"   stopColor="#FFE066"/>
            <stop offset="35%"  stopColor="#C8940A"/>
            <stop offset="100%" stopColor="#5C3A00"/>
          </radialGradient>
          <radialGradient id="haki-shine" cx="36%" cy="26%" r="42%">
            <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="haki-borderGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#FFE680"/>
            <stop offset="100%" stopColor="#7A5200"/>
          </linearGradient>
          <filter id="haki-shadow">
            <feDropShadow dx="0" dy="5" stdDeviation="10" floodColor="#00000050"/>
          </filter>
        </defs>

        <style>{`
          .haki-pulse {
            animation: haki-pulse 1.6s ease-in-out infinite;
            transform-origin: 250px 185px;
          }
          @keyframes haki-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50%       { transform: scale(1.045); opacity: 0.92; }
          }
          .haki-ring {
            animation: haki-spin 1.8s linear infinite;
            transform-origin: 250px 185px;
          }
          @keyframes haki-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>

        <circle className="haki-ring" cx="250" cy="185" r="185" fill="none"
                stroke="#C8940A" strokeWidth="4" strokeLinecap="round"
                strokeDasharray="60 220"/>

        <g className="haki-pulse">
          <circle cx="250" cy="185" r="160" fill="url(#haki-goldCircle)" filter="url(#haki-shadow)"/>
          <circle cx="250" cy="185" r="160" fill="none" stroke="url(#haki-borderGold)" strokeWidth="3.5"/>
          <circle cx="250" cy="185" r="160" fill="url(#haki-shine)"/>
          <rect x="132" y="111" width="20" height="148" rx="10" fill="white"/>
          <rect x="162" y="111" width="20" height="148" rx="10" fill="white"/>
          <rect x="200" y="165" width="100" height="20" rx="10" fill="white"/>
          <rect x="318" y="111" width="20" height="148" rx="10" fill="white"/>
          <rect x="348" y="111" width="20" height="148" rx="10" fill="white"/>
        </g>
      </svg>
      {label && <p className="text-sm text-zinc-400">{label}</p>}
    </div>
  );
}
