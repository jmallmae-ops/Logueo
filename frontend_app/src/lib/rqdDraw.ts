// Dibujo de la foto anotada de cada caja (mesa de luz).
// Portado del RQD Analyzer compilado.
import { Detection, FRACTURE_CLASSES, depthToP, maskTarget, subtractInterval } from './rqdMath';

export interface DrawLayers {
  showCores: boolean;
  showFractures: boolean;
  showTacos: boolean;
  showRuler: boolean;
  showCsvLog: boolean;
}

export interface CsvLogState {
  csvLogData: Record<string, string>[];
  csvCollarField: string;
  csvFromField: string;
  csvToField: string;
  csvPlotField: string;
  csvColorMap: Record<string, string>;
}

export const CORE_COLORS = ['#00FF00', '#00FFFF'];            // Núcleo, Taco
export const FRACTURE_COLORS = ['#0000FF', '#FF00FF', '#FFA07A', '#FFFF00'];

/** Número (1-based) de cada taco según su posición a lo largo del testigo. */
export function tacoNumbers(item: any): Map<number, number> {
  const m = new Map<number, number>();
  (item.result?.tacoOrder || []).forEach((idx: number, i: number) => m.set(idx, i + 1));
  return m;
}

function tacosInRow(cajas: Detection[], f: { y_min: number; y_max: number }) {
  return cajas.filter(b => {
    const cy = (b.box[1] + b.box[3]) / 2;
    return b.classId === 1 && cy >= f.y_min - 10 && cy <= f.y_max + 10;
  });
}

function rowExtent(f: any, origW: number): [number, number] {
  if (!f.items || f.items.length === 0) return [0, origW];
  let x0 = origW, x1 = 0;
  f.items.forEach((it: any) => { if (it[4][0] < x0) x0 = it[4][0]; if (it[4][2] > x1) x1 = it[4][2]; });
  return [x0, x1];
}

/** Pinta la máscara verde de un núcleo (recortada a su caja) en coordenadas de la foto. */
export function paintCoreMask(octx: CanvasRenderingContext2D, item: any, d: Detection, color = CORE_COLORS[0], alpha = 45) {
  if (!(d.mask && d.rawBox)) return;
  const side = Math.sqrt(d.mask.length);
  const target = maskTarget(d.mask.length);
  const mc = document.createElement('canvas');
  mc.width = side;
  mc.height = side;
  const mctx = mc.getContext('2d')!;
  const data = mctx.createImageData(side, side);
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  for (let k = 0; k < d.mask.length; k++) {
    const v = d.mask[k];
    if (v > 0.1) {
      data.data[k * 4] = r; data.data[k * 4 + 1] = g; data.data[k * 4 + 2] = b;
      data.data[k * 4 + 3] = Math.floor(v * alpha);
    }
  }
  mctx.putImageData(data, 0, 0);
  octx.save();
  octx.beginPath();
  octx.rect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]);
  octx.clip();
  octx.shadowBlur = 1;
  octx.shadowColor = color;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(mc, -item.padX / item.scale, -item.padY / item.scale, target / item.scale, target / item.scale);
  octx.restore();
}

