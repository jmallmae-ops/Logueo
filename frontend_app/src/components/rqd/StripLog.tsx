import React, { useEffect, useRef, useState } from 'react';
import { DISCOUNT_CLASSES, FRACTURE_CLASSES, SegmentPiece, TacoSegment, rqdClass } from '../../lib/rqdMath';
import { FRACTURE_COLORS } from '../../lib/rqdDraw';

interface Props {
  item: any;                                   // ImageItem ya analizado
  focusSegment: number | null;                 // tramo a resaltar/scroll (desde la tabla)
  onTacoChange: (cajaIdx: number, value: string) => void;
}

const REASONS: Record<string, string> = {
  sin_lectura: 'sin lectura OCR',
  fuera_de_orden: 'fuera de orden (menor que un taco anterior o mayor que el To)',
  fuera_de_fila: 'fuera de las filas de testigo',
};

/** Recorte de una fila de la foto con las detecciones dibujadas encima. */
function PieceStrip({ item, piece }: { item: any; piece: SegmentPiece }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fila = item.result.filas[piece.row];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !item.origImg || !fila) return;
    const pad = (fila.y_max - fila.y_min) * 0.06;
    const sx = piece.x0, sw = Math.max(1, piece.x1 - piece.x0);
    const sy = Math.max(0, fila.y_min - pad);
    const sh = Math.min(item.origH, fila.y_max + pad) - sy;
    const k = Math.min(1, 1400 / sw);                 // resolución razonable
    canvas.width = Math.round(sw * k);
    canvas.height = Math.round(sh * k);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(item.origImg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(k, k);
    ctx.translate(-sx, -sy);
    const lw = Math.max(2, sw / 350);

    // Intervalos de núcleo
    ctx.strokeStyle = '#00d000';
    ctx.lineWidth = lw;
    fila.finalIntervals.forEach(([a, b]: [number, number]) => {
      const x0 = Math.max(a, piece.x0), x1 = Math.min(b, piece.x1);
      if (x0 < x1) ctx.strokeRect(x0, fila.y_min, x1 - x0, fila.y_max - fila.y_min);
    });

    // Fracturas y zonas que descuentan
    item.fracturas.forEach((d: any) => {
      const cy = (d.box[1] + d.box[3]) / 2;
      if (cy < fila.y_min || cy > fila.y_max) return;
      const x0 = Math.max(d.box[0], piece.x0), x1 = Math.min(d.box[2], piece.x1);
      if (x0 >= x1) return;
      const cls = FRACTURE_CLASSES[d.classId];
      if (DISCOUNT_CLASSES.has(cls)) {
        ctx.fillStyle = 'rgba(217,48,37,0.28)';
        ctx.fillRect(x0, d.box[1], x1 - x0, d.box[3] - d.box[1]);
        ctx.strokeStyle = '#d93025';
      } else {
        ctx.strokeStyle = FRACTURE_COLORS[d.classId];
      }
      ctx.lineWidth = lw;
      ctx.strokeRect(x0, d.box[1], x1 - x0, d.box[3] - d.box[1]);
    });

    // Tacos
    item.cajas.forEach((d: any) => {
      if (d.classId !== 1) return;
      const cy = (d.box[1] + d.box[3]) / 2;
      if (cy < fila.y_min - 10 || cy > fila.y_max + 10) return;
      if (d.box[2] < piece.x0 || d.box[0] > piece.x1) return;
      ctx.strokeStyle = '#00c8ff';
      ctx.lineWidth = lw * 1.5;
      ctx.strokeRect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]);
    });
    ctx.restore();
  }, [item, piece, fila]);

  // Escala horizontal común: el ancho del recorte es proporcional a la caja.
  const widthPct = ((piece.x1 - piece.x0) / item.origW) * 100;
  const mid = (piece.depth0 + piece.depth1) / 2;
  const discTxt = Object.entries(piece.discounts)
    .map(([k, v]) => `${k} −${v.toFixed(2)} m`).join(' · ');

  return (
    <div className="strip-piece">
      <div className="strip-ruler" style={{ width: `${widthPct}%` }}>
        <span>{piece.depth0.toFixed(2)}</span>
        <span>{mid.toFixed(2)}</span>
        <span>{piece.depth1.toFixed(2)}</span>
      </div>
      <canvas ref={ref} className="strip-canvas" style={{ width: `${widthPct}%` }} />
      <div className="strip-piece-meta">
        Fila {piece.row + 1} · Rec {piece.recM.toFixed(2)} m · RQD {piece.rqdM.toFixed(2)} m
        {discTxt && <span className="strip-disc"> · {discTxt}</span>}
      </div>
    </div>
  );
}

/** Pin con la profundidad de un taco. Al tocarlo se abre el editor fijo. */
function TacoPin({ value, onEdit, invalid, active }: { value: string; onEdit: () => void; invalid?: boolean; active?: boolean }) {
  return (
    <button type="button" className={`taco-pin ${invalid ? 'invalid' : ''} ${active ? 'active' : ''}`} onClick={onEdit} title="Corregir profundidad del taco">
      {value === '' ? '?' : value} m ✎
    </button>
  );
}

