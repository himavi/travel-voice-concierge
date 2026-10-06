/** Brand mark: a lit core inside a listening ring (same as the favicon). */
export function AriaMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="13" fill="none" stroke="var(--accent)" strokeOpacity="0.45" strokeWidth="1.3" />
      <circle cx="16" cy="16" r="7" fill="var(--accent)" />
    </svg>
  );
}
