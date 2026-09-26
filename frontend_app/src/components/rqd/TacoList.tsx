import React, { useEffect, useRef } from 'react';
import { TACO_STATE_COLORS, tacoState } from '../../lib/rqdDraw';

interface Props {
  item: any;
  focusTaco: number | null;                    // índice en cajas a enfocar
  onChange: (cajaIdx: number, value: string) => void;
  onReset: (cajaIdx: number) => void;          // volver a automático (OCR / estimado)
  onLocate: (cajaIdx: number) => void;         // ver el taco en el strip log
}

function sourceChip(info: any): { txt: string; cls: string } {
  if (!info) return { txt: '—', cls: 'bad' };
  if (!info.usable) return { txt: 'no usado', cls: 'bad' };
  if (info.source === 'manual') return { txt: 'manual', cls: 'manual' };
  if (info.source === 'ocr') return { txt: `OCR ${Math.round(info.note.match(/\((\d+)%\)/)?.[1] ?? 0)}%`, cls: 'ok' };
  return { txt: 'estimado', cls: 'est' };
}

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
      ctx.translate(c.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(item.origImg, x0, y0, w, h, 0, 0, c.height, c.width);
    } else {
      ctx.drawImage(item.origImg, x0, y0, w, h, 0, 0, c.width, c.height);
    }
    ctx.restore();
  }, [item.origImg, det.box]);
  return <canvas ref={ref} className="taco-thumb" />;
}

export default function TacoList({ item, focusTaco, onChange, onReset, onLocate }: Props) {
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

  const infoOf = (idx: number) => item.result.tacoInfo?.[idx];
  const count = (f: (i: any) => boolean) => order.filter(idx => { const i = infoOf(idx); return i && f(i); }).length;
  const nOcr = count(i => i.usable && i.source === 'ocr');
  const nEst = count(i => i.usable && i.source === 'estimado');
  const nMan = count(i => i.usable && i.source === 'manual');
  const bad = count(i => !i.usable);

  return (
    <div className="taco-list">
      <div className="strip-caption">
        {order.length} tacos · From {item.fromDepth} → To {item.toDepth} m
      </div>
      <div className="taco-legend">
        <span className="taco-status ok">OCR {nOcr}</span>
        <span className="taco-status est">estimado {nEst}</span>
        <span className="taco-status manual">manual {nMan}</span>
        {bad > 0 && <span className="taco-status bad">no usado {bad}</span>}
      </div>
      {order.map((idx, i) => {
        const det = item.cajas[idx];
        const info = infoOf(idx);
        const chip = sourceChip(info);
        const val = det.ocrValue === null || det.ocrValue === undefined ? '' : String(det.ocrValue);
        return (
          <div key={idx} className={`taco-row ${chip.cls} ${focusTaco === idx ? 'focused' : ''}`}>
            <div className="taco-row-main">
              <span className="taco-num" style={{ background: TACO_STATE_COLORS[tacoState(info)] }} title="Mismo color que en la foto">{i + 1}</span>
              <TacoThumb item={item} det={det} />
              <input
                ref={el => { inputs.current[idx] = el; }}
                inputMode="decimal"
                className={info?.source === 'estimado' ? 'estimated' : ''}
                value={val}
                placeholder="?"
                onFocus={e => e.target.select()}
                onChange={e => onChange(idx, e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  const next = order[i + 1];
                  if (next !== undefined) { inputs.current[next]?.focus(); inputs.current[next]?.select(); }
                  else (e.target as HTMLInputElement).blur();
                }}
              />
              <span className="taco-unit">m</span>
              <span className={`taco-status ${chip.cls}`}>{chip.txt}</span>
              {det.manual && (
                <button type="button" className="taco-locate" onClick={() => onReset(idx)} title="Volver a automático (OCR / estimado)">↺</button>
              )}
              <button type="button" className="taco-locate" onClick={() => onLocate(idx)} title="Ver en el strip log">⌖</button>
            </div>
            {info && <div className="taco-note">{info.note}</div>}
          </div>
        );
      })}
    </div>
  );
}
