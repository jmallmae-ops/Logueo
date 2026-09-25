// Cálculo de Recovery y RQD — lógica pura (sin React ni canvas).
// Portado del RQD Analyzer compilado (antes solo existía como bundle en
// public/RQD_Analyzer_Web_Ready). Mantiene exactamente las mismas reglas:
//   - Filas = agrupación vertical de detecciones "Núcleo" (classId 0).
//   - Anclas de profundidad = From de la caja, bordes izq/der de cada taco
//     leído por OCR y To de la caja; se interpola linealmente entre anclas.
//   - Panizo / Zona Fracturada / Zona Plástica descuentan longitud.
//   - Fracturas cortan los intervalos de núcleo; solo trozos >= 0.10 m suman RQD.

export type Box = [number, number, number, number];

export interface Detection {
  classId: number;
  prob: number;
  box: Box;
  mask?: any;
  rawBox?: any;
  ocrValue?: string | number | null;
}

export interface Fila {
  num: number;
  items: [number, number, number, number, Box][];
  finalIntervals: [number, number][];
  y_min: number;
  y_max: number;
  suma?: number;
}

export interface Anchor {
  p: number;          // posición lineal = fila * origW + x
  depth: number;
  tacoIdx?: number;   // índice en `cajas` del taco que originó el ancla
}

export interface SegmentPiece {
  row: number;        // índice de fila (0-based)
  x0: number;         // px en la foto original
  x1: number;
  depth0: number;
  depth1: number;
  recM: number;
  rqdM: number;
  discounts: Record<string, number>;
}

export interface TacoSegment {
  from: number;
  to: number;
  lengthM: number;
  recM: number;
  rqdM: number;
  recPct: number;
  rqdPct: number;
  kind: 'TACO' | 'BOUNDARY';   // BOUNDARY = termina en el To de la caja
  startTacoIdx?: number;
  endTacoIdx?: number;
  pieces: SegmentPiece[];
  discounts: Record<string, number>;
}

export interface RejectedTaco {
  tacoIdx: number;
  value: string;
  reason: 'sin_lectura' | 'fuera_de_orden' | 'fuera_de_fila';
}

export interface RqdResult {
  longitud_total_m: string;
  recuperado_total_m: string;
  recuperacion_pct: string;
  rqd_total_m: string;
  rqd_pct: string;
  filas: Fila[];
  validAnchors: Anchor[];
  fracturas_report: string[][];
  tacoSegments: TacoSegment[];
  rejectedTacos: RejectedTaco[];
}

export interface ComputeInput {
  collar: string;
  name: string;
  fromDepth: string;
  toDepth: string;
  origW: number;
  cajas: Detection[];
  fracturas: Detection[];
}

export interface ComputeOutput {
  result: RqdResult;
  warnings: string[];
  cajas: Detection[];
  csvRow: string[];
  csvDataTacos: string[][];
}

export const FRACTURE_CLASSES = ['Fractura', 'Panizo', 'Zona Fracturada', 'Zona Plastica'];
export const DISCOUNT_CLASSES = new Set(['Panizo', 'Zona Fracturada', 'Zona Plastica']);
export const MIN_PIECE_M = 0.1;
const ROW_TOLERANCE_PX = 10;

export function parseDepth(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Resta el intervalo [a, b] de cada intervalo de la lista. */
export function subtractInterval(list: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const g of list) {
    if (a > g[0] && b < g[1]) {
      out.push([g[0], a], [b, g[1]]);
    } else if (a <= g[0] && b >= g[0] && b < g[1]) {
      out.push([b, g[1]]);
    } else if (a > g[0] && a <= g[1] && b >= g[1]) {
      out.push([g[0], a]);
    } else if (!(a <= g[0] && b >= g[1])) {
      out.push(g);
    }
  }
  return out;
}

