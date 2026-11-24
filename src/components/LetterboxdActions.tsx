import { Bookmark, Check, Eye, Heart, ListPlus, Star } from 'lucide-react';

interface LetterboxdActionsProps {
  isListened: boolean;
  isLiked: boolean;
  isFavorite?: boolean;
  inWatchlist: boolean;
  listCount?: number;
  variant?: 'compact' | 'full';
  disabled?: boolean;
  onToggleListened: () => void;
  onToggleLiked: () => void;
  onToggleFavorite?: () => void;
  onToggleWatchlist: () => void;
  onOpenListPicker?: () => void;
}

export function LetterboxdActions({
  isListened,
  isLiked,
  isFavorite = false,
  inWatchlist,
  listCount = 0,
  variant = 'compact',
  disabled = false,
  onToggleListened,
  onToggleLiked,
  onToggleFavorite,
  onToggleWatchlist,
  onOpenListPicker,
}: LetterboxdActionsProps) {
  if (variant === 'full') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onToggleListened}
          aria-pressed={isListened}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            isListened
              ? 'border-[#22C55E]/60 bg-[#14532D]/50 text-[#4ADE80]'
              : 'border-white/[0.1] bg-[#0E1116] text-[#CBD5E1] hover:border-white/25 hover:text-white'
          }`}
        >
          {isListened ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{isListened ? 'Ouvido' : 'Marcar Ouvido'}</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onToggleLiked}
          aria-pressed={isLiked}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            isLiked
              ? 'border-[#F43F5E]/60 bg-[#4C0519]/60 text-[#FB7185]'
              : 'border-white/[0.1] bg-[#0E1116] text-[#CBD5E1] hover:border-white/25 hover:text-white'
          }`}
        >
          <Heart
            className="h-3.5 w-3.5"
            fill={isLiked ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
          <span>{isLiked ? 'Curtido' : 'Curtir'}</span>
        </button>

        {onToggleFavorite && (
          <button
            type="button"
            disabled={disabled}
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              isFavorite
                ? 'border-[#F59E0B]/60 bg-[#F59E0B]/15 text-[#FBBF24]'
                : 'border-white/[0.1] bg-[#0E1116] text-[#CBD5E1] hover:border-white/25 hover:text-white'
            }`}
          >
            <Star
              className="h-3.5 w-3.5"
              fill={isFavorite ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
            <span>{isFavorite ? 'Favorito' : 'Favoritar'}</span>
          </button>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={onToggleWatchlist}
          aria-pressed={inWatchlist}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            inWatchlist
              ? 'border-[#3B82F6]/60 bg-[#1E3A8A]/50 text-[#60A5FA]'
              : 'border-white/[0.1] bg-[#0E1116] text-[#CBD5E1] hover:border-white/25 hover:text-white'
          }`}
        >
          <Bookmark
            className="h-3.5 w-3.5"
            fill={inWatchlist ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
          <span>{inWatchlist ? 'Na Fila (Quero Ouvir)' : 'Quero Ouvir'}</span>
        </button>

        {onOpenListPicker && (
          <button
            type="button"
            disabled={disabled}
            onClick={onOpenListPicker}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-1.5 text-xs font-semibold text-[#CBD5E1] whitespace-nowrap hover:border-[#3B82F6]/60 hover:text-white transition-colors"
          >
            <ListPlus className="h-3.5 w-3.5 text-[#3B82F6]" aria-hidden="true" />
            <span>
              Adicionar à Lista
              {listCount > 0 && (
                <span className="ml-1 font-mono tabular-nums text-[#60A5FA]">
                  ({listCount})
                </span>
              )}
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onToggleListened();
        }}
        title={isListened ? 'Ouvido (clique para desmarcar)' : 'Marcar como ouvido'}
        aria-label={isListened ? 'Desmarcar ouvido' : 'Marcar como ouvido'}
        aria-pressed={isListened}
        className={`flex h-7 w-7 items-center justify-center rounded border transition-colors ${
          isListened
            ? 'border-[#22C55E]/50 bg-[#14532D]/50 text-[#4ADE80]'
            : 'border-white/[0.08] bg-[#0E1116] text-[#8B949E] hover:border-white/20 hover:text-white'
        }`}
      >
        {isListened ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLiked();
        }}
        title={isLiked ? 'Curtido (clique para desmarcar)' : 'Curtir álbum'}
        aria-label={isLiked ? 'Remover curtida' : 'Curtir álbum'}
        aria-pressed={isLiked}
        className={`flex h-7 w-7 items-center justify-center rounded border transition-colors ${
          isLiked
            ? 'border-[#F43F5E]/50 bg-[#4C0519]/60 text-[#FB7185]'
            : 'border-white/[0.08] bg-[#0E1116] text-[#8B949E] hover:border-white/20 hover:text-white'
        }`}
      >
        <Heart
          className="h-3.5 w-3.5"
          fill={isLiked ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      </button>

      {onToggleFavorite && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={isFavorite ? 'Favorito (clique para remover)' : 'Favoritar álbum'}
          aria-label={isFavorite ? 'Remover dos favoritos' : 'Favoritar álbum'}
          aria-pressed={isFavorite}
          className={`flex h-7 w-7 items-center justify-center rounded border transition-colors ${
            isFavorite
              ? 'border-[#F59E0B]/50 bg-[#F59E0B]/15 text-[#FBBF24]'
              : 'border-white/[0.08] bg-[#0E1116] text-[#8B949E] hover:border-white/20 hover:text-white'
          }`}
        >
          <Star
            className="h-3.5 w-3.5"
            fill={isFavorite ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </button>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onToggleWatchlist();
        }}
        title={inWatchlist ? 'Na fila Quero Ouvir (clique para remover)' : 'Adicionar a Quero Ouvir'}
        aria-label={inWatchlist ? 'Remover de Quero Ouvir' : 'Adicionar a Quero Ouvir'}
        aria-pressed={inWatchlist}
        className={`flex h-7 w-7 items-center justify-center rounded border transition-colors ${
          inWatchlist
            ? 'border-[#3B82F6]/50 bg-[#1E3A8A]/50 text-[#60A5FA]'
            : 'border-white/[0.08] bg-[#0E1116] text-[#8B949E] hover:border-white/20 hover:text-white'
        }`}
      >
        <Bookmark
          className="h-3.5 w-3.5"
          fill={inWatchlist ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      </button>

      {onOpenListPicker && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onOpenListPicker();
          }}
          title="Adicionar a uma lista"
          aria-label="Adicionar álbum a uma lista"
          className={`flex h-7 items-center justify-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors ${
            listCount > 0
              ? 'border-[#3B82F6]/40 bg-[#3B82F6]/15 text-[#60A5FA]'
              : 'border-white/[0.08] bg-[#0E1116] text-[#8B949E] hover:border-white/20 hover:text-white'
          }`}
        >
          <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
          {listCount > 0 && <span className="font-mono tabular-nums">{listCount}</span>}
        </button>
      )}
    </div>
  );
}
