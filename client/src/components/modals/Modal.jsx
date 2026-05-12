import { useEffect } from 'react';
import { cn } from '../../lib/utils.js';

export default function Modal({ open, onClose, title, subtitle, children, maxWidth = 'max-w-md', footer }) {
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={cn(
          'relative z-10 w-full overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5',
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'pop-in 0.15s ease-out' }}
      >
        {title || subtitle ? (
          <div className="border-b border-gray-100 px-6 py-4">
            {title ? <h2 className="text-base font-semibold text-gray-900">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
          </div>
        ) : null}
        <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
