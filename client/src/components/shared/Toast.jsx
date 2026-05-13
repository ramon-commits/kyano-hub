import { cn } from '../../lib/utils.js';

const VARIANTS = {
  success: { accent: 'border-l-green-500', icon: '✅' },
  error:   { accent: 'border-l-red-500',   icon: '⛔' },
  info:    { accent: 'border-l-blue-500',  icon: 'ℹ️' },
  warning: { accent: 'border-l-orange-500', icon: '⚠️' },
};

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts?.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[360px] flex-col gap-2">
      {toasts.map((t) => {
        const v = VARIANTS[t.type] || VARIANTS.info;
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border-l-4 bg-gray-900 px-4 py-3 text-white shadow-xl ring-1 ring-black/5 transition-all',
              v.accent,
            )}
            style={{ animation: 'slide-in 0.2s ease-out' }}
          >
            <span className="text-base leading-5">{v.icon}</span>
            <div className="flex-1 text-sm leading-snug">
              {t.title ? <div className="mb-0.5 font-semibold">{t.title}</div> : null}
              <div className="text-gray-300">{t.message}</div>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Sluiten"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
