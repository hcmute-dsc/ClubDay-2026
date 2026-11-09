/**
 * View-model gửi cho client qua REST và SSE.
 *
 * HÌNH DẠNG nằm ở `@clubday/contract` — web đọc đúng kiểu đó, nên đổi shape là
 * TypeScript bắt lỗi ở cả hai bên ngay lập tức.
 */
import type { Round } from './types.js';
import { dashboard } from './dashboard.js';
import { publicQuiz } from '../services/quiz-session.js';
import { type RoundState } from '@clubday/contract';

export type { RoundState, RoundStatePlayer } from '@clubday/contract';

export function toRoundState(round: Round, now = Date.now()): RoundState {
  const state: RoundState = {
    roundId: round.id,
    game: round.game,
    status: round.status,
    serverNow: now,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    maxPlayers: round.maxPlayers,
    players: [...round.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      finished: p.finished,
    })),
  };
  if (round.game === 'quiz') addQuiz(round, state);
  if (round.game === 'draw' && round.draw.target) {
    state.target = { id: round.draw.target.id, labelVi: round.draw.target.labelVi };
  }
  return state;
}

/**
 * Phần riêng của Ai là triệu phú: câu hỏi đang mở, và danh sách người chơi ĐÃ
 * XẾP HẠNG kèm "đã chọn chưa" và "vừa được bao nhiêu điểm".
 *
 * Server xếp hạng (qua `dashboard`) chứ không để client tự sort theo điểm: luật
 * hoà điểm nằm ở đúng một chỗ, nên màn hình chiếu và điện thoại không bao giờ
 * cãi nhau về ai hạng 3.
 */
function addQuiz(round: Round, state: RoundState): void {
  const quiz = publicQuiz(round);
  if (quiz) state.quiz = quiz;

  // Phòng chờ chưa có điểm: giữ thứ tự vào phòng cho người chơi thấy mình "nhảy vào".
  if (round.status === 'lobby') return;

  state.players = dashboard(round).map((row) => {
    const p = round.players.get(row.playerId)!;
    return {
      id: p.id,
      name: p.name,
      score: p.score,
      finished: p.finished,
      rank: row.rank,
      answered: p.quiz.answer !== null,
      delta: p.quiz.lastDelta,
    };
  });
}
