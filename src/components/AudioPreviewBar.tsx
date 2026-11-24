import { Pause, Play, Volume2, X } from 'lucide-react';
import type { AudioPreviewState } from '../types/music';

interface AudioPreviewBarProps {
  preview: AudioPreviewState | null;
  onTogglePlay: () => void;
  onClose: () => void;
}

export function AudioPreviewBar({ preview, onTogglePlay, onClose }: AudioPreviewBarProps) {
  if (!preview) return null;

  return (
    <div
      role="region"
      aria-label="Reprodutor de prévia de faixa"
      className="fixed bottom-20 right-4 z-40 flex items-center gap-3 rounded-lg border border-white/[0.12] bg-[#161B22]/95 px-4 py-2.5 shadow-xl backdrop-blur-md max-w-[calc(100vw-2rem)] sm:max-w-[340px]"
    >
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={preview.isPlaying ? 'Pausar prévia' : 'Retomar prévia'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors"
      >
        {preview.isPlaying ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white truncate">
          <Volume2 className="h-3.5 w-3.5 text-[#3B82F6] shrink-0" aria-hidden="true" />
          <span className="truncate">{preview.trackTitle}</span>
        </div>
        <p className="text-[11px] text-[#8B949E] truncate">
          {preview.artist} · Prévia 30s
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar reprodutor"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8B949E] hover:bg-white/[0.06] hover:text-white transition-colors"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
