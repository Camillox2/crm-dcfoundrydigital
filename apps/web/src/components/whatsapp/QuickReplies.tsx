export type QuickReply = { id: string; title: string; content: string };

export function fillReply(content: string, lead: { name: string; company: string }) {
  return content.replaceAll('{nome}', lead.name).replaceAll('{empresa}', lead.company);
}

export function QuickReplies({
  items,
  query,
  onPick,
}: {
  items: QuickReply[];
  query: string;
  onPick: (content: string) => void;
}) {
  const slash = query.startsWith('/');
  const needle = slash ? query.slice(1).trim().toLocaleLowerCase('pt-BR') : '';
  const visible = (slash ? items.filter((item) => `${item.title} ${item.content}`.toLocaleLowerCase('pt-BR').includes(needle)) : items).slice(0, 8);
  if (!visible.length) return slash ? <p className="wa-quick-empty">Nenhuma resposta pronta encontrada.</p> : null;
  return (
    <div className="wa-quick" role="listbox" aria-label="Respostas prontas">
      {visible.map((item) => (
        <button type="button" key={item.id} role="option" onClick={() => onPick(item.content)}>
          {item.title}
        </button>
      ))}
    </div>
  );
}
