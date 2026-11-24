import {
  Bookmark,
  Check,
  Disc3,
  ListPlus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Album, AlbumStatusField, CustomList } from '../types/music';
import { AlbumArtwork } from './AlbumArtwork';
import { ScoreBox } from './ScoreBox';

interface WatchlistViewProps {
  albums: Album[];
  lists: CustomList[];
  onSelectAlbum: (albumId: string) => void;
  onToggleAlbumStatus: (albumId: string, field: AlbumStatusField) => void;
  onOpenListPicker: (album: Album) => void;
  onOpenAddModal: () => void;
  onGoToSearch: () => void;
}

type WatchlistSort = 'recent' | 'year-desc' | 'title-asc';

export function WatchlistView({
  albums,
  lists,
  onSelectAlbum,
  onToggleAlbumStatus,
  onOpenListPicker,
  onOpenAddModal,
  onGoToSearch,
}: WatchlistViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [sortBy, setSortBy] = useState<WatchlistSort>('recent');

  const watchlistAlbums = useMemo(
    () => albums.filter((a) => a.inWatchlist),
    [albums]
  );

  const listCountByAlbumId = useMemo(() => {
    const counts = new Map<string, number>();
    lists.forEach((list) => {
      list.items.forEach((item) => {
        counts.set(item.albumId, (counts.get(item.albumId) ?? 0) + 1);
      });
    });
    return counts;
  }, [lists]);

  const genres = useMemo(() => {
    const set = new Set<string>();
    watchlistAlbums.forEach((a) => {
      if (a.genre.trim()) set.add(a.genre.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [watchlistAlbums]);

  const filteredAlbums = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return watchlistAlbums
      .filter((album) => {
        if (q) {
          const matches =
            album.title.toLowerCase().includes(q) ||
            album.artist.toLowerCase().includes(q) ||
            album.genre.toLowerCase().includes(q);
          if (!matches) return false;
        }
        if (genreFilter !== 'all' && album.genre !== genreFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'year-desc') return b.releaseYear - a.releaseYear;
        if (sortBy === 'title-asc') return a.title.localeCompare(b.title, 'pt-BR');
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [watchlistAlbums, searchTerm, genreFilter, sortBy]);

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Quero Ouvir (Watchlist)
          </h1>
          <p className="text-sm text-[#8B949E]">
            Sua fila pessoal de discos salvos para escutar e avaliar depois.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onGoToSearch}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-[#161B22] px-3.5 py-2 text-xs font-semibold text-[#CBD5E1] hover:border-white/25 hover:text-white transition-colors whitespace-nowrap"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Explorar</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Adicionar Álbum</span>
          </button>
        </div>
      </div>

      {watchlistAlbums.length === 0 ? (
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] px-6 py-14 text-center space-y-4">
          <Bookmark className="mx-auto h-9 w-9 text-[#3B82F6]" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-white">
              Sua fila Quero Ouvir está vazia
            </h2>
            <p className="text-sm text-[#8B949E] max-w-md mx-auto">
              Toque no marcador de fila ao buscar um álbum ou dentro de qualquer disco do seu
              catálogo para guardar suas próximas escutas.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Buscar e Salvar na Fila</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                  placeholder="Filtrar fila Quero Ouvir..."
                  aria-label="Filtrar fila Quero Ouvir"
                  className="w-full rounded-md border border-white/[0.1] bg-[#161B22] py-2 pl-9 pr-3 text-xs sm:text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                />
              </div>

              {genres.length > 1 && (
                <select
                  value={genreFilter}
                  onChange={(e) => setGenreFilter(e.target.value)}
                  aria-label="Filtrar por gênero"
                  className="rounded-md border border-white/[0.1] bg-[#161B22] px-3 py-2 text-xs sm:text-sm text-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none"
                >
                  <option value="all">Todos os gêneros</option>
                  {genres.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3">
              <span className="font-mono text-xs tabular-nums text-[#8B949E]">
                {filteredAlbums.length}{' '}
                {filteredAlbums.length === 1 ? 'álbum na fila' : 'álbuns na fila'}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as WatchlistSort)}
                aria-label="Ordenar fila Quero Ouvir"
                className="rounded-md border border-white/[0.1] bg-[#161B22] px-3 py-2 text-xs sm:text-sm text-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none"
              >
                <option value="recent">Adicionados Recentemente</option>
                <option value="year-desc">Ano de Lançamento</option>
                <option value="title-asc">Título (A–Z)</option>
              </select>
            </div>
          </div>

          {filteredAlbums.length === 0 ? (
            <div className="rounded-lg border border-white/[0.08] bg-[#161B22] px-6 py-10 text-center">
              <p className="text-sm font-semibold text-white">
                Nenhum disco encontrado com esse filtro
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setGenreFilter('all');
                }}
                className="mt-3 rounded-md border border-white/[0.12] px-3.5 py-1.5 text-xs font-medium text-[#CBD5E1] hover:text-white"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAlbums.map((album) => {
                const listCount = listCountByAlbumId.get(album.id) ?? 0;

                return (
                  <article
                    key={album.id}
                    className="flex flex-col justify-between gap-4 rounded-lg border border-white/[0.08] bg-[#161B22] p-4 hover:border-white/[0.18] transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <button
                        type="button"
                        onClick={() => onSelectAlbum(album.id)}
                        className="shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded-md"
                      >
                        <AlbumArtwork
                          coverUrl={album.coverUrl}
                          title={album.title}
                          artist={album.artist}
                          className="h-20 w-20 sm:h-24 sm:w-24 rounded-md transition-transform duration-150 group-hover:scale-[1.03]"
                        />
                      </button>

                      <div className="min-w-0 flex-1 space-y-1">
                        <button
                          type="button"
                          onClick={() => onSelectAlbum(album.id)}
                          className="text-left block w-full group"
                        >
                          <h2 className="font-display text-base font-bold text-white truncate group-hover:text-[#3B82F6] transition-colors">
                            {album.title}
                          </h2>
                        </button>
                        <p className="text-sm text-[#CBD5E1] truncate">{album.artist}</p>
                        <p className="text-xs text-[#8B949E] truncate font-mono tabular-nums">
                          {album.releaseYear} · {album.genre} · {album.tracks.length} faixas
                        </p>

                        {album.aotyData && (album.aotyData.criticScore !== null || album.aotyData.userScore !== null) && (
                          <div className="flex items-center gap-3 pt-1.5">
                            {album.aotyData.criticScore !== null && (
                              <div className="flex items-center gap-1.5">
                                <ScoreBox score={album.aotyData.criticScore} size="sm" />
                                <span className="text-[11px] text-[#8B949E]">Crítica AOTY</span>
                              </div>
                            )}
                            {album.aotyData.userScore !== null && (
                              <div className="flex items-center gap-1.5">
                                <ScoreBox score={album.aotyData.userScore} size="sm" />
                                <span className="text-[11px] text-[#8B949E]">Usuários</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleAlbumStatus(album.id, 'isListened')}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#22C55E]/50 bg-[#14532D]/40 px-3 py-1.5 text-xs font-semibold text-[#4ADE80] hover:bg-[#14532D]/70 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Já Ouvi</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectAlbum(album.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] hover:border-white/25 hover:text-white transition-colors"
                        >
                          <Disc3 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Avaliar</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenListPicker(album)}
                          title="Adicionar a uma lista"
                          aria-label={`Adicionar ${album.title} a uma lista`}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            listCount > 0
                              ? 'border-[#3B82F6]/40 bg-[#3B82F6]/15 text-[#60A5FA]'
                              : 'border-white/[0.1] bg-[#0E1116] text-[#8B949E] hover:text-white'
                          }`}
                        >
                          <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          {listCount > 0 && <span className="font-mono tabular-nums">{listCount}</span>}
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggleAlbumStatus(album.id, 'inWatchlist')}
                          title="Remover de Quero Ouvir"
                          aria-label={`Remover ${album.title} de Quero Ouvir`}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.1] bg-[#0E1116] text-[#8B949E] hover:border-[#EF4444]/40 hover:text-[#F87171] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
