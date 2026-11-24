import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Award,
  Bookmark,
  Check,
  ExternalLink,
  Eye,
  GripVertical,
  Heart,
  Link2,
  ListOrdered,
  ListPlus,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { PRESET_MOOD_TAGS } from '../data/sampleCatalog';
import type {
  Album,
  AlbumStatusField,
  AotyAlbumListsPayload,
  AotyAlbumUserReviewsPayload,
  AotyLookupPayload,
  AotySongDetailPayload,
  AotyUserReview,
  AudioPreviewState,
  RatingMode,
  Track,
} from '../types/music';
import {
  calculateAlbumScore,
  calculateTracksAverage,
  clampScore,
  formatDuration,
  getScoreVisuals,
  parseDurationInput,
  sanitizeImageUrl,
} from '../utils/scoring';
import { AlbumArtwork } from './AlbumArtwork';
import { AotyScorePanel } from './AotyScorePanel';
import { ScoreBox } from './ScoreBox';

interface AlbumStudioViewProps {
  album: Album;
  listCount: number;
  activePreview: AudioPreviewState | null;
  onBack: () => void;
  onUpdateAlbum: (albumId: string, updater: (prev: Album) => Album) => void;
  onAttachAotyData: (albumId: string, aotyData: NonNullable<Album['aotyData']>) => void;
  onToggleAlbumStatus: (albumId: string, field: AlbumStatusField) => void;
  onOpenListPicker: (album: Album) => void;
  onDeleteAlbum: (albumId: string) => void;
  onUpdateTrackScore: (albumId: string, trackId: string, score: number | null) => void;
  onToggleTrackFavorite: (albumId: string, trackId: string) => void;
  onReorderTracksRank: (albumId: string, orderedTrackIds: string[]) => void;
  onAddTrack: (albumId: string, title: string, durationMs: number) => void;
  onSetRatingMode: (albumId: string, mode: RatingMode, manualScore?: number | null) => void;
  onPlayPreview: (track: {
    id: string;
    title: string;
    previewUrl: string;
    artist: string;
    albumTitle: string;
  }) => void;
}

type StudioTab = 'tracks' | 'ranking' | 'review';

