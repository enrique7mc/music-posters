import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface Step {
  label: string;
  /** Only completed steps with an available draft destination may navigate. */
  href?: string;
}
export interface ProgressStepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}
export default function ProgressStepper({ steps, currentStep, className }: ProgressStepperProps) {
  return (
    <nav aria-label="Playlist progress" className={cn('mx-auto max-w-3xl', className)}>
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const completed = index < currentStep;
          const current = index === currentStep;
          const href = completed ? step.href : undefined;
          const content = (
            <>
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  current
                    ? 'bg-accent-500 text-dark-950'
                    : completed
                      ? 'bg-accent-500/10 text-accent-400'
                      : 'bg-dark-800 text-dark-300'
                )}
              >
                {completed ? (
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                ) : (
                  <span aria-hidden="true">{index + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  'text-center text-[10px] leading-tight sm:text-xs',
                  current ? 'text-accent-400' : 'text-dark-300'
                )}
              >
                {step.label}
              </span>
            </>
          );
          return (
            <li
              key={step.label}
              aria-current={current ? 'step' : undefined}
              className="relative flex flex-1 justify-center"
            >
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-[calc(50%+1.25rem)] top-3.5 h-px w-[calc(100%-2.5rem)]',
                    completed ? 'bg-accent-500/40' : 'bg-dark-700'
                  )}
                />
              )}
              {href ? (
                <Link
                  href={href}
                  aria-label={`Back to ${step.label}`}
                  className="relative flex flex-col items-center gap-2 rounded-lg px-1"
                >
                  {content}
                </Link>
              ) : (
                <div className="relative flex flex-col items-center gap-2 px-1">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
