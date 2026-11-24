import {
  Award,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ListOrdered,
  Plus,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { POPULAR_SEARCH_SUGGESTIONS } from '../data/sampleCatalog';
import type {
  Album,
  AlbumStatusField,
  CustomList,
  LibraryStatusTab,
  ScoreTierFilter,
  SortOption,
  ViewMode,
} from '../types/music';
import { getAlbumEffectiveScore, getScoreVisuals } from '../utils/scoring';
import { AlbumArtwork } from './AlbumArtwork';
import { LetterboxdActions } from './LetterboxdActions';
import { ScoreBox } from './ScoreBox';

interface CatalogViewProps {
  albums: Album[];
  lists: CustomList[];
  onSelectAlbum: (albumId: string) => void;
  onOpenAddModal: (initialQuery?: string) => void;
  onLoadSamplePack: () => void;
  onToggleAlbumStatus: (albumId: string, field: AlbumStatusField) => void;
  onOpenListPicker: (album: Album) => void;
}

export function CatalogView({
  albums,
  lists,
  onSelectAlbum,
  onOpenAddModal,
  onLoadSamplePack,
  onToggleAlbumStatus,
  onOpenListPicker,
}: CatalogViewProps) {
  const [statusTab, setStatusTab] = useState<LibraryStatusTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState<ScoreTierFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('score-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [quickHeroQuery, setQuickHeroQuery] = useState('');
  const carouselRef = useRef<HTMLDivElement | null>(null);

  const scrollCarousel = (direction: -1 | 1) => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * 360, behavior: 'smooth' });
  };

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
    albums.forEach((a) => {
      if (a.genre.trim()) set.add(a.genre.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [albums]);

  const years = useMemo(() => {
    const set = new Set<number>();
    albums.forEach((a) => set.add(a.releaseYear));
    return Array.from(set).sort((a, b) => b - a);
  }, [albums]);

  const enrichedAlbums = useMemo(() => {
    return albums.map((album) => {
      const score = getAlbumEffectiveScore(album);
      const ratedCount = album.tracks.filter((t) => typeof t.score === 'number').length;
      return { album, score, ratedCount };
    });
  }, [albums]);

  const statusCounts = useMemo(() => {
    return {
      all: albums.length,
      rated: enrichedAlbums.filter((e) => e.score !== null).length,
      listened: albums.filter((a) => a.isListened).length,
      liked: albums.filter((a) => a.isLiked).length,
    };
  }, [albums, enrichedAlbums]);

  const topAlbum = useMemo(() => {
    if (enrichedAlbums.length === 0) return null;
    const sorted = [...enrichedAlbums].sort((a, b) => {
      const scoreA = a.score ?? -1;
      const scoreB = b.score ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.album.updatedAt.localeCompare(a.album.updatedAt);
    });
    return sorted[0];
  }, [enrichedAlbums]);

  const collectionStats = useMemo(() => {
    const totalTracksRated = albums.reduce(
      (sum, a) => sum + a.tracks.filter((t) => typeof t.score === 'number').length,
      0
    );
    const mustHearCount = albums.filter((a) => a.mustHear).length;
    const ratedAlbums = enrichedAlbums.filter((e) => e.score !== null);
    const avgScore =
      ratedAlbums.length > 0
        ? Math.round(
            ratedAlbums.reduce((sum, e) => sum + (e.score ?? 0), 0) / ratedAlbums.length
          )
        : null;
    return {
      totalAlbums: albums.length,
      totalTracksRated,
      mustHearCount,
      avgScore,
    };
  }, [albums, enrichedAlbums]);

  const filteredAlbums = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return enrichedAlbums
      .filter(({ album, score }) => {
        if (statusTab === 'rated' && score === null) return false;
        if (statusTab === 'listened' && !album.isListened) return false;
        if (statusTab === 'liked' && !album.isLiked) return false;

        if (q) {
          const matchesText =
            album.title.toLowerCase().includes(q) ||
            album.artist.toLowerCase().includes(q) ||
            album.genre.toLowerCase().includes(q);
          if (!matchesText) return false;
        }
        if (genreFilter !== 'all' && album.genre !== genreFilter) return false;
        if (yearFilter !== 'all' && String(album.releaseYear) !== yearFilter) return false;

        if (tierFilter === 'must-hear' && !album.mustHear) return false;
        if (tierFilter === 'acclaimed' && (score === null || score < 80)) return false;
        if (tierFilter === 'mixed' && (score === null || score < 50 || score >= 80)) return false;
        if (tierFilter === 'low' && (score === null || score >= 50)) return false;
        if (tierFilter === 'unrated' && score !== null) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score-desc') {
          const sa = a.score ?? -1;
          const sb = b.score ?? -1;
          if (sb !== sa) return sb - sa;
          return b.album.updatedAt.localeCompare(a.album.updatedAt);
        }
        if (sortBy === 'year-desc') {
          return b.album.releaseYear - a.album.releaseYear;
        }
        if (sortBy === 'title-asc') {
          return a.album.title.localeCompare(b.album.title, 'pt-BR');
        }
        return b.album.createdAt.localeCompare(a.album.createdAt);
      });
  }, [enrichedAlbums, statusTab, searchTerm, genreFilter, yearFilter, tierFilter, sortBy]);

  const handleQuickSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    onOpenAddModal(quickHeroQuery.trim());
  };

  if (albums.length === 0) {
    return (
      <section className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden rounded-lg border border-white/[0.08] bg-[#161B22]">
          <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-10 space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-medium tracking-wider uppercase text-[#8B949E]">
                Estúdio Pessoal de Crítica Musical
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
                Avalie cada faixa, descubra a média real e monte seu ranking de álbuns.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-[#CBD5E1]">
                Inspirado no Album of the Year e no Letterboxd, o FaixaNota calcula automaticamente
                a nota do disco pelas faixas (0–100), organiza sua fila Quero Ouvir e salva tudo no
                navegador.
              </p>
            </div>

            <div className="space-y-4">
              <form onSubmit={handleQuickSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B949E]"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={quickHeroQuery}
                    onChange={(e) => setQuickHeroQuery(e.target.value)}
                    placeholder="Buscar álbum ou artista real para começar..."
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] py-2.5 pl-10 pr-4 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#2563EB] transition-colors"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <span>Buscar no Catálogo</span>
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-[#8B949E]">Buscas rápidas:</span>
                {POPULAR_SEARCH_SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onOpenAddModal(item)}
                    className="rounded-md border border-white/[0.08] bg-[#0E1116] px-2.5 py-1 text-xs font-medium text-[#CBD5E1] hover:border-[#3B82F6]/60 hover:text-white transition-colors"
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-4">
                <button
                  type="button"
                  onClick={onLoadSamplePack}
                  className="inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-[#1C222B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#262E3A] transition-colors"
                >
                  <Sparkles className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
                  <span>Carregar 3 Álbuns de Demonstração</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAddModal('')}
                  className="inline-flex items-center gap-2 rounded-md border border-white/[0.12] px-4 py-2 text-xs font-medium text-[#CBD5E1] hover:text-white hover:bg-white/[0.04] transition-colors"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Cadastrar Manualmente</span>
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[240px] bg-[#0E1116]">
            <img
              src="/src/assets/images/vinyl_studio_hero_1795529499630.jpg"
              alt="Disco de vinil em mesa de estúdio escura"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0E1116]/70 via-transparent to-transparent" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 space-y-6">
      {/* Editorial Spotlight & Collection Summary */}
      {topAlbum && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6">
          <div className="lg:col-span-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <button
              type="button"
              onClick={() => onSelectAlbum(topAlbum.album.id)}
              className="shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded-md"
            >
              <AlbumArtwork
                coverUrl={topAlbum.album.coverUrl}
                title={topAlbum.album.title}
                artist={topAlbum.album.artist}
                className="h-28 w-28 sm:h-32 sm:w-32 rounded-md transition-transform duration-150 group-hover:scale-[1.02]"
              />
            </button>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-[#8B949E]">
                <span>Líder do Ranking Pessoal</span>
                {topAlbum.album.mustHear && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[#F59E0B]">
                      <Award className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Must Hear</span>
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSelectAlbum(topAlbum.album.id)}
                className="text-left block group"
              >
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight group-hover:text-[#3B82F6] transition-colors [text-wrap:balance]">
                  {topAlbum.album.title}
                </h1>
              </button>
              <p className="text-sm text-[#CBD5E1]">
                {topAlbum.album.artist} · {topAlbum.album.releaseYear} · {topAlbum.album.genre} ·{' '}
                <span className="font-mono tabular-nums">
                  {topAlbum.ratedCount}/{topAlbum.album.tracks.length}
                </span>{' '}
                faixas avaliadas
              </p>
              <div className="pt-1">
                <ScoreBox
                  score={topAlbum.score}
                  size="md"
                  showLabel
                  mustHear={topAlbum.album.mustHear}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-4 border-t lg:border-t-0 lg:border-l border-white/[0.08] pt-4 lg:pt-0 lg:pl-6 items-center">
            <div>
              <p className="text-xs text-[#8B949E]">Álbuns no Acervo</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                {collectionStats.totalAlbums}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#8B949E]">Faixas Avaliadas</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                {collectionStats.totalTracksRated}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#8B949E]">Média Geral</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                {collectionStats.avgScore !== null ? collectionStats.avgScore : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#8B949E]">Selos Must Hear</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#F59E0B]">
                {collectionStats.mustHearCount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Tabs + View Toggle Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filtrar por status de escuta"
          className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-white/[0.08] bg-[#161B22] p-1"
        >
          {(
            [
              { id: 'all', label: 'Todos', count: statusCounts.all },
              { id: 'rated', label: 'Avaliados', count: statusCounts.rated },
              { id: 'listened', label: 'Ouvidos', count: statusCounts.listened },
              { id: 'liked', label: 'Curtidos', count: statusCounts.liked },
            ] as const
          ).map((tab) => {
            const active = statusTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 sm:px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  active ? 'bg-[#3B82F6] text-white' : 'text-[#8B949E] hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    active ? 'text-white/90' : 'text-[#64748B]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="Modo de visualização"
          className="inline-flex items-center rounded-md border border-white/[0.1] bg-[#161B22] p-0.5 shrink-0"
        >
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              viewMode === 'grid'
                ? 'bg-[#262E3A] text-white'
                : 'text-[#8B949E] hover:text-white'
            }`}
          >
            <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Horizontal</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            aria-pressed={viewMode === 'chart'}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              viewMode === 'chart'
                ? 'bg-[#262E3A] text-white'
                : 'text-[#8B949E] hover:text-white'
            }`}
          >
            <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tabela AOTY</span>
          </button>
        </div>
      </div>

      {/* Responsive Search & Filter Grid */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 border-b border-white/[0.08] pb-4">
        <div className="relative col-span-2 sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B949E]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar álbum, artista ou gênero..."
            aria-label="Filtrar catálogo"
            className="w-full rounded-md border border-white/[0.1] bg-[#161B22] py-2 pl-9 pr-3 text-xs sm:text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
          />
        </div>

        <select
          value={genreFilter}
          onChange={(e) => setGenreFilter(e.target.value)}
          aria-label="Filtrar por gênero"
          className="w-full sm:w-auto rounded-md border border-white/[0.1] bg-[#161B22] px-2.5 py-2 text-xs sm:text-sm text-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none"
        >
          <option value="all">Todos os gêneros</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          aria-label="Filtrar por ano"
          className="w-full sm:w-auto rounded-md border border-white/[0.1] bg-[#161B22] px-2.5 py-2 text-xs sm:text-sm text-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none"
        >
          <option value="all">Todos os anos</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as ScoreTierFilter)}
          aria-label="Filtrar por faixa de nota"
          className="w-full sm:w-auto rounded-md border border-white/[0.1] bg-[#161B22] px-2.5 py-2 text-xs sm:text-sm text-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none"
        >
          <option value="all">Todas as notas</option>
          <option value="must-hear">Selo Must Hear</option>
          <option value="acclaimed">Aclamados (80–100)</option>
          <option value="mixed">Médios / Mistos (50–79)</option>
          <option value="low">Notas Baixas (&lt;50)</option>
          <option value="unrated">Ainda sem nota</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          aria-label="Ordenar catálogo"
          className="w-full sm:w-auto sm:ml-auto rounded-md border border-white/[0.1] bg-[#161B22] px-2.5 py-2 text-xs sm:text-sm text-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none"
        >
          <option value="score-desc">Maior Nota</option>
          <option value="recent">Recentes</option>
          <option value="year-desc">Ano</option>
          <option value="title-asc">Título (A–Z)</option>
        </select>
      </div>

      {/* Filtered Empty State */}
      {filteredAlbums.length === 0 ? (
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] px-6 py-12 text-center">
          <p className="text-base font-semibold text-white">
            Nenhum álbum encontrado nesta seleção
          </p>
          <p className="mt-1 text-sm text-[#8B949E]">
            Ajuste os filtros ou busque novos discos para adicionar à sua fila ou acervo.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setStatusTab('all');
                setSearchTerm('');
                setGenreFilter('all');
                setYearFilter('all');
                setTierFilter('all');
              }}
              className="rounded-md border border-white/[0.12] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.05] transition-colors"
            >
              Ver Todos os Álbuns
            </button>
            <button
              type="button"
              onClick={() => onOpenAddModal('')}
              className="rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors"
            >
              Buscar Álbuns
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[#8B949E] font-mono tabular-nums">
              {filteredAlbums.length}{' '}
              {filteredAlbums.length === 1 ? 'álbum nesta seleção' : 'álbuns nesta seleção'}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollCarousel(-1)}
                aria-label="Rolar álbuns para a esquerda"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.1] bg-[#161B22] text-[#CBD5E1] hover:border-white/25 hover:text-white transition-colors"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => scrollCarousel(1)}
                aria-label="Rolar álbuns para a direita"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.1] bg-[#161B22] text-[#CBD5E1] hover:border-white/25 hover:text-white transition-colors"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            ref={carouselRef}
            className="flex flex-nowrap gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1"
          >
            {filteredAlbums.map(({ album, score, ratedCount }, index) => {
              const visuals = getScoreVisuals(score);
              const listCount = listCountByAlbumId.get(album.id) ?? 0;

              return (
                <article
                  key={album.id}
                  onClick={() => onSelectAlbum(album.id)}
                  className="group w-64 shrink-0 snap-start cursor-pointer rounded-lg border border-white/[0.08] bg-[#161B22] p-3.5 hover:border-white/[0.2] transition-colors duration-150 flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-square w-full overflow-hidden rounded-md">
                      <AlbumArtwork
                        coverUrl={album.coverUrl}
                        title={album.title}
                        artist={album.artist}
                        className="h-full w-full rounded-md transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    </div>

                    <div className="mt-3.5 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#8B949E]">
                        <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                          <span>#{index + 1}</span>
                          {album.isFavorite && (
                            <Star
                              className="h-3.5 w-3.5 text-[#F59E0B]"
                              fill="currentColor"
                              aria-label="Álbum favorito"
                            />
                          )}
                        </span>
                        {album.mustHear ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#F59E0B]">
                            <Award className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Must Hear</span>
                          </span>
                        ) : (
                          <span className="truncate">{visuals.label}</span>
                        )}
                      </div>

                      <h2 className="font-display text-base font-bold text-white line-clamp-1 group-hover:text-[#3B82F6] transition-colors">
                        {album.title}
                      </h2>
                      <p className="text-sm text-[#CBD5E1] line-clamp-1">{album.artist}</p>
                      <p className="text-xs text-[#8B949E] truncate">
                        {album.releaseYear} · {album.genre} ·{' '}
                        <span className="font-mono tabular-nums">
                          {ratedCount}/{album.tracks.length}
                        </span>{' '}
                        faixas
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                    <LetterboxdActions
                      isListened={album.isListened}
                      isLiked={album.isLiked}
                      isFavorite={album.isFavorite}
                      inWatchlist={album.inWatchlist}
                      listCount={listCount}
                      onToggleListened={() => onToggleAlbumStatus(album.id, 'isListened')}
                      onToggleLiked={() => onToggleAlbumStatus(album.id, 'isLiked')}
                      onToggleFavorite={() => onToggleAlbumStatus(album.id, 'isFavorite')}
                      onToggleWatchlist={() => onToggleAlbumStatus(album.id, 'inWatchlist')}
                      onOpenListPicker={() => onOpenListPicker(album)}
                    />
                    <ScoreBox score={score} size="sm" />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        /* AOTY Editorial Chart View */
        <div className="w-full overflow-x-auto rounded-lg border border-white/[0.08] bg-[#161B22]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs font-medium text-[#8B949E]">
                <th className="py-3 pl-4 pr-2 w-12">Pos.</th>
                <th className="py-3 px-3">Álbum</th>
                <th className="py-3 px-3 hidden md:table-cell">Status</th>
                <th className="py-3 px-3 hidden lg:table-cell">Gênero</th>
                <th className="py-3 px-3 text-right hidden sm:table-cell">Faixas</th>
                <th className="py-3 pl-3 pr-4 text-right">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredAlbums.map(({ album, score, ratedCount }, index) => {
                const visuals = getScoreVisuals(score);
                const listCount = listCountByAlbumId.get(album.id) ?? 0;

                return (
                  <tr
                    key={album.id}
                    onClick={() => onSelectAlbum(album.id)}
                    className="cursor-pointer hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="py-3 pl-4 pr-2 font-mono text-sm font-bold tabular-nums text-[#8B949E]">
                      {index + 1}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <AlbumArtwork
                          coverUrl={album.coverUrl}
                          title={album.title}
                          artist={album.artist}
                          className="h-12 w-12 rounded-sm shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-sm font-bold text-white truncate">
                              {album.title}
                            </span>
                            {album.isFavorite && (
                              <Star
                                className="h-3.5 w-3.5 text-[#F59E0B] shrink-0"
                                fill="currentColor"
                                aria-label="Álbum favorito"
                              />
                            )}
                            {album.mustHear && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#F59E0B] whitespace-nowrap shrink-0">
                                <Award className="h-3 w-3" aria-hidden="true" />
                                <span>Must Hear</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#CBD5E1] truncate">
                            {album.artist} · {album.releaseYear}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell">
                      <LetterboxdActions
                        isListened={album.isListened}
                        isLiked={album.isLiked}
                        isFavorite={album.isFavorite}
                        inWatchlist={album.inWatchlist}
                        listCount={listCount}
                        onToggleListened={() => onToggleAlbumStatus(album.id, 'isListened')}
                        onToggleLiked={() => onToggleAlbumStatus(album.id, 'isLiked')}
                        onToggleFavorite={() => onToggleAlbumStatus(album.id, 'isFavorite')}
                        onToggleWatchlist={() => onToggleAlbumStatus(album.id, 'inWatchlist')}
                        onOpenListPicker={() => onOpenListPicker(album)}
                      />
                    </td>
                    <td className="py-3 px-3 text-xs text-[#8B949E] hidden lg:table-cell">
                      {album.genre}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-[#8B949E] hidden sm:table-cell">
                      {ratedCount}/{album.tracks.length}
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right">
                      <div className="inline-flex items-center gap-2.5">
                        <span className={`hidden xl:inline text-xs font-medium ${visuals.textClass}`}>
                          {visuals.label}
                        </span>
                        <ScoreBox score={score} size="sm" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
