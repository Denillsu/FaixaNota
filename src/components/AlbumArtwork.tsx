import { Disc3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { sanitizeImageUrl } from '../utils/scoring';

interface AlbumArtworkProps {
  coverUrl: string;
  title: string;
  artist: string;
  className?: string;
}

export function AlbumArtwork({ coverUrl, title, artist, className = '' }: AlbumArtworkProps) {
  const safeUrl = sanitizeImageUrl(coverUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [safeUrl]);

  if (!safeUrl || failed) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#1C222B] via-[#161B22] to-[#0E1116] border border-white/[0.08] p-4 text-center select-none ${className}`}
        role="img"
        aria-label={`Capa de ${title} por ${artist}`}
      >
        <Disc3 className="h-10 w-10 text-[#64748B] mb-2 shrink-0" aria-hidden="true" />
        <p className="text-xs font-semibold text-[#CBD5E1] line-clamp-2 max-w-[90%]">{title}</p>
        <p className="text-[11px] text-[#8B949E] line-clamp-1 max-w-[90%] mt-0.5">{artist}</p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#161B22] border border-white/[0.08] ${className}`}>
      <img
        src={safeUrl}
        alt={`Capa do álbum ${title} de ${artist}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
