/**
 * Bootstrap server. File nền tảng — ĐÓNG BĂNG.
 */
import { buildApp } from './app.js';
import { HOST, PORT, QUIZ_BANK_FILE, SNAPSHOT_FILE, warnIfInsecure } from './config.js';
import { getQuizBankInfo, loadQuizBank } from './services/quiz-bank-store.js';
import { allRounds, startGc } from './store/store.js';
import { startRoundClock } from './store/lobby.js';
import { loadSnapshot, saveSnapshot } from './store/snapshot.js';
import { registerHealth } from './lib/health.js';

warnIfInsecure();

const restored = loadSnapshot(SNAPSHOT_FILE);
if (restored > 0) console.log(`  Khôi phục ${restored} lượt từ ${SNAPSHOT_FILE} (chỉ để xem lại)`);

if (loadQuizBank(QUIZ_BANK_FILE)) {
  console.log(`  Ai là triệu phú: nạp ${getQuizBankInfo().count} câu hỏi đã import từ ${QUIZ_BANK_FILE}`);
}

registerHealth('rounds', () => String(allRounds().length));

const app = await buildApp();

// Đồng hồ nền: kết thúc lượt đúng giờ kể cả khi không còn request nào.
startRoundClock();
startGc();

const save = (): void => {
  try {
    saveSnapshot(SNAPSHOT_FILE);
  } catch (err) {
    app.log.warn(`Không ghi được snapshot: ${err instanceof Error ? err.message : String(err)}`);
  }
};

const saver = setInterval(save, 5_000);
saver.unref();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.log.info(`${sig} — lưu snapshot rồi thoát`);
    save();
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`\n  ClubDay  →  http://localhost:${PORT}`);
  console.log(`  Health   →  http://localhost:${PORT}/api/health\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
