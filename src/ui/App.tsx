import { useGameStore } from './store/gameStore';
import { MainMenu } from './screens/MainMenu';
import { GameScreen } from './screens/GameScreen';
import { Toasts } from './components/Toasts';
import { useEffect } from 'react';
import { audio } from './audio';
import { applyAudioSettings } from './store/gameStore';

export function App() {
  const screen = useGameStore((s) => s.screen);
  const uiScale = useGameStore((s) => s.settings.uiScale);
  const highContrast = useGameStore((s) => s.settings.highContrast);
  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, [highContrast]);
  useEffect(() => {
    const start = (): void => {
      audio.start();
      applyAudioSettings(useGameStore.getState().settings);
    };
    const onClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button')) audio.click('click');
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      window.removeEventListener('click', onClick);
    };
  }, []);
  return (
    <div className="h-full w-full" style={{ ['--ui-scale' as string]: String(uiScale) }}>
      {screen === 'menu' ? <MainMenu /> : <GameScreen />}
      <Toasts />
    </div>
  );
}
