import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DomainEvent, RoomState, ServerPush, StoredEvent } from '../shared/types.ts';
import { apply, replay } from '../shared/reducer.ts';

// append-only 이벤트 로그 + 단일 쓰기 경로(dispatch).
// 서버가 재시작돼도 data/events.jsonl을 재생해 같은 상태로 돌아온다.

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const LOG_FILE = join(DATA_DIR, 'events.jsonl');

type Listener = (push: ServerPush) => void;

class Store {
  private events: StoredEvent[] = [];
  private state: RoomState;
  private listeners = new Set<Listener>();

  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(LOG_FILE)) {
      const lines = readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
      this.events = lines.map((l) => JSON.parse(l) as StoredEvent);
    }
    this.state = replay(this.events);
    // 재시작 시 접속 상태는 의미가 없으므로 모두 오프라인으로 시작
    for (const id of Object.keys(this.state.presence)) this.state.presence[id] = false;
  }

  get(): RoomState {
    return this.state;
  }

  dispatch(event: DomainEvent): StoredEvent {
    const stored: StoredEvent = { seq: this.events.length + 1, at: Date.now(), event };
    this.state = apply(this.state, stored);
    // presence는 휘발성 — 로그에 남기지 않는다
    if (event.type !== 'presence_changed') {
      this.events.push(stored);
      appendFileSync(LOG_FILE, JSON.stringify(stored) + '\n');
    }
    this.broadcast({ kind: 'event', state: this.state, stored });
    return stored;
  }

  reset() {
    const presence = this.state.presence;
    this.events = [];
    writeFileSync(LOG_FILE, '');
    this.state = { ...replay([]), presence };
    this.broadcast({ kind: 'snapshot', state: this.state });
  }

  broadcast(push: ServerPush) {
    for (const l of this.listeners) l(push);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const store = new Store();
