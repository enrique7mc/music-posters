import { motion } from 'framer-motion';
import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { buttonPress } from '@/lib/animations';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'text';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-semibold transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary: 'bg-accent-500 text-dark-950 hover:bg-accent-400',
      secondary:
        'bg-dark-800 text-dark-50 hover:bg-dark-700 border border-dark-700 hover:border-dark-600',
      ghost: 'bg-transparent text-dark-200 hover:bg-dark-800 hover:text-dark-50',
      text: 'bg-transparent text-accent-400 hover:text-accent-300 underline-offset-4 hover:underline',
    };

    const sizes = {
      sm: 'text-sm px-3 py-2 rounded-lg',
      md: 'text-sm px-5 py-3 rounded-xl',
      lg: 'text-base px-6 py-3.5 rounded-xl',
    };

    const MotionButton = motion.button;

    return (
      <MotionButton
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        variants={buttonPress}
        initial="rest"
        whileHover="hover"
        whileTap="tap"
        {...(props as any)}
      >
        {isLoading ? (
          <>
            <svg
              aria-hidden="true"
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {children}
          </>
        ) : (
          children
        )}
      </MotionButton>
    );
  }
);

Button.displayName = 'Button';

export default Button;
