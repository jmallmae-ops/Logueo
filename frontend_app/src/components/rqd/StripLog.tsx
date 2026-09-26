import React, { useEffect, useRef } from 'react';
import { DISCOUNT_CLASSES, FRACTURE_CLASSES, SegmentPiece, TacoSegment, coreIntervals, rqdClass } from '../../lib/rqdMath';
import { FRACTURE_COLORS, paintCoreMask, tacoNumbers } from '../../lib/rqdDraw';

interface Props {
  item: any;                                   // ImageItem ya analizado
  focusSegment: number | null;                 // tramo a resaltar/scroll (desde la tabla)
  onEditTaco: (cajaIdx: number) => void;       // abre la lista de tacos en ese taco
}

/** Recorte de la foto con la máscara verde (lo que se mide como testigo). */
function PieceStrip({ item, piece, nums }: { item: any; piece: SegmentPiece; nums: Map<number, number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fila = item.result.filas[piece.row];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !item.origImg || !fila) return;
    const pad = (fila.y_max - fila.y_min) * 0.06;
    const sx = piece.x0, sw = Math.max(1, piece.x1 - piece.x0);
    const sy = Math.max(0, fila.y_min - pad);
    const sh = Math.min(item.origH, fila.y_max + pad) - sy;
    const k = Math.min(1, 1400 / sw);
    canvas.width = Math.round(sw * k);
    canvas.height = Math.round(sh * k);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(item.origImg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(k, k);
    ctx.translate(-sx, -sy);
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();
    const lw = Math.max(2, sw / 350);
    const geom = { scale: item.scale, padX: item.padX, padY: item.padY };

    // Máscara verde del modelo de core + barra con la longitud medida
    const cores = item.cajas.filter((d: any) => {
      if (d.classId !== 0) return false;
      const cy = (d.box[1] + d.box[3]) / 2;
      return cy >= fila.y_min && cy <= fila.y_max && d.box[2] > piece.x0 && d.box[0] < piece.x1;
    });
    cores.forEach((d: any) => paintCoreMask(ctx, item, d, '#00FF00', 110));
    ctx.fillStyle = '#00d000';
    const barH = Math.max(4, (fila.y_max - fila.y_min) * 0.06);
    cores.forEach((d: any) => coreIntervals(d, geom).forEach(([a, b]) => {
      const x0 = Math.max(a, piece.x0), x1 = Math.min(b, piece.x1);
      if (x0 < x1) ctx.fillRect(x0, fila.y_max - barH, x1 - x0, barH);
    }));

    // Fracturas y zonas que descuentan
    item.fracturas.forEach((d: any) => {
      const cy = (d.box[1] + d.box[3]) / 2;
      if (cy < fila.y_min || cy > fila.y_max) return;
      const x0 = Math.max(d.box[0], piece.x0), x1 = Math.min(d.box[2], piece.x1);
      if (x0 >= x1) return;
      const cls = FRACTURE_CLASSES[d.classId];
      if (DISCOUNT_CLASSES.has(cls)) {
        ctx.fillStyle = 'rgba(217,48,37,0.30)';
        ctx.fillRect(x0, d.box[1], x1 - x0, d.box[3] - d.box[1]);
        ctx.strokeStyle = '#d93025';
      } else {
        ctx.strokeStyle = FRACTURE_COLORS[d.classId];
      }
      ctx.lineWidth = lw;
      ctx.strokeRect(x0, d.box[1], x1 - x0, d.box[3] - d.box[1]);
    });

    // Tacos con su número
    const fs = Math.max(14, (fila.y_max - fila.y_min) * 0.28);
    item.cajas.forEach((d: any, idx: number) => {
      if (d.classId !== 1) return;
      const cy = (d.box[1] + d.box[3]) / 2;
      if (cy < fila.y_min - 10 || cy > fila.y_max + 10) return;
      if (d.box[2] < piece.x0 - 5 || d.box[0] > piece.x1 + 5) return;
      ctx.strokeStyle = '#00c8ff';
      ctx.lineWidth = lw * 1.5;
      ctx.strokeRect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]);
      const n = nums.get(idx);
      if (n) {
        ctx.font = `bold ${fs}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = fs / 6;
        ctx.strokeStyle = '#000';
        ctx.strokeText(`T${n}`, (d.box[0] + d.box[2]) / 2, fila.y_min + 2);
        ctx.fillStyle = '#00e5ff';
        ctx.fillText(`T${n}`, (d.box[0] + d.box[2]) / 2, fila.y_min + 2);
      }
    });
    ctx.restore();
  }, [item, piece, fila, nums]);

  const widthPct = ((piece.x1 - piece.x0) / item.origW) * 100;
  const mid = (piece.depth0 + piece.depth1) / 2;
  const discTxt = Object.entries(piece.discounts).map(([k, v]) => `${k} −${v.toFixed(2)} m`).join(' · ');

  return (
    <div className="strip-piece">
      <div className="strip-ruler" style={{ width: `${Math.max(widthPct, 22)}%` }}>
        <span>{piece.depth0.toFixed(2)}</span>
        {widthPct > 30 && <span>{mid.toFixed(2)}</span>}
        <span>{piece.depth1.toFixed(2)}</span>
      </div>
      <canvas ref={ref} className="strip-canvas" style={{ width: `${widthPct}%` }} />
      {discTxt && <div className="strip-piece-meta strip-disc">{discTxt}</div>}
    </div>
  );
}

function SegmentCard({ item, seg, index, focused, nums, onEditTaco }: {
  item: any; seg: TacoSegment; index: number; focused: boolean;
  nums: Map<number, number>; onEditTaco: (idx: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focused]);

  const cls = rqdClass(seg.rqdPct);
  const label = (idx: number | undefined, fallback: string) => (idx === undefined ? fallback : `T${nums.get(idx) ?? '?'}`);
  const discTxt = Object.entries(seg.discounts).map(([k, v]) => `${k} −${v.toFixed(2)} m`).join(' · ');
  const endTaco = seg.endTacoIdx !== undefined ? item.cajas[seg.endTacoIdx] : null;

  return (
    <div ref={ref} className={`strip-segment ${focused ? 'focused' : ''}`}>
      <div className="strip-seg-head">
        <span className="strip-seg-title">
          {label(seg.startTacoIdx, 'From')} → {label(seg.endTacoIdx, 'To')} · {seg.from.toFixed(2)} – {seg.to.toFixed(2)} m
        </span>
        <span className="strip-seg-kpi">
          <b style={{ color: cls.color }}>RQD {seg.rqdPct.toFixed(1)}%</b> · Rec {seg.recPct.toFixed(1)}%
        </span>
      </div>
      <div className="strip-bar" title={`RQD ${seg.rqdM.toFixed(2)} m / Rec ${seg.recM.toFixed(2)} m / ${seg.lengthM.toFixed(2)} m`}>
        <div className="strip-bar-rec" style={{ width: `${Math.min(100, seg.recPct)}%` }} />
        <div className="strip-bar-rqd" style={{ width: `${Math.min(100, (seg.rqdM / seg.lengthM) * 100)}%`, background: cls.color }} />
      </div>
      {seg.pieces.map((p, k) => <PieceStrip key={`${index}-${k}`} item={item} piece={p} nums={nums} />)}
      <div className="strip-seg-foot">
        <span>
          Rec {seg.recM.toFixed(2)} m · RQD {seg.rqdM.toFixed(2)} m
          {discTxt && <span className="strip-disc"> · descuenta {discTxt}</span>}
        </span>
        {endTaco && (
          <button type="button" className="taco-pin" onClick={() => onEditTaco(seg.endTacoIdx!)} title="Corregir este taco">
            T{nums.get(seg.endTacoIdx!)} · {item.result.tacoInfo?.[seg.endTacoIdx!]?.source === 'estimado' ? '~' : ''}{String(endTaco.ocrValue ?? '?')} m ✎
          </button>
        )}
      </div>
    </div>
  );
}

export default function StripLog({ item, focusSegment, onEditTaco }: Props) {
  const nums = React.useMemo(() => (item?.result ? tacoNumbers(item) : new Map<number, number>()), [item]);
  if (!item) return <div className="strip-empty">Selecciona una caja.</div>;
  if (item.status !== 'done' || !item.result?.tacoSegments) {
    return <div className="strip-empty">Analiza la caja para ver el strip log de taco a taco.</div>;
  }
  const { tacoSegments, rejectedTacos } = item.result;

  return (
    <div className="striplog">
      <div className="strip-caption">
        {item.collar || item.name} · {item.fromDepth} – {item.toDepth} m · {tacoSegments.length} tramos
      </div>
      {rejectedTacos.length > 0 && (
        <button type="button" className="strip-rejected" onClick={() => onEditTaco(rejectedTacos[0].tacoIdx)}>
          {rejectedTacos.length} taco(s) sin usar en el cálculo — revisar en la lista de tacos
        </button>
      )}
      {tacoSegments.map((seg: TacoSegment, i: number) => (
        <SegmentCard key={i} item={item} seg={seg} index={i} focused={focusSegment === i} nums={nums} onEditTaco={onEditTaco} />
      ))}
    </div>
  );
}
