import React from 'react';
import ReactDOM from 'react-dom/client';
import PreviewApp from './PreviewApp';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <PreviewApp />
    </React.StrictMode>
  );
}
