import { cn } from '../../lib/utils.js';

const VARIANTS = {
  success: { ring: 'ring-green-200', bg: 'bg-white', icon: '✅', text: 'text-gray-900' },
  error: { ring: 'ring-red-200', bg: 'bg-white', icon: '⛔', text: 'text-gray-900' },
  info: { ring: 'ring-blue-200', bg: 'bg-white', icon: 'ℹ️', text: 'text-gray-900' },
  warning: { ring: 'ring-orange-200', bg: 'bg-white', icon: '⚠️', text: 'text-gray-900' },
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
              'pointer-events-auto flex items-start gap-3 rounded-lg px-4 py-3 shadow-xl ring-1 transition-all',
              v.bg, v.ring,
              'animate-[slide-in_0.2s_ease-out]',
            )}
          >
            <span className="text-lg leading-5">{v.icon}</span>
            <div className={cn('flex-1 text-sm leading-5', v.text)}>
              {t.title ? <div className="mb-0.5 font-medium">{t.title}</div> : null}
              <div className="text-gray-600">{t.message}</div>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
