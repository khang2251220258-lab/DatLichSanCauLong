import { createContext, useContext } from 'react';
export const DraftContext = createContext(null);
export const useBookingDraft = () => useContext(DraftContext);
