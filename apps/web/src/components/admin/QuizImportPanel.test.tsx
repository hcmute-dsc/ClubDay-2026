// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizImportPanel } from './QuizImportPanel';
import { ApiError, api, type QuizBankQuestion } from '../../lib/api';
import type { QuizBankInfo } from '../../lib/types';

/**
 * Canh những gì BTC phải thấy khi import: file sai thì báo LỖI THEO SỐ CÂU và không
 * đổi gì; file đúng thì biết đã nạp bao nhiêu câu và có cảnh báo gì.
 */
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: { quizQuestions: vi.fn(), importQuiz: vi.fn(), resetQuiz: vi.fn() } };
});

const quizQuestions = vi.mocked(api.quizQuestions);
const importQuiz = vi.mocked(api.importQuiz);
const resetQuiz = vi.mocked(api.resetQuiz);

const DEFAULT_INFO: QuizBankInfo = { source: 'default', count: 40, levels: [10, 15, 15], fileName: null, importedAt: null };
const IMPORTED_INFO: QuizBankInfo = { source: 'imported', count: 3, levels: [1, 1, 1], fileName: 'de.json', importedAt: 1 };

const question: QuizBankQuestion = {
  text: 'Câu thử?',
  options: ['Đúng', 'Sai 1', 'Sai 2', 'Sai 3'],
  answer: 0,
  level: 2,
  category: '',
  explain: '',
};

const fileOf = (content: string, name = 'de.json', type = 'application/json') => new File([content], name, { type });

/** `File.text()` chưa có trong jsdom của môi trường này → vá để đọc được nội dung. */
function withText(file: File, content: string): File {
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  return file;
}

async function upload(content: string, name = 'de.json') {
  const input = (await screen.findByLabelText('Chọn file câu hỏi JSON')) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [withText(fileOf(content, name), content)] } });
}

