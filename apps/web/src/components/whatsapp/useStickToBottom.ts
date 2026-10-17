import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export function useStickToBottom(signature: string) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const pin = useCallback(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
    stuck.current = true;
    setAtBottom(true);
  }, []);
  useLayoutEffect(() => {
    if (stuck.current) pin();
  }, [signature, pin]);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stuck.current) pin();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [pin, signature]);
  const onScroll = () => {
    const node = scroller.current;
    if (!node) return;
    const next = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
    stuck.current = next;
    setAtBottom(next);
  };
  const release = useCallback(() => {
    stuck.current = false;
    setAtBottom(false);
  }, []);
  return { scroller, stuck, atBottom, pin, onScroll, release };
}
