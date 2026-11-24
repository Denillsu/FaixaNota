import type { ActiveSection } from '../types/music';

interface HeaderProps {
  activeSection: ActiveSection;
  selectedAlbumTitle?: string | null;
  onNavigate: (section: ActiveSection) => void;
}

const SECTION_TITLES: Record<ActiveSection, string> = {
  catalog: 'Catálogo',
  search: 'Explorar & Pesquisar',
  watchlist: 'Quero Ouvir',
  reviews: 'Reviews',
  profile: 'Perfil',
};

export function Header({ activeSection, selectedAlbumTitle, onNavigate }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0E1116]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => onNavigate('catalog')}
          className="hidden sm:inline-flex font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-[#3B82F6] transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
        >
          FaixaNota
        </button>

        <p className="text-xs font-semibold uppercase tracking-wider text-[#8B949E] truncate sm:ml-auto">
          {selectedAlbumTitle ? selectedAlbumTitle : SECTION_TITLES[activeSection]}
        </p>
      </div>
    </header>
  );
}
