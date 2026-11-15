import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { AuthEngine } from './utils/auth.ts';

// Initialize Multi-Tenant Header Interceptor for all API requests
AuthEngine.initFetchInterceptor();

// Register Service Worker for Offline Work & PWA
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => {
        console.log('✅ Dukaan Khaata Offline Service Worker registered:', reg.scope);
      },
      (err) => {
        console.warn('⚠️ Service Worker registration failed:', err);
      }
    );
  });
}

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
);
