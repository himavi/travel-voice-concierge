"use client";

import clsx from "clsx";

interface Props {
  label: string;
  value: string | null | undefined;
}

/**
 * One row of the travel profile. When a value arrives (or changes) the row
 * gets a brief accent wash — the only motion here, and it marks "just captured".
 */
export function ProfileField({ label, value }: Props) {
  const filled = !!value;
  return (
    <div
      key={value ?? "empty"}
      className={clsx(
        "flex items-baseline justify-between gap-4 py-2.5 border-b border-line last:border-b-0",
        filled && "captured",
      )}
    >
      <dt className="text-[13px] text-ink-3 flex-shrink-0">{label}</dt>
      <dd className={clsx("text-[14px] text-right min-w-0 break-words", filled ? "text-ink font-medium" : "text-ink-3")}>
        {filled ? value : (<><span aria-hidden="true">—</span><span className="sr-only">not captured yet</span></>)}
      </dd>
    </div>
  );
}
