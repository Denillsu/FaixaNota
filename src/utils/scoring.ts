import type { Album, CustomList, RatingMode, Track, UserProfile } from '../types/music';

export interface ScoreVisuals {
  bgClass: string;
  textClass: string;
  borderClass: string;
  barClass: string;
  label: string;
}

export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function calculateTracksAverage(
  tracks: Track[],
  mode: 'auto-mean' | 'weighted-duration' = 'auto-mean'
): number | null {
  const rated = tracks.filter((t): t is Track & { score: number } => typeof t.score === 'number');
  if (rated.length === 0) return null;

  if (mode === 'weighted-duration') {
    const totalWeight = rated.reduce((sum, t) => sum + Math.max(t.durationMs, 1000), 0);
    if (totalWeight === 0) return null;
    const weightedSum = rated.reduce(
      (sum, t) => sum + t.score * Math.max(t.durationMs, 1000),
      0
    );
    return Math.round(weightedSum / totalWeight);
  }

  const sum = rated.reduce((acc, t) => acc + t.score, 0);
  return Math.round(sum / rated.length);
}

export function calculateAlbumScore(
  tracks: Track[],
  ratingMode: RatingMode,
  manualScore: number | null
): number | null {
  if (ratingMode === 'manual') {
    return typeof manualScore === 'number' ? clampScore(manualScore) : null;
  }
  return calculateTracksAverage(tracks, ratingMode);
}

export function getAlbumEffectiveScore(album: Album): number | null {
  return calculateAlbumScore(album.tracks, album.ratingMode, album.manualScore);
}

