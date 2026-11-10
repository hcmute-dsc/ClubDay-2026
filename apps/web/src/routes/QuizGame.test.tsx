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
  type QuizTeamPublic,
  type RoundState,
} from '../lib/types';

/**
 * Canh những điều người chơi KHÔNG được thấy sai khi chơi THEO ĐỘI:
 *   - đội trưởng KHÔNG thấy chữ đáp án, chỉ người đọc mới thấy phần của mình;
 *   - chỉ đội trưởng chốt được; chọn là chốt cho cả đội;
 *   - không lộ đáp án đúng trước khi BTC công bố;
 *   - quyền trợ giúp là của đội, hiện đúng kết quả server trả về.
 */
vi.mock('../lib/api-quiz', () => ({
  quizApi: { me: vi.fn(), answer: vi.fn(), lifeline: vi.fn(), advance: vi.fn() },
}));

const meMock = vi.mocked(quizApi.me);
const answerMock = vi.mocked(quizApi.answer);
const lifelineMock = vi.mocked(quizApi.lifeline);

const OPTIONS = ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ'];

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
    answered: 0,
    ...over,
  };
}

/** Đội của người chơi "me" gồm An (me) và Bình; `captainId` quyết định ai là đội trưởng câu này. */
function teamsOf(captainId: string, over: Partial<QuizTeamPublic> = {}): QuizTeamPublic[] {
  return [
    {
      id: 't1',
      name: 'Đội Cam',
      color: '#ff7a1a',
      members: [
        { id: 'me', name: 'An' },
        { id: 'p2', name: 'Bình' },
      ],
      captainId,
      score: 870,
      rank: 1,
      answered: false,
      delta: 870,
      correct: 1,
      wrong: 0,
      ...over,
    },
    {
      id: 't2',
      name: 'Đội Xanh',
      color: '#2f80ff',
      members: [{ id: 'p3', name: 'Chi' }],
      captainId: 'p3',
      score: 600,
      rank: 2,
      answered: false,
      delta: 600,
      correct: 1,
      wrong: 0,
    },
  ];
}

function stateOf(quiz: QuizPublic, teams: QuizTeamPublic[]): RoundState {
  return {
    roundId: 'ABC123',
    game: 'quiz',
    status: 'playing',
    serverNow: Date.now(),
    startedAt: 0,
    endsAt: Date.now() + 3_600_000,
    maxPlayers: 50,
    teamSize: 2,
    teams,
    players: [
      { id: 'me', name: 'An', score: 870, finished: false, rank: 1, delta: 870, teamId: 't1' },
      { id: 'p2', name: 'Bình', score: 870, finished: false, rank: 1, delta: 870, teamId: 't1' },
      { id: 'p3', name: 'Chi', score: 600, finished: false, rank: 2, delta: 600, teamId: 't2' },
    ],
    quiz,
  };
}

