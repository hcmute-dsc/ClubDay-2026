// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizGame } from './QuizGame';
import { quizApi, type QuizMe } from '../lib/api-quiz';
import {
  QUIZ_BASE_POINTS,
  QUIZ_QUESTION_MS,
  QUIZ_SPEED_POINTS,
  type QuizPublic,
  type RoundState,
} from '../lib/types';

/**
 * Canh những điều người chơi KHÔNG được thấy sai: không lộ đáp án trước khi BTC
 * công bố, chọn là chốt, quyền trợ giúp hiện đúng kết quả server trả về.
 */
vi.mock('../lib/api-quiz', () => ({
  quizApi: { me: vi.fn(), answer: vi.fn(), lifeline: vi.fn(), advance: vi.fn() },
}));

const meMock = vi.mocked(quizApi.me);
const answerMock = vi.mocked(quizApi.answer);
const lifelineMock = vi.mocked(quizApi.lifeline);

function quizOf(over: Partial<QuizPublic> = {}): QuizPublic {
  const now = Date.now();
  return {
    total: 40,
    index: 6,
    phase: 'question',
    startedAt: now,
    endsAt: now + QUIZ_QUESTION_MS,
    text: 'Thủ đô của Việt Nam là gì?',
    category: 'fun',
    level: 1,
    options: ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ'],
    answered: 0,
    ...over,
  };
}

function stateOf(quiz: QuizPublic): RoundState {
  return {
    roundId: 'ABC123',
    game: 'quiz',
    status: 'playing',
    serverNow: Date.now(),
    startedAt: 0,
    endsAt: Date.now() + 3_600_000,
    maxPlayers: 50,
    players: [
      { id: 'me', name: 'An', score: 870, finished: false, rank: 1, delta: 870 },
      { id: 'p2', name: 'Bình', score: 600, finished: false, rank: 2, delta: 600 },
    ],
    quiz,
  };
}

function meOf(over: Partial<QuizMe> = {}): QuizMe {
  return {
    index: 6,
    phase: 'question',
    answer: null,
    used: {},
    hints: {},
    score: 0,
    streak: 0,
    correct: 0,
    wrong: 0,
    delta: 0,
    serverNow: Date.now(),
    ...over,
  };
}

const renderGame = (quiz: QuizPublic) =>
  render(<QuizGame roundId="ABC123" playerId="me" state={stateOf(quiz)} />);

