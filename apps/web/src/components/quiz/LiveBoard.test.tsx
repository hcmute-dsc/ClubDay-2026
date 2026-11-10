// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveBoard } from './LiveBoard';
import type { QuizTeamPublic } from '../../lib/types';

/**
 * Hoạt ảnh bảng xếp hạng. jsdom không có layout thật (`offsetTop` luôn 0) và không có
 * Web Animations, nên test giả lập cả hai: mỗi hàng "cao" 50px theo thứ tự trong danh
 * sách, và `animate` là một hàm giả ghi lại lần gọi.
 */
const animate = vi.fn();
const matchMedia = vi.fn();

beforeEach(() => {
  animate.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement ? Array.from(this.parentElement.children).indexOf(this) * 50 : 0;
    },
  });
  matchMedia.mockReturnValue({ matches: false });
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Một đội gồm hai người, đội trưởng là người đầu tiên. */
const p = (id: string, rank: number, score: number, extra: Partial<QuizTeamPublic> = {}): QuizTeamPublic => ({
  id,
  name: id.toUpperCase(),
  color: '#2f80ff',
  members: [
    { id: `${id}-1`, name: `${id}1` },
    { id: `${id}-2`, name: `${id}2` },
  ],
  captainId: `${id}-1`,
  score,
  rank,
  answered: false,
  delta: 0,
  correct: 0,
  wrong: 0,
  ...extra,
});

/** Thứ tự tên đang hiện, từ trên xuống. */
const order = (): string[] =>
  within(screen.getByRole('list', { name: 'Bảng xếp hạng trực tiếp' }))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-row') ?? '');

const board = (teams: QuizTeamPublic[]) => <LiveBoard teams={teams} phase="reveal" limit={10} />;

describe('LiveBoard — hoạt ảnh khi bảng đổi', () => {
  it('lần dựng đầu KHÔNG animate gì (bảng vừa mở, chưa có gì "thay đổi")', () => {
    render(board([p('a', 1, 900), p('b', 2, 800)]));
    expect(animate).not.toHaveBeenCalled();
  });

  it('đổi chỗ → cả hai hàng trượt, đúng hướng và đúng quãng', () => {
    const { rerender } = render(board([p('a', 1, 900), p('b', 2, 800)]));
    rerender(board([p('b', 1, 1700, { delta: 900 }), p('a', 2, 900)]));

    expect(order()).toEqual(['b', 'a']);
    const slides = animate.mock.calls.filter(([frames]) => 'transform' in frames[0] && /translateY/.test(frames[0].transform));
    expect(slides).toHaveLength(2);
    // B từ vị trí 50px lên 0 → bắt đầu ở +50px; A từ 0 xuống 50 → bắt đầu ở -50px.
    const starts = slides.map(([frames]) => frames[0].transform).sort();
    expect(starts).toEqual(['translateY(-50px)', 'translateY(50px)']);
  });

  it('chỉ hàng VƯỢT LÊN mới nháy viền xanh', () => {
    const { rerender } = render(board([p('a', 1, 900), p('b', 2, 800)]));
    rerender(board([p('b', 1, 1700), p('a', 2, 900)]));
    const flashes = animate.mock.calls.filter(([frames]) => 'outline' in frames[0]);
    expect(flashes).toHaveLength(1);
    expect(flashes[0]![0][0].outline).toContain('--color-correct');
  });

  it('không đổi thứ hạng thì không trượt, dù điểm đổi', () => {
    const { rerender } = render(board([p('a', 1, 900), p('b', 2, 800)]));
    rerender(board([p('a', 1, 950), p('b', 2, 800)]));
    expect(animate).not.toHaveBeenCalled();
  });

  it('người MỚI lọt vào bảng trượt vào (mờ → rõ), không giật cục', () => {
    const { rerender } = render(board([p('a', 1, 900), p('b', 2, 800)]));
    rerender(board([p('a', 1, 900), p('b', 2, 800), p('c', 3, 700)]));
    const entering = animate.mock.calls.filter(([frames]) => frames[0].opacity === 0);
    expect(entering).toHaveLength(1);
  });

  it('bật "giảm chuyển động" → không animate, bảng vẫn đổi đúng thứ tự', () => {
    matchMedia.mockReturnValue({ matches: true });
    const { rerender } = render(board([p('a', 1, 900), p('b', 2, 800)]));
    rerender(board([p('b', 1, 1700), p('a', 2, 900)]));
    expect(animate).not.toHaveBeenCalled();
    expect(order()).toEqual(['b', 'a']);
  });
});

