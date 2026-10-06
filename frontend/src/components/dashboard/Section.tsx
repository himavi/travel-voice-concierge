import { useId } from "react";
import clsx from "clsx";

interface Props {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** One dashboard block: a quiet heading row and content, divided by hairlines (no nested cards). */
export function Section({ title, meta, children, className }: Props) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={clsx("px-5 py-5 border-b border-line", className)}>
      <div className="flex items-center justify-between gap-3 mb-4 min-h-6">
        <h2 id={id} className="text-[13px] font-semibold text-ink-2 tracking-[0.01em]">{title}</h2>
        {meta}
      </div>
      {children}
    </section>
  );
}
