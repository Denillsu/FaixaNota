import {
  Award,
  Check,
  Edit3,
  Heart,
  MessageSquareText,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { PRESET_MOOD_TAGS } from '../data/sampleCatalog';
import type { Album } from '../types/music';
import { getAlbumEffectiveScore } from '../utils/scoring';
import { AlbumArtwork } from './AlbumArtwork';
import { ScoreBox } from './ScoreBox';

interface ReviewsViewProps {
  albums: Album[];
  onSelectAlbum: (albumId: string) => void;
  onUpdateAlbum: (albumId: string, updater: (prev: Album) => Album) => void;
}

type ReviewFilter = 'all' | 'must-hear' | 'acclaimed';
type ReviewSort = 'recent' | 'score-desc' | 'score-asc';

export function ReviewsView({ albums, onSelectAlbum, onUpdateAlbum }: ReviewsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<ReviewFilter>('all');
  const [sortBy, setSortBy] = useState<ReviewSort>('recent');

  // Inline compose / edit drawer state
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [showComposePicker, setShowComposePicker] = useState(false);
  const [draftReviewText, setDraftReviewText] = useState('');
  const [draftMoodTags, setDraftMoodTags] = useState<string[]>([]);
  const [draftMustHear, setDraftMustHear] = useState(false);

  const albumsWithReviews = useMemo(() => {
    return albums
      .filter((a) => a.reviewText.trim().length > 0)
      .map((album) => ({
        album,
        score: getAlbumEffectiveScore(album),
      }));
  }, [albums]);

  const filteredReviews = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return albumsWithReviews
      .filter(({ album, score }) => {
        if (filterMode === 'must-hear' && !album.mustHear) return false;
        if (filterMode === 'acclaimed' && (score === null || score < 80)) return false;

        if (q) {
          const matches =
            album.title.toLowerCase().includes(q) ||
            album.artist.toLowerCase().includes(q) ||
            album.reviewText.toLowerCase().includes(q) ||
            album.moodTags.some((t) => t.toLowerCase().includes(q));
          if (!matches) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score-desc') {
          return (b.score ?? -1) - (a.score ?? -1) || b.album.updatedAt.localeCompare(a.album.updatedAt);
        }
        if (sortBy === 'score-asc') {
          return (a.score ?? 999) - (b.score ?? 999) || b.album.updatedAt.localeCompare(a.album.updatedAt);
        }
        return b.album.updatedAt.localeCompare(a.album.updatedAt);
      });
  }, [albumsWithReviews, filterMode, searchTerm, sortBy]);

  const startEditingAlbum = (album: Album) => {
    setShowComposePicker(false);
    setEditingAlbumId(album.id);
    setDraftReviewText(album.reviewText);
    setDraftMoodTags(album.moodTags);
    setDraftMustHear(album.mustHear);
  };

  const handleSaveInlineReview = (e: FormEvent) => {
    e.preventDefault();
    if (!editingAlbumId) return;
    onUpdateAlbum(editingAlbumId, (prev) => ({
      ...prev,
      reviewText: draftReviewText.trim(),
      moodTags: draftMoodTags,
      mustHear: draftMustHear,
      isListened: draftReviewText.trim().length > 0 ? true : prev.isListened,
      inWatchlist: draftReviewText.trim().length > 0 ? false : prev.inWatchlist,
    }));
    setEditingAlbumId(null);
  };

  const toggleDraftMoodTag = (tag: string) => {
    setDraftMoodTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const editingAlbum = useMemo(
    () => albums.find((a) => a.id === editingAlbumId) ?? null,
    [albums, editingAlbumId]
  );

  const albumsAvailableForCompose = useMemo(() => {
    return [...albums].sort((a, b) => {
      const aHas = a.reviewText.trim().length > 0 ? 1 : 0;
      const bHas = b.reviewText.trim().length > 0 ? 1 : 0;
      if (aHas !== bHas) return aHas - bHas;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [albums]);

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Minhas Reviews</h1>
          <p className="text-sm text-[#8B949E]">
            Resenhas, impressões de escuta e destaques editoriais dos seus álbuns.
          </p>
        </div>

        {albums.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setEditingAlbumId(null);
              setShowComposePicker((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{showComposePicker ? 'Fechar Seleção' : 'Escrever Review'}</span>
          </button>
        )}
      </div>

      {/* Album Picker for Writing a New Review */}
      {showComposePicker && (
        <div className="rounded-lg border border-white/[0.12] bg-[#161B22] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-white">
              Escolha um álbum do catálogo para resenhar
            </h2>
            <button
              type="button"
              onClick={() => setShowComposePicker(false)}
              aria-label="Fechar seleção"
              className="rounded p-1 text-[#8B949E] hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {albumsAvailableForCompose.map((alb) => (
              <button
                key={alb.id}
                type="button"
                onClick={() => startEditingAlbum(alb)}
                className="flex items-center gap-3 rounded-md border border-white/[0.08] bg-[#0E1116] p-2.5 text-left hover:border-[#3B82F6]/60 transition-colors"
              >
                <AlbumArtwork
                  coverUrl={alb.coverUrl}
                  title={alb.title}
                  artist={alb.artist}
                  className="h-11 w-11 rounded-sm shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{alb.title}</p>
                  <p className="text-[11px] text-[#8B949E] truncate">
                    {alb.artist}
                    {alb.reviewText.trim() ? ' · Editar review' : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline Review Editor */}
      {editingAlbum && (
        <form
          onSubmit={handleSaveInlineReview}
          className="rounded-lg border border-[#3B82F6]/40 bg-[#161B22] p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <AlbumArtwork
                coverUrl={editingAlbum.coverUrl}
                title={editingAlbum.title}
                artist={editingAlbum.artist}
                className="h-12 w-12 rounded-sm shrink-0"
              />
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold text-white truncate">
                  {editingAlbum.title}
                </h2>
                <p className="text-xs text-[#8B949E] truncate">
                  {editingAlbum.artist} · {editingAlbum.releaseYear}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingAlbumId(null)}
              aria-label="Cancelar edição"
              className="rounded p-1.5 text-[#8B949E] hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div>
            <label htmlFor="inline-review-text" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
              Sua Review
            </label>
            <textarea
              id="inline-review-text"
              rows={4}
              value={draftReviewText}
              onChange={(e) => setDraftReviewText(e.target.value)}
              placeholder="Escreva suas impressões sobre a produção, letras, sequência de faixas..."
              className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3.5 py-2.5 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-[#CBD5E1]">Clima / Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MOOD_TAGS.map((tag) => {
                const selected = draftMoodTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleDraftMoodTag(tag)}
                    aria-pressed={selected}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-[#3B82F6] bg-[#3B82F6]/20 text-white'
                        : 'border-white/[0.1] bg-[#0E1116] text-[#8B949E] hover:text-white'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
            <button
              type="button"
              onClick={() => setDraftMustHear((v) => !v)}
              aria-pressed={draftMustHear}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                draftMustHear
                  ? 'border-[#F59E0B]/60 bg-[#F59E0B]/15 text-[#FBBF24]'
                  : 'border-white/[0.12] bg-[#0E1116] text-[#CBD5E1] hover:text-white'
              }`}
            >
              <Award className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{draftMustHear ? 'Selo Must Hear ativo' : 'Marcar Must Hear'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingAlbumId(null)}
                className="rounded-md border border-white/[0.12] px-3.5 py-1.5 text-xs font-medium text-[#CBD5E1] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#3B82F6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB]"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Salvar Review</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {albumsWithReviews.length === 0 ? (
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] px-6 py-14 text-center space-y-4">
          <MessageSquareText className="mx-auto h-9 w-9 text-[#64748B]" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-white">
              Nenhuma review escrita ainda
            </h2>
            <p className="text-sm text-[#8B949E] max-w-md mx-auto">
              Escolha um álbum do seu catálogo e registre suas impressões sobre a produção,
              faixas marcantes e conceito do disco.
            </p>
          </div>
          {albums.length > 0 && (
            <button
              type="button"
              onClick={() => setShowComposePicker(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Escrever Primeira Review</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B949E]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar nas reviews..."
                  aria-label="Buscar nas reviews"
                  className="w-full rounded-md border border-white/[0.1] bg-[#161B22] py-2 pl-9 pr-3 text-xs sm:text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                />
              </div>

              <div
                role="group"
                aria-label="Filtrar reviews"
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#161B22] p-1"
              >
                {(
                  [
                    { id: 'all', label: 'Todas' },
                    { id: 'must-hear', label: 'Must Hear' },
                    { id: 'acclaimed', label: 'Nota 80+' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFilterMode(opt.id)}
                    className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      filterMode === opt.id
                        ? 'bg-[#262E3A] text-white'
                        : 'text-[#8B949E] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-3">
              <span className="font-mono text-xs tabular-nums text-[#8B949E]">
                {filteredReviews.length}{' '}
                {filteredReviews.length === 1 ? 'review' : 'reviews'}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ReviewSort)}
                aria-label="Ordenar reviews"
                className="rounded-md border border-white/[0.1] bg-[#161B22] px-3 py-2 text-xs sm:text-sm text-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none"
              >
                <option value="recent">Mais Recentes</option>
                <option value="score-desc">Maior Nota</option>
                <option value="score-asc">Menor Nota</option>
              </select>
            </div>
          </div>

          {filteredReviews.length === 0 ? (
            <div className="rounded-lg border border-white/[0.08] bg-[#161B22] px-6 py-10 text-center">
              <p className="text-sm font-semibold text-white">
                Nenhuma review corresponde a este filtro
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setFilterMode('all');
                }}
                className="mt-3 rounded-md border border-white/[0.12] px-3.5 py-1.5 text-xs font-medium text-[#CBD5E1] hover:text-white"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReviews.map(({ album, score }) => {
                const formattedDate = new Date(album.updatedAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });

                return (
                  <article
                    key={album.id}
                    className="rounded-lg border border-white/[0.08] bg-[#161B22] p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectAlbum(album.id)}
                          className="shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded-md"
                        >
                          <AlbumArtwork
                            coverUrl={album.coverUrl}
                            title={album.title}
                            artist={album.artist}
                            className="h-16 w-16 sm:h-20 sm:w-20 rounded-md transition-transform duration-150 group-hover:scale-[1.03]"
                          />
                        </button>

                        <div className="min-w-0 space-y-1">
                          <button
                            type="button"
                            onClick={() => onSelectAlbum(album.id)}
                            className="text-left block group"
                          >
                            <h2 className="font-display text-lg font-bold text-white truncate group-hover:text-[#3B82F6] transition-colors">
                              {album.title}
                            </h2>
                          </button>
                          <p className="text-xs sm:text-sm text-[#CBD5E1] truncate">
                            {album.artist} · {album.releaseYear} · {album.genre}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#8B949E]">
                            <span>{formattedDate}</span>
                            {album.mustHear && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-semibold text-[#F59E0B]">
                                  <Award className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Must Hear</span>
                                </span>
                              </>
                            )}
                            {album.isFavorite && (
                              <>
                                <span aria-hidden="true">·</span>
                                <Star
                                  className="h-3.5 w-3.5 text-[#F59E0B]"
                                  fill="currentColor"
                                  aria-label="Favorito"
                                />
                              </>
                            )}
                            {album.isLiked && (
                              <>
                                <span aria-hidden="true">·</span>
                                <Heart
                                  className="h-3.5 w-3.5 text-[#FB7185]"
                                  fill="currentColor"
                                  aria-label="Curtido"
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <ScoreBox score={score} size="md" mustHear={album.mustHear} />
                    </div>

                    <p className="whitespace-pre-line text-sm leading-relaxed text-[#E2E8F0]">
                      {album.reviewText}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                      <p className="text-xs text-[#8B949E]">
                        {album.moodTags.length > 0
                          ? album.moodTags.join(' · ')
                          : `${album.tracks.filter((t) => typeof t.score === 'number').length}/${album.tracks.length} faixas avaliadas`}
                      </p>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditingAlbum(album)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] hover:border-white/25 hover:text-white transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectAlbum(album.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-1.5 text-xs font-medium text-[#60A5FA] hover:border-[#3B82F6]/50 hover:text-white transition-colors"
                        >
                          <span>Abrir Estúdio</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
