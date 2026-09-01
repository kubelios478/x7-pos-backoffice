import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth-storage';
import { ErrorBoundary } from './shared/ErrorBoundary';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate replace to="/login" />;
  }

  return <ErrorBoundary>{children}</ErrorBoundary>;
}
