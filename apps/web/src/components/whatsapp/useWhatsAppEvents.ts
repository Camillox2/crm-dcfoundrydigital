import { useEffect, useState } from 'react';
import type { LiveFrame } from './types.js';

export function useWhatsAppEvents(
  sessionId: string | undefined,
  token: string | undefined,
  enabled: boolean,
  onFrame: (frame: LiveFrame) => void,
) {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    if (!sessionId || !token || !enabled) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    const listen = async () => {
      try {
        const response = await fetch(`/api/v1/whatsapp/sessions/${sessionId}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw Error('Canal ao vivo indisponível.');
        attempt = 0;
        setOnline(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = frame
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('');
            if (!data) continue;
            try {
              onFrame(JSON.parse(data) as LiveFrame);
            } catch {
              onFrame({ type: 'changed' });
            }
          }
        }
        setOnline(false);
      } catch {
        setOnline(false);
      }
      if (!controller.signal.aborted && !stopped) {
        const delay = Math.min(15000, 1000 * 2 ** attempt);
        attempt += 1;
        retry = setTimeout(() => void listen(), delay);
      }
    };
    void listen();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(retry);
    };
  }, [sessionId, token, enabled, onFrame]);
  return online;
}
