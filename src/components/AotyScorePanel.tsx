import type { AotyData } from '../types/music';
import { getScoreVisuals } from '../utils/scoring';

interface AotyScorePanelProps {
  aotyData: AotyData;
}

function formatUserCountNumber(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s*(ratings?|avalia[cç][oõ]es?|votes?|votos?|notas?)\s*/gi, '')
    .trim();
  return cleaned || null;
}

function ScoreMetricRow({
  heading,
  score,
  countText,
}: {
  heading: string;
  score: number | null;
  countText: string | null;
}) {
  const visuals = getScoreVisuals(score);

  return (
    <div className="py-1.5 first:pt-0 last:pb-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-[#94A3B8] leading-none">
        {heading}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <div className="w-9 shrink-0">
          <p
            className={`font-mono text-lg font-bold leading-none tabular-nums text-center ${
              score !== null ? 'text-white' : 'text-[#64748B]'
            }`}
          >
            {score !== null ? score : '—'}
          </p>
          <div className="mt-1 h-[3px] w-full bg-[#374151] overflow-hidden" aria-hidden="true">
            <div
              className={`h-full transition-all duration-200 ${visuals.barClass}`}
              style={{ width: score !== null ? `${score}%` : '0%' }}
            />
          </div>
        </div>

        {countText && (
          <span className="text-[11px] text-[#94A3B8] whitespace-nowrap font-mono tabular-nums">
            {countText}
          </span>
        )}
      </div>
    </div>
  );
}

export function AotyScorePanel({ aotyData }: AotyScorePanelProps) {
  const criticCountText =
    aotyData.criticCount !== null
      ? `${aotyData.criticCount} ${aotyData.criticCount === 1 ? 'resenha' : 'resenhas'}`
      : null;

  const userCountNumber = formatUserCountNumber(aotyData.userCount);
  const userCountText = userCountNumber ? `${userCountNumber} notas` : null;

  return (
    <div
      className="divide-y divide-white/[0.08] border-r border-white/[0.08] pr-3 sm:pr-4 shrink-0"
      aria-label="Notas do Album of the Year"
    >
      <ScoreMetricRow heading="Crítica AOTY" score={aotyData.criticScore} countText={criticCountText} />
      <ScoreMetricRow heading="Usuários AOTY" score={aotyData.userScore} countText={userCountText} />
    </div>
  );
}
