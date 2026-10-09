import { createContext, useContext } from 'react';
import type { MemberView, OrgView } from '../api/types';

export interface ProContextValue {
  /** The signed-in member's access key. */
  key: string;
  member: MemberView;
  org: OrgView;
  signOut: () => void;
  /** Use a new key (after replacing it) and show it once. */
  replaceKey: (key: string) => void;
}

export const ProContext = createContext<ProContextValue | null>(null);

export function usePro(): ProContextValue {
  const value = useContext(ProContext);
  if (!value) throw new Error('usePro must be used inside <ProApp>');
  return value;
}