export function getScoreVisuals(score: number | null): ScoreVisuals {
  if (score === null) {
    return {
      bgClass: 'bg-[#1C222B]',
      textClass: 'text-[#8B949E]',
      borderClass: 'border-[#2D3542]',
      barClass: 'bg-[#2D3542]',
      label: 'Sem Nota',
    };
  }
  if (score >= 80) {
    return {
      bgClass: 'bg-[#14532D]/70',
      textClass: 'text-[#4ADE80]',
      borderClass: 'border-[#16A34A]/60',
      barClass: 'bg-[#22C55E]',
      label: 'Aclamado',
    };
  }
  if (score >= 70) {
    return {
      bgClass: 'bg-[#365314]/60',
      textClass: 'text-[#A3E635]',
      borderClass: 'border-[#65A30D]/50',
      barClass: 'bg-[#84CC16]',
      label: 'Muito Bom',
    };
  }
  if (score >= 50) {
    return {
      bgClass: 'bg-[#422006]/70',
      textClass: 'text-[#FACC15]',
      borderClass: 'border-[#CA8A04]/50',
      barClass: 'bg-[#EAB308]',
      label: 'Misto',
    };
  }
  return {
    bgClass: 'bg-[#450A0A]/70',
    textClass: 'text-[#F87171]',
    borderClass: 'border-[#DC2626]/50',
    barClass: 'bg-[#EF4444]',
    label: 'Fraco',
  };
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function parseDurationInput(input: string): number {
  const trimmed = input.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return 180000;
  const minutes = Number.parseInt(match[1], 10);
  const seconds = Number.parseInt(match[2], 10);
  if (seconds >= 60) return 180000;
  return (minutes * 60 + seconds) * 1000;
}

export function sanitizeImageUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('/src/assets/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export function generateId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface BackupPayload {
  version: number;
  exportedAt: string;
  albums: Album[];
  lists: CustomList[];
  profile?: UserProfile;
}

export function validateBackupPayload(raw: unknown): BackupPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.albums)) return null;

  const albums: Album[] = [];
  for (const item of obj.albums) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (typeof a.id !== 'string' || typeof a.title !== 'string' || typeof a.artist !== 'string') {
      continue;
    }

    const rawTracks = Array.isArray(a.tracks) ? a.tracks : [];
    const tracks: Track[] = rawTracks
      .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
      .map((t, idx) => ({
        id: typeof t.id === 'string' ? t.id : generateId('trk'),
        trackNumber:
          typeof t.trackNumber === 'number' && Number.isFinite(t.trackNumber)
            ? Math.max(1, Math.round(t.trackNumber))
            : idx + 1,
        title: typeof t.title === 'string' && t.title.trim() ? t.title.trim() : `Faixa ${idx + 1}`,
        durationMs:
          typeof t.durationMs === 'number' && Number.isFinite(t.durationMs)
            ? Math.max(1000, Math.round(t.durationMs))
            : 180000,
        score:
          typeof t.score === 'number' && Number.isFinite(t.score) ? clampScore(t.score) : null,
        rankOrder:
          typeof t.rankOrder === 'number' && Number.isFinite(t.rankOrder)
            ? Math.max(1, Math.round(t.rankOrder))
            : idx + 1,
        isFavorite: Boolean(t.isFavorite),
        previewUrl:
          typeof t.previewUrl === 'string' && t.previewUrl.startsWith('https://')
            ? t.previewUrl
            : undefined,
        note: typeof t.note === 'string' ? t.note.slice(0, 300) : undefined,
        aotyRating:
          typeof t.aotyRating === 'number' && Number.isFinite(t.aotyRating)
            ? clampScore(t.aotyRating)
            : undefined,
        aotyRatingCount:
          typeof t.aotyRatingCount === 'number' && Number.isFinite(t.aotyRatingCount)
            ? Math.max(0, Math.round(t.aotyRatingCount))
            : undefined,
        aotySongUrl:
          typeof t.aotySongUrl === 'string' && t.aotySongUrl.startsWith('https://')
            ? t.aotySongUrl
            : undefined,
      }));

    const ratingMode: RatingMode =
      a.ratingMode === 'weighted-duration' || a.ratingMode === 'manual'
        ? a.ratingMode
        : 'auto-mean';

    const hasRatedTracks = tracks.some((t) => typeof t.score === 'number');
    const defaultListened =
      hasRatedTracks ||
      (typeof a.reviewText === 'string' && a.reviewText.trim().length > 0) ||
      typeof a.manualScore === 'number';

    const rawAoty =
      a.aotyData && typeof a.aotyData === 'object'
        ? (a.aotyData as Record<string, unknown>)
        : null;

    albums.push({
      id: a.id,
      externalCatalogId:
        typeof a.externalCatalogId === 'string' && a.externalCatalogId.length <= 120
          ? a.externalCatalogId
          : undefined,
      itunesCollectionId:
        typeof a.itunesCollectionId === 'number' ? a.itunesCollectionId : undefined,
      title: a.title.trim(),
      artist: a.artist.trim(),
      releaseYear:
        typeof a.releaseYear === 'number' && Number.isFinite(a.releaseYear)
          ? Math.min(2100, Math.max(1900, Math.round(a.releaseYear)))
          : new Date().getFullYear(),
      genre: typeof a.genre === 'string' && a.genre.trim() ? a.genre.trim() : 'Música',
      coverUrl: typeof a.coverUrl === 'string' ? sanitizeImageUrl(a.coverUrl) : '',
      ratingMode,
      manualScore:
        typeof a.manualScore === 'number' && Number.isFinite(a.manualScore)
          ? clampScore(a.manualScore)
          : null,
      mustHear: Boolean(a.mustHear),
      isListened: typeof a.isListened === 'boolean' ? a.isListened : defaultListened,
      isLiked: Boolean(a.isLiked),
      isFavorite: Boolean(a.isFavorite),
      inWatchlist: Boolean(a.inWatchlist),
      reviewText: typeof a.reviewText === 'string' ? a.reviewText : '',
      moodTags: Array.isArray(a.moodTags)
        ? a.moodTags.filter((tag): tag is string => typeof tag === 'string').slice(0, 12)
        : [],
      tracks,
      aotyData:
        rawAoty && typeof rawAoty.aotyId === 'string'
          ? {
              aotyId: rawAoty.aotyId,
              aotyUrl:
                typeof rawAoty.aotyUrl === 'string' ? sanitizeImageUrl(rawAoty.aotyUrl) : '',
              criticScore:
                typeof rawAoty.criticScore === 'number' ? clampScore(rawAoty.criticScore) : null,
              criticCount:
                typeof rawAoty.criticCount === 'number' ? rawAoty.criticCount : null,
              userScore:
                typeof rawAoty.userScore === 'number' ? clampScore(rawAoty.userScore) : null,
              userCount: typeof rawAoty.userCount === 'string' ? rawAoty.userCount : null,
              listsCount:
                typeof rawAoty.listsCount === 'number' && Number.isFinite(rawAoty.listsCount)
                  ? Math.max(0, Math.round(rawAoty.listsCount))
                  : null,
              label: typeof rawAoty.label === 'string' ? rawAoty.label : undefined,
              format: typeof rawAoty.format === 'string' ? rawAoty.format : undefined,
              genres: Array.isArray(rawAoty.genres)
                ? rawAoty.genres.filter((g): g is string => typeof g === 'string')
                : [],
              tags: Array.isArray(rawAoty.tags)
                ? rawAoty.tags.filter((g): g is string => typeof g === 'string')
                : [],
              criticReviews: Array.isArray(rawAoty.criticReviews)
                ? rawAoty.criticReviews
                    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
                    .map((r) => ({
                      publication:
                        typeof r.publication === 'string' ? r.publication : 'Publicação',
                      author: typeof r.author === 'string' ? r.author : '',
                      score: typeof r.score === 'number' ? clampScore(r.score) : null,
                      text: typeof r.text === 'string' ? r.text : '',
                      date: typeof r.date === 'string' ? r.date : undefined,
                    }))
                : [],
              trackRatings: [],
              syncedAt:
                typeof rawAoty.syncedAt === 'string'
                  ? rawAoty.syncedAt
                  : new Date().toISOString(),
            }
          : undefined,
      createdAt: typeof a.createdAt === 'string' ? a.createdAt : new Date().toISOString(),
      updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : new Date().toISOString(),
    });
  }

  const validAlbumIds = new Set(albums.map((a) => a.id));
  const rawLists = Array.isArray(obj.lists) ? obj.lists : [];
  const lists: CustomList[] = rawLists
    .filter((l): l is Record<string, unknown> => Boolean(l && typeof l === 'object'))
    .filter((l) => typeof l.id === 'string' && typeof l.title === 'string')
    .map((l) => ({
      id: l.id as string,
      title: (l.title as string).trim() || 'Lista sem título',
      description: typeof l.description === 'string' ? l.description : '',
      category:
        l.category === 'Ano' || l.category === 'Gênero' ? l.category : 'Geral',
      items: Array.isArray(l.items)
        ? l.items
            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
            .filter((item) => typeof item.albumId === 'string' && validAlbumIds.has(item.albumId))
            .map((item, idx) => ({
              albumId: item.albumId as string,
              position: idx + 1,
              commentary: typeof item.commentary === 'string' ? item.commentary : '',
            }))
        : [],
      updatedAt: typeof l.updatedAt === 'string' ? l.updatedAt : new Date().toISOString(),
    }));

  const rawProfile =
    obj.profile && typeof obj.profile === 'object'
      ? (obj.profile as Record<string, unknown>)
      : null;

  const profile: UserProfile | undefined = rawProfile
    ? {
        displayName:
          typeof rawProfile.displayName === 'string' && rawProfile.displayName.trim()
            ? rawProfile.displayName.trim().slice(0, 60)
            : 'Ouvinte FaixaNota',
        handle:
          typeof rawProfile.handle === 'string' && rawProfile.handle.trim()
            ? rawProfile.handle.trim().slice(0, 40)
            : '@ouvinte',
        bio: typeof rawProfile.bio === 'string' ? rawProfile.bio.slice(0, 280) : '',
        avatarUrl:
          typeof rawProfile.avatarUrl === 'string'
            ? sanitizeImageUrl(rawProfile.avatarUrl) || undefined
            : undefined,
        aotyUsername:
          typeof rawProfile.aotyUsername === 'string' &&
          /^[a-zA-Z0-9._-]{1,60}$/.test(rawProfile.aotyUsername.trim())
            ? rawProfile.aotyUsername.trim()
            : undefined,
      }
    : undefined;

  return {
    version: 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    albums,
    lists,
    profile,
  };
}
