import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DISCOUNT_CLASSES, FRACTURE_CLASSES, SegmentPiece, TacoSegment,
  coreIntervals, depthToP, makeDepthFn, rqdClass,
} from '../../lib/rqdMath';
import { FRACTURE_COLORS, paintCoreMask, tacoNumbers } from '../../lib/rqdDraw';

interface Props {
  item: any;                                   // ImageItem ya analizado
  focusSegment: number | null;                 // tramo a resaltar/scroll (desde la tabla)
  onEditTaco: (cajaIdx: number) => void;       // abre la lista de tacos en ese taco
  showCore: boolean;                           // máscara verde del modelo de core
  showFractures: boolean;
  onToggle: (key: 'stripShowCore' | 'stripShowFractures', value: boolean) => void;
}

interface Ctx {
  item: any;
  nums: Map<number, number>;
  ext: [number, number];                       // extensión X común a todas las filas (px)
  depthAt: (row: number, x: number) => number;
  showCore: boolean;
  showFractures: boolean;
  zoom: number;
  onEditTaco: (idx: number) => void;
}

const ZOOM_MIN = 1, ZOOM_MAX = 8;

/** Una fila completa de la caja; lo que queda fuera del tramo se oscurece. */
function RowStrip({ c, piece }: { c: Ctx; piece: SegmentPiece }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { item } = c;
  const fila = item.result.filas[piece.row];
  const [gx0, gx1] = c.ext;
  const pct = (x: number) => ((x - gx0) / (gx1 - gx0)) * 100;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !item.origImg || !fila) return;
    const pad = (fila.y_max - fila.y_min) * 0.06;
    const sx = gx0, sw = Math.max(1, gx1 - gx0);
    const sy = Math.max(0, fila.y_min - pad);
    const sh = Math.min(item.origH, fila.y_max + pad) - sy;
    const k = Math.min(1, 3000 / sw);                   // resolución suficiente para hacer zoom
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
    const lw = Math.max(2, sw / 500);

    const cores = item.cajas.filter((d: any) => {
      if (d.classId !== 0) return false;
      const cy = (d.box[1] + d.box[3]) / 2;
      return cy >= fila.y_min && cy <= fila.y_max;
    });
    if (c.showCore) {
      const geom = { scale: item.scale, padX: item.padX, padY: item.padY };
      cores.forEach((d: any) => paintCoreMask(ctx, item, d, '#00FF00', 110));
      ctx.fillStyle = '#00d000';
      const barH = Math.max(4, (fila.y_max - fila.y_min) * 0.06);
      cores.forEach((d: any) => coreIntervals(d, geom).forEach(([a, b]) => ctx.fillRect(a, fila.y_max - barH, b - a, barH)));
    }
    if (c.showFractures) {
      item.fracturas.forEach((d: any) => {
        const cy = (d.box[1] + d.box[3]) / 2;
        if (cy < fila.y_min || cy > fila.y_max) return;
        const cls = FRACTURE_CLASSES[d.classId];
        if (DISCOUNT_CLASSES.has(cls)) {
          ctx.fillStyle = 'rgba(217,48,37,0.30)';
          ctx.fillRect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]);
          ctx.strokeStyle = '#d93025';
        } else {
          ctx.strokeStyle = FRACTURE_COLORS[d.classId];
        }
        ctx.lineWidth = lw;
        ctx.strokeRect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]);
      });
    }
    item.cajas.forEach((d: any) => {
      if (d.classId !== 1) return;
      const cy = (d.box[1] + d.box[3]) / 2;
      if (cy < fila.y_min - 10 || cy > fila.y_max + 10) return;
      ctx.strokeStyle = '#00c8ff';
      ctx.lineWidth = lw * 1.5;
      ctx.strokeRect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]);
    });

    // Fuera del tramo: oscurecido; límites del tramo en celeste
    ctx.fillStyle = 'rgba(15,20,25,0.62)';
    if (piece.x0 > sx) ctx.fillRect(sx, sy, piece.x0 - sx, sh);
    if (piece.x1 < sx + sw) ctx.fillRect(piece.x1, sy, sx + sw - piece.x1, sh);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = lw * 1.5;
    [piece.x0, piece.x1].forEach(x => {
      if (x <= sx + 1 || x >= sx + sw - 1) return;
      ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x, sy + sh); ctx.stroke();
    });
    ctx.restore();
  }, [item, piece, fila, c.showCore, c.showFractures, gx0, gx1]);

  // Regla de profundidad sobre la fila completa
  const ticks = useMemo(() => {
    const anchors = item.result.validAnchors;
    if (!fila || !anchors) return [];
    const d0 = c.depthAt(piece.row, gx0), d1 = c.depthAt(piece.row, gx1);
    const span = d1 - d0;
    const step = span / c.zoom > 0.6 ? 0.2 : span / c.zoom > 0.25 ? 0.1 : 0.05;
    const out: { x: number; d: number }[] = [];
    for (let d = Math.ceil(d0 / step - 1e-6) * step; d <= d1 + 1e-6; d += step) {
      const p = depthToP(anchors, d);
      const row = Math.floor(p / item.origW);
      if (row !== piece.row) continue;
      out.push({ x: p - row * item.origW, d });
    }
    return out;
  }, [item, fila, piece.row, c.zoom, gx0, gx1, c.depthAt]);

  // Tacos de esta fila → pines numerados bajo la foto
  const pins = item.cajas
    .map((d: any, idx: number) => ({ d, idx }))
    .filter(({ d }: any) => {
      if (d.classId !== 1 || !fila) return false;
      const cy = (d.box[1] + d.box[3]) / 2;
      return cy >= fila.y_min - 10 && cy <= fila.y_max + 10;
    });

  const discTxt = Object.entries(piece.discounts).map(([k, v]) => `${k} −${v.toFixed(2)} m`).join(' · ');

  return (
    <div className="strip-row">
      <div className="strip-ticks">
        {ticks.map(t => (
          <span key={t.d.toFixed(3)} style={{ left: `${pct(t.x)}%` }}>{t.d.toFixed(2)}</span>
        ))}
      </div>
      <div className="strip-photo">
        <canvas ref={ref} className="strip-canvas" />
      </div>
      {pins.length > 0 && (
        <div className="strip-pins">
          {pins.map(({ d, idx }: any) => {
            const x = (d.box[0] + d.box[2]) / 2;
            const info = item.result.tacoInfo?.[idx];
            const inSeg = d.box[2] >= piece.x0 - 5 && d.box[0] <= piece.x1 + 5;   // incluye los tacos que abren/cierran el tramo
            const cls = !info || !info.usable ? 'bad' : info.source === 'estimado' ? 'est' : 'ok';
            return (
              <button
                key={idx}
                type="button"
                className={`strip-pin ${cls} ${inSeg ? '' : 'dim'}`}
                style={{ left: `${pct(x)}%` }}
                onClick={() => c.onEditTaco(idx)}
                title="Corregir este taco"
              >
                <span className="pin-num">{c.nums.get(idx) ?? '?'}</span>
                {info?.source === 'estimado' ? '~' : ''}{d.ocrValue ?? '?'} m ✎
              </button>
            );
          })}
        </div>
      )}
      {discTxt && <div className="strip-piece-meta strip-disc">descuenta del RQD: {discTxt}</div>}
    </div>
  );
}

