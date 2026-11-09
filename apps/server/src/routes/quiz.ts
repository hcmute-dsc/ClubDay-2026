import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { QUIZ_LIFELINES } from '@clubday/contract';
import { locatePlayer, statusFor } from './track.js';
import { requireAdmin } from './admin-guard.js';
import { getRound } from '../store/store.js';
import { registerStartHook, registerTickHook } from '../store/lobby.js';
import { toRoundState } from '../store/state.js';
import { QUIZ_BANK_FILE } from '../config.js';
import { parseQuizImport } from '../services/quiz-import.js';
import {
  getQuizBankInfo,
  getQuizQuestions,
  resetQuizQuestions,
  saveQuizBank,
  setQuizQuestions,
} from '../services/quiz-bank-store.js';
import {
  advanceQuiz,
  applyLifeline,
  quizMe,
  startQuiz,
  submitQuizAnswer,
  tickQuiz,
} from '../services/quiz-session.js';

/**
 * TRACK E — AI LÀ TRIỆU PHÚ (API).
 *
 * Ba nhóm route, theo AI được gọi:
 *   - người chơi:  `me`, `answer`, `lifeline`  — xác thực bằng playerId như mọi game
 *   - BTC:         `advance`                     — xác thực bằng x-admin-token
 *   - mọi người:   câu hỏi đang mở đi qua SSE/`state` chung (xem store/state.ts)
 *
 * Câu hỏi KHÔNG có route riêng: cả phòng thấy cùng một câu cùng lúc nên nó nằm
 * trong `RoundState.quiz` và đi theo luồng SSE sẵn có.
 */

const AnswerBody = z.object({
  playerId: z.string().min(1),
  /** Số câu mà người chơi TƯỞNG là đang mở — chặn đáp án muộn rơi vào câu kế. */
  index: z.number().int().min(0),
  choice: z.number().int().min(0).max(3),
});

const LifelineBody = z.object({
  playerId: z.string().min(1),
  index: z.number().int().min(0),
  kind: z.enum(QUIZ_LIFELINES),
});

const AdvanceBody = z.object({ action: z.enum(['reveal', 'next']) });

/**
 * Nội dung file câu hỏi. `questions` để `unknown` có chủ ý: kiểm từng câu là việc của
 * `parseQuizImport` (báo lỗi theo số câu bằng lời người đọc được), còn zod ở đây chỉ
 * cần biết đây là một khối JSON hợp lệ kèm tên file tuỳ chọn.
 */
const ImportBody = z.object({
  fileName: z.string().max(200).optional(),
  data: z.unknown(),
});

