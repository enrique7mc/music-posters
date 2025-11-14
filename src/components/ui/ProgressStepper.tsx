import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeIn } from '@/lib/animations';

export interface Step {
  label: string;
  href?: string;
}

export interface ProgressStepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

const ProgressStepper = ({ steps, currentStep, className }: ProgressStepperProps) => {
  return (
    <motion.div
      className={cn('flex items-center justify-center gap-2 sm:gap-4', className)}
      variants={fadeIn}
      initial="hidden"
      animate="visible"
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isFuture = index > currentStep;

        return (
          <div key={index} className="flex items-center gap-2 sm:gap-4">
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              <motion.div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  isCompleted && 'bg-accent-500 text-white',
                  isCurrent && 'bg-accent-500 text-white ring-4 ring-accent-500/20',
                  isFuture && 'bg-dark-800 text-dark-400 border border-dark-700'
                )}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <span>{index + 1}</span>
                )}
              </motion.div>

              {/* Step label - hidden on small screens */}
              <motion.span
                className={cn(
                  'hidden sm:inline-block text-sm font-medium transition-colors whitespace-nowrap',
                  isCompleted && 'text-dark-300',
                  isCurrent && 'text-accent-400',
                  isFuture && 'text-dark-500'
                )}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 + 0.1 }}
              >
                {step.label}
              </motion.span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <motion.div
                className={cn(
                  'h-0.5 w-8 sm:w-16 transition-colors',
                  isCompleted ? 'bg-accent-500' : 'bg-dark-800'
                )}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: index * 0.1 + 0.2 }}
              />
            )}
          </div>
        );
      })}
    </motion.div>
  );
};

export default ProgressStepper;
