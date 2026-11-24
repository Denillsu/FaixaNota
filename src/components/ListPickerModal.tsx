import { Check, ListMusic, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { Album, CustomList } from '../types/music';
import { AlbumArtwork } from './AlbumArtwork';

interface ListPickerModalProps {
  album: Album | null;
  lists: CustomList[];
  onClose: () => void;
  onToggleAlbumInList: (listId: string, albumId: string) => void;
  onCreateListAndAdd: (input: {
    title: string;
    description: string;
    category: CustomList['category'];
    initialAlbumId: string;
  }) => void;
}

export function ListPickerModal({
  album,
  lists,
  onClose,
  onToggleAlbumInList,
  onCreateListAndAdd,
}: ListPickerModalProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<CustomList['category']>('Geral');

  useEffect(() => {
    if (!album) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [album, onClose]);

  if (!album) return null;

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateListAndAdd({
      title: newTitle.trim(),
      description: '',
      category: newCategory,
      initialAlbumId: album.id,
    });
    setNewTitle('');
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="list-picker-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-white/[0.14] bg-[#161B22] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 id="list-picker-title" className="font-display text-base font-bold text-white">
            Adicionar à Lista
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar seletor de listas"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#8B949E] hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Selected Album Context */}
        <div className="flex items-center gap-3 border-b border-white/[0.08] bg-[#0E1116]/60 px-5 py-3">
          <AlbumArtwork
            coverUrl={album.coverUrl}
            title={album.title}
            artist={album.artist}
            className="h-11 w-11 rounded-sm shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{album.title}</p>
            <p className="text-xs text-[#8B949E] truncate">
              {album.artist} · {album.releaseYear}
            </p>
          </div>
        </div>

        {/* Existing Lists Checklist */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {lists.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/[0.1] bg-[#0E1116]/40 px-4 py-6 text-center">
              <ListMusic className="mx-auto h-6 w-6 text-[#64748B] mb-1.5" aria-hidden="true" />
              <p className="text-xs text-[#8B949E]">
                Você ainda não tem listas. Crie uma logo abaixo para incluir este álbum.
              </p>
            </div>
          ) : (
            lists.map((list) => {
              const isIncluded = list.items.some((i) => i.albumId === album.id);
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => onToggleAlbumInList(list.id, album.id)}
                  aria-pressed={isIncluded}
                  className={`flex w-full items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left transition-colors ${
                    isIncluded
                      ? 'border-[#3B82F6] bg-[#3B82F6]/15'
                      : 'border-white/[0.08] bg-[#0E1116] hover:border-white/[0.2]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{list.title}</p>
                    <p className="text-[11px] text-[#8B949E] font-mono tabular-nums">
                      {list.category} · {list.items.length}{' '}
                      {list.items.length === 1 ? 'álbum' : 'álbuns'}
                    </p>
                  </div>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      isIncluded
                        ? 'border-[#3B82F6] bg-[#3B82F6] text-white'
                        : 'border-white/[0.2] bg-transparent'
                    }`}
                  >
                    {isIncluded && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Inline Create New List & Add */}
        <form
          onSubmit={handleCreateSubmit}
          className="border-t border-white/[0.08] bg-[#0E1116]/80 p-4 space-y-2.5"
        >
          <p className="text-xs font-semibold text-[#CBD5E1]">Criar nova lista e adicionar</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Nome da nova lista..."
              aria-label="Nome da nova lista"
              className="flex-1 rounded-md border border-white/[0.12] bg-[#161B22] px-3 py-1.5 text-xs text-white placeholder-[#64748B] focus:border-[#3B82F6] focus:outline-none"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as CustomList['category'])}
              aria-label="Categoria da nova lista"
              className="rounded-md border border-white/[0.12] bg-[#161B22] px-2.5 py-1.5 text-xs text-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none"
            >
              <option value="Geral">Geral</option>
              <option value="Ano">Ano</option>
              <option value="Gênero">Gênero</option>
            </select>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[#8B949E] hover:text-white"
            >
              Concluir
            </button>
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#3B82F6] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB] disabled:opacity-40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Criar e Adicionar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