export function groupRows(cajas: Detection[]): Fila[] {
  const cores = cajas
    .filter(d => d.classId === 0)
    .map(d => ({
      ...d,
      centerY: (d.box[1] + d.box[3]) / 2,
      centerX: (d.box[0] + d.box[2]) / 2,
      height: d.box[3] - d.box[1],
    }))
    .sort((a, b) => a.centerY - b.centerY);

  const filas: Fila[] = [];
  if (cores.length === 0) return filas;

  const close = (group: typeof cores) => {
    group.sort((a, b) => a.centerX - b.centerX);
    const raw = group.map(d => [d.box[0], d.box[2]] as [number, number]).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    let cur = [...raw[0]] as [number, number];
    for (let i = 1; i < raw.length; i++) {
      if (raw[i][0] <= cur[1]) cur[1] = Math.max(cur[1], raw[i][1]);
      else { merged.push(cur); cur = [...raw[i]] as [number, number]; }
    }
    merged.push(cur);
    filas.push({
      items: group.map(d => [d.box[1], d.box[3], 0, d.prob, d.box]),
      finalIntervals: merged,
      num: filas.length + 1,
      y_min: Math.min(...group.map(d => d.box[1])),
      y_max: Math.max(...group.map(d => d.box[3])),
    });
  };

  let group = [cores[0]];
  for (let i = 1; i < cores.length; i++) {
    const last = group[group.length - 1];
    const cur = cores[i];
    const tol = (last.height + cur.height) * 0.2;
    if (Math.abs(cur.centerY - last.centerY) < tol) group.push(cur);
    else { close(group); group = [cur]; }
  }
  close(group);
  return filas;
}

export function rowOfY(filas: Fila[], y: number): number {
  return filas.findIndex(f => y >= f.y_min - ROW_TOLERANCE_PX && y <= f.y_max + ROW_TOLERANCE_PX);
}

export function makeDepthFn(anchors: Anchor[], origW: number, toDepth: number) {
  return (row: number, x: number): number => {
    const p = row * origW + x;
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      if (p >= a.p && p <= b.p) return a.depth + ((p - a.p) * (b.depth - a.depth)) / (b.p - a.p);
    }
    return toDepth;
  };
}

/** Profundidad → posición lineal (inversa de makeDepthFn). */
export function depthToP(anchors: Anchor[], depth: number): number {
  if (anchors.length === 0) return 0;
  if (depth <= anchors[0].depth) return anchors[0].p;
  if (depth >= anchors[anchors.length - 1].depth) return anchors[anchors.length - 1].p;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (depth >= a.depth && depth <= b.depth) {
      return b.depth === a.depth ? a.p : a.p + ((depth - a.depth) * (b.p - a.p)) / (b.depth - a.depth);
    }
  }
  return 0;
}

const fracturesInRow = (fracturas: Detection[], f: Fila) =>
  fracturas
    .map(d => ({ ...d, classStr: FRACTURE_CLASSES[d.classId] }))
    .filter(d => {
      const cy = (d.box[1] + d.box[3]) / 2;
      return cy >= f.y_min && cy <= f.y_max;
    });

/**
 * Calcula Recovery/RQD de una caja. Es barato (solo aritmética), así que se
 * puede llamar en cada edición para tener el strip log en tiempo real.
 *
 * `initial` = true solo tras la inferencia: descarta tacos fuera de filas y
 * rellena por interpolación los tacos sin lectura OCR. En las ediciones del
 * usuario NO se rellena, para no pisar un campo que el usuario está vaciando.
 */
