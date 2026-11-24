import { Loader2, Music, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { POPULAR_SEARCH_SUGGESTIONS } from '../data/sampleCatalog';
import type {
  Album,
  AlbumStatusField,
  AotyLookupPayload,
  CatalogAlbumDetail,
  CatalogSearchResult,
  CatalogSource,
  CustomList,
  ReleaseTypeFilter,
} from '../types/music';
import { parseDurationInput, sanitizeImageUrl } from '../utils/scoring';
import { AlbumArtwork } from './AlbumArtwork';
import { LetterboxdActions } from './LetterboxdActions';
import { ScoreBox } from './ScoreBox';

interface AddAlbumModalProps {
  isOpen: boolean;
  initialQuery?: string;
  existingAlbums: Album[];
  lists: CustomList[];
  onClose: () => void;
  onImportAlbum: (
    album: {
      externalCatalogId?: string;
      itunesCollectionId?: number;
      title: string;
      artist: string;
      releaseYear: number;
      genre: string;
      coverUrl: string;
      isListened?: boolean;
      isLiked?: boolean;
      isFavorite?: boolean;
      inWatchlist?: boolean;
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
  onEnrichAlbumFromAoty: (albumId: string, artist: string, title: string) => void;
  onToggleAlbumStatus: (albumId: string, field: AlbumStatusField) => void;
  onOpenListPicker: (album: Album) => void;
  onOpenAlbumStudio: (albumId: string) => void;
}

interface ManualTrackDraft {
  id: string;
  title: string;
  durationText: string;
}

const RELEASE_TYPE_LABELS: Array<{ id: ReleaseTypeFilter; label: string }> = [
  { id: 'album', label: 'Apenas Álbuns' },
  { id: 'ep', label: 'Incluir EPs' },
  { id: 'all', label: 'Todos (incl. Singles)' },
];

const CATALOG_SOURCE_LABELS: Array<{ id: CatalogSource; label: string }> = [
  { id: 'deezer', label: 'Deezer (Recomendado)' },
  { id: 'musicbrainz', label: 'MusicBrainz (Acervo Completo)' },
  { id: 'itunes', label: 'iTunes' },
];

function normalizeAlbumSignature(title: string, artist: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  return `${norm(title)}::${norm(artist)}`;
}

export function AddAlbumModal({
  isOpen,
  initialQuery = '',
  existingAlbums,
  lists,
  onClose,
  onImportAlbum,
  onEnrichAlbumFromAoty,
  onToggleAlbumStatus,
  onOpenListPicker,
  onOpenAlbumStudio,
}: AddAlbumModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'aoty' | 'manual'>('search');

  // Search tab state
  const [query, setQuery] = useState(initialQuery);
  const [catalogSource, setCatalogSource] = useState<CatalogSource>('deezer');
  const [releaseType, setReleaseType] = useState<ReleaseTypeFilter>('album');
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyCatalogId, setBusyCatalogId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // AOTY direct lookup tab state
  const [aotySlugInput, setAotySlugInput] = useState('');
  const [aotyArtistInput, setAotyArtistInput] = useState('');
  const [aotyAlbumInput, setAotyAlbumInput] = useState('');
  const [aotyLoading, setAotyLoading] = useState(false);
  const [aotyError, setAotyError] = useState<string | null>(null);
  const [aotyResult, setAotyResult] = useState<NonNullable<AotyLookupPayload['album']> | null>(
    null
  );

  // Manual tab state
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [releaseYear, setReleaseYear] = useState(String(new Date().getFullYear()));
  const [genre, setGenre] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [manualTracks, setManualTracks] = useState<ManualTrackDraft[]>([
    { id: '1', title: '', durationText: '3:30' },
    { id: '2', title: '', durationText: '3:45' },
  ]);
  const [bulkTracksText, setBulkTracksText] = useState('');
  const [showBulkMode, setShowBulkMode] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const existingLookups = useMemo(() => {
    const byCatalogId = new Map<string, Album>();
    const byCollectionId = new Map<number, Album>();
    const bySignature = new Map<string, Album>();

    existingAlbums.forEach((a) => {
      if (a.externalCatalogId) {
        byCatalogId.set(a.externalCatalogId, a);
      }
      if (typeof a.itunesCollectionId === 'number') {
        byCollectionId.set(a.itunesCollectionId, a);
        byCatalogId.set(`itunes:${a.itunesCollectionId}`, a);
      }
      bySignature.set(normalizeAlbumSignature(a.title, a.artist), a);
    });

    return { byCatalogId, byCollectionId, bySignature };
  }, [existingAlbums]);

  const findExistingAlbum = useCallback(
    (item: CatalogSearchResult): Album | undefined => {
      const direct = existingLookups.byCatalogId.get(item.catalogId);
      if (direct) return direct;
      if (typeof item.collectionId === 'number') {
        const legacy = existingLookups.byCollectionId.get(item.collectionId);
        if (legacy) return legacy;
      }
      return existingLookups.bySignature.get(normalizeAlbumSignature(item.title, item.artist));
    },
    [existingLookups]
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

  const runSearch = useCallback(
    async (searchTerm: string, typeFilter: ReleaseTypeFilter, sourceFilter: CatalogSource) => {
      const trimmed = searchTerm.trim();
      if (!trimmed) return;
      setSearching(true);
      setSearchError(null);
      setFallbackNotice(null);
      setHasSearched(true);

      try {
        const response = await fetch(
          `/api/music/search?q=${encodeURIComponent(trimmed)}&type=${typeFilter}&source=${sourceFilter}&limit=20`
        );
        const data = await response.json();
        if (!response.ok) {
          setSearchError(data.error || 'Não foi possível concluir a busca.');
          setResults([]);
          return;
        }
        if (data.fallbackFrom === 'deezer' && data.providerUsed === 'musicbrainz') {
          setFallbackNotice(
            'Não encontrado no catálogo de streaming do Deezer — exibindo resultados do acervo MusicBrainz.'
          );
        }
        setResults(Array.isArray(data.albums) ? data.albums : []);
      } catch {
        setSearchError('Erro de conexão ao consultar álbuns. Tente novamente.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    if (initialQuery.trim()) {
      setActiveTab('search');
      setQuery(initialQuery);
      void runSearch(initialQuery, releaseType, catalogSource);
    }
  }, [isOpen, initialQuery, releaseType, catalogSource, runSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runSearch(query, releaseType, catalogSource);
  };

  const handleChangeReleaseType = (nextType: ReleaseTypeFilter) => {
    setReleaseType(nextType);
    if (query.trim()) {
      void runSearch(query, nextType, catalogSource);
    }
  };

  const handleChangeSource = (nextSource: CatalogSource) => {
    setCatalogSource(nextSource);
    if (query.trim()) {
      void runSearch(query, releaseType, nextSource);
    }
  };

  const fetchAndCreateAlbum = async (
    item: CatalogSearchResult,
    initialStatus: {
      isListened?: boolean;
      isLiked?: boolean;
      isFavorite?: boolean;
      inWatchlist?: boolean;
    },
    openStudio: boolean
  ): Promise<Album | null> => {
    setBusyCatalogId(item.catalogId);
    setSearchError(null);
    try {
      const response = await fetch(
        `/api/music/album/${item.source}/${encodeURIComponent(item.providerId)}`
      );
      const data = await response.json();
      if (!response.ok || !data.album) {
        setSearchError(data.error || 'Falha ao carregar faixas deste álbum.');
        return null;
      }
      const detail = data.album as CatalogAlbumDetail;
      const created = onImportAlbum(
        {
          externalCatalogId: detail.catalogId,
          itunesCollectionId: detail.collectionId,
          title: detail.title,
          artist: detail.artist,
          releaseYear: detail.releaseYear,
          genre: detail.genre,
          coverUrl: detail.coverUrl || item.coverUrl,
          isListened: initialStatus.isListened,
          isLiked: initialStatus.isLiked,
          isFavorite: initialStatus.isFavorite,
          inWatchlist: initialStatus.inWatchlist,
          tracks:
            detail.tracks.length > 0
              ? detail.tracks
              : [{ trackNumber: 1, title: 'Faixa 1', durationMs: 180000 }],
        },
        { openStudio }
      );
      onEnrichAlbumFromAoty(created.id, created.artist, created.title);
      return created;
    } catch {
      setSearchError('Erro ao importar detalhes do álbum. Tente novamente.');
      return null;
    } finally {
      setBusyCatalogId(null);
    }
  };

  const handleOpenOrImportStudio = async (item: CatalogSearchResult) => {
    const existing = findExistingAlbum(item);
    if (existing) {
      onOpenAlbumStudio(existing.id);
      onClose();
      return;
    }
    const created = await fetchAndCreateAlbum(item, {}, true);
    if (created) {
      onClose();
    }
  };

  const handleQuickStatusFromSearch = async (
    item: CatalogSearchResult,
    field: AlbumStatusField
  ) => {
    const existing = findExistingAlbum(item);
    if (existing) {
      onToggleAlbumStatus(existing.id, field);
      return;
    }
    await fetchAndCreateAlbum(
      item,
      {
        isListened: field === 'isListened',
        isLiked: field === 'isLiked',
        isFavorite: field === 'isFavorite',
        inWatchlist: field === 'inWatchlist',
      },
      false
    );
  };

  const handleOpenListPickerFromSearch = async (item: CatalogSearchResult) => {
    const existing = findExistingAlbum(item);
    if (existing) {
      onOpenListPicker(existing);
      return;
    }
    const created = await fetchAndCreateAlbum(item, {}, false);
    if (created) {
      onOpenListPicker(created);
    }
  };

  const handleAddManualTrack = () => {
    setManualTracks((prev) => [
      ...prev,
      { id: String(Date.now() + Math.random()), title: '', durationText: '3:30' },
    ]);
  };

  const handleRemoveManualTrack = (id: string) => {
    setManualTracks((prev) => (prev.length > 1 ? prev.filter((t) => t.id !== id) : prev));
  };

  const handleApplyBulkTracks = () => {
    const lines = bulkTracksText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const parsed: ManualTrackDraft[] = lines.map((line, idx) => {
      const durationMatch = /^(.*?)\s+(\d{1,2}:\d{2})$/.exec(line);
      if (durationMatch) {
        return {
          id: `${Date.now()}_${idx}`,
          title: durationMatch[1].replace(/^\d+[\.\-\)]\s*/, '').trim(),
          durationText: durationMatch[2],
        };
      }
      return {
        id: `${Date.now()}_${idx}`,
        title: line.replace(/^\d+[\.\-\)]\s*/, '').trim(),
        durationText: '3:30',
      };
    });

    setManualTracks(parsed);
    setShowBulkMode(false);
    setBulkTracksText('');
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    setManualError(null);

    if (!title.trim() || !artist.trim()) {
      setManualError('Preencha pelo menos o título do álbum e o nome do artista.');
      return;
    }

    const parsedYear = Number.parseInt(releaseYear, 10);
    const validYear =
      Number.isFinite(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100
        ? parsedYear
        : new Date().getFullYear();

    const validTracks = manualTracks
      .map((t) => ({
        title: t.title.trim(),
        durationMs: parseDurationInput(t.durationText),
      }))
      .filter((t) => t.title.length > 0);

    if (validTracks.length === 0) {
      setManualError('Adicione pelo menos uma faixa com título.');
      return;
    }

    const safeCover = coverUrl.trim() ? sanitizeImageUrl(coverUrl.trim()) : '';
    if (coverUrl.trim() && !safeCover) {
      setManualError('A URL da capa deve começar com http:// ou https://.');
      return;
    }

    onImportAlbum(
      {
        title: title.trim(),
        artist: artist.trim(),
        releaseYear: validYear,
        genre: genre.trim() || 'Independente',
        coverUrl: safeCover,
        tracks: validTracks.map((t, idx) => ({
          trackNumber: idx + 1,
          title: t.title,
          durationMs: t.durationMs,
        })),
      },
      { openStudio: true }
    );

    setTitle('');
    setArtist('');
    setGenre('');
    setCoverUrl('');
    setManualTracks([
      { id: '1', title: '', durationText: '3:30' },
      { id: '2', title: '', durationText: '3:45' },
    ]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-album-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-white/[0.12] bg-[#161B22] shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <h2 id="add-album-modal-title" className="font-display text-lg font-bold text-white">
            Adicionar Álbum ao Acervo
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="flex h-9 w-9 items-center justify-center rounded-md text-[#8B949E] hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center gap-2 border-b border-white/[0.08] bg-[#0E1116]/60 px-6 py-2.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'search'
                ? 'bg-[#3B82F6] text-white'
                : 'text-[#8B949E] hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            Buscar Catálogo Real
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('aoty')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'aoty'
                ? 'bg-[#3B82F6] text-white'
                : 'text-[#8B949E] hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            Importar do AOTY (Link / ID)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'manual'
                ? 'bg-[#3B82F6] text-white'
                : 'text-[#8B949E] hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            Cadastro Manual
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'search' ? (
            <div className="space-y-4">
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
                    placeholder="Buscar por álbum ou artista (ex.: Clube da Esquina, Blonde, Igor...)"
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] py-2.5 pl-10 pr-4 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                    autoFocus
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
                  <span>Buscar</span>
                </button>
              </form>

              {/* Source & Release Type Filter Bar */}
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div
                    role="group"
                    aria-label="Fonte de busca de álbuns"
                    className="inline-flex flex-wrap items-center gap-1 rounded-md border border-white/[0.08] bg-[#0E1116] p-1"
                  >
                    {CATALOG_SOURCE_LABELS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleChangeSource(opt.id)}
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
                    aria-label="Filtrar formato de lançamento"
                    className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#0E1116] p-1"
                  >
                    {RELEASE_TYPE_LABELS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleChangeReleaseType(opt.id)}
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
                <p className="text-[11px] text-[#8B949E]">
                  Marque Ouvido, Curtido, Quero Ouvir ou + Lista direto nos resultados. Não achou no streaming? Alterne para MusicBrainz.
                </p>
              </div>

              {/* Quick Suggestions */}
              {!hasSearched && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-medium text-[#8B949E]">Sugestões rápidas:</p>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR_SEARCH_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          setQuery(suggestion);
                          void runSearch(suggestion, releaseType, catalogSource);
                        }}
                        className="rounded-md border border-white/[0.08] bg-[#0E1116] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] hover:border-[#3B82F6]/60 hover:text-white transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {fallbackNotice && (
                <div className="rounded-md border border-[#3B82F6]/35 bg-[#1E3A8A]/25 px-4 py-2.5 text-xs text-[#93C5FD]">
                  {fallbackNotice}
                </div>
              )}

              {searchError && (
                <div
                  role="alert"
                  className="rounded-md border border-[#EF4444]/40 bg-[#450A0A]/40 px-4 py-3 text-sm text-[#FCA5A5]"
                >
                  {searchError}
                </div>
              )}

              {searching ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-[#0E1116]/60 p-3 animate-pulse"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {results.map((item) => {
                    const existing = findExistingAlbum(item);
                    const isBusy = busyCatalogId === item.catalogId;
                    const listCount = existing ? listCountByAlbumId.get(existing.id) ?? 0 : 0;

                    return (
                      <div
                        key={item.catalogId}
                        className="flex flex-col justify-between gap-3 rounded-md border border-white/[0.08] bg-[#0E1116]/70 p-3.5 hover:border-white/[0.18] transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <AlbumArtwork
                            coverUrl={item.coverUrl}
                            title={item.title}
                            artist={item.artist}
                            className="h-16 w-16 rounded-sm shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-white truncate">
                                {item.title}
                              </h3>
                            </div>
                            <p className="text-xs text-[#CBD5E1] truncate">{item.artist}</p>
                            <p className="mt-0.5 text-[11px] text-[#8B949E] truncate font-mono tabular-nums">
                              {item.releaseYear ? `${item.releaseYear} · ` : ''}
                              {item.genre}
                              {item.trackCount > 0 ? ` · ${item.trackCount} faixas` : ''}
                              {item.releaseType !== 'album' &&
                                ` · ${item.releaseType === 'ep' ? 'EP' : 'Single'}`}
                              {` · ${item.source === 'deezer' ? 'Deezer' : item.source === 'musicbrainz' ? 'MusicBrainz' : 'iTunes'}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
                          <LetterboxdActions
                            isListened={existing?.isListened ?? false}
                            isLiked={existing?.isLiked ?? false}
                            isFavorite={existing?.isFavorite ?? false}
                            inWatchlist={existing?.inWatchlist ?? false}
                            listCount={listCount}
                            disabled={busyCatalogId !== null}
                            onToggleListened={() =>
                              void handleQuickStatusFromSearch(item, 'isListened')
                            }
                            onToggleLiked={() =>
                              void handleQuickStatusFromSearch(item, 'isLiked')
                            }
                            onToggleFavorite={() =>
                              void handleQuickStatusFromSearch(item, 'isFavorite')
                            }
                            onToggleWatchlist={() =>
                              void handleQuickStatusFromSearch(item, 'inWatchlist')
                            }
                            onOpenListPicker={() =>
                              void handleOpenListPickerFromSearch(item)
                            }
                          />

                          <button
                            type="button"
                            disabled={busyCatalogId !== null}
                            onClick={() => void handleOpenOrImportStudio(item)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#3B82F6]/50 bg-[#3B82F6]/15 px-3 py-1.5 text-xs font-semibold text-[#60A5FA] whitespace-nowrap shrink-0 hover:bg-[#3B82F6] hover:text-white disabled:opacity-50 transition-colors"
                          >
                            {isBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            <span>{existing ? 'Abrir Estúdio' : 'Avaliar'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : hasSearched && !searchError ? (
                <div className="rounded-md border border-white/[0.08] bg-[#0E1116]/60 px-6 py-10 text-center">
                  <Music className="mx-auto h-8 w-8 text-[#64748B] mb-2" aria-hidden="true" />
                  <p className="text-sm font-medium text-white">
                    Nenhum lançamento encontrado nesse formato
                  </p>
                  <p className="mt-1 text-xs text-[#8B949E]">
                    Experimente trocar para MusicBrainz, alternar para &ldquo;Incluir EPs&rdquo; ou usar o Cadastro Manual.
                  </p>
                </div>
              ) : null}
            </div>
          ) : activeTab === 'aoty' ? (
            <div className="space-y-5">
              <div className="rounded-md border border-white/[0.08] bg-[#0E1116]/60 p-4 text-xs text-[#CBD5E1] leading-relaxed">
                Consulte diretamente a API do AOTY usando um link de álbum do{' '}
                <span className="font-mono text-white">albumoftheyear.org</span>, o ID numérico
                (ex.: <span className="font-mono text-white">362</span> ou{' '}
                <span className="font-mono text-white">2915</span>) ou Artista + Álbum para trazer
                notas da crítica, notas dos usuários, avaliações por faixa e resenhas de veículos.
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setAotyLoading(true);
                  setAotyError(null);
                  setAotyResult(null);
                  try {
                    const qs = aotySlugInput.trim()
                      ? `slug=${encodeURIComponent(aotySlugInput.trim())}`
                      : `artist=${encodeURIComponent(aotyArtistInput.trim())}&name=${encodeURIComponent(aotyAlbumInput.trim())}`;
                    const resp = await fetch(`/api/aoty/album?${qs}`);
                    const data = (await resp.json()) as AotyLookupPayload;
                    if (!data.found || !data.album) {
                      setAotyError(
                        data.message || 'Não foi possível localizar este álbum no AOTY.'
                      );
                    } else {
                      setAotyResult(data.album);
                    }
                  } catch {
                    setAotyError('Erro ao consultar a API do AOTY.');
                  } finally {
                    setAotyLoading(false);
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="aoty-slug-input" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Link ou ID do Álbum no AOTY
                  </label>
                  <input
                    id="aoty-slug-input"
                    type="text"
                    value={aotySlugInput}
                    onChange={(e) => setAotySlugInput(e.target.value)}
                    placeholder="Ex.: 362 ou https://www.albumoftheyear.org/album/362-radiohead-ok-computer.php"
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="aoty-artist-input" className="block text-xs font-medium text-[#8B949E] mb-1">
                      Ou busque por Artista
                    </label>
                    <input
                      id="aoty-artist-input"
                      type="text"
                      value={aotyArtistInput}
                      onChange={(e) => setAotyArtistInput(e.target.value)}
                      placeholder="Ex.: OutKast"
                      className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="aoty-album-input" className="block text-xs font-medium text-[#8B949E] mb-1">
                      Nome do Álbum
                    </label>
                    <input
                      id="aoty-album-input"
                      type="text"
                      value={aotyAlbumInput}
                      onChange={(e) => setAotyAlbumInput(e.target.value)}
                      placeholder="Ex.: Aquemini"
                      className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[#8B949E]">Exemplos em cache:</span>
                    {[
                      { slug: '362', label: '362 · OK Computer' },
                      { slug: '2915', label: '2915 · Aquemini' },
                    ].map((ex) => (
                      <button
                        key={ex.slug}
                        type="button"
                        onClick={() => setAotySlugInput(ex.slug)}
                        className="rounded border border-white/[0.1] bg-[#0E1116] px-2.5 py-1 text-xs font-mono text-[#CBD5E1] hover:border-[#3B82F6] hover:text-white"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={
                      aotyLoading ||
                      (!aotySlugInput.trim() && (!aotyArtistInput.trim() || !aotyAlbumInput.trim()))
                    }
                    className="inline-flex items-center gap-2 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] disabled:opacity-50"
                  >
                    {aotyLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Search className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>Consultar AOTY</span>
                  </button>
                </div>
              </form>

              {aotyError && (
                <div
                  role="alert"
                  className="rounded-md border border-[#EF4444]/40 bg-[#450A0A]/40 px-4 py-3 text-xs text-[#FCA5A5]"
                >
                  {aotyError}
                </div>
              )}

              {aotyResult && (
                <div className="rounded-lg border border-white/[0.12] bg-[#0E1116]/80 p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <AlbumArtwork
                        coverUrl={aotyResult.coverUrl}
                        title={aotyResult.title}
                        artist={aotyResult.artist}
                        className="h-20 w-20 rounded-sm shrink-0"
                      />
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-bold text-white truncate">
                          {aotyResult.title}
                        </h3>
                        <p className="text-sm text-[#CBD5E1] truncate">{aotyResult.artist}</p>
                        <p className="text-xs text-[#8B949E] mt-0.5">
                          {aotyResult.releaseYear} · {aotyResult.aotyData.genres.join(' · ') || aotyResult.genre}
                          {aotyResult.aotyData.label ? ` · ${aotyResult.aotyData.label}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-center">
                        <p className="text-[11px] text-[#8B949E] mb-1">Crítica</p>
                        <ScoreBox score={aotyResult.aotyData.criticScore} size="sm" />
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] text-[#8B949E] mb-1">Usuários</p>
                        <ScoreBox score={aotyResult.aotyData.userScore} size="sm" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/[0.08] pt-3">
                    <span className="text-xs text-[#8B949E] font-mono tabular-nums">
                      {aotyResult.tracks.length} faixas · {aotyResult.aotyData.criticReviews.length}{' '}
                      resenhas da crítica
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onImportAlbum(
                          {
                            title: aotyResult.title,
                            artist: aotyResult.artist,
                            releaseYear: aotyResult.releaseYear,
                            genre: aotyResult.genre,
                            coverUrl: aotyResult.coverUrl,
                            aotyData: aotyResult.aotyData,
                            tracks:
                              aotyResult.tracks.length > 0
                                ? aotyResult.tracks
                                : [{ trackNumber: 1, title: 'Faixa 1', durationMs: 180000 }],
                          },
                          { openStudio: true }
                        );
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB]"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Importar e Avaliar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-5">
              {manualError && (
                <div
                  role="alert"
                  className="rounded-md border border-[#EF4444]/40 bg-[#450A0A]/40 px-4 py-3 text-sm text-[#FCA5A5]"
                >
                  {manualError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="manual-title" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Título do Álbum *
                  </label>
                  <input
                    id="manual-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: Sobrevivendo no Inferno"
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="manual-artist" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Artista / Banda *
                  </label>
                  <input
                    id="manual-artist"
                    type="text"
                    required
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="Ex.: Racionais MC's"
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="manual-year" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Ano de Lançamento
                  </label>
                  <input
                    id="manual-year"
                    type="number"
                    min={1900}
                    max={2100}
                    value={releaseYear}
                    onChange={(e) => setReleaseYear(e.target.value)}
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-sm tabular-nums text-white focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="manual-genre" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Gênero Principal
                  </label>
                  <input
                    id="manual-genre"
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    placeholder="Ex.: Hip-Hop, MPB, Indie Rock"
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="manual-cover" className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  URL da Capa (opcional)
                </label>
                <input
                  id="manual-cover"
                  type="url"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                />
              </div>

              <div className="border-t border-white/[0.08] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Lista de Faixas</h3>
                  <button
                    type="button"
                    onClick={() => setShowBulkMode((v) => !v)}
                    className="text-xs font-medium text-[#60A5FA] hover:text-white transition-colors"
                  >
                    {showBulkMode ? 'Voltar para linhas' : 'Colar lista em lote'}
                  </button>
                </div>

                {showBulkMode ? (
                  <div className="space-y-2.5">
                    <textarea
                      rows={6}
                      value={bulkTracksText}
                      onChange={(e) => setBulkTracksText(e.target.value)}
                      placeholder={'1. Faixa Um 3:42\n2. Faixa Dois 4:15\n3. Faixa Três'}
                      className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] p-3 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleApplyBulkTracks}
                      className="rounded-md bg-[#1C222B] border border-white/[0.12] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#262E3A] transition-colors"
                    >
                      Aplicar Faixas Coladas
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {manualTracks.map((trk, index) => (
                      <div key={trk.id} className="flex items-center gap-2">
                        <span className="w-7 text-right font-mono text-xs tabular-nums text-[#8B949E]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <input
                          type="text"
                          value={trk.title}
                          onChange={(e) =>
                            setManualTracks((prev) =>
                              prev.map((item) =>
                                item.id === trk.id ? { ...item, title: e.target.value } : item
                              )
                            )
                          }
                          placeholder={`Título da faixa ${index + 1}`}
                          className="flex-1 rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-1.5 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                        />
                        <input
                          type="text"
                          value={trk.durationText}
                          onChange={(e) =>
                            setManualTracks((prev) =>
                              prev.map((item) =>
                                item.id === trk.id ? { ...item, durationText: e.target.value } : item
                              )
                            )
                          }
                          aria-label={`Duração da faixa ${index + 1}`}
                          placeholder="3:30"
                          className="w-20 rounded-md border border-white/[0.1] bg-[#0E1116] px-2.5 py-1.5 text-center font-mono text-xs tabular-nums text-white focus:border-[#3B82F6] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveManualTrack(trk.id)}
                          disabled={manualTracks.length <= 1}
                          aria-label={`Remover faixa ${index + 1}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-[#8B949E] hover:bg-white/[0.06] hover:text-[#F87171] disabled:opacity-30 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={handleAddManualTrack}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] hover:border-white/25 hover:text-white transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Nova Faixa</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-white/[0.12] px-4 py-2 text-sm font-medium text-[#CBD5E1] hover:bg-white/[0.05] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#3B82F6] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2563EB] transition-colors"
                >
                  Salvar Álbum
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
