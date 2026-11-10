import type { Player, Round } from './types.js';
import { rankedTeams } from '../services/quiz-session.js';
import type { DashboardRow } from '@clubday/contract';

export type { DashboardRow } from '@clubday/contract';

/**
 * Thời điểm người chơi hoàn thành lượt; +∞ = chưa xong (xếp cuối).
 * Dùng +∞ thay vì 0 để người chưa xong không nhảy lên đầu khi so sánh.
 */
function finishAt(p: Player): number {
  if (p.draw.solvedAt !== null) return p.draw.solvedAt;
  if (p.lastActionAt > 0) return p.lastActionAt;
  return Number.POSITIVE_INFINITY;
}

/**
 * Bảng hạng của đúng 5 người trong lượt — thay cho `ORDER BY` của bản có database.
 * Xếp theo: điểm cao hơn → xong sớm hơn → vào lượt sớm hơn.
 */
export function dashboard(round: Round): DashboardRow[] {
  // Ai là triệu phú xếp hạng theo ĐỘI, không theo người: các thành viên chung một số điểm.
  if (round.game === 'quiz' && round.quiz.teams.length > 0) return quizDashboard(round);

  const started = round.startedAt ?? round.createdAt;

  return [...round.players.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      // Tính nhanh xếp theo CHUỖI DÀI NHẤT, Nhớ nhanh xếp theo CẤP CAO NHẤT —
      // cả hai đều là con số nhỏ nên bằng điểm là chuyện thường gặp. Khi bằng thì
      // ai làm đúng NHIỀU LẦN hơn thắng. Nếu rơi thẳng xuống so thời gian thì
      // người làm ÍT hơn lại xếp trên — `lastActionAt` của họ sớm hơn — ngược hẳn
      // với điều ai cũng nghĩ là công bằng.
      //
      // KHÔNG áp cho game Vẽ: ở đó `correct` luôn bằng 0, và điểm đã tính sẵn
      // thời gian nên thứ tự đúng phải do `finishAt` quyết.
      if (round.game !== 'draw' && b.correct !== a.correct) return b.correct - a.correct;

      const fa = finishAt(a);
      const fb = finishAt(b);
      // So sánh có guard: tránh Infinity - Infinity = NaN làm hỏng sort.
      if (fa !== fb) return fa - fb;
      return a.joinedAt - b.joinedAt;
    })
    .map((p, i) => {
      const f = finishAt(p);
      return {
        rank: i + 1,
        playerId: p.id,
        name: p.name,
        score: p.score,
        correct: p.correct,
        wrong: p.wrong,
        msToFinish: Number.isFinite(f) ? f - started : null,
        solved: p.draw.solved,
        flagged: p.flagged,
      };
    });
}

/**
 * Bảng hạng ĐỘI của Ai là triệu phú. Mỗi dòng là một đội: `playerId` mang mã đội, `name`
 * là tên đội và `members` liệt kê thành viên. Cả phòng đi cùng nhau từng câu nên không có
 * "thời gian hoàn thành" — `msToFinish` luôn null.
 */
function quizDashboard(round: Round): DashboardRow[] {
  return rankedTeams(round).map((t, i) => ({
    rank: i + 1,
    playerId: t.id,
    name: t.name,
    score: t.score,
    correct: t.correct,
    wrong: t.wrong,
    msToFinish: null,
    solved: false,
    flagged: t.memberIds.some((id) => round.players.get(id)?.flagged === true),
    members: t.memberIds.map((id) => round.players.get(id)?.name ?? '?'),
  }));
}
