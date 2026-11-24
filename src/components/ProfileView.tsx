import {
  Award,
  BarChart3,
  Check,
  Edit3,
  ExternalLink,
  Link2,
  ListMusic,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Star,
  Unlink,
  User,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  Album,
  AotyUserProfilePayload,
  AudioPreviewState,
  CustomList,
  UserProfile,
} from '../types/music';
import { getAlbumEffectiveScore, sanitizeImageUrl, type BackupPayload } from '../utils/scoring';
import { AlbumArtwork } from './AlbumArtwork';
import { ListsView } from './ListsView';
import { ScoreBox } from './ScoreBox';
import { StatsView } from './StatsView';

interface ProfileViewProps {
  profile: UserProfile;
  albums: Album[];
  lists: CustomList[];
  activePreview: AudioPreviewState | null;
  onUpdateProfile: (next: Partial<UserProfile>) => void;
  onSelectAlbum: (albumId: string) => void;
  onPlayPreview: (track: {
    id: string;
    title: string;
    previewUrl: string;
    artist: string;
    albumTitle: string;
  }) => void;
  onCreateList: (input: {
    title: string;
    description: string;
    category: CustomList['category'];
  }) => CustomList;
  onUpdateList: (listId: string, updater: (prev: CustomList) => CustomList) => void;
  onDeleteList: (listId: string) => void;
  onExportBackup: () => BackupPayload;
  onImportBackup: (raw: unknown) => { ok: boolean; count: number; error?: string };
  onClearAll: () => void;
}

type ProfileSubTab = 'overview' | 'lists' | 'stats';

const MINI_BUCKETS = [
  { label: '90–100', min: 90, max: 100, color: 'bg-[#22C55E]' },
  { label: '80–89', min: 80, max: 89, color: 'bg-[#4ADE80]' },
  { label: '70–79', min: 70, max: 79, color: 'bg-[#84CC16]' },
  { label: '50–69', min: 50, max: 69, color: 'bg-[#EAB308]' },
  { label: '0–49', min: 0, max: 49, color: 'bg-[#EF4444]' },
];

function normalizeAotyUsername(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, '');
  if (!trimmed) return '';
  const urlMatch = /albumoftheyear\.org\/user\/([a-zA-Z0-9._-]+)/i.exec(trimmed);
  const candidate = urlMatch ? urlMatch[1] : trimmed;
  return /^[a-zA-Z0-9._-]{1,60}$/.test(candidate) ? candidate : '';
}

