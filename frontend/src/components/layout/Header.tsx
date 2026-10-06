"use client";

import { Check, Copy, Github, RotateCcw } from "lucide-react";
import { AriaMark } from "./AriaMark";
import { REPO_URL } from "@/components/ui/links";

interface Props {
  started: boolean;
  onNewSession?: () => void;
  onCopyTranscript?: () => void;
  canCopy?: boolean;
  copied?: boolean;
}

export function Header({ started, onNewSession, onCopyTranscript, canCopy, copied }: Props) {
  return (
    <header className="relative z-20 flex-shrink-0 border-b border-line">
      <div className="flex items-center justify-between gap-3 h-14 sm:h-16 px-3 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 min-h-11 px-1 rounded-md min-w-0">
          <AriaMark size={26} />
          <span className="font-serif text-[23px] leading-none text-ink tracking-[-0.01em]">Aria</span>
          <span className="hidden sm:inline text-[13px] text-ink-3 pl-3 ml-1 border-l border-line truncate">
            AI travel &amp; visa concierge
          </span>
        </a>

        <nav aria-label="Session and project" className="flex items-center gap-0.5 sm:gap-1">
          {started && onCopyTranscript && (
            <button
              type="button"
              onClick={onCopyTranscript}
              disabled={!canCopy}
              className="icon-btn"
              aria-label={copied ? "Transcript copied" : "Copy transcript"}
              title={copied ? "Copied" : "Copy transcript"}
            >
              {copied ? <Check className="w-[18px] h-[18px] text-ok" aria-hidden="true" /> : <Copy className="w-[18px] h-[18px]" aria-hidden="true" />}
            </button>
          )}
          {started && onNewSession && (
            <button type="button" onClick={onNewSession} className="btn btn-ghost min-w-11 !px-2.5 sm:!px-3" title="Start a new session">
              <RotateCcw className="w-[18px] h-[18px]" aria-hidden="true" />
              <span className="hidden sm:inline">New session</span>
              <span className="sr-only sm:hidden">New session</span>
            </button>
          )}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-btn"
            aria-label="Source code on GitHub (opens in a new tab)"
            title="Source on GitHub"
          >
            <Github className="w-[18px] h-[18px]" aria-hidden="true" />
          </a>
        </nav>
      </div>
    </header>
  );
}
