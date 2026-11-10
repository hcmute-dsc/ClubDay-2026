/**
 * View-model gửi cho client qua REST và SSE.
 *
 * HÌNH DẠNG nằm ở `@clubday/contract` — web đọc đúng kiểu đó, nên đổi shape là
 * TypeScript bắt lỗi ở cả hai bên ngay lập tức.
 */
import type { Round } from './types.js';
import { getQuizTeamSize } from './store.js';
import { publicQuiz, publicTeams, rankedTeams } from '../services/quiz-session.js';
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
 * Phần riêng của Ai là triệu phú: câu hỏi đang mở, các ĐỘI đã xếp hạng, và danh sách
 * người chơi xếp theo hạng đội kèm "đội đã chốt chưa" và "đội vừa được bao nhiêu điểm".
 *
 * Server xếp hạng (qua `rankedTeams`) chứ không để client tự sort theo điểm: luật hoà
 * điểm nằm ở đúng một chỗ, nên màn hình chiếu và điện thoại không bao giờ cãi nhau về
 * đội nào hạng 3.
 */
function addQuiz(round: Round, state: RoundState): void {
  const quiz = publicQuiz(round);
  if (quiz) state.quiz = quiz;

  // Phòng chờ báo trước số người mỗi đội; từ lúc bắt đầu thì dùng con số đã chốt.
  state.teamSize = round.quiz.teamSize || getQuizTeamSize();

  // Phòng chờ chưa có đội: giữ thứ tự vào phòng cho người chơi thấy mình "nhảy vào".
  if (round.quiz.teams.length === 0) return;

  state.teams = publicTeams(round);
  state.players = rankedTeams(round).flatMap((team, i) =>
    team.memberIds.flatMap((id) => {
      const p = round.players.get(id);
      if (!p) return [];
      return [
        {
          id: p.id,
          name: p.name,
          score: team.score,
          finished: p.finished,
          rank: i + 1,
          answered: team.answer !== null,
          delta: team.lastDelta,
          teamId: team.id,
        },
      ];
    }),
  );
}
