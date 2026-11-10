import { Crown } from 'lucide-react';
import type { QuizTeamPublic } from '../../lib/types';

/**
 * Thẻ đội trên điện thoại: tên, màu, các thành viên và AI LÀ ĐỘI TRƯỞNG của câu này.
 *
 * Màu đội chạy xuyên suốt (viền thẻ, bảng hạng, màn chiếu) để người chơi nhìn lên màn
 * hình chiếu là biết ngay đội mình ở đâu. Đội trưởng đổi mỗi câu nên được đánh dấu
 * bằng vương miện VÀ chữ — không để riêng màu hay icon gánh nghĩa.
 */
export function TeamCard({ team, meId }: { team: QuizTeamPublic; meId: string }) {
  return (
    <section
      aria-label={`Đội của bạn: ${team.name}`}
      className="card border-l-[10px] p-3"
      style={{ borderLeftColor: team.color }}
    >
      <h2 className="flex items-center gap-2 font-display text-lg font-black uppercase leading-tight">
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 border-2 border-line"
          style={{ background: team.color }}
        />
        {team.name}
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label="Thành viên">
        {team.members.map((m) => {
          const captain = m.id === team.captainId;
          return (
            <li
              key={m.id}
              className={`flex items-center gap-1 border-2 border-line px-2 py-0.5 text-sm font-bold ${
                captain ? 'bg-accent text-ink' : 'bg-surface-2'
              }`}
            >
              {captain && <Crown aria-hidden="true" className="h-4 w-4" fill="currentColor" />}
              {m.name}
              {m.id === meId && <span className="text-xs font-black uppercase opacity-70">(bạn)</span>}
              {captain && <span className="sr-only"> — đội trưởng câu này</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
