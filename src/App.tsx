/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddAlbumModal } from './components/AddAlbumModal';
import { AlbumStudioView } from './components/AlbumStudioView';
import { AudioPreviewBar } from './components/AudioPreviewBar';
import { BottomNav } from './components/BottomNav';
import { CatalogView } from './components/CatalogView';
import { Header } from './components/Header';
import { ListPickerModal } from './components/ListPickerModal';
import { ProfileView } from './components/ProfileView';
import { ReviewsView } from './components/ReviewsView';
import { SearchExploreView } from './components/SearchExploreView';
import { WatchlistView } from './components/WatchlistView';
import { useMusicLibrary } from './hooks/useMusicLibrary';
import type { ActiveSection, Album, AudioPreviewState } from './types/music';

export default function App() {
  const library = useMusicLibrary();

  const [activeSection, setActiveSection] = useState<ActiveSection>('catalog');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalInitialQuery, setModalInitialQuery] = useState('');
  const [listPickerAlbumId, setListPickerAlbumId] = useState<string | null>(null);

  // Global 30s audio preview state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [preview, setPreview] = useState<AudioPreviewState | null>(null);

  const selectedAlbum = useMemo(
    () => library.albums.find((a) => a.id === selectedAlbumId) ?? null,
    [library.albums, selectedAlbumId]
  );

  const listPickerAlbum = useMemo(
    () => library.albums.find((a) => a.id === listPickerAlbumId) ?? null,
    [library.albums, listPickerAlbumId]
  );

  const selectedAlbumListCount = useMemo(() => {
    if (!selectedAlbum) return 0;
    return library.lists.filter((l) => l.items.some((i) => i.albumId === selectedAlbum.id)).length;
  }, [library.lists, selectedAlbum]);

  useEffect(() => {
    if (selectedAlbumId && !selectedAlbum) {
      setSelectedAlbumId(null);
    }
  }, [selectedAlbumId, selectedAlbum]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleEnded = () => {
      setPreview((prev) => (prev ? { ...prev, isPlaying: false } : null));
    };

    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
    };
  }, []);

  const handlePlayPreview = useCallback(
    (track: {
      id: string;
      title: string;
      previewUrl: string;
      artist: string;
      albumTitle: string;
    }) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (preview?.trackId === track.id) {
        if (preview.isPlaying) {
          audio.pause();
          setPreview((prev) => (prev ? { ...prev, isPlaying: false } : null));
        } else {
          void audio.play().catch(() => {});
          setPreview((prev) => (prev ? { ...prev, isPlaying: true } : null));
        }
        return;
      }

      audio.pause();
      audio.src = track.previewUrl;
      void audio.play().catch(() => {});
      setPreview({
        trackId: track.id,
        trackTitle: track.title,
        artist: track.artist,
        albumTitle: track.albumTitle,
        previewUrl: track.previewUrl,
        isPlaying: true,
      });
    },
    [preview]
  );

  const handleTogglePreviewPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !preview) return;
    if (preview.isPlaying) {
      audio.pause();
      setPreview((prev) => (prev ? { ...prev, isPlaying: false } : null));
    } else {
      void audio.play().catch(() => {});
      setPreview((prev) => (prev ? { ...prev, isPlaying: true } : null));
    }
  }, [preview]);

  const handleClosePreview = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    setPreview(null);
  }, []);

  const handleNavigate = (section: ActiveSection) => {
    setActiveSection(section);
    setSelectedAlbumId(null);
  };

  const handleOpenAddModal = (initialQuery = '') => {
    setModalInitialQuery(initialQuery);
    setIsAddModalOpen(true);
  };

  const handleImportAlbum = (
    input: Parameters<typeof library.addAlbum>[0],
    options?: { openStudio?: boolean }
  ): Album => {
    const created = library.addAlbum(input);
    if (options?.openStudio !== false) {
      setActiveSection('catalog');
      setSelectedAlbumId(created.id);
    }
    return created;
  };

  const handleEnrichAlbumFromAoty = useCallback(
    async (albumId: string, artist: string, title: string) => {
      try {
        const resp = await fetch(
          `/api/aoty/album?artist=${encodeURIComponent(artist)}&name=${encodeURIComponent(title)}`
        );
        if (!resp.ok) return;
        const data = await resp.json();
        if (data?.found && data?.album?.aotyData) {
          library.attachAotyData(albumId, data.album.aotyData);
        }
      } catch {
        // Silent optional background enrichment
      }
    },
    [library]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0E1116] text-[#F0F4F8] pb-20">
      <Header
        activeSection={activeSection}
        selectedAlbumTitle={selectedAlbum?.title ?? null}
        onNavigate={handleNavigate}
      />

      <main className="flex-1 min-w-0 w-full">
        {selectedAlbum ? (
          <AlbumStudioView
            key={selectedAlbum.id}
            album={selectedAlbum}
            listCount={selectedAlbumListCount}
            activePreview={preview}
            onBack={() => setSelectedAlbumId(null)}
            onUpdateAlbum={library.updateAlbum}
            onAttachAotyData={library.attachAotyData}
            onToggleAlbumStatus={library.toggleAlbumStatus}
            onOpenListPicker={(alb) => setListPickerAlbumId(alb.id)}
            onDeleteAlbum={(id) => {
              library.deleteAlbum(id);
              setSelectedAlbumId(null);
            }}
            onUpdateTrackScore={library.updateTrackScore}
            onToggleTrackFavorite={library.toggleTrackFavorite}
            onReorderTracksRank={library.reorderTracksRank}
            onAddTrack={library.addTrackToAlbum}
            onSetRatingMode={library.setAlbumRatingMode}
            onPlayPreview={handlePlayPreview}
          />
        ) : activeSection === 'catalog' ? (
          <CatalogView
            albums={library.albums}
            lists={library.lists}
            onSelectAlbum={(id) => setSelectedAlbumId(id)}
            onOpenAddModal={handleOpenAddModal}
            onLoadSamplePack={library.loadSamplePack}
            onToggleAlbumStatus={library.toggleAlbumStatus}
            onOpenListPicker={(alb) => setListPickerAlbumId(alb.id)}
          />
        ) : activeSection === 'search' ? (
          <SearchExploreView
            existingAlbums={library.albums}
            activePreview={preview}
            onPlayPreview={handlePlayPreview}
            onImportAlbum={handleImportAlbum}
            onOpenAlbumStudio={(id) => {
              setActiveSection('catalog');
              setSelectedAlbumId(id);
            }}
          />
        ) : activeSection === 'watchlist' ? (
          <WatchlistView
            albums={library.albums}
            lists={library.lists}
            onSelectAlbum={(id) => setSelectedAlbumId(id)}
            onToggleAlbumStatus={library.toggleAlbumStatus}
            onOpenListPicker={(alb) => setListPickerAlbumId(alb.id)}
            onOpenAddModal={() => handleOpenAddModal('')}
            onGoToSearch={() => handleNavigate('search')}
          />
        ) : activeSection === 'reviews' ? (
          <ReviewsView
            albums={library.albums}
            onSelectAlbum={(id) => setSelectedAlbumId(id)}
            onUpdateAlbum={library.updateAlbum}
          />
        ) : (
          <ProfileView
            profile={library.profile}
            albums={library.albums}
            lists={library.lists}
            activePreview={preview}
            onUpdateProfile={library.updateProfile}
            onSelectAlbum={(id) => {
              setActiveSection('catalog');
              setSelectedAlbumId(id);
            }}
            onPlayPreview={handlePlayPreview}
            onCreateList={library.createList}
            onUpdateList={library.updateList}
            onDeleteList={library.deleteList}
            onExportBackup={library.exportBackup}
            onImportBackup={library.importBackup}
            onClearAll={library.clearAllData}
          />
        )}
      </main>

      <footer className="border-t border-white/[0.06] py-5 text-center text-xs text-[#64748B]">
        FaixaNota · Catálogo e ranking pessoal de álbuns e faixas salvo localmente no navegador.
      </footer>

      <BottomNav
        activeSection={activeSection}
        hasSelectedAlbum={Boolean(selectedAlbum)}
        onNavigate={handleNavigate}
        onOpenAddModal={() => handleOpenAddModal('')}
      />

      <AddAlbumModal
        isOpen={isAddModalOpen}
        initialQuery={modalInitialQuery}
        existingAlbums={library.albums}
        lists={library.lists}
        onClose={() => {
          setIsAddModalOpen(false);
          setModalInitialQuery('');
        }}
        onImportAlbum={handleImportAlbum}
        onEnrichAlbumFromAoty={handleEnrichAlbumFromAoty}
        onToggleAlbumStatus={library.toggleAlbumStatus}
        onOpenListPicker={(alb) => setListPickerAlbumId(alb.id)}
        onOpenAlbumStudio={(id) => {
          setActiveSection('catalog');
          setSelectedAlbumId(id);
        }}
      />

      <ListPickerModal
        album={listPickerAlbum}
        lists={library.lists}
        onClose={() => setListPickerAlbumId(null)}
        onToggleAlbumInList={library.toggleAlbumInList}
        onCreateListAndAdd={(input) => library.createList(input)}
      />

      <AudioPreviewBar
        preview={preview}
        onTogglePlay={handleTogglePreviewPlay}
        onClose={handleClosePreview}
      />
    </div>
  );
}