describe('LiveBoard — dựng từ bảng cũ (điện thoại lúc công bố)', () => {
  const before = [p('a', 1, 900), p('b', 2, 800), p('c', 3, 100)];
  const after = [p('c', 1, 1100, { delta: 1000 }), p('a', 2, 900), p('b', 3, 800)];

  it('hiện thứ hạng + điểm CŨ trước, rồi mới chuyển sang mới', () => {
    vi.useFakeTimers();
    render(<LiveBoard teams={after} before={before} phase="reveal" />);

    expect(order()).toEqual(['a', 'b', 'c']); // cũ
    expect(screen.getByText('900')).toBeTruthy();

    act(() => void vi.advanceTimersByTime(800));
    expect(order()).toEqual(['c', 'a', 'b']); // mới
    // và lúc chuyển có trượt
    expect(animate.mock.calls.some(([frames]) => /translateY/.test(frames[0].transform ?? ''))).toBe(true);
  });

  it('điểm vừa nhận (+1000) hiện ngay từ đầu, không đợi chuyển', () => {
    vi.useFakeTimers();
    render(<LiveBoard teams={after} before={before} phase="reveal" />);
    expect(screen.getByText('+1000')).toBeTruthy();
  });

  it('không có bảng cũ → hiện thẳng bảng mới, không chờ', () => {
    render(<LiveBoard teams={after} phase="reveal" />);
    expect(order()).toEqual(['c', 'a', 'b']);
  });
});

describe('LiveBoard — nội dung', () => {
  it('rớt ngoài top vẫn ghim dòng của mình ở cuối', () => {
    const many = Array.from({ length: 8 }, (_, i) => p(`p${i}`, i + 1, 1000 - i * 10));
    render(<LiveBoard teams={many} meTeamId="p7" limit={3} phase="question" />);
    expect(order()).toEqual(['p0', 'p1', 'p2', 'p7']);
  });

  it('pha question hiện dấu tick cho đội đã chốt, đội chưa chốt ghi "Đang bàn…", không hiện điểm vừa nhận', () => {
    render(<LiveBoard teams={[p('a', 1, 0, { answered: true }), p('b', 2, 0)]} phase="question" />);
    expect(screen.getAllByLabelText('Đã chốt')).toHaveLength(1);
    expect(screen.getAllByText('Đang bàn…')).toHaveLength(1);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('showCaptain hiện đúng đội trưởng của câu, không thì hiện danh sách thành viên', () => {
    const t = p('a', 1, 0, { captainId: 'a-2' });
    const { rerender } = render(<LiveBoard teams={[t]} phase="question" showCaptain />);
    expect(screen.getByText('Đội trưởng: a2')).toBeTruthy();
    rerender(<LiveBoard teams={[t]} phase="question" />);
    expect(screen.getByText('a1, a2')).toBeTruthy();
  });

  it('đánh dấu đội của mình', () => {
    render(<LiveBoard teams={[p('a', 1, 0), p('b', 2, 0)]} meTeamId="b" phase="reveal" />);
    expect(screen.getAllByText('(đội bạn)')).toHaveLength(1);
  });
});

describe('LiveBoard — chế độ chuyển động', () => {
  const swap = (props: { motion?: 'respect' | 'always' }) => {
    const view = render(<LiveBoard teams={[p('a', 1, 900), p('b', 2, 800)]} phase="reveal" {...props} />);
    view.rerender(<LiveBoard teams={[p('b', 1, 1700), p('a', 2, 900)]} phase="reveal" {...props} />);
  };

  it('máy bật "giảm chuyển động": điện thoại (respect) KHÔNG animate', () => {
    matchMedia.mockReturnValue({ matches: true });
    swap({ motion: 'respect' });
    expect(animate).not.toHaveBeenCalled();
  });

  it('máy bật "giảm chuyển động": màn hình chiếu (always) VẪN animate', () => {
    // Đúng ca đã xảy ra: Windows tắt "Animation effects" → Chrome báo reduce → hiệu ứng mất trên máy BTC.
    matchMedia.mockReturnValue({ matches: true });
    swap({ motion: 'always' });
    expect(animate.mock.calls.some(([frames]) => /translateY/.test(frames[0].transform ?? ''))).toBe(true);
  });

  it('mặc định là respect', () => {
    matchMedia.mockReturnValue({ matches: true });
    swap({});
    expect(animate).not.toHaveBeenCalled();
  });

  it('always không hỏi matchMedia', () => {
    swap({ motion: 'always' });
    expect(matchMedia).not.toHaveBeenCalled();
  });
});
