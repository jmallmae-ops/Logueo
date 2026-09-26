import React, { useEffect, useRef } from 'react';
import { parseDepth } from '../../lib/rqdMath';

interface Props {
  item: any;
  focusTaco: number | null;                    // índice en cajas a enfocar
  onChange: (cajaIdx: number, value: string) => void;
  onLocate: (cajaIdx: number) => void;         // ver el taco en el strip log
}

const STATUS: Record<string, { txt: string; cls: string }> = {
  ok: { txt: 'usado', cls: 'ok' },
  sin_lectura: { txt: 'sin lectura', cls: 'bad' },
  fuera_de_orden: { txt: 'fuera de orden', cls: 'bad' },
  fuera_de_fila: { txt: 'fuera del testigo', cls: 'bad' },
};

/** Recorte del taco para reconocer el número escrito. */
function TacoThumb({ item, det }: { item: any; det: any }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !item.origImg) return;
    const [x0, y0, x1, y1] = det.box;
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    // Los tacos suelen estar escritos en vertical: se muestran girados para leerlos.
    const vertical = h > w;
    const k = 44 / (vertical ? w : h);
    c.width = Math.round((vertical ? h : w) * k);
    c.height = 44;
    const ctx = c.getContext('2d')!;
    ctx.save();
    if (vertical) {
      ctx.translate(0, c.height);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(item.origImg, x0, y0, w, h, 0, 0, c.height, c.width);
    } else {
      ctx.drawImage(item.origImg, x0, y0, w, h, 0, 0, c.width, c.height);
    }
    ctx.restore();
  }, [item.origImg, det.box]);
  return <canvas ref={ref} className="taco-thumb" />;
}

export default function TacoList({ item, focusTaco, onChange, onLocate }: Props) {
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    if (focusTaco === null) return;
    const el = inputs.current[focusTaco];
    if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }, [focusTaco]);

  if (!item) return <div className="strip-empty">Selecciona una caja.</div>;
  if (item.status !== 'done' || !item.result) return <div className="strip-empty">Analiza la caja para ver sus tacos.</div>;

  const order: number[] = item.result.tacoOrder || [];
  if (order.length === 0) return <div className="strip-empty">No se detectaron tacos en esta caja.</div>;

  const rejected = new Map<number, string>(item.result.rejectedTacos.map((r: any) => [r.tacoIdx, r.reason]));
  const bad = rejected.size;

  return (
    <div className="taco-list">
      <div className="strip-caption">
        {order.length} tacos · From {item.fromDepth} → To {item.toDepth} m
        {bad > 0 && <span className="taco-list-bad"> · {bad} por corregir</span>}
      </div>
      <div className="taco-list-hint">Escribe la profundidad; el RQD se recalcula al instante. Enter pasa al siguiente.</div>
      {order.map((idx, i) => {
        const det = item.cajas[idx];
        const reason = rejected.get(idx) || 'ok';
        const st = STATUS[reason];
        const val = det.ocrValue === null || det.ocrValue === undefined ? '' : String(det.ocrValue);
        return (
          <div key={idx} className={`taco-row ${st.cls} ${focusTaco === idx ? 'focused' : ''}`}>
            <span className="taco-num">T{i + 1}</span>
            <TacoThumb item={item} det={det} />
            <input
              ref={el => { inputs.current[idx] = el; }}
              inputMode="decimal"
              value={val}
              placeholder="?"
              onChange={e => onChange(idx, e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                const next = order[i + 1];
                if (next !== undefined) { inputs.current[next]?.focus(); inputs.current[next]?.select(); }
                else (e.target as HTMLInputElement).blur();
              }}
            />
            <span className="taco-unit">m</span>
            <span className={`taco-status ${st.cls}`} title={parseDepth(val) === null ? 'Sin valor' : ''}>{st.txt}</span>
            <button type="button" className="taco-locate" onClick={() => onLocate(idx)} title="Ver en el strip log">⌖</button>
          </div>
        );
      })}
    </div>
  );
}
