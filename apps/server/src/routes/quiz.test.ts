import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Test ở tầng ROUTE của Ai là triệu phú: guard quản trị, schema zod, bảng mã lỗi →
 * HTTP, và điều quan trọng nhất — client KHÔNG thấy đáp án trước khi BTC công bố.
 */
const TOKEN = 'mat-khau-test';
const auth = { 'x-admin-token': TOKEN };

let app: FastifyInstance | null = null;
/** File lưu bộ câu hỏi của từng ca test — không bao giờ ghi vào `data/` thật của repo. */
let bankFile = '';
let bankDir = '';

async function boot(): Promise<FastifyInstance> {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('ADMIN_TOKEN', TOKEN);
  bankDir = mkdtempSync(join(tmpdir(), 'quiz-route-'));
  bankFile = join(bankDir, 'quiz-questions.json');
  vi.stubEnv('QUIZ_BANK_FILE', bankFile);
  const { buildApp } = await import('../app.js');
  return buildApp({ logger: false });
}

afterEach(async () => {
  await app?.close();
  app = null;
  if (bankDir) rmSync(bankDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

/** Tạo lượt quiz, cho `n` người vào, bắt đầu. Trả về mã lượt và id người chơi. */
async function startedRound(n = 2) {
  app = await boot();
  const created = await app.inject({ method: 'POST', url: '/api/admin/rounds', headers: auth, payload: { game: 'quiz' } });
  const { roundId } = created.json<{ roundId: string }>();

  const players: string[] = [];
  for (let i = 0; i < n; i++) {
    const res = await app.inject({ method: 'POST', url: '/api/rounds/join', payload: { name: `P${i}`, roundId } });
    players.push(res.json<{ playerId: string }>().playerId);
  }
  const start = await app.inject({ method: 'POST', url: `/api/rounds/${roundId}/start`, headers: auth, payload: {} });
  expect(start.statusCode).toBe(200);
  return { roundId, players };
}

const state = async (roundId: string) =>
  (await app!.inject({ method: 'GET', url: `/api/rounds/${roundId}/state` })).json();

describe('sức chứa & vào lượt', () => {
  it('mặc định 50 người, không theo MAX_PLAYERS chung', async () => {
    app = await boot();
    const res = await app.inject({ method: 'POST', url: '/api/admin/rounds', headers: auth, payload: { game: 'quiz' } });
    expect(res.json().state.maxPlayers).toBe(50);
  });
});

describe('không lộ đáp án', () => {
  it('state đang ở pha question không có `correct`/`explain`', async () => {
    const { roundId } = await startedRound();
    const st = await state(roundId);
    expect(st.quiz).toMatchObject({ phase: 'question', index: 0, total: 40 });
    expect(st.quiz).not.toHaveProperty('correct');
    expect(st.quiz).not.toHaveProperty('explain');
  });

  it('trả lời xong server cũng không nói đúng hay sai', async () => {
    const { roundId, players } = await startedRound(2);
    await new Promise((r) => setTimeout(r, 400)); // qua ngưỡng "quá nhanh"
    const res = await app!.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/quiz/answer`,
      payload: { playerId: players[0], index: 0, choice: 0 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('correct');
  });
});

describe('quyền BTC', () => {
  it('advance không có token → 401', async () => {
    const { roundId } = await startedRound();
    const res = await app!.inject({ method: 'POST', url: `/api/rounds/${roundId}/quiz/advance`, payload: { action: 'reveal' } });
    expect(res.statusCode).toBe(401);
  });

  it('công bố rồi mới sang câu kế; sang câu khi chưa công bố → 409', async () => {
    const { roundId } = await startedRound();
    const adv = (action: string) =>
      app!.inject({ method: 'POST', url: `/api/rounds/${roundId}/quiz/advance`, headers: auth, payload: { action } });

    expect((await adv('next')).statusCode).toBe(409);
    expect((await adv('reveal')).statusCode).toBe(200);
    expect((await state(roundId)).quiz).toHaveProperty('correct');
    expect((await adv('next')).statusCode).toBe(200);
    expect((await state(roundId)).quiz.index).toBe(1);
  });

  it('action lạ → 400', async () => {
    const { roundId } = await startedRound();
    const res = await app!.inject({
      method: 'POST', url: `/api/rounds/${roundId}/quiz/advance`, headers: auth, payload: { action: 'cheat' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('xác thực người chơi & dữ liệu rác', () => {
  it('playerId lạ → 404, không nói gì thêm', async () => {
    const { roundId } = await startedRound();
    const res = await app!.inject({
      method: 'POST', url: `/api/rounds/${roundId}/quiz/answer`, payload: { playerId: 'khong-co', index: 0, choice: 0 },
    });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['ô ngoài A–D', { index: 0, choice: 4 }],
    ['ô âm', { index: 0, choice: -1 }],
    ['ô lẻ', { index: 0, choice: 1.5 }],
    ['thiếu số câu', { choice: 1 }],
  ])('đáp án rác (%s) → 400', async (_, body) => {
    const { roundId, players } = await startedRound();
    const res = await app!.inject({
      method: 'POST', url: `/api/rounds/${roundId}/quiz/answer`, payload: { playerId: players[0], ...body },
    });
    expect(res.statusCode).toBe(400);
  });

  it('quyền không có thật → 400; 50:50 dùng lần hai → 409', async () => {
    const { roundId, players } = await startedRound();
    const use = (kind: string) =>
      app!.inject({
        method: 'POST', url: `/api/rounds/${roundId}/quiz/lifeline`, payload: { playerId: players[0], index: 0, kind },
      });
    expect((await use('hack')).statusCode).toBe(400);
    expect((await use('fifty')).statusCode).toBe(200);
    expect((await use('fifty')).statusCode).toBe(409);
  });

  it.each(['audience', 'phone'])('quyền "%s" đã bỏ → 400', async (kind) => {
    const { roundId, players } = await startedRound();
    const res = await app!.inject({
      method: 'POST', url: `/api/rounds/${roundId}/quiz/lifeline`, payload: { playerId: players[0], index: 0, kind },
    });
    expect(res.statusCode).toBe(400);
  });

  it('x2 ở câu dễ → 409 LIFELINE_LOCKED; sau đó vẫn còn quyền để dùng ở câu Vừa', async () => {
    const { roundId, players } = await startedRound();
    const post = (index: number) =>
      app!.inject({
        method: 'POST', url: `/api/rounds/${roundId}/quiz/lifeline`, payload: { playerId: players[0], index, kind: 'double' },
      });
    const locked = await post(0);
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toMatchObject({ error: 'LIFELINE_LOCKED' });

    // đi tới câu 11 bằng nút của BTC
    for (let i = 0; i < 10; i++) {
      for (const action of ['reveal', 'next']) {
        await app!.inject({ method: 'POST', url: `/api/rounds/${roundId}/quiz/advance`, headers: auth, payload: { action } });
      }
    }
    expect((await state(roundId)).quiz.index).toBe(10);
    expect((await post(10)).statusCode).toBe(200);
  });

  it('người của trò khác không gọi được API của quiz', async () => {
    app = await boot();
    await app.inject({ method: 'POST', url: '/api/admin/rounds', headers: auth, payload: { game: 'math' } });
    const join = await app.inject({ method: 'POST', url: '/api/rounds/join', payload: { name: 'An' } });
    const { playerId, roundId } = join.json<{ playerId: string; roundId: string }>();
    const res = await app.inject({ method: 'GET', url: `/api/rounds/${roundId}/quiz/me?playerId=${playerId}` });
    expect(res.statusCode).toBe(404);
  });
});

// ───────────────────────── import câu hỏi từ file JSON ─────────────────────────

const goodQuestion = (over: Record<string, unknown> = {}) => ({
  text: 'Thủ đô của Việt Nam là gì?',
  options: ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ'],
  answer: 'A',
  level: 1,
  ...over,
});

describe('import câu hỏi', () => {
  const importIt = (data: unknown, fileName = 'de.json') =>
    app!.inject({ method: 'POST', url: '/api/admin/quiz/questions', headers: auth, payload: { fileName, data } });

  it.each([
    ['GET danh sách', 'GET'],
    ['POST import', 'POST'],
  ] as const)('%s không có token → 401', async (_, method) => {
    app = await boot();
    const res = await app.inject({ method, url: '/api/admin/quiz/questions', payload: { data: [] } });
    expect(res.statusCode).toBe(401);
  });

  it('reset không có token → 401', async () => {
    app = await boot();
    expect((await app.inject({ method: 'POST', url: '/api/admin/quiz/questions/reset' })).statusCode).toBe(401);
  });

  it('mặc định: 40 câu có sẵn, KÈM đáp án (vì chỉ BTC xem được)', async () => {
    app = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/admin/quiz/questions', headers: auth });
    const body = res.json();
    expect(body.info).toMatchObject({ source: 'default', count: 40 });
    expect(body.questions).toHaveLength(40);
    expect(body.questions[0]).toHaveProperty('answer');
  });

  it('import thành công → đổi bộ, báo số câu, và LƯU ra file', async () => {
    app = await boot();
    const res = await importIt({ questions: [goodQuestion(), goodQuestion({ text: 'Hai?', level: 2 })] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, saved: true, info: { source: 'imported', count: 2, fileName: 'de.json' } });
    expect(existsSync(bankFile)).toBe(true);
    expect(readFileSync(bankFile, 'utf8')).toContain('Hai?');
  });

  it('lượt bắt đầu SAU import dùng đúng bộ mới: số câu, nội dung, và đáp án đúng chấm đúng', async () => {
    app = await boot();
    await importIt([goodQuestion({ answer: 'B', options: ['Sai 1', 'Đúng', 'Sai 2', 'Sai 3'] })]);

    const created = await app.inject({ method: 'POST', url: '/api/admin/rounds', headers: auth, payload: { game: 'quiz' } });
    const { roundId } = created.json<{ roundId: string }>();
    const join = await app.inject({ method: 'POST', url: '/api/rounds/join', payload: { name: 'An', roundId } });
    const { playerId } = join.json<{ playerId: string }>();
    await app.inject({ method: 'POST', url: `/api/rounds/${roundId}/start`, headers: auth, payload: {} });

    let st = await state(roundId);
    expect(st.quiz).toMatchObject({ total: 1, text: 'Thủ đô của Việt Nam là gì?' });
    expect([...st.quiz.options].sort()).toEqual(['Sai 1', 'Sai 2', 'Sai 3', 'Đúng']);

    // chọn đúng ô chứa chữ "Đúng" rồi công bố → phải được điểm
    await new Promise((r) => setTimeout(r, 400));
    const choice = st.quiz.options.indexOf('Đúng');
    await app.inject({ method: 'POST', url: `/api/rounds/${roundId}/quiz/answer`, payload: { playerId, index: 0, choice } });
    st = await state(roundId);
    expect(st.quiz.phase).toBe('reveal');
    expect(st.quiz.options[st.quiz.correct]).toBe('Đúng');
    expect(st.players[0].score).toBeGreaterThan(0);
  });

  it('import giữa buổi KHÔNG đổi lượt đang chơi', async () => {
    const { roundId } = await startedRound(1);
    await importIt([goodQuestion({ text: 'Bộ mới?' })]);
    const st = await state(roundId);
    expect(st.quiz.total).toBe(40);
    expect(st.quiz.text).not.toBe('Bộ mới?');
  });

  it('file sai → 400 kèm danh sách lỗi theo số câu, và KHÔNG đổi gì', async () => {
    app = await boot();
    const res = await importIt([goodQuestion(), goodQuestion({ answer: 'Z' }), goodQuestion({ options: ['a', 'b'] })]);
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('INVALID_QUESTIONS');
    expect(body.problems.map((p: { question: number }) => p.question)).toEqual([2, 3]);

    const info = (await app.inject({ method: 'GET', url: '/api/admin/quiz/questions', headers: auth })).json().info;
    expect(info).toMatchObject({ source: 'default', count: 40 });
    expect(existsSync(bankFile)).toBe(false);
  });

  it.each([
    ['data không phải mảng câu hỏi', { fileName: 'x.json', data: 'chữ' }],
    ['thiếu data', { fileName: 'x.json' }],
  ])('%s → 400', async (_, payload) => {
    app = await boot();
    const res = await app.inject({ method: 'POST', url: '/api/admin/quiz/questions', headers: auth, payload });
    expect(res.statusCode).toBe(400);
  });

  it('thiếu body hẳn → 400, không sập', async () => {
    app = await boot();
    expect((await app.inject({ method: 'POST', url: '/api/admin/quiz/questions', headers: auth })).statusCode).toBe(400);
  });

  it('cảnh báo được trả về nhưng không chặn', async () => {
    app = await boot();
    const res = await importIt([goodQuestion()]); // toàn câu dễ → x2 không dùng được
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings.join(' ')).toContain('Nhân đôi');
  });

  it('reset → về lại 40 câu có sẵn', async () => {
    app = await boot();
    await importIt([goodQuestion()]);
    const res = await app.inject({ method: 'POST', url: '/api/admin/quiz/questions/reset', headers: auth });
    expect(res.json()).toMatchObject({ ok: true, info: { source: 'default', count: 40 } });
  });

  it('/api/config và danh sách lượt của BTC báo số câu hiện hành', async () => {
    app = await boot();
    await importIt([goodQuestion(), goodQuestion({ text: 'Hai?' }), goodQuestion({ text: 'Ba?' })]);
    expect((await app.inject({ method: 'GET', url: '/api/config' })).json().quizQuestionCount).toBe(3);
    expect((await app.inject({ method: 'GET', url: '/api/admin/rounds', headers: auth })).json().quizBank.count).toBe(3);
  });

  it('người chơi (không token) không đọc được đáp án qua route import', async () => {
    app = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/admin/quiz/questions' });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('answer');
  });
});
