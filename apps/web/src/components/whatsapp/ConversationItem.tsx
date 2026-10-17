import { ContactAvatar } from '../ContactAvatar.js';
import { fullDateTime, listTime, maskPhone, waitLabel } from './chatTime.js';
import type { ConversationRow } from './types.js';

const typeIcon: Record<string, string> = {
  image: 'Foto',
  audio: 'Áudio',
  video: 'Vídeo',
  sticker: 'Figurinha',
  file: 'Arquivo',
};

export function ConversationItem({
  row,
  selected,
  now,
  onSelect,
}: {
  row: ConversationRow;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  const name = row.name || 'Contato';
  const phone = row.phone || '';
  const outbound = row.last_direction === 'outbound';
  const kind = typeIcon[row.last_message_type || ''] || '';
  const preview = [kind, row.last_message].filter(Boolean).join(' · ') || row.company || 'Sem mensagens';
  const sla = row.status === 'open' ? waitLabel(row.pending_since, row.sla_goal_minutes ?? 30, now) : null;
  const when = row.last_at ? listTime(row.last_at, new Date(now)) : '';
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={selected ? 'is-selected' : ''}
      onClick={onSelect}
    >
      <ContactAvatar name={name} photoUrl={row.photoUrl} />
      <span className="wa-item-copy">
        <span className="wa-item-top">
          <strong>{name}</strong>
          {when && <time dateTime={row.last_at ?? undefined} title={row.last_at ? fullDateTime(row.last_at) : undefined}>{when}</time>}
        </span>
        <small>{maskPhone(phone)}</small>
        <em>
          {outbound ? (row.last_actor_type === 'foundry' ? 'Foundry: ' : 'Você: ') : ''}
          {preview}
        </em>
        <span className="wa-chips">
          {row.source && <i>{row.source}</i>}
          {row.ai_enabled && <i>Foundry ativa</i>}
          {row.status === 'closed' && <i>Encerrada</i>}
          {sla && <i className={`is-${sla.tone}`}>{sla.label}</i>}
        </span>
      </span>
      {Number(row.unread_count) > 0 && <b className="wa-unread">{row.unread_count}</b>}
    </button>
  );
}
