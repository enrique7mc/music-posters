import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { HeadlinerIcon, SubHeadlinerIcon, CustomMusicNote } from '@/components/icons';

export interface BadgeProps {
  variant?: 'headliner' | 'sub-headliner' | 'mid-tier' | 'undercard' | 'default';
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ className, variant = 'default', children }: BadgeProps) {
  const baseStyles =
    'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors';

  const variants = {
    headliner: 'bg-accent-500/10 text-accent-400 border-accent-500/30',
    'sub-headliner': 'bg-muted-500/10 text-muted-300 border-muted-500/30',
    'mid-tier': 'bg-dark-700/50 text-dark-300 border-dark-600',
    undercard: 'bg-dark-800/50 text-dark-400 border-dark-700',
    default: 'bg-dark-800 text-dark-300 border-dark-700',
  };

  return (
    <motion.span
      className={cn(baseStyles, variants[variant], className)}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.span>
  );
}

// Tier badge with icon
export function TierBadge({ tier }: { tier: string }) {
  const tierConfig = {
    headliner: {
      label: 'Headliner',
      variant: 'headliner' as const,
      Icon: HeadlinerIcon,
    },
    'sub-headliner': {
      label: 'Sub-Headliner',
      variant: 'sub-headliner' as const,
      Icon: SubHeadlinerIcon,
    },
    'mid-tier': {
      label: 'Mid-Tier',
      variant: 'mid-tier' as const,
      Icon: CustomMusicNote,
    },
    undercard: {
      label: 'Undercard',
      variant: 'undercard' as const,
      Icon: CustomMusicNote,
    },
  };

  const config = tierConfig[tier as keyof typeof tierConfig] || {
    label: tier,
    variant: 'default' as const,
    Icon: CustomMusicNote,
  };

  const IconComponent = config.Icon;

  return (
    <Badge variant={config.variant}>
      <IconComponent className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
