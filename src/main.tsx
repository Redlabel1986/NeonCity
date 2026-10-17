import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { session } from './ui/session';
import { useGameStore } from './ui/store/gameStore';
import { checkPlacement } from './sim/systems/construction';

// Debug / test hook: lets end-to-end tests and the console inspect the live session.
(window as unknown as { __neon: unknown }).__neon = { session, store: useGameStore, checkPlacement };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
