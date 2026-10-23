// Original flat illustrations in the app's charcoal, yellow and lavender palette (no external artwork).

/** Two officials handing over a shared case file: coordination between Bureaus/Cells. */
export function CoordinationIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" className={className} role="img" aria-label="Two officials coordinating over a shared case file">
      <defs>
        <linearGradient id="ci-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbf0a0" /><stop offset="1" stopColor="#e2cd45" /></linearGradient>
        <linearGradient id="ci-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff8c9" /><stop offset="1" stopColor="#f0df6a" /></linearGradient>
        <linearGradient id="ci-c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4a4a4e" /><stop offset="1" stopColor="#1b1b1c" /></linearGradient>
      </defs>
      <ellipse cx="160" cy="166" rx="132" ry="9" fill="#000000" opacity=".22" />
      {/* left official (kneeling) */}
      <path d="M58 166c0-18 6-28 22-30l26-3c10-1 16 6 16 16v17z" fill="url(#ci-c)" />
      <path d="M70 140c-6-28 4-52 26-56 18-3 30 10 32 30l2 24-58 4z" fill="url(#ci-a)" />
      <path d="M96 92c14 2 24 10 27 22" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity=".5" fill="none" />
      <circle cx="97" cy="62" r="17" fill="#f4f1ea" />
      <path d="M80 58c0-14 10-22 22-21 10 1 16 8 15 16-7-5-17-4-24 2-4 3-9 4-13 3z" fill="url(#ci-c)" />
      <path d="M118 112c14 4 26 10 38 12" stroke="url(#ci-b)" strokeWidth="12" strokeLinecap="round" fill="none" />
      {/* shared file */}
      <g transform="rotate(-8 168 116)">
        <rect x="150" y="98" width="40" height="30" rx="5" fill="#ddd8fa" />
        <rect x="150" y="104" width="40" height="24" rx="5" fill="#b7aef0" />
        <rect x="157" y="111" width="20" height="3" rx="1.5" fill="#fff" opacity=".85" />
        <rect x="157" y="117" width="14" height="3" rx="1.5" fill="#fff" opacity=".85" />
      </g>
      {/* right official (standing) */}
      <path d="M214 166v-30c0-8 6-14 14-14h20c8 0 14 6 14 14v30z" fill="url(#ci-c)" />
      <path d="M210 128c-4-30 6-52 26-56 20-4 34 12 36 34l2 26-62 2z" fill="url(#ci-a)" />
      <path d="M216 104c-14 4-22 8-32 14" stroke="url(#ci-b)" strokeWidth="12" strokeLinecap="round" fill="none" />
      <circle cx="238" cy="48" r="17" fill="#f4f1ea" />
      <path d="M222 44c-1-13 9-22 21-21 11 1 17 9 14 19-6-6-16-7-24-2-4 3-8 4-11 4z" fill="url(#ci-c)" />
      {/* link spark between them */}
      <circle cx="170" cy="72" r="13" fill="#c9c3f2" opacity=".25" />
      <path d="M164 72a5 5 0 0 1 5-5h3m3 5a5 5 0 0 1-5 5h-3" stroke="#c9c3f2" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M150 40l3 6 6 2-6 2-3 6-3-6-6-2 6-2z" fill="#f6e77d" opacity=".85" />
      <path d="M282 92l2 4 4 1-4 1-2 4-2-4-4-1 4-1z" fill="#c9c3f2" opacity=".8" />
    </svg>
  );
}

/** Hourglass on a calendar page: prescribed timelines. */
export function DeadlineIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 190" className={className} role="img" aria-label="Hourglass and calendar">
      <defs>
        <linearGradient id="di-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbf0a0" /><stop offset="1" stopColor="#e2cd45" /></linearGradient>
        <linearGradient id="di-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbf0a0" /><stop offset="1" stopColor="#e2cd45" /></linearGradient>
      </defs>
      <ellipse cx="100" cy="178" rx="78" ry="7" fill="#000000" opacity=".22" />
      {/* calendar */}
      <rect x="26" y="40" width="112" height="112" rx="16" fill="#3a3a3e" />
      <rect x="26" y="40" width="112" height="30" rx="16" fill="url(#di-a)" />
      <rect x="26" y="56" width="112" height="14" fill="url(#di-a)" />
      <rect x="48" y="30" width="8" height="22" rx="4" fill="#c9c3f2" />
      <rect x="108" y="30" width="8" height="22" rx="4" fill="#c9c3f2" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={40 + (i % 4) * 22} y={82 + Math.floor(i / 4) * 20} width="14" height="12" rx="3"
          fill={i === 6 ? '#f6e77d' : '#ffffff'} opacity={i === 6 ? 1 : 0.14} />
      ))}
      {/* hourglass */}
      <g transform="translate(118 64)">
        <rect x="0" y="0" width="56" height="9" rx="4.5" fill="#c9c3f2" />
        <rect x="0" y="103" width="56" height="9" rx="4.5" fill="#c9c3f2" />
        <path d="M8 9h40c0 22-14 30-14 47s14 25 14 47H8c0-22 14-30 14-47S8 31 8 9z" fill="#ffffff" opacity=".14" stroke="#c9c3f2" strokeWidth="2.5" />
        <path d="M15 22h26c-2 12-9 17-13 26-4-9-11-14-13-26z" fill="url(#di-s)" />
        <path d="M28 56v30" stroke="#e2cd45" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
        <path d="M12 101c4-14 10-19 16-21 6 2 12 7 16 21z" fill="url(#di-s)" />
      </g>
      <path d="M170 34l2.5 5 5 2-5 2-2.5 5-2.5-5-5-2 5-2z" fill="#f6e77d" opacity=".85" />
    </svg>
  );
}
