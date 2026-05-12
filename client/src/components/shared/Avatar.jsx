import { cn } from '../../lib/utils.js';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

export default function Avatar({ name, initials, color, size = 'md', className }) {
  const computed = initials || (name ? name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() : '?');
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-sm select-none',
        SIZES[size] || SIZES.md,
        className,
      )}
      style={{ background: color || '#6b7280' }}
      aria-label={name}
    >
      {computed}
    </div>
  );
}