beforeEach(() => {
  quizQuestions.mockResolvedValue({ info: DEFAULT_INFO, questions: [question] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuizImportPanel — trạng thái hiện tại', () => {
  it('nói đang dùng bộ có sẵn, số câu và số câu mỗi mức', async () => {
    render(<QuizImportPanel token="tok" />);
    expect(await screen.findByText(/bộ 40 câu có sẵn/)).toBeTruthy();
    expect(screen.getByText(/10 dễ · 15 vừa · 15 khó/)).toBeTruthy();
    expect(quizQuestions).toHaveBeenCalledWith('tok');
  });

  it('bộ đã import: hiện tên file và có nút quay về bộ có sẵn', async () => {
    quizQuestions.mockResolvedValue({ info: IMPORTED_INFO, questions: [question] });
    render(<QuizImportPanel token="tok" />);
    expect(await screen.findByText(/bộ đã import/)).toBeTruthy();
    expect(screen.getByText(/\(de\.json\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dùng bộ có sẵn/ })).toBeTruthy();
  });

  it('bộ có sẵn thì KHÔNG có nút "Dùng bộ có sẵn" (không có gì để khôi phục)', async () => {
    render(<QuizImportPanel token="tok" />);
    await screen.findByText(/bộ 40 câu có sẵn/);
    expect(screen.queryByRole('button', { name: /Dùng bộ có sẵn/ })).toBeNull();
  });

  it('chưa có token → khoá nút import và nhắc nhập mã', () => {
    render(<QuizImportPanel token="" />);
    expect((screen.getByRole('button', { name: /Import file JSON/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Nhập mã quản trị/)).toBeTruthy();
    expect(quizQuestions).not.toHaveBeenCalled();
  });
});

describe('QuizImportPanel — import', () => {
  it('file đúng → gửi nội dung đã parse + tên file + token, báo đã nạp bao nhiêu câu', async () => {
    importQuiz.mockResolvedValue({ ok: true, info: IMPORTED_INFO, warnings: [], saved: true });
    const onChanged = vi.fn();
    render(<QuizImportPanel token="tok" onChanged={onChanged} />);

    await upload('{"questions":[{"text":"a"}]}', 'de-thi.json');

    await waitFor(() => expect(importQuiz).toHaveBeenCalledWith({ questions: [{ text: 'a' }] }, 'de-thi.json', 'tok'));
    expect(await screen.findByText(/Đã nạp 3 câu từ de-thi\.json/)).toBeTruthy();
    expect(screen.getByText(/Lượt đang chơi giữ nguyên bộ đề/)).toBeTruthy();
    expect(onChanged).toHaveBeenCalledWith(IMPORTED_INFO);
  });

  it('hiện CẢNH BÁO của server (file vẫn hợp lệ)', async () => {
    importQuiz.mockResolvedValue({
      ok: true,
      info: IMPORTED_INFO,
      warnings: ['Không có câu nào mức "vừa" trở lên, nên quyền Nhân đôi (x2) sẽ không dùng được lượt này.'],
      saved: true,
    });
    render(<QuizImportPanel token="tok" />);
    await upload('[]');
    expect(await screen.findByText(/quyền Nhân đôi \(x2\) sẽ không dùng được/)).toBeTruthy();
  });

  it('import được nhưng không ghi được ra đĩa → nói thẳng là restart sẽ mất', async () => {
    importQuiz.mockResolvedValue({ ok: true, info: IMPORTED_INFO, warnings: [], saved: false });
    render(<QuizImportPanel token="tok" />);
    await upload('[]');
    expect(await screen.findByText(/restart server sẽ mất bộ này/)).toBeTruthy();
  });

  it('KHÔNG phải JSON → báo lỗi dễ hiểu và không gọi server', async () => {
    render(<QuizImportPanel token="tok" />);
    await upload('{ đây không phải json');
    expect((await screen.findByRole('alert')).textContent).toContain('không phải file JSON hợp lệ');
    expect(importQuiz).not.toHaveBeenCalled();
  });

  it('server từ chối (INVALID_QUESTIONS) → liệt kê MỌI lỗi theo số câu và nói rõ chưa đổi gì', async () => {
    importQuiz.mockRejectedValue(
      new ApiError('INVALID_QUESTIONS', 400, {
        error: 'INVALID_QUESTIONS',
        problems: [
          { question: 2, message: 'có 3 đáp án, cần đúng 4.' },
          { question: 7, message: 'Thiếu "answer" hoặc sai: phải là chữ A, B, C hoặc D.' },
          { question: null, message: '… và 5 lỗi khác.' },
        ],
      }),
    );
    render(<QuizImportPanel token="tok" />);
    await upload('[{}]');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('chưa đổi gì cả');
    expect(screen.getByText('Câu 2')).toBeTruthy();
    expect(screen.getByText('có 3 đáp án, cần đúng 4.')).toBeTruthy();
    expect(screen.getByText('Câu 7')).toBeTruthy();
    expect(screen.getByText('… và 5 lỗi khác.')).toBeTruthy();
    expect(screen.queryByText(/Đã nạp/)).toBeNull();
  });

  it('lỗi khác (401, mạng) → báo chung, không giả vờ là lỗi file', async () => {
    importQuiz.mockRejectedValue(new ApiError('UNAUTHORIZED', 401));
    render(<QuizImportPanel token="sai" />);
    await upload('[]');
    expect((await screen.findByRole('alert')).textContent).toContain('Không import được');
  });

  it('file quá lớn → từ chối ngay, không đọc, không gọi server', async () => {
    render(<QuizImportPanel token="tok" />);
    const input = (await screen.findByLabelText('Chọn file câu hỏi JSON')) as HTMLInputElement;
    const big = fileOf('x', 'to.json');
    Object.defineProperty(big, 'size', { value: 2_000_000 });
    fireEvent.change(input, { target: { files: [big] } });
    expect((await screen.findByRole('alert')).textContent).toContain('File quá lớn');
    expect(importQuiz).not.toHaveBeenCalled();
  });

  it('lần import sau xoá lỗi của lần trước', async () => {
    importQuiz.mockRejectedValueOnce(
      new ApiError('INVALID_QUESTIONS', 400, { problems: [{ question: 1, message: 'lỗi cũ' }] }),
    );
    importQuiz.mockResolvedValueOnce({ ok: true, info: IMPORTED_INFO, warnings: [], saved: true });
    render(<QuizImportPanel token="tok" />);

    await upload('[]');
    expect(await screen.findByText('lỗi cũ')).toBeTruthy();
    await upload('[]');
    await screen.findByText(/Đã nạp 3 câu/);
    expect(screen.queryByText('lỗi cũ')).toBeNull();
  });
});

describe('QuizImportPanel — khôi phục & xem lại', () => {
  beforeEach(() => {
    quizQuestions.mockResolvedValue({ info: IMPORTED_INFO, questions: [question] });
  });

  it('khôi phục bộ có sẵn chỉ khi BTC xác nhận', async () => {
    resetQuiz.mockResolvedValue({ ok: true, info: DEFAULT_INFO, saved: true });
    const confirm = vi.spyOn(window, 'confirm');
    render(<QuizImportPanel token="tok" />);
    const btn = await screen.findByRole('button', { name: /Dùng bộ có sẵn/ });

    confirm.mockReturnValueOnce(false);
    fireEvent.click(btn);
    expect(resetQuiz).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(btn);
    await waitFor(() => expect(resetQuiz).toHaveBeenCalledWith('tok'));
    expect(await screen.findByText(/Đã quay về 40 câu có sẵn/)).toBeTruthy();
  });

  it('xem lại danh sách kèm đáp án đúng được đánh dấu', async () => {
    render(<QuizImportPanel token="tok" />);
    fireEvent.click(await screen.findByRole('button', { name: /Xem 1 câu hỏi/ }));
    const list = await screen.findByRole('list', { name: 'Danh sách câu hỏi' });
    expect(list.textContent).toContain('Câu thử?');
    expect(list.textContent).toContain('A. Đúng ✓');
    expect(list.textContent).not.toContain('B. Sai 1 ✓');
  });

  it('có nút tải file mẫu', async () => {
    render(<QuizImportPanel token="tok" />);
    expect(await screen.findByRole('button', { name: /File mẫu/ })).toBeTruthy();
  });
});
