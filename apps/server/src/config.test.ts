import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_KINDS,
  MAX_PLAYERS,
  MAX_PLAYERS_CAP,
  MAX_PLAYERS_CAP_QUIZ,
  MAX_PLAYERS_DEFAULT_QUIZ,
} from './store/types.js';

/** Các trò chơi theo lượt ở booth — Ai là triệu phú có luật sức chứa riêng (xem cuối file). */
const BOOTH_GAMES = GAME_KINDS.filter((g) => g !== 'quiz');

/**
 * Cấu hình đọc biến môi trường MỘT LẦN lúc nạp module, nên mỗi ca test phải nạp
 * lại module sau khi đặt biến — `vi.resetModules()` là chỗ làm việc đó.
 */
async function loadWith(env: Record<string, string>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  // Xoá sạch mọi biến của lần trước, kể cả biến từ .env thật của máy đang chạy.
  vi.stubEnv('MAX_PLAYERS', '');
  for (const g of GAME_KINDS) vi.stubEnv(`MAX_PLAYERS_${g.toUpperCase()}`, '');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./config.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('config — số người tối đa mỗi trò', () => {
  it('không đặt gì thì mọi trò dùng mặc định', async () => {
    const { MAX_PLAYERS_BY_GAME } = await loadWith({});
    for (const g of BOOTH_GAMES) expect(MAX_PLAYERS_BY_GAME[g]).toBe(MAX_PLAYERS);
  });

  it('MAX_PLAYERS đặt mặc định cho các trò ở booth', async () => {
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS: '8' });
    for (const g of BOOTH_GAMES) expect(MAX_PLAYERS_BY_GAME[g]).toBe(8);
  });

  it('MAX_PLAYERS_<TRÒ> đè lên mặc định, chỉ riêng trò đó', async () => {
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS: '8', MAX_PLAYERS_DRAW: '3' });
    expect(MAX_PLAYERS_BY_GAME.draw).toBe(3);
    expect(MAX_PLAYERS_BY_GAME.math).toBe(8);
    expect(MAX_PLAYERS_BY_GAME.memory).toBe(8);
    expect(MAX_PLAYERS_BY_GAME.spot).toBe(8);
  });

  it.each([
    ['chữ', 'nhiều vào'],
    ['số 0', '0'],
    ['số âm', '-2'],
    ['số lẻ', '4.5'],
    ['quá trần', String(MAX_PLAYERS_CAP + 1)],
  ])('giá trị hỏng (%s) thì CẢNH BÁO rồi dùng mặc định, không làm sập server', async (_, raw) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS_MATH: raw });

    expect(MAX_PLAYERS_BY_GAME.math).toBe(MAX_PLAYERS);
    expect(warn).toHaveBeenCalled();
  });

  it('nhận đúng hai đầu của khoảng cho phép', async () => {
    const low = await loadWith({ MAX_PLAYERS: '1' });
    expect(low.MAX_PLAYERS_BY_GAME.math).toBe(1);

    const high = await loadWith({ MAX_PLAYERS: String(MAX_PLAYERS_CAP) });
    expect(high.MAX_PLAYERS_BY_GAME.math).toBe(MAX_PLAYERS_CAP);
  });

  it('mặc định hỏng thì trò không đặt riêng vẫn về hằng số gốc', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS: '999', MAX_PLAYERS_SPOT: '6' });
    expect(MAX_PLAYERS_BY_GAME.math).toBe(MAX_PLAYERS);
    expect(MAX_PLAYERS_BY_GAME.spot).toBe(6);
  });
});

describe('config — Ai là triệu phú (cả khán phòng)', () => {
  it('mặc định 50 người, KHÔNG theo MAX_PLAYERS chung', async () => {
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS: '5' });
    expect(MAX_PLAYERS_BY_GAME.quiz).toBe(MAX_PLAYERS_DEFAULT_QUIZ);
    expect(MAX_PLAYERS_DEFAULT_QUIZ).toBe(50);
  });

  it('MAX_PLAYERS_QUIZ đè được, và trần là 50 chứ không phải 20', async () => {
    const ok = await loadWith({ MAX_PLAYERS_QUIZ: String(MAX_PLAYERS_CAP_QUIZ) });
    expect(ok.MAX_PLAYERS_BY_GAME.quiz).toBe(50);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const over = await loadWith({ MAX_PLAYERS_QUIZ: String(MAX_PLAYERS_CAP_QUIZ + 1) });
    expect(over.MAX_PLAYERS_BY_GAME.quiz).toBe(MAX_PLAYERS_DEFAULT_QUIZ);
    expect(warn).toHaveBeenCalled();
  });

  it('các trò khác vẫn bị trần 20 — nâng trần của quiz không làm lỏng chúng', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS_MATH: '30' });
    expect(MAX_PLAYERS_BY_GAME.math).toBe(MAX_PLAYERS);
  });
});
