import { useGameStore } from '../store/gameStore';

export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  const dismiss = useGameStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-[11.5rem] left-1/2 z-50 flex w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} data-level={t.level} className="toast panel pointer-events-auto flex items-start gap-3 px-3 py-2 text-sm">
          <span className="flex-1">{t.message}</span>
          <button type="button" className="btn btn-ghost -mr-1 px-1 py-0 text-muted" aria-label="Meldung schließen" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