export function computeRqd(input: ComputeInput, initial = false): ComputeOutput {
  const { cajas, fracturas, origW } = input;
  const from = parseFloat(input.fromDepth);
  const to = parseFloat(input.toDepth);
  const nominal = to - from;
  const warnings: string[] = [];

  const filas = groupRows(cajas);

  // ---- Anclas de profundidad ----
  const anchors: Anchor[] = [{ p: 0, depth: from }];
  cajas.forEach((d, idx) => {
    if (d.classId !== 1) return;
    const val = parseDepth(d.ocrValue);
    if (val === null) return;
    const row = rowOfY(filas, (d.box[1] + d.box[3]) / 2);
    if (row === -1) return;
    anchors.push({ p: row * origW + d.box[0], depth: val, tacoIdx: idx });
    anchors.push({ p: row * origW + d.box[2], depth: val, tacoIdx: idx });
  });
  anchors.push({ p: filas.length * origW, depth: to });
  anchors.sort((a, b) => a.p - b.p);
  const valid: Anchor[] = [anchors[0]];
  for (let i = 1; i < anchors.length; i++) {
    const last = valid[valid.length - 1];
    if (anchors[i].depth >= last.depth && anchors[i].p > last.p) valid.push(anchors[i]);
  }
  const depthAt = makeDepthFn(valid, origW, to);

  // ---- Tacos descartados (para corregirlos en el strip log) ----
  const usedTacos = new Set(valid.filter(a => a.tacoIdx !== undefined).map(a => a.tacoIdx));
  const rejectedTacos: RejectedTaco[] = [];
  cajas.forEach((d, idx) => {
    if (d.classId !== 1 || usedTacos.has(idx)) return;
    const row = rowOfY(filas, (d.box[1] + d.box[3]) / 2);
    const val = parseDepth(d.ocrValue);
    rejectedTacos.push({
      tacoIdx: idx,
      value: d.ocrValue === null || d.ocrValue === undefined ? '' : String(d.ocrValue),
      reason: row === -1 ? 'fuera_de_fila' : val === null ? 'sin_lectura' : 'fuera_de_orden',
    });
  });

  // ---- Totales por fila ----
  let recTotal = 0, rqdTotal = 0;
  const fracturasReport: string[][] = [];
  filas.forEach((f, L) => {
    const recRaw = f.finalIntervals.reduce((s, iv) => s + (depthAt(L, iv[1]) - depthAt(L, iv[0])), 0);
    const inRow = fracturesInRow(fracturas, f);
    inRow.forEach(fr => {
      fracturasReport.push([
        input.collar, input.name, fr.classStr, fr.prob.toFixed(2),
        depthAt(L, fr.box[0]).toFixed(2), depthAt(L, fr.box[2]).toFixed(2),
      ]);
    });
    let discount = 0;
    let pieces = [...f.finalIntervals] as [number, number][];
    inRow.forEach(fr => {
      if (DISCOUNT_CLASSES.has(fr.classStr)) discount += depthAt(L, fr.box[2]) - depthAt(L, fr.box[0]);
      else pieces = subtractInterval(pieces, fr.box[0], fr.box[2]);
    });
    const sound = pieces.reduce((s, iv) => {
      const len = depthAt(L, iv[1]) - depthAt(L, iv[0]);
      return len >= MIN_PIECE_M ? s + len : s;
    }, 0);
    const rowNominal = depthAt(L, origW) - depthAt(L, 0);
    let rec = recRaw - discount;
    if (rec > rowNominal) { rec = rowNominal; warnings.push(`Recovery topada al 100% en fila ${f.num}`); }
    let rqd = Math.max(0, sound - discount);
    if (rqd > rec) { rqd = rec; warnings.push(`RQD topado a Recovery en fila ${f.num}`); }
    recTotal += rec;
    rqdTotal += rqd;
    f.suma = rec;
  });

  const recPct = nominal > 0 ? (recTotal / nominal) * 100 : 0;
  const rqdPct = recTotal > 0 ? (rqdTotal / recTotal) * 100 : 0;

  // ---- Tramos taco → taco ----
  const tacoSegments: TacoSegment[] = [];
  for (let s = 0; s < valid.length - 1; s++) {
    const A = valid[s], B = valid[s + 1];
    const len = B.depth - A.depth;
    if (len <= 0) continue;
    let segRec = 0, segRqd = 0;
    const segDisc: Record<string, number> = {};
    const segPieces: SegmentPiece[] = [];

    filas.forEach((f, I) => {
      const G = I * origW, xe = (I + 1) * origW;
      if (B.p <= G || A.p >= xe) return;
      const ie = Math.max(0, A.p - G);
      const re = Math.min(origW, B.p - G);
      if (ie >= re) return;

      const core = f.finalIntervals.reduce((acc, iv) => {
        const a = Math.max(ie, iv[0]), b = Math.min(re, iv[1]);
        return a < b ? acc + (depthAt(I, b) - depthAt(I, a)) : acc;
      }, 0);

      let disc = 0;
      const pieceDisc: Record<string, number> = {};
      const cuts: [number, number][] = [];
      fracturesInRow(fracturas, f).forEach(fr => {
        const a = Math.max(ie, fr.box[0]), b = Math.min(re, fr.box[2]);
        if (a >= b) return;
        if (DISCOUNT_CLASSES.has(fr.classStr)) {
          const m = depthAt(I, b) - depthAt(I, a);
          disc += m;
          pieceDisc[fr.classStr] = (pieceDisc[fr.classStr] || 0) + m;
        } else cuts.push([a, b]);
      });

      let clipped: [number, number][] = [];
      f.finalIntervals.forEach(iv => {
        const a = Math.max(ie, iv[0]), b = Math.min(re, iv[1]);
        if (a < b) clipped.push([a, b]);
      });
      cuts.forEach(c => { clipped = subtractInterval(clipped, c[0], c[1]); });
      const sound = clipped.reduce((acc, iv) => {
        const m = depthAt(I, iv[1]) - depthAt(I, iv[0]);
        return m >= MIN_PIECE_M ? acc + m : acc;
      }, 0);

      const pieceNominal = depthAt(I, re) - depthAt(I, ie);
      let rec = core - disc;
      if (rec > pieceNominal) rec = pieceNominal;
      let rqd = Math.max(0, sound - disc);
      if (rqd > rec) rqd = rec;
      segRec += rec;
      segRqd += rqd;
      Object.entries(pieceDisc).forEach(([k, v]) => { segDisc[k] = (segDisc[k] || 0) + v; });
      segPieces.push({
        row: I, x0: ie, x1: re,
        depth0: depthAt(I, ie), depth1: depthAt(I, re),
        recM: rec, rqdM: rqd, discounts: pieceDisc,
      });
    });

    tacoSegments.push({
      from: A.depth,
      to: B.depth,
      lengthM: len,
      recM: segRec,
      rqdM: segRqd,
      recPct: len > 0 ? (segRec / len) * 100 : 0,
      rqdPct: segRec > 0 ? (segRqd / segRec) * 100 : 0,
      kind: s === valid.length - 2 ? 'BOUNDARY' : 'TACO',
      startTacoIdx: A.tacoIdx,
      endTacoIdx: B.tacoIdx,
      pieces: segPieces,
      discounts: segDisc,
    });
  }

  // ---- Limpieza/relleno de tacos (solo tras la inferencia) ----
  let outCajas = cajas;
  if (initial) {
    outCajas = cajas
      .filter(d => d.classId !== 1 || rowOfY(filas, (d.box[1] + d.box[3]) / 2) !== -1)
      .map(d => {
        if (d.classId !== 1 || parseDepth(d.ocrValue) !== null) return d;
        const row = rowOfY(filas, (d.box[1] + d.box[3]) / 2);
        return { ...d, ocrValue: depthAt(row, (d.box[0] + d.box[2]) / 2).toFixed(2) };
      });
  }

  const csvRow = [
    input.collar, input.fromDepth, input.toDepth,
    rqdPct.toFixed(1), rqdTotal.toFixed(2), recPct.toFixed(1), recTotal.toFixed(2), input.name,
  ];
  const csvDataTacos = tacoSegments.map(t => [
    input.collar, t.from.toFixed(2), t.to.toFixed(2),
    t.rqdPct.toFixed(1), t.rqdM.toFixed(2), t.recPct.toFixed(1), t.recM.toFixed(2),
    input.name, t.kind,
  ]);

  return {
    warnings,
    cajas: outCajas,
    csvRow,
    csvDataTacos,
    result: {
      longitud_total_m: nominal.toFixed(2),
      recuperado_total_m: recTotal.toFixed(2),
      recuperacion_pct: recPct.toFixed(1),
      rqd_total_m: rqdTotal.toFixed(2),
      rqd_pct: rqdPct.toFixed(1),
      filas,
      validAnchors: valid,
      fracturas_report: fracturasReport,
      tacoSegments,
      rejectedTacos,
    },
  };
}

