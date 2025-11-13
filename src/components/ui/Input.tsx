import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type = 'text', id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-dark-200 mb-2">
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          className={cn(
            'flex w-full rounded-lg border border-dark-700 bg-dark-900 px-4 py-2.5',
            'text-dark-50 placeholder:text-dark-500',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-ember-500 focus:ring-ember-500/50 focus:border-ember-500',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-ember-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;

// Textarea variant
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-dark-200 mb-2">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            'flex w-full rounded-lg border border-dark-700 bg-dark-900 px-4 py-2.5',
            'text-dark-50 placeholder:text-dark-500',
            'transition-colors duration-200 min-h-[100px]',
            'focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-ember-500 focus:ring-ember-500/50 focus:border-ember-500',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-ember-400">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
