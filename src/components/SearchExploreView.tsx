import {
  ArrowLeft,
  Disc3,
  ExternalLink,
  History,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { POPULAR_SEARCH_SUGGESTIONS } from '../data/sampleCatalog';
import type {
  Album,
  AotyLookupPayload,
  AudioPreviewState,
  CatalogAlbumDetail,
  CatalogSearchResult,
  CatalogSource,
  ReleaseTypeFilter,
} from '../types/music';
import { formatDuration } from '../utils/scoring';
import { AlbumArtwork } from './AlbumArtwork';
import { ScoreBox } from './ScoreBox';

interface SearchExploreViewProps {
  existingAlbums: Album[];
  activePreview: AudioPreviewState | null;
  onPlayPreview: (track: {
    id: string;
    title: string;
    previewUrl: string;
    artist: string;
    albumTitle: string;
  }) => void;
  onImportAlbum: (
    album: {
      externalCatalogId?: string;
      itunesCollectionId?: number;
      title: string;
      artist: string;
      releaseYear: number;
      genre: string;
      coverUrl: string;
      aotyData?: Album['aotyData'];
      tracks: Array<{
        trackNumber: number;
        title: string;
        durationMs: number;
        previewUrl?: string;
        aotyRating?: number | null;
        aotyRatingCount?: number;
      }>;
    },
    options?: { openStudio?: boolean }
  ) => Album;
  onOpenAlbumStudio: (albumId: string) => void;
}

const RELEASE_TYPE_LABELS: Array<{ id: ReleaseTypeFilter; label: string }> = [
  { id: 'album', label: 'Apenas Álbuns' },
  { id: 'ep', label: 'Incluir EPs' },
  { id: 'all', label: 'Todos' },
];

const CATALOG_SOURCE_LABELS: Array<{ id: CatalogSource; label: string }> = [
  { id: 'deezer', label: 'Deezer' },
  { id: 'musicbrainz', label: 'MusicBrainz' },
  { id: 'itunes', label: 'iTunes' },
];

const SEARCH_HISTORY_STORAGE_KEY = 'faixanota:v1:searchHistory';
const MAX_SEARCH_HISTORY = 10;

interface SearchHistoryEntry {
  query: string;
  source: CatalogSource;
  releaseType: ReleaseTypeFilter;
  searchedAt: string;
}

function readSearchHistory(): SearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is SearchHistoryEntry =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof item.query === 'string' &&
          item.query.trim().length > 0
      )
      .map((item) => ({
        query: item.query.trim(),
        source:
          item.source === 'deezer' || item.source === 'musicbrainz' || item.source === 'itunes'
            ? item.source
            : 'deezer',
        releaseType:
          item.releaseType === 'album' || item.releaseType === 'ep' || item.releaseType === 'all'
            ? item.releaseType
            : 'album',
        searchedAt: typeof item.searchedAt === 'string' ? item.searchedAt : new Date().toISOString(),
      }))
      .slice(0, MAX_SEARCH_HISTORY);
  } catch {
    return [];
  }
}

function normalizeSignature(title: string, artist: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  return `${norm(title)}::${norm(artist)}`;
}

