import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEEZER_HOST = 'https://api.deezer.com';
const MUSICBRAINZ_HOST = 'https://musicbrainz.org';
const COVER_ART_HOST = 'https://coverartarchive.org';
const ITUNES_HOST = 'https://itunes.apple.com';
const MUSICBRAINZ_USER_AGENT = 'FaixaNota/1.0 (https://faixanota.local)';
const PORT = Number(process.env.PORT) || 3000;

type CatalogSource = 'deezer' | 'musicbrainz' | 'itunes';
type ReleaseKind = 'album' | 'ep' | 'single';

interface UnifiedSearchResult {
  catalogId: string;
  providerId: string;
  source: CatalogSource;
  collectionId?: number;
  title: string;
  artist: string;
  releaseYear?: number;
  genre: string;
  coverUrl: string;
  trackCount: number;
  releaseType: ReleaseKind;
}

interface ItunesRawItem {
  wrapperType?: string;
  kind?: string;
  collectionId?: number;
  trackId?: number;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackCount?: number;
  discNumber?: number;
  trackNumber?: number;
  trackTimeMillis?: number;
  previewUrl?: string;
}

interface ItunesResponse {
  resultCount?: number;
  results?: ItunesRawItem[];
}

interface DeezerSearchAlbum {
  id?: number;
  title?: string;
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
  genre_id?: number;
  nb_tracks?: number;
  record_type?: string;
  artist?: { name?: string };
}

interface DeezerAlbumDetail {
  id?: number;
  title?: string;
  cover_big?: string;
  cover_xl?: string;
  release_date?: string;
  nb_tracks?: number;
  artist?: { name?: string };
  genres?: { data?: Array<{ name?: string }> };
  tracks?: {
    data?: Array<{
      id?: number;
      title?: string;
      duration?: number;
      preview?: string;
      track_position?: number;
    }>;
  };
}

interface MusicBrainzArtistCredit {
  name?: string;
  joinphrase?: string;
}

interface MusicBrainzReleaseGroup {
  id?: string;
  title?: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
  'artist-credit'?: MusicBrainzArtistCredit[];
  tags?: Array<{ name?: string; count?: number }>;
  genres?: Array<{ name?: string; count?: number }>;
}

const DEEZER_GENRE_MAP: Record<number, string> = {
  132: 'Pop',
  116: 'Hip-Hop',
  152: 'Rock',
  106: 'Eletrônica',
  85: 'Alternativo',
  165: 'R&B / Soul',
  129: 'Jazz',
  464: 'Metal',
  153: 'MPB / Brasil',
  113: 'Dance',
  169: 'Soul & Funk',
  144: 'Reggae',
  98: 'Clássica',
  466: 'Folk',
  197: 'Latina',
  16: 'Trilha Sonora',
};

function sanitizeHttpsUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('https://') || url.startsWith('http://')) {
    return url;
  }
  return '';
}

function upgradeArtworkUrl(url?: string): string {
  const safe = sanitizeHttpsUrl(url);
  if (!safe) return '';
  return safe.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/i, '/600x600bb.$1');
}

function extractReleaseYear(dateStr?: string): number {
  if (!dateStr) return new Date().getFullYear();
  const parsed = Number.parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(parsed) && parsed > 1900 && parsed <= 2100
    ? parsed
    : new Date().getFullYear();
}

function extractOptionalYear(dateStr?: string): number | undefined {
  if (!dateStr || dateStr.length < 4) return undefined;
  const parsed = Number.parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(parsed) && parsed > 1900 && parsed <= 2100 ? parsed : undefined;
}

function classifyItunesReleaseType(title: string, trackCount: number): ReleaseKind {
  const normalized = title.trim();
  if (/\s-\sSingle$/i.test(normalized) || /\(Single\)$/i.test(normalized)) {
    return 'single';
  }
  if (/\s-\sEP$/i.test(normalized) || /\(EP\)$/i.test(normalized)) {
    return 'ep';
  }
  if (trackCount > 0 && trackCount <= 2) {
    return 'single';
  }
  return 'album';
}

function classifyDeezerReleaseType(recordType: string | undefined, nbTracks: number): ReleaseKind {
  const normalized = (recordType || '').toLowerCase();
  if (normalized === 'single') return 'single';
  if (normalized === 'ep') return 'ep';
  if (nbTracks > 0 && nbTracks <= 2) return 'single';
  return 'album';
}

function classifyMusicBrainzReleaseType(primaryType?: string): ReleaseKind {
  const normalized = (primaryType || '').toLowerCase();
  if (normalized === 'single') return 'single';
  if (normalized === 'ep') return 'ep';
  return 'album';
}

function formatMusicBrainzArtist(credits?: MusicBrainzArtistCredit[]): string {
  if (!Array.isArray(credits) || credits.length === 0) return 'Artista desconhecido';
  return (
    credits
      .map((c) => `${c.name ?? ''}${c.joinphrase ?? ''}`)
      .join('')
      .trim() || 'Artista desconhecido'
  );
}

function escapeLuceneTerm(term: string): string {
  return term.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function filterByReleaseType(
  items: UnifiedSearchResult[],
  filterType: 'album' | 'ep' | 'all'
): UnifiedSearchResult[] {
  return items.filter((item) => {
    if (filterType === 'all') return true;
    if (filterType === 'ep') return item.releaseType === 'album' || item.releaseType === 'ep';
    return item.releaseType === 'album';
  });
}

async function fetchMusicBrainzJson(url: string): Promise<Response> {
  const resp = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': MUSICBRAINZ_USER_AGENT,
    },
    signal: AbortSignal.timeout(9000),
  });
  if (resp.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 1050));
    return fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': MUSICBRAINZ_USER_AGENT,
      },
      signal: AbortSignal.timeout(9000),
    });
  }
  return resp;
}

