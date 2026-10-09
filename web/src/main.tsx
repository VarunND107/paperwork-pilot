import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './i18n';
import { applySavedTheme } from './hooks/useTheme';
// The approved landing-page CSS, in its original order, then the additions.
import './styles/tokens.css';
import './styles/base.css';
import './styles/header.css';
import './styles/hero.css';
import './styles/board.css';
import './styles/sections.css';
import './styles/motion.css';
import './styles/app.css';

applySavedTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
