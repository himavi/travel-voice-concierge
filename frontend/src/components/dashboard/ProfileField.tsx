"use client";

import { AnimatePresence, motion } from "framer-motion";

interface Props {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}

export function ProfileField({ icon: Icon, label, value }: Props) {
  const filled = !!value;
  return (
    <motion.div
      layout
      className="flex items-center gap-2.5 py-2 px-3 rounded-lg"
      animate={{
        opacity: filled ? 1 : 0.65,
        backgroundColor: filled ? "rgba(255,107,74,0.08)" : "rgba(255,255,255,0.015)",
      }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        border: filled ? "1px solid rgba(255,107,74,0.2)" : "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true"
        style={{ color: filled ? "#FF6B4A" : "var(--ink-faint)" }} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] leading-none mb-1" style={{ color: "var(--ink-dim)" }}>{label}</p>
        <AnimatePresence mode="wait">
          {filled ? (
            <motion.p
              key={value}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="text-xs font-medium truncate"
              style={{ color: "var(--ink)" }}
            >
              {value}
            </motion.p>
          ) : (
            <p key="empty" className="text-xs font-medium italic" style={{ color: "var(--ink-faint)" }}>
              Not detected
            </p>
          )}
        </AnimatePresence>
      </div>
      {filled && (
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 pulse-dot" aria-hidden="true"
          style={{ background: "#FF6B4A" }} />
      )}
    </motion.div>
  );
}
