import Badge from './Badge.jsx';
import { CHANNEL_COLORS } from '../../lib/constants.js';

export default function ChannelBadge({ type, label, showLabel = true, size = 'sm' }) {
  const c = CHANNEL_COLORS[type] || { bg: '#f3f4f6', text: '#6b7280', icon: '•', label: type };
  return (
    <Badge color={c.text} bg={c.bg} size={size}>
      <span className="leading-none">{c.icon}</span>
      {showLabel ? <span className="truncate max-w-[160px]">{label || c.label}</span> : null}
    </Badge>
  );
}
