import { useEffect, useRef } from 'react';
import type { Member, MemberResponse, RoomState } from '@shared/types';
import { describeResponse } from '@shared/reducer';
import { attendees, awaitingConfirmation, effectivePlaceId, exclusionReasons, responseCounts, suggestTime } from '@shared/planLogic';
import { post } from './api';

type Flash = Record<string, number>;
const fl = (flash: Flash, key: string) => (flash[key] ? ' flash' : '');

export function PlanBoard({ state, me, flash }: { state: RoomState; me: Member; flash: Flash }) {
  const plan = state.plan;
  const scrollRef = useRef<HTMLDivElement>(null);
  // 확정·변경 감지 순간엔 카드 맨 위(배너·영향 영역)가 보이도록
  const focusKey = `${plan?.status}:${plan?.review?.id ?? ''}:${plan?.version}`;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [focusKey]);
  return (
    <section className="pane board">
      <div className="pane-head">
        <div>
          <div className="pane-title">공동 계획</div>
          <div className="pane-sub">대화가 곧 계획이 됩니다 · 실시간 반영</div>
        </div>
        {plan && <StatusPill state={state} />}
      </div>
      <div className="board-scroll" ref={scrollRef}>{plan ? <PlanCard state={state} me={me} flash={flash} /> : <EmptyBoard />}</div>
    </section>
  );
}

function EmptyBoard() {
  return (
    <div className="empty-board">
      <div className="ghost-card">
        <div className="ghost-line w60" />
        <div className="ghost-line w40" />
        <div className="ghost-chips">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="ghost-chip" />
          ))}
        </div>
        <div className="ghost-line w80" />
        <div className="ghost-line w70" />
      </div>
      <p>
        아직 진행 중인 계획이 없어요.
        <br />
        <span className="muted">대화에서 모임 이야기가 나오면 Room Agent가 이곳에 계획 카드를 만듭니다.</span>
      </p>
    </div>
  );
}

function StatusPill({ state }: { state: RoomState }) {
  const p = state.plan!;
  if (p.review) return <span className="pill pill-warn">재확인 필요</span>;
  if (p.status === 'confirmed') {
    const waiting = awaitingConfirmation(p, p.confirmed?.attendees).length;
    return (
      <span className="pill-group">
        <span className="pill pill-ok">확정 · v{p.version}</span>
        {waiting > 0 && <span className="pill pill-agent">확인 대기 {waiting}명</span>}
      </span>
    );
  }
  return <span className="pill pill-draft">초안 · 조율 중</span>;
}

