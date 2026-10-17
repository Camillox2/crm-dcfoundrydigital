import { Check, CheckCheck, CircleAlert } from 'lucide-react';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { fullDateTime, shortTime } from './chatTime.js';
import { MessageMedia } from './MessageMedia.js';
import type { ChatMessage } from './types.js';

function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export function MessageBubble({
  message,
  contactName,
  path,
  user,
  preview,
}: {
  message: ChatMessage;
  contactName: string;
  path: string;
  user: AuthenticatedSession;
  preview?: boolean;
}) {
  if (message.message_type === 'system' || message.actor_type === 'system')
    return <p className="wa-system">{message.body}</p>;
  const outgoing = message.direction === 'outbound';
  const foundry = message.actor_type === 'foundry';
  const when = shortTime(message.sent_at);
  const exact = fullDateTime(message.sent_at);
  const receipt =
    message.delivery === 'read'
      ? 'Lida'
      : message.delivery === 'delivered' || message.delivery === 'received'
        ? 'Entregue'
        : message.delivery === 'sent'
          ? 'Enviada'
          : message.delivery === 'failed'
            ? 'Não entregue'
            : 'Enviando…';
  return (
    <article
      className={`wa-bubble ${outgoing ? 'is-out' : 'is-in'} ${foundry ? 'is-foundry' : ''} ${message.historical ? 'is-historical' : ''}`}
    >
      {foundry && (
        <header className="wa-foundry-head">
          <span aria-hidden="true">✦</span> Foundry IA
        </header>
      )}
      {!foundry && (
        <span className="wa-author">
          {outgoing ? 'Equipe' : contactName}
          {message.historical ? ' · Histórico' : ''}
        </span>
      )}
      {message.body && <p>{linkify(message.body)}</p>}
      {message.message_type !== 'text' && message.message_type !== 'system' && (
        <MessageMedia message={message} path={path} user={user} preview={preview} />
      )}
      <small>
        <time dateTime={message.sent_at} title={exact}>
          {when}
        </time>
        {outgoing && (
          <span className={`wa-ticks is-${message.delivery}`} title={message.delivery_error || receipt}>
            {message.delivery === 'read' || message.delivery === 'delivered' || message.delivery === 'received' ? (
              <CheckCheck size={14} />
            ) : message.delivery === 'failed' ? (
              <CircleAlert size={14} />
            ) : (
              <Check size={14} />
            )}
            <span className="sr-only">
              {receipt}
              {message.delivery === 'failed' && message.delivery_error ? ` ${message.delivery_error}` : ''}
            </span>
            {message.delivery === 'failed' && <em>Não entregue</em>}
            {message.delivery === 'queued' && <em>Enviando…</em>}
          </span>
        )}
      </small>
    </article>
  );
}