function SegmentCard({ c, seg, index, focused }: { c: Ctx; seg: TacoSegment; index: number; focused: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focused]);

  const cls = rqdClass(seg.rqdPct);
  const label = (idx: number | undefined, fallback: string) => (idx === undefined ? fallback : `T${c.nums.get(idx) ?? '?'}`);
  const discTxt = Object.entries(seg.discounts).map(([k, v]) => `${k} −${v.toFixed(2)} m`).join(' · ');

  return (
    <div ref={ref} className={`strip-segment ${focused ? 'focused' : ''}`}>
      <div className="strip-seg-head strip-sticky">
        <span className="strip-seg-title">
          {label(seg.startTacoIdx, 'From')} → {label(seg.endTacoIdx, 'To')} · {seg.from.toFixed(2)} – {seg.to.toFixed(2)} m
        </span>
        <span className="strip-seg-kpi">
          <b style={{ color: cls.color }}>RQD {seg.rqdPct.toFixed(1)}%</b> · Rec {seg.recPct.toFixed(1)}%
        </span>
      </div>
      <div className="strip-bar">
        <div className="strip-bar-rec" style={{ width: `${Math.min(100, seg.recPct)}%` }} />
        <div className="strip-bar-rqd" style={{ width: `${Math.min(100, (seg.rqdM / seg.lengthM) * 100)}%`, background: cls.color }} />
      </div>
      {seg.pieces.map((p, k) => <RowStrip key={`${index}-${k}`} c={c} piece={p} />)}
      <div className="strip-seg-foot strip-sticky">
        <span>
          {seg.lengthM.toFixed(2)} m · Rec {seg.recM.toFixed(2)} m · RQD {seg.rqdM.toFixed(2)} m
          {discTxt && <span className="strip-disc"> · descuenta {discTxt}</span>}
        </span>
      </div>
    </div>
  );
}

