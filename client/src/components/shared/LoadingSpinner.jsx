import { cn } from '../../lib/utils.js';

export default function LoadingSpinner({ size = 'md', className, label }) {
  const sz = size === 'sm' ? 'h-4 w-4 border-2' : size === 'lg' ? 'h-8 w-8 border-2' : 'h-6 w-6 border-2';
  return (
    <div className={cn('flex items-center justify-center gap-2 text-sm text-gray-500', className)}>
      <div className={cn('animate-spin rounded-full border-gray-300 border-t-blue-500', sz)} />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