export function SearchExploreView({
  existingAlbums,
  activePreview,
  onPlayPreview,
  onImportAlbum,
  onOpenAlbumStudio,
}: SearchExploreViewProps) {
  const [query, setQuery] = useState('');
  const [catalogSource, setCatalogSource] = useState<CatalogSource>('deezer');
  const [releaseType, setReleaseType] = useState<ReleaseTypeFilter>('album');
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>(() => readSearchHistory());

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(searchHistory));
    } catch {
      // Ignore storage quota errors
    }
  }, [searchHistory]);

  // Read-only album inspection state (never auto-adds to catalog)
  const [inspectedDetail, setInspectedDetail] = useState<CatalogAlbumDetail | null>(null);
  const [inspectedAoty, setInspectedAoty] = useState<
    NonNullable<AotyLookupPayload['album']>['aotyData'] | null
  >(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [aotyLoading, setAotyLoading] = useState(false);

  const existingBySignature = useMemo(() => {
    const byCatalog = new Map<string, Album>();
    const bySig = new Map<string, Album>();
    existingAlbums.forEach((a) => {
      if (a.externalCatalogId) byCatalog.set(a.externalCatalogId, a);
      if (typeof a.itunesCollectionId === 'number') {
        byCatalog.set(`itunes:${a.itunesCollectionId}`, a);
      }
      bySig.set(normalizeSignature(a.title, a.artist), a);
    });
    return { byCatalog, bySig };
  }, [existingAlbums]);

  const findExisting = useCallback(
    (catalogId: string, title: string, artist: string): Album | undefined => {
      return (
        existingBySignature.byCatalog.get(catalogId) ??
        existingBySignature.bySig.get(normalizeSignature(title, artist))
      );
    },
    [existingBySignature]
  );

  const recordSearchHistory = useCallback(
    (searchTerm: string, sourceFilter: CatalogSource, typeFilter: ReleaseTypeFilter) => {
      const trimmed = searchTerm.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();

      setSearchHistory((prev) => {
        const nextEntry: SearchHistoryEntry = {
          query: trimmed,
          source: sourceFilter,
          releaseType: typeFilter,
          searchedAt: new Date().toISOString(),
        };
        const withoutDup = prev.filter((item) => item.query.toLowerCase() !== lower);
        return [nextEntry, ...withoutDup].slice(0, MAX_SEARCH_HISTORY);
      });
    },
    []
  );

  const handleRemoveHistoryItem = useCallback((queryToRemove: string) => {
    const lower = queryToRemove.toLowerCase();
    setSearchHistory((prev) => prev.filter((item) => item.query.toLowerCase() !== lower));
  }, []);

  const handleClearHistory = useCallback(() => {
    setSearchHistory([]);
  }, []);

  const runSearch = useCallback(
    async (searchTerm: string, typeFilter: ReleaseTypeFilter, sourceFilter: CatalogSource) => {
      const trimmed = searchTerm.trim();
      if (!trimmed) return;
      recordSearchHistory(trimmed, sourceFilter, typeFilter);
      setSearching(true);
      setSearchError(null);
      setFallbackNotice(null);
      setHasSearched(true);
      setInspectedDetail(null);

      try {
        const resp = await fetch(
          `/api/music/search?q=${encodeURIComponent(trimmed)}&type=${typeFilter}&source=${sourceFilter}&limit=20`
        );
        const data = await resp.json();
        if (!resp.ok) {
          setSearchError(data.error || 'Não foi possível concluir a busca.');
          setResults([]);
          return;
        }
        if (data.fallbackFrom === 'deezer' && data.providerUsed === 'musicbrainz') {
          setFallbackNotice(
            'Não encontrado no streaming do Deezer — exibindo resultados do MusicBrainz.'
          );
        }
        setResults(Array.isArray(data.albums) ? data.albums : []);
      } catch {
        setSearchError('Erro de conexão ao consultar álbuns.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [recordSearchHistory]
  );

  const handleInspectAlbum = async (item: CatalogSearchResult) => {
    setInspectLoading(true);
    setInspectError(null);
    setInspectedAoty(null);
    setInspectedDetail(null);

    try {
      const resp = await fetch(
        `/api/music/album/${item.source}/${encodeURIComponent(item.providerId)}`
      );
      const data = await resp.json();
      if (!resp.ok || !data.album) {
        setInspectError(data.error || 'Não foi possível carregar os detalhes deste álbum.');
        return;
      }
      const detail = data.album as CatalogAlbumDetail;
      setInspectedDetail({
        ...detail,
        coverUrl: detail.coverUrl || item.coverUrl,
      });

      // Optional non-blocking AOTY preview lookup (read-only)
      setAotyLoading(true);
      try {
        const aotyResp = await fetch(
          `/api/aoty/album?artist=${encodeURIComponent(detail.artist)}&name=${encodeURIComponent(detail.title)}`
        );
        const aotyPayload = (await aotyResp.json()) as AotyLookupPayload;
        if (aotyPayload.found && aotyPayload.album) {
          setInspectedAoty(aotyPayload.album.aotyData);
        }
      } catch {
        // Optional enrichment
      } finally {
        setAotyLoading(false);
      }
    } catch {
      setInspectError('Erro ao carregar informações do álbum.');
    } finally {
      setInspectLoading(false);
    }
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runSearch(query, releaseType, catalogSource);
  };

  const inspectedExisting = inspectedDetail
    ? findExisting(inspectedDetail.catalogId, inspectedDetail.title, inspectedDetail.artist)
    : undefined;

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6 space-y-6">
      {/* Header & Search Form */}
      <div className="space-y-4 rounded-lg border border-white/[0.08] bg-[#161B22] p-4 sm:p-6">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
            Pesquisar & Explorar Discos
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8B949E]">
            Consulte faixas, capas, prévias de 30s e notas da crítica no AOTY sem adicionar ao seu
            catálogo automaticamente.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B949E]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar álbum ou artista (ex.: BRAT Charli xcx, Clube da Esquina...)"
              className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] py-2.5 pl-10 pr-4 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#2563EB] disabled:opacity-50 transition-colors"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            <span>Pesquisar</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div
            role="group"
            aria-label="Fonte de pesquisa"
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0E1116] p-1"
          >
            {CATALOG_SOURCE_LABELS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setCatalogSource(opt.id);
                  if (query.trim()) void runSearch(query, releaseType, opt.id);
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  catalogSource === opt.id
                    ? 'bg-[#3B82F6]/20 text-[#60A5FA] border border-[#3B82F6]/40'
                    : 'text-[#8B949E] hover:text-white border border-transparent'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Formato de lançamento"
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0E1116] p-1"
          >
            {RELEASE_TYPE_LABELS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setReleaseType(opt.id);
                  if (query.trim()) void runSearch(query, opt.id, catalogSource);
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  releaseType === opt.id
                    ? 'bg-[#262E3A] text-white'
                    : 'text-[#8B949E] hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {searchHistory.length > 0 && (
          <div className="space-y-2 border-t border-white/[0.06] pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8B949E]">
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Buscas recentes</span>
              </span>
              <button
                type="button"
                onClick={handleClearHistory}
                className="text-xs font-medium text-[#8B949E] hover:text-white transition-colors"
              >
                Limpar histórico
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {searchHistory.map((entry) => (
                <div
                  key={entry.query.toLowerCase()}
                  className="inline-flex items-center overflow-hidden rounded-md border border-white/[0.08] bg-[#0E1116] hover:border-[#3B82F6]/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(entry.query);
                      setCatalogSource(entry.source);
                      setReleaseType(entry.releaseType);
                      void runSearch(entry.query, entry.releaseType, entry.source);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#CBD5E1] hover:text-white transition-colors"
                  >
                    <span>{entry.query}</span>
                    {entry.source !== 'deezer' && (
                      <span className="text-[10px] text-[#8B949E]">{entry.source}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveHistoryItem(entry.query)}
                    aria-label={`Remover "${entry.query}" do histórico`}
                    className="flex h-full items-center justify-center border-l border-white/[0.06] px-1.5 py-1 text-[#64748B] hover:bg-white/[0.05] hover:text-white transition-colors"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasSearched && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-[#8B949E]">Sugestões:</span>
            {POPULAR_SEARCH_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuery(s);
                  void runSearch(s, releaseType, catalogSource);
                }}
                className="rounded-md border border-white/[0.08] bg-[#0E1116] px-2.5 py-1 text-xs font-medium text-[#CBD5E1] hover:border-[#3B82F6]/60 hover:text-white transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {fallbackNotice && (
        <div className="rounded-md border border-[#3B82F6]/35 bg-[#1E3A8A]/25 px-4 py-2.5 text-xs text-[#93C5FD]">
          {fallbackNotice}
        </div>
      )}

      {(searchError || inspectError) && (
        <div
          role="alert"
          className="rounded-md border border-[#EF4444]/40 bg-[#450A0A]/40 px-4 py-3 text-sm text-[#FCA5A5]"
        >
          {searchError || inspectError}
        </div>
      )}

      {/* Read-Only Inspection View when user clicks an album */}
      {inspectLoading ? (
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] p-8 flex items-center justify-center gap-3 text-sm text-[#CBD5E1]">
          <Loader2 className="h-5 w-5 animate-spin text-[#3B82F6]" aria-hidden="true" />
          <span>Carregando ficha e faixas do álbum...</span>
        </div>
      ) : inspectedDetail ? (
        <div className="space-y-6 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
            <button
              type="button"
              onClick={() => setInspectedDetail(null)}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#CBD5E1] hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Voltar aos resultados</span>
            </button>

            {inspectedExisting ? (
              <button
                type="button"
                onClick={() => onOpenAlbumStudio(inspectedExisting.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#3B82F6]/50 bg-[#3B82F6]/15 px-3.5 py-1.5 text-xs font-semibold text-[#60A5FA] hover:bg-[#3B82F6] hover:text-white transition-colors"
              >
                <Disc3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Já no Catálogo · Abrir Estúdio</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onImportAlbum(
                    {
                      externalCatalogId: inspectedDetail.catalogId,
                      itunesCollectionId: inspectedDetail.collectionId,
                      title: inspectedDetail.title,
                      artist: inspectedDetail.artist,
                      releaseYear: inspectedDetail.releaseYear,
                      genre: inspectedDetail.genre,
                      coverUrl: inspectedDetail.coverUrl,
                      aotyData: inspectedAoty ?? undefined,
                      tracks:
                        inspectedDetail.tracks.length > 0
                          ? inspectedDetail.tracks
                          : [{ trackNumber: 1, title: 'Faixa 1', durationMs: 180000 }],
                    },
                    { openStudio: true }
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#3B82F6] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Salvar no Meu Catálogo</span>
              </button>
            )}
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            <AlbumArtwork
              coverUrl={inspectedDetail.coverUrl}
              title={inspectedDetail.title}
              artist={inspectedDetail.artist}
              className="h-48 w-48 sm:h-56 sm:w-56 rounded-md shrink-0 mx-auto md:mx-0"
            />

            <div className="flex-1 min-w-0 space-y-3">
              <p className="text-xs font-medium text-[#8B949E]">
                {inspectedDetail.artist} · {inspectedDetail.releaseYear} · {inspectedDetail.genre}
                {inspectedAoty?.label ? ` · ${inspectedAoty.label}` : ''}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white [text-wrap:balance]">
                {inspectedDetail.title}
              </h2>

              {aotyLoading ? (
                <p className="inline-flex items-center gap-2 text-xs text-[#8B949E]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Consultando notas no AOTY...</span>
                </p>
              ) : inspectedAoty ? (
                <div className="flex flex-wrap items-center gap-5 pt-1">
                  <div className="flex items-center gap-2.5">
                    <ScoreBox score={inspectedAoty.criticScore} size="sm" />
                    <div className="text-xs">
                      <p className="font-semibold text-white">Crítica AOTY</p>
                      <p className="text-[#8B949E] font-mono tabular-nums">
                        {inspectedAoty.criticCount ?? 0} resenhas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <ScoreBox score={inspectedAoty.userScore} size="sm" />
                    <div className="text-xs">
                      <p className="font-semibold text-white">Usuários AOTY</p>
                      <p className="text-[#8B949E] font-mono tabular-nums">
                        {inspectedAoty.userCount ?? 'Comunidade'}
                      </p>
                    </div>
                  </div>
                  {inspectedAoty.aotyUrl && (
                    <a
                      href={inspectedAoty.aotyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#60A5FA] hover:text-white"
                    >
                      <span>Abrir no AOTY</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
              ) : null}

              {inspectedAoty && inspectedAoty.tags.length > 0 && (
                <p className="text-xs text-[#CBD5E1]">
                  Tags AOTY: {inspectedAoty.tags.slice(0, 6).join(' · ')}
                </p>
              )}
            </div>
          </div>

          {/* Read-only Tracklist with Audio Previews */}
          <div className="border-t border-white/[0.08] pt-4 space-y-2">
            <h3 className="font-display text-sm font-bold text-white">
              Tracklist ({inspectedDetail.tracks.length} faixas)
            </h3>
            <ul className="divide-y divide-white/[0.06] rounded-md border border-white/[0.08] bg-[#0E1116]/60">
              {inspectedDetail.tracks.map((trk) => {
                const trackPreviewId = `explore_${inspectedDetail.catalogId}_${trk.trackNumber}`;
                const isPlayingThis =
                  activePreview?.trackId === trackPreviewId && activePreview.isPlaying;

                return (
                  <li
                    key={`${trk.trackNumber}_${trk.title}`}
                    className="flex items-center gap-3 px-3.5 py-2.5"
                  >
                    <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-[#8B949E]">
                      {String(trk.trackNumber).padStart(2, '0')}
                    </span>

                    {trk.previewUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          onPlayPreview({
                            id: trackPreviewId,
                            title: trk.title,
                            previewUrl: trk.previewUrl as string,
                            artist: inspectedDetail.artist,
                            albumTitle: inspectedDetail.title,
                          })
                        }
                        aria-label={
                          isPlayingThis
                            ? `Pausar prévia de ${trk.title}`
                            : `Ouvir prévia de ${trk.title}`
                        }
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          isPlayingThis
                            ? 'border-[#3B82F6] bg-[#3B82F6] text-white'
                            : 'border-white/[0.14] text-[#CBD5E1] hover:border-[#3B82F6] hover:text-white'
                        }`}
                      >
                        {isPlayingThis ? (
                          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Play className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" />
                        )}
                      </button>
                    )}

                    <span className="min-w-0 flex-1 text-sm text-white truncate">{trk.title}</span>

                    <span className="font-mono text-xs tabular-nums text-[#8B949E] shrink-0">
                      {formatDuration(trk.durationMs)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : searching ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-md border border-white/[0.08] bg-[#161B22] p-3 animate-pulse"
            >
              <div className="h-16 w-16 rounded-sm bg-[#1C222B] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-[#1C222B]" />
                <div className="h-3 w-1/2 rounded bg-[#1C222B]" />
              </div>
            </div>
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map((item) => {
            const alreadySaved = Boolean(findExisting(item.catalogId, item.title, item.artist));

            return (
              <button
                key={item.catalogId}
                type="button"
                onClick={() => void handleInspectAlbum(item)}
                className="flex items-center gap-3.5 rounded-lg border border-white/[0.08] bg-[#161B22] p-3.5 text-left hover:border-white/[0.2] transition-colors group"
              >
                <AlbumArtwork
                  coverUrl={item.coverUrl}
                  title={item.title}
                  artist={item.artist}
                  className="h-16 w-16 rounded-sm shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-white truncate group-hover:text-[#3B82F6] transition-colors">
                    {item.title}
                  </h2>
                  <p className="text-xs text-[#CBD5E1] truncate">{item.artist}</p>
                  <p className="mt-1 text-[11px] text-[#8B949E] truncate font-mono tabular-nums">
                    {item.releaseYear ? `${item.releaseYear} · ` : ''}
                    {item.genre}
                    {item.trackCount > 0 ? ` · ${item.trackCount} faixas` : ''}
                    {alreadySaved ? ' · No catálogo' : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : hasSearched && !searchError ? (
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] px-6 py-12 text-center">
          <Music className="mx-auto h-8 w-8 text-[#64748B] mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-white">Nenhum álbum encontrado</p>
          <p className="mt-1 text-xs text-[#8B949E]">
            Tente outro termo ou alterne para MusicBrainz para buscar edições raras e mixtapes.
          </p>
        </div>
      ) : null}
    </section>
  );
}
