import { useCallback, useEffect, useState } from 'react';
import { SAMPLE_ALBUMS, SAMPLE_LISTS } from '../data/sampleCatalog';
import type {
  Album,
  AlbumStatusField,
  CustomList,
  RatingMode,
  Track,
  UserProfile,
} from '../types/music';
import { clampScore, generateId, validateBackupPayload, type BackupPayload } from '../utils/scoring';

const ALBUMS_STORAGE_KEY = 'faixanota:v1:albums';
const LISTS_STORAGE_KEY = 'faixanota:v1:lists';
const PROFILE_STORAGE_KEY = 'faixanota:v1:profile';

const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Ouvinte FaixaNota',
  handle: '@ouvinte',
  bio: 'Catalogando álbuns, avaliando faixa por faixa e montando rankings pessoais.',
};

function normalizeStoredAlbum(raw: Album): Album {
  const hasRatedTracks = Array.isArray(raw.tracks)
    ? raw.tracks.some((t) => typeof t.score === 'number')
    : false;
  const fallbackListened =
    hasRatedTracks ||
    Boolean(raw.reviewText && raw.reviewText.trim().length > 0) ||
    typeof raw.manualScore === 'number';

  return {
    ...raw,
    isListened: typeof raw.isListened === 'boolean' ? raw.isListened : fallbackListened,
    isLiked: Boolean(raw.isLiked),
    isFavorite: Boolean(raw.isFavorite),
    inWatchlist: Boolean(raw.inWatchlist),
  };
}

function readStoredAlbums(): Album[] {
  try {
    const raw = localStorage.getItem(ALBUMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Album[]).map(normalizeStoredAlbum) : [];
  } catch {
    return [];
  }
}

function readStoredLists(): CustomList[] {
  try {
    const raw = localStorage.getItem(LISTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomList[]) : [];
  } catch {
    return [];
  }
}

function readStoredProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      displayName:
        typeof parsed.displayName === 'string' && parsed.displayName.trim()
          ? parsed.displayName
          : DEFAULT_PROFILE.displayName,
      handle:
        typeof parsed.handle === 'string' && parsed.handle.trim()
          ? parsed.handle
          : DEFAULT_PROFILE.handle,
      bio: typeof parsed.bio === 'string' ? parsed.bio : DEFAULT_PROFILE.bio,
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : undefined,
      aotyUsername:
        typeof parsed.aotyUsername === 'string' && parsed.aotyUsername.trim()
          ? parsed.aotyUsername.trim()
          : undefined,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function useMusicLibrary() {
  const [albums, setAlbums] = useState<Album[]>(() => readStoredAlbums());
  const [lists, setLists] = useState<CustomList[]>(() => readStoredLists());
  const [profile, setProfile] = useState<UserProfile>(() => readStoredProfile());

  useEffect(() => {
    try {
      localStorage.setItem(ALBUMS_STORAGE_KEY, JSON.stringify(albums));
    } catch {
      // Ignore quota errors cleanly
    }
  }, [albums]);

  useEffect(() => {
    try {
      localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(lists));
    } catch {
      // Ignore quota errors cleanly
    }
  }, [lists]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Ignore quota errors cleanly
    }
  }, [profile]);

  const updateProfile = useCallback((next: Partial<UserProfile>) => {
    setProfile((prev) => ({
      ...prev,
      ...next,
    }));
  }, []);

  const addAlbum = useCallback(
    (input: {
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
    }): Album => {
      const now = new Date().toISOString();
      const newAlbum: Album = {
        id: generateId('alb'),
        externalCatalogId: input.externalCatalogId,
        itunesCollectionId: input.itunesCollectionId,
        title: input.title.trim(),
        artist: input.artist.trim(),
        releaseYear: input.releaseYear,
        genre: input.genre.trim() || 'Música',
        coverUrl: input.coverUrl,
        ratingMode: 'auto-mean',
        manualScore: null,
        mustHear: false,
        isListened: Boolean(input.isListened),
        isLiked: Boolean(input.isLiked),
        isFavorite: Boolean(input.isFavorite),
        inWatchlist: Boolean(input.inWatchlist),
        reviewText: '',
        moodTags: [],
        aotyData: input.aotyData,
        createdAt: now,
        updatedAt: now,
        tracks: input.tracks.map((t, index) => ({
          id: generateId('trk'),
          trackNumber: t.trackNumber || index + 1,
          title: t.title.trim(),
          durationMs: t.durationMs || 180000,
          score: null,
          rankOrder: index + 1,
          isFavorite: false,
          previewUrl: t.previewUrl,
          aotyRating: t.aotyRating,
          aotyRatingCount: t.aotyRatingCount,
        })),
      };

      setAlbums((prev) => [newAlbum, ...prev]);
      return newAlbum;
    },
    []
  );

  const updateAlbum = useCallback((albumId: string, updater: (prev: Album) => Album) => {
    setAlbums((prev) =>
      prev.map((album) => {
        if (album.id !== albumId) return album;
        const updated = updater(album);
        return { ...updated, updatedAt: new Date().toISOString() };
      })
    );
  }, []);

  const attachAotyData = useCallback(
    (albumId: string, aotyData: NonNullable<Album['aotyData']>) => {
      updateAlbum(albumId, (album) => {
        const normalize = (s: string) =>
          s
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');

        const updatedTracks = album.tracks.map((trk, idx) => {
          const matched =
            aotyData.trackRatings.find(
              (r) => normalize(r.title) === normalize(trk.title)
            ) ?? aotyData.trackRatings[idx];

          if (!matched) return trk;
          return {
            ...trk,
            aotyRating: matched.rating,
            aotyRatingCount: matched.ratingCount,
            aotySongUrl: matched.songUrl ?? trk.aotySongUrl,
          };
        });

        return {
          ...album,
          aotyData,
          tracks: updatedTracks,
        };
      });
    },
    [updateAlbum]
  );

  const toggleAlbumStatus = useCallback(
    (albumId: string, field: AlbumStatusField) => {
      updateAlbum(albumId, (prev) => {
        const nextVal = !prev[field];
        if (field === 'isListened' && nextVal) {
          return { ...prev, isListened: true, inWatchlist: false };
        }
        if (field === 'inWatchlist' && nextVal) {
          return { ...prev, inWatchlist: true, isListened: false };
        }
        return { ...prev, [field]: nextVal };
      });
    },
    [updateAlbum]
  );

  const deleteAlbum = useCallback((albumId: string) => {
    setAlbums((prev) => prev.filter((a) => a.id !== albumId));
    setLists((prev) =>
      prev.map((list) => ({
        ...list,
        items: list.items
          .filter((item) => item.albumId !== albumId)
          .map((item, idx) => ({ ...item, position: idx + 1 })),
        updatedAt: new Date().toISOString(),
      }))
    );
  }, []);

  const updateTrackScore = useCallback(
    (albumId: string, trackId: string, score: number | null) => {
      updateAlbum(albumId, (album) => ({
        ...album,
        isListened: score !== null ? true : album.isListened,
        inWatchlist: score !== null ? false : album.inWatchlist,
        tracks: album.tracks.map((trk) =>
          trk.id === trackId
            ? { ...trk, score: score === null ? null : clampScore(score) }
            : trk
        ),
      }));
    },
    [updateAlbum]
  );

  const toggleTrackFavorite = useCallback(
    (albumId: string, trackId: string) => {
      updateAlbum(albumId, (album) => ({
        ...album,
        tracks: album.tracks.map((trk) =>
          trk.id === trackId ? { ...trk, isFavorite: !trk.isFavorite } : trk
        ),
      }));
    },
    [updateAlbum]
  );

  const reorderTracksRank = useCallback(
    (albumId: string, orderedTrackIds: string[]) => {
      updateAlbum(albumId, (album) => {
        const orderMap = new Map(orderedTrackIds.map((id, idx) => [id, idx + 1]));
        return {
          ...album,
          tracks: album.tracks.map((trk) => ({
            ...trk,
            rankOrder: orderMap.get(trk.id) ?? trk.rankOrder,
          })),
        };
      });
    },
    [updateAlbum]
  );

  const addTrackToAlbum = useCallback(
    (albumId: string, title: string, durationMs: number) => {
      updateAlbum(albumId, (album) => {
        const nextNum = album.tracks.length + 1;
        const newTrack: Track = {
          id: generateId('trk'),
          trackNumber: nextNum,
          title: title.trim(),
          durationMs,
          score: null,
          rankOrder: nextNum,
          isFavorite: false,
        };
        return {
          ...album,
          tracks: [...album.tracks, newTrack],
        };
      });
    },
    [updateAlbum]
  );

  const removeTrackFromAlbum = useCallback(
    (albumId: string, trackId: string) => {
      updateAlbum(albumId, (album) => {
        const filtered = album.tracks.filter((t) => t.id !== trackId);
        const byRank = [...filtered].sort((a, b) => a.rankOrder - b.rankOrder);
        const rankMap = new Map(byRank.map((t, idx) => [t.id, idx + 1]));
        return {
          ...album,
          tracks: filtered.map((t, idx) => ({
            ...t,
            trackNumber: idx + 1,
            rankOrder: rankMap.get(t.id) ?? idx + 1,
          })),
        };
      });
    },
    [updateAlbum]
  );

  const setAlbumRatingMode = useCallback(
    (albumId: string, ratingMode: RatingMode, manualScore?: number | null) => {
      updateAlbum(albumId, (album) => ({
        ...album,
        ratingMode,
        manualScore:
          manualScore !== undefined
            ? manualScore === null
              ? null
              : clampScore(manualScore)
            : album.manualScore,
      }));
    },
    [updateAlbum]
  );

  const createList = useCallback(
    (input: {
      title: string;
      description: string;
      category: CustomList['category'];
      initialAlbumId?: string;
    }): CustomList => {
      const created: CustomList = {
        id: generateId('lst'),
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category,
        items: input.initialAlbumId
          ? [{ albumId: input.initialAlbumId, position: 1, commentary: '' }]
          : [],
        updatedAt: new Date().toISOString(),
      };
      setLists((prev) => [created, ...prev]);
      return created;
    },
    []
  );

  const updateList = useCallback((listId: string, updater: (prev: CustomList) => CustomList) => {
    setLists((prev) =>
      prev.map((l) => {
        if (l.id !== listId) return l;
        const updated = updater(l);
        return { ...updated, updatedAt: new Date().toISOString() };
      })
    );
  }, []);

  const toggleAlbumInList = useCallback(
    (listId: string, albumId: string) => {
      updateList(listId, (prev) => {
        const exists = prev.items.some((i) => i.albumId === albumId);
        if (exists) {
          return {
            ...prev,
            items: prev.items
              .filter((i) => i.albumId !== albumId)
              .map((item, idx) => ({ ...item, position: idx + 1 })),
          };
        }
        return {
          ...prev,
          items: [
            ...prev.items,
            { albumId, position: prev.items.length + 1, commentary: '' },
          ],
        };
      });
    },
    [updateList]
  );

  const deleteList = useCallback((listId: string) => {
    setLists((prev) => prev.filter((l) => l.id !== listId));
  }, []);

  const loadSamplePack = useCallback(() => {
    setAlbums((prev) => {
      const existingIds = new Set(prev.map((a) => a.id));
      const newSamples = SAMPLE_ALBUMS.filter((s) => !existingIds.has(s.id));
      return [...newSamples, ...prev];
    });
    setLists((prev) => {
      const existingIds = new Set(prev.map((l) => l.id));
      const newLists = SAMPLE_LISTS.filter((s) => !existingIds.has(s.id));
      return [...newLists, ...prev];
    });
  }, []);

  const clearAllData = useCallback(() => {
    setAlbums([]);
    setLists([]);
  }, []);

  const exportBackup = useCallback((): BackupPayload => {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      albums,
      lists,
      profile,
    };
  }, [albums, lists, profile]);

  const importBackup = useCallback((raw: unknown): { ok: boolean; count: number; error?: string } => {
    const validated = validateBackupPayload(raw);
    if (!validated) {
      return { ok: false, count: 0, error: 'Arquivo JSON inválido ou incompatível com o FaixaNota.' };
    }
    setAlbums(validated.albums);
    setLists(validated.lists);
    if (validated.profile) {
      setProfile(validated.profile);
    }
    return { ok: true, count: validated.albums.length };
  }, []);

  return {
    albums,
    lists,
    profile,
    updateProfile,
    addAlbum,
    updateAlbum,
    attachAotyData,
    toggleAlbumStatus,
    deleteAlbum,
    updateTrackScore,
    toggleTrackFavorite,
    reorderTracksRank,
    addTrackToAlbum,
    removeTrackFromAlbum,
    setAlbumRatingMode,
    createList,
    updateList,
    toggleAlbumInList,
    deleteList,
    loadSamplePack,
    clearAllData,
    exportBackup,
    importBackup,
  };
}
