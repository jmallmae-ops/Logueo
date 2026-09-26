import React, { useMemo } from 'react';
import { HoleSegment, mergeHoleSegments, rqdClass } from '../../lib/rqdMath';

interface Props {
  images: any[];
  currentImageId: string | null;
  collapsed: boolean;
  height: number;
  onToggle: () => void;
  onSelect: (imageId: string, segIndex: number) => void;
}

// Mismo orden de columnas que el reporte de referencia
export const RESULT_HEADERS = ['Collar', 'Desde (m)', 'Hasta (m)', 'Recuperacion (%)', 'Recuperacion (m)', 'RQD (%)', 'RQD (m)', 'fotografia'];

export function resultRow(r: HoleSegment): string[] {
  return [
    r.collar, r.from.toFixed(2), r.to.toFixed(2),
    r.recPct.toFixed(1), r.recM.toFixed(2), r.rqdPct.toFixed(1), r.rqdM.toFixed(2),
    Array.from(new Set(r.parts.map(p => p.imageName))).join(' | '),
  ];
}

function downloadCsv(rows: HoleSegment[]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [RESULT_HEADERS, ...rows.map(resultRow)].map(l => l.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'RQD_taco_a_taco.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function ResultsTable({ images, currentImageId, collapsed, height, onToggle, onSelect }: Props) {
  // Se recalcula con cada cambio de `images` → tiempo real
  const rows = useMemo(() => mergeHoleSegments(images), [images]);
  const len = rows.reduce((s, r) => s + (r.to - r.from), 0);
  const rec = rows.reduce((s, r) => s + r.recM, 0);
  const rqd = rows.reduce((s, r) => s + r.rqdM, 0);
  const totRec = len > 0 ? (rec / len) * 100 : 0;
  const totRqd = rec > 0 ? (rqd / rec) * 100 : 0;

  return (
    <div className={`results-dock ${collapsed ? 'collapsed' : ''}`} style={collapsed ? undefined : { height }}>
      <div className="results-head">
        <button type="button" className="results-toggle" onClick={onToggle}>{collapsed ? '▲' : '▼'} Resultados taco a taco</button>
        {rows.length > 0 && (
          <span className="results-totals">
            {rows.length} tramos · {len.toFixed(2)} m · Rec <b>{totRec.toFixed(1)}%</b> ({rec.toFixed(2)} m) · RQD{' '}
            <b style={{ color: rqdClass(totRqd).color }}>{totRqd.toFixed(1)}%</b> ({rqd.toFixed(2)} m)
          </span>
        )}
        <button type="button" className="btn btn-default results-csv" disabled={rows.length === 0} onClick={() => downloadCsv(rows)}>⬇ CSV</button>
      </div>
      {!collapsed && (
        <div className="results-body">
          {rows.length === 0 ? (
            <div className="strip-empty">Analiza las cajas para ver los resultados.</div>
          ) : (
            <table className="results-table">
              <thead>
                <tr>{RESULT_HEADERS.map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cells = resultRow(r);
                  const active = r.parts.some(p => p.imageId === currentImageId);
                  return (
                    <tr key={i} className={active ? 'active' : ''} onClick={() => {
                      const target = r.parts.find(p => p.imageId === currentImageId) || r.parts[0];
                      onSelect(target.imageId, target.segIndex);
                    }}>
                      {cells.map((c, j) => (
                        <td key={j} style={j === 5 ? { color: rqdClass(r.rqdPct).color, fontWeight: 700 } : undefined}>{c}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
