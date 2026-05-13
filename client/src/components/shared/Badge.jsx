import { cn } from '../../lib/utils.js';

const SIZE = {
  xs: 'text-[10px] px-1.5 py-0.5 gap-1',
  sm: 'text-[11px] px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-0.5 gap-1.5',
  lg: 'text-sm px-3 py-1 gap-1.5',
};

export default function Badge({ children, color, bg, className, size = 'sm' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium leading-none',
        SIZE[size] || SIZE.sm,
        className,
      )}
      style={{ background: bg || '#f3f4f6', color: color || '#374151' }}
    >
      {children}
    </span>
  );
}
