import { STATUS_META } from "@/lib/config";

const TONE_DOT: Record<string, string> = {
  active: "bg-ink",
  neutral: "bg-muted",
  good: "bg-success",
  warn: "bg-warning",
};
const TONE_TEXT: Record<string, string> = {
  active: "text-ink",
  neutral: "text-muted",
  good: "text-success",
  warn: "text-warning",
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span className={`inline-flex items-center gap-2 mono uppercase tracking-[0.18em] text-[0.65rem] ${TONE_TEXT[meta.tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone]}`} />
      {meta.label}
    </span>
  );
}