async function searchDeezerAlbums(
  rawQuery: string,
  filterType: 'album' | 'ep' | 'all',
  limit: number
): Promise<UnifiedSearchResult[]> {
  const params = new URLSearchParams({
    q: rawQuery,
    limit: '60',
  });
  const upstream = await fetch(`${DEEZER_HOST}/search/album?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) {
    throw new Error('DEEZER_UPSTREAM_ERROR');
  }
  const payload = (await upstream.json()) as { data?: DeezerSearchAlbum[]; error?: unknown };
  if (payload.error) {
    throw new Error('DEEZER_API_ERROR');
  }
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const mapped: UnifiedSearchResult[] = rows
    .filter((item): item is DeezerSearchAlbum & { id: number } => typeof item.id === 'number')
    .map((item) => {
      const trackCount = typeof item.nb_tracks === 'number' ? item.nb_tracks : 0;
      const providerId = String(item.id);
      return {
        catalogId: `deezer:${providerId}`,
        providerId,
        source: 'deezer',
        title: item.title?.trim() || 'Álbum sem título',
        artist: item.artist?.name?.trim() || 'Artista desconhecido',
        genre: (typeof item.genre_id === 'number' && DEEZER_GENRE_MAP[item.genre_id]) || 'Música',
        coverUrl: sanitizeHttpsUrl(item.cover_big || item.cover_xl || item.cover_medium),
        trackCount,
        releaseType: classifyDeezerReleaseType(item.record_type, trackCount),
      };
    });

  return filterByReleaseType(mapped, filterType).slice(0, limit);
}

async function searchMusicBrainzAlbums(
  rawQuery: string,
  filterType: 'album' | 'ep' | 'all',
  limit: number
): Promise<UnifiedSearchResult[]> {
  const safeTerm = escapeLuceneTerm(rawQuery) || rawQuery;
  const params = new URLSearchParams({
    query: safeTerm,
    fmt: 'json',
    limit: '40',
  });
  const upstream = await fetchMusicBrainzJson(`${MUSICBRAINZ_HOST}/ws/2/release-group?${params.toString()}`);
  if (!upstream.ok) {
    throw new Error('MUSICBRAINZ_UPSTREAM_ERROR');
  }
  const payload = (await upstream.json()) as { 'release-groups'?: MusicBrainzReleaseGroup[] };
  const groups = Array.isArray(payload['release-groups']) ? payload['release-groups'] : [];

  const mapped: UnifiedSearchResult[] = groups
    .filter((rg): rg is MusicBrainzReleaseGroup & { id: string } => typeof rg.id === 'string')
    .map((rg) => {
      const topTag = Array.isArray(rg.tags) && rg.tags.length > 0 ? rg.tags[0]?.name : undefined;
      return {
        catalogId: `musicbrainz:${rg.id}`,
        providerId: rg.id,
        source: 'musicbrainz',
        title: rg.title?.trim() || 'Álbum sem título',
        artist: formatMusicBrainzArtist(rg['artist-credit']),
        releaseYear: extractOptionalYear(rg['first-release-date']),
        genre: topTag ? topTag.charAt(0).toUpperCase() + topTag.slice(1) : 'Música',
        coverUrl: `${COVER_ART_HOST}/release-group/${rg.id}/front-500`,
        trackCount: 0,
        releaseType: classifyMusicBrainzReleaseType(rg['primary-type']),
      };
    });

  return filterByReleaseType(mapped, filterType).slice(0, limit);
}

async function searchItunesAlbums(
  rawQuery: string,
  filterType: 'album' | 'ep' | 'all',
  limit: number
): Promise<UnifiedSearchResult[]> {
  const params = new URLSearchParams({
    term: rawQuery,
    entity: 'album',
    media: 'music',
    limit: '60',
  });
  const upstream = await fetch(`${ITUNES_HOST}/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) {
    throw new Error('ITUNES_UPSTREAM_ERROR');
  }
  const payload = (await upstream.json()) as ItunesResponse;
  const results = Array.isArray(payload.results) ? payload.results : [];

  const mapped: UnifiedSearchResult[] = results
    .filter((item) => item.wrapperType === 'collection' && typeof item.collectionId === 'number')
    .map((item) => {
      const title = item.collectionName?.trim() || 'Álbum sem título';
      const trackCount = typeof item.trackCount === 'number' ? item.trackCount : 0;
      const providerId = String(item.collectionId);
      return {
        catalogId: `itunes:${providerId}`,
        providerId,
        source: 'itunes',
        collectionId: item.collectionId as number,
        title,
        artist: item.artistName?.trim() || 'Artista desconhecido',
        releaseYear: extractReleaseYear(item.releaseDate),
        genre: item.primaryGenreName?.trim() || 'Música',
        coverUrl: upgradeArtworkUrl(item.artworkUrl100),
        trackCount,
        releaseType: classifyItunesReleaseType(title, trackCount),
      };
    });

  return filterByReleaseType(mapped, filterType).slice(0, limit);
}

