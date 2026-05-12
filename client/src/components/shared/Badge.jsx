import { cn } from '../../lib/utils.js';

export default function Badge({ children, color, bg, className, size = 'sm' }) {
  const sizeCls = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : size === 'lg'
      ? 'text-sm px-3 py-1'
      : 'text-[11px] px-2 py-0.5';
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full font-medium', sizeCls, className)}
      style={{ background: bg || '#f3f4f6', color: color || '#374151' }}
    >
      {children}
    </span>
  );
}
