import { motion } from 'framer-motion';
import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'headliner' | 'sub-headliner' | 'mid-tier' | 'undercard' | 'default';
  children: React.ReactNode;
}

export default function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
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
      {...props}
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
      icon: '★',
    },
    'sub-headliner': {
      label: 'Sub-Headliner',
      variant: 'sub-headliner' as const,
      icon: '⭐',
    },
    'mid-tier': {
      label: 'Mid-Tier',
      variant: 'mid-tier' as const,
      icon: '•',
    },
    undercard: {
      label: 'Undercard',
      variant: 'undercard' as const,
      icon: '·',
    },
  };

  const config = tierConfig[tier as keyof typeof tierConfig] || {
    label: tier,
    variant: 'default' as const,
    icon: '·',
  };

  return (
    <Badge variant={config.variant}>
      <span className="text-xs">{config.icon}</span>
      {config.label}
    </Badge>
  );
}
