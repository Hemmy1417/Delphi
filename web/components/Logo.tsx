// Delphi mark — an oracle's eye / aperture: a circle holding a vertical vesica with a
// pupil at the omphalos. Monochrome, drawn with currentColor (white on black).
export function DelphiMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.3" />
      <path d="M16 5 Q22.5 16 16 27 Q9.5 16 16 5 Z" stroke="currentColor" strokeWidth="1.1" fill="none" />
      <circle cx="16" cy="16" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function DelphiWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-ink ${className}`}>
      <DelphiMark size={24} />
      <span className="wordmark text-[1.05rem]">Delphi</span>
    </span>
  );
}
