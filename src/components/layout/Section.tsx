import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  noPadding?: boolean;
}

export default function Section({
  children,
  className,
  fullWidth = false,
  noPadding = false,
}: SectionProps) {
  return (
    <section
      className={cn(
        !fullWidth && 'container mx-auto',
        !noPadding && 'px-4 py-12 lg:py-20',
        className
      )}
    >
      {children}
    </section>
  );
}

// Asymmetric section for editorial layouts
interface AsymmetricSectionProps {
  left: ReactNode;
  right: ReactNode;
  className?: string;
  reverse?: boolean;
}

export function AsymmetricSection({
  left,
  right,
  className,
  reverse = false,
}: AsymmetricSectionProps) {
  return (
    <Section className={className}>
      <div
        className={cn(
          'grid gap-8 lg:gap-12',
          reverse ? 'lg:grid-asymmetric-reverse' : 'lg:grid-asymmetric'
        )}
      >
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {left}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {right}
        </motion.div>
      </div>
    </Section>
  );
}

// Overlapping panel for dramatic effect
interface OverlappingSectionProps {
  background: ReactNode;
  overlay: ReactNode;
  overlayPosition?: 'left' | 'right' | 'center';
  className?: string;
}

export function OverlappingSection({
  background,
  overlay,
  overlayPosition = 'center',
  className,
}: OverlappingSectionProps) {
  const positions = {
    left: 'lg:left-12 lg:right-auto',
    right: 'lg:right-12 lg:left-auto',
    center: 'lg:left-1/2 lg:-translate-x-1/2',
  };

  return (
    <section className={cn('relative', className)}>
      {background}
      <motion.div
        className={cn(
          'absolute top-1/2 -translate-y-1/2',
          'w-11/12 mx-auto lg:w-auto lg:mx-0',
          positions[overlayPosition]
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        {overlay}
      </motion.div>
    </section>
  );
}
