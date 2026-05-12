import Badge from './Badge.jsx';
import { PRIORITY_COLORS } from '../../lib/constants.js';

export default function PriorityBadge({ priority, size }) {
  const p = PRIORITY_COLORS[priority];
  if (!p) return null;
  return (
    <Badge color={p.text} bg={p.bg} size={size}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.dot }} />
      {p.label}
    </Badge>
  );
}
