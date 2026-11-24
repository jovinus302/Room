import type { Candidate, Member, RoomState } from './types.ts';

export const MEMBERS: Member[] = [
  { id: 'mom', name: '엄마', avatar: '👩', color: '#FDE2E4', loginable: true, memory: ['가족 모임을 주로 먼저 제안한다'] },
  { id: 'dad', name: '아빠', avatar: '👨', color: '#DCEBFF', loginable: true, memory: ['주말엔 대체로 시간이 된다 (최근 가족 모임 3회 모두 참석)'] },
  { id: 'grandma', name: '할머니', avatar: '👵', color: '#FFF1D6', loginable: false, memory: ['할머니는 오래 걷기 어렵다', '주말 오후엔 대체로 시간이 되신다'] },
  { id: 'grandpa', name: '할아버지', avatar: '👴', color: '#E6F4EA', loginable: false, memory: ['외출은 할머니와 함께 하신다'] },
  { id: 'seoyeon', name: '서연', avatar: '👧', color: '#F3E8FF', loginable: false, memory: [] },
  { id: 'minjun', name: '민준', avatar: '👦', color: '#E0F7FA', loginable: false, memory: [] },
  { id: 'aunt', name: '고모', avatar: '👩‍🦱', color: '#FFE8D9', loginable: false, memory: [] },
  { id: 'uncle', name: '삼촌', avatar: '🧔', color: '#ECEFF1', loginable: false, memory: [] },
];

export const CANDIDATES: Candidate[] = [
  { id: 'museum', name: '국립중앙박물관 · 용산가족공원', area: '서울 용산', access: '지하철 이촌역 바로 연결', walk: '평지 · 실내 위주', tags: ['subway', 'flat', 'indoor'], emoji: '🏛️' },
  { id: 'seoulforest', name: '서울숲', area: '서울 성동', access: '수인분당선 서울숲역 도보 5분', walk: '평지 산책로 · 벤치 많음', tags: ['subway', 'flat'], emoji: '🌳' },
  { id: 'namhan', name: '남한산성 둘레길', area: '경기 광주', access: '버스 환승 1회', walk: '경사로 3km 이상', tags: ['long_walk'], emoji: '⛰️' },
  { id: 'dumulmeori', name: '양평 두물머리', area: '경기 양평', access: '자가용 권장 (대중교통 1시간 40분)', walk: '평지 산책', tags: ['car_only', 'flat'], emoji: '🌊' },
  { id: 'achim', name: '가평 아침고요수목원', area: '경기 가평', access: '자가용 필요', walk: '언덕 정원 2시간 코스', tags: ['car_only', 'long_walk'], emoji: '🌸' },
];

export const ROOM_NAME = '우리 가족방';

export function initialState(): RoomState {
  return {
    roomName: ROOM_NAME,
    members: MEMBERS,
    candidates: CANDIDATES,
    presence: Object.fromEntries(MEMBERS.map((m) => [m.id, false])),
    messages: [],
    plan: null,
    seq: 0,
  };
}

export function memberName(state: Pick<RoomState, 'members'>, id: string): string {
  return state.members.find((m) => m.id === id)?.name ?? id;
}

// 한국어 조사: 받침 유무에 따라 이/가, 은/는 선택
function hasBatchim(word: string): boolean {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return false;
  return (ch - 0xac00) % 28 !== 0;
}
export const iga = (w: string) => w + (hasBatchim(w) ? '이' : '가');
export const eunneun = (w: string) => w + (hasBatchim(w) ? '은' : '는');
