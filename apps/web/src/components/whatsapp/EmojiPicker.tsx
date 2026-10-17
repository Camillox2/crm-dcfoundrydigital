import { useEffect, useMemo, useRef, useState } from 'react';

const groups = [
  { id: 'recentes', label: 'Recentes', items: [] as string[] },
  { id: 'rostos', label: 'Rostos', items: Array.from('😀😁😂🤣😃😄😅😆😉😊🙂😍😘😜🤩🤔😐😴😌') },
  { id: 'gestos', label: 'Gestos', items: Array.from('👍👎👏🙌👋🤝💪✌🤞👊🙏👌') },
  { id: 'pessoas', label: 'Pessoas', items: Array.from('👩👨🙋👧👦👶🧑👴👵') },
  { id: 'natureza', label: 'Natureza', items: Array.from('🌞🌙⭐🌟🌈🔥💧🍀🌸🌻🌿') },
  { id: 'comida', label: 'Comida', items: Array.from('☕🍵🍕🍔🍟🥗🍎🍊🍓🎂') },
  { id: 'objetos', label: 'Objetos', items: Array.from('💻📱💡📅📌📎📝📞🚀✅❌') },
  { id: 'simbolos', label: 'Símbolos', items: Array.from('❤💙💚💛💜🖤💯✨🎉💬') },
];

const recentKey = 'dcfoundry.wa.emoji-recent';

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('rostos');
  const [recent, setRecent] = useState<string[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(recentKey) || '[]'));
    } catch {
      setRecent([]);
    }
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);
  const items = useMemo(() => {
    const source = group === 'recentes' ? recent : (groups.find((item) => item.id === group)?.items ?? []);
    const unique = [...new Set(source)];
    const needle = query.trim();
    return needle ? unique.filter((item) => item.includes(needle)) : unique;
  }, [group, query, recent]);
  const choose = (emoji: string) => {
    const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, 24);
    setRecent(next);
    localStorage.setItem(recentKey, JSON.stringify(next));
    onPick(emoji);
  };
  return (
    <div className="wa-emoji-picker" ref={panel} role="dialog" aria-label="Emojis">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar emoji"
        aria-label="Buscar emoji"
      />
      <div className="wa-emoji-groups" role="tablist">
        {groups.map((item) => (
          <button
            type="button"
            key={item.id}
            role="tab"
            aria-selected={group === item.id}
            onClick={() => setGroup(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="wa-emoji-grid">
        {items.length ? (
          items.map((emoji) => (
            <button type="button" key={emoji} onClick={() => choose(emoji)}>
              {emoji}
            </button>
          ))
        ) : (
          <p>Nenhum emoji encontrado.</p>
        )}
      </div>
    </div>
  );
}