/**
 * Editor fijo arriba del strip log. Queda montado aunque el tramo que lo abrió
 * desaparezca al recalcular (p. ej. mientras se escribe "7" antes de "78.46").
 */
function TacoEditor({ item, tacoIdx, onChange, onClose }: {
  item: any; tacoIdx: number; onChange: (v: string) => void; onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, [tacoIdx]);
  const taco = item.cajas[tacoIdx];
  if (!taco) return null;
  const n = item.cajas.slice(0, tacoIdx + 1).filter((d: any) => d.classId === 1).length;
  const rejected = item.result.rejectedTacos.find((r: any) => r.tacoIdx === tacoIdx);
  return (
    <div className="taco-editor">
      <span>Taco {n}</span>
      <input
        ref={inputRef}
        inputMode="decimal"
        value={taco.ocrValue === null || taco.ocrValue === undefined ? '' : String(taco.ocrValue)}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') onClose(); }}
      />
      <span>m</span>
      {rejected && <span className="taco-editor-warn">{REASONS[rejected.reason]}</span>}
      <button type="button" onClick={onClose}>Listo</button>
    </div>
  );
}

function SegmentCard({ item, seg, index, focused, editingIdx, onEditTaco }: {
  item: any; seg: TacoSegment; index: number; focused: boolean;
  editingIdx: number | null; onEditTaco: (idx: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focused]);

  const cls = rqdClass(seg.rqdPct);
  const startLabel = seg.startTacoIdx === undefined ? 'From' : 'taco';
  const endLabel = seg.endTacoIdx === undefined ? 'To' : 'taco';
  const discTxt = Object.entries(seg.discounts).map(([k, v]) => `${k} −${v.toFixed(2)} m`).join(' · ');
  const endTaco = seg.endTacoIdx !== undefined ? item.cajas[seg.endTacoIdx] : null;

  return (
    <div ref={ref} className={`strip-segment ${focused ? 'focused' : ''}`}>
      <div className="strip-seg-head">
        <span className="strip-seg-title">
          {startLabel} → {endLabel} · {seg.from.toFixed(2)} – {seg.to.toFixed(2)} m
        </span>
        <span className="strip-seg-kpi">
          <b style={{ color: cls.color }}>RQD {seg.rqdPct.toFixed(1)}%</b> · Rec {seg.recPct.toFixed(1)}%
        </span>
      </div>
      <div className="strip-bar" title={`RQD ${seg.rqdM.toFixed(2)} m / Rec ${seg.recM.toFixed(2)} m / ${seg.lengthM.toFixed(2)} m`}>
        <div className="strip-bar-rec" style={{ width: `${Math.min(100, seg.recPct)}%` }} />
        <div className="strip-bar-rqd" style={{ width: `${Math.min(100, (seg.rqdM / seg.lengthM) * 100)}%`, background: cls.color }} />
      </div>
      {seg.pieces.map((p, k) => <PieceStrip key={`${index}-${k}`} item={item} piece={p} />)}
      <div className="strip-seg-foot">
        <span>{discTxt ? `Descuenta del RQD: ${discTxt}` : `Tramo ${index + 1} · ${seg.lengthM.toFixed(2)} m`}</span>
        {endTaco && (
          <TacoPin
            value={endTaco.ocrValue === null || endTaco.ocrValue === undefined ? '' : String(endTaco.ocrValue)}
            active={editingIdx === seg.endTacoIdx}
            onEdit={() => onEditTaco(seg.endTacoIdx!)}
          />
        )}
      </div>
    </div>
  );
}

export default function StripLog({ item, focusSegment, onTacoChange }: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  useEffect(() => { setEditingIdx(null); }, [item?.id]);
  if (!item) return <div className="strip-empty">Selecciona una caja.</div>;
  if (item.status !== 'done' || !item.result?.tacoSegments) {
    return <div className="strip-empty">Analiza la caja para ver el strip log de taco a taco.</div>;
  }
  const { tacoSegments, rejectedTacos } = item.result;

  return (
    <div className="striplog">
      <div className="strip-caption">
        {item.collar || item.name} · {item.fromDepth} – {item.toDepth} m · {item.result.filas.length} filas · {tacoSegments.length} tramos
      </div>

      {editingIdx !== null && (
        <TacoEditor
          item={item}
          tacoIdx={editingIdx}
          onChange={v => onTacoChange(editingIdx, v)}
          onClose={() => setEditingIdx(null)}
        />
      )}

      {rejectedTacos.length > 0 && (
        <div className="strip-rejected">
          <div className="strip-rejected-title">Tacos no usados en el cálculo — corrígelos aquí:</div>
          {rejectedTacos.map(r => (
            <div key={r.tacoIdx} className="strip-rejected-row">
              <TacoPin value={r.value} invalid active={editingIdx === r.tacoIdx} onEdit={() => setEditingIdx(r.tacoIdx)} />
              <span>{REASONS[r.reason]}</span>
            </div>
          ))}
        </div>
      )}

      {tacoSegments.map((seg: TacoSegment, i: number) => (
        <SegmentCard
          key={i}
          item={item}
          seg={seg}
          index={i}
          focused={focusSegment === i}
          editingIdx={editingIdx}
          onEditTaco={setEditingIdx}
        />
      ))}
    </div>
  );
}
