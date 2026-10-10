/** Display helpers + medal math (client mirror of server rules). */

export const fmtDate = (iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions) => {
  if (!iso) return 'Date TBD';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', opts ?? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export const fmtDateTime = (iso: string | null | undefined) => (iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : 'Date TBD');

export const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  declined: 'Declined',
  correction_requested: 'Correction requested',
};

export const LEVEL_LABEL: Record<string, string> = {
  elementary: 'Elementary School',
  middle: 'Middle School',
  high: 'High School',
};

export interface MedalReqs {
  silver: number;
  gold: number;
}

export function medalProgress(total: number, reqs: MedalReqs) {
  const pct = (v: number, target: number) => Math.min(100, Math.round((v / target) * 1000) / 10);
  return {
    silver: {
      target: reqs.silver,
      hours: Math.min(total, reqs.silver),
      remaining: Math.max(0, round2(reqs.silver - total)),
      percent: pct(total, reqs.silver),
      complete: total >= reqs.silver,
    },
    gold: {
      target: reqs.gold,
      hours: Math.min(total, reqs.gold),
      remaining: Math.max(0, round2(reqs.gold - total)),
      percent: pct(total, reqs.gold),
      complete: total >= reqs.gold,
    },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const AVATAR_COLORS = ['#c8102e', '#4ba3e3', '#ef0a71', '#f0822f', '#1d9e6c', '#5b5bd6'];
export const colorFor = (seed: string) => AVATAR_COLORS[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
