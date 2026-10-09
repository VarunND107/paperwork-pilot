import { createContext, useContext } from 'react';
import { ApiError } from '../api/client';

export interface AdminContextValue {
  /** Calls the admin API. A 401 sends the visitor back to the sign-in form. */
  request: <T>(
    path: string,
    options?: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown },
  ) => Promise<T>;
  signOut: () => Promise<void>;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside <AdminApp>');
  return value;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
