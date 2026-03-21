export interface AppError {
  type: 'validation' | 'auth' | 'rate_limit' | 'server';
  message: string;
  title?: string;
  action?: { label: string; onClick: () => void };
}

export function parseApiError(err: any, context: string): AppError {
  const status = err.response?.status;
  const serverMsg = err.response?.data?.error;
  const details = err.response?.data?.details;
  const fullMsg = details ? `${serverMsg}: ${details}` : serverMsg;

  if (status === 401) {
    return { type: 'auth', title: 'Session expired', message: fullMsg || 'Please log in again.' };
  }
  if (status === 429) {
    return {
      type: 'rate_limit',
      title: 'Too many requests',
      message: fullMsg || 'Please wait a moment and try again.',
    };
  }
  if (status === 400) {
    return {
      type: 'validation',
      title: 'Invalid request',
      message: fullMsg || `Failed to ${context}`,
    };
  }
  return {
    type: 'server',
    title: 'Something went wrong',
    message: fullMsg || `Failed to ${context}. Please try again.`,
  };
}
