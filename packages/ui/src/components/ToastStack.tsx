export type ToastItem = { id: string; tone: 'ok' | 'warn' | 'error'; text: string };

export function ToastStack({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="dcf-toasts" aria-live="polite">
      {items.map((item) => (
        <p key={item.id} className={`dcf-notice is-${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
          <span>{item.text}</span>
          <button type="button" onClick={() => onDismiss(item.id)} aria-label="Fechar aviso">
            ×
          </button>
        </p>
      ))}
    </div>
  );
}
