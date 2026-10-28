/** Line icons from the brand board: Movement, Connection, Harmony, Progress. */
const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const };

export function IconMovement({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="20" cy="20" r="13" {...common} />
      <circle cx="29.5" cy="11" r="2.6" fill="currentColor" />
      <path d="M11 24 A10 10 0 0 0 26 27" {...common} opacity={0.5} />
    </svg>
  );
}
export function IconConnection({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="20" cy="11" r="5" {...common} />
      <circle cx="11" cy="27" r="5" {...common} />
      <circle cx="29" cy="27" r="5" {...common} />
      <path d="M17.5 15.5 L13.5 22.5 M22.5 15.5 L26.5 22.5 M16 27 H24" {...common} />
    </svg>
  );
}
export function IconHarmony({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="15" cy="20" r="10" {...common} />
      <circle cx="25" cy="20" r="10" {...common} />
      <path d="M20 11.5 C 23 15, 23 25, 20 28.5 C 17 25, 17 15, 20 11.5 Z" {...common} opacity={0.6} />
    </svg>
  );
}
export function IconProgress({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="20" cy="20" r="14" {...common} />
      <circle cx="20" cy="20" r="9" {...common} />
      <circle cx="20" cy="20" r="4" {...common} />
    </svg>
  );
}
