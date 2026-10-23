// Color follows the entity, never its rank: each Bureau/Cell keeps one hue everywhere.
export const BUREAU_ORDER = ['RB', 'PGRC', 'AB', 'ARC', 'FB', 'PAPB', 'RO'];
export const bureauColor = (code?: string | null) => {
  const i = BUREAU_ORDER.indexOf(code || '');
  return i >= 0 ? `var(--s${i + 1})` : 'var(--muted)';
};

export const STATUS_COLOR: Record<string, string> = {
  Pending: 'var(--warning)',
  'Under Process': 'var(--s1)',
  Transferred: 'var(--s7)',
  Escalated: 'var(--critical)',
  Disposed: 'var(--good)',
};

export const AGE_COLORS = ['var(--q1)', 'var(--q2)', 'var(--q3)', 'var(--q4)', 'var(--q5)'];
