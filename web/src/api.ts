import { useEffect, useRef, useState } from 'react';
import type { RoomState, ServerPush, StoredEvent } from '@shared/types';

export async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}

export function useRoom(userId: string | null, onEvent: (e: StoredEvent, s: RoomState) => void) {
  const [state, setState] = useState<RoomState | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    const es = new EventSource(`/api/stream${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      const push = JSON.parse(m.data) as ServerPush;
      if (push.kind === 'typing') return setTyping(push.who);
      setState(push.state);
      if (push.kind === 'event') cb.current(push.stored, push.state);
    };
    return () => es.close();
  }, [userId]);

  return { state, typing, connected };
}

export async function fetchMode(): Promise<string> {
  try {
    const r = await fetch('/api/health');
    return (await r.json()).mode ?? 'mock';
  } catch {
    return 'offline';
  }
}
