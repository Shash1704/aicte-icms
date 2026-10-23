// Original monochrome artwork (no external images): soft greys with one charcoal shape.

/** Two case files from different Bureaus overlapping on one college: used in the dashboard banner. */
export function OverlapIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} role="img" aria-label="Two case files overlapping on one college">
      <defs>
        <linearGradient id="oi-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dcdce1" /></linearGradient>
        <linearGradient id="oi-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5a5a5f" /><stop offset="1" stopColor="#1d1d1f" /></linearGradient>
        <filter id="oi-s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#1d1d1f" floodOpacity=".22" /></filter>
      </defs>
      <circle cx="150" cy="78" r="66" fill="url(#oi-b)" />
      <circle cx="58" cy="34" r="16" fill="#b8b8be" opacity=".7" />
      <circle cx="214" cy="126" r="9" fill="#b8b8be" opacity=".6" />
      {/* back file */}
      <g filter="url(#oi-s)" transform="rotate(-10 120 80)">
        <rect x="86" y="44" width="78" height="96" rx="12" fill="url(#oi-a)" />
        <rect x="98" y="62" width="40" height="6" rx="3" fill="#1d1d1f" opacity=".7" />
        <rect x="98" y="76" width="52" height="5" rx="2.5" fill="#1d1d1f" opacity=".18" />
        <rect x="98" y="88" width="46" height="5" rx="2.5" fill="#1d1d1f" opacity=".18" />
      </g>
      {/* front file */}
      <g filter="url(#oi-s)" transform="rotate(8 170 90)">
        <rect x="132" y="50" width="78" height="96" rx="12" fill="url(#oi-a)" />
        <rect x="144" y="68" width="40" height="6" rx="3" fill="#1d1d1f" opacity=".7" />
        <rect x="144" y="82" width="52" height="5" rx="2.5" fill="#1d1d1f" opacity=".18" />
        <rect x="144" y="94" width="46" height="5" rx="2.5" fill="#1d1d1f" opacity=".18" />
        {/* overlap mark */}
        <circle cx="163" cy="124" r="10" fill="none" stroke="#1d1d1f" strokeWidth="3" />
        <circle cx="177" cy="124" r="10" fill="none" stroke="#1d1d1f" strokeWidth="3" opacity=".35" />
      </g>
    </svg>
  );
}

/** Small paper-plane and clouds for the sidebar's "new complaint" card. */
export function SendIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden>
      <defs>
        <linearGradient id="si-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#c9c9cf" /></linearGradient>
      </defs>
      <path d="M22 86c0-9 8-15 16-13 2-9 14-13 21-6 7-3 15 3 14 11H22z" fill="#ffffff" opacity=".9" />
      <path d="M112 34c0-6 5-10 11-9 2-6 10-8 14-3 5-2 10 2 9 7h-34z" fill="#ffffff" opacity=".55" />
      <path d="M40 60l96-38-30 72-20-24z" fill="url(#si-a)" />
      <path d="M86 70l50-48-56 42z" fill="#8e8e93" />
      <path d="M86 70l-2 22 12-12z" fill="#6e6e73" />
      <path d="M30 98c20-4 34-12 48-26" stroke="#ffffff" strokeWidth="2" strokeDasharray="3 6" strokeLinecap="round" fill="none" opacity=".6" />
    </svg>
  );
}
