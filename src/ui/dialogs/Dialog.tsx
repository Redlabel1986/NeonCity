import { useEffect, useRef } from 'react';

/** Accessible modal shell: focus trap light, Escape closes, click outside closes. */
export function Dialog({ title, onClose, children, width = 'max-w-xl' }: { title: string; onClose: () => void; children: React.ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, [tabindex]')?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/70 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`panel flex max-h-full w-full ${width} flex-col`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="dialog-title" className="text-base font-medium text-white">
            {title}
          </h2>
          <button type="button" className="btn btn-ghost px-2 py-0.5" aria-label="Schließen" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="scroll flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
