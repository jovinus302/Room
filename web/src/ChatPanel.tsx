import { useEffect, useRef, useState } from 'react';
import type { Member, Message, RoomState } from '@shared/types';
import { describeResponse } from '@shared/reducer';
import { post } from './api';

function fmtTime(at: number) {
  const d = new Date(at);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatPanel({ state, me, typing, onSend }: { state: RoomState; me: Member; typing: string | null; onSend: (t: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [state.messages.length, typing]);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await onSend(t);
      setText('');
    } finally {
      setSending(false);
    }
  };

  const online = state.members.filter((m) => state.presence[m.id]).length;
  const myResp = state.plan?.responses[me.id];

  return (
    <section className="pane chat">
      <div className="pane-head">
        <div>
          <div className="pane-title">👨‍👩‍👧‍👦 {state.roomName}</div>
          <div className="pane-sub">
            구성원 {state.members.length}명 · 접속 {online}명
          </div>
        </div>
        <div className="presence">
          {state.members.map((m) => (
            <span key={m.id} className={`avatar sm ${state.presence[m.id] ? 'is-online' : ''}`} style={{ background: m.color }} title={`${m.name}${state.presence[m.id] ? ' · 접속 중' : ' · 미접속'}`}>
              {m.avatar}
            </span>
          ))}
        </div>
      </div>

      <div className="messages" ref={listRef}>
        {state.messages.length === 0 && (
          <div className="empty-chat">
            <div className="empty-emoji">💬</div>
            평소처럼 대화해 보세요.
            <br />
            <span className="muted">예) 다음 토요일에 가까운 데 놀러 갈까?</span>
          </div>
        )}
        {state.messages.map((m, i) => (
          <Bubble key={m.id} msg={m} prev={state.messages[i - 1]} state={state} me={me} />
        ))}
        {typing && (
          <div className="typing">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            {typing}가 계획을 정리하는 중
          </div>
        )}
      </div>

      {myResp?.by === 'agent' && (
        <div className="estimate-banner">
          <div>
            <b>🤖 자리 비운 사이 Personal Agent가 답해뒀어요</b>
            <div className="muted">
              「{describeResponse(myResp.value, myResp.window)}」 — 근거: {myResp.basis?.join(', ')}
            </div>
          </div>
          <div className="estimate-actions">
            <button className="primary sm" onClick={() => post('respond', { userId: me.id, value: myResp.value, window: myResp.window })}>
              맞아요
            </button>
            <button className="secondary sm" onClick={() => post('respond', { userId: me.id, value: 'prefer', window: 'pm' })}>
              오후만 가능
            </button>
            <button className="secondary sm" onClick={() => post('respond', { userId: me.id, value: 'maybe', window: null })}>
              아직 몰라요
            </button>
          </div>
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="avatar sm" style={{ background: me.color }}>{me.avatar}</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="평소처럼 말해 보세요" autoFocus />
        <button className="primary" disabled={!text.trim() || sending}>
          전송
        </button>
      </form>
    </section>
  );
}

function Bubble({ msg, prev, state, me }: { msg: Message; prev?: Message; state: RoomState; me: Member }) {
  const a = msg.author;
  if (a.kind === 'room-agent') {
    return (
      <div className="msg agent">
        <div className="agent-badge">✦ Room Agent</div>
        <div className="agent-text">{msg.text}</div>
        <div className="msg-time">{fmtTime(msg.at)}</div>
      </div>
    );
  }
  if (a.kind === 'personal-agent') {
    const m = state.members.find((x) => x.id === a.forUserId);
    return (
      <div className="msg personal">
        <div className="personal-badge">
          <span className="avatar xs" style={{ background: m?.color }}>{m?.avatar}</span>
          {m?.name}의 Personal Agent
        </div>
        <div className="agent-text">{msg.text}</div>
        <div className="msg-time">{fmtTime(msg.at)}</div>
      </div>
    );
  }
  const m = state.members.find((x) => x.id === a.id)!;
  const mine = a.id === me.id;
  const grouped = prev?.author.kind === 'member' && prev.author.id === a.id;
  return (
    <div className={`msg member ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
      {!mine && (
        <span className="avatar md" style={{ background: m.color, visibility: grouped ? 'hidden' : 'visible' }}>
          {m.avatar}
        </span>
      )}
      <div className="msg-body">
        {!mine && !grouped && <div className="msg-name">{m.name}</div>}
        <div className="bubble-row">
          <div className="bubble">{msg.text}</div>
          <div className="msg-time">{fmtTime(msg.at)}</div>
        </div>
      </div>
    </div>
  );
}