export function drawAnnotatedBox(canvas: HTMLCanvasElement, item: any, layers: DrawLayers, csv: CsvLogState) {
  if (!(item.status === 'done' && item.origImg)) {
    const img = new Image();
    img.src = URL.createObjectURL(item.file);
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
    };
    return;
  }

  const W = item.origW, H = item.origH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;
  ctx.drawImage(item.origImg, 0, 0, W, H);

  const fontPx = Math.max(16, Math.floor(W / 60));
  const lw = Math.max(2, Math.floor(W / 500));
  ctx.lineWidth = lw;
  ctx.font = `bold ${fontPx}px Arial`;

  const outlinedText = (text: string, x: number, y: number, color: string) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = Math.max(2, Math.floor(fontPx / 8));
    ctx.strokeStyle = 'black';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.lineWidth = lw;
  };

  // Capa de overlay (máscaras + fracturas) en un canvas aparte para poder
  // "perforar" los tacos con destination-out.
  const overlay = document.createElement('canvas');
  overlay.width = W;
  overlay.height = H;
  const octx = overlay.getContext('2d')!;

  if (layers.showCores) {
    item.cajas.filter((d: Detection) => d.classId === 0).forEach((d: Detection) => {
      const color = CORE_COLORS[d.classId];
      paintCoreMask(octx, item, d, color);
    });
  }

  if (layers.showFractures) {
    item.fracturas.forEach((d: Detection) => {
      octx.strokeStyle = FRACTURE_COLORS[d.classId];
      octx.lineWidth = lw / 2;
      octx.strokeRect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]);
    });
  }

  const nums = tacoNumbers(item);
  const tacos = item.cajas.filter((d: Detection) => d.classId === 1);
  if (tacos.length > 0 && layers.showTacos) {
    octx.save();
    octx.globalCompositeOperation = 'destination-out';
    tacos.forEach((d: Detection) => octx.fillRect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]));
    octx.restore();
  }
  ctx.drawImage(overlay, 0, 0);

  if (layers.showTacos) {
    item.cajas.forEach((d: Detection) => {
      if (d.classId !== 1) return;
      const color = CORE_COLORS[d.classId];
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.strokeRect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]);

    });
  }
  if (layers.showCores) {
    item.cajas.filter((d: Detection) => d.classId === 0).forEach((d: Detection) => {
      outlinedText(`Nucleo ${d.prob.toFixed(2)}`, (d.box[0] + d.box[2]) / 2, d.box[1] + 5, CORE_COLORS[0]);
    });
  }
  if (layers.showFractures) {
    item.fracturas.forEach((d: Detection) => {
      outlinedText(
        `${FRACTURE_CLASSES[d.classId]} ${d.prob.toFixed(2)}`,
        (d.box[0] + d.box[2]) / 2, (d.box[1] + d.box[3]) / 2, FRACTURE_COLORS[d.classId],
      );
    });
  }

  const result = item.result;

  // ---- Logueo litológico importado por CSV ----
  if (layers.showCsvLog && csv.csvLogData.length > 0 && csv.csvCollarField && csv.csvFromField &&
      csv.csvToField && csv.csvPlotField && result?.validAnchors && result?.filas) {
    const anchors = result.validAnchors;
    const boxFrom = parseFloat(item.fromDepth) || 0;
    const boxTo = parseFloat(item.toDepth) || 0;
    csv.csvLogData.filter(row => row[csv.csvCollarField] === item.collar).forEach(row => {
      const f0 = parseFloat(row[csv.csvFromField]);
      const f1 = parseFloat(row[csv.csvToField]);
      if (isNaN(f0) || isNaN(f1) || f0 > boxTo || f1 < boxFrom) return;
      const d0 = Math.max(f0, boxFrom), d1 = Math.min(f1, boxTo);
      if (d0 >= d1) return;
      const p0 = depthToP(anchors, d0), p1 = depthToP(anchors, d1);
      const r0 = Math.floor(p0 / W), r1 = Math.floor(p1 / W);
      const label = row[csv.csvPlotField];
      const color = csv.csvColorMap[label];
      if (!color) return;
      for (let ri = r0; ri <= r1; ri++) {
        const f = result.filas[ri];
        if (!f || !f.items || f.items.length === 0) continue;
        const [ex0, ex1] = rowExtent(f, W);
        if (ex1 <= ex0) continue;
        const x0 = ri === r0 ? Math.max(ex0, p0 % W) : ex0;
        const x1 = ri === r1 ? Math.min(ex1, p1 % W) : ex1;
        if (x0 >= x1) continue;
        let spans: [number, number][] = [[x0, x1]];
        tacosInRow(item.cajas, f).forEach(t => { spans = subtractInterval(spans, t.box[0], t.box[2]); });
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = color;
        spans.forEach(s => ctx.fillRect(s[0], f.y_min, s[1] - s[0], f.y_max - f.y_min));
        ctx.restore();
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.floor(fontPx * 0.8)}px Arial`;
        ctx.lineWidth = Math.max(2, Math.floor(fontPx / 10));
        ctx.strokeStyle = 'white';
        ctx.strokeText(label, (x0 + x1) / 2, (f.y_min + f.y_max) / 2);
        ctx.fillStyle = 'black';
        ctx.fillText(label, (x0 + x1) / 2, (f.y_min + f.y_max) / 2);
        ctx.restore();
      }
    });
  }

  // ---- Regla de profundidad sobre cada fila ----
  if (layers.showRuler && result?.filas && item.cajas?.length > 0 && result.validAnchors) {
    const anchors = result.validAnchors;
    const tickFont = Math.max(10, Math.floor(fontPx * 0.4));
    const gap = Math.floor(fontPx * 1.5);
    const tickLen = Math.floor(fontPx * 0.25);
    const pad = Math.floor(fontPx * 0.1);
    const depthAt = (row: number, x: number) => {
      const p = row * W + x;
      for (let k = 0; k < anchors.length - 1; k++) {
        const a = anchors[k], b = anchors[k + 1];
        if (p >= a.p && p <= b.p) return a.depth + ((p - a.p) * (b.depth - a.depth)) / (b.p - a.p);
      }
      return parseFloat(item.toDepth);
    };

    result.filas.forEach((f: any, ri: number) => {
      const y = f.y_min - gap * 0.2;
      const [ex0, ex1] = rowExtent(f, W);
      const rowTacos = tacosInRow(item.cajas, f);
      let spans: [number, number][] = [[ex0, ex1]];
      rowTacos.forEach(t => { spans = subtractInterval(spans, t.box[0], t.box[2]); });
      ctx.beginPath();
      spans.forEach(s => { ctx.moveTo(s[0], y); ctx.lineTo(s[1], y); });
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = lw;
      ctx.stroke();

      const dStart = depthAt(ri, ex0), dEnd = depthAt(ri, ex1);
      for (let dm = Math.ceil(dStart * 10) / 10; dm <= dEnd; dm += 0.1) {
        let x = ex0, found = false;
        for (let k = 0; k < anchors.length - 1; k++) {
          const a = anchors[k], b = anchors[k + 1];
          if (dm >= a.depth && dm <= b.depth && a.depth !== b.depth) {
            const p = a.p + ((dm - a.depth) * (b.p - a.p)) / (b.depth - a.depth);
            if (p >= ri * W + ex0 && p <= ri * W + ex1) { x = p - ri * W; found = true; break; }
          }
        }
        if (!found) continue;
        if (rowTacos.some(t => x > t.box[0] && x < t.box[2])) continue;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - tickLen);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.fillStyle = '#00ffff';
        ctx.font = `bold ${tickFont}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(dm.toFixed(2) + 'm', x, y - tickLen - pad);
      }
    });
  }


  // ---- Número de cada taco (encima de todo) ----
  if (layers.showTacos) {
    const R = Math.max(11, Math.round(fontPx * 0.75));
    const valFont = Math.max(12, Math.round(fontPx * 0.7));
    item.cajas.forEach((d: Detection, idx: number) => {
      if (d.classId !== 1) return;
      const color = CORE_COLORS[1];
      const info = item.result?.tacoInfo?.[idx];
      // Número de taco en círculo (azul = OCR/manual, ámbar = estimado, rojo = no usado)
      const n = nums.get(idx);
      const cx = (d.box[0] + d.box[2]) / 2, cy = d.box[1];
      if (n) {
        const fill = !info || !info.usable ? '#d93025' : info.source === 'estimado' ? '#e8a317' : '#1565c0';
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, 2 * Math.PI);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = Math.max(3, R / 6);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(R * (n >= 10 ? 1.0 : 1.25))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), cx, cy + 1);
        ctx.lineWidth = lw;
      }
      const v = d.ocrValue;
      if (v !== undefined && v !== null && v !== '') {
        ctx.font = `bold ${valFont}px Arial`;
        outlinedText(`${info?.source === 'estimado' ? '~' : ''}${v} m`, cx, cy + (n ? R + 3 : 5), color);
        ctx.font = `bold ${fontPx}px Arial`;
      }
    });
  }
}