/** Ghi bộ câu hỏi ra đĩa. Lỗi ghi file không được làm hỏng import đang chạy trong RAM. */
function persist(log: FastifyInstance['log']): boolean {
  try {
    saveQuizBank(QUIZ_BANK_FILE);
    return true;
  } catch (err) {
    log.warn(`Không lưu được bộ câu hỏi: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function quizRoutes(app: FastifyInstance): Promise<void> {
  // BTC bấm BẮT ĐẦU → sinh đề và mở câu đầu.
  registerStartHook('quiz', (round, now) => startQuiz(round, now));
  // Đồng hồ nền → công bố đáp án khi hết giờ hoặc cả phòng đã chọn xong.
  registerTickHook('quiz', (round, now) => tickQuiz(round, now));

  /** Trạng thái riêng của người chơi: ô đã chọn, quyền đã dùng, gợi ý của câu này. */
  app.get('/api/rounds/:id/quiz/me', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { playerId } = req.query as { playerId?: string };
    if (!playerId) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locatePlayer(id, playerId, 'quiz');
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    return { ...quizMe(located.round, located.player), serverNow: Date.now() };
  });

  /** Chốt đáp án A/B/C/D. Điểm do server quyết định khi công bố — xem quiz-session.ts. */
  app.post('/api/rounds/:id/quiz/answer', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = AnswerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locatePlayer(id, parsed.data.playerId, 'quiz');
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const now = Date.now();
    const outcome = submitQuizAnswer(
      located.round,
      located.player,
      parsed.data.index,
      parsed.data.choice,
      now,
    );
    if (!outcome.ok) {
      return reply.code(statusFor(outcome.code)).send({ error: outcome.code, serverNow: now });
    }
    // KHÔNG trả đúng/sai: đáp án chỉ lộ khi đến lúc công bố cho cả phòng cùng lúc.
    return { ok: true, choice: outcome.choice, serverNow: now };
  });

  /** Dùng một quyền trợ giúp. */
  app.post('/api/rounds/:id/quiz/lifeline', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = LifelineBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locatePlayer(id, parsed.data.playerId, 'quiz');
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const now = Date.now();
    const outcome = applyLifeline(
      located.round,
      located.player,
      parsed.data.kind,
      parsed.data.index,
      now,
    );
    if (!outcome.ok) {
      return reply.code(statusFor(outcome.code)).send({ error: outcome.code, serverNow: now });
    }
    return { ok: true, kind: outcome.kind, hints: outcome.hints, serverNow: now };
  });

  // ───────────── BTC: import / xem bộ câu hỏi ─────────────

  /**
   * Bộ câu hỏi đang dùng, KÈM ĐÁP ÁN ĐÚNG — để BTC xem lại thứ mình vừa import.
   * Vì có đáp án nên chỉ cho BTC (token), không bao giờ cho người chơi.
   */
  app.get('/api/admin/quiz/questions', { preHandler: requireAdmin }, async () => ({
    info: getQuizBankInfo(),
    questions: getQuizQuestions().map((q) => ({
      text: q.text,
      options: q.options,
      answer: q.answer,
      level: q.level,
      category: q.category,
      explain: q.explain,
    })),
  }));

  /**
   * BTC import bộ câu hỏi từ file JSON (xem định dạng ở services/quiz-import.ts).
   *
   * Chỉ áp cho lượt BẮT ĐẦU sau đó — lượt đang chơi đã chụp bộ đề của nó rồi. File sai
   * thì KHÔNG đổi gì và trả đủ danh sách lỗi theo số câu, để sửa một lượt là xong.
   */
  app.post('/api/admin/quiz/questions', { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = ImportBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const result = parseQuizImport(parsed.data.data);
    if (!result.ok) return reply.code(400).send({ error: 'INVALID_QUESTIONS', problems: result.problems });

    setQuizQuestions(result.questions, parsed.data.fileName ?? null);
    const saved = persist(req.log);
    return { ok: true, info: getQuizBankInfo(), warnings: result.warnings, saved };
  });

  /** Bỏ bộ đã import, quay về 40 câu có sẵn. */
  app.post('/api/admin/quiz/questions/reset', { preHandler: requireAdmin }, async (req) => {
    resetQuizQuestions();
    const saved = persist(req.log);
    return { ok: true, info: getQuizBankInfo(), saved };
  });

  /**
   * BTC điều khiển nhịp: `reveal` = công bố đáp án ngay, `next` = sang câu kế.
   *
   * Cần token như mọi thao tác của BTC. Người chơi mở DevTools gọi thẳng cũng chỉ
   * nhận 401 — nút trên màn hình điều khiển chỉ là lối tắt, không phải thứ quyết
   * định quyền.
   */
  app.post('/api/rounds/:id/quiz/advance', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = AdvanceBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const round = getRound(id);
    if (!round || round.game !== 'quiz') return reply.code(404).send({ error: 'NOT_FOUND' });

    const result = advanceQuiz(round, parsed.data.action, Date.now());
    if (!result.ok) return reply.code(statusFor(result.code)).send({ error: result.code });
    return { ok: true, result: result.state, state: toRoundState(round) };
  });
}
