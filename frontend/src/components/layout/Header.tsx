"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, WifiOff, MoreVertical, RotateCcw, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

interface Props {
  started: boolean;
  isConnected: boolean;
  showTranscript: boolean;
  onToggleTranscript: () => void;
}

export function Header({ started, isConnected, showTranscript, onToggleTranscript }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header
      className="relative z-20 flex items-center justify-between gap-3 flex-wrap px-4 sm:px-6 py-4 border-b flex-shrink-0"
      style={{ borderColor: "var(--border)", background: "rgba(21,17,13,0.55)", backdropFilter: "blur(16px)" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center relative bob flex-shrink-0"
          style={{
            background: "radial-gradient(circle at 35% 35%, #FF8A65, #E8523A)",
            boxShadow: "0 0 16px rgba(255,107,74,0.5)",
          }}
        >
          <span className="text-lg" aria-hidden="true">✈️</span>
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-wide font-display" style={{ color: "var(--ink)" }}>
            Atlys Travel Concierge
          </h1>
          <p className="text-[11px] hidden sm:block" style={{ color: "var(--ink-dim)" }}>
            AI-powered visa &amp; travel assistant
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {started && (
          <>
            <button
              onClick={onToggleTranscript}
              aria-pressed={showTranscript}
              aria-label={showTranscript ? "Hide transcript" : "Show transcript"}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 active:scale-95",
                showTranscript ? "text-[#FF8A65]" : "hover:text-[#FF8A65]",
              )}
              style={{
                borderColor: showTranscript ? "rgba(255,107,74,0.4)" : "var(--border)",
                background: showTranscript ? "rgba(255,107,74,0.12)" : "var(--surface)",
                color: showTranscript ? "#FF8A65" : "var(--ink-dim)",
              }}
            >
              <MessageSquare className="w-3 h-3" aria-hidden="true" />
              Transcript
            </button>

            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border"
              style={{
                borderColor: isConnected ? "rgba(63,207,160,0.3)" : "rgba(240,82,90,0.3)",
                background: isConnected ? "rgba(63,207,160,0.1)" : "rgba(240,82,90,0.1)",
                color: isConnected ? "#3FCFA0" : "#F0525A",
              }}
              role="status"
              aria-live="polite"
            >
              {isConnected
                ? <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "#3FCFA0" }} aria-hidden="true" />
                : <WifiOff className="w-3 h-3" aria-hidden="true" />}
              {isConnected ? "Live" : "Offline"}
            </div>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                aria-label="Menu"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="w-8 h-8 rounded-full flex items-center justify-center border transition-colors hover:text-[color:var(--ink)]"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink-dim)" }}
              >
                <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    role="menu"
                    className="absolute right-0 top-10 w-48 rounded-xl overflow-hidden glass-bright py-1 z-30"
                  >
                    <button
                      role="menuitem"
                      onClick={() => window.location.reload()}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
                      style={{ color: "var(--ink-2)" }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      Start new session
                    </button>
                    <a
                      role="menuitem"
                      href="https://www.atlys.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
                      style={{ color: "var(--ink-2)" }}
                    >
                      <Info className="w-3.5 h-3.5" aria-hidden="true" />
                      About Atlys
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