beforeEach(() => {
  meMock.mockResolvedValue(meOf());
  answerMock.mockResolvedValue({ ok: true, choice: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuizGame — đang trả lời', () => {
  it('hiện câu hỏi, 4 đáp án A–D và KHÔNG có dấu hiệu đáp án đúng', async () => {
    renderGame(quizOf());
    expect(await screen.findByText('Thủ đô của Việt Nam là gì?')).toBeTruthy();
    for (const letter of ['A', 'B', 'C', 'D']) {
      expect(screen.getByRole('button', { name: new RegExp(`Đáp án ${letter}:`) })).toBeTruthy();
    }
    expect(screen.queryByLabelText('Đáp án đúng')).toBeNull();
    expect(screen.queryByText(/Chính xác/)).toBeNull();
  });

  it('chọn một đáp án → gửi đúng số câu và ô; rồi khoá, không chọn lại được', async () => {
    renderGame(quizOf());
    fireEvent.click(await screen.findByRole('button', { name: /Đáp án B:/ }));

    await waitFor(() => expect(answerMock).toHaveBeenCalledWith('ABC123', 'me', 6, 1));
    expect((screen.getByRole('button', { name: /Đáp án C:/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/Đã chốt đáp án B/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Đáp án C:/ }));
    expect(answerMock).toHaveBeenCalledTimes(1);
  });

  it('phím A–D chọn được đáp án (chơi trên máy tính)', async () => {
    renderGame(quizOf());
    await screen.findByText('Thủ đô của Việt Nam là gì?');
    fireEvent.keyDown(window, { key: 'c' });
    await waitFor(() => expect(answerMock).toHaveBeenCalledWith('ABC123', 'me', 6, 2));
  });

  it('hiện điểm nếu chốt NGAY BÂY GIỜ, nằm trong khoảng nền → nền + thưởng tốc độ', async () => {
    renderGame(quizOf());
    const line = await screen.findByText(/Chốt ngay bây giờ/);
    const points = Number(/\+(\d+) điểm/.exec(line.textContent ?? '')?.[1]);
    expect(points).toBeGreaterThanOrEqual(QUIZ_BASE_POINTS);
    expect(points).toBeLessThanOrEqual(QUIZ_BASE_POINTS + QUIZ_SPEED_POINTS);
  });

  it('tải lại trang giữa câu → khôi phục ô đã chọn từ server', async () => {
    meMock.mockResolvedValue(meOf({ answer: 2 }));
    renderGame(quizOf());
    expect(await screen.findByText(/Đã chốt đáp án C/)).toBeTruthy();
  });
});

describe('QuizGame — quyền trợ giúp', () => {
  it('50:50 loại đúng hai đáp án server chỉ ra', async () => {
    lifelineMock.mockResolvedValue({ ok: true, kind: 'fifty', hints: { hidden: [1, 3] } });
    renderGame(quizOf());
    fireEvent.click(await screen.findByRole('button', { name: /50:50/ }));

    await waitFor(() => expect(lifelineMock).toHaveBeenCalledWith('ABC123', 'me', 6, 'fifty'));
    await waitFor(() =>
      expect((screen.getByRole('button', { name: /Đáp án B:/ }) as HTMLButtonElement).disabled).toBe(true),
    );
    expect((screen.getByRole('button', { name: /Đáp án D:/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Đáp án A:/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('chỉ có đúng 2 quyền: 50:50 và Nhân đôi', async () => {
    renderGame(quizOf());
    await screen.findByRole('button', { name: /50:50/ });
    expect(screen.getByRole('button', { name: /Nhân đôi/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Khán giả/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gọi người thân/ })).toBeNull();
  });

  it('x2 bị KHOÁ ở câu dễ và nói rõ lý do, bấm không gọi server', async () => {
    renderGame(quizOf({ level: 1 }));
    const btn = (await screen.findByRole('button', { name: /Nhân đôi/ })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-label')).toContain('mở từ câu mức Vừa');
    fireEvent.click(btn);
    expect(lifelineMock).not.toHaveBeenCalled();
  });

  it('50:50 vẫn dùng được ở câu dễ trong khi x2 bị khoá', async () => {
    renderGame(quizOf({ level: 1 }));
    const fifty = (await screen.findByRole('button', { name: /50:50/ })) as HTMLButtonElement;
    expect(fifty.disabled).toBe(false);
  });

  it.each([2, 3] as const)('x2 mở khoá từ mức %i và gửi đúng yêu cầu', async (level) => {
    lifelineMock.mockResolvedValue({ ok: true, kind: 'double', hints: { doubled: true } });
    renderGame(quizOf({ level }));
    const btn = (await screen.findByRole('button', { name: /Nhân đôi/ })) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(lifelineMock).toHaveBeenCalledWith('ABC123', 'me', 6, 'double'));
    // Đã bật x2 → dòng điểm báo rõ là đã nhân đôi.
    expect(await screen.findByText(/đã nhân đôi/)).toBeTruthy();
  });

  it('quyền đã dùng thì khoá và ghi rõ dùng ở câu mấy', async () => {
    meMock.mockResolvedValue(meOf({ used: { fifty: 2 } }));
    renderGame(quizOf());
    const btn = (await screen.findByRole('button', { name: /50:50/ })) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(true));
    expect(btn.getAttribute('aria-label')).toContain('đã dùng ở câu 3');
  });

  it('server từ chối x2 (LIFELINE_LOCKED) → báo lỗi dễ hiểu', async () => {
    lifelineMock.mockRejectedValue(new Error('LIFELINE_LOCKED'));
    renderGame(quizOf({ level: 2 })); // client tưởng mở khoá nhưng server nói khoá
    fireEvent.click(await screen.findByRole('button', { name: /Nhân đôi/ }));
    expect(await screen.findByText(/chỉ dùng được từ câu mức Vừa/)).toBeTruthy();
  });

  it('không dùng được quyền sau khi đã chốt đáp án', async () => {
    renderGame(quizOf());
    fireEvent.click(await screen.findByRole('button', { name: /Đáp án A:/ }));
    await waitFor(() => expect(answerMock).toHaveBeenCalled());
    expect((screen.getByRole('button', { name: /50:50/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('QuizGame — BTC đã công bố', () => {
  const revealed = (over: Partial<QuizPublic> = {}) =>
    quizOf({ phase: 'reveal', correct: 0, distribution: [3, 1, 0, 0], explain: 'Hà Nội là thủ đô.', ...over });

  it('chọn đúng → báo chính xác, hiện điểm cộng và đáp án', async () => {
    meMock.mockResolvedValue(meOf({ phase: 'reveal', answer: 0, score: 870, delta: 870 }));
    renderGame(revealed());
    expect(await screen.findByText('Chính xác!')).toBeTruthy();
    // Điểm cộng hiện ở thẻ kết quả VÀ ở dòng của mình trên bảng hạng.
    expect(screen.getAllByText('+870').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Đáp án đúng')).toBeTruthy();
    expect(screen.getByText('Hà Nội là thủ đô.')).toBeTruthy();
  });

  it('chọn sai → báo sai và đánh dấu ô mình chọn', async () => {
    meMock.mockResolvedValue(meOf({ phase: 'reveal', answer: 1 }));
    renderGame(revealed());
    expect(await screen.findByText('Tiếc quá, sai rồi')).toBeTruthy();
    expect(screen.getByLabelText('Bạn chọn sai')).toBeTruthy();
  });

  it('không kịp chọn → nói thẳng là chưa kịp chọn', async () => {
    meMock.mockResolvedValue(meOf({ phase: 'reveal', answer: null }));
    renderGame(revealed());
    expect(await screen.findByText('Bạn chưa kịp chọn')).toBeTruthy();
  });

  it('hiện bảng xếp hạng và không còn bàn đáp án để bấm', async () => {
    meMock.mockResolvedValue(meOf({ phase: 'reveal', answer: 0 }));
    renderGame(revealed());
    expect(await screen.findByRole('list', { name: 'Bảng xếp hạng trực tiếp' })).toBeTruthy();
    expect((screen.getByRole('button', { name: /Đáp án B:/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
