'use client';

import { ToastProvider } from './Toast';
import SwipeNav from './SwipeNav';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <SwipeNav />
      {children}
    </ToastProvider>
  );
}
