import { ApiError, getJson as get, postJson as json, request } from './http';
import type {
  DashboardRow,
  GameKind,
  QuizBankInfo,
  QuizImportProblem,
  RoundState,
  RoundSummary,
} from './types';

/**
 * Phần gọi HTTP nằm ở `lib/http.ts` và dùng chung cho mọi file api-*.
 *
 * Tái xuất ở đây vì màn hình nào cũng đang `import { ApiError } from '../lib/api'`
 * — đổi hết đường import chỉ để dịch chỗ một class là churn không đổi lấy gì.
 */
export { ApiError, serverNow, syncClock } from './http';

export interface ClientConfig {
  signupFormUrl: string;
  signupNameEntry: string;
  /** Trò BTC đang mở. `null` = đang đóng, chưa cho vào lượt mới. */
  activeGame: GameKind | null;
  /** Số người tối đa mỗi lượt, theo từng trò. */
  maxPlayers: Record<GameKind, number>;
  /** Số câu của bộ Ai là triệu phú đang dùng. Server cũ chưa gửi → `undefined`, và màn hình không hiện số câu. */
  quizQuestionCount?: number;
}

/** Một câu trong bộ đang dùng — CÓ đáp án, nên chỉ lấy được bằng mã quản trị. */
export interface QuizBankQuestion {
  text: string;
  options: string[];
  /** Chỉ số (0–3) của đáp án đúng. */
  answer: number;
  level: 1 | 2 | 3;
  category: string;
  explain: string;
}

export interface QuizImportOk {
  ok: true;
  info: QuizBankInfo;
  warnings: string[];
  /** false = import được nhưng KHÔNG ghi được ra đĩa (restart sẽ mất). */
  saved: boolean;
}

/** Lỗi import: server trả 400 `INVALID_QUESTIONS` kèm danh sách lỗi theo số câu. */
export function importProblems(err: unknown): QuizImportProblem[] | null {
  if (!(err instanceof ApiError) || err.code !== 'INVALID_QUESTIONS') return null;
  const data = err.data as { problems?: QuizImportProblem[] } | null;
  return data?.problems ?? null;
}

/** `null` = game đó chưa có lượt nào đang chờ. */
export interface OpenRounds {
  open: Record<GameKind, { roundId: string; players: number } | null>;
  /** Sức chứa mỗi trò một khác → tra theo game, đừng dùng một con số chung. */
  max: Record<GameKind, number>;
}

export interface JoinResponse {
  playerId: string;
  roundId: string;
  game: GameKind;
  state: RoundState;
}

export const api = {
  /**
   * Vào lượt. KHÔNG có `game`: loại trò do BTC chọn ở /admin, server quyết định —
   * client gửi lên cũng không đổi được trò đang chạy.
   */
  join: (name: string, opts: { roundId?: string } = {}) =>
    request<JoinResponse>(
      '/api/rounds/join',
      json({ name, ...(opts.roundId ? { roundId: opts.roundId } : {}) }),
    ),

  state: (roundId: string) => get<RoundState>(`/api/rounds/${roundId}/state`),

  /** Cấu hình công khai (link Form đăng ký). Không chứa gì bí mật. */
  config: () => get<ClientConfig>('/api/config'),

  /** Lượt đang chờ của từng game — trang chủ hiện "3/5 đang chờ". */
  openRounds: () => get<OpenRounds>('/api/rounds/open'),

  dashboard: (roundId: string) =>
    get<{ rows: DashboardRow[] }>(`/api/rounds/${roundId}/dashboard`),

  /** BTC: bắt đầu lượt. */
  startRound: (roundId: string, token: string) =>
    request<{ ok: true }>(`/api/rounds/${roundId}/start`, json({}, token)),

  /** BTC: tạo lượt mới với game chỉ định. */
  createRound: (game: GameKind, token: string) =>
    request<{ roundId: string }>('/api/admin/rounds', json({ game }, token)),

  listRounds: (token: string) =>
    get<{
      activeGame: GameKind | null;
      /** Trò mở gần đây nhất — dùng cho nút "Mở lại" khi đang tạm đóng. */
      lastGame: GameKind;
      maxPlayers: Record<GameKind, number>;
      quizBank: QuizBankInfo;
      rounds: RoundSummary[];
    }>('/api/admin/rounds', token),

  /** BTC: đổi số người mỗi lượt của một trò. Áp cho lượt tạo từ đây về sau. */
  setMaxPlayers: (game: GameKind, value: number, token: string) =>
    request<{ maxPlayers: Record<GameKind, number> }>(
      '/api/admin/max-players',
      json({ game, value }, token),
    ),

  /** BTC: chọn trò được chơi lúc này (`null` = tạm đóng). */
  setActiveGame: (game: GameKind | null, token: string) =>
    request<{ activeGame: GameKind | null; closed: string[] }>(
      '/api/admin/active-game',
      json({ game }, token),
    ),

  /** BTC: xem bộ câu hỏi đang dùng (kèm đáp án). */
  quizQuestions: (token: string) =>
    get<{ info: QuizBankInfo; questions: QuizBankQuestion[] }>('/api/admin/quiz/questions', token),

  /** BTC: import bộ câu hỏi từ nội dung file JSON. Sai thì ném `ApiError` (xem `importProblems`). */
  importQuiz: (data: unknown, fileName: string, token: string) =>
    request<QuizImportOk>('/api/admin/quiz/questions', json({ fileName, data }, token)),

  /** BTC: bỏ bộ đã import, quay về 40 câu có sẵn. */
  resetQuiz: (token: string) =>
    request<{ ok: true; info: QuizBankInfo; saved: boolean }>('/api/admin/quiz/questions/reset', json({}, token)),

  skipRound: (roundId: string, token: string) =>
    request<{ ok: true }>(`/api/admin/rounds/${roundId}/skip`, json({}, token)),
};
