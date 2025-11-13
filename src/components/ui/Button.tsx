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
      'inline-flex items-center justify-center font-medium transition-all focus-ring disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary: 'bg-accent-500 text-white hover:bg-accent-600 shadow-md hover:shadow-lg',
      secondary:
        'bg-dark-800 text-dark-50 hover:bg-dark-700 border border-dark-700 hover:border-dark-600',
      ghost: 'bg-transparent text-dark-200 hover:bg-dark-800 hover:text-dark-50',
      text: 'bg-transparent text-accent-400 hover:text-accent-300 underline-offset-4 hover:underline',
    };

    const sizes = {
      sm: 'text-sm px-3 py-1.5 rounded',
      md: 'text-base px-5 py-2.5 rounded-lg',
      lg: 'text-lg px-7 py-3.5 rounded-lg',
    };

    const MotionButton = motion.button;

    return (
      <MotionButton
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        variants={buttonPress}
        initial="rest"
        whileHover="hover"
        whileTap="tap"
        {...props}
      >
        {isLoading ? (
          <>
            <svg
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
            Loading...
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