function PlanCard({ state, me, flash }: { state: RoomState; me: Member; flash: Flash }) {
  const plan = state.plan!;
  const counts = responseCounts(plan);
  const placeId = effectivePlaceId(state);
  const place = state.candidates.find((c) => c.id === placeId);
  const time = plan.confirmed?.time ?? suggestTime(plan);
  const att = plan.confirmed?.attendees ?? attendees(plan);
  const affected = new Set(plan.review?.affected ?? []);
  const confirmed = plan.status === 'confirmed';
  const anyResponse = counts.pending < state.members.length - 1 || counts.agentEstimated > 0;
  const dateParts = plan.dateLabel.split(' · ');
  const nameOf = (id: string) => state.members.find((m) => m.id === id)?.name ?? id;
  // 신뢰 규칙: 추정 응답은 확정으로 승격되지 않는다 (live — 본인이 확인하면 즉시 빠짐)
  const awaiting = awaitingConfirmation(plan, att);
  const verifiedCount = att.length - awaiting.length;

  return (
    <article className={`plan-card${fl(flash, 'plan')}${confirmed ? ' is-confirmed' : ''}`}>
      <div className="plan-top">
      {plan.review && (
        <div className={`review-banner${fl(flash, 'review')}`}>
          <div className="review-icon">⚠️</div>
          <div className="review-body">
            <b>변경 감지 · 재확인이 필요해요</b>
            <div>{plan.review.text}</div>
            <div className="review-actions">
              {plan.review.proposal && (
                <button className="primary sm" onClick={() => post('resolve', { userId: me.id, resolution: 'accept' })}>
                  {plan.review.proposal.time}로 조정
                </button>
              )}
              <button className="secondary sm" onClick={() => post('resolve', { userId: me.id, resolution: 'keep' })}>
                {plan.confirmed?.time} 그대로 유지
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmed && plan.confirmed && !plan.review && (
        <div className={`confirmed-banner${fl(flash, 'confirmed')}`}>
          <div className="confirmed-check">✓</div>
          <div>
            <b>확정된 최신 계획 · v{plan.version}</b>
            <div>
              {dateParts[1] ?? plan.dateLabel} {plan.confirmed.time} · {place?.name} · 참석 {verifiedCount}명 확정
              {awaiting.length > 0 && <> + 확인 대기 {awaiting.length}명</>}
            </div>
            {awaiting.length > 0 && (
              <div className="awaiting-line">
                <span className="badge badge-agent">확인 대기</span>
                {awaiting.map(nameOf).join(' · ')} — Agent 추정 응답이라 본인 확인 전까지 확정 인원에 넣지 않아요
              </div>
            )}
          </div>
        </div>
      )}

      <header className="plan-head">
        <h2>{plan.title}</h2>
        <div className="facts">
          <Fact icon="📅" label="날짜" value={dateParts[1] ?? plan.dateLabel} tag={confirmed ? '확정' : '제안'} tone={confirmed ? 'ok' : 'draft'} />
          <Fact
            icon="⏰"
            label="시간"
            value={confirmed ? time : anyResponse ? time : '미정'}
            tag={confirmed ? (affected.has('time') ? '재확인' : '확정') : anyResponse ? 'Agent 추천' : '미정'}
            tone={affected.has('time') ? 'warn' : confirmed ? 'ok' : anyResponse ? 'suggest' : 'none'}
            className={fl(flash, 'time') + (affected.has('time') ? ' affected' : '')}
          />
          <Fact
            icon="📍"
            label="장소"
            value={confirmed || plan.conditions.length || plan.selectedCandId ? place?.name ?? '후보 없음' : '미정'}
            tag={confirmed ? '확정' : plan.selectedCandId ? '선택됨' : plan.conditions.length ? 'Agent 추천' : '미정'}
            tone={confirmed ? 'ok' : plan.selectedCandId || plan.conditions.length ? 'suggest' : 'none'}
            className={fl(flash, 'place')}
          />
        </div>
      </header>
        {!confirmed && (
          <footer className="confirm-bar">
            <div className="confirm-preview">
              <div className="muted small">확정하면 이렇게 정리돼요</div>
              <div>
                <b>{dateParts[1] ?? plan.dateLabel}</b> · {time} · {place?.name ?? '장소 없음'} · 참석 {verifiedCount}명
                {awaiting.length > 0 && <> + 확인 대기 {awaiting.length}명</>}
              </div>
              {awaiting.length > 0 && (
                <div className="confirm-warn">
                  ⚠ 추정 응답 {awaiting.length}명 — 본인 확인 전 ({awaiting.map(nameOf).join(' · ')}). 확정해도 이 인원은 「확인 대기」로 남아요.
                </div>
              )}
            </div>
            <button className="primary lg" disabled={!place} onClick={() => post('confirm', { userId: me.id })}>
              확정
            </button>
          </footer>
        )}
      </div>

      <section className="sect">
        <div className={`sect-head${fl(flash, 'summary')}`}>
          <h3>응답</h3>
          <div className="counts">
            <span className="count c-prefer">본인 가능 {counts.prefer}</span>
            {counts.maybe > 0 && <span className="count c-maybe">미정 {counts.maybe}</span>}
            {counts.no > 0 && <span className="count c-no">불참 {counts.no}</span>}
            <span className="count c-pending">응답 대기 {counts.pending}</span>
            {counts.agentEstimated > 0 && <span className="count c-agent">Agent 추정 {counts.agentEstimated}</span>}
          </div>
        </div>
        <div className="chips">
          {state.members.map((m) => (
            <MemberChip
              key={m.id}
              m={m}
              r={plan.responses[m.id]}
              isMe={m.id === me.id}
              online={!!state.presence[m.id]}
              className={fl(flash, `member:${m.id}`) + (affected.has(`member:${m.id}`) ? ' affected' : '')}
            />
          ))}
        </div>
      </section>

      <section className="sect">
        <div className="sect-head">
          <h3>조건</h3>
          <span className="muted small">대화에서 나온 제약이 자동으로 쌓여요</span>
        </div>
        {plan.conditions.length === 0 ? (
          <div className="muted small empty-line">아직 조건이 없어요</div>
        ) : (
          <div className="cond-chips">
            {plan.conditions.map((c) => (
              <span key={c.id} className={`cond-chip ${c.by.kind}${fl(flash, `cond:${c.id}`)}`}>
                <span className="cond-icon">{c.by.kind === 'agent' ? '🤖' : '🗣️'}</span>
                {c.text}
                <span className="cond-src">
                  {c.by.kind === 'agent' ? `그룹 기억: ${c.by.basis}` : `${state.members.find((m) => c.by.kind === 'human' && m.id === c.by.userId)?.name} 발언`}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="sect">
        <div className="sect-head">
          <h3>후보 장소</h3>
          <span className="muted small">
            {state.candidates.length - state.candidates.filter((c) => exclusionReasons(plan, c.id).length).length}/{state.candidates.length}곳 가능
          </span>
        </div>
        <ul className="cands">
          {state.candidates.map((c) => {
            const reasons = exclusionReasons(plan, c.id);
            const out = reasons.length > 0;
            const chosen = c.id === placeId;
            const clickable = !out && !confirmed;
            return (
              <li
                key={c.id}
                className={`cand${out ? ' out' : ''}${chosen ? ' chosen' : ''}${clickable ? ' clickable' : ''}${fl(flash, `cand:${c.id}`)}${chosen && affected.has('place') ? ' affected' : ''}`}
                onClick={() => clickable && post('select', { userId: me.id, candId: c.id })}
              >
                <span className="cand-emoji">{c.emoji}</span>
                <div className="cand-main">
                  <div className="cand-name">{c.name}</div>
                  <div className="cand-meta">
                    {c.area} · {c.access} · {c.walk}
                  </div>
                  {out && (
                    <div className="cand-reasons">
                      {reasons.map((r, i) => (
                        <span key={i} className="reason">
                          제외 · {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {chosen && <span className="cand-tag">{confirmed ? '확정' : 'Agent 추천'}</span>}
              </li>
            );
          })}
        </ul>
      </section>


      <details className="log">
        <summary>변경 기록 {plan.log.length}건</summary>
        <ol>
          {[...plan.log].reverse().map((l, i) => (
            <li key={i}>
              <span className="log-time">{new Date(l.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className="log-actor">{l.actor}</span>
              {l.text}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

function Fact({ icon, label, value, tag, tone, className = '' }: { icon: string; label: string; value: string; tag: string; tone: string; className?: string }) {
  return (
    <div className={`fact${className}`}>
      <span className="fact-icon">{icon}</span>
      <div className="fact-main">
        <div className="fact-label">
          {label}
          <span className={`fact-tag t-${tone}`}>{tag}</span>
        </div>
        <div className={`fact-value ${value === '미정' ? 'undecided' : ''}`}>{value}</div>
      </div>
    </div>
  );
}

function MemberChip({ m, r, isMe, online, className }: { m: Member; r?: MemberResponse; isMe: boolean; online: boolean; className: string }) {
  const value = r?.value ?? 'pending';
  const agent = r?.by === 'agent';
  return (
    <div className={`mchip v-${value}${agent ? ' by-agent' : ''}${className}`} title={r?.basis?.join(' / ') ?? r?.note ?? ''}>
      <span className={`avatar sm ${online ? 'is-online' : ''}`} style={{ background: m.color }}>
        {m.avatar}
      </span>
      <div className="mchip-body">
        <div className="mchip-name">
          {m.name}
          {isMe && <span className="me-tag">나</span>}
        </div>
        <div className="mchip-status">{describeResponse(value, r?.window ?? null)}</div>
        {value !== 'pending' && (agent ? <span className="badge badge-agent">Agent 추정·확인 대기</span> : <span className="badge badge-human">본인 응답</span>)}
      </div>
    </div>
  );
}
