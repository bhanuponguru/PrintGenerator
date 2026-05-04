'use client';

import { useState, useCallback } from 'react';

export type ToastState = { message: string; type: 'success' | 'error' } | null;

/**
 * Hook providing toast state management and a Toast renderer.
 * Usage:
 *   const { showToast, ToastComponent } = useToast();
 *   showToast('Done!', 'success');
 *   return <>{...}<ToastComponent /></>;
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const ToastComponent = () =>
    toast ? (
      <div
        key={toast.message + Date.now()}
        className={`pg-toast pg-toast--${toast.type}`}
      >
        {toast.message}
      </div>
    ) : null;

  return { showToast, toast, ToastComponent };
}
