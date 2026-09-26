import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DISCOUNT_CLASSES, FRACTURE_CLASSES, SegmentPiece, TacoSegment,
  coreIntervals, depthToP, makeDepthFn, rqdClass,
} from '../../lib/rqdMath';
import { FRACTURE_COLORS, TACO_STATE_COLORS, paintCoreMask, tacoNumbers, tacoState } from '../../lib/rqdDraw';

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

interface RowSeg { seg: TacoSegment; segIndex: number; piece: SegmentPiece; }

/** Una fila de la caja (aparece una sola vez) con sus tramos taco→taco debajo. */
function RowStrip({ c, row, segs, focusSegment, scrollSegment, onFocus }: {
  c: Ctx; row: number; segs: RowSeg[];
  focusSegment: number | null;      // tramo resaltado
  scrollSegment: number | null;     // tramo pedido desde la tabla / lista → llevarlo a la vista
  onFocus: (i: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const { item } = c;
  const fila = item.result.filas[row];
  const [gx0, gx1] = c.ext;
  const pct = (x: number) => ((x - gx0) / (gx1 - gx0)) * 100;
  const focused = segs.some(r => r.segIndex === focusSegment);
  const startsHere = segs.some(r => r.segIndex === scrollSegment && r.seg.pieces[0].row === row);
  useEffect(() => {
    if (startsHere) wrap.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [startsHere, scrollSegment]);

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
    ctx.restore();
  }, [item, fila, c.showCore, c.showFractures, gx0, gx1]);

  // Regla de profundidad
  const ticks = useMemo(() => {
    const anchors = item.result.validAnchors;
    if (!fila || !anchors) return [];
    const d0 = c.depthAt(row, gx0), d1 = c.depthAt(row, gx1);
    const span = d1 - d0;
    const step = span / c.zoom > 0.6 ? 0.2 : span / c.zoom > 0.25 ? 0.1 : 0.05;
    const out: { x: number; d: number }[] = [];
    for (let d = Math.ceil(d0 / step - 1e-6) * step; d <= d1 + 1e-6; d += step) {
      const p = depthToP(anchors, d);
      const r = Math.floor(p / item.origW);
      if (r !== row) continue;
      out.push({ x: p - r * item.origW, d });
    }
    return out;
  }, [item, fila, row, c.zoom, gx0, gx1, c.depthAt]);

  const pins = item.cajas
    .map((d: any, idx: number) => ({ d, idx }))
    .filter(({ d }: any) => {
      if (d.classId !== 1 || !fila) return false;
      const cy = (d.box[1] + d.box[3]) / 2;
      return cy >= fila.y_min - 10 && cy <= fila.y_max + 10;
    });

  const label = (idx: number | undefined, fallback: string) => (idx === undefined ? fallback : `T${c.nums.get(idx) ?? '?'}`);

  return (
    <div ref={wrap} className={`strip-row ${focused ? 'focused' : ''}`}>
      <div className="strip-bands">
        {segs.map(r => {
          const cls = rqdClass(r.seg.rqdPct);
          const disc = Object.entries(r.seg.discounts).map(([k, v]) => `${k} −${v.toFixed(2)} m`).join(', ');
          return (
            <button
              key={r.segIndex}
              type="button"
              className={`strip-band ${focusSegment === r.segIndex ? 'active' : ''}`}
              style={{ left: `${pct(r.piece.x0)}%`, width: `${pct(r.piece.x1) - pct(r.piece.x0)}%`, borderColor: cls.color, background: `${cls.color}22` }}
              onClick={() => onFocus(r.segIndex)}
              title={`${label(r.seg.startTacoIdx, 'From')} → ${label(r.seg.endTacoIdx, 'To')} · ${r.seg.from.toFixed(2)}–${r.seg.to.toFixed(2)} m · ` +
                `Rec ${r.seg.recM.toFixed(2)} m (${r.seg.recPct.toFixed(1)}%) · RQD ${r.seg.rqdM.toFixed(2)} m (${r.seg.rqdPct.toFixed(1)}%)` +
                (disc ? ` · descuenta ${disc}` : '')}
            >
              <b style={{ color: cls.color }}>RQD {r.seg.rqdPct.toFixed(0)}%</b>
              <span> · Rec {r.seg.recPct.toFixed(0)}% · {label(r.seg.startTacoIdx, 'From')}→{label(r.seg.endTacoIdx, 'To')}</span>
            </button>
          );
        })}
      </div>
      <div className="strip-ticks">
        {ticks.map(t => <span key={t.d.toFixed(3)} style={{ left: `${pct(t.x)}%` }}>{t.d.toFixed(2)}</span>)}
      </div>
      <div className="strip-photo">
        <canvas ref={ref} className="strip-canvas" />
        {segs.slice(1).map(r => (
          <div key={r.segIndex} className="strip-cut" style={{ left: `${pct(r.piece.x0)}%` }} />
        ))}
      </div>
      {pins.length > 0 && (
        <div className="strip-pins">
          {pins.map(({ d, idx }: any) => {
            const x = (d.box[0] + d.box[2]) / 2;
            const info = item.result.tacoInfo?.[idx];
            const st = tacoState(info);
            const px = pct(x);
            // En los bordes el pin se ancla hacia dentro para no cortarse
            const shift = px < 6 ? '0%' : px > 94 ? '-100%' : '-50%';
            return (
              <button key={idx} type="button" className="strip-pin"
                style={{ left: `${px}%`, transform: `translateX(${shift})`, ['--stem' as any]: shift === '0%' ? '1px' : shift === '-100%' ? 'calc(100% - 1px)' : '50%', borderColor: TACO_STATE_COLORS[st], ['--pin' as any]: TACO_STATE_COLORS[st] }}
                onClick={() => c.onEditTaco(idx)} title="Corregir este taco">
                <span className="pin-num" style={{ background: TACO_STATE_COLORS[st] }}>{c.nums.get(idx) ?? '?'}</span>
                {info?.source === 'estimado' ? '~' : ''}{d.ocrValue ?? '?'} m ✎
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StripLog({ item, focusSegment, onEditTaco, showCore, showFractures, onToggle }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [localFocus, setLocalFocus] = useState<number | null>(focusSegment);
  useEffect(() => { setLocalFocus(focusSegment); }, [focusSegment]);
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

    // Igual que la mesa de luz: rueda = zoom centrado en el cursor, arrastrar = mover
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest?.('.strip-top')) return;
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
      const t = e.target as HTMLElement;
      if (e.button !== 0 || t.closest?.('button, input, label, .strip-top')) return;
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
  const byRow: RowSeg[][] = item.result.filas.map(() => []);
  tacoSegments.forEach((seg: TacoSegment, segIndex: number) => seg.pieces.forEach(piece => byRow[piece.row]?.push({ seg, segIndex, piece })));

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
            <span title="Rueda del ratón para acercar · arrastra para moverte">{Math.round(zoom * 100)}%</span>
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
      <div className="strip-rows">
        {byRow.map((segs, row) => (
          <RowStrip key={row} c={c} row={row} segs={segs} focusSegment={localFocus} scrollSegment={focusSegment} onFocus={setLocalFocus} />
        ))}
      </div>
    </div>
  );
}
