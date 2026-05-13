import { useEffect } from 'react';
import { cn } from '../../lib/utils.js';

export default function Modal({ open, onClose, title, subtitle, children, maxWidth = 'max-w-[380px]', footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4"
      onClick={onClose}
      style={{ animation: 'fade-in 0.15s ease-out' }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className={cn(
          'relative z-10 w-full overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5',
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'pop-in 0.15s ease-out' }}
      >
        {title || subtitle ? (
          <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {title ? <h2 className="text-sm font-semibold text-gray-900">{title}</h2> : null}
                {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
              </div>
              <button
                onClick={onClose}
                className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-md text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                aria-label="Sluit"
              >
                ×
              </button>
            </div>
          </div>
        ) : null}
        <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
