import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { dayKey, dayLabel } from './chatTime.js';
import { MessageBubble } from './MessageBubble.js';
import { useStickToBottom } from './useStickToBottom.js';
import type { ChatMessage } from './types.js';

export function MessageThread({
  messages,
  contactName,
  path,
  user,
  preview,
  unseen,
  stickTick,
  onLoadOlder,
  onJump,
  onAtBottom,
}: {
  messages: ChatMessage[];
  contactName: string;
  path: string;
  user: AuthenticatedSession;
  preview?: boolean;
  unseen: number;
  stickTick: number;
  onLoadOlder: () => Promise<boolean>;
  onJump: () => void;
  onAtBottom: (value: boolean) => void;
}) {
  const signature = messages.map((item) => item.id).join(',');
  const { scroller, atBottom, pin, onScroll, release } = useStickToBottom(signature);
  const top = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const [done, setDone] = useState(false);
  const preserve = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const node = scroller.current;
    const snapshot = preserve.current;
    if (!node || !snapshot) return;
    node.scrollTop = snapshot.top + (node.scrollHeight - snapshot.height);
    preserve.current = null;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distance >= 64) release();
  }, [signature, scroller, release]);
  useEffect(() => {
    onAtBottom(atBottom);
  }, [atBottom, onAtBottom]);
  useLayoutEffect(() => {
    if (stickTick > 0) pin();
  }, [pin, stickTick]);
  useEffect(() => {
    const node = top.current;
    const root = scroller.current;
    if (!node || !root || done) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || loading.current || messages.length < 1) return;
        loading.current = true;
        preserve.current = { height: root.scrollHeight, top: root.scrollTop };
        void onLoadOlder()
          .then((more) => {
            if (!more) setDone(true);
          })
          .finally(() => {
            loading.current = false;
          });
      },
      { root, rootMargin: '80px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [done, messages.length, onLoadOlder, scroller]);
  let previousDay = '';
  return (
    <div className="wa-thread-scroll" ref={scroller} onScroll={onScroll} aria-label="Mensagens da conversa">
      <div ref={top} className="wa-history-sentinel" />
      {messages.length ? (
        messages.map((message) => {
          const key = dayKey(message.sent_at);
          const showDay = key !== previousDay;
          previousDay = key;
          return (
            <div key={message.id} className="wa-message-block">
              {showDay && <p className="wa-day">{dayLabel(message.sent_at)}</p>}
              <MessageBubble message={message} contactName={contactName} path={path} user={user} preview={preview} />
            </div>
          );
        })
      ) : (
        <p className="wa-empty">Nenhuma mensagem ainda. Escreva para começar.</p>
      )}
      {unseen > 0 && !atBottom && (
        <button
          type="button"
          className="wa-jump"
          onClick={() => {
            pin();
            onJump();
          }}
        >
          ↓ {unseen} {unseen === 1 ? 'nova' : 'novas'}
        </button>
      )}
    </div>
  );
}
