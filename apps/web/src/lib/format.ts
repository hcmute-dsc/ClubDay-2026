import { DURATION_MS, QUIZ_QUESTION_MS, type GameKind } from './types';

/** Định dạng thời gian còn lại: 1:05 hoặc 0:09 */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Một lượt dài bao lâu, viết cho người đọc. Ai là triệu phú không có thời lượng
 * cố định — BTC điều khiển nhịp — nên nói số câu và thời gian mỗi câu.
 */
export function durationLabel(game: GameKind, quizCount?: number): string {
  if (game !== 'quiz') return `${DURATION_MS[game] / 1000}s`;
  // Số câu do BTC import nên đổi được; chưa biết thì chỉ nói thời gian mỗi câu,
  // chứ không đoán "40 câu" rồi nói sai.
  return quizCount ? `${quizCount} câu · ${QUIZ_QUESTION_MS / 1000}s/câu` : `${QUIZ_QUESTION_MS / 1000}s/câu`;
}

/** Thời gian hoàn thành, ví dụ "12,3 giây" */
export function formatSeconds(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}
