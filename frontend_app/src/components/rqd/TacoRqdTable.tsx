import React, { useMemo } from 'react';
import { HoleSegment, mergeHoleSegments, rqdClass } from '../../lib/rqdMath';

interface Props {
  images: any[];
  currentImageId: string | null;
  onSelect: (imageId: string, segIndex: number) => void;
}

function downloadCsv(rows: HoleSegment[]) {
  const head = ['Collar', 'Desde (m)', 'Hasta (m)', 'Longitud (m)', 'RQD (%)', 'RQD (m)', 'Recuperacion (%)', 'Recuperacion (m)', 'Imagenes'];
  const body = rows.map(r => [
    r.collar, r.from.toFixed(2), r.to.toFixed(2), (r.to - r.from).toFixed(2),
    r.rqdPct.toFixed(1), r.rqdM.toFixed(2), r.recPct.toFixed(1), r.recM.toFixed(2),
    Array.from(new Set(r.parts.map(p => p.imageName))).join(' | '),
  ]);
  const csv = [head, ...body].map(l => l.map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'RQD_taco_a_taco.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function TacoRqdTable({ images, currentImageId, onSelect }: Props) {
  // Se recalcula con cada cambio de `images` → la tabla es en tiempo real.
  const rows = useMemo(() => mergeHoleSegments(images), [images]);
  const pending = images.filter(i => i.status !== 'done').length;

  if (rows.length === 0) {
    return <div className="strip-empty">Aún no hay cajas analizadas.</div>;
  }

  const byCollar = new Map<string, HoleSegment[]>();
  rows.forEach(r => {
    const k = r.collar || '(sin collar)';
    if (!byCollar.has(k)) byCollar.set(k, []);
    byCollar.get(k)!.push(r);
  });

  return (
    <div className="taco-table-wrap">
      <div className="taco-table-toolbar">
        <span>{rows.length} tramos{pending > 0 ? ` · ${pending} caja(s) sin analizar` : ''}</span>
        <button type="button" className="btn btn-default" onClick={() => downloadCsv(rows)}>⬇ CSV</button>
      </div>

      {Array.from(byCollar.entries()).map(([collar, list]) => {
        const len = list.reduce((s, r) => s + (r.to - r.from), 0);
        const rec = list.reduce((s, r) => s + r.recM, 0);
        const rqd = list.reduce((s, r) => s + r.rqdM, 0);
        const holeRqd = rec > 0 ? (rqd / rec) * 100 : 0;
        const holeRec = len > 0 ? (rec / len) * 100 : 0;
        return (
          <div key={collar} className="taco-table-hole">
            <div className="taco-table-hole-head">
              <b>{collar}</b>
              <span>{list[0].from.toFixed(2)} – {list[list.length - 1].to.toFixed(2)} m</span>
              <span>RQD <b style={{ color: rqdClass(holeRqd).color }}>{holeRqd.toFixed(1)}%</b> · Rec {holeRec.toFixed(1)}%</span>
            </div>
            <table className="taco-table">
              <thead>
                <tr>
                  <th>Desde</th><th>Hasta</th><th>Long.</th><th>Rec %</th><th>RQD %</th><th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const cls = rqdClass(r.rqdPct);
                  const first = r.parts[0];
                  const active = r.parts.some(p => p.imageId === currentImageId);
                  const multi = new Set(r.parts.map(p => p.imageId)).size > 1;
                  return (
                    <tr
                      key={`${first.imageId}-${first.segIndex}-${i}`}
                      className={active ? 'active' : ''}
                      onClick={() => {
                        const inCurrent = r.parts.find(p => p.imageId === currentImageId);
                        const target = inCurrent || first;
                        onSelect(target.imageId, target.segIndex);
                      }}
                      title={`${r.parts.map(p => p.imageName).join(' + ')} · ${cls.label}`}
                    >
                      <td>{r.from.toFixed(2)}</td>
                      <td>{r.to.toFixed(2)}{multi && <span className="taco-table-multi" title="Tramo que cruza cajas">⇅</span>}</td>
                      <td>{(r.to - r.from).toFixed(2)}</td>
                      <td>{r.recPct.toFixed(1)}</td>
                      <td style={{ color: cls.color, fontWeight: 700 }}>{r.rqdPct.toFixed(1)}</td>
                      <td className="taco-table-barcell">
                        <div className="taco-table-bar"><div style={{ width: `${Math.min(100, r.rqdPct)}%`, background: cls.color }} /></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
