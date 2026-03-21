import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { slideDown } from '@/lib/animations';

interface ErrorMessageProps {
  message: string;
  title?: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  className?: string;
}

export default function ErrorMessage({
  message,
  title,
  action,
  onDismiss,
  className,
}: ErrorMessageProps) {
  return (
    <motion.div
      className={cn(
        'rounded-lg border border-ember-700/50 bg-ember-950/50 p-4',
        'backdrop-blur-sm',
        className
      )}
      variants={slideDown}
      initial="hidden"
      animate="visible"
    >
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 text-ember-400 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="flex-1">
          {title && <p className="font-semibold text-ember-100 mb-1">{title}</p>}
          <p className="text-sm text-ember-200">{message}</p>
          {action && (
            <button
              onClick={action.onClick}
              className="text-sm text-ember-300 hover:text-ember-200 underline mt-2"
            >
              {action.label}
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-ember-400 hover:text-ember-300 transition-colors flex-shrink-0"
            aria-label="Dismiss error"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}
