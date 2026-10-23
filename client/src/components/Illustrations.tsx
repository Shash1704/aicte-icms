// Original artwork in the app's cream, sand, terracotta and sea palette (no external images).

const v = (name: string) => ({ fill: `var(${name})` });

/** Full-screen painted dusk seascape behind the app panel. Colors come from theme tokens. */
export function Seascape() {
  return (
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--sky-1)' }} />
          <stop offset=".5" style={{ stopColor: 'var(--sky-2)' }} />
          <stop offset=".7" style={{ stopColor: 'var(--sky-3)' }} />
        </linearGradient>
        <linearGradient id="sc-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--sea-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--sea-2)' }} />
        </linearGradient>
        <radialGradient id="sc-sun" cx=".5" cy=".5" r=".5">
          <stop offset="0" style={{ stopColor: 'var(--sky-3)', stopOpacity: 0.95 }} />
          <stop offset="1" style={{ stopColor: 'var(--sky-3)', stopOpacity: 0 }} />
        </radialGradient>
        <filter id="sc-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id="sc-soft"><feGaussianBlur stdDeviation="2.2" /></filter>
      </defs>
      <rect width="1440" height="900" fill="url(#sc-sky)" />
      <circle cx="1060" cy="600" r="380" fill="url(#sc-sun)" />
      {/* cloud streaks */}
      <g filter="url(#sc-blur)" opacity=".5">
        <ellipse cx="340" cy="150" rx="420" ry="26" fill="#ffffff" opacity=".35" />
        <ellipse cx="980" cy="110" rx="520" ry="22" fill="#ffffff" opacity=".28" />
        <ellipse cx="760" cy="250" rx="380" ry="18" fill="#ffffff" opacity=".25" />
        <ellipse cx="200" cy="330" rx="300" ry="14" fill="#ffffff" opacity=".2" />
      </g>
      {/* mountains */}
      <path d="M0 520c80-30 150-80 230-70 70 8 110 60 190 70 60 8 110-14 160-6l40 128H0z" style={v('--mtn-1')} opacity=".85" />
      <path d="M0 470c50-10 90-40 140-34 60 8 90 70 150 96 50 22 110 30 150 108H0z" style={v('--mtn-2')} />
      <path d="M1440 560c-70-40-120-90-190-84-60 6-90 50-150 64-50 12-90 4-130 22l-30 78h500z" style={v('--mtn-1')} opacity=".9" />
      <path d="M1440 520c-40 4-80 30-120 60-40 30-90 40-120 60h240z" style={v('--mtn-2')} opacity=".9" />
      {/* sea */}
      <rect y="640" width="1440" height="260" fill="url(#sc-sea)" />
      <rect y="639" width="1440" height="2" style={v('--foam')} opacity=".35" />
      <g stroke="var(--foam)" strokeLinecap="round" fill="none" opacity=".35">
        <path d="M120 690h220M520 676h160M900 702h260M1220 684h150" strokeWidth="2" />
        <path d="M60 740h300M640 728h220M1040 752h300" strokeWidth="2.5" opacity=".7" />
      </g>
      {/* breaking wave */}
      <path d="M380 860c120-50 260-92 420-96 120-3 200 30 270 76 40 26 90 34 140 30v30H380z" style={v('--sea-2')} opacity=".9" />
      <path d="M760 790c60-20 140-22 200 8 40 20 70 54 120 66" stroke="var(--foam)" strokeWidth="10" strokeLinecap="round" fill="none" filter="url(#sc-soft)" opacity=".85" />
      <path d="M700 812c80-26 170-28 240 6" stroke="var(--foam)" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".5" />
      <path d="M980 806c30 10 60 30 90 54" stroke="var(--foam)" strokeWidth="16" strokeLinecap="round" fill="none" filter="url(#sc-blur)" opacity=".6" />
    </svg>
  );
}

/** Thin radiating lines, like the reference's small sun mark. */
export function Sunburst({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const r1 = i % 2 ? 8 : 4;
        return <line key={i} x1={24 + Math.cos(a) * r1} y1={24 + Math.sin(a) * r1} x2={24 + Math.cos(a) * 22} y2={24 + Math.sin(a) * 22} />;
      })}
    </svg>
  );
}

/** Hourglass on a calendar page: prescribed timelines. */
export function DeadlineIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 190" className={className} role="img" aria-label="Hourglass and calendar">
      <defs>
        <linearGradient id="di-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f0b27a" /><stop offset="1" stopColor="#c0612a" /></linearGradient>
      </defs>
      <ellipse cx="100" cy="178" rx="78" ry="7" fill="#1f1e1b" opacity=".12" />
      {/* calendar */}
      <rect x="26" y="40" width="112" height="112" rx="16" fill="#3e5955" />
      <rect x="26" y="40" width="112" height="30" rx="16" fill="url(#di-a)" />
      <rect x="26" y="56" width="112" height="14" fill="url(#di-a)" />
      <rect x="48" y="30" width="8" height="22" rx="4" fill="#ddd0b8" />
      <rect x="108" y="30" width="8" height="22" rx="4" fill="#ddd0b8" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={40 + (i % 4) * 22} y={82 + Math.floor(i / 4) * 20} width="14" height="12" rx="3"
          fill={i === 6 ? '#f0b27a' : '#ffffff'} opacity={i === 6 ? 1 : 0.16} />
      ))}
      {/* hourglass */}
      <g transform="translate(118 64)">
        <rect x="0" y="0" width="56" height="9" rx="4.5" fill="#ddd0b8" />
        <rect x="0" y="103" width="56" height="9" rx="4.5" fill="#ddd0b8" />
        <path d="M8 9h40c0 22-14 30-14 47s14 25 14 47H8c0-22 14-30 14-47S8 31 8 9z" fill="#f5f2ec" opacity=".55" stroke="#8a7a62" strokeWidth="2" />
        <path d="M15 22h26c-2 12-9 17-13 26-4-9-11-14-13-26z" fill="url(#di-a)" />
        <path d="M28 56v30" stroke="#c0612a" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
        <path d="M12 101c4-14 10-19 16-21 6 2 12 7 16 21z" fill="url(#di-a)" />
      </g>
    </svg>
  );
}
