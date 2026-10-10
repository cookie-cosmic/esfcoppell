import type { SVGProps } from 'react';

const I = (path: React.ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        {path}
      </svg>
    );
  };

export const IconHeart = I(<path d="M19 14c1.5-1.5 2-3.2 2-4.5A4.5 4.5 0 0 0 12 6.5 4.5 4.5 0 0 0 3 9.5c0 1.3.5 3 2 4.5l7 6.5z" />);
export const IconHands = I(<><path d="M11 12V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 10.5V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M17 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.6a7 7 0 0 1-5.7-2.9L3 14.2a1.6 1.6 0 0 1 2.6-1.9L8 15V6a1.5 1.5 0 0 1 3 0v6" /></>);
export const IconStar = I(<path d="m12 3 2.7 5.6 6.3.9-4.5 4.3 1 6.2-5.5-3-5.5 3 1-6.2L3 9.5l6.3-.9z" />);
export const IconMedal = I(<><circle cx="12" cy="15" r="5" /><path d="M9 10.5 6 3m9 7.5L18 3M9.5 15l1.5 1.5L14.5 13" /></>);
export const IconCalendar = I(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></>);
export const IconPin = I(<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>);
export const IconClock = I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconUsers = I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5a3.5 3.5 0 0 1 0 7m5.5 8a6.5 6.5 0 0 0-4.5-6.2" /></>);
export const IconMail = I(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>);
export const IconUpload = I(<><path d="M12 16V4m0 0 4 4m-4-4L8 8" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>);
export const IconCheck = I(<path d="m4 12.5 5 5L20 6.5" />);
export const IconX = I(<path d="M6 6l12 12M18 6 6 18" />);
export const IconEdit = I(<><path d="M4 20h4L20 8l-4-4L4 16z" /><path d="m14 6 4 4" /></>);
export const IconTrash = I(<><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" /></>);
export const IconSearch = I(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconPlus = I(<path d="M12 5v14M5 12h14" />);
export const IconMenu = I(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconImage = I(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m4 19 6-6 4 4 3-3 3 3" /></>);
export const IconSettings = I(<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2" /></>);
export const IconShield = I(<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>);
export const IconFile = I(<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>);
export const IconList = I(<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />);
export const IconLogout = I(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5m5 5H9" /></>);
export const IconEye = I(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7" /><circle cx="12" cy="12" r="3" /></>);
export const IconCamera = I(<><path d="M4 8h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="3.5" /></>);
export const IconHome = I(<><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></>);
export const IconChart = I(<path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />);
export const IconChevron = I(<path d="m9 6 6 6-6 6" />);
export const IconArrow = I(<path d="M5 12h14m0 0-6-6m6 6-6 6" />);
export const IconSparkle = I(<><path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18m0-12-2.5 2.5m-7 7L6 18" /></>);

/** Three-smiling-figures brand mark (traced from the foundation logo). */
export function SmileMark({ size = 42, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  const g = (color: string, transform?: string) => (
    <g transform={transform}>
      <circle cx="46" cy="22" r="8" fill={color} stroke="none" />
      <circle cx="74" cy="22" r="8" fill={color} stroke="none" />
      <path d="M33 37 Q60 66 87 37" stroke={color} strokeWidth="11" fill="none" strokeLinecap="round" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Endless Smiles Foundation logo" {...rest}>
      {g('#4BA3E3')}
      {g('#EF0A71', 'rotate(120 60 60)')}
      {g('#F0822F', 'rotate(240 60 60)')}
    </svg>
  );
}

export const IconChevronLeft = I(<path d="m15 6-6 6 6 6" />);
