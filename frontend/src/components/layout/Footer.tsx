import { AUTHOR, AUTHOR_URL, REPO_URL } from "@/components/ui/links";

const link =
  "inline-flex items-center min-h-11 text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink-3 rounded-sm";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div
        className="max-w-[1240px] mx-auto px-5 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-x-6 text-[13px] text-ink-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <p>
          Built by{" "}
          <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className={link}>
            {AUTHOR}
          </a>
          <span aria-hidden="true"> · </span>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={link}>
            Source on GitHub
          </a>
        </p>
        <p className="py-2 sm:py-0">A personal project. Visa info is guidance, not legal advice.</p>
      </div>
    </footer>
  );
}

/** Compact credit for the end of the dashboard. */
export function Credit() {
  return (
    <p className="px-5 py-5 text-[12px] text-ink-3 leading-relaxed">
      Built by{" "}
      <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
        {AUTHOR}
      </a>
      <span aria-hidden="true"> · </span>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
        GitHub
      </a>
    </p>
  );
}