// ---------------------------------------------------------------------------
// Tabla del sondaje: une tramos que cruzan de una caja a la siguiente.
// ---------------------------------------------------------------------------

export interface HoleSegment {
  collar: string;
  from: number;
  to: number;
  recM: number;
  rqdM: number;
  recPct: number;
  rqdPct: number;
  kind: 'TACO' | 'BOUNDARY';
  parts: { imageId: string; imageName: string; segIndex: number }[];
}

interface ImageLike {
  id: string;
  name: string;
  collar: string;
  fromDepth: string;
  status: string;
  result: RqdResult | null;
}

export function sortImagesForHole<T extends ImageLike>(images: T[]): T[] {
  return [...images].sort((a, b) => {
    const ca = a.collar || '', cb = b.collar || '';
    if (ca !== cb) return ca.localeCompare(cb);
    return (parseFloat(a.fromDepth) || 0) - (parseFloat(b.fromDepth) || 0);
  });
}

export function mergeHoleSegments(images: ImageLike[]): HoleSegment[] {
  const flat: HoleSegment[] = [];
  sortImagesForHole(images.filter(i => i.status === 'done' && i.result?.tacoSegments)).forEach(img => {
    img.result!.tacoSegments.forEach((t, segIndex) => {
      flat.push({
        collar: img.collar, from: t.from, to: t.to, recM: t.recM, rqdM: t.rqdM,
        recPct: t.recPct, rqdPct: t.rqdPct, kind: t.kind,
        parts: [{ imageId: img.id, imageName: img.name, segIndex }],
      });
    });
  });
  if (flat.length === 0) return [];

  const merged: HoleSegment[] = [];
  let cur = { ...flat[0], parts: [...flat[0].parts] };
  for (let i = 1; i < flat.length; i++) {
    const next = flat[i];
    if (cur.collar === next.collar && cur.kind === 'BOUNDARY' && Math.abs(cur.to - next.from) < 0.05) {
      cur.to = next.to;
      cur.rqdM += next.rqdM;
      cur.recM += next.recM;
      cur.rqdPct = cur.recM > 0 ? (cur.rqdM / cur.recM) * 100 : 0;
      const len = cur.to - cur.from;
      cur.recPct = len > 0 ? (cur.recM / len) * 100 : 0;
      cur.kind = next.kind;
      cur.parts.push(...next.parts);
    } else {
      merged.push(cur);
      cur = { ...next, parts: [...next.parts] };
    }
  }
  merged.push(cur);
  return merged;
}

/** Clasificación de Deere (1964). */
export function rqdClass(pct: number): { label: string; color: string } {
  if (pct < 25) return { label: 'Muy mala', color: '#d64545' };
  if (pct < 50) return { label: 'Mala', color: '#e8833a' };
  if (pct < 75) return { label: 'Regular', color: '#e3b93b' };
  if (pct < 90) return { label: 'Buena', color: '#6fb36b' };
  return { label: 'Excelente', color: '#2e8b57' };
}
