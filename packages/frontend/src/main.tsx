import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '@heroui/react';
import { configureAmplify } from './auth/amplify-config';
import { App } from './App';
import './styles/global.css';

// Initialize AWS Amplify before rendering
configureAmplify();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider locale="es-ES">
      <App />
    </I18nProvider>
  </React.StrictMode>
);
