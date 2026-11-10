/**
 * Ai là triệu phú — client gọi API.
 *
 * Câu hỏi đang mở KHÔNG có ở đây: cả phòng thấy chung một câu nên nó đi theo
 * `RoundState.quiz` qua SSE (xem `useRoundStream`). File này chỉ lo phần RIÊNG của
 * từng người — vai trò trong đội và những đáp án mình được đọc — cùng các thao tác
 * của BTC.
 *
 * Trò này chơi THEO ĐỘI: đáp án và quyền trợ giúp là của cả đội, nhưng chỉ ĐỘI
 * TRƯỞNG của câu đó gọi được `answer` / `lifeline` (người khác nhận `NOT_CAPTAIN`).
 */
import { postJson, request } from './http';
import type { LifelineKind, QuizHints, QuizMe as QuizMeShape } from './types';

export type { QuizHints };

/** `QuizMe` của hợp đồng + giờ server lúc trả lời. */
export type QuizMe = QuizMeShape & { serverNow: number };

export const quizApi = {
  /** Vai trò + đáp án được đọc của mình — dùng khi vào lượt, sang câu mới và khi tải lại trang. */
  me: (roundId: string, playerId: string) =>
    request<QuizMe>(`/api/rounds/${roundId}/quiz/me?playerId=${encodeURIComponent(playerId)}`),

  /** Đội trưởng chốt đáp án cho cả đội. Server KHÔNG báo đúng/sai — đáp án chỉ lộ khi BTC công bố. */
  answer: (roundId: string, playerId: string, index: number, choice: number) =>
    request<{ ok: true; choice: number }>(
      `/api/rounds/${roundId}/quiz/answer`,
      postJson({ playerId, index, choice }),
    ),

  /** Đội trưởng dùng quyền trợ giúp của cả đội. */
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
