import { getScoreVisuals } from '../utils/scoring';

interface ScoreBoxProps {
  score: number | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  mustHear?: boolean;
}

export function ScoreBox({
  score,
  size = 'md',
  showLabel = false,
  mustHear = false,
}: ScoreBoxProps) {
  const visuals = getScoreVisuals(score);

  const sizeClasses =
    size === 'lg'
      ? 'h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl'
      : size === 'sm'
        ? 'h-8 w-10 text-xs'
        : 'h-11 w-12 text-base';

  return (
    <div className="inline-flex items-center gap-3 shrink-0">
      <div
        className={`flex items-center justify-center rounded-md border font-mono font-bold tabular-nums tracking-tight ${sizeClasses} ${visuals.bgClass} ${visuals.textClass} ${visuals.borderClass}`}
        aria-label={
          score !== null ? `Nota ${score} de 100 — ${visuals.label}` : 'Sem nota atribuída'
        }
      >
        {score !== null ? score : '—'}
      </div>

      {showLabel && (
        <div className="flex flex-col">
          <span className={`text-xs font-semibold ${visuals.textClass}`}>
            {visuals.label}
          </span>
          {mustHear && (
            <span className="text-[11px] font-medium text-[#F59E0B]">
              Selo Must Hear
            </span>
          )}
        </div>
      )}
    </div>
  );
}
