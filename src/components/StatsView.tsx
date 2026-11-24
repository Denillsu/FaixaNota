import { Download, Star, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Album, CustomList } from '../types/music';
import { getAlbumEffectiveScore, getScoreVisuals, type BackupPayload } from '../utils/scoring';
import { ScoreBox } from './ScoreBox';

interface StatsViewProps {
  albums: Album[];
  lists: CustomList[];
  embedded?: boolean;
  onSelectAlbum: (albumId: string) => void;
  onExportBackup: () => BackupPayload;
  onImportBackup: (raw: unknown) => { ok: boolean; count: number; error?: string };
  onClearAll: () => void;
}

const BUCKETS = [
  { label: '90–100', min: 90, max: 100, color: 'bg-[#22C55E]' },
  { label: '80–89', min: 80, max: 89, color: 'bg-[#4ADE80]' },
  { label: '70–79', min: 70, max: 79, color: 'bg-[#84CC16]' },
  { label: '60–69', min: 60, max: 69, color: 'bg-[#EAB308]' },
  { label: '50–59', min: 50, max: 59, color: 'bg-[#F59E0B]' },
  { label: '0–49', min: 0, max: 49, color: 'bg-[#EF4444]' },
];

export function StatsView({
  albums,
  lists,
  embedded = false,
  onSelectAlbum,
  onExportBackup,
  onImportBackup,
  onClearAll,
}: StatsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [confirmClear, setConfirmClear] = useState(false);

  const albumScores = useMemo(
    () =>
      albums
        .map((a) => ({ album: a, score: getAlbumEffectiveScore(a) }))
        .filter((e): e is { album: Album; score: number } => e.score !== null),
    [albums]
  );

  const histogram = useMemo(() => {
    const counts = BUCKETS.map((b) => ({
      ...b,
      count: albumScores.filter((e) => e.score >= b.min && e.score <= b.max).length,
    }));
    const maxCount = Math.max(1, ...counts.map((c) => c.count));
    return { counts, maxCount };
  }, [albumScores]);

  const topTracks = useMemo(() => {
    const all: Array<{
      id: string;
      title: string;
      score: number;
      isFavorite: boolean;
      albumId: string;
      albumTitle: string;
      artist: string;
    }> = [];

    albums.forEach((album) => {
      album.tracks.forEach((trk) => {
        if (typeof trk.score === 'number') {
          all.push({
            id: trk.id,
            title: trk.title,
            score: trk.score,
            isFavorite: trk.isFavorite,
            albumId: album.id,
            albumTitle: album.title,
            artist: album.artist,
          });
        }
      });
    });

    return all.sort((a, b) => b.score - a.score).slice(0, 10);
  }, [albums]);

  const genreBreakdown = useMemo(() => {
    const map = new Map<string, { totalScore: number; count: number }>();
    albumScores.forEach(({ album, score }) => {
      const g = album.genre || 'Outros';
      const curr = map.get(g) ?? { totalScore: 0, count: 0 };
      map.set(g, { totalScore: curr.totalScore + score, count: curr.count + 1 });
    });

    return Array.from(map.entries())
      .map(([genre, data]) => ({
        genre,
        count: data.count,
        avg: Math.round(data.totalScore / data.count),
      }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count)
      .slice(0, 8);
  }, [albumScores]);

  const handleDownloadJson = () => {
    const payload = onExportBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `faixanota-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupMessage({
      type: 'ok',
      text: `Backup exportado com ${payload.albums.length} álbuns e ${payload.lists.length} listas.`,
    });
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = onImportBackup(parsed);
      if (result.ok) {
        setBackupMessage({
          type: 'ok',
          text: `Backup restaurado: ${result.count} álbuns carregados com sucesso.`,
        });
      } else {
        setBackupMessage({
          type: 'err',
          text: result.error || 'Falha ao importar arquivo.',
        });
      }
    } catch {
      setBackupMessage({
        type: 'err',
        text: 'O arquivo selecionado não é um JSON válido.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const totalRatedTracks = albums.reduce(
    (sum, a) => sum + a.tracks.filter((t) => typeof t.score === 'number').length,
    0
  );

  return (
    <section
      className={
        embedded
          ? 'space-y-6'
          : 'mx-auto max-w-[1280px] px-4 py-6 sm:px-6 space-y-6'
      }
    >
      <div className="border-b border-white/[0.08] pb-4">
        {embedded ? (
          <h2 className="font-display text-lg font-bold text-white">
            Estatísticas & Backup Local
          </h2>
        ) : (
          <h1 className="font-display text-2xl font-bold text-white">
            Estatísticas & Backup Local
          </h1>
        )}
        <p className="text-sm text-[#8B949E]">
          Distribuição das suas notas estilo perfil AOTY, melhores faixas e exportação de dados.
        </p>
      </div>

      {/* Top Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] p-4">
          <p className="text-xs text-[#8B949E]">Álbuns Avaliados</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
            {albumScores.length}
            <span className="text-sm font-normal text-[#8B949E]">/{albums.length}</span>
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] p-4">
          <p className="text-xs text-[#8B949E]">Faixas com Nota</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
            {totalRatedTracks}
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] p-4">
          <p className="text-xs text-[#8B949E]">Listas Criadas</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
            {lists.length}
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-[#161B22] p-4">
          <p className="text-xs text-[#8B949E]">Selos Must Hear</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#F59E0B]">
            {albums.filter((a) => a.mustHear).length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* AOTY Score Distribution Histogram */}
        <div className="lg:col-span-6 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 space-y-4">
          <h2 className="font-display text-base font-bold text-white">
            Distribuição de Notas dos Álbuns
          </h2>

          {albumScores.length === 0 ? (
            <p className="text-sm text-[#8B949E] py-6">
              Avalie pelo menos um álbum para visualizar sua curva de notas.
            </p>
          ) : (
            <div className="space-y-3">
              {histogram.counts.map((bucket) => {
                const widthPct = Math.round((bucket.count / histogram.maxCount) * 100);
                return (
                  <div key={bucket.label} className="flex items-center gap-3">
                    <span className="w-14 font-mono text-xs tabular-nums text-[#CBD5E1] shrink-0">
                      {bucket.label}
                    </span>
                    <div className="flex-1 h-5 rounded-sm bg-[#0E1116] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${bucket.color}`}
                        style={{ width: `${bucket.count > 0 ? Math.max(widthPct, 4) : 0}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-xs font-semibold tabular-nums text-white">
                      {bucket.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Genre Breakdown */}
          {genreBreakdown.length > 0 && (
            <div className="border-t border-white/[0.08] pt-4 space-y-2.5">
              <h3 className="font-display text-sm font-bold text-white">Média por Gênero</h3>
              <div className="divide-y divide-white/[0.06]">
                {genreBreakdown.map((g) => {
                  const visuals = getScoreVisuals(g.avg);
                  return (
                    <div key={g.genre} className="flex items-center justify-between py-2 text-xs">
                      <span className="text-[#CBD5E1]">
                        {g.genre} <span className="text-[#8B949E]">({g.count})</span>
                      </span>
                      <span className={`font-mono font-bold tabular-nums ${visuals.textClass}`}>
                        {g.avg}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Top 10 Tracks Across Collection */}
        <div className="lg:col-span-6 rounded-lg border border-white/[0.08] bg-[#161B22] p-5 space-y-4">
          <h2 className="font-display text-base font-bold text-white">
            Top 10 Melhores Faixas do Acervo
          </h2>

          {topTracks.length === 0 ? (
            <p className="text-sm text-[#8B949E] py-6">
              As faixas avaliadas de todos os seus álbuns aparecerão ranqueadas aqui.
            </p>
          ) : (
            <ol className="divide-y divide-white/[0.06]">
              {topTracks.map((trk, idx) => (
                <li key={trk.id}>
                  <button
                    type="button"
                    onClick={() => onSelectAlbum(trk.albumId)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-white/[0.03] px-2 -mx-2 rounded transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 font-mono text-xs font-bold tabular-nums text-[#8B949E] shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-white truncate">
                            {trk.title}
                          </span>
                          {trk.isFavorite && (
                            <Star
                              className="h-3 w-3 text-[#F59E0B] shrink-0"
                              fill="currentColor"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <p className="text-xs text-[#8B949E] truncate">
                          {trk.artist} · {trk.albumTitle}
                        </p>
                      </div>
                    </div>
                    <ScoreBox score={trk.score} size="sm" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Backup & Storage Governance Panel */}
      <div className="rounded-lg border border-white/[0.08] bg-[#161B22] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-white">
              Backup Local (JSON)
            </h2>
            <p className="text-xs text-[#8B949E]">
              Seus dados ficam salvos no armazenamento local deste navegador. Exporte um arquivo
              JSON regularmente para guardar uma cópia segura.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-2 rounded-md bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2563EB] transition-colors"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Exportar JSON</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-[#0E1116] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1C222B] transition-colors"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>Importar JSON</span>
            </button>

            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] px-3 py-2 text-xs font-medium text-[#8B949E] hover:border-[#EF4444]/40 hover:text-[#F87171] transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Limpar Acervo</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-[#EF4444]/40 bg-[#450A0A]/40 px-3 py-1.5">
                <span className="text-xs text-[#FCA5A5]">Apagar tudo?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setConfirmClear(false);
                    setBackupMessage({ type: 'ok', text: 'Acervo local limpo.' });
                  }}
                  className="rounded bg-[#EF4444] px-2.5 py-1 text-xs font-semibold text-white"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-xs text-[#CBD5E1] px-1"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>

        {backupMessage && (
          <div
            role="status"
            className={`rounded-md border px-4 py-2.5 text-xs font-medium ${
              backupMessage.type === 'ok'
                ? 'border-[#16A34A]/50 bg-[#14532D]/40 text-[#4ADE80]'
                : 'border-[#EF4444]/50 bg-[#450A0A]/40 text-[#FCA5A5]'
            }`}
          >
            {backupMessage.text}
          </div>
        )}
      </div>
    </section>
  );
}
