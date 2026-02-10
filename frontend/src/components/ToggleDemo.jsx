import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ToggleDemo() {
  const [enabled, setEnabled] = useState(false);

  return (
    <div className="w-full max-w-3xl rounded-2xl border border-ink/20 bg-paper p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-center gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-graphite">Noise</span>
        <button
          type="button"
          onClick={() => setEnabled((prev) => !prev)}
          aria-pressed={enabled}
          className="relative h-8 w-16 rounded-full border border-ink/25 bg-[#ece9e1] p-1 transition"
        >
          <motion.span
            className="block h-6 w-6 rounded-full bg-ink"
            animate={{ x: enabled ? 32 : 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          />
        </button>
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-graphite">Signal</span>
      </div>

      <AnimatePresence mode="wait">
        {!enabled ? (
          <motion.div
            key="noise"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <span className="inline-block rounded border border-noise/40 bg-noise/10 px-3 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] text-noise">
              [NOISE DETECTED]
            </span>
            <div className="rounded-xl border border-noise/30 bg-[#f2e7e5] p-5 text-ink/90 blur-[0.6px]">
              <p className="font-serif text-2xl leading-snug">
                "10 secrets to 10x your revenue by waking up at 3AM... #hustle"
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="signal"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <span className="inline-block rounded border border-signal/40 bg-signal/10 px-3 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] text-signal">
              [HUMAN SIGNAL]
            </span>
            <div className="rounded-xl border border-signal/30 bg-[#edf2ec] p-5">
              <p className="font-serif text-2xl leading-snug text-ink">
                "Just pushed the new update. The repo is open source."
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-6 text-center font-mono text-xs uppercase tracking-[0.18em] text-graphite">
        The AI reads the feed so you don't have to.
      </p>
    </div>
  );
}
