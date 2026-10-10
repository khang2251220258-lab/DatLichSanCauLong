import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { DraftContext } from './useBookingDraft';

export function BookingDraftProvider({ children }) {
  const auth = useAuth();
  const key = auth.status + ':' + (auth.user?.id || '');
  const [stored, setStored] = useState({ key, draft:null });
  // Reset only the draft, never remount Auth forms or public requests.
  if (stored.key !== key) setStored({ key, draft:null });
  const draft = stored.key === key ? stored.draft : null;
  const setDraft = value => setStored({ key, draft:value });
  return <DraftContext.Provider value={{ draft, setDraft }}>{children}</DraftContext.Provider>;
}