export default function StripLog({ item, focusSegment, onEditTaco, showCore, showFractures, onToggle }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewW, setViewW] = useState(400);
  const anchor = useRef<{ mx: number; my: number; ratio: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const nums = useMemo(() => (item?.result ? tacoNumbers(item) : new Map<number, number>()), [item]);
  const ext = useMemo<[number, number]>(() => {
    const filas = item?.result?.filas || [];
    let x0 = Infinity, x1 = -Infinity;
    filas.forEach((f: any) => f.items.forEach((it: any) => { x0 = Math.min(x0, it[4][0]); x1 = Math.max(x1, it[4][2]); }));
    if (!isFinite(x0)) return [0, item?.origW || 1];
    const m = (item.origW || 0) * 0.01;
    return [Math.max(0, x0 - m), Math.min(item.origW, x1 + m)];
  }, [item]);
  const depthAt = useMemo(
    () => (item?.result?.validAnchors ? makeDepthFn(item.result.validAnchors, item.origW, parseFloat(item.toDepth)) : () => 0),
    [item],
  );

  // El contenedor con scroll es el cuerpo del panel (padre de este componente)
  const scroller = () => rootRef.current?.parentElement as HTMLElement | null;

  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth - 20));
    ro.observe(el);
    setViewW(el.clientWidth - 20);

    // Rueda sobre una foto = zoom centrado en el cursor; en el resto = scroll normal
    const onWheel = (e: WheelEvent) => {
      if (!(e.target as HTMLElement).closest?.('.strip-photo')) return;
      e.preventDefault();
      const z1 = zoomRef.current;
      const z2 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z1 * Math.pow(1.0015, -e.deltaY)));
      if (Math.abs(z2 - z1) < 1e-3) return;
      const r = el.getBoundingClientRect();
      anchor.current = { mx: e.clientX - r.left, my: e.clientY - r.top, ratio: z2 / z1 };
      setZoom(z2);
    };
    // Arrastrar una foto = desplazarse
    let drag: { x: number; y: number; l: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !(e.target as HTMLElement).closest?.('.strip-photo')) return;
      drag = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
      el.classList.add('panning');
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      el.scrollLeft = drag.l - (e.clientX - drag.x);
      el.scrollTop = drag.t - (e.clientY - drag.y);
    };
    const onUp = () => { drag = null; el.classList.remove('panning'); };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [item?.id, item?.status]);

  // Mantiene el punto bajo el cursor fijo al cambiar el zoom
  useLayoutEffect(() => {
    const el = scroller();
    const a = anchor.current;
    if (!el || !a) return;
    el.scrollLeft = (el.scrollLeft + a.mx) * a.ratio - a.mx;
    el.scrollTop = (el.scrollTop + a.my) * a.ratio - a.my;
    anchor.current = null;
  }, [zoom]);

  const setZoomCentered = (z: number) => {
    const el = scroller();
    const z2 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    if (el) anchor.current = { mx: el.clientWidth / 2, my: el.clientHeight / 2, ratio: z2 / zoom };
    setZoom(z2);
  };

  if (!item) return <div className="strip-empty">Selecciona una caja.</div>;
  if (item.status !== 'done' || !item.result?.tacoSegments) {
    return <div className="strip-empty">Analiza la caja para ver el strip log de taco a taco.</div>;
  }
  const { tacoSegments, rejectedTacos } = item.result;
  const c: Ctx = { item, nums, ext, depthAt, showCore, showFractures, zoom, onEditTaco };

  return (
    <div ref={rootRef} className="striplog" style={{ width: `${zoom * 100}%`, ['--vw' as any]: `${viewW}px` }}>
      <div className="strip-sticky strip-top">
        <div className="strip-caption">
          {item.collar || item.name} · {item.fromDepth} – {item.toDepth} m · {tacoSegments.length} tramos
        </div>
        <div className="strip-toggles">
          <label><input type="checkbox" checked={showCore} onChange={e => onToggle('stripShowCore', e.target.checked)} /> Núcleo</label>
          <label><input type="checkbox" checked={showFractures} onChange={e => onToggle('stripShowFractures', e.target.checked)} /> Fracturas</label>
          <span className="strip-zoom">
            <button type="button" onClick={() => setZoomCentered(zoom / 1.4)} disabled={zoom <= ZOOM_MIN}>−</button>
            <span title="Rueda del ratón sobre una foto para acercar · arrastra para moverte">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoomCentered(zoom * 1.4)} disabled={zoom >= ZOOM_MAX}>+</button>
            {zoom > 1 && <button type="button" onClick={() => setZoomCentered(1)} title="Restablecer">⟲</button>}
          </span>
        </div>
        {rejectedTacos.length > 0 && (
          <button type="button" className="strip-rejected" onClick={() => onEditTaco(rejectedTacos[0].tacoIdx)}>
            {rejectedTacos.length} taco(s) sin usar en el cálculo — revisar en la lista de tacos
          </button>
        )}
      </div>
      {tacoSegments.map((seg: TacoSegment, i: number) => (
        <SegmentCard key={i} c={c} seg={seg} index={i} focused={focusSegment === i} />
      ))}
    </div>
  );
}
