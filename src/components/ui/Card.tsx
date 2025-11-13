import { motion, HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { hoverLift } from '@/lib/animations';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  variant?: 'default' | 'glass' | 'overlay' | 'elevated';
  hover?: boolean;
  children: React.ReactNode;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', hover = false, children, ...props }, ref) => {
    const baseStyles = 'rounded-lg transition-all';

    const variants = {
      default: 'bg-dark-900 border border-dark-800',
      glass: 'glass',
      overlay: 'bg-dark-900/80 backdrop-blur-md border border-dark-700/50',
      elevated: 'bg-dark-900 border border-dark-800 shadow-hard',
    };

    const MotionDiv = motion.div;

    return (
      <MotionDiv
        ref={ref}
        className={cn(baseStyles, variants[variant], hover && 'cursor-pointer', className)}
        variants={hover ? hoverLift : undefined}
        initial={hover ? 'rest' : undefined}
        animate={hover ? 'rest' : undefined}
        whileHover={hover ? 'hover' : undefined}
        {...props}
      >
        {children}
      </MotionDiv>
    );
  }
);

Card.displayName = 'Card';

export default Card;

// Card sub-components for better composition
export const CardHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-6 pb-4', className)} {...props}>
    {children}
  </div>
);

export const CardTitle = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-xl font-bold text-dark-50', className)} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-dark-400', className)} {...props}>
    {children}
  </p>
);

export const CardContent = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-6 pt-0', className)} {...props}>
    {children}
  </div>
);

export const CardFooter = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center p-6 pt-4', className)} {...props}>
    {children}
  </div>
);