export function ProfileView({
  profile,
  albums,
  lists,
  activePreview,
  onUpdateProfile,
  onSelectAlbum,
  onPlayPreview,
  onCreateList,
  onUpdateList,
  onDeleteList,
  onExportBackup,
  onImportBackup,
  onClearAll,
}: ProfileViewProps) {
  const [profileTab, setProfileTab] = useState<ProfileSubTab>('overview');
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.displayName);
  const [draftHandle, setDraftHandle] = useState(profile.handle);
  const [draftBio, setDraftBio] = useState(profile.bio);
  const [draftAvatar, setDraftAvatar] = useState(profile.avatarUrl ?? '');
  const [draftAotyUser, setDraftAotyUser] = useState(profile.aotyUsername ?? '');
  const [avatarError, setAvatarError] = useState(false);

  const [aotyInput, setAotyInput] = useState(profile.aotyUsername ?? '');
  const [aotySyncing, setAotySyncing] = useState(false);
  const [aotyPayload, setAotyPayload] = useState<AotyUserProfilePayload | null>(null);
  const [aotyError, setAotyError] = useState<string | null>(null);

  const syncAotyProfile = async (rawUsername: string) => {
    const clean = normalizeAotyUsername(rawUsername);
    if (!clean) {
      setAotyError('Informe um @usuário ou link válido (albumoftheyear.org/user/...).');
      return;
    }

    setAotySyncing(true);
    setAotyError(null);
    onUpdateProfile({ aotyUsername: clean });
    setAotyInput(clean);
    setDraftAotyUser(clean);

    try {
      const resp = await fetch(`/api/aoty/user?username=${encodeURIComponent(clean)}`);
      const payload = (await resp.json()) as AotyUserProfilePayload;
      setAotyPayload(payload);
    } catch {
      setAotyPayload({
        available: false,
        blocked: true,
        username: clean,
        profileUrl: `https://www.albumoftheyear.org/user/${encodeURIComponent(clean)}/`,
        message: 'Não foi possível consultar o servidor agora. Use o link direto abaixo.',
      });
    } finally {
      setAotySyncing(false);
    }
  };

  useEffect(() => {
    setAotyInput(profile.aotyUsername ?? '');
    if (!profile.aotyUsername) {
      setAotyPayload(null);
      setAotyError(null);
      return;
    }

    let cancelled = false;
    const loadExisting = async () => {
      setAotySyncing(true);
      try {
        const resp = await fetch(
          `/api/aoty/user?username=${encodeURIComponent(profile.aotyUsername as string)}`
        );
        const payload = (await resp.json()) as AotyUserProfilePayload;
        if (!cancelled) setAotyPayload(payload);
      } catch {
        if (!cancelled) {
          setAotyPayload({
            available: false,
            blocked: true,
            username: profile.aotyUsername as string,
            profileUrl: `https://www.albumoftheyear.org/user/${encodeURIComponent(
              profile.aotyUsername as string
            )}/`,
            message: 'Use o link direto para abrir seu perfil no Album of the Year.',
          });
        }
      } finally {
        if (!cancelled) setAotySyncing(false);
      }
    };

    void loadExisting();
    return () => {
      cancelled = true;
    };
  }, [profile.aotyUsername]);

  const albumMap = useMemo(() => new Map(albums.map((a) => [a.id, a])), [albums]);

  const favoriteAlbums = useMemo(
    () =>
      albums
        .filter((a) => a.isFavorite)
        .sort((a, b) => (getAlbumEffectiveScore(b) ?? -1) - (getAlbumEffectiveScore(a) ?? -1)),
    [albums]
  );

  const favoriteTracks = useMemo(() => {
    const collected: Array<{
      id: string;
      title: string;
      score: number | null;
      isFavorite: boolean;
      previewUrl?: string;
      albumId: string;
      albumTitle: string;
      artist: string;
      coverUrl: string;
    }> = [];

    albums.forEach((album) => {
      album.tracks.forEach((trk) => {
        if (trk.isFavorite || (typeof trk.score === 'number' && trk.score >= 90)) {
          collected.push({
            id: trk.id,
            title: trk.title,
            score: trk.score,
            isFavorite: trk.isFavorite,
            previewUrl: trk.previewUrl,
            albumId: album.id,
            albumTitle: album.title,
            artist: album.artist,
            coverUrl: album.coverUrl,
          });
        }
      });
    });

    return collected
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return (b.score ?? -1) - (a.score ?? -1);
      })
      .slice(0, 8);
  }, [albums]);

  const favoriteArtists = useMemo(() => {
    const map = new Map<
      string,
      {
        artist: string;
        albumCount: number;
        favoriteCount: number;
        likedCount: number;
        scores: number[];
        coverUrl: string;
      }
    >();

    albums.forEach((album) => {
      const name = album.artist.trim() || 'Artista desconhecido';
      const entry = map.get(name) ?? {
        artist: name,
        albumCount: 0,
        favoriteCount: 0,
        likedCount: 0,
        scores: [],
        coverUrl: album.coverUrl,
      };
      entry.albumCount += 1;
      if (album.isFavorite) entry.favoriteCount += 1;
      if (album.isLiked) entry.likedCount += 1;
      if (!entry.coverUrl && album.coverUrl) entry.coverUrl = album.coverUrl;
      const eff = getAlbumEffectiveScore(album);
      if (eff !== null) entry.scores.push(eff);
      map.set(name, entry);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        avgScore:
          item.scores.length > 0
            ? Math.round(item.scores.reduce((s, v) => s + v, 0) / item.scores.length)
            : null,
      }))
      .sort((a, b) => {
        if (b.favoriteCount !== a.favoriteCount) return b.favoriteCount - a.favoriteCount;
        if (b.likedCount !== a.likedCount) return b.likedCount - a.likedCount;
        if ((b.avgScore ?? -1) !== (a.avgScore ?? -1)) {
          return (b.avgScore ?? -1) - (a.avgScore ?? -1);
        }
        return b.albumCount - a.albumCount;
      })
      .slice(0, 6);
  }, [albums]);

  const statsSummary = useMemo(() => {
    const listenedCount = albums.filter((a) => a.isListened).length;
    const mustHearCount = albums.filter((a) => a.mustHear).length;
    const ratedTracks = albums.reduce(
      (sum, a) => sum + a.tracks.filter((t) => typeof t.score === 'number').length,
      0
    );
    const ratedAlbums = albums
      .map((a) => getAlbumEffectiveScore(a))
      .filter((s): s is number => s !== null);
    const avgScore =
      ratedAlbums.length > 0
        ? Math.round(ratedAlbums.reduce((sum, v) => sum + v, 0) / ratedAlbums.length)
        : null;

    const buckets = MINI_BUCKETS.map((b) => ({
      ...b,
      count: ratedAlbums.filter((s) => s >= b.min && s <= b.max).length,
    }));
    const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

    return { listenedCount, mustHearCount, ratedTracks, avgScore, buckets, maxBucket };
  }, [albums]);

  const handleSaveProfile = (e: FormEvent) => {
    e.preventDefault();
    const cleanHandle = draftHandle.trim().startsWith('@')
      ? draftHandle.trim()
      : draftHandle.trim()
        ? `@${draftHandle.trim()}`
        : '@ouvinte';

    const safeAvatar = draftAvatar.trim() ? sanitizeImageUrl(draftAvatar.trim()) : undefined;
    const cleanAoty = draftAotyUser.trim() ? normalizeAotyUsername(draftAotyUser) : undefined;
    setAvatarError(false);

    onUpdateProfile({
      displayName: draftName.trim() || 'Ouvinte FaixaNota',
      handle: cleanHandle.slice(0, 40),
      bio: draftBio.trim().slice(0, 280),
      avatarUrl: safeAvatar || undefined,
      aotyUsername: cleanAoty,
    });
    setEditing(false);
  };

  const initials = profile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <section className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6 space-y-6">
      {/* Profile Identity Header */}
      <div className="rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {profile.avatarUrl && !avatarError ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover border border-white/[0.15] shrink-0"
              />
            ) : (
              <div className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[#0E1116] font-display text-xl font-bold text-[#60A5FA]">
                {initials || <User className="h-7 w-7" aria-hidden="true" />}
              </div>
            )}

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="font-display text-xl sm:text-2xl font-bold text-white truncate">
                  {profile.displayName}
                </h1>
                <span className="font-mono text-xs text-[#8B949E]">{profile.handle}</span>
                {profile.aotyUsername && (
                  <a
                    href={`https://www.albumoftheyear.org/user/${encodeURIComponent(
                      profile.aotyUsername
                    )}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-[#60A5FA] hover:text-white transition-colors"
                  >
                    <span>AOTY @{profile.aotyUsername}</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
              <p className="text-sm text-[#CBD5E1] leading-relaxed max-w-2xl">
                {profile.bio || 'Adicione uma bio musical contando o que você mais gosta de ouvir.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDraftName(profile.displayName);
              setDraftHandle(profile.handle);
              setDraftBio(profile.bio);
              setDraftAvatar(profile.avatarUrl ?? '');
              setDraftAotyUser(profile.aotyUsername ?? '');
              setEditing((v) => !v);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/[0.12] bg-[#0E1116] px-3.5 py-2 text-xs font-semibold text-[#CBD5E1] hover:border-white/25 hover:text-white transition-colors shrink-0 self-start"
          >
            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{editing ? 'Cancelar' : 'Editar Perfil'}</span>
          </button>
        </div>

        {editing && (
          <form
            onSubmit={handleSaveProfile}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-white/[0.08] pt-4"
          >
            <div>
              <label htmlFor="profile-name" className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Nome de Exibição
              </label>
              <input
                id="profile-name"
                type="text"
                maxLength={60}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="profile-handle" className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Usuário (@)
              </label>
              <input
                id="profile-handle"
                type="text"
                maxLength={40}
                value={draftHandle}
                onChange={(e) => setDraftHandle(e.target.value)}
                className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-sm text-white focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="profile-bio" className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Bio Musical
              </label>
              <textarea
                id="profile-bio"
                rows={2}
                maxLength={280}
                value={draftBio}
                onChange={(e) => setDraftBio(e.target.value)}
                placeholder="Fale sobre seus gêneros, discos marcantes ou critérios de nota..."
                className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label
                  htmlFor="profile-avatar"
                  className="block text-xs font-medium text-[#CBD5E1] mb-1"
                >
                  URL da Foto (opcional)
                </label>
                <input
                  id="profile-avatar"
                  type="url"
                  value={draftAvatar}
                  onChange={(e) => setDraftAvatar(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-aoty"
                  className="block text-xs font-medium text-[#CBD5E1] mb-1"
                >
                  Usuário Público no AOTY (opcional)
                </label>
                <input
                  id="profile-aoty"
                  type="text"
                  maxLength={120}
                  value={draftAotyUser}
                  onChange={(e) => setDraftAotyUser(e.target.value)}
                  placeholder="@seuusuario ou albumoftheyear.org/user/..."
                  className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors shrink-0"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Salvar Perfil</span>
              </button>
            </div>
          </form>
        )}

        {/* Quick Numbers Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-t border-white/[0.08] pt-4">
          <div>
            <p className="text-[11px] text-[#8B949E]">Álbuns Ouvidos</p>
            <p className="font-mono text-xl font-bold tabular-nums text-white">
              {statsSummary.listenedCount}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#8B949E]">Favoritos</p>
            <p className="font-mono text-xl font-bold tabular-nums text-[#FBBF24]">
              {favoriteAlbums.length}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#8B949E]">Must Hear</p>
            <p className="font-mono text-xl font-bold tabular-nums text-[#F59E0B]">
              {statsSummary.mustHearCount}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#8B949E]">Faixas Avaliadas</p>
            <p className="font-mono text-xl font-bold tabular-nums text-white">
              {statsSummary.ratedTracks}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[#8B949E]">Listas Criadas</p>
            <p className="font-mono text-xl font-bold tabular-nums text-[#60A5FA]">
              {lists.length}
            </p>
          </div>
        </div>
      </div>

      {/* Sub-tabs inside Perfil (Visão Geral | Minhas Listas | Estatísticas) */}
      <div
        role="tablist"
        aria-label="Seções do perfil"
        className="inline-flex flex-wrap items-center gap-1 rounded-md border border-white/[0.08] bg-[#161B22] p-1"
      >
        {(
          [
            { id: 'overview', label: 'Visão Geral' },
            { id: 'lists', label: `Minhas Listas (${lists.length})` },
            { id: 'stats', label: 'Estatísticas & Backup' },
          ] as const
        ).map((tab) => {
          const active = profileTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setProfileTab(tab.id)}
              className={`rounded px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                active ? 'bg-[#3B82F6] text-white' : 'text-[#8B949E] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {profileTab === 'lists' ? (
        <ListsView
          embedded
          albums={albums}
          lists={lists}
          onCreateList={onCreateList}
          onUpdateList={onUpdateList}
          onDeleteList={onDeleteList}
          onSelectAlbum={onSelectAlbum}
        />
      ) : profileTab === 'stats' ? (
        <StatsView
          embedded
          albums={albums}
          lists={lists}
          onSelectAlbum={onSelectAlbum}
          onExportBackup={onExportBackup}
          onImportBackup={onImportBackup}
          onClearAll={onClearAll}
        />
      ) : (
        <>
          {/* Vinculação Pública com Album of the Year (AOTY) */}
          <div className="rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
                  <h2 className="font-display text-base font-bold text-white">
                    Perfil no Album of the Year (AOTY)
                  </h2>
                </div>
                <p className="text-xs text-[#8B949E]">
                  Vincule seu @usuário público do AOTY para acessar seu perfil e acompanhar reviews
                  da comunidade nos álbuns e faixas.
                </p>
              </div>

              {profile.aotyUsername && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={aotySyncing}
                    onClick={() => void syncAotyProfile(profile.aotyUsername as string)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:border-[#3B82F6] hover:text-white disabled:opacity-50 transition-colors"
                  >
                    {aotySyncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>Sincronizar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateProfile({ aotyUsername: undefined });
                      setAotyInput('');
                      setAotyPayload(null);
                      setAotyError(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-white/[0.1] bg-[#0E1116] px-2.5 py-1.5 text-xs font-medium text-[#8B949E] hover:border-[#EF4444]/40 hover:text-[#FCA5A5] transition-colors"
                  >
                    <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Desvincular</span>
                  </button>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void syncAotyProfile(aotyInput);
              }}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
            >
              <input
                type="text"
                value={aotyInput}
                onChange={(e) => setAotyInput(e.target.value)}
                placeholder="@seuusuario ou https://www.albumoftheyear.org/user/seuusuario/"
                aria-label="Usuário público ou link do perfil no AOTY"
                className="flex-1 min-w-0 rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-xs sm:text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
              />
              <button
                type="submit"
                disabled={aotySyncing || !aotyInput.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
              >
                {aotySyncing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>{profile.aotyUsername ? 'Atualizar Vínculo' : 'Vincular Perfil AOTY'}</span>
              </button>
            </form>

            {aotyError && <p className="text-xs text-[#FCA5A5]">{aotyError}</p>}

            {profile.aotyUsername && aotyPayload && (
              <div className="rounded-md border border-white/[0.08] bg-[#0E1116] p-4 space-y-4">
                {aotyPayload.available && aotyPayload.profile ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {aotyPayload.profile.avatar ? (
                          <img
                            src={aotyPayload.profile.avatar}
                            alt={aotyPayload.profile.displayName}
                            referrerPolicy="no-referrer"
                            className="h-11 w-11 rounded-full object-cover border border-white/[0.12] shrink-0"
                          />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[#161B22] text-xs font-bold text-[#60A5FA]">
                            {aotyPayload.profile.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-semibold text-white truncate">
                              {aotyPayload.profile.displayName}
                            </span>
                            <span className="font-mono text-xs text-[#8B949E]">
                              @{aotyPayload.profile.username}
                            </span>
                          </div>
                          {aotyPayload.profile.bio && (
                            <p className="text-xs text-[#CBD5E1] line-clamp-2 mt-0.5">
                              {aotyPayload.profile.bio}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {(aotyPayload.profile.avatar || aotyPayload.profile.bio) && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateProfile({
                                avatarUrl: aotyPayload.profile?.avatar || profile.avatarUrl,
                                bio: aotyPayload.profile?.bio || profile.bio,
                              })
                            }
                            className="rounded-md border border-white/[0.12] bg-[#161B22] px-3 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:border-[#3B82F6] hover:text-white transition-colors"
                          >
                            Importar Foto/Bio
                          </button>
                        )}
                        <a
                          href={aotyPayload.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-[#161B22] px-3 py-1.5 text-xs font-semibold text-[#60A5FA] hover:border-[#3B82F6] hover:text-white transition-colors"
                        >
                          <span>Abrir no AOTY</span>
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </div>
                    </div>

                    {aotyPayload.profile.stats && (
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/[0.06] pt-3 text-xs font-mono tabular-nums text-[#8B949E]">
                        {typeof aotyPayload.profile.stats.ratings === 'number' && (
                          <span>
                            <strong className="text-white">
                              {aotyPayload.profile.stats.ratings}
                            </strong>{' '}
                            notas
                          </span>
                        )}
                        {typeof aotyPayload.profile.stats.reviews === 'number' && (
                          <span>
                            <strong className="text-white">
                              {aotyPayload.profile.stats.reviews}
                            </strong>{' '}
                            reviews
                          </span>
                        )}
                        {typeof aotyPayload.profile.stats.lists === 'number' && (
                          <span>
                            <strong className="text-white">
                              {aotyPayload.profile.stats.lists}
                            </strong>{' '}
                            listas
                          </span>
                        )}
                        {typeof aotyPayload.profile.stats.followers === 'number' && (
                          <span>
                            <strong className="text-white">
                              {aotyPayload.profile.stats.followers}
                            </strong>{' '}
                            seguidores
                          </span>
                        )}
                        {typeof aotyPayload.profile.stats.following === 'number' && (
                          <span>
                            <strong className="text-white">
                              {aotyPayload.profile.stats.following}
                            </strong>{' '}
                            seguindo
                          </span>
                        )}
                      </div>
                    )}

                    {aotyPayload.profile.following.length > 0 && (
                      <div className="border-t border-white/[0.06] pt-3 space-y-2">
                        <p className="text-xs font-semibold text-[#CBD5E1]">
                          Seguindo no AOTY ({aotyPayload.profile.following.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {aotyPayload.profile.following.map((person) => (
                            <a
                              key={person.username}
                              href={person.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#161B22] px-2.5 py-1 text-xs text-[#CBD5E1] hover:border-[#3B82F6] hover:text-white transition-colors"
                            >
                              <span>@{person.username}</span>
                              <ExternalLink className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {aotyPayload.profile.recentReviews.length > 0 && (
                      <div className="border-t border-white/[0.06] pt-3 space-y-2.5">
                        <p className="text-xs font-semibold text-[#CBD5E1]">
                          Reviews Recentes de @{aotyPayload.profile.username}
                        </p>
                        <div className="space-y-2">
                          {aotyPayload.profile.recentReviews.slice(0, 4).map((rev, idx) => (
                            <div
                              key={`${rev.album}_${idx}`}
                              className="rounded border border-white/[0.06] bg-[#161B22] p-3 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">
                                    {rev.album}
                                    {rev.artist ? ` · ${rev.artist}` : ''}
                                  </p>
                                  {rev.date && (
                                    <p className="text-[11px] text-[#8B949E]">{rev.date}</p>
                                  )}
                                </div>
                                <ScoreBox score={rev.rating} size="sm" />
                              </div>
                              {rev.text && (
                                <p className="text-xs text-[#CBD5E1] leading-relaxed line-clamp-3">
                                  {rev.text}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-semibold text-white">
                        Conta vinculada:{' '}
                        <span className="font-mono text-[#60A5FA]">@{aotyPayload.username}</span>
                      </p>
                      <p className="text-xs text-[#8B949E] leading-relaxed">
                        {aotyPayload.message ||
                          'Perfil salvo. Use o link direto para visualizar reviews e listas públicas no AOTY.'}
                      </p>
                    </div>
                    <a
                      href={aotyPayload.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#3B82F6]/50 bg-[#3B82F6]/15 px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#3B82F6]/25 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Abrir Perfil no AOTY</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Álbuns Favoritos (Horizontal Showcase) */}
      <div className="space-y-3 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-[#F59E0B]" fill="currentColor" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-white">Álbuns Favoritos</h2>
          </div>
          <span className="font-mono text-xs tabular-nums text-[#8B949E]">
            {favoriteAlbums.length}
          </span>
        </div>

        {favoriteAlbums.length === 0 ? (
          <p className="text-xs text-[#8B949E] py-3">
            Nenhum álbum favoritado ainda. Toque na estrela em qualquer disco do catálogo ou no
            menu Ações.
          </p>
        ) : (
          <div className="flex flex-nowrap gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1">
            {favoriteAlbums.map((album) => {
              const score = getAlbumEffectiveScore(album);
              return (
                <button
                  key={album.id}
                  type="button"
                  onClick={() => onSelectAlbum(album.id)}
                  className="group w-40 sm:w-44 shrink-0 snap-start text-left space-y-2"
                >
                  <div className="relative aspect-square overflow-hidden rounded-md border border-white/[0.08]">
                    <AlbumArtwork
                      coverUrl={album.coverUrl}
                      title={album.title}
                      artist={album.artist}
                      className="h-full w-full transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate group-hover:text-[#3B82F6]">
                        {album.title}
                      </p>
                      <p className="text-[11px] text-[#8B949E] truncate">{album.artist}</p>
                    </div>
                    <ScoreBox score={score} size="sm" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Artistas Preferidos + Faixas Preferidas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-white">Artistas Preferidos</h2>
            <span className="text-xs text-[#8B949E]">Baseado no seu acervo</span>
          </div>

          {favoriteArtists.length === 0 ? (
            <p className="text-xs text-[#8B949E]">
              Adicione e avalie álbuns para destacar seus artistas mais ouvidos.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {favoriteArtists.map((art, idx) => (
                <li
                  key={art.artist}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 font-mono text-xs font-bold tabular-nums text-[#8B949E]">
                      {idx + 1}.
                    </span>
                    <AlbumArtwork
                      coverUrl={art.coverUrl}
                      title={art.artist}
                      artist={art.artist}
                      className="h-10 w-10 rounded-full shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{art.artist}</p>
                      <p className="text-[11px] text-[#8B949E] font-mono tabular-nums">
                        {art.albumCount} {art.albumCount === 1 ? 'álbum' : 'álbuns'}
                        {art.favoriteCount > 0 ? ` · ${art.favoriteCount} fav` : ''}
                      </p>
                    </div>
                  </div>
                  <ScoreBox score={art.avgScore} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-7 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-white">Faixas Preferidas</h2>
            <span className="text-xs text-[#8B949E]">Destaques e notas 90+</span>
          </div>

          {favoriteTracks.length === 0 ? (
            <p className="text-xs text-[#8B949E]">
              Marque a estrela nas suas faixas favoritas ou dê notas 90+ para vê-las aqui.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {favoriteTracks.map((trk) => {
                const isPlayingThis =
                  activePreview?.trackId === trk.id && activePreview.isPlaying;

                return (
                  <li key={trk.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {trk.previewUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            onPlayPreview({
                              id: trk.id,
                              title: trk.title,
                              previewUrl: trk.previewUrl as string,
                              artist: trk.artist,
                              albumTitle: trk.albumTitle,
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
                      ) : (
                        <Star
                          className="h-4 w-4 text-[#F59E0B] shrink-0"
                          fill={trk.isFavorite ? 'currentColor' : 'none'}
                          aria-hidden="true"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectAlbum(trk.albumId)}
                        className="min-w-0 text-left group"
                      >
                        <p className="text-sm font-medium text-white truncate group-hover:text-[#3B82F6]">
                          {trk.title}
                        </p>
                        <p className="text-xs text-[#8B949E] truncate">
                          {trk.artist} · {trk.albumTitle}
                        </p>
                      </button>
                    </div>

                    <ScoreBox score={trk.score} size="sm" />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Minhas Listas + Resumo de Estatísticas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListMusic className="h-4 w-4 text-[#3B82F6]" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-white">Minhas Listas</h2>
            </div>
            <button
              type="button"
              onClick={() => setProfileTab('lists')}
              className="text-xs font-semibold text-[#60A5FA] hover:text-white"
            >
              Gerenciar listas ({lists.length})
            </button>
          </div>

          {lists.length === 0 ? (
            <p className="text-xs text-[#8B949E]">Nenhuma lista criada ainda.</p>
          ) : (
            <div className="space-y-2.5">
              {lists.slice(0, 4).map((list) => {
                const previewCovers = list.items
                  .slice(0, 4)
                  .map((i) => albumMap.get(i.albumId))
                  .filter((a): a is Album => Boolean(a));

                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => setProfileTab('lists')}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-white/[0.08] bg-[#0E1116]/70 p-3 text-left hover:border-white/20 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{list.title}</p>
                      <p className="text-[11px] text-[#8B949E] font-mono tabular-nums">
                        {list.category} · {list.items.length}{' '}
                        {list.items.length === 1 ? 'álbum' : 'álbuns'}
                      </p>
                    </div>
                    <div className="flex items-center -space-x-2 shrink-0">
                      {previewCovers.map((alb) => (
                        <AlbumArtwork
                          key={alb.id}
                          coverUrl={alb.coverUrl}
                          title={alb.title}
                          artist={alb.artist}
                          className="h-9 w-9 rounded-sm ring-2 ring-[#0E1116]"
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#4ADE80]" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-white">
                Resumo de Estatísticas
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setProfileTab('stats')}
              className="text-xs font-semibold text-[#60A5FA] hover:text-white"
            >
              Ver estatísticas completas
            </button>
          </div>

          <div className="flex items-center gap-4 border-b border-white/[0.08] pb-3">
            <div>
              <p className="text-xs text-[#8B949E]">Média Geral</p>
              <p className="font-mono text-2xl font-bold tabular-nums text-white">
                {statsSummary.avgScore ?? '—'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#F59E0B] ml-auto">
              <Award className="h-4 w-4" aria-hidden="true" />
              <span className="font-mono tabular-nums">{statsSummary.mustHearCount}</span>
              <span>Must Hear</span>
            </div>
          </div>

          <div className="space-y-2">
            {statsSummary.buckets.map((bucket) => {
              const pct = Math.round((bucket.count / statsSummary.maxBucket) * 100);
              return (
                <div key={bucket.label} className="flex items-center gap-3">
                  <span className="w-12 font-mono text-[11px] tabular-nums text-[#8B949E]">
                    {bucket.label}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-[#0E1116]">
                    <div
                      className={`h-full rounded-sm ${bucket.color}`}
                      style={{ width: `${bucket.count > 0 ? Math.max(pct, 6) : 0}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-[11px] tabular-nums text-[#CBD5E1]">
                    {bucket.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
        </>
      )}
    </section>
  );
}
