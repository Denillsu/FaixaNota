import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  ListMusic,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Album, CustomList } from '../types/music';
import { getAlbumEffectiveScore } from '../utils/scoring';
import { AlbumArtwork } from './AlbumArtwork';
import { ScoreBox } from './ScoreBox';

interface ListsViewProps {
  albums: Album[];
  lists: CustomList[];
  embedded?: boolean;
  onCreateList: (input: {
    title: string;
    description: string;
    category: CustomList['category'];
  }) => CustomList;
  onUpdateList: (listId: string, updater: (prev: CustomList) => CustomList) => void;
  onDeleteList: (listId: string) => void;
  onSelectAlbum: (albumId: string) => void;
}

export function ListsView({
  albums,
  lists,
  embedded = false,
  onCreateList,
  onUpdateList,
  onDeleteList,
  onSelectAlbum,
}: ListsViewProps) {
  const [selectedListId, setSelectedListId] = useState<string | null>(lists[0]?.id ?? null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<CustomList['category']>('Ano');

  // Add album to list picker
  const [albumToAddId, setAlbumToAddId] = useState('');

  // Drag state
  const [draggedAlbumId, setDraggedAlbumId] = useState<string | null>(null);
  const [dragOverAlbumId, setDragOverAlbumId] = useState<string | null>(null);

  useEffect(() => {
    if (lists.length === 0) {
      setSelectedListId(null);
    } else if (!selectedListId || !lists.some((l) => l.id === selectedListId)) {
      setSelectedListId(lists[0].id);
    }
  }, [lists, selectedListId]);

  const albumMap = useMemo(() => new Map(albums.map((a) => [a.id, a])), [albums]);

  const activeList = useMemo(
    () => lists.find((l) => l.id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  const availableAlbumsToAdd = useMemo(() => {
    if (!activeList) return [];
    const inList = new Set(activeList.items.map((i) => i.albumId));
    return albums.filter((a) => !inList.has(a.id));
  }, [albums, activeList]);

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const created = onCreateList({
      title: newTitle.trim(),
      description: newDescription.trim(),
      category: newCategory,
    });
    setSelectedListId(created.id);
    setNewTitle('');
    setNewDescription('');
    setShowCreateForm(false);
  };

  const handleAddAlbumToList = () => {
    if (!activeList || !albumToAddId) return;
    onUpdateList(activeList.id, (prev) => {
      if (prev.items.some((i) => i.albumId === albumToAddId)) return prev;
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            albumId: albumToAddId,
            position: prev.items.length + 1,
            commentary: '',
          },
        ],
      };
    });
    setAlbumToAddId('');
  };

  const handleRemoveFromList = (albumId: string) => {
    if (!activeList) return;
    onUpdateList(activeList.id, (prev) => ({
      ...prev,
      items: prev.items
        .filter((i) => i.albumId !== albumId)
        .map((item, idx) => ({ ...item, position: idx + 1 })),
    }));
  };

  const handleMoveItem = (albumId: string, direction: -1 | 1) => {
    if (!activeList) return;
    const idx = activeList.items.findIndex((i) => i.albumId === albumId);
    const nextIdx = idx + direction;
    if (idx === -1 || nextIdx < 0 || nextIdx >= activeList.items.length) return;

    onUpdateList(activeList.id, (prev) => {
      const next = [...prev.items];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      return {
        ...prev,
        items: next.map((item, i) => ({ ...item, position: i + 1 })),
      };
    });
  };

  const handleDropItem = (targetAlbumId: string) => {
    if (!activeList || !draggedAlbumId || draggedAlbumId === targetAlbumId) {
      setDraggedAlbumId(null);
      setDragOverAlbumId(null);
      return;
    }

    onUpdateList(activeList.id, (prev) => {
      const fromIdx = prev.items.findIndex((i) => i.albumId === draggedAlbumId);
      const toIdx = prev.items.findIndex((i) => i.albumId === targetAlbumId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev.items];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return {
        ...prev,
        items: next.map((item, i) => ({ ...item, position: i + 1 })),
      };
    });

    setDraggedAlbumId(null);
    setDragOverAlbumId(null);
  };

  return (
    <section
      className={
        embedded
          ? 'space-y-6'
          : 'mx-auto max-w-[1280px] px-4 py-6 sm:px-6 space-y-6'
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          {embedded ? (
            <h2 className="font-display text-lg font-bold text-white">Listas Personalizadas</h2>
          ) : (
            <h1 className="font-display text-2xl font-bold text-white">Listas Personalizadas</h1>
          )}
          <p className="text-sm text-[#8B949E]">
            Monte rankings temáticos como Top do Ano, Melhores por Gênero ou Essenciais de Vida.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-[#3B82F6] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#2563EB] transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Nova Lista</span>
        </button>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="rounded-lg border border-white/[0.12] bg-[#161B22] p-5 space-y-4"
        >
          <h2 className="font-display text-base font-bold text-white">Criar Nova Lista</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="list-title" className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Nome da Lista *
              </label>
              <input
                id="list-title"
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex.: Melhores Álbuns de 2026"
                className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="list-cat" className="block text-xs font-medium text-[#CBD5E1] mb-1">
                Categoria
              </label>
              <select
                id="list-cat"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as CustomList['category'])}
                className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
              >
                <option value="Ano">Top do Ano</option>
                <option value="Gênero">Por Gênero</option>
                <option value="Geral">Curadoria Geral</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="list-desc" className="block text-xs font-medium text-[#CBD5E1] mb-1">
              Descrição editorial (opcional)
            </label>
            <input
              id="list-desc"
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Critérios ou tema desta seleção..."
              className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-md border border-white/[0.1] px-3.5 py-1.5 text-xs font-medium text-[#CBD5E1] hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#3B82F6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB]"
            >
              Criar Lista
            </button>
          </div>
        </form>
      )}

      {lists.length === 0 ? (
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] px-6 py-14 text-center">
          <ListMusic className="mx-auto h-9 w-9 text-[#64748B] mb-3" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold text-white">
            Nenhuma lista criada ainda
          </h2>
          <p className="mt-1 text-sm text-[#8B949E] max-w-md mx-auto">
            Crie sua primeira lista ranqueada para organizar seus discos favoritos do ano, por
            gênero ou por estado de espírito.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Criar Primeira Lista</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar of Lists */}
          <aside className="lg:col-span-4 space-y-2">
            {lists.map((list) => {
              const isSelected = list.id === activeList?.id;
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setSelectedListId(list.id)}
                  className={`w-full text-left rounded-lg border p-4 transition-colors ${
                    isSelected
                      ? 'border-[#3B82F6] bg-[#1C222B]'
                      : 'border-white/[0.08] bg-[#161B22] hover:border-white/[0.18]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-[#8B949E]">
                    <span>{list.category}</span>
                    <span className="font-mono tabular-nums">{list.items.length} álbuns</span>
                  </div>
                  <h2 className="mt-1 font-display text-base font-bold text-white truncate">
                    {list.title}
                  </h2>
                  {list.description && (
                    <p className="mt-1 text-xs text-[#8B949E] line-clamp-2">{list.description}</p>
                  )}
                </button>
              );
            })}
          </aside>

          {/* Active List Workspace */}
          {activeList && (
            <div className="lg:col-span-8 space-y-4 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
                <div>
                  <p className="text-xs text-[#8B949E]">
                    {activeList.category} · <span className="font-mono tabular-nums">{activeList.items.length}</span> posições
                  </p>
                  <h2 className="font-display text-2xl font-bold text-white mt-0.5">
                    {activeList.title}
                  </h2>
                  {activeList.description && (
                    <p className="mt-1 text-sm text-[#CBD5E1]">{activeList.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteList(activeList.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] px-3 py-1.5 text-xs font-medium text-[#8B949E] hover:border-[#EF4444]/40 hover:text-[#F87171] transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Excluir Lista</span>
                </button>
              </div>

              {/* Add album selector */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <select
                  value={albumToAddId}
                  onChange={(e) => setAlbumToAddId(e.target.value)}
                  aria-label="Selecionar álbum para adicionar à lista"
                  className="flex-1 rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 text-sm text-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none"
                >
                  <option value="">
                    {availableAlbumsToAdd.length > 0
                      ? 'Selecione um álbum do acervo para adicionar...'
                      : albums.length === 0
                        ? 'Adicione álbuns ao catálogo primeiro'
                        : 'Todos os álbuns do acervo já estão nesta lista'}
                  </option>
                  {availableAlbumsToAdd.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} — {a.artist} ({a.releaseYear})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!albumToAddId}
                  onClick={handleAddAlbumToList}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Incluir na Lista</span>
                </button>
              </div>

              {/* Ranked Entries */}
              {activeList.items.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/[0.12] bg-[#0E1116]/50 px-6 py-10 text-center">
                  <p className="text-sm text-[#8B949E]">
                    Esta lista ainda está vazia. Selecione álbuns do seu catálogo acima para começar
                    o ranking.
                  </p>
                </div>
              ) : (
                <ol className="divide-y divide-white/[0.06] border-t border-white/[0.08]">
                  {activeList.items.map((item, idx) => {
                    const album = albumMap.get(item.albumId);
                    if (!album) return null;
                    const score = getAlbumEffectiveScore(album);
                    const isDropTarget =
                      dragOverAlbumId === album.id && draggedAlbumId !== album.id;

                    return (
                      <li
                        key={album.id}
                        draggable
                        onDragStart={() => setDraggedAlbumId(album.id)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverAlbumId !== album.id) setDragOverAlbumId(album.id);
                        }}
                        onDrop={() => handleDropItem(album.id)}
                        onDragEnd={() => {
                          setDraggedAlbumId(null);
                          setDragOverAlbumId(null);
                        }}
                        className={`flex flex-col sm:flex-row sm:items-center gap-4 py-4 transition-colors ${
                          isDropTarget ? 'bg-[#3B82F6]/10' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className="cursor-grab active:cursor-grabbing text-[#64748B] hover:text-white shrink-0"
                            title="Arrastar posição"
                          >
                            <GripVertical className="h-4 w-4" aria-hidden="true" />
                          </span>

                          <span
                            className={`w-8 font-mono text-lg font-bold tabular-nums shrink-0 ${
                              idx === 0
                                ? 'text-[#F59E0B]'
                                : idx < 3
                                  ? 'text-white'
                                  : 'text-[#8B949E]'
                            }`}
                          >
                            #{idx + 1}
                          </span>

                          <button
                            type="button"
                            onClick={() => onSelectAlbum(album.id)}
                            className="shrink-0"
                          >
                            <AlbumArtwork
                              coverUrl={album.coverUrl}
                              title={album.title}
                              artist={album.artist}
                              className="h-14 w-14 rounded-sm"
                            />
                          </button>

                          <div className="min-w-0 flex-1 space-y-1">
                            <button
                              type="button"
                              onClick={() => onSelectAlbum(album.id)}
                              className="text-left block"
                            >
                              <h3 className="font-display text-sm font-bold text-white hover:text-[#3B82F6] truncate transition-colors">
                                {album.title}
                              </h3>
                            </button>
                            <p className="text-xs text-[#8B949E] truncate">
                              {album.artist} · {album.releaseYear} · {album.genre}
                            </p>
                            <input
                              type="text"
                              value={item.commentary}
                              onChange={(e) =>
                                onUpdateList(activeList.id, (prev) => ({
                                  ...prev,
                                  items: prev.items.map((entry) =>
                                    entry.albumId === album.id
                                      ? { ...entry, commentary: e.target.value }
                                      : entry
                                  ),
                                }))
                              }
                              placeholder="Adicionar nota curta sobre a posição na lista..."
                              aria-label={`Comentário para ${album.title}`}
                              className="w-full rounded border border-white/[0.08] bg-[#0E1116] px-2.5 py-1 text-xs text-[#CBD5E1] placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 shrink-0">
                          <ScoreBox score={score} size="sm" />
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveItem(album.id, -1)}
                            aria-label={`Subir ${album.title} na lista`}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-[#0E1116] text-[#CBD5E1] hover:text-white disabled:opacity-25"
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activeList.items.length - 1}
                            onClick={() => handleMoveItem(album.id, 1)}
                            aria-label={`Descer ${album.title} na lista`}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-[#0E1116] text-[#CBD5E1] hover:text-white disabled:opacity-25"
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromList(album.id)}
                            aria-label={`Remover ${album.title} da lista`}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-[#8B949E] hover:bg-white/[0.06] hover:text-[#F87171]"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
