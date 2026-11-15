import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PreviewApp from './PreviewApp';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  const isPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      {isPreview ? <PreviewApp /> : <App />}
    </React.StrictMode>
  );
}
