import { Bookmark, Disc3, MessageSquareText, Plus, Search, User } from 'lucide-react';
import type { ActiveSection } from '../types/music';

interface BottomNavProps {
  activeSection: ActiveSection;
  hasSelectedAlbum: boolean;
  onNavigate: (section: ActiveSection) => void;
  onOpenAddModal: () => void;
}

export function BottomNav({
  activeSection,
  hasSelectedAlbum,
  onNavigate,
  onOpenAddModal,
}: BottomNavProps) {
  const isActive = (section: ActiveSection) => !hasSelectedAlbum && activeSection === section;

  const renderNavButton = (
    section: ActiveSection,
    label: string,
    Icon: typeof Disc3
  ) => {
    const active = isActive(section);
    return (
      <button
        key={section}
        type="button"
        onClick={() => onNavigate(section)}
        aria-label={label}
        title={label}
        aria-current={active ? 'page' : undefined}
        className={`relative flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] ${
          active ? 'text-white' : 'text-[#8B949E] hover:text-white'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">{label}</span>
        {active && (
          <span
            aria-hidden="true"
            className="absolute bottom-1 h-1 w-4 rounded-full bg-[#3B82F6]"
          />
        )}
      </button>
    );
  };

  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.08] bg-[#0E1116]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto grid max-w-2xl grid-cols-[1fr_auto_1fr] items-center px-2 py-1.5">
        <div className="flex items-center justify-around">
          {renderNavButton('catalog', 'Catálogo', Disc3)}
          {renderNavButton('search', 'Pesquisar Álbuns', Search)}
          {renderNavButton('watchlist', 'Quero Ouvir', Bookmark)}
        </div>

        <button
          type="button"
          onClick={onOpenAddModal}
          aria-label="Adicionar Álbum"
          title="Adicionar Álbum"
          className="mx-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#3B82F6] text-white shadow-lg shadow-[#3B82F6]/25 hover:bg-[#2563EB] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
          <span className="sr-only">Adicionar Álbum</span>
        </button>

        <div className="flex items-center justify-around">
          {renderNavButton('reviews', 'Reviews', MessageSquareText)}
          {renderNavButton('profile', 'Perfil', User)}
        </div>
      </div>
    </nav>
  );
}
