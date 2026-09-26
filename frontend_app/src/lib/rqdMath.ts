// Cálculo de Recovery y RQD — lógica pura (sin React ni canvas).
// Portado del RQD Analyzer compilado (antes solo existía como bundle en
// public/RQD_Analyzer_Web_Ready). Mantiene exactamente las mismas reglas:
//   - Filas = agrupación vertical de detecciones "Núcleo" (classId 0).
//   - Anclas de profundidad = From de la caja, bordes izq/der de cada taco
//     y To de la caja; se interpola linealmente entre anclas.
//   - Profundidad de cada taco (resolveTacos), en este orden:
//       1) manual  → lo que escribió el usuario
//       2) OCR     → si la confianza es suficiente y el valor es lógico
//                    (dentro de From–To, en orden y coherente con el tamaño)
//       3) estimado→ proporcional a la longitud de canal entre tacos conocidos
//     Se resuelve en cada cálculo: cambiar un taco re-estima los demás.
//   - Panizo / Zona Fracturada / Zona Plástica descuentan solo del RQD.
//   - Fracturas cortan los intervalos de núcleo; solo trozos >= 0.10 m suman RQD.

export type Box = [number, number, number, number];

export interface Detection {
  classId: number;
  prob: number;
  box: Box;
  mask?: any;
  rawBox?: any;
  ocrValue?: string | number | null;               // valor mostrado/usado (texto)
  ocrCandidates?: { value: number; conf: number }[]; // lecturas OCR con confianza 0-100
  manual?: boolean;                                  // true = lo escribió el usuario
}

export type TacoSource = 'manual' | 'ocr' | 'estimado';

export interface TacoInfo {
  source: TacoSource;
  depth: number | null;      // profundidad usada (null si el taco no se usa)
  usable: boolean;
  ocrBest?: { value: number; conf: number };
  note: string;              // por qué se usó/descartó
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
  tacoOrder: number[];
  tacoInfo: Record<number, TacoInfo>;
  metersPerPx: number | null;       // escala de la caja (Ancho de caja / largo del canal)            // índices de `cajas` ordenados a lo largo del testigo → T1, T2, ...
}

export interface ComputeInput {
  collar: string;
  name: string;
  fromDepth: string;
  toDepth: string;
  boxWidth?: string;
  origW: number;
  cajas: Detection[];
  fracturas: Detection[];
  // Geometría del letterbox de segmentación (para ubicar la máscara verde)
  scale?: number;
  padX?: number;
  padY?: number;
}

export interface MaskGeom { scale: number; padX: number; padY: number; }

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

const MASK_ON = 0.5;           // probabilidad mínima para contar un píxel como testigo
const COL_COVERAGE = 0.35;     // fracción mínima de la columna (dentro de la caja) cubierta por la máscara

/** Lado del letterbox al que corresponde la máscara (igual que el dibujo). */
export function maskTarget(len: number) {
  return len === 65536 ? 1024 : len === 262144 ? 512 : 640;
}

/**
 * Intervalos X (px de la foto) donde realmente hay testigo según la máscara
 * verde del modelo de core. Sin máscara → la caja completa (comportamiento anterior).
 */
export function coreIntervals(d: Detection, geom?: MaskGeom): [number, number][] {
  const box: [number, number] = [d.box[0], d.box[2]];
  if (!d.mask || !geom || !geom.scale) return [box];
  const side = Math.round(Math.sqrt(d.mask.length));
  if (side * side !== d.mask.length) return [box];
  const k = maskTarget(d.mask.length) / side;                   // px letterbox por píxel de máscara
  const toX = (mx: number) => (mx * k - geom.padX) / geom.scale; // máscara → foto
  const toM = (x: number) => (x * geom.scale + geom.padX) / k;   // foto → máscara
  const mx0 = Math.max(0, Math.floor(toM(d.box[0])));
  const mx1 = Math.min(side - 1, Math.ceil(toM(d.box[2])) - 1);
  const my0 = Math.max(0, Math.floor((d.box[1] * geom.scale + geom.padY) / k));
  const my1 = Math.min(side - 1, Math.ceil((d.box[3] * geom.scale + geom.padY) / k) - 1);
  const rows = my1 - my0 + 1;
  if (mx1 < mx0 || rows <= 0) return [box];

  const out: [number, number][] = [];
  let start = -1, gap = 0;
  for (let mx = mx0; mx <= mx1 + 1; mx++) {
    let on = false;
    if (mx <= mx1) {
      let c = 0;
      for (let my = my0; my <= my1; my++) if (d.mask[my * side + mx] > MASK_ON) c++;
      on = c >= rows * COL_COVERAGE;
    }
    if (on) { if (start < 0) start = mx; gap = 0; }
    else if (start >= 0) {
      gap++;
      if (gap > 1 || mx > mx1) {           // tolera huecos de 1 píxel de máscara
        const end = mx - gap + 1;
        out.push([Math.max(d.box[0], toX(start)), Math.min(d.box[2], toX(end))]);
        start = -1; gap = 0;
      }
    }
  }
  const clean = out.filter(iv => iv[1] - iv[0] > 0);
  return clean.length > 0 ? clean : [];
}