export function AlbumStudioView({
  album,
  listCount,
  activePreview,
  onBack,
  onUpdateAlbum,
  onAttachAotyData,
  onToggleAlbumStatus,
  onOpenListPicker,
  onDeleteAlbum,
  onUpdateTrackScore,
  onToggleTrackFavorite,
  onReorderTracksRank,
  onAddTrack,
  onSetRatingMode,
  onPlayPreview,
}: AlbumStudioViewProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>('tracks');

  // Letterboxd-style 3-dots menu state
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [confirmDeleteInMenu, setConfirmDeleteInMenu] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // AOTY sync state
  const [syncingAoty, setSyncingAoty] = useState(false);
  const [showAotySlugModal, setShowAotySlugModal] = useState(false);
  const [aotySlugQuery, setAotySlugQuery] = useState(album.aotyData?.aotyId ?? '');
  const [aotySyncMessage, setAotySyncMessage] = useState<string | null>(null);

  // Drag-and-drop state for Track Ranker
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);

  // Add track inline state
  const [newTrackTitle, setNewTrackTitle] = useState('');
  const [newTrackDuration, setNewTrackDuration] = useState('3:30');

  // Custom mood tag input
  const [customMoodInput, setCustomMoodInput] = useState('');

  // Metadata edit state
  const [editTitle, setEditTitle] = useState(album.title);
  const [editArtist, setEditArtist] = useState(album.artist);
  const [editYear, setEditYear] = useState(String(album.releaseYear));
  const [editGenre, setEditGenre] = useState(album.genre);
  const [editCoverUrl, setEditCoverUrl] = useState(album.coverUrl);
  const [metaSavedFeedback, setMetaSavedFeedback] = useState(false);

  // Community user reviews (AOTY album & tracks)
  const [userReviews, setUserReviews] = useState<AotyUserReview[]>(
    album.aotyData?.userReviews ?? []
  );
  const [userReviewsSort, setUserReviewsSort] = useState<'popular' | 'recent' | 'worst'>(
    'popular'
  );
  const [loadingUserReviews, setLoadingUserReviews] = useState(false);
  const [userReviewsStatus, setUserReviewsStatus] = useState<{
    available: boolean;
    message?: string;
    fetchedForKey?: string;
  }>({
    available: (album.aotyData?.userReviews?.length ?? 0) > 0,
  });

  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [trackCommunityMap, setTrackCommunityMap] = useState<
    Record<string, { loading: boolean; data?: AotySongDetailPayload }>
  >({});

  // AOTY album lists (critic & user lists)
  const [aotyListType, setAotyListType] = useState<'critic' | 'user'>('critic');
  const [loadingAotyLists, setLoadingAotyLists] = useState(false);
  const [aotyListsCache, setAotyListsCache] = useState<
    Record<string, AotyAlbumListsPayload>
  >({});

  // Reset album-scoped UI state when switching albums
  useEffect(() => {
    setEditTitle(album.title);
    setEditArtist(album.artist);
    setEditYear(String(album.releaseYear));
    setEditGenre(album.genre);
    setEditCoverUrl(album.coverUrl);
    setAotySlugQuery(album.aotyData?.aotyId ?? '');
    setAotySyncMessage(null);
    setUserReviews(album.aotyData?.userReviews ?? []);
    setUserReviewsStatus({
      available: (album.aotyData?.userReviews?.length ?? 0) > 0,
    });
    setExpandedTrackId(null);
    setTrackCommunityMap({});
    setAotyListsCache({});
  }, [album.id]);

  useEffect(() => {
    if (album.aotyData?.userReviews && album.aotyData.userReviews.length > 0) {
      setUserReviews(album.aotyData.userReviews);
    }
  }, [album.aotyData?.userReviews]);

  // Close 3-dots menu on outside click or Escape
  useEffect(() => {
    if (!isActionsMenuOpen) {
      setConfirmDeleteInMenu(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsActionsMenuOpen(false);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isActionsMenuOpen]);

  const effectiveScore = useMemo(
    () => calculateAlbumScore(album.tracks, album.ratingMode, album.manualScore),
    [album.tracks, album.ratingMode, album.manualScore]
  );

  const simpleMean = useMemo(
    () => calculateTracksAverage(album.tracks, 'auto-mean'),
    [album.tracks]
  );

  const ratedTracksCount = useMemo(
    () => album.tracks.filter((t) => typeof t.score === 'number').length,
    [album.tracks]
  );

  const rankedTracks = useMemo(
    () => [...album.tracks].sort((a, b) => a.rankOrder - b.rankOrder),
    [album.tracks]
  );

  const bestTrack = useMemo(() => {
    const rated = album.tracks.filter((t) => typeof t.score === 'number');
    if (rated.length === 0) return null;
    return [...rated].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  }, [album.tracks]);

  const hasTrackAotyRatings = useMemo(
    () => album.tracks.some((t) => typeof t.aotyRating === 'number'),
    [album.tracks]
  );

  const activeStatusItems = useMemo(() => {
    const items: Array<{ key: string; label: string; colorClass: string }> = [];
    if (album.isListened) {
      items.push({ key: 'listened', label: 'Ouvido', colorClass: 'text-[#4ADE80]' });
    }
    if (album.inWatchlist) {
      items.push({ key: 'watchlist', label: 'Quero Ouvir', colorClass: 'text-[#60A5FA]' });
    }
    if (album.isLiked) {
      items.push({ key: 'liked', label: 'Curtido', colorClass: 'text-[#FB7185]' });
    }
    if (album.isFavorite) {
      items.push({ key: 'favorite', label: 'Favorito', colorClass: 'text-[#FBBF24]' });
    }
    if (album.mustHear) {
      items.push({ key: 'musthear', label: 'Must Hear', colorClass: 'text-[#F59E0B]' });
    }
    if (listCount > 0) {
      items.push({
        key: 'lists',
        label: listCount === 1 ? '1 lista' : `${listCount} listas`,
        colorClass: 'text-[#CBD5E1]',
      });
    }
    return items;
  }, [
    album.isListened,
    album.inWatchlist,
    album.isLiked,
    album.isFavorite,
    album.mustHear,
    listCount,
  ]);

  const handleTrackDrop = (targetId: string) => {
    if (!draggedTrackId || draggedTrackId === targetId) {
      setDraggedTrackId(null);
      setDragOverTrackId(null);
      return;
    }

    const ids = rankedTracks.map((t) => t.id);
    const fromIdx = ids.indexOf(draggedTrackId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const nextIds = [...ids];
    const [moved] = nextIds.splice(fromIdx, 1);
    nextIds.splice(toIdx, 0, moved);

    onReorderTracksRank(album.id, nextIds);
    setDraggedTrackId(null);
    setDragOverTrackId(null);
  };

  const handleMoveRankStep = (trackId: string, direction: -1 | 1) => {
    const ids = rankedTracks.map((t) => t.id);
    const idx = ids.indexOf(trackId);
    const nextIdx = idx + direction;
    if (idx === -1 || nextIdx < 0 || nextIdx >= ids.length) return;
    const nextIds = [...ids];
    [nextIds[idx], nextIds[nextIdx]] = [nextIds[nextIdx], nextIds[idx]];
    onReorderTracksRank(album.id, nextIds);
  };

  const handleSortRankByScore = () => {
    const sorted = [...album.tracks].sort((a, b) => {
      const sa = a.score ?? -1;
      const sb = b.score ?? -1;
      if (sb !== sa) return sb - sa;
      return a.trackNumber - b.trackNumber;
    });
    onReorderTracksRank(
      album.id,
      sorted.map((t) => t.id)
    );
  };

  const handleAddTrackSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newTrackTitle.trim()) return;
    onAddTrack(album.id, newTrackTitle.trim(), parseDurationInput(newTrackDuration));
    setNewTrackTitle('');
    setNewTrackDuration('3:30');
  };

  const handleToggleMood = (tag: string) => {
    onUpdateAlbum(album.id, (prev) => {
      const exists = prev.moodTags.includes(tag);
      return {
        ...prev,
        moodTags: exists
          ? prev.moodTags.filter((t) => t !== tag)
          : [...prev.moodTags, tag].slice(0, 12),
      };
    });
  };

  const handleAddCustomMood = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = customMoodInput.trim();
    if (!cleaned) return;
    if (!album.moodTags.includes(cleaned)) {
      onUpdateAlbum(album.id, (prev) => ({
        ...prev,
        moodTags: [...prev.moodTags, cleaned].slice(0, 12),
      }));
    }
    setCustomMoodInput('');
  };

  const handleSaveMetadata = (e: FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !editArtist.trim()) return;
    const yearNum = Number.parseInt(editYear, 10);
    const validYear =
      Number.isFinite(yearNum) && yearNum >= 1900 && yearNum <= 2100
        ? yearNum
        : album.releaseYear;
    const safeCover = editCoverUrl.trim() ? sanitizeImageUrl(editCoverUrl.trim()) : '';

    onUpdateAlbum(album.id, (prev) => ({
      ...prev,
      title: editTitle.trim(),
      artist: editArtist.trim(),
      releaseYear: validYear,
      genre: editGenre.trim() || prev.genre,
      coverUrl: safeCover,
    }));
    setMetaSavedFeedback(true);
    setTimeout(() => setMetaSavedFeedback(false), 2000);
  };

  const handleSyncAoty = async (customSlug?: string) => {
    setSyncingAoty(true);
    setAotySyncMessage(null);
    try {
      const qs = customSlug?.trim()
        ? `slug=${encodeURIComponent(customSlug.trim())}`
        : album.aotyData?.aotyId
          ? `slug=${encodeURIComponent(album.aotyData.aotyId)}`
          : `artist=${encodeURIComponent(album.artist)}&name=${encodeURIComponent(album.title)}`;
      const resp = await fetch(`/api/aoty/album?${qs}`);
      const payload = (await resp.json()) as AotyLookupPayload;
      if (!payload.found || !payload.album) {
        setAotySyncMessage(
          payload.message || 'Álbum não encontrado no AOTY. Informe o link ou ID na ficha AOTY.'
        );
        setShowAotySlugModal(true);
      } else {
        onAttachAotyData(album.id, payload.album.aotyData);
        setAotySlugQuery(payload.album.aotyData.aotyId);
        setAotySyncMessage('Dados do AOTY sincronizados com sucesso.');
        setShowAotySlugModal(false);
      }
    } catch {
      setAotySyncMessage('Falha ao conectar com a API do AOTY.');
    } finally {
      setSyncingAoty(false);
    }
  };

  const fetchAlbumUserReviews = async (
    slug: string,
    sort: 'popular' | 'recent' | 'worst'
  ) => {
    const requestKey = `${slug}:${sort}`;
    setLoadingUserReviews(true);
    try {
      const resp = await fetch(
        `/api/aoty/album/reviews?slug=${encodeURIComponent(slug)}&sort=${sort}&page=1`
      );
      const payload = (await resp.json()) as AotyAlbumUserReviewsPayload;
      if (payload.available && payload.reviews.length > 0) {
        setUserReviews(payload.reviews);
        setUserReviewsStatus({
          available: true,
          fetchedForKey: requestKey,
        });
      } else {
        setUserReviews(album.aotyData?.userReviews ?? []);
        setUserReviewsStatus({
          available: Boolean(payload.available),
          message:
            payload.message ||
            (payload.available
              ? 'Nenhuma review de usuário encontrada para este filtro.'
              : undefined),
          fetchedForKey: requestKey,
        });
      }
    } catch {
      setUserReviewsStatus({
        available: false,
        message: 'Não foi possível carregar reviews da comunidade agora.',
        fetchedForKey: requestKey,
      });
    } finally {
      setLoadingUserReviews(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'review' || !album.aotyData?.aotyId) return;
    const key = `${album.aotyData.aotyId}:${userReviewsSort}`;
    if (userReviewsStatus.fetchedForKey === key || loadingUserReviews) return;
    void fetchAlbumUserReviews(album.aotyData.aotyId, userReviewsSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, album.aotyData?.aotyId, userReviewsSort]);

  const fetchAlbumAotyLists = async (slug: string, listType: 'critic' | 'user') => {
    const cacheKey = `${slug}:${listType}`;
    setLoadingAotyLists(true);
    try {
      const resp = await fetch(
        `/api/aoty/album/lists?slug=${encodeURIComponent(slug)}&type=${listType}&page=1`
      );
      const payload = (await resp.json()) as AotyAlbumListsPayload;
      setAotyListsCache((prev) => ({
        ...prev,
        [cacheKey]: payload,
      }));
    } catch {
      setAotyListsCache((prev) => ({
        ...prev,
        [cacheKey]: {
          available: false,
          blocked: true,
          type: listType,
          criticLists: [],
          userLists: [],
          message: 'Não foi possível consultar as listas deste álbum no AOTY agora.',
        },
      }));
    } finally {
      setLoadingAotyLists(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'review' || !album.aotyData?.aotyId) return;
    const cacheKey = `${album.aotyData.aotyId}:${aotyListType}`;
    if (aotyListsCache[cacheKey] || loadingAotyLists) return;
    void fetchAlbumAotyLists(album.aotyData.aotyId, aotyListType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, album.aotyData?.aotyId, aotyListType]);

  const handleToggleTrackCommunity = async (track: Track) => {
    if (expandedTrackId === track.id) {
      setExpandedTrackId(null);
      return;
    }

    setExpandedTrackId(track.id);
    if (!track.aotySongUrl || trackCommunityMap[track.id]?.data || trackCommunityMap[track.id]?.loading) {
      return;
    }

    setTrackCommunityMap((prev) => ({
      ...prev,
      [track.id]: { loading: true },
    }));

    try {
      const resp = await fetch(
        `/api/aoty/song?slug=${encodeURIComponent(track.aotySongUrl)}`
      );
      const payload = (await resp.json()) as AotySongDetailPayload;
      setTrackCommunityMap((prev) => ({
        ...prev,
        [track.id]: { loading: false, data: payload },
      }));
    } catch {
      setTrackCommunityMap((prev) => ({
        ...prev,
        [track.id]: {
          loading: false,
          data: {
            available: false,
            blocked: true,
            message: 'Não foi possível carregar os comentários desta faixa agora.',
          },
        },
      }));
    }
  };

  const scoreVisuals = getScoreVisuals(effectiveScore);
  const progressPercent =
    album.tracks.length > 0 ? Math.round((ratedTracksCount / album.tracks.length) * 100) : 0;

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6 space-y-6">
      {/* Clean Top Breadcrumb Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#CBD5E1] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Voltar ao Catálogo</span>
        </button>

        {/* Letterboxd-style 3-Dots Actions Menu Trigger */}
        <div ref={menuContainerRef} className="relative">
          <button
            type="button"
            onClick={() => setIsActionsMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={isActionsMenuOpen}
            aria-label="Mais ações do álbum"
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
              isActionsMenuOpen
                ? 'border-[#3B82F6] bg-[#3B82F6]/15 text-white'
                : 'border-white/[0.12] bg-[#161B22] text-[#CBD5E1] hover:border-white/25 hover:text-white'
            }`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            <span>Ações</span>
          </button>

          {isActionsMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/50 sm:hidden"
                aria-hidden="true"
                onClick={() => setIsActionsMenuOpen(false)}
              />
              <div
                role="menu"
                aria-label="Ações do álbum"
                className="fixed inset-x-4 bottom-4 z-50 sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 rounded-lg border border-white/[0.14] bg-[#161B22] p-3 shadow-2xl space-y-3"
              >
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 sm:hidden">
                  <span className="text-xs font-semibold text-[#8B949E] truncate pr-2">
                    {album.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsActionsMenuOpen(false)}
                    aria-label="Fechar menu"
                    className="p-1 text-[#8B949E] hover:text-white"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Letterboxd 4-tile Status Bar */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={album.isListened}
                    onClick={() => onToggleAlbumStatus(album.id, 'isListened')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-md border py-2.5 px-1 text-[11px] font-semibold transition-colors ${
                      album.isListened
                        ? 'border-[#22C55E]/60 bg-[#14532D]/50 text-[#4ADE80]'
                        : 'border-white/[0.08] bg-[#0E1116] text-[#CBD5E1] hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {album.isListened ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>Ouvido</span>
                  </button>

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={album.isLiked}
                    onClick={() => onToggleAlbumStatus(album.id, 'isLiked')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-md border py-2.5 px-1 text-[11px] font-semibold transition-colors ${
                      album.isLiked
                        ? 'border-[#F43F5E]/60 bg-[#4C0519]/60 text-[#FB7185]'
                        : 'border-white/[0.08] bg-[#0E1116] text-[#CBD5E1] hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <Heart
                      className="h-4 w-4"
                      fill={album.isLiked ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                    <span>Curtir</span>
                  </button>

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={album.isFavorite}
                    onClick={() => onToggleAlbumStatus(album.id, 'isFavorite')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-md border py-2.5 px-1 text-[11px] font-semibold transition-colors ${
                      album.isFavorite
                        ? 'border-[#F59E0B]/60 bg-[#F59E0B]/15 text-[#FBBF24]'
                        : 'border-white/[0.08] bg-[#0E1116] text-[#CBD5E1] hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <Star
                      className="h-4 w-4"
                      fill={album.isFavorite ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                    <span>Favorito</span>
                  </button>

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={album.inWatchlist}
                    onClick={() => onToggleAlbumStatus(album.id, 'inWatchlist')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-md border py-2.5 px-1 text-[11px] font-semibold transition-colors ${
                      album.inWatchlist
                        ? 'border-[#3B82F6]/60 bg-[#1E3A8A]/50 text-[#60A5FA]'
                        : 'border-white/[0.08] bg-[#0E1116] text-[#CBD5E1] hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <Bookmark
                      className="h-4 w-4"
                      fill={album.inWatchlist ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                    <span>Na Fila</span>
                  </button>
                </div>

                {/* Editorial & Collection Actions */}
                <div className="space-y-1 border-t border-white/[0.08] pt-2">
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={album.mustHear}
                    onClick={() =>
                      onUpdateAlbum(album.id, (prev) => ({ ...prev, mustHear: !prev.mustHear }))
                    }
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-white/[0.05] hover:text-white transition-colors"
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <Award
                        className={`h-4 w-4 ${album.mustHear ? 'text-[#FBBF24]' : 'text-[#8B949E]'}`}
                        aria-hidden="true"
                      />
                      <span>Selo Must Hear</span>
                    </span>
                    <span
                      className={`font-mono text-[11px] ${
                        album.mustHear ? 'text-[#FBBF24]' : 'text-[#64748B]'
                      }`}
                    >
                      {album.mustHear ? 'Ativo' : 'Desativado'}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      onOpenListPicker(album);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-white/[0.05] hover:text-white transition-colors"
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <ListPlus className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                      <span>Adicionar à Lista</span>
                    </span>
                    {listCount > 0 && (
                      <span className="font-mono text-[11px] tabular-nums text-[#60A5FA]">
                        {listCount}
                      </span>
                    )}
                  </button>
                </div>

                {/* AOTY Integration Actions */}
                <div className="space-y-1 border-t border-white/[0.08] pt-2">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={syncingAoty}
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      void handleSyncAoty();
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-white/[0.05] hover:text-white disabled:opacity-50 transition-colors"
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <RefreshCw
                        className={`h-4 w-4 text-[#8B949E] ${syncingAoty ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{album.aotyData ? 'Atualizar Dados do AOTY' : 'Sincronizar com AOTY'}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      setShowAotySlugModal(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-white/[0.05] hover:text-white transition-colors"
                  >
                    <Link2 className="h-4 w-4 text-[#8B949E]" aria-hidden="true" />
                    <span>Vincular Link ou ID do AOTY</span>
                  </button>
                </div>

                {/* Danger Zone */}
                <div className="border-t border-white/[0.08] pt-2">
                  {!confirmDeleteInMenu ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setConfirmDeleteInMenu(true)}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-[#F87171] hover:bg-[#450A0A]/40 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span>Remover Álbum do Acervo</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-[#EF4444]/40 bg-[#450A0A]/40 px-3 py-2">
                      <span className="text-xs text-[#FCA5A5]">Confirmar?</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onDeleteAlbum(album.id)}
                          className="rounded bg-[#EF4444] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#DC2626]"
                        >
                          Excluir
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteInMenu(false)}
                          className="text-xs text-[#CBD5E1] hover:text-white px-1"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Album Editorial Header */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6">
        <div className="lg:col-span-3 flex justify-center lg:justify-start">
          <AlbumArtwork
            coverUrl={album.coverUrl}
            title={album.title}
            artist={album.artist}
            className="h-48 w-48 sm:h-60 sm:w-60 lg:h-full lg:w-full max-w-[250px] aspect-square rounded-md"
          />
        </div>

        <div className="lg:col-span-9 flex flex-col justify-between gap-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
            <div className="space-y-2.5 min-w-0">
              <p className="text-xs font-medium text-[#8B949E]">
                {album.artist} · {album.releaseYear} · {album.genre}
                {album.aotyData?.format ? ` · ${album.aotyData.format}` : ''}
                {album.aotyData?.label ? ` · ${album.aotyData.label}` : ''}
              </p>

              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white [text-wrap:balance]">
                {album.title}
              </h1>

              {/* Subtle status summary line instead of noisy action clutter */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {activeStatusItems.length > 0 ? (
                  activeStatusItems.map((st, idx) => (
                    <span key={st.key} className="inline-flex items-center gap-3">
                      {idx > 0 && (
                        <span aria-hidden="true" className="text-[#475569]">
                          ·
                        </span>
                      )}
                      <span className={`font-semibold ${st.colorClass}`}>{st.label}</span>
                    </span>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsActionsMenuOpen(true)}
                    className="text-xs text-[#8B949E] hover:text-white transition-colors"
                  >
                    Use <span className="font-mono text-[#CBD5E1]">Ações</span> acima para marcar
                    Ouvido, Favorito ou adicionar a listas
                  </button>
                )}

                {effectiveScore !== null && effectiveScore >= 80 && !album.mustHear && (
                  <>
                    {activeStatusItems.length > 0 && (
                      <span aria-hidden="true" className="text-[#475569]">
                        ·
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateAlbum(album.id, (prev) => ({ ...prev, mustHear: true }))
                      }
                      className="text-xs font-medium text-[#4ADE80] hover:underline"
                    >
                      Nota 80+ (Ativar Must Hear)
                    </button>
                  </>
                )}
              </div>

              {album.moodTags.length > 0 && (
                <p className="text-xs text-[#CBD5E1]">Clima: {album.moodTags.join(' · ')}</p>
              )}

              {/* Compact inline AOTY link prompt only when triggered */}
              {showAotySlugModal && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (aotySlugQuery.trim()) void handleSyncAoty(aotySlugQuery);
                  }}
                  className="flex flex-wrap items-center gap-2 pt-1 max-w-md"
                >
                  <input
                    type="text"
                    value={aotySlugQuery}
                    onChange={(e) => setAotySlugQuery(e.target.value)}
                    placeholder="ID ou link AOTY (ex.: 362 ou albumoftheyear.org/album/...)"
                    className="flex-1 min-w-[200px] rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-1.5 text-xs text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={syncingAoty || !aotySlugQuery.trim()}
                    className="rounded-md bg-[#3B82F6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB] disabled:opacity-40"
                  >
                    {syncingAoty ? 'Buscando...' : 'Vincular'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAotySlugModal(false)}
                    className="text-xs text-[#8B949E] hover:text-white px-1"
                  >
                    Fechar
                  </button>
                </form>
              )}

              {aotySyncMessage && (
                <p className="text-xs text-[#CBD5E1]">{aotySyncMessage}</p>
              )}
            </div>

            {/* Score Box & Mode Selector */}
            <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
              <div className="flex flex-nowrap items-center gap-3 sm:gap-4">
                {album.aotyData && <AotyScorePanel aotyData={album.aotyData} />}

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-left md:text-right">
                    <p className="text-[11px] text-[#8B949E] whitespace-nowrap">Sua Nota</p>
                    <p className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${scoreVisuals.textClass}`}>
                      {scoreVisuals.label}
                    </p>
                    {album.ratingMode === 'manual' && simpleMean !== null && (
                      <p className="text-[10px] text-[#8B949E] font-mono tabular-nums whitespace-nowrap">
                        Média: {simpleMean}
                      </p>
                    )}
                  </div>
                  <ScoreBox score={effectiveScore} size="lg" mustHear={album.mustHear} />
                </div>
              </div>

              {/* Compact Calculation Mode Control */}
              <div className="flex flex-nowrap items-center gap-2">
                <div
                  role="group"
                  aria-label="Modo de cálculo da nota"
                  className="inline-flex items-center rounded border border-white/[0.08] bg-[#0E1116]/90 p-0.5"
                >
                  <button
                    type="button"
                    title="Média simples das faixas"
                    onClick={() => onSetRatingMode(album.id, 'auto-mean')}
                    className={`rounded-sm px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      album.ratingMode === 'auto-mean'
                        ? 'bg-[#262E3A] text-white'
                        : 'text-[#8B949E] hover:text-white'
                    }`}
                  >
                    Média
                  </button>
                  <button
                    type="button"
                    title="Média ponderada pela duração das faixas"
                    onClick={() => onSetRatingMode(album.id, 'weighted-duration')}
                    className={`rounded-sm px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      album.ratingMode === 'weighted-duration'
                        ? 'bg-[#262E3A] text-white'
                        : 'text-[#8B949E] hover:text-white'
                    }`}
                  >
                    Duração
                  </button>
                  <button
                    type="button"
                    title="Definir nota manualmente"
                    onClick={() =>
                      onSetRatingMode(
                        album.id,
                        'manual',
                        album.manualScore ?? simpleMean ?? 80
                      )
                    }
                    className={`rounded-sm px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      album.ratingMode === 'manual'
                        ? 'bg-[#262E3A] text-white'
                        : 'text-[#8B949E] hover:text-white'
                    }`}
                  >
                    Manual
                  </button>
                </div>

                {album.ratingMode === 'manual' && (
                  <input
                    id="manual-album-score"
                    aria-label="Nota manual de 0 a 100"
                    type="number"
                    min={0}
                    max={100}
                    value={album.manualScore ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      onSetRatingMode(
                        album.id,
                        'manual',
                        val === '' ? null : clampScore(Number(val))
                      );
                    }}
                    className="h-6 w-14 rounded border border-[#3B82F6]/60 bg-[#0E1116] px-1.5 text-center font-mono text-xs font-bold tabular-nums text-white focus:border-[#3B82F6] focus:outline-none"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Progress & Highlights Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-white/[0.08] pt-4">
            <div>
              <div className="flex items-center justify-between text-xs text-[#8B949E] mb-1.5">
                <span>Progresso da Tracklist</span>
                <span className="font-mono tabular-nums text-[#CBD5E1]">
                  {ratedTracksCount}/{album.tracks.length} ({progressPercent}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0E1116]">
                <div
                  className={`h-full transition-all duration-200 ${scoreVisuals.barClass}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div>
              <p className="text-xs text-[#8B949E]">Faixa Mais Bem Avaliada</p>
              <p className="mt-0.5 text-sm font-medium text-white truncate">
                {bestTrack ? `${bestTrack.title} (${bestTrack.score})` : 'Avalie uma faixa abaixo'}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#8B949E]">Pódio Atual (#1 do Ranking)</p>
              <p className="mt-0.5 text-sm font-medium text-white truncate">
                {rankedTracks[0] ? rankedTracks[0].title : 'Sem faixas'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Studio Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('tracks')}
          className={`relative px-3.5 sm:px-4 py-3 text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'tracks' ? 'text-white' : 'text-[#8B949E] hover:text-white'
          }`}
        >
          Avaliar Faixas ({album.tracks.length})
          {activeTab === 'tracks' && (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-[#3B82F6]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ranking')}
          className={`relative px-3.5 sm:px-4 py-3 text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'ranking' ? 'text-white' : 'text-[#8B949E] hover:text-white'
          }`}
        >
          Ranking das Faixas
          {activeTab === 'ranking' && (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-[#3B82F6]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('review')}
          className={`relative px-3.5 sm:px-4 py-3 text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'review' ? 'text-white' : 'text-[#8B949E] hover:text-white'
          }`}
        >
          Resenha, Humor & AOTY
          {activeTab === 'review' && (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-[#3B82F6]" />
          )}
        </button>
      </div>

      {/* TAB 1: Responsive Track-by-Track Scorer (Zero Horizontal Scroll, No Delete Button) */}
      {activeTab === 'tracks' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-white/[0.08] bg-[#161B22] overflow-hidden">
            {/* Desktop Column Headers */}
            <div
              className={`hidden md:grid items-center gap-3 border-b border-white/[0.08] px-4 py-3 text-xs font-medium text-[#8B949E] ${
                hasTrackAotyRatings
                  ? 'md:grid-cols-[2.25rem_2.25rem_minmax(0,1fr)_4.5rem_4.5rem_11rem_4.5rem]'
                  : 'md:grid-cols-[2.25rem_2.25rem_minmax(0,1fr)_4.5rem_11rem_4.5rem]'
              }`}
            >
              <span>#</span>
              <span className="text-center">Fav</span>
              <span>Faixa</span>
              <span className="text-right">Duração</span>
              {hasTrackAotyRatings && <span className="text-center">AOTY</span>}
              <span>Ajuste Rápido</span>
              <span className="text-right">Sua Nota</span>
            </div>

            <ul className="divide-y divide-white/[0.06]">
              {album.tracks.map((track) => {
                const isPlayingThis =
                  activePreview?.trackId === track.id && activePreview.isPlaying;
                const visuals = getScoreVisuals(track.score);

                return (
                  <li key={track.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Mobile Layout (< md): Zero Horizontal Overflow */}
                    <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-[#8B949E]">
                          {String(track.trackNumber).padStart(2, '0')}
                        </span>

                        <button
                          type="button"
                          onClick={() => onToggleTrackFavorite(album.id, track.id)}
                          aria-label={
                            track.isFavorite
                              ? `Remover ${track.title} dos destaques`
                              : `Marcar ${track.title} como destaque`
                          }
                          aria-pressed={track.isFavorite}
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
                            track.isFavorite
                              ? 'text-[#F59E0B] bg-[#F59E0B]/10'
                              : 'text-[#64748B] hover:text-[#CBD5E1]'
                          }`}
                        >
                          <Star
                            className="h-4 w-4"
                            fill={track.isFavorite ? 'currentColor' : 'none'}
                            aria-hidden="true"
                          />
                        </button>

                        {track.previewUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              onPlayPreview({
                                id: track.id,
                                title: track.title,
                                previewUrl: track.previewUrl as string,
                                artist: album.artist,
                                albumTitle: album.title,
                              })
                            }
                            aria-label={
                              isPlayingThis
                                ? `Pausar prévia de ${track.title}`
                                : `Ouvir prévia de ${track.title}`
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

                        <span className="min-w-0 flex-1 text-sm font-medium text-white leading-snug break-words">
                          {track.title}
                        </span>

                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="—"
                          aria-label={`Nota numérica de ${track.title}`}
                          value={track.score ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              onUpdateTrackScore(album.id, track.id, null);
                            } else {
                              onUpdateTrackScore(album.id, track.id, clampScore(Number(raw)));
                            }
                          }}
                          className={`w-14 shrink-0 rounded-md border px-1.5 py-1 text-center font-mono text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#3B82F6] ${visuals.bgClass} ${visuals.textClass} ${visuals.borderClass}`}
                        />
                      </div>

                      <div className="flex items-center gap-3 pl-8">
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#8B949E]">
                          {formatDuration(track.durationMs)}
                        </span>

                        {hasTrackAotyRatings && typeof track.aotyRating === 'number' && (
                          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#60A5FA]">
                            AOTY {track.aotyRating}
                          </span>
                        )}

                        {(track.aotySongUrl || typeof track.aotyRating === 'number') && (
                          <button
                            type="button"
                            onClick={() => void handleToggleTrackCommunity(track)}
                            aria-expanded={expandedTrackId === track.id}
                            aria-label={`Reviews da comunidade para ${track.title}`}
                            className={`inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium transition-colors shrink-0 ${
                              expandedTrackId === track.id
                                ? 'bg-[#3B82F6]/20 text-[#60A5FA]'
                                : 'text-[#8B949E] hover:text-white'
                            }`}
                          >
                            <MessageSquareText className="h-3 w-3" aria-hidden="true" />
                            <span>AOTY</span>
                          </button>
                        )}

                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={track.score ?? 75}
                          aria-label={`Deslizante de nota para ${track.title}`}
                          onChange={(e) =>
                            onUpdateTrackScore(album.id, track.id, Number(e.target.value))
                          }
                          className="flex-1 min-w-0 accent-[#3B82F6] cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Desktop Grid Row (md+) */}
                    <div
                      className={`hidden md:grid items-center gap-3 px-4 py-3 ${
                        hasTrackAotyRatings
                          ? 'md:grid-cols-[2.25rem_2.25rem_minmax(0,1fr)_4.5rem_4.5rem_11rem_4.5rem]'
                          : 'md:grid-cols-[2.25rem_2.25rem_minmax(0,1fr)_4.5rem_11rem_4.5rem]'
                      }`}
                    >
                      <span className="font-mono text-xs tabular-nums text-[#8B949E]">
                        {String(track.trackNumber).padStart(2, '0')}
                      </span>

                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => onToggleTrackFavorite(album.id, track.id)}
                          aria-label={
                            track.isFavorite
                              ? `Remover ${track.title} dos destaques`
                              : `Marcar ${track.title} como destaque`
                          }
                          aria-pressed={track.isFavorite}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                            track.isFavorite
                              ? 'text-[#F59E0B] bg-[#F59E0B]/10'
                              : 'text-[#64748B] hover:text-[#CBD5E1]'
                          }`}
                        >
                          <Star
                            className="h-4 w-4"
                            fill={track.isFavorite ? 'currentColor' : 'none'}
                            aria-hidden="true"
                          />
                        </button>
                      </div>

                      <div className="flex items-center gap-2.5 min-w-0">
                        {track.previewUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              onPlayPreview({
                                id: track.id,
                                title: track.title,
                                previewUrl: track.previewUrl as string,
                                artist: album.artist,
                                albumTitle: album.title,
                              })
                            }
                            aria-label={
                              isPlayingThis
                                ? `Pausar prévia de ${track.title}`
                                : `Ouvir prévia de ${track.title}`
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
                        <span className="text-sm font-medium text-white truncate">
                          {track.title}
                        </span>
                        {(track.aotySongUrl || typeof track.aotyRating === 'number') && (
                          <button
                            type="button"
                            onClick={() => void handleToggleTrackCommunity(track)}
                            aria-expanded={expandedTrackId === track.id}
                            title="Ver notas e comentários da comunidade no AOTY"
                            aria-label={`Reviews da comunidade para ${track.title}`}
                            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
                              expandedTrackId === track.id
                                ? 'bg-[#3B82F6]/20 text-[#60A5FA]'
                                : 'text-[#64748B] hover:bg-white/[0.06] hover:text-white'
                            }`}
                          >
                            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      <span className="text-right font-mono text-xs tabular-nums text-[#8B949E]">
                        {formatDuration(track.durationMs)}
                      </span>

                      {hasTrackAotyRatings && (
                        <div className="flex justify-center">
                          <ScoreBox score={track.aotyRating ?? null} size="sm" />
                        </div>
                      )}

                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={track.score ?? 75}
                        aria-label={`Deslizante de nota para ${track.title}`}
                        onChange={(e) =>
                          onUpdateTrackScore(album.id, track.id, Number(e.target.value))
                        }
                        className="w-full accent-[#3B82F6] cursor-pointer"
                      />

                      <div className="flex justify-end">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="—"
                          aria-label={`Nota numérica de ${track.title}`}
                          value={track.score ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              onUpdateTrackScore(album.id, track.id, null);
                            } else {
                              onUpdateTrackScore(album.id, track.id, clampScore(Number(raw)));
                            }
                          }}
                          className={`w-16 rounded-md border px-2 py-1 text-center font-mono text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#3B82F6] ${visuals.bgClass} ${visuals.textClass} ${visuals.borderClass}`}
                        />
                      </div>
                    </div>

                    {/* Expandable Track Community Drawer */}
                    {expandedTrackId === track.id && (
                      <div className="border-t border-white/[0.06] bg-[#0E1116]/85 px-4 py-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="font-semibold text-white">
                              Comunidade AOTY · {track.title}
                            </span>
                            {typeof track.aotyRating === 'number' && (
                              <span className="font-mono tabular-nums text-[#CBD5E1]">
                                Média {track.aotyRating}
                                {track.aotyRatingCount ? ` (${track.aotyRatingCount} notas)` : ''}
                              </span>
                            )}
                          </div>

                          {(track.aotySongUrl || album.aotyData?.aotyUrl) && (
                            <a
                              href={track.aotySongUrl || album.aotyData?.aotyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#60A5FA] hover:text-white"
                            >
                              <span>Abrir faixa no AOTY</span>
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                          )}
                        </div>

                        {trackCommunityMap[track.id]?.loading ? (
                          <div className="flex items-center gap-2 text-xs text-[#8B949E] py-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            <span>Buscando comentários e notas da faixa...</span>
                          </div>
                        ) : trackCommunityMap[track.id]?.data?.available &&
                          trackCommunityMap[track.id]?.data?.song ? (
                          <div className="space-y-3">
                            {(trackCommunityMap[track.id].data?.song?.comments.length ?? 0) > 0 ? (
                              <div className="space-y-2">
                                {trackCommunityMap[track.id].data?.song?.comments.map((c, idx) => (
                                  <div
                                    key={`${c.username}_${idx}`}
                                    className="rounded border border-white/[0.06] bg-[#161B22] p-2.5 space-y-1"
                                  >
                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="font-mono font-semibold text-[#60A5FA]">
                                        @{c.username}
                                      </span>
                                      <span className="font-mono tabular-nums text-[#8B949E]">
                                        {c.date ? `${c.date} · ` : ''}
                                        {c.likes} curtidas
                                      </span>
                                    </div>
                                    <p className="text-xs text-[#CBD5E1] leading-relaxed">
                                      {c.text}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {(trackCommunityMap[track.id].data?.song?.topRatings.length ?? 0) >
                              0 && (
                              <div className="flex flex-wrap gap-2">
                                {trackCommunityMap[track.id].data?.song?.topRatings.map((r, idx) => (
                                  <div
                                    key={`${r.username}_${idx}`}
                                    className="inline-flex items-center gap-2 rounded border border-white/[0.08] bg-[#161B22] px-2.5 py-1 text-xs"
                                  >
                                    <span className="font-mono text-[#CBD5E1]">@{r.username}</span>
                                    <ScoreBox score={r.rating} size="sm" />
                                  </div>
                                ))}
                              </div>
                            )}

                            {(trackCommunityMap[track.id].data?.song?.comments.length ?? 0) === 0 &&
                              (trackCommunityMap[track.id].data?.song?.topRatings.length ?? 0) ===
                                0 && (
                                <p className="text-xs text-[#8B949E]">
                                  Sem comentários recentes registrados para esta faixa.
                                </p>
                              )}
                          </div>
                        ) : (
                          <p className="text-xs text-[#8B949E] leading-relaxed">
                            {trackCommunityMap[track.id]?.data?.message ||
                              'Os comentários detalhados por faixa ficam disponíveis diretamente na página da música no AOTY.'}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Inline Add Track Row */}
          <form
            onSubmit={handleAddTrackSubmit}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#161B22] p-3.5"
          >
            <input
              type="text"
              value={newTrackTitle}
              onChange={(e) => setNewTrackTitle(e.target.value)}
              placeholder="Adicionar faixa bônus ou faltante..."
              aria-label="Título da nova faixa"
              className="flex-1 rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
            />
            <div className="flex items-center gap-2.5">
              <input
                type="text"
                value={newTrackDuration}
                onChange={(e) => setNewTrackDuration(e.target.value)}
                aria-label="Duração da nova faixa"
                placeholder="3:30"
                className="w-24 rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-2 text-center font-mono text-xs tabular-nums text-white focus:border-[#3B82F6] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newTrackTitle.trim()}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-md bg-[#1C222B] border border-white/[0.12] px-4 py-2 text-xs font-semibold text-white hover:bg-[#262E3A] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Adicionar Faixa</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: Drag-and-Drop Track Ranker */}
      {activeTab === 'ranking' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-[#161B22] px-4 py-3.5">
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Ordem Pessoal das Faixas
              </h2>
              <p className="text-xs text-[#8B949E]">
                Arraste qualquer faixa pelo ícone à esquerda ou use as setas para definir seu
                ranking da melhor (#1) à última.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSortRankByScore}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/[0.12] bg-[#0E1116] px-3.5 py-2 text-xs font-semibold text-white hover:border-[#3B82F6] transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#3B82F6]" aria-hidden="true" />
              <span>Ordenar pela Nota</span>
            </button>
          </div>

          <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.08] bg-[#161B22]">
            {rankedTracks.map((track, index) => {
              const rankPos = index + 1;
              const delta = track.trackNumber - rankPos;
              const isDragging = draggedTrackId === track.id;
              const isDropTarget = dragOverTrackId === track.id && draggedTrackId !== track.id;

              return (
                <li
                  key={track.id}
                  draggable
                  onDragStart={() => setDraggedTrackId(track.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverTrackId !== track.id) setDragOverTrackId(track.id);
                  }}
                  onDrop={() => handleTrackDrop(track.id)}
                  onDragEnd={() => {
                    setDraggedTrackId(null);
                    setDragOverTrackId(null);
                  }}
                  className={`flex items-center gap-2.5 sm:gap-4 px-3.5 sm:px-4 py-3 transition-colors ${
                    isDragging ? 'opacity-40 bg-[#0E1116]' : 'hover:bg-white/[0.03]'
                  } ${isDropTarget ? 'ring-2 ring-inset ring-[#3B82F6]' : ''}`}
                >
                  <span
                    className="hidden sm:inline-flex cursor-grab active:cursor-grabbing text-[#64748B] hover:text-white"
                    title="Arrastar faixa"
                  >
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                  </span>

                  <span
                    className={`w-7 sm:w-8 font-mono text-sm sm:text-base font-bold tabular-nums shrink-0 ${
                      rankPos === 1
                        ? 'text-[#F59E0B]'
                        : rankPos <= 3
                          ? 'text-white'
                          : 'text-[#8B949E]'
                    }`}
                  >
                    #{rankPos}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-white truncate">
                        {track.title}
                      </span>
                      {track.isFavorite && (
                        <Star
                          className="h-3.5 w-3.5 text-[#F59E0B] shrink-0"
                          fill="currentColor"
                          aria-label="Faixa favorita"
                        />
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs text-[#8B949E] font-mono tabular-nums">
                      Faixa {String(track.trackNumber).padStart(2, '0')} ·{' '}
                      {formatDuration(track.durationMs)}
                      {delta !== 0 && (
                        <span
                          className={`ml-2 ${
                            delta > 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
                          }`}
                        >
                          {delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
                        </span>
                      )}
                    </p>
                  </div>

                  <ScoreBox score={track.score} size="sm" />

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveRankStep(track.id, -1)}
                      aria-label={`Subir ${track.title} no ranking`}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-[#0E1116] text-[#CBD5E1] hover:text-white disabled:opacity-25 transition-colors"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={index === rankedTracks.length - 1}
                      onClick={() => handleMoveRankStep(track.id, 1)}
                      aria-label={`Descer ${track.title} no ranking`}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-[#0E1116] text-[#CBD5E1] hover:text-white disabled:opacity-25 transition-colors"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* TAB 3: Editorial Review, Mood Tags, AOTY Integration & Metadata */}
      {activeTab === 'review' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6">
            <div>
              <label
                htmlFor="album-review-textarea"
                className="block font-display text-base font-bold text-white mb-1"
              >
                Resenha Crítica
              </label>
              <p className="text-xs text-[#8B949E] mb-3">
                Registre suas impressões de produção, lirismo, coesão e evolução do álbum.
              </p>
              <textarea
                id="album-review-textarea"
                rows={8}
                value={album.reviewText}
                onChange={(e) =>
                  onUpdateAlbum(album.id, (prev) => ({ ...prev, reviewText: e.target.value }))
                }
                placeholder="Escreva sua análise editorial sobre o álbum..."
                className="w-full max-w-prose rounded-md border border-white/[0.12] bg-[#0E1116] p-4 text-sm sm:text-base leading-relaxed text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            {/* Mood Tags Selector */}
            <div className="border-t border-white/[0.08] pt-5 space-y-3">
              <div>
                <h3 className="font-display text-sm font-bold text-white">Tags de Humor & Clima</h3>
                <p className="text-xs text-[#8B949E]">
                  Selecione até 12 descritores atmosféricos para catalogar o som do disco.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...PRESET_MOOD_TAGS, ...album.moodTags])).map((tag) => {
                  const selected = album.moodTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleMood(tag)}
                      aria-pressed={selected}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
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

              <form onSubmit={handleAddCustomMood} className="flex items-center gap-2 pt-1 max-w-xs">
                <input
                  type="text"
                  value={customMoodInput}
                  onChange={(e) => setCustomMoodInput(e.target.value)}
                  placeholder="Nova tag (ex.: Psicodélico)"
                  aria-label="Adicionar tag de humor personalizada"
                  className="flex-1 rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-1.5 text-xs text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!customMoodInput.trim()}
                  className="rounded-md border border-white/[0.12] bg-[#1C222B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#262E3A] disabled:opacity-40"
                >
                  Adicionar
                </button>
              </form>

              {album.aotyData && album.aotyData.tags.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06]">
                  <p className="text-xs text-[#8B949E]">
                    Tags do AOTY: {album.aotyData.tags.join(' · ')}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAlbum(album.id, (prev) => ({
                        ...prev,
                        moodTags: Array.from(
                          new Set([...prev.moodTags, ...(prev.aotyData?.tags ?? [])])
                        ).slice(0, 12),
                      }))
                    }
                    className="text-xs font-semibold text-[#60A5FA] hover:text-white whitespace-nowrap"
                  >
                    Importar Tags do AOTY
                  </button>
                </div>
              )}
            </div>

            {album.aotyData && album.aotyData.criticReviews.length > 0 && (
              <div className="border-t border-white/[0.08] pt-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-white">
                    Críticas da Imprensa (AOTY)
                  </h3>
                  {album.aotyData.aotyUrl && (
                    <a
                      href={album.aotyData.aotyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#60A5FA] hover:text-white"
                    >
                      <span>Ver no AOTY</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </div>

                <div className="divide-y divide-white/[0.06]">
                  {album.aotyData.criticReviews.map((rev, idx) => (
                    <div key={`${rev.publication}_${idx}`} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs">
                          <span className="font-semibold text-white">{rev.publication}</span>
                          {rev.author && (
                            <span className="text-[#8B949E]"> · {rev.author}</span>
                          )}
                        </div>
                        <ScoreBox score={rev.score} size="sm" />
                      </div>
                      {rev.text && (
                        <p className="text-xs leading-relaxed text-[#CBD5E1]">{rev.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Community User Reviews (AOTY) */}
            <div className="border-t border-white/[0.08] pt-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                  <h3 className="font-display text-sm font-bold text-white">
                    Reviews da Comunidade (AOTY)
                  </h3>
                </div>

                {album.aotyData && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(
                      [
                        { id: 'popular', label: 'Populares' },
                        { id: 'recent', label: 'Recentes' },
                        { id: 'worst', label: 'Menores' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setUserReviewsSort(opt.id);
                          void fetchAlbumUserReviews(album.aotyData!.aotyId, opt.id);
                        }}
                        className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          userReviewsSort === opt.id
                            ? 'bg-[#3B82F6] text-white'
                            : 'bg-[#0E1116] text-[#8B949E] hover:text-white border border-white/[0.08]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!album.aotyData ? (
                <p className="text-xs text-[#8B949E]">
                  Sincronize este álbum com o AOTY no painel ao lado para acessar notas e reviews da
                  comunidade.
                </p>
              ) : loadingUserReviews ? (
                <div className="flex items-center gap-2 py-3 text-xs text-[#8B949E]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Carregando reviews da comunidade...</span>
                </div>
              ) : userReviews.length > 0 ? (
                <div className="divide-y divide-white/[0.06]">
                  {userReviews.map((rev, idx) => (
                    <div
                      key={`${rev.username}_${rev.reviewId ?? idx}`}
                      className="py-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {rev.avatar ? (
                            <img
                              src={rev.avatar}
                              alt={rev.username}
                              referrerPolicy="no-referrer"
                              className="h-7 w-7 rounded-full object-cover border border-white/[0.1] shrink-0"
                            />
                          ) : (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-[#0E1116] font-mono text-[10px] font-bold text-[#60A5FA]">
                              {rev.username.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <a
                              href={`https://www.albumoftheyear.org/user/${encodeURIComponent(
                                rev.username
                              )}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs font-semibold text-white hover:text-[#60A5FA] truncate block"
                            >
                              @{rev.username}
                            </a>
                            {rev.date && (
                              <span className="text-[11px] text-[#8B949E]">{rev.date}</span>
                            )}
                          </div>
                        </div>

                        <ScoreBox score={rev.rating} size="sm" />
                      </div>

                      <p className="text-xs sm:text-sm leading-relaxed text-[#CBD5E1] whitespace-pre-line">
                        {rev.text}
                      </p>

                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#8B949E]">
                        <span className="inline-flex items-center gap-1.5">
                          <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                          <span>{rev.likes}</span>
                          <span>· {rev.comments} comentários</span>
                        </span>
                        {rev.url && (
                          <a
                            href={rev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#60A5FA] hover:text-white font-sans"
                          >
                            <span>Ler no AOTY</span>
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-white/[0.08] bg-[#0E1116] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-[#8B949E] leading-relaxed">
                    {userReviewsStatus.message ||
                      'Não foi possível exibir as reviews automaticamente neste momento.'}
                  </p>
                  <a
                    href={`${album.aotyData.aotyUrl.replace(/\.php$/i, '').replace(/\/$/, '')}/user-reviews/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#3B82F6]/50 bg-[#3B82F6]/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3B82F6]/25 transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Ver Reviews no AOTY</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>

            {/* AOTY Lists Containing This Album */}
            {(() => {
              const baseAotyUrl = album.aotyData
                ? album.aotyData.aotyUrl.replace(/\.php$/i, '').replace(/\/$/, '')
                : '';
              const listsKey = album.aotyData ? `${album.aotyData.aotyId}:${aotyListType}` : '';
              const listsPayload = listsKey ? aotyListsCache[listsKey] : undefined;
              const listsItems =
                aotyListType === 'critic'
                  ? listsPayload?.criticLists ?? []
                  : listsPayload?.userLists ?? [];

              return (
                <div className="border-t border-white/[0.08] pt-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <ListOrdered className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                        <h3 className="font-display text-sm font-bold text-white">
                          Listas com este Álbum (AOTY)
                        </h3>
                      </div>
                      {typeof album.aotyData?.listsCount === 'number' &&
                        album.aotyData.listsCount > 0 && (
                          <p className="text-[11px] font-mono tabular-nums text-[#8B949E]">
                            Presente em{' '}
                            <strong className="text-[#CBD5E1]">
                              {album.aotyData.listsCount.toLocaleString('pt-BR')}
                            </strong>{' '}
                            listas de usuários no AOTY
                          </p>
                        )}
                    </div>

                    {album.aotyData && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(
                          [
                            { id: 'critic', label: 'Listas da Crítica' },
                            { id: 'user', label: 'Listas de Usuários' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setAotyListType(opt.id)}
                            className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                              aotyListType === opt.id
                                ? 'bg-[#3B82F6] text-white'
                                : 'bg-[#0E1116] text-[#8B949E] hover:text-white border border-white/[0.08]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!album.aotyData ? (
                    <p className="text-xs text-[#8B949E]">
                      Sincronize este álbum com o AOTY no painel ao lado para ver de quais listas da
                      crítica e da comunidade ele faz parte.
                    </p>
                  ) : loadingAotyLists && !listsPayload ? (
                    <div className="flex items-center gap-2 py-3 text-xs text-[#8B949E]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>Consultando listas no AOTY...</span>
                    </div>
                  ) : listsPayload?.available && listsItems.length > 0 ? (
                    <div className="divide-y divide-white/[0.06]">
                      {aotyListType === 'critic'
                        ? listsPayload.criticLists.map((item, idx) => (
                            <a
                              key={`${item.title}_${idx}`}
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-3 py-3 group hover:bg-white/[0.02] transition-colors"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <p className="text-xs sm:text-sm font-semibold text-white group-hover:text-[#60A5FA] truncate">
                                  {item.title}
                                </p>
                                <p className="text-[11px] text-[#8B949E] truncate">
                                  {item.publication}
                                </p>
                              </div>
                              <div className="flex items-center gap-2.5 shrink-0">
                                {typeof item.rank === 'number' && (
                                  <span className="font-mono text-xs font-bold tabular-nums text-[#FBBF24]">
                                    #{item.rank}
                                  </span>
                                )}
                                <ExternalLink
                                  className="h-3.5 w-3.5 text-[#64748B] group-hover:text-white"
                                  aria-hidden="true"
                                />
                              </div>
                            </a>
                          ))
                        : listsPayload.userLists.map((item, idx) => (
                            <a
                              key={`${item.title}_${idx}`}
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block py-3 space-y-1 group hover:bg-white/[0.02] transition-colors"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs sm:text-sm font-semibold text-white group-hover:text-[#60A5FA] truncate">
                                  {item.title}
                                </p>
                                <ExternalLink
                                  className="h-3.5 w-3.5 text-[#64748B] group-hover:text-white shrink-0"
                                  aria-hidden="true"
                                />
                              </div>
                              <p className="text-[11px] font-mono tabular-nums text-[#8B949E]">
                                por @{item.username}
                                {typeof item.albumCount === 'number'
                                  ? ` · ${item.albumCount} álbuns`
                                  : ''}
                                {typeof item.likes === 'number' ? ` · ${item.likes} curtidas` : ''}
                              </p>
                              {item.description && (
                                <p className="text-xs text-[#CBD5E1] line-clamp-2">
                                  {item.description}
                                </p>
                              )}
                            </a>
                          ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-white/[0.08] bg-[#0E1116] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-xs text-[#8B949E] leading-relaxed">
                        {listsPayload?.message ||
                          (listsPayload?.available
                            ? 'Nenhuma lista retornada para este filtro.'
                            : 'As listas completas ficam disponíveis diretamente na página deste álbum no AOTY.')}
                      </p>
                      <a
                        href={`${baseAotyUrl}/${
                          aotyListType === 'user' ? 'user-lists' : 'critic-lists'
                        }/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#3B82F6]/50 bg-[#3B82F6]/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3B82F6]/25 transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>
                          {aotyListType === 'user'
                            ? 'Listas de Usuários no AOTY'
                            : 'Listas da Crítica no AOTY'}
                        </span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Right Column: AOTY Integration + Edit Metadata */}
          <div className="lg:col-span-5 space-y-6">
            {/* Dedicated AOTY Integration Card */}
            <div className="space-y-4 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-white">
                    Integração Album of the Year
                  </h3>
                  <p className="text-xs text-[#8B949E] mt-0.5">
                    {album.aotyData
                      ? `Vinculado ao ID ${album.aotyData.aotyId} · Atualizado em ${new Date(
                          album.aotyData.syncedAt
                        ).toLocaleDateString('pt-BR')}`
                      : 'Traga notas da crítica, média dos usuários e avaliações por faixa.'}
                  </p>
                </div>
                {album.aotyData?.aotyUrl && (
                  <a
                    href={album.aotyData.aotyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Abrir página do álbum no AOTY"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/[0.1] bg-[#0E1116] text-[#60A5FA] hover:border-[#3B82F6] hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>

              <button
                type="button"
                disabled={syncingAoty}
                onClick={() => void handleSyncAoty()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-white/[0.12] bg-[#0E1116] px-4 py-2 text-xs font-semibold text-white hover:border-[#3B82F6] disabled:opacity-50 transition-colors"
              >
                {syncingAoty ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{album.aotyData ? 'Atualizar Dados do AOTY' : 'Sincronizar Automaticamente'}</span>
              </button>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (aotySlugQuery.trim()) void handleSyncAoty(aotySlugQuery);
                }}
                className="space-y-2 border-t border-white/[0.08] pt-3"
              >
                <label
                  htmlFor="aoty-panel-slug-input"
                  className="block text-xs font-medium text-[#CBD5E1]"
                >
                  Vincular por Link ou ID do AOTY
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="aoty-panel-slug-input"
                    type="text"
                    value={aotySlugQuery}
                    onChange={(e) => setAotySlugQuery(e.target.value)}
                    placeholder="Ex.: 362 ou albumoftheyear.org/album/..."
                    className="flex-1 min-w-0 rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-xs text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={syncingAoty || !aotySlugQuery.trim()}
                    className="rounded-md bg-[#3B82F6] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] disabled:opacity-40 whitespace-nowrap"
                  >
                    Vincular
                  </button>
                </div>
              </form>

              {aotySyncMessage && (
                <p className="text-xs text-[#CBD5E1]">{aotySyncMessage}</p>
              )}
            </div>

            {/* Edit Metadata Panel */}
            <form
              onSubmit={handleSaveMetadata}
              className="space-y-4 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6"
            >
              <h3 className="font-display text-base font-bold text-white">
                Editar Ficha Técnica
              </h3>

              <div>
                <label
                  htmlFor="edit-album-title"
                  className="block text-xs font-medium text-[#CBD5E1] mb-1"
                >
                  Título
                </label>
                <input
                  id="edit-album-title"
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-album-artist"
                  className="block text-xs font-medium text-[#CBD5E1] mb-1"
                >
                  Artista
                </label>
                <input
                  id="edit-album-artist"
                  type="text"
                  required
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-album-year"
                    className="block text-xs font-medium text-[#CBD5E1] mb-1"
                  >
                    Ano
                  </label>
                  <input
                    id="edit-album-year"
                    type="number"
                    min={1900}
                    max={2100}
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-sm tabular-nums text-white focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-album-genre"
                    className="block text-xs font-medium text-[#CBD5E1] mb-1"
                  >
                    Gênero
                  </label>
                  <input
                    id="edit-album-genre"
                    type="text"
                    value={editGenre}
                    onChange={(e) => setEditGenre(e.target.value)}
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-album-cover"
                  className="block text-xs font-medium text-[#CBD5E1] mb-1"
                >
                  URL da Capa
                </label>
                <input
                  id="edit-album-cover"
                  type="text"
                  value={editCoverUrl}
                  onChange={(e) => setEditCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-[#4ADE80]">
                  {metaSavedFeedback ? 'Alterações salvas!' : ''}
                </span>
                <button
                  type="submit"
                  className="rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors"
                >
                  Salvar Ficha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
