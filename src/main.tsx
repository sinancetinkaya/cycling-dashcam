import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global variable to catch the prompt early
(window as any).deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('Global beforeinstallprompt fired');
  e.preventDefault();
  (window as any).deferredPrompt = e;
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('SW registered: ', registration);
    })
    .catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