export function groupRows(cajas: Detection[], geom?: MaskGeom): Fila[] {
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
    const raw = group.flatMap(d => coreIntervals(d, geom)).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    if (raw.length === 0) raw.push([group[0].box[0], group[0].box[0]]);
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

export const OCR_MIN_CONF = 50;      // confianza mínima de Tesseract para considerar una lectura
export const OCR_TOL_MIN_M = 0.3;    // tolerancia mínima frente a la profundidad esperada
export const OCR_TOL_FRAC = 0.3;     // + 30% del avance esperado desde el taco anterior

interface ResolveOut {
  cajas: Detection[];
  info: Record<number, TacoInfo>;
  order: number[];
  metersPerPx: number | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Decide la profundidad de cada taco: manual > OCR fiable y lógico > estimado.
 * Las estimaciones usan la posición a lo largo del canal de testigo (tamaño
 * real en la foto), así que se actualizan cuando cambia cualquier otro taco.
 */
export function resolveTacos(input: ComputeInput, filas: Fila[]): ResolveOut {
  const { cajas } = input;
  const from = parseFloat(input.fromDepth), to = parseFloat(input.toDepth);

  // Canal de testigo por fila (de la primera a la última caja de núcleo)
  const channels = filas.map(f => {
    let x0 = Infinity, x1 = -Infinity;
    f.items.forEach(it => { x0 = Math.min(x0, it[4][0]); x1 = Math.max(x1, it[4][2]); });
    return { x0, x1, len: Math.max(0, x1 - x0) };
  });
  const cum: number[] = [];
  channels.reduce((acc, c, i) => { cum[i] = acc; return acc + c.len; }, 0);
  const totalS = channels.reduce((a, c) => a + c.len, 0);
  const sOf = (row: number, x: number) => cum[row] + Math.min(Math.max(x - channels[row].x0, 0), channels[row].len);

  // Escala por el ancho de caja: la fila más larga (mediana) = Ancho de caja
  const bw = parseFloat(input.boxWidth || '');
  const lens = channels.map(c => c.len).filter(l => l > 0).sort((a, b) => a - b);
  const medLen = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  const mpp = bw > 0 && medLen > 0 ? bw / medLen : totalS > 0 ? (to - from) / totalS : null;

  type T = { idx: number; row: number; s: number };
  const tacos: T[] = [];
  const outside: number[] = [];
  cajas.forEach((d, idx) => {
    if (d.classId !== 1) return;
    const row = rowOfY(filas, (d.box[1] + d.box[3]) / 2);
    if (row === -1) { outside.push(idx); return; }
    tacos.push({ idx, row, s: sOf(row, (d.box[0] + d.box[2]) / 2) });
  });
  tacos.sort((a, b) => a.s - b.s);

  const info: Record<number, TacoInfo> = {};
  // Lecturas OCR: `ocrCandidates`. Datos de la versión anterior solo traían
  // `ocrValue`; esa lectura se convierte en candidata una sola vez (abajo).
  const candidatesOf = (d: Detection): { value: number; conf: number }[] => {
    if (d.ocrCandidates !== undefined) return d.ocrCandidates;
    const legacy = d.manual ? null : parseDepth(d.ocrValue);
    return legacy !== null ? [{ value: legacy, conf: 100 }] : [];
  };
  const bestOcr = (d: Detection) => candidatesOf(d)[0];

  // Anclas aceptadas: From, manuales válidos, OCR fiables, To
  type A = { s: number; depth: number };
  const accepted: A[] = [{ s: 0, depth: from }];
  const nextManualBound = (k: number): A => {
    for (let j = k + 1; j < tacos.length; j++) {
      const d = cajas[tacos[j].idx];
      const v = d.manual ? parseDepth(d.ocrValue) : null;
      if (v !== null && v >= accepted[accepted.length - 1].depth && v <= to) return { s: tacos[j].s, depth: v };
    }
    return { s: totalS, depth: to };
  };

  tacos.forEach((t, k) => {
    const d = cajas[t.idx];
    const prev = accepted[accepted.length - 1];
    const ocrBest = bestOcr(d);

    if (d.manual) {
      const v = parseDepth(d.ocrValue);
      if (v === null) {
        info[t.idx] = { source: 'manual', depth: null, usable: false, ocrBest, note: 'Valor manual vacío o inválido' };
      } else if (v < prev.depth || v > to) {
        info[t.idx] = { source: 'manual', depth: v, usable: false, ocrBest, note: `Fuera de orden: debe estar entre ${prev.depth.toFixed(2)} y ${to.toFixed(2)} m` };
      } else {
        accepted.push({ s: t.s, depth: v });
        info[t.idx] = { source: 'manual', depth: v, usable: true, ocrBest, note: 'Ingresado manualmente' };
      }
      return;
    }

    // OCR: elige la lectura más confiable que sea lógica
    const bound = nextManualBound(k);
    const expScale = mpp !== null ? prev.depth + (t.s - prev.s) * mpp : null;
    const expInterp = bound.s > prev.s ? prev.depth + ((bound.depth - prev.depth) * (t.s - prev.s)) / (bound.s - prev.s) : null;
    const advance = expScale !== null ? expScale - prev.depth : expInterp !== null ? expInterp - prev.depth : 0;
    const tol = Math.max(OCR_TOL_MIN_M, OCR_TOL_FRAC * Math.max(0, advance));
    let why = 'Sin lectura OCR';
    const cands = candidatesOf(d);
    if (cands.length) why = `OCR ${cands[0].value.toFixed(2)} (${Math.round(cands[0].conf)}%)`;
    let pick: { value: number; conf: number } | undefined;
    for (const c of cands) {
      if (c.conf < OCR_MIN_CONF) { if (c === cands[0]) why += ': confianza baja'; continue; }
      if (c.value < prev.depth || c.value > bound.depth + 0.01) { if (c === cands[0]) why += ': fuera de orden / de From–To'; continue; }
      const near = (e: number | null) => e !== null && Math.abs(c.value - e) <= tol;
      if (!near(expScale) && !near(expInterp)) { if (c === cands[0]) why += ': no coincide con el tamaño'; continue; }
      pick = c;
      break;
    }
    if (pick) {
      accepted.push({ s: t.s, depth: pick.value });
      info[t.idx] = {
        source: 'ocr', depth: pick.value, usable: true, ocrBest,
        note: `OCR ${pick.value.toFixed(2)} m (${Math.round(pick.conf)}%)${pick !== cands[0] ? ' · 2ª lectura, la 1ª no era lógica' : ''}`,
      };
    } else {
      info[t.idx] = { source: 'estimado', depth: null, usable: true, ocrBest, note: why };
    }
  });
  accepted.push({ s: totalS, depth: to });

  // Estimación por tamaño entre las anclas aceptadas vecinas
  tacos.forEach(t => {
    const inf = info[t.idx];
    if (inf.source !== 'estimado') return;
    let a = accepted[0], b = accepted[accepted.length - 1];
    for (const x of accepted) { if (x.s <= t.s) a = x; }
    for (let i = accepted.length - 1; i >= 0; i--) { if (accepted[i].s >= t.s) b = accepted[i]; }
    let v: number;
    if (b.s > a.s) v = a.depth + ((b.depth - a.depth) * (t.s - a.s)) / (b.s - a.s);
    else v = mpp !== null ? a.depth + (t.s - a.s) * mpp : a.depth;
    v = Math.min(Math.max(v, a.depth), b.depth);
    inf.depth = r2(v);
    inf.note = `Estimado por tamaño (${inf.note})`;
  });

  outside.forEach(idx => {
    info[idx] = { source: cajas[idx].manual ? 'manual' : 'estimado', depth: null, usable: false, ocrBest: bestOcr(cajas[idx]), note: 'Fuera del testigo detectado' };
  });

  // Valor visible en cada taco (los manuales conservan lo que se escribió)
  const out = cajas.map((d, idx) => {
    if (d.classId !== 1) return d;
    const inf = info[idx];
    let nd = d.ocrCandidates === undefined ? { ...d, ocrCandidates: candidatesOf(d) } : d;
    if (!inf || d.manual || inf.depth === null) return nd;
    const txt = inf.depth.toFixed(2);
    if (nd.ocrValue !== txt) nd = { ...nd, ocrValue: txt };
    return nd;
  });
  return { cajas: out, info, order: tacos.map(t => t.idx).concat(outside), metersPerPx: mpp };
}

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

  const geom = input.scale ? { scale: input.scale, padX: input.padX || 0, padY: input.padY || 0 } : undefined;
  const filas = groupRows(cajas, geom);

  // ---- Profundidad de cada taco: manual > OCR lógico > estimado ----
  const resolved = resolveTacos(input, filas);
  const cajasR = resolved.cajas;

  // ---- Anclas de profundidad ----
  const anchors: Anchor[] = [{ p: 0, depth: from }];
  cajasR.forEach((d, idx) => {
    if (d.classId !== 1 || !resolved.info[idx]?.usable) return;
    const val = resolved.info[idx].depth;
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

  // ---- Tacos que no entran en el cálculo ----
  const usedTacos = new Set(valid.filter(a => a.tacoIdx !== undefined).map(a => a.tacoIdx));
  const rejectedTacos: RejectedTaco[] = [];
  cajasR.forEach((d, idx) => {
    if (d.classId !== 1 || usedTacos.has(idx)) return;
    const row = rowOfY(filas, (d.box[1] + d.box[3]) / 2);
    const val = parseDepth(d.ocrValue);
    rejectedTacos.push({
      tacoIdx: idx,
      value: d.ocrValue === null || d.ocrValue === undefined ? '' : String(d.ocrValue),
      reason: row === -1 ? 'fuera_de_fila' : val === null ? 'sin_lectura' : 'fuera_de_orden',
    });
  });

  // Medición de un tramo [xa, xb] de una fila:
  //   Recovery = testigo detectado (máscara verde) dentro del tramo.
  //   RQD      = trozos >= 0.10 m tras cortar fracturas y quitar zonas
  //              blandas (Panizo / Zona Fracturada / Zona Plástica).
  //   Las zonas blandas solo descuentan del RQD, nunca de la Recovery, y
  //   cuentan una sola vez aunque sus cajas se solapen.
  const measure = (L: number, f: Fila, xa: number, xb: number) => {
    let core: [number, number][] = [];
    f.finalIntervals.forEach(iv => {
      const a = Math.max(xa, iv[0]), b = Math.min(xb, iv[1]);
      if (a < b) core.push([a, b]);
    });
    const len = (ivs: [number, number][]) => ivs.reduce((acc, iv) => acc + (depthAt(L, iv[1]) - depthAt(L, iv[0])), 0);
    const coreM = len(core);
    const discounts: Record<string, number> = {};
    let pieces = core;
    const soft: Record<string, [number, number][]> = {};
    fracturesInRow(fracturas, f).forEach(fr => {
      const a = Math.max(xa, fr.box[0]), b = Math.min(xb, fr.box[2]);
      if (a >= b) return;
      if (DISCOUNT_CLASSES.has(fr.classStr)) (soft[fr.classStr] = soft[fr.classStr] || []).push([a, b]);
      pieces = subtractInterval(pieces, a, b);
    });
    // Descuento por clase = testigo cubierto por esa clase (unión, sin duplicar)
    Object.entries(soft).forEach(([cls, ivs]) => {
      let rest = core;
      ivs.forEach(([a, b]) => { rest = subtractInterval(rest, a, b); });
      const m = coreM - len(rest);
      if (m > 0.0005) discounts[cls] = m;
    });
    const sound = pieces.reduce((acc, iv) => {
      const m = depthAt(L, iv[1]) - depthAt(L, iv[0]);
      return m >= MIN_PIECE_M ? acc + m : acc;
    }, 0);
    return { coreM, sound, discounts };
  };

  // ---- Totales por fila ----
  let recTotal = 0, rqdTotal = 0;
  const fracturasReport: string[][] = [];
  filas.forEach((f, L) => {
    fracturesInRow(fracturas, f).forEach(fr => {
      fracturasReport.push([
        input.collar, input.name, fr.classStr, fr.prob.toFixed(2),
        depthAt(L, fr.box[0]).toFixed(2), depthAt(L, fr.box[2]).toFixed(2),
      ]);
    });
    const { coreM, sound } = measure(L, f, 0, origW);
    const rowNominal = depthAt(L, origW) - depthAt(L, 0);
    let rec = coreM;
    if (rec > rowNominal) { rec = rowNominal; warnings.push(`Recovery topada al 100% en fila ${f.num}`); }
    const rqd = Math.min(sound, rec);
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
      const { coreM, sound, discounts } = measure(I, f, ie, re);
      const pieceNominal = depthAt(I, re) - depthAt(I, ie);
      const rec = Math.min(coreM, pieceNominal);
      const rqd = Math.min(sound, rec);
      segRec += rec;
      segRqd += rqd;
      Object.entries(discounts).forEach(([k, v]) => { segDisc[k] = (segDisc[k] || 0) + v; });
      segPieces.push({
        row: I, x0: ie, x1: re,
        depth0: depthAt(I, ie), depth1: depthAt(I, re),
        recM: rec, rqdM: rqd, discounts,
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

  // Tras la inferencia se descartan tacos que no caen sobre ninguna fila
  const outCajas = initial
    ? cajasR.filter(d => d.classId !== 1 || rowOfY(filas, (d.box[1] + d.box[3]) / 2) !== -1)
    : cajasR;
  if (initial && outCajas.length !== cajasR.length) {
    return computeRqd({ ...input, cajas: outCajas }, false);
  }
  const tacoOrder = resolved.order;

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
      tacoOrder,
      tacoInfo: resolved.info,
      metersPerPx: resolved.metersPerPx,
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
