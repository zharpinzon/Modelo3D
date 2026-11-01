import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './styles/global.css';
import Monitor from './components/Monitor';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Monitor />
  </React.StrictMode>,
);