async function fetchItunesAlbumDetail(rawId: string) {
  const params = new URLSearchParams({
    id: rawId,
    entity: 'song',
    limit: '200',
  });
  const upstream = await fetch(`${ITUNES_HOST}/lookup?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) {
    return { status: 502 as const, error: 'Não foi possível obter a lista de faixas.' };
  }
  const payload = (await upstream.json()) as ItunesResponse;
  const results = Array.isArray(payload.results) ? payload.results : [];
  const collection = results.find((item) => item.wrapperType === 'collection');
  if (!collection) {
    return { status: 404 as const, error: 'Álbum não encontrado.' };
  }
  const tracks = results
    .filter((item) => item.wrapperType === 'track' && item.kind === 'song' && item.trackName)
    .sort((a, b) => {
      const discDiff = (a.discNumber ?? 1) - (b.discNumber ?? 1);
      if (discDiff !== 0) return discDiff;
      return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
    })
    .map((track, idx) => ({
      trackNumber: idx + 1,
      title: track.trackName?.trim() || `Faixa ${idx + 1}`,
      durationMs: typeof track.trackTimeMillis === 'number' ? track.trackTimeMillis : 180000,
      previewUrl:
        typeof track.previewUrl === 'string' && track.previewUrl.startsWith('https://')
          ? track.previewUrl
          : undefined,
    }));

  const collectionId = collection.collectionId ?? Number(rawId);
  return {
    status: 200 as const,
    album: {
      catalogId: `itunes:${collectionId}`,
      providerId: String(collectionId),
      source: 'itunes' as const,
      collectionId,
      title: collection.collectionName?.trim() || 'Álbum sem título',
      artist: collection.artistName?.trim() || 'Artista desconhecido',
      releaseYear: extractReleaseYear(collection.releaseDate),
      genre: collection.primaryGenreName?.trim() || 'Música',
      coverUrl: upgradeArtworkUrl(collection.artworkUrl100),
      tracks,
    },
  };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/music/search', async (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 20;
    const rawType = typeof req.query.type === 'string' ? req.query.type.trim() : 'album';
    const rawSource = typeof req.query.source === 'string' ? req.query.source.trim() : 'deezer';

    const filterType: 'album' | 'ep' | 'all' =
      rawType === 'ep' || rawType === 'all' ? rawType : 'album';
    const source: CatalogSource =
      rawSource === 'musicbrainz' || rawSource === 'itunes' ? rawSource : 'deezer';

    if (rawQuery.length < 1 || rawQuery.length > 120) {
      res.status(400).json({ error: 'Informe um termo de busca entre 1 e 120 caracteres.' });
      return;
    }

    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 24) : 20;

    try {
      if (source === 'musicbrainz') {
        const albums = await searchMusicBrainzAlbums(rawQuery, filterType, limit);
        res.json({ albums, providerUsed: 'musicbrainz' });
        return;
      }

      if (source === 'itunes') {
        const albums = await searchItunesAlbums(rawQuery, filterType, limit);
        res.json({ albums, providerUsed: 'itunes' });
        return;
      }

      // Default: Deezer with automatic MusicBrainz fallback when nothing matches
      const deezerAlbums = await searchDeezerAlbums(rawQuery, filterType, limit);
      if (deezerAlbums.length > 0) {
        res.json({ albums: deezerAlbums, providerUsed: 'deezer' });
        return;
      }

      try {
        const mbFallback = await searchMusicBrainzAlbums(rawQuery, filterType, limit);
        if (mbFallback.length > 0) {
          res.json({
            albums: mbFallback,
            providerUsed: 'musicbrainz',
            fallbackFrom: 'deezer',
          });
          return;
        }
      } catch {
        // Ignore fallback failure and return empty Deezer results cleanly
      }

      res.json({ albums: [], providerUsed: 'deezer' });
    } catch {
      res.status(502).json({
        error: 'Falha ao consultar o catálogo de álbuns. Tente novamente ou troque a fonte.',
      });
    }
  });

  app.get('/api/music/album/:provider/:id', async (req, res) => {
    const provider = typeof req.params.provider === 'string' ? req.params.provider.trim() : '';
    const rawId = typeof req.params.id === 'string' ? req.params.id.trim() : '';

    if (provider === 'deezer') {
      if (!/^\d{1,20}$/.test(rawId)) {
        res.status(400).json({ error: 'ID de álbum Deezer inválido.' });
        return;
      }
      try {
        const upstream = await fetch(`${DEEZER_HOST}/album/${rawId}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!upstream.ok) {
          res.status(502).json({ error: 'Não foi possível obter os detalhes no Deezer.' });
          return;
        }
        const data = (await upstream.json()) as DeezerAlbumDetail & { error?: unknown };
        if (!data || data.error || !data.id) {
          res.status(404).json({ error: 'Álbum não encontrado no Deezer.' });
          return;
        }

        const rawTracks = Array.isArray(data.tracks?.data) ? data.tracks.data : [];
        const tracks = rawTracks.map((trk, idx) => ({
          trackNumber: idx + 1,
          title: trk.title?.trim() || `Faixa ${idx + 1}`,
          durationMs:
            typeof trk.duration === 'number' && trk.duration > 0 ? trk.duration * 1000 : 180000,
          previewUrl:
            typeof trk.preview === 'string' && trk.preview.startsWith('https://')
              ? trk.preview
              : undefined,
        }));

        const genreName =
          Array.isArray(data.genres?.data) && data.genres.data[0]?.name
            ? data.genres.data[0].name.trim()
            : 'Música';

        res.json({
          album: {
            catalogId: `deezer:${rawId}`,
            providerId: rawId,
            source: 'deezer',
            title: data.title?.trim() || 'Álbum sem título',
            artist: data.artist?.name?.trim() || 'Artista desconhecido',
            releaseYear: extractReleaseYear(data.release_date),
            genre: genreName,
            coverUrl: sanitizeHttpsUrl(data.cover_xl || data.cover_big),
            tracks,
          },
        });
      } catch {
        res.status(504).json({ error: 'Tempo limite excedido ao carregar faixas no Deezer.' });
      }
      return;
    }

    if (provider === 'musicbrainz') {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
        res.status(400).json({ error: 'ID MusicBrainz inválido.' });
        return;
      }
      try {
        const params = new URLSearchParams({
          'release-group': rawId,
          inc: 'recordings+artist-credits+release-groups+genres',
          fmt: 'json',
          limit: '10',
        });
        const upstream = await fetchMusicBrainzJson(
          `${MUSICBRAINZ_HOST}/ws/2/release?${params.toString()}`
        );
        if (!upstream.ok) {
          res.status(502).json({ error: 'Não foi possível obter as faixas no MusicBrainz.' });
          return;
        }
        const payload = (await upstream.json()) as {
          releases?: Array<{
            id?: string;
            title?: string;
            status?: string;
            date?: string;
            'cover-art-archive'?: { front?: boolean };
            'artist-credit'?: MusicBrainzArtistCredit[];
            'release-group'?: {
              'first-release-date'?: string;
              genres?: Array<{ name?: string }>;
            };
            media?: Array<{
              tracks?: Array<{
                title?: string;
                length?: number | null;
              }>;
            }>;
          }>;
        };

        const releases = Array.isArray(payload.releases) ? payload.releases : [];
        if (releases.length === 0) {
          res.status(404).json({ error: 'Nenhuma edição encontrada no MusicBrainz.' });
          return;
        }

        const scoreRelease = (rel: (typeof releases)[number]) => {
          const trackCount = Array.isArray(rel.media)
            ? rel.media.reduce((sum, m) => sum + (m.tracks?.length ?? 0), 0)
            : 0;
          let score = trackCount > 0 ? 10 : 0;
          if (rel.status === 'Official') score += 5;
          if (rel['cover-art-archive']?.front) score += 3;
          return score;
        };

        const chosen = [...releases].sort((a, b) => scoreRelease(b) - scoreRelease(a))[0];
        const flatTracks = Array.isArray(chosen.media)
          ? chosen.media.flatMap((m) => (Array.isArray(m.tracks) ? m.tracks : []))
          : [];

        const tracks = flatTracks.map((trk, idx) => ({
          trackNumber: idx + 1,
          title: trk.title?.trim() || `Faixa ${idx + 1}`,
          durationMs:
            typeof trk.length === 'number' && trk.length > 0 ? Math.round(trk.length) : 180000,
        }));

        const rgGenres = chosen['release-group']?.genres;
        const firstGenre =
          Array.isArray(rgGenres) && rgGenres[0]?.name
            ? rgGenres[0].name.charAt(0).toUpperCase() + rgGenres[0].name.slice(1)
            : 'Música';

        const coverUrl =
          chosen['cover-art-archive']?.front && chosen.id
            ? `${COVER_ART_HOST}/release/${chosen.id}/front-500`
            : `${COVER_ART_HOST}/release-group/${rawId}/front-500`;

        res.json({
          album: {
            catalogId: `musicbrainz:${rawId}`,
            providerId: rawId,
            source: 'musicbrainz',
            title: chosen.title?.trim() || 'Álbum sem título',
            artist: formatMusicBrainzArtist(chosen['artist-credit']),
            releaseYear: extractReleaseYear(
              chosen['release-group']?.['first-release-date'] || chosen.date
            ),
            genre: firstGenre,
            coverUrl,
            tracks,
          },
        });
      } catch {
        res.status(504).json({ error: 'Tempo limite excedido ao carregar faixas no MusicBrainz.' });
      }
      return;
    }

    if (provider === 'itunes') {
      if (!/^\d{1,20}$/.test(rawId)) {
        res.status(400).json({ error: 'ID de álbum inválido.' });
        return;
      }
      try {
        const result = await fetchItunesAlbumDetail(rawId);
        if (result.status !== 200) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json({ album: result.album });
      } catch {
        res.status(504).json({ error: 'Tempo limite excedido ao carregar faixas do álbum.' });
      }
      return;
    }

    res.status(400).json({ error: 'Fonte de catálogo desconhecida.' });
  });

  // Legacy iTunes route kept for backward compatibility
  app.get('/api/music/album/:id', async (req, res) => {
    const rawId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!/^\d{1,20}$/.test(rawId)) {
      res.status(400).json({ error: 'ID de álbum inválido.' });
      return;
    }

    try {
      const result = await fetchItunesAlbumDetail(rawId);
      if (result.status !== 200) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ album: result.album });
    } catch {
      res.status(504).json({ error: 'Tempo limite excedido ao carregar faixas do álbum.' });
    }
  });

  // Unofficial AOTY API enrichment & direct slug lookup proxy
  const AOTY_API_HOST = 'https://aoty.prigoana.com';

  function parseAotyDuration(lengthStr?: string): number {
    if (!lengthStr || typeof lengthStr !== 'string') return 180000;
    const match = /^(\d{1,2}):(\d{2})$/.exec(lengthStr.trim());
    if (!match) return 180000;
    const mins = Number.parseInt(match[1], 10);
    const secs = Number.parseInt(match[2], 10);
    return (mins * 60 + secs) * 1000;
  }

  function parseNullableInt(val: unknown): number | null {
    if (typeof val === 'number' && Number.isFinite(val)) return Math.round(val);
    if (typeof val === 'string') {
      const parsed = Number.parseInt(val.replace(/,/g, ''), 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function extractSafeAotySlug(rawSlugInput: string): string | null {
    const trimmed = rawSlugInput.trim();
    if (!trimmed) return null;
    const urlMatch = /albumoftheyear\.org\/album\/([a-zA-Z0-9-]+)(?:\.php)?/i.exec(trimmed);
    const candidate = urlMatch ? urlMatch[1] : trimmed.replace(/\.php$/i, '');
    if (/^[a-zA-Z0-9-]{1,120}$/.test(candidate)) {
      return candidate;
    }
    return null;
  }

  function cleanAlbumTitleForLookup(title: string): string {
    return title
      .replace(/\s*\((Deluxe|Expanded|Remaster(ed)?|Super Deluxe|Anniversary|Bonus Track)[^)]*\)/gi, '')
      .replace(/\s*-\s*(EP|Single)$/i, '')
      .trim();
  }

  app.get('/api/aoty/album', async (req, res) => {
    const rawSlug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
    const rawArtist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
    const rawName = typeof req.query.name === 'string' ? req.query.name.trim() : '';

    const params = new URLSearchParams();

    if (rawSlug) {
      const safeSlug = extractSafeAotySlug(rawSlug);
      if (!safeSlug) {
        res.status(400).json({
          found: false,
          message: 'Slug, ID ou link do AOTY inválido.',
        });
        return;
      }
      params.set('slug', safeSlug);
    } else if (rawArtist && rawName) {
      params.set('artist', rawArtist.slice(0, 100));
      params.set('name', cleanAlbumTitleForLookup(rawName).slice(0, 120));
    } else {
      res.status(400).json({
        found: false,
        message: 'Informe um ID/link do AOTY ou artista e nome do álbum.',
      });
      return;
    }

    try {
      let upstream = await fetch(`${AOTY_API_HOST}/album?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6500),
      });

      if (!upstream.ok && upstream.status >= 500) {
        const minimalParams = new URLSearchParams(params);
        minimalParams.set('minimal', 'true');
        upstream = await fetch(`${AOTY_API_HOST}/album?${minimalParams.toString()}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6500),
        });
      }

      if (!upstream.ok) {
        res.json({
          found: false,
          message:
            upstream.status === 404
              ? 'Álbum não encontrado no AOTY.'
              : 'Este disco ainda não está em cache na API do AOTY (ou houve bloqueio temporário do servidor de origem). Você pode colar um ID já indexado como 362 ou 2915.',
        });
        return;
      }

      const data = (await upstream.json()) as {
        id?: string;
        url?: string;
        title?: string;
        artist?: string;
        cover?: string;
        datePublished?: string;
        format?: string;
        label?: string;
        genres?: string[];
        tags?: string[];
        criticScore?: string | number;
        criticCount?: string | number;
        userScore?: string | number;
        userCount?: string;
        tracklist?: Array<{
          number?: string | number;
          title?: string;
          url?: string;
          length?: string;
          rating?: string | number | null;
          ratingCount?: number;
        }>;
        reviews?: Array<{
          score?: string | number;
          publication?: string;
          author?: string;
          text?: string;
          date?: string;
        }>;
        popularUserReviews?: Array<{
          reviewId?: number | null;
          username?: string;
          avatar?: string | null;
          rating?: string | number | null;
          text?: string;
          likes?: number;
          comments?: number;
          date?: string | null;
          url?: string;
        }>;
        recentUserReviews?: Array<{
          reviewId?: number | null;
          username?: string;
          avatar?: string | null;
          rating?: string | number | null;
          text?: string;
          likes?: number;
          comments?: number;
          date?: string | null;
          url?: string;
        }>;
        stats?: {
          lists?: number | null;
        } | null;
      };

      if (!data || !data.title || !data.id) {
        res.json({
          found: false,
          message: 'Resposta incompleta da API do AOTY.',
        });
        return;
      }

      const genres = Array.isArray(data.genres)
        ? data.genres.filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
        : [];
      const tags = Array.isArray(data.tags)
        ? data.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : [];

      const trackRatings = Array.isArray(data.tracklist)
        ? data.tracklist.map((t, idx) => ({
            trackNumber: parseNullableInt(t.number) ?? idx + 1,
            title: typeof t.title === 'string' ? t.title.trim() : `Faixa ${idx + 1}`,
            durationMs: parseAotyDuration(t.length),
            rating: parseNullableInt(t.rating),
            ratingCount: typeof t.ratingCount === 'number' ? t.ratingCount : 0,
            songUrl:
              typeof t.url === 'string' && t.url.startsWith('https://') ? t.url : undefined,
          }))
        : [];

      const criticReviews = Array.isArray(data.reviews)
        ? data.reviews.slice(0, 10).map((r) => ({
            publication:
              typeof r.publication === 'string' && r.publication.trim()
                ? r.publication.trim()
                : 'Publicação',
            author: typeof r.author === 'string' ? r.author.trim() : '',
            score: parseNullableInt(r.score),
            text: typeof r.text === 'string' ? r.text.trim() : '',
            date: typeof r.date === 'string' ? r.date : undefined,
          }))
        : [];

      const rawUserReviews = Array.isArray(data.popularUserReviews)
        ? data.popularUserReviews
        : Array.isArray(data.recentUserReviews)
          ? data.recentUserReviews
          : [];

      const userReviews = rawUserReviews
        .filter((r) => typeof r?.text === 'string' && r.text.trim().length > 0)
        .slice(0, 15)
        .map((r) => ({
          reviewId: typeof r.reviewId === 'number' ? r.reviewId : null,
          username: typeof r.username === 'string' && r.username.trim() ? r.username.trim() : 'Usuário',
          avatar:
            typeof r.avatar === 'string' && r.avatar.startsWith('https://') ? r.avatar : null,
          rating: parseNullableInt(r.rating),
          text: typeof r.text === 'string' ? r.text.trim() : '',
          likes: typeof r.likes === 'number' ? r.likes : 0,
          comments: typeof r.comments === 'number' ? r.comments : 0,
          date: typeof r.date === 'string' ? r.date : null,
          url: typeof r.url === 'string' && r.url.startsWith('https://') ? r.url : undefined,
        }));

      const safeCover =
        typeof data.cover === 'string' &&
        (data.cover.startsWith('https://') || data.cover.startsWith('http://'))
          ? data.cover
          : '';

      const safeUrl =
        typeof data.url === 'string' && data.url.startsWith('https://')
          ? data.url
          : `https://www.albumoftheyear.org/album/${data.id}/`;

      res.json({
        found: true,
        album: {
          title: data.title.trim(),
          artist: data.artist?.trim() || 'Artista desconhecido',
          releaseYear: extractReleaseYear(data.datePublished),
          genre: genres[0] || 'Música',
          coverUrl: safeCover,
          tracks: trackRatings,
          aotyData: {
            aotyId: String(data.id),
            aotyUrl: safeUrl,
            criticScore: parseNullableInt(data.criticScore),
            criticCount: parseNullableInt(data.criticCount),
            userScore: parseNullableInt(data.userScore),
            userCount: typeof data.userCount === 'string' ? data.userCount : null,
            listsCount: parseNullableInt(data.stats?.lists),
            label: typeof data.label === 'string' ? data.label.trim() : undefined,
            format: typeof data.format === 'string' ? data.format.trim() : undefined,
            genres,
            tags,
            criticReviews,
            userReviews,
            trackRatings,
            syncedAt: new Date().toISOString(),
          },
        },
      });
    } catch {
      res.json({
        found: false,
        message: 'Tempo limite excedido ao consultar a API do AOTY.',
      });
    }
  });

  app.get('/api/aoty/album/reviews', async (req, res) => {
    const rawSlug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
    const rawSort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'popular';
    const rawPage = typeof req.query.page === 'string' ? Number.parseInt(req.query.page, 10) : 1;

    const safeSlug = extractSafeAotySlug(rawSlug);
    if (!safeSlug) {
      res.status(400).json({ available: false, reviews: [], message: 'Álbum AOTY inválido.' });
      return;
    }

    const sort = rawSort === 'recent' || rawSort === 'worst' ? rawSort : 'popular';
    const page = Number.isFinite(rawPage) && rawPage >= 1 && rawPage <= 20 ? rawPage : 1;

    try {
      const params = new URLSearchParams({
        slug: safeSlug,
        sort,
        type: 'reviews',
        page: String(page),
      });
      const upstream = await fetch(`${AOTY_API_HOST}/album/user-reviews?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6500),
      });

      if (!upstream.ok) {
        res.json({
          available: false,
          blocked: true,
          reviews: [],
          message:
            'O servidor do AOTY bloqueou temporariamente a leitura automática de reviews da comunidade (proteção Cloudflare).',
        });
        return;
      }

      const data = (await upstream.json()) as {
        totalPages?: number | null;
        reviews?: Array<{
          reviewId?: number | null;
          username?: string;
          avatar?: string | null;
          rating?: string | number | null;
          text?: string;
          likes?: number;
          comments?: number;
          date?: string | null;
          url?: string;
        }>;
      };

      const reviews = Array.isArray(data.reviews)
        ? data.reviews
            .filter((r) => typeof r?.text === 'string' && r.text.trim().length > 0)
            .map((r) => ({
              reviewId: typeof r.reviewId === 'number' ? r.reviewId : null,
              username:
                typeof r.username === 'string' && r.username.trim()
                  ? r.username.trim()
                  : 'Usuário',
              avatar:
                typeof r.avatar === 'string' && r.avatar.startsWith('https://') ? r.avatar : null,
              rating: parseNullableInt(r.rating),
              text: typeof r.text === 'string' ? r.text.trim() : '',
              likes: typeof r.likes === 'number' ? r.likes : 0,
              comments: typeof r.comments === 'number' ? r.comments : 0,
              date: typeof r.date === 'string' ? r.date : null,
              url: typeof r.url === 'string' && r.url.startsWith('https://') ? r.url : undefined,
            }))
        : [];

      res.json({
        available: true,
        totalPages: typeof data.totalPages === 'number' ? data.totalPages : null,
        reviews,
      });
    } catch {
      res.json({
        available: false,
        blocked: true,
        reviews: [],
        message: 'Não foi possível carregar reviews da comunidade no momento.',
      });
    }
  });

  app.get('/api/aoty/album/lists', async (req, res) => {
    const rawSlug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
    const rawType = typeof req.query.type === 'string' ? req.query.type.trim() : 'critic';
    const rawPage = typeof req.query.page === 'string' ? Number.parseInt(req.query.page, 10) : 1;

    const safeSlug = extractSafeAotySlug(rawSlug);
    const listType: 'critic' | 'user' = rawType === 'user' ? 'user' : 'critic';
    if (!safeSlug) {
      res.status(400).json({
        available: false,
        type: listType,
        criticLists: [],
        userLists: [],
        message: 'Álbum AOTY inválido.',
      });
      return;
    }

    const page = Number.isFinite(rawPage) && rawPage >= 1 && rawPage <= 20 ? rawPage : 1;
    const endpoint = listType === 'user' ? 'album/user-lists' : 'album/critic-lists';

    try {
      const params = new URLSearchParams({
        slug: safeSlug,
        page: String(page),
      });
      const upstream = await fetch(`${AOTY_API_HOST}/${endpoint}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6500),
      });

      if (!upstream.ok) {
        res.json({
          available: false,
          blocked: true,
          type: listType,
          criticLists: [],
          userLists: [],
          message:
            listType === 'user'
              ? 'O servidor do AOTY bloqueou temporariamente a leitura automática das listas de usuários (proteção Cloudflare).'
              : 'O servidor do AOTY bloqueou temporariamente a leitura automática das listas da crítica (proteção Cloudflare).',
        });
        return;
      }

      if (listType === 'critic') {
        const data = (await upstream.json()) as {
          lists?: Array<{
            url?: string;
            title?: string;
            publication?: string;
            publicationUrl?: string | null;
            cover?: string | null;
            rank?: number | null;
          }>;
        };

        const criticLists = Array.isArray(data.lists)
          ? data.lists
              .filter((l) => typeof l?.title === 'string' && l.title.trim().length > 0)
              .slice(0, 20)
              .map((l) => ({
                title: l.title!.trim(),
                publication:
                  typeof l.publication === 'string' && l.publication.trim()
                    ? l.publication.trim()
                    : 'Publicação',
                publicationUrl:
                  typeof l.publicationUrl === 'string' && l.publicationUrl.startsWith('https://')
                    ? l.publicationUrl
                    : null,
                rank: parseNullableInt(l.rank),
                url:
                  typeof l.url === 'string' && l.url.startsWith('https://')
                    ? l.url
                    : `https://www.albumoftheyear.org/album/${safeSlug}/critic-lists/`,
                cover:
                  typeof l.cover === 'string' && l.cover.startsWith('https://') ? l.cover : null,
              }))
          : [];

        res.json({
          available: true,
          type: 'critic',
          criticLists,
          userLists: [],
        });
        return;
      }

      const data = (await upstream.json()) as {
        lists?: Array<{
          url?: string;
          title?: string;
          username?: string;
          userUrl?: string;
          avatar?: string | null;
          description?: string | null;
          likes?: number | null;
          comments?: number | null;
          albumCount?: number | null;
          ranked?: boolean;
          updatedAgo?: string | null;
        }>;
      };

      const userLists = Array.isArray(data.lists)
        ? data.lists
            .filter((l) => typeof l?.title === 'string' && l.title.trim().length > 0)
            .slice(0, 20)
            .map((l) => ({
              title: l.title!.trim(),
              username:
                typeof l.username === 'string' && l.username.trim()
                  ? l.username.trim()
                  : 'Usuário',
              userUrl:
                typeof l.userUrl === 'string' && l.userUrl.startsWith('https://')
                  ? l.userUrl
                  : undefined,
              avatar:
                typeof l.avatar === 'string' && l.avatar.startsWith('https://') ? l.avatar : null,
              description: typeof l.description === 'string' ? l.description.trim() : null,
              likes: parseNullableInt(l.likes),
              comments: parseNullableInt(l.comments),
              albumCount: parseNullableInt(l.albumCount),
              ranked: Boolean(l.ranked),
              updatedAgo: typeof l.updatedAgo === 'string' ? l.updatedAgo : null,
              url:
                typeof l.url === 'string' && l.url.startsWith('https://')
                  ? l.url
                  : `https://www.albumoftheyear.org/album/${safeSlug}/user-lists/`,
            }))
        : [];

      res.json({
        available: true,
        type: 'user',
        criticLists: [],
        userLists,
      });
    } catch {
      res.json({
        available: false,
        blocked: true,
        type: listType,
        criticLists: [],
        userLists: [],
        message: 'Não foi possível consultar as listas deste álbum no AOTY agora.',
      });
    }
  });

  function extractSafeAotySongSlug(rawInput: string): string | null {
    const trimmed = rawInput.trim();
    if (!trimmed) return null;
    const urlMatch = /albumoftheyear\.org\/song\/([a-zA-Z0-9-]+)(?:\.php)?/i.exec(trimmed);
    const candidate = urlMatch ? urlMatch[1] : trimmed.replace(/\.php$/i, '');
    return /^[a-zA-Z0-9-]{1,140}$/.test(candidate) ? candidate : null;
  }

  app.get('/api/aoty/song', async (req, res) => {
    const rawSlug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
    const safeSlug = extractSafeAotySongSlug(rawSlug);
    if (!safeSlug) {
      res.status(400).json({ available: false, message: 'Link ou ID da faixa inválido.' });
      return;
    }

    try {
      const upstream = await fetch(
        `${AOTY_API_HOST}/song?slug=${encodeURIComponent(safeSlug)}`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6500),
        }
      );

      if (!upstream.ok) {
        res.json({
          available: false,
          blocked: true,
          message:
            'O AOTY bloqueou temporariamente a leitura de comentários desta faixa (proteção Cloudflare).',
        });
        return;
      }

      const data = (await upstream.json()) as {
        title?: string;
        url?: string;
        userScore?: number | null;
        ratingCount?: number | null;
        likePercentage?: number | null;
        topRatings?: Array<{
          username?: string;
          avatar?: string | null;
          rating?: number | null;
          date?: string | null;
        }>;
        comments?: Array<{
          username?: string;
          avatar?: string | null;
          text?: string;
          date?: string | null;
          likes?: number;
        }>;
      };

      res.json({
        available: true,
        song: {
          title: typeof data.title === 'string' ? data.title : 'Faixa',
          url:
            typeof data.url === 'string' && data.url.startsWith('https://')
              ? data.url
              : `https://www.albumoftheyear.org/song/${safeSlug}/`,
          userScore: parseNullableInt(data.userScore),
          ratingCount: parseNullableInt(data.ratingCount),
          likePercentage: typeof data.likePercentage === 'number' ? data.likePercentage : null,
          topRatings: Array.isArray(data.topRatings)
            ? data.topRatings.slice(0, 10).map((r) => ({
                username: typeof r.username === 'string' ? r.username : 'Usuário',
                avatar:
                  typeof r.avatar === 'string' && r.avatar.startsWith('https://')
                    ? r.avatar
                    : null,
                rating: parseNullableInt(r.rating),
                date: typeof r.date === 'string' ? r.date : null,
              }))
            : [],
          comments: Array.isArray(data.comments)
            ? data.comments
                .filter((c) => typeof c?.text === 'string' && c.text.trim().length > 0)
                .slice(0, 12)
                .map((c) => ({
                  username: typeof c.username === 'string' ? c.username : 'Usuário',
                  avatar:
                    typeof c.avatar === 'string' && c.avatar.startsWith('https://')
                      ? c.avatar
                      : null,
                  text: typeof c.text === 'string' ? c.text.trim() : '',
                  date: typeof c.date === 'string' ? c.date : null,
                  likes: typeof c.likes === 'number' ? c.likes : 0,
                }))
            : [],
        },
      });
    } catch {
      res.json({
        available: false,
        blocked: true,
        message: 'Tempo limite excedido ao consultar comentários da faixa no AOTY.',
      });
    }
  });

  function extractSafeAotyUsername(rawInput: string): string | null {
    const trimmed = rawInput.trim().replace(/^@+/, '');
    if (!trimmed) return null;
    const urlMatch = /albumoftheyear\.org\/user\/([a-zA-Z0-9._-]+)/i.exec(trimmed);
    const candidate = urlMatch ? urlMatch[1] : trimmed;
    return /^[a-zA-Z0-9._-]{1,60}$/.test(candidate) ? candidate : null;
  }

  app.get('/api/aoty/user', async (req, res) => {
    const rawUser = typeof req.query.username === 'string' ? req.query.username : '';
    const username = extractSafeAotyUsername(rawUser);
    if (!username) {
      res.status(400).json({
        available: false,
        username: '',
        profileUrl: '',
        message: 'Informe um @usuário ou link de perfil válido do AOTY.',
      });
      return;
    }

    const profileUrl = `https://www.albumoftheyear.org/user/${encodeURIComponent(username)}/`;

    try {
      const upstream = await fetch(
        `${AOTY_API_HOST}/user?username=${encodeURIComponent(username)}`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6500),
        }
      );

      if (!upstream.ok) {
        res.json({
          available: false,
          blocked: true,
          username,
          profileUrl,
          message:
            'O AOTY bloqueou temporariamente a leitura automática de perfis (proteção Cloudflare). Seu @usuário foi salvo com link direto para o perfil público.',
        });
        return;
      }

      const data = (await upstream.json()) as {
        username?: string;
        displayName?: string;
        url?: string;
        avatar?: string | null;
        bio?: string | null;
        location?: string | null;
        stats?: {
          ratings?: number | null;
          reviews?: number | null;
          lists?: number | null;
          followers?: number | null;
          following?: number | null;
        } | null;
        followingPreview?: Array<{
          username?: string;
          avatar?: string | null;
          url?: string;
        }>;
        recentReviews?: Array<{
          album?: string;
          artist?: string;
          rating?: number | null;
          text?: string;
          date?: string | null;
          albumUrl?: string;
          cover?: string | null;
        }>;
        recentlyRated?: Array<{
          album?: string;
          artist?: string;
          rating?: number | null;
          albumUrl?: string;
          cover?: string | null;
        }>;
      };

      res.json({
        available: true,
        username: data.username || username,
        profileUrl:
          typeof data.url === 'string' && data.url.startsWith('https://') ? data.url : profileUrl,
        profile: {
          username: data.username || username,
          displayName: data.displayName || data.username || username,
          url:
            typeof data.url === 'string' && data.url.startsWith('https://') ? data.url : profileUrl,
          avatar:
            typeof data.avatar === 'string' && data.avatar.startsWith('https://')
              ? data.avatar
              : null,
          bio: typeof data.bio === 'string' ? data.bio : null,
          location: typeof data.location === 'string' ? data.location : null,
          stats: data.stats ?? null,
          following: Array.isArray(data.followingPreview)
            ? data.followingPreview.slice(0, 12).map((f) => ({
                username: typeof f.username === 'string' ? f.username : 'Usuário',
                avatar:
                  typeof f.avatar === 'string' && f.avatar.startsWith('https://')
                    ? f.avatar
                    : null,
                url:
                  typeof f.url === 'string' && f.url.startsWith('https://')
                    ? f.url
                    : `https://www.albumoftheyear.org/user/${encodeURIComponent(
                        f.username || ''
                      )}/`,
              }))
            : [],
          recentReviews: Array.isArray(data.recentReviews)
            ? data.recentReviews.slice(0, 8).map((r) => ({
                album: typeof r.album === 'string' ? r.album : 'Álbum',
                artist: typeof r.artist === 'string' ? r.artist : '',
                rating: parseNullableInt(r.rating),
                text: typeof r.text === 'string' ? r.text : '',
                date: typeof r.date === 'string' ? r.date : null,
                albumUrl:
                  typeof r.albumUrl === 'string' && r.albumUrl.startsWith('https://')
                    ? r.albumUrl
                    : undefined,
                cover:
                  typeof r.cover === 'string' && r.cover.startsWith('https://') ? r.cover : null,
              }))
            : [],
          recentlyRated: Array.isArray(data.recentlyRated)
            ? data.recentlyRated.slice(0, 8).map((r) => ({
                album: typeof r.album === 'string' ? r.album : 'Álbum',
                artist: typeof r.artist === 'string' ? r.artist : '',
                rating: parseNullableInt(r.rating),
                albumUrl:
                  typeof r.albumUrl === 'string' && r.albumUrl.startsWith('https://')
                    ? r.albumUrl
                    : undefined,
                cover:
                  typeof r.cover === 'string' && r.cover.startsWith('https://') ? r.cover : null,
              }))
            : [],
        },
      });
    } catch {
      res.json({
        available: false,
        blocked: true,
        username,
        profileUrl,
        message: 'Tempo limite excedido ao consultar perfil público no AOTY.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FaixaNota server running on http://localhost:${PORT}`);
  });
}

startServer();