function meOf(over: Partial<QuizMe> = {}): QuizMe {
  return {
    index: 6,
    phase: 'question',
    teamId: 't1',
    teamName: 'Đội Cam',
    teamColor: '#ff7a1a',
    role: 'captain',
    captainId: 'me',
    captainName: 'An',
    visible: [],
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

/** Mình là đội trưởng câu này. */
const renderCaptain = (quiz: QuizPublic, teams = teamsOf('me')) =>
  render(<QuizGame roundId="ABC123" playerId="me" state={stateOf(quiz, teams)} />);

/** Mình là người đọc; Bình là đội trưởng. */
const renderReader = (quiz: QuizPublic, teams = teamsOf('p2')) =>
  render(<QuizGame roundId="ABC123" playerId="me" state={stateOf(quiz, teams)} />);

const letterBtn = (letter: string) => screen.getByRole('button', { name: `Đáp án ${letter}` }) as HTMLButtonElement;

beforeEach(() => {
  meMock.mockResolvedValue(meOf());
  answerMock.mockResolvedValue({ ok: true, choice: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuizGame — đội trưởng', () => {
  it('thấy câu hỏi và bốn nút A–D NHƯNG KHÔNG có chữ đáp án; KHÔNG lộ đáp án đúng', async () => {
    renderCaptain(quizOf());
    expect(await screen.findByText('Thủ đô của Việt Nam là gì?')).toBeTruthy();
    for (const letter of ['A', 'B', 'C', 'D']) expect(letterBtn(letter)).toBeTruthy();
    for (const text of OPTIONS) expect(screen.queryByText(text)).toBeNull();
    expect(screen.queryByLabelText('Đáp án đúng')).toBeNull();
    expect(screen.queryByText(/chính xác/i)).toBeNull();
  });

  it('nói rõ mình là đội trưởng và phải hỏi đồng đội', async () => {
    renderCaptain(quizOf());
    expect(await screen.findByText(/Bạn là ĐỘI TRƯỞNG câu này/)).toBeTruthy();
    expect(screen.getByText('Đội Cam')).toBeTruthy();
  });

  it('chọn một đáp án → gửi đúng số câu và ô; rồi khoá cả đội, không chọn lại được', async () => {
    renderCaptain(quizOf());
    await screen.findByText('Thủ đô của Việt Nam là gì?');
    fireEvent.click(letterBtn('B'));

    await waitFor(() => expect(answerMock).toHaveBeenCalledWith('ABC123', 'me', 6, 1));
    expect(letterBtn('C').disabled).toBe(true);
    expect(await screen.findByText(/Đội đã chốt đáp án B/)).toBeTruthy();

    fireEvent.click(letterBtn('C'));
    expect(answerMock).toHaveBeenCalledTimes(1);
  });

  it('phím A–D chọn được đáp án (chơi trên máy tính)', async () => {
    renderCaptain(quizOf());
    await screen.findByText('Thủ đô của Việt Nam là gì?');
    fireEvent.keyDown(window, { key: 'c' });
    await waitFor(() => expect(answerMock).toHaveBeenCalledWith('ABC123', 'me', 6, 2));
  });

  it('hiện điểm nếu chốt NGAY BÂY GIỜ, nằm trong khoảng nền → nền + thưởng tốc độ', async () => {
    renderCaptain(quizOf());
    const line = await screen.findByText(/Chốt ngay bây giờ/);
    const points = Number(/\+(\d+) điểm/.exec(line.textContent ?? '')?.[1]);
    expect(points).toBeGreaterThanOrEqual(QUIZ_BASE_POINTS);
    expect(points).toBeLessThanOrEqual(QUIZ_BASE_POINTS + QUIZ_SPEED_POINTS);
  });

  it('tải lại trang giữa câu → khôi phục ô ĐỘI đã chốt từ server', async () => {
    meMock.mockResolvedValue(meOf({ answer: 2 }));
    renderCaptain(quizOf());
    expect(await screen.findByText(/Đội đã chốt đáp án C/)).toBeTruthy();
  });

  it('server nói không phải đội trưởng (NOT_CAPTAIN) → báo lỗi dễ hiểu và cho chọn lại', async () => {
    answerMock.mockRejectedValue(new Error('NOT_CAPTAIN'));
    renderCaptain(quizOf());
    await screen.findByText('Thủ đô của Việt Nam là gì?');
    fireEvent.click(letterBtn('A'));
    expect(await screen.findByText(/không phải đội trưởng/)).toBeTruthy();
    await waitFor(() => expect(letterBtn('B').disabled).toBe(false));
  });

  it('đội chỉ có một người → đội trưởng đọc được đủ chữ đáp án', async () => {
    meMock.mockResolvedValue(meOf({ visible: OPTIONS.map((text, index) => ({ index, text })) }));
    renderCaptain(quizOf());
    expect(await screen.findByRole('button', { name: 'Đáp án A: Hà Nội' })).toBeTruthy();
    expect(screen.getByText(/Đội chỉ có mình bạn/)).toBeTruthy();
  });
});

describe('QuizGame — người đọc', () => {
  const reader = (over: Partial<QuizMe> = {}) =>
    meOf({
      role: 'reader',
      captainId: 'p2',
      captainName: 'Bình',
      visible: [
        { index: 1, text: 'Huế' },
        { index: 3, text: 'Cần Thơ' },
      ],
      ...over,
    });

  it('chỉ thấy phần đáp án của mình (đúng chữ cái), KHÔNG có nút để chốt', async () => {
    meMock.mockResolvedValue(reader());
    renderReader(quizOf());
    expect(await screen.findByText('Huế')).toBeTruthy();
    expect(screen.getByText('Cần Thơ')).toBeTruthy();
    expect(screen.queryByText('Hà Nội')).toBeNull();
    expect(screen.queryByText('Đà Nẵng')).toBeNull();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('D')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Đáp án/ })).toBeNull();
  });

  it('được nhắc đọc to cho đúng đội trưởng', async () => {
    meMock.mockResolvedValue(reader());
    renderReader(quizOf());
    expect(await screen.findByText(/Đọc to đáp án của bạn cho đội trưởng Bình/)).toBeTruthy();
  });

  it('bấm phím A–D không chốt được gì', async () => {
    meMock.mockResolvedValue(reader());
    renderReader(quizOf());
    await screen.findByText('Huế');
    fireEvent.keyDown(window, { key: 'b' });
    expect(answerMock).not.toHaveBeenCalled();
  });

  it('không dùng được quyền trợ giúp — của đội, đội trưởng bấm', async () => {
    meMock.mockResolvedValue(reader());
    renderReader(quizOf({ level: 2 }));
    await screen.findByText('Huế');
    expect((screen.getByRole('button', { name: /50:50/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Nhân đôi/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(lifelineMock).not.toHaveBeenCalled();
  });

  it('đội đã chốt → người đọc cũng thấy, kèm ô đội chọn', async () => {
    meMock.mockResolvedValue(reader({ answer: 3 }));
    renderReader(quizOf(), teamsOf('p2', { answered: true }));
    expect(await screen.findByText(/Đội đã chốt đáp án D/)).toBeTruthy();
  });

  it('mọi đáp án của mình bị 50:50 loại → báo để đội trưởng biết', async () => {
    meMock.mockResolvedValue(reader({ visible: [], hints: { hidden: [1, 3] } }));
    renderReader(quizOf());
    expect(await screen.findByText(/đã bị loại bởi 50:50/)).toBeTruthy();
  });
});

describe('QuizGame — quyền trợ giúp (đội trưởng)', () => {
  it('50:50 loại đúng hai đáp án server chỉ ra', async () => {
    lifelineMock.mockResolvedValue({ ok: true, kind: 'fifty', hints: { hidden: [1, 3] } });
    renderCaptain(quizOf());
    await screen.findByText('Thủ đô của Việt Nam là gì?');
    fireEvent.click(screen.getByRole('button', { name: /50:50/ }));

    await waitFor(() => expect(lifelineMock).toHaveBeenCalledWith('ABC123', 'me', 6, 'fifty'));
    await waitFor(() => expect(letterBtn('B').disabled).toBe(true));
    expect(letterBtn('D').disabled).toBe(true);
    expect(letterBtn('A').disabled).toBe(false);
  });

  it('chỉ có đúng 2 quyền: 50:50 và Nhân đôi', async () => {
    renderCaptain(quizOf());
    await screen.findByRole('button', { name: /50:50/ });
    expect(screen.getByRole('button', { name: /Nhân đôi/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Khán giả/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gọi người thân/ })).toBeNull();
  });

  it('x2 bị KHOÁ ở câu dễ và nói rõ lý do, bấm không gọi server', async () => {
    renderCaptain(quizOf({ level: 1 }));
    const btn = (await screen.findByRole('button', { name: /Nhân đôi/ })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-label')).toContain('mở từ câu mức Vừa');
    fireEvent.click(btn);
    expect(lifelineMock).not.toHaveBeenCalled();
  });

  it('50:50 vẫn dùng được ở câu dễ trong khi x2 bị khoá', async () => {
    renderCaptain(quizOf({ level: 1 }));
    const fifty = (await screen.findByRole('button', { name: /50:50/ })) as HTMLButtonElement;
    expect(fifty.disabled).toBe(false);
  });

  it.each([2, 3] as const)('x2 mở khoá từ mức %i và gửi đúng yêu cầu', async (level) => {
    lifelineMock.mockResolvedValue({ ok: true, kind: 'double', hints: { doubled: true } });
    renderCaptain(quizOf({ level }));
    const btn = (await screen.findByRole('button', { name: /Nhân đôi/ })) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(lifelineMock).toHaveBeenCalledWith('ABC123', 'me', 6, 'double'));
    // Đã bật x2 → dòng điểm báo rõ là đã nhân đôi.
    expect(await screen.findByText(/đã nhân đôi/)).toBeTruthy();
  });

  it('quyền ĐỘI đã dùng thì khoá và ghi rõ dùng ở câu mấy', async () => {
    meMock.mockResolvedValue(meOf({ used: { fifty: 2 } }));
    renderCaptain(quizOf());
    const btn = (await screen.findByRole('button', { name: /50:50/ })) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(true));
    expect(btn.getAttribute('aria-label')).toContain('đã dùng ở câu 3');
  });

  it('server từ chối x2 (LIFELINE_LOCKED) → báo lỗi dễ hiểu', async () => {
    lifelineMock.mockRejectedValue(new Error('LIFELINE_LOCKED'));
    renderCaptain(quizOf({ level: 2 })); // client tưởng mở khoá nhưng server nói khoá
    fireEvent.click(await screen.findByRole('button', { name: /Nhân đôi/ }));
    expect(await screen.findByText(/chỉ dùng được từ câu mức Vừa/)).toBeTruthy();
  });

  it('không dùng được quyền sau khi đã chốt đáp án', async () => {
    renderCaptain(quizOf());
    await screen.findByText('Thủ đô của Việt Nam là gì?');
    fireEvent.click(letterBtn('A'));
    await waitFor(() => expect(answerMock).toHaveBeenCalled());
    expect((screen.getByRole('button', { name: /50:50/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('QuizGame — BTC đã công bố', () => {
  const revealed = (over: Partial<QuizPublic> = {}) =>
    quizOf({
      phase: 'reveal',
      options: OPTIONS,
      correct: 0,
      distribution: [1, 1, 0, 0],
      explain: 'Hà Nội là thủ đô.',
      ...over,
    });

  it('đội chọn đúng → báo chính xác, hiện điểm CỦA ĐỘI, đáp án đủ chữ và lời giải', async () => {
    meMock.mockResolvedValue(meOf({ phase: 'reveal', answer: 0, score: 870, delta: 870 }));
    renderCaptain(revealed());
    expect(await screen.findByText('Cả đội chính xác!')).toBeTruthy();
    // Điểm cộng hiện ở thẻ kết quả VÀ ở dòng đội mình trên bảng hạng.
    expect(screen.getAllByText('+870').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Đáp án đúng')).toBeTruthy();
    expect(screen.getByText('Hà Nội là thủ đô.')).toBeTruthy();
    // Sang pha công bố, bốn đáp án hiện đủ chữ cho mọi người.
    expect(screen.getByText('Hà Nội')).toBeTruthy();
    expect(screen.getByText('Cần Thơ')).toBeTruthy();
  });

  it('đội chọn sai → báo sai và đánh dấu ô đội chọn', async () => {
    meMock.mockResolvedValue(meOf({ phase: 'reveal', answer: 1 }));
    renderCaptain(revealed(), teamsOf('me', { delta: 0 }));
    expect(await screen.findByText('Tiếc quá, đội trả lời sai')).toBeTruthy();
    expect(screen.getByLabelText('Bạn chọn sai')).toBeTruthy();
  });

  it('đội không kịp chốt → nói thẳng là chưa kịp chốt', async () => {
    meMock.mockResolvedValue(meOf({ phase: 'reveal', answer: null }));
    renderReader(revealed(), teamsOf('p2', { delta: 0 }));
    expect(await screen.findByText('Đội chưa kịp chốt')).toBeTruthy();
  });

  it('người đọc cũng thấy kết quả đội và bảng xếp hạng ĐỘI', async () => {
    meMock.mockResolvedValue(meOf({ phase: 'reveal', role: 'reader', captainId: 'p2', answer: 0 }));
    renderReader(revealed());
    expect(await screen.findByRole('list', { name: 'Bảng xếp hạng trực tiếp' })).toBeTruthy();
    expect(screen.getByText('Đội Xanh')).toBeTruthy();
    expect(screen.getByText('(đội bạn)')).toBeTruthy();
  });
});
