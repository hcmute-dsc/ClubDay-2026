/**
 * Ai là triệu phú — client gọi API.
 *
 * Câu hỏi đang mở KHÔNG có ở đây: cả phòng thấy chung một câu nên nó đi theo
 * `RoundState.quiz` qua SSE (xem `useRoundStream`). File này chỉ lo phần RIÊNG của
 * từng người (ô đã chọn, quyền trợ giúp) và các thao tác của BTC.
 */
import { postJson, request } from './http';
import type { LifelineKind, QuizPhase } from './types';

export interface QuizHints {
  /** Hai đáp án bị 50:50 loại. */
  hidden?: number[];
  doubled?: boolean;
}

export interface QuizMe {
  index: number;
  phase: QuizPhase;
  /** Ô đã chốt ở câu đang mở, `null` = chưa chọn. */
  answer: number | null;
  /** Quyền đã dùng → ở câu số mấy. Có mặt nghĩa là hết quyền. */
  used: Partial<Record<LifelineKind, number>>;
  hints: QuizHints;
  score: number;
  streak: number;
  correct: number;
  wrong: number;
  delta: number;
  serverNow: number;
}

export const quizApi = {
  /** Trạng thái riêng của mình — dùng khi vào lượt và khi tải lại trang. */
  me: (roundId: string, playerId: string) =>
    request<QuizMe>(`/api/rounds/${roundId}/quiz/me?playerId=${encodeURIComponent(playerId)}`),

  /** Chốt đáp án. Server KHÔNG báo đúng/sai — đáp án chỉ lộ khi BTC công bố. */
  answer: (roundId: string, playerId: string, index: number, choice: number) =>
    request<{ ok: true; choice: number }>(
      `/api/rounds/${roundId}/quiz/answer`,
      postJson({ playerId, index, choice }),
    ),

  lifeline: (roundId: string, playerId: string, index: number, kind: LifelineKind) =>
    request<{ ok: true; kind: LifelineKind; hints: QuizHints }>(
      `/api/rounds/${roundId}/quiz/lifeline`,
      postJson({ playerId, index, kind }),
    ),

  /** BTC: `reveal` = công bố đáp án ngay, `next` = sang câu kế. */
  advance: (roundId: string, action: 'reveal' | 'next', token: string) =>
    request<{ ok: true; result: 'revealed' | 'next' | 'finished' }>(
      `/api/rounds/${roundId}/quiz/advance`,
      postJson({ action }, token),
    ),
};
