// 도메인 모델 — 서버(단일 쓰기 경로)와 웹(읽기 전용 투영)이 같은 타입과 reducer를 공유한다.

export type MemberId = string;

export interface Member {
  id: MemberId;
  name: string;        // 화면 표기 (예: "엄마")
  avatar: string;      // 이모지
  color: string;       // 아바타 배경
  loginable: boolean;  // 브라우저 탭으로 로그인 가능한 구성원
  memory: string[];    // 그룹 기억 — Personal Agent 추정의 근거
}

export interface Candidate {
  id: string;
  name: string;
  area: string;
  access: string;     // 이동 수단 요약
  walk: string;       // 동선 요약
  tags: CandidateTag[];
  emoji: string;
}
export type CandidateTag = 'car_only' | 'long_walk' | 'indoor' | 'subway' | 'flat';

export type ResponseValue = 'prefer' | 'maybe' | 'no' | 'pending';
export type TimeWindow = 'am' | 'pm' | 'all' | null;

export interface MemberResponse {
  value: ResponseValue;
  window: TimeWindow;
  by: 'human' | 'agent';
  note?: string;        // 원문 요약 / 추정 근거
  basis?: string[];     // agent 추정일 때 근거가 된 그룹 기억
  at: number;
}

export interface Exclusion { candId: string; reason: string }

export interface Condition {
  id: string;
  text: string;
  by: { kind: 'human'; userId: MemberId } | { kind: 'agent'; forUserId: MemberId; basis: string };
  excludes: Exclusion[];
  at: number;
}

export interface Review {
  id: string;
  text: string;                 // 에이전트가 감지한 변경 요약
  triggeredBy: MemberId;
  affected: string[];           // 'time' | 'place' | `member:${id}`
  proposal?: { time: string };  // 제안된 조정안
  at: number;
}

export interface LogEntry { at: number; text: string; actor: string }

export interface Plan {
  id: string;
  title: string;
  dateLabel: string;            // "다음 토요일 · 12/5(토)"
  createdBy: MemberId;
  status: 'draft' | 'confirmed';
  version: number;              // 확정 이후 변경마다 +1
  responses: Record<MemberId, MemberResponse>;
  conditions: Condition[];
  selectedCandId: string | null;
  confirmed: null | {
    time: string;
    placeId: string;
    attendees: MemberId[];
    awaitingAtConfirm: MemberId[]; // 확정 시점에 Agent 추정(본인 확인 전)이던 인원
    by: MemberId;
    at: number;
  };
  review: Review | null;
  log: LogEntry[];
}

export type Author =
  | { kind: 'member'; id: MemberId }
  | { kind: 'room-agent' }
  | { kind: 'personal-agent'; forUserId: MemberId };

export interface Message {
  id: string;
  author: Author;
  text: string;
  at: number;
}

export interface RoomState {
  roomName: string;
  members: Member[];
  candidates: Candidate[];
  presence: Record<MemberId, boolean>;
  messages: Message[];
  plan: Plan | null;
  seq: number;
}

// ---- 이벤트 (append-only 로그 항목) ----

export type DomainEvent =
  | { type: 'message_posted'; message: Message }
  | { type: 'presence_changed'; userId: MemberId; online: boolean }
  | { type: 'plan_created'; planId: string; title: string; dateLabel: string; createdBy: MemberId }
  | {
      type: 'response_recorded';
      userId: MemberId;
      response: MemberResponse;
      actor: string;
    }
  | { type: 'condition_added'; condition: Condition; actor: string }
  | { type: 'candidate_selected'; candId: string; by: MemberId }
  | { type: 'plan_confirmed'; time: string; placeId: string; attendees: MemberId[]; awaitingAtConfirm: MemberId[]; by: MemberId }
  | { type: 'change_detected'; review: Review }
  | { type: 'review_resolved'; resolution: 'accept' | 'keep'; by: MemberId };

export interface StoredEvent { seq: number; at: number; event: DomainEvent }

// 서버 → 웹 스트림 메시지
export type ServerPush =
  | { kind: 'snapshot'; state: RoomState }
  | { kind: 'event'; state: RoomState; stored: StoredEvent }
  | { kind: 'typing'; who: string | null };
