import { useCallback, useEffect, useRef, useState } from 'react';
import type { Member, Message, RoomState, StoredEvent } from '@shared/types';
import { fetchMode, post, useRoom } from './api';
import { ChatPanel } from './ChatPanel';
import { PlanBoard } from './PlanBoard';

const SESSION_KEY = 'room.userId';

export interface Toast { id: number; text: string; tone: 'info' | 'warn' | 'ok' }

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

// 이벤트 → 카드에서 깜빡일 영역 키
function flashKeys(e: StoredEvent, s: RoomState): string[] {
  const ev = e.event;
  switch (ev.type) {
    case 'plan_created':
      return ['plan'];
    case 'response_recorded':
      return [`member:${ev.userId}`, 'summary'];
    case 'condition_added':
      return [`cond:${ev.condition.id}`, ...ev.condition.excludes.map((x) => `cand:${x.candId}`)];
    case 'candidate_selected':
      return [`cand:${ev.candId}`, 'place'];
    case 'plan_confirmed':
      return ['confirmed', 'time', 'place'];
    case 'change_detected':
      return ['review', ...ev.review.affected];
    case 'review_resolved':
      return ['confirmed', 'time'];
    default:
      return s ? [] : [];
  }
}

function toastFor(e: StoredEvent, s: RoomState): Toast | null {
  const ev = e.event;
  const last = s.plan?.log[s.plan.log.length - 1];
  if (!last) return null;
  switch (ev.type) {
    case 'plan_created':
    case 'condition_added':
    case 'plan_confirmed':
    case 'review_resolved':
      return { id: e.seq, text: last.text, tone: ev.type === 'plan_confirmed' || ev.type === 'review_resolved' ? 'ok' : 'info' };
    case 'change_detected':
      return { id: e.seq, text: last.text, tone: 'warn' };
    case 'response_recorded':
      return { id: e.seq, text: last.text, tone: ev.response.by === 'agent' ? 'warn' : 'info' };
    default:
      return null;
  }
}

export function App() {
  const [userId, setUserId] = useState<string | null>(readSession);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mode, setMode] = useState('mock');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    fetchMode().then(setMode);
  }, []);

  const onEvent = useCallback((e: StoredEvent, s: RoomState) => {
    const keys = flashKeys(e, s);
    if (keys.length) {
      const stamp = Date.now();
      setFlash((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, stamp])) }));
      timers.current.push(
        window.setTimeout(() => setFlash((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== stamp))), 2600),
      );
    }
    const t = toastFor(e, s);
    if (t) {
      setToasts((ts) => [...ts.slice(-2), t]);
      timers.current.push(window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), 4200));
    }
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const { state, typing, connected } = useRoom(userId, onEvent);

  const login = (id: string | null) => {
    try {
      if (id) sessionStorage.setItem(SESSION_KEY, id);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* 세션 저장 실패해도 메모리 상태로 진행 */
    }
    setUserId(id);
  };

  if (!state) return <div className="boot">연결 중…</div>;
  const me = state.members.find((m) => m.id === userId) ?? null;
  if (!me) return <Login state={state} onLogin={login} />;

  return (
    <div className="app">
      <TopBar state={state} me={me} mode={mode} connected={connected} onLogout={() => login(null)} />
      <main className="panes">
        <ChatPanel state={state} me={me} typing={typing} onSend={(text) => post('message', { userId: me.id, text })} />
        <PlanBoard state={state} me={me} flash={flash} />
      </main>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span className="toast-dot" />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopBar({ state, me, mode, connected, onLogout }: { state: RoomState; me: Member; mode: string; connected: boolean; onLogout: () => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">◆</span>
        <span className="brand-name">Ensemble Room</span>
        <span className="tagline">BAND는 모임을 기록한다. Ensemble Room은 모임을 진행한다.</span>
      </div>
      <div className="topbar-right">
        <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? '실시간 연결됨' : '재연결 중…'}</span>
        <span className="mode">{mode === 'claude' ? 'Claude' : 'Mock'} Agent</span>
        <span className="me">
          <span className="avatar sm" style={{ background: me.color }}>{me.avatar}</span>
          {me.name} <span className="muted">· 참여 중</span>
        </span>
        <button className="ghost" onClick={onLogout} title="다른 구성원으로 전환">
          전환
        </button>
        <button
          className="ghost"
          title="데모 초기화 (모든 탭 공통)"
          onClick={() => {
            if (confirm('데모 상태를 처음으로 되돌릴까요? 모든 탭에 반영됩니다.')) post('reset', {});
          }}
        >
          초기화
        </button>
      </div>
      <span hidden>{state.seq}</span>
    </header>
  );
}

function Login({ state, onLogin }: { state: RoomState; onLogin: (id: string) => void }) {
  const loginable = state.members.filter((m) => m.loginable);
  return (
    <div className="login">
      <div className="login-card">
        <div className="brand login-brand">
          <span className="logo">◆</span>
          <span className="brand-name">Ensemble Room</span>
        </div>
        <h1>
          BAND는 모임을 기록한다.
          <br />
          <em>Ensemble Room은 모임을 진행한다.</em>
        </h1>
        <p className="muted">{state.roomName} · 구성원 {state.members.length}명 — 이 탭에서 참여할 사람을 고르세요.</p>
        <div className="login-choices">
          {loginable.map((m) => (
            <button key={m.id} className="login-choice" onClick={() => onLogin(m.id)}>
              <span className="avatar lg" style={{ background: m.color }}>{m.avatar}</span>
              <span>{m.name}</span>
              {state.presence[m.id] && <span className="online-tag">다른 탭에서 접속 중</span>}
            </button>
          ))}
        </div>
        <p className="hint">탭마다 세션이 분리됩니다. 두 번째 탭을 열어 다른 구성원으로 들어오세요.</p>
        <button className="link" onClick={() => confirm('데모 상태를 처음으로 되돌릴까요?') && post('reset', {})}>
          데모 초기화
        </button>
      </div>
    </div>
  );
}

export type { Message };
