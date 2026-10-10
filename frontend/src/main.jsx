import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './index.css';
import './features/auth/auth.css';
import { AppRoutes } from './routes/AppRoutes';
import { AuthProvider } from './features/auth/AuthContext';
import { captureResetToken } from './features/auth/resetToken';

const tokenVault = captureResetToken();
createRoot(document.getElementById('root')).render(
  <StrictMode><BrowserRouter><AuthProvider><AppRoutes tokenVault={tokenVault} /></AuthProvider></BrowserRouter></StrictMode>,
);
