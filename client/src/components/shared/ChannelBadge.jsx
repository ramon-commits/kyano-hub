import Badge from './Badge.jsx';
import Icon, { IconBrand } from './Icon.jsx';
import { CHANNEL_COLORS } from '../../lib/constants.js';

export default function ChannelBadge({ type, label, showLabel = true, size = 'sm' }) {
  const c = CHANNEL_COLORS[type] || { bg: '#f3f4f6', text: '#6b7280', icon: 'circle', brand: false, label: type };
  const I = c.brand ? IconBrand : Icon;
  return (
    <Badge color={c.text} bg={c.bg} size={size}>
      <I name={c.icon} className="text-[11px] leading-none" />
      {showLabel ? <span className="truncate max-w-[160px]">{label || c.label}</span> : null}
    </Badge>
  );
}
