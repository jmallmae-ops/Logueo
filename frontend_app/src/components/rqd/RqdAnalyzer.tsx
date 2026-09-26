// RQD Analyzer — código fuente recuperado del bundle compilado que vivía en
// public/RQD_Analyzer_Web_Ready (y que se cargaba en un iframe).
// Novedades respecto al original:
//   - Panel derecho con Strip log (taco a taco de la caja actual) y
//     Tabla taco a taco de todo el sondaje, ambos en tiempo real.
//   - Corregir un taco o From/To recalcula al instante (sin botón).
//   - La vista (mesa de luz / galería / mapa) la controla el Workspace.
import React from 'react';
import * as XLSX from 'xlsx';
import ImagoLoginModal from '../common/ImagoLoginModal';
import CameraCropModal from '../common/CameraCropModal';
import StripLog from './StripLog';
import TacoList from './TacoList';
import ResultsTable, { RESULT_HEADERS, resultRow } from './ResultsTable';
import { ImageItem } from '../../types';
import { computeRqd, mergeHoleSegments, sortImagesForHole, parseDepth } from '../../lib/rqdMath';
import { drawAnnotatedBox } from '../../lib/rqdDraw';
import {
  loadONNXRuntime, initTesseractWorker, recognizeCrop, drawImageToCanvas, preprocess,
  runInference, postprocess, runSegmentationInference, postprocessSegmentation, postprocessUnet,
} from '../../services/modelService';
import './rqd-strip.css';

export type AnalyzerView = 'light_table' | 'gallery' | 'map';

export interface ProcessedImagePayload {
  id: string;
  holeId: string;
  from: number;
  to: number;
  src: string;
}

interface Props {
  view: AnalyzerView;
  onImageProcessed?: (payload: ProcessedImagePayload) => void;
}

interface State {
  images: ImageItem[];
  currentIndex: number;
  loading: boolean;
  loadingMessage: string;
  resetKey: number;
  globalBoxWidth: string;
  showCores: boolean;
  showFractures: boolean;
  showTacos: boolean;
  showRuler: boolean;
  csvLogData: Record<string, string>[];
  csvLogHeaders: string[];
  csvCollarField: string;
  csvFromField: string;
  csvToField: string;
  csvPlotField: string;
  csvColorMap: Record<string, string>;
  showCsvLog: boolean;
  showImagoModal: boolean;
  showCameraModal: boolean;
  lastCameraSondaje: string;
  lastCameraToDepth: string;
  stripOpen: boolean;
  stripTab: 'tacos' | 'strip';
  focusSegment: number | null;
  focusTaco: number | null;
  resultsCollapsed: boolean;
}

// Rutas de los modelos (servidos desde public/assets; en Docker los baja fetch_lfs.py)
const MODEL_SEG = '/assets/segmentacion.onnx';
const MODEL_FRAC = '/assets/fracturas.onnx';

const newItem = (file: File, extra: Partial<ImageItem> = {}): ImageItem => ({
  id: Math.random().toString(36).slice(2, 11),
  file,
  name: file.name,
  collar: '',
  fromDepth: '',
  toDepth: '',
  boxWidth: '1.0',
  status: 'pending',
  errorMsg: '',
  result: null,
  csvData: [],
  csvDataTacos: [],
  origImg: null,
  origW: 0,
  origH: 0,
  scale: 1,
  padX: 0,
  padY: 0,
  cajas: [],
  fracturas: [],
  filas: [],
  ...extra,
});

/** HoleID_from_to_*.jpg, HoleID_from-to_*.jpg o HoleID_76_05_85_10_*.jpg */
function parseFileName(name: string) {
  const base = name.replace(/\.[A-Za-z0-9]+$/, '');
  const a = base.match(/(.*)_(\d+(?:\.\d+)?)_(\d+(?:\.\d+)?)(?:_.*)?$/);
  const b = base.match(/(.*)_(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(?:_.*)?$/);
  if (a) return { collar: a[1], from: a[2], to: a[3] };
  if (b) return { collar: b[1], from: b[2], to: b[3] };
  const parts = base.split('_');
  let collar = parts[0] || '', from = '', to = '';
  for (let m = 0; m < parts.length - 1; m++) {
    if (/^\d+(?:\.\d+)?$/.test(parts[m]) && /^\d+(?:\.\d+)?$/.test(parts[m + 1])) {
      from = parts[m]; to = parts[m + 1]; break;
    }
  }
  if (!from || !to) {
    for (let m = 0; m < parts.length - 3; m++) {
      if (/^\d+$/.test(parts[m]) && /^\d{2}$/.test(parts[m + 1]) && /^\d+$/.test(parts[m + 2]) && /^\d{2}$/.test(parts[m + 3])) {
        from = `${parts[m]}.${parts[m + 1]}`; to = `${parts[m + 2]}.${parts[m + 3]}`; break;
      }
    }
  }
  return { collar, from, to };
}

const closeDetails = (el: Element | null) => el?.closest('details')?.removeAttribute('open');

export default class RqdAnalyzer extends React.PureComponent<Props, State> {
  canvasRefs: Record<string, HTMLCanvasElement | null> = {};
  wrapperRef = React.createRef<HTMLDivElement>();
  containerRef = React.createRef<HTMLDivElement>();
  rulerTooltipRef = React.createRef<HTMLDivElement>();
  sessionCaja: any = null;
  sessionFractura: any = null;
  zoomScale = 1;
  zoomOffsetX = 0;
  zoomOffsetY = 0;
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  lastTouchX = 0;
  lastTouchY = 0;
  redrawTimer: number | undefined;
  publishTimers: Record<string, number> = {};

  state: State = {
    images: [],
    currentIndex: -1,
    loading: false,
    loadingMessage: '',
    resetKey: Date.now(),
    globalBoxWidth: '1.0',
    showCores: true,
    showFractures: true,
    showTacos: true,
    showRuler: true,
    csvLogData: [],
    csvLogHeaders: [],
    csvCollarField: '',
    csvFromField: '',
    csvToField: '',
    csvPlotField: '',
    csvColorMap: {},
    showCsvLog: true,
    showImagoModal: false,
    showCameraModal: false,
    lastCameraSondaje: '',
    lastCameraToDepth: '',
    stripOpen: true,
    stripTab: 'tacos',
    focusSegment: null,
    focusTaco: null,
    resultsCollapsed: false,
  };

  componentDidUpdate(_: Props, prev: State) {
    if (prev.currentIndex !== this.state.currentIndex && this.state.currentIndex >= 0) {
      this.drawCanvasForCurrentItem();
      if (this.state.focusTaco !== null) this.setState({ focusTaco: null });
    }
  }

  componentWillUnmount() {
    window.clearTimeout(this.redrawTimer);
    Object.values(this.publishTimers).forEach(t => window.clearTimeout(t));
  }

  // ------------------------------------------------------------------
  // Regla global de profundidad
  // ------------------------------------------------------------------
  getDepthRange = () => {
    const { images } = this.state;
    if (images.length === 0) return { min: 0, max: 100 };
    let min = Infinity, max = -Infinity;
    images.forEach(img => {
      const f = parseFloat(img.fromDepth || '0'), t = parseFloat(img.toDepth || '0');
      if (!isNaN(f) && f < min) min = f;
      if (!isNaN(t) && t > max) max = t;
    });
    return min === Infinity || max === -Infinity || min >= max ? { min: 0, max: 100 } : { min, max };
  };

  getTickIntervals = () => {
    const { min, max } = this.getDepthRange();
    const span = max - min;
    if (span <= 50) return { major: 10, minor: 1 };
    if (span <= 150) return { major: 20, minor: 2 };
    if (span <= 300) return { major: 50, minor: 5 };
    return { major: 100, minor: 10 };
  };

  rulerDepth = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - r.top - 20;
    const { min, max } = this.getDepthRange();
    const d = min + (y / (r.height - 40)) * (max - min);
    return { y, depth: Math.min(max, Math.max(min, d)) };
  };

  handleRulerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const tip = this.rulerTooltipRef.current;
    if (!tip) return;
    const { y, depth } = this.rulerDepth(e);
    tip.style.display = 'block';
    tip.style.top = `${y + 20}px`;
    tip.innerText = depth.toFixed(2);
  };

  handleRulerMouseLeave = () => {
    if (this.rulerTooltipRef.current) this.rulerTooltipRef.current.style.display = 'none';
  };

  handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const { depth } = this.rulerDepth(e);
    const idx = this.state.images.findIndex(img => {
      const f = parseFloat(img.fromDepth || '0'), t = parseFloat(img.toDepth || '0');
      return depth >= f && depth <= t;
    });
    if (idx !== -1) this.scrollToImage(idx);
  };

  scrollToImage = (idx: number) => {
    this.setState({ currentIndex: idx });
    const wrapper = this.wrapperRef.current;
    const row = wrapper?.children[idx + 1] as HTMLElement | undefined;
    if (!row) return;
    const h = this.containerRef.current?.clientHeight || 0;
    this.zoomOffsetY = h / 2 - row.offsetTop * this.zoomScale - (row.clientHeight * this.zoomScale) / 2;
    this.updateCanvasTransform();
  };

  // ------------------------------------------------------------------
  // Zoom / pan de la mesa de luz
  // ------------------------------------------------------------------
  updateCanvasTransform = () => {
    const w = this.wrapperRef.current;
    if (!w) return;
    w.style.transform = `translate(${this.zoomOffsetX}px, ${this.zoomOffsetY}px) scale(${this.zoomScale})`;
    w.style.transformOrigin = '0 0';
  };

  resetZoom = () => {
    const c = this.containerRef.current;
    if (c && this.state.images.length > 0) {
      const first = this.canvasRefs[this.state.images[0].id];
      if (first && first.width > 0) {
        const r = c.getBoundingClientRect();
        this.zoomScale = (r.width * 0.8) / first.width;
        this.zoomOffsetX = r.width * 0.15;
        this.zoomOffsetY = 20;
      }
    } else {
      this.zoomScale = 1; this.zoomOffsetX = 0; this.zoomOffsetY = 0;
    }
    this.updateCanvasTransform();
  };

  zoomAround = (cx: number, cy: number, next: number) => {
    const s = this.zoomScale;
    this.zoomOffsetX = cx - (cx - this.zoomOffsetX) * (next / s);
    this.zoomOffsetY = cy - (cy - this.zoomOffsetY) * (next / s);
    this.zoomScale = next;
    this.updateCanvasTransform();
  };

  handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const c = this.containerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const next = Math.min(Math.max(this.zoomScale * (1 - e.deltaY * 0.0015), 0.05), 15);
    this.zoomAround(e.clientX - r.left, e.clientY - r.top, next);
  };

  handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.dragStartX = e.clientX - this.zoomOffsetX;
    this.dragStartY = e.clientY - this.zoomOffsetY;
    if (this.containerRef.current) this.containerRef.current.style.cursor = 'grabbing';
  };

  handleMouseMove = (e: React.MouseEvent) => {
    if (!this.isDragging) return;
    this.zoomOffsetX = e.clientX - this.dragStartX;
    this.zoomOffsetY = e.clientY - this.dragStartY;
    this.updateCanvasTransform();
  };

  handleMouseUp = () => {
    this.isDragging = false;
    if (this.containerRef.current) this.containerRef.current.style.cursor = 'grab';
  };

  handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    this.isDragging = true;
    this.lastTouchX = e.touches[0].clientX;
    this.lastTouchY = e.touches[0].clientY;
  };

  handleTouchMove = (e: React.TouchEvent) => {
    if (!this.isDragging || e.touches.length !== 1) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    this.zoomOffsetX += x - this.lastTouchX;
    this.zoomOffsetY += y - this.lastTouchY;
    this.lastTouchX = x;
    this.lastTouchY = y;
    this.updateCanvasTransform();
  };

  // ------------------------------------------------------------------
  // Logueo litológico importado (CSV)
  // ------------------------------------------------------------------
  generateColorMap = (rows: Record<string, string>[], field: string) => {
    const empty = ['', 'null', 'n/a', 'na', '-'];
    const values = Array.from(new Set(rows.map(r => r[field]).filter(v => v && !empty.includes(String(v).trim().toLowerCase()))));
    const palette = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#33FFA1', '#FF8C00', '#8A2BE2', '#00CED1', '#FF1493', '#32CD32', '#4169E1'];
    const map: Record<string, string> = {};
    values.forEach((v, i) => { map[v] = palette[i % palette.length]; });
    return map;
  };

  parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(l => {
      const cells = l.split(',').map(c => c.trim());
      const o: Record<string, string> = {};
      headers.forEach((h, i) => { o[h] = cells[i] || ''; });
      return o;
    });
    const find = (keys: string[]) => headers.find(h => keys.includes(h.toUpperCase())) || '';
    const plot = find(['LITHOLOGY', 'LITOLOGIA', 'TIPO', 'SUBTIPO', 'TEXTURA', 'DESCRIPCION']);
    this.setState({
      csvLogHeaders: headers,
      csvLogData: rows,
      csvCollarField: find(['HOLEID', 'BHID', 'COLLAR', 'SONDAJE', 'POZO']),
      csvFromField: find(['FROM', 'DESDE', 'GEOLFROM']),
      csvToField: find(['TO', 'HASTA', 'GEOLTO']),
      csvPlotField: plot,
      csvColorMap: plot ? this.generateColorMap(rows, plot) : {},
      showCsvLog: true,
    }, this.drawCanvasForCurrentItem);
  };

  handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const t = ev.target?.result as string; if (t) this.parseCSV(t); };
    reader.readAsText(file);
  };

  // ------------------------------------------------------------------
  // Carga de imágenes
  // ------------------------------------------------------------------
  appendImages = (items: ImageItem[], sort = false) => {
    this.setState(s => {
      let images = [...s.images, ...items];
      if (sort) images = sortImagesForHole(images);
      return { images, currentIndex: s.currentIndex === -1 && images.length > 0 ? 0 : s.currentIndex };
    }, () => { if (this.state.images.length > 0) this.drawCanvasForCurrentItem(); });
  };

  handleImagoImport = async (list: { name: string; url: string }[]) => {
    this.setState({ loading: true, loadingMessage: 'Descargando desde Imago...' });
    try {
      const items: ImageItem[] = [];
      for (const it of list) {
        const blob = await (await fetch(it.url)).blob();
        const file = new File([blob], it.name + '.jpg', { type: blob.type || 'image/jpeg' });
        items.push(newItem(file, { boxWidth: this.state.globalBoxWidth }));
      }
      this.setState({ loading: false });
      this.appendImages(items);
    } catch {
      alert('Error al descargar desde Imago. Es posible que el CORS lo bloquee.');
      this.setState({ loading: false });
    }
  };

  handleCameraPhoto = (file: File, sondaje: string, from: string, to: string) => {
    this.setState({ lastCameraSondaje: sondaje, lastCameraToDepth: to });
    this.appendImages([newItem(file, { collar: sondaje, fromDepth: from, toDepth: to, boxWidth: this.state.globalBoxWidth })]);
  };

  handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const items = Array.from(files).map((f, i) => {
      const p = parseFileName(f.name);
      return newItem(f, { id: `${Date.now()}-${i}`, collar: p.collar, fromDepth: p.from, toDepth: p.to, boxWidth: this.state.globalBoxWidth });
    });
    this.appendImages(items, true);
  };

  // ------------------------------------------------------------------
  // Edición en tiempo real
  // ------------------------------------------------------------------
  updateImageAtIndex = (idx: number, patch: Partial<ImageItem>, cb?: () => void) => {
    this.setState(s => {
      if (idx < 0 || idx >= s.images.length) return null;
      const images = [...s.images];
      images[idx] = { ...images[idx], ...patch };
      return { images };
    }, cb);
  };

  /** Recalcula una caja ya analizada con sus detecciones actuales. */
  applyCompute = (idx: number, patch: Partial<ImageItem> = {}, initial = false, cb?: () => void) => {
    this.setState(s => {
      const cur = s.images[idx];
      if (!cur) return null;
      const merged = { ...cur, ...patch };
      if (merged.status !== 'done' && !initial) return { images: Object.assign([...s.images], { [idx]: merged }) };
      const from = parseDepth(merged.fromDepth), to = parseDepth(merged.toDepth);
      if (from === null || to === null || to <= from || !merged.cajas || !merged.fracturas) {
        // Profundidades inválidas mientras se escribe: conserva el último cálculo.
        return { images: Object.assign([...s.images], { [idx]: merged }) };
      }
      const out = computeRqd(merged, initial);
      const images = [...s.images];
      images[idx] = {
        ...merged,
        status: 'done',
        cajas: out.cajas,
        errorMsg: out.warnings.join(' | '),
        result: out.result,
        csvData: [out.csvRow],
        csvDataTacos: out.csvDataTacos,
      };
      return { images };
    }, () => {
      this.scheduleRedraw();
      this.schedulePublish(idx);
      cb?.();
    });
  };

  handleTacoEdit = (imgIdx: number, cajaIdx: number, value: string) => {
    const img = this.state.images[imgIdx];
    if (!img) return;
    const cajas = [...img.cajas];
    cajas[cajaIdx] = { ...cajas[cajaIdx], ocrValue: value };
    this.applyCompute(imgIdx, { cajas });
  };

  handleDepthEdit = (field: 'fromDepth' | 'toDepth', value: string) => {
    this.applyCompute(this.state.currentIndex, { [field]: value } as Partial<ImageItem>);
  };

  handleBoxWidthChange = (value: string) => {
    this.setState(s => ({ globalBoxWidth: value, images: s.images.map(i => ({ ...i, boxWidth: value })) }));
  };

  scheduleRedraw = () => {
    window.clearTimeout(this.redrawTimer);
    this.redrawTimer = window.setTimeout(this.drawCanvasForCurrentItem, 200);
  };

  /** Envía la tira rotada de la caja al Logueo (debounce para no generar un JPEG por tecla). */
  schedulePublish = (idx: number) => {
    const img = this.state.images[idx];
    if (!img || !this.props.onImageProcessed) return;
    window.clearTimeout(this.publishTimers[img.id]);
    this.publishTimers[img.id] = window.setTimeout(() => this.publishStrip(img.id), 1200);
  };

  publishStrip = (id: string) => {
    const img = this.state.images.find(i => i.id === id);
    const filas = img?.result?.filas;
    if (!img || !img.origImg || !filas || filas.length === 0) return;
    try {
      let rowH = 0;
      filas.forEach((f: any) => { rowH = Math.max(rowH, f.y_max - f.y_min); });
      const canvas = document.createElement('canvas');
      canvas.width = rowH;
      canvas.height = filas.length * img.origW;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      let y = 0;
      filas.forEach((f: any) => {
        const h = f.y_max - f.y_min;
        ctx.save();
        ctx.translate(0, y);
        ctx.translate(h, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img.origImg!, 0, f.y_min, img.origW, h, 0, 0, img.origW, h);
        ctx.restore();
        y += img.origW;
      });
      this.props.onImageProcessed?.({
        id: img.id,
        holeId: img.collar || img.name,
        from: parseFloat(img.fromDepth || '0'),
        to: parseFloat(img.toDepth || '0'),
        src: canvas.toDataURL('image/jpeg', 0.5),
      });
    } catch (err) {
      console.error(err);
    }
  };

  // ------------------------------------------------------------------
  // Inferencia
  // ------------------------------------------------------------------
  initModels = async (ort: any) => {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    ort.env.wasm.proxy = false;
    const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    if (!this.sessionCaja) this.sessionCaja = await ort.InferenceSession.create(MODEL_SEG, opts);
    if (!this.sessionFractura) this.sessionFractura = await ort.InferenceSession.create(MODEL_FRAC, opts);
  };

  analyzeImage = async (idx: number, batch = false) => {
    const img = this.state.images[idx];
    if (!img) return;
    const from = parseFloat(img.fromDepth), to = parseFloat(img.toDepth);
    let bw = parseFloat(img.boxWidth);
    if (isNaN(bw) || bw <= 0) { bw = 1; this.updateImageAtIndex(idx, { boxWidth: '1.0' }); }
    if (isNaN(from) || isNaN(to)) {
      this.updateImageAtIndex(idx, { status: 'error', errorMsg: 'Introduce profundidades válidas (From, To)' });
      return;
    }
    if (to - from <= 0) {
      this.updateImageAtIndex(idx, { status: 'error', errorMsg: 'La profundidad final debe ser mayor a la inicial.' });
      return;
    }
    if (!batch) this.setState({ loading: true, loadingMessage: 'Cargando modelos de IA...' });
    this.updateImageAtIndex(idx, { status: 'analyzing', errorMsg: '', result: null, csvData: [], csvDataTacos: [] });

    try {
      const ort = await loadONNXRuntime();
      await this.initModels(ort);
      this.setState({ loadingMessage: batch ? `Analizando ${idx + 1}/${this.state.images.length}: ${img.name}` : `Procesando ${img.name}...` });

      // 1) Segmentación de núcleos (0) y tacos (1)
      const isUnet = this.sessionCaja.outputNames.length === 1;
      const segSize = isUnet ? 512 : 1024;
      const seg = await drawImageToCanvas(img.file, segSize);
      const segTensor = preprocess(seg.imgData, isUnet);
      const { output0, output1 } = await runSegmentationInference(ort, this.sessionCaja, segTensor);
      const cajas: any[] = isUnet
        ? postprocessUnet(output0, segSize, seg.scale, seg.padX, seg.padY, seg.origW, seg.origH, 0.5)
        : postprocessSegmentation(output0, output1, 2, segSize, seg.scale, seg.padX, seg.padY, seg.origW, seg.origH, 0.15);

      // 2) OCR de tacos (recorte con 10% de margen)
      try {
        const worker = await initTesseractWorker();
        for (const d of cajas) {
          if (d.classId !== 1) continue;
          const mx = (d.box[2] - d.box[0]) * 0.1, my = (d.box[3] - d.box[1]) * 0.1;
          const x0 = Math.max(0, d.box[0] - mx), y0 = Math.max(0, d.box[1] - my);
          const x1 = Math.min(seg.origW, d.box[2] + mx), y1 = Math.min(seg.origH, d.box[3] + my);
          const w = x1 - x0, h = y1 - y0;
          if (w <= 0 || h <= 0) continue;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d')!.drawImage(seg.origImg, x0, y0, w, h, 0, 0, w, h);
          d.ocrValue = await recognizeCrop(worker, c, true);
        }
      } catch (err) {
        console.warn('Error durante OCR de tacos:', err);
      }

      // 3) Fracturas (solo las que caen dentro de un núcleo)
      const fracSize = 640;
      const fr = await drawImageToCanvas(img.file, fracSize);
      const frOut = await runInference(ort, this.sessionFractura, preprocess(fr.imgData));
      const coreBoxes = cajas.filter(d => d.classId === 0).map(d => d.box);
      const fracturas = postprocess(frOut, 4, fracSize, fr.scale, fr.padX, fr.padY, fr.origW, fr.origH, 0.2).filter((d: any) => {
        const cx = (d.box[0] + d.box[2]) / 2, cy = (d.box[1] + d.box[3]) / 2;
        return coreBoxes.some(b => cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]);
      });

      await new Promise<void>(resolve => this.applyCompute(idx, {
        origImg: seg.origImg, origW: seg.origW, origH: seg.origH,
        scale: seg.scale, padX: seg.padX, padY: seg.padY,
        cajas, fracturas,
      }, true, resolve));
      if (!batch) this.setState({ loading: false });
    } catch (err: any) {
      console.error(err);
      this.updateImageAtIndex(idx, { status: 'error', errorMsg: err?.message || 'Error analizando' });
      if (!batch) this.setState({ loading: false });
    }
  };

  analyzeAllImages = async () => {
    this.setState({ loading: true, loadingMessage: 'Iniciando análisis por lote...' });
    for (let i = 0; i < this.state.images.length; i++) {
      if (this.state.images[i].status === 'done') continue;
      this.setState({ currentIndex: i });
      await this.analyzeImage(i, true);
      await new Promise(r => setTimeout(r, 100));
    }
    this.setState({ loading: false });
    this.resetZoom();
    this.drawCanvasForCurrentItem();
  };

  resetWidget = () => {
    this.setState({
      images: [], currentIndex: -1, loading: false, loadingMessage: '', resetKey: Date.now(),
      globalBoxWidth: '1.0', csvLogData: [], csvLogHeaders: [], csvCollarField: '', csvFromField: '',
      csvToField: '', csvPlotField: '', csvColorMap: {}, lastCameraSondaje: '', lastCameraToDepth: '',
      focusSegment: null,
    });
  };

  // ------------------------------------------------------------------
  // Dibujo
  // ------------------------------------------------------------------
  drawAllCanvases = () => {
    const s = this.state;
    const layers = { showCores: s.showCores, showFractures: s.showFractures, showTacos: s.showTacos, showRuler: s.showRuler, showCsvLog: s.showCsvLog };
    const csv = { csvLogData: s.csvLogData, csvCollarField: s.csvCollarField, csvFromField: s.csvFromField, csvToField: s.csvToField, csvPlotField: s.csvPlotField, csvColorMap: s.csvColorMap };
    s.images.forEach(img => {
      const c = this.canvasRefs[img.id];
      if (c) drawAnnotatedBox(c, img, layers, csv);
    });
  };

  drawCanvasForCurrentItem = () => this.drawAllCanvases();

  // ------------------------------------------------------------------
  // Exportación Excel
  // ------------------------------------------------------------------
  exportGlobalCsv = () => {
    const done = sortImagesForHole(this.state.images.filter(i => i.status === 'done' && i.csvData?.length > 0));
    if (done.length === 0) { alert('No hay imágenes procesadas para exportar.'); return; }
    const head = ['Collar', 'Desde (m)', 'Hasta (m)', 'RQD (%)', 'RQD (m)', 'Recuperacion (%)', 'Recuperacion (m)', 'Imagen'];
    const global = [head, ...done.map(i => i.csvData[i.csvData.length - 1])];
    const fr = [['Sondaje', 'Caja (Imagen)', 'Clase', 'Confianza', 'Desde (m)', 'Hasta (m)']];
    done.forEach(i => i.result?.fracturas_report?.forEach((r: string[]) => fr.push(r)));
    const tacos = [RESULT_HEADERS, ...mergeHoleSegments(done).map(resultRow)];
    const cols = [15, 12, 12, 12, 12, 15, 15, 25].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    const s1 = XLSX.utils.aoa_to_sheet(global); s1['!cols'] = cols;
    const s2 = XLSX.utils.aoa_to_sheet(tacos); s2['!cols'] = cols;
    const s3 = XLSX.utils.aoa_to_sheet(fr); s3['!cols'] = [15, 25, 15, 12, 12, 12].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, s1, 'Reporte Global RQD');
    XLSX.utils.book_append_sheet(wb, s2, 'Taco a Taco');
    XLSX.utils.book_append_sheet(wb, s3, 'Fracturas');
    XLSX.writeFile(wb, 'Reporte_Analisis_RQD.xlsx');
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  renderLayerToggle(key: 'showCores' | 'showFractures' | 'showTacos' | 'showRuler' | 'showCsvLog', label: string) {
    return (
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={this.state[key]}
          onChange={e => this.setState({ [key]: e.target.checked } as any, this.drawCanvasForCurrentItem)}
        />
        {label}
      </label>
    );
  }

  renderCsvSelect(label: string, key: 'csvCollarField' | 'csvFromField' | 'csvToField') {
    return (
      <div className="d-flex mb-1 align-items-center">
        <span style={{ width: 70 }}>{label}</span>
        <select className="form-control" style={{ flex: 1 }} value={this.state[key]}
          onChange={e => this.setState({ [key]: e.target.value } as any, this.drawCanvasForCurrentItem)}>
          <option value="">-- Seleccionar --</option>
          {this.state.csvLogHeaders.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>
    );
  }

  renderSidebar(cur: ImageItem | null) {
    const { images, currentIndex } = this.state;
    return (
      <div className="rqd-sidebar">
        <div className="rqd-card">
          <h6>Panel de Acciones</h6>
          <details className="w-100 mb-2" style={{ cursor: 'pointer' }}>
            <summary className="btn btn-primary w-100" style={{ listStyle: 'none' }}>1. 📁 Cargar Imágenes ▼</summary>
            <div className="d-flex flex-column mt-2" style={{ gap: 8, padding: 12, border: '1px solid #e0e0e0', borderRadius: 6, backgroundColor: '#f9fafb' }}>
              <div className="upload-btn-wrapper w-100">
                <button className="btn btn-outline-primary w-100" style={{ fontSize: '0.85rem', backgroundColor: '#fff' }}>💻 Archivo Local</button>
                <input key={this.state.resetKey} type="file" accept="image/*" multiple
                  onChange={e => { this.handleFileChange(e); closeDetails(e.target); }} />
              </div>
              <button className="btn btn-default w-100" style={{ fontSize: '0.85rem', backgroundColor: '#fff', border: '1px solid #d1d5db' }}
                onClick={e => { this.setState({ showImagoModal: true }); closeDetails(e.currentTarget); }}>☁️ Desde Imago</button>
              <button className="btn btn-success w-100" style={{ fontSize: '0.85rem', fontWeight: 'bold' }}
                onClick={e => { this.setState({ showCameraModal: true }); closeDetails(e.currentTarget); }}>📸 Tomar Foto</button>
            </div>
          </details>
          <button className="btn btn-primary w-100 mb-2" onClick={() => this.analyzeAllImages()} disabled={images.length === 0}>2. ⚡ Analizar Todas</button>
          <button className="btn btn-default w-100 mb-2" onClick={this.exportGlobalCsv} disabled={!images.some(i => i.status === 'done')}>3. 📊 Exportar Excel</button>
          <button className="btn btn-outline-danger w-100" onClick={this.resetWidget} disabled={images.length === 0}>4. 🗑 Limpiar Todo</button>
        </div>

        {images.length > 0 && (
          <div className="rqd-card mt-3">
            <h6>Imágenes Cargadas ({images.length})</h6>
            <select className="form-control" value={currentIndex} onChange={e => this.setState({ currentIndex: Number(e.target.value) })}>
              {images.map((img, i) => (
                <option key={img.id} value={i}>{img.status === 'done' ? '✅ ' : img.status === 'error' ? '❌ ' : '⏳ '}{img.name}</option>
              ))}
            </select>
          </div>
        )}

        {cur && (
          <div className="rqd-card mt-3">
            <h5>Parámetros de Edición</h5>
            <div className="form-group mb-2">
              <label className="rqd-highlighted-label" style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Ancho de Caja m.</label>
              <input type="text" className="form-control rqd-highlighted-input" value={this.state.globalBoxWidth}
                onChange={e => this.handleBoxWidthChange(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.9rem', fontWeight: 600 }} />
            </div>
            <div className="row">
              <div className="col-6 pr-2">
                <div className="form-group">
                  <label style={{ fontSize: '0.75rem' }}>From (m)</label>
                  <input type="text" inputMode="decimal" className="form-control" value={cur.fromDepth}
                    onChange={e => this.handleDepthEdit('fromDepth', e.target.value)} style={{ padding: '4px 6px', fontSize: '0.85rem' }} />
                </div>
              </div>
              <div className="col-6 pl-2">
                <div className="form-group">
                  <label style={{ fontSize: '0.75rem' }}>To (m)</label>
                  <input type="text" inputMode="decimal" className="form-control" value={cur.toDepth}
                    onChange={e => this.handleDepthEdit('toDepth', e.target.value)} style={{ padding: '4px 6px', fontSize: '0.85rem' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {cur?.status === 'done' && (
          <div className="rqd-card mt-3">
            <h5>Capas Visuales</h5>
            <div className="checkbox-grid">
              {this.renderLayerToggle('showCores', 'Núcleos')}
              {this.renderLayerToggle('showFractures', 'Fracturas')}
              {this.renderLayerToggle('showTacos', 'Tacos')}
              {this.renderLayerToggle('showRuler', 'Regla')}
              {this.renderLayerToggle('showCsvLog', 'Logueo (CSV)')}
            </div>
          </div>
        )}

        {cur?.status === 'done' && (
          <div className="rqd-card mt-3">
            <h5>Importar Logueo Litológico (CSV)</h5>
            <input type="file" accept=".csv" onChange={this.handleCsvUpload} style={{ fontSize: '0.75rem', width: '100%', marginBottom: 10 }} />
            {this.state.csvLogHeaders.length > 0 && (
              <div style={{ fontSize: '0.75rem' }}>
                {this.renderCsvSelect('Collar:', 'csvCollarField')}
                {this.renderCsvSelect('Desde (m):', 'csvFromField')}
                {this.renderCsvSelect('Hasta (m):', 'csvToField')}
                <div className="d-flex mb-2 align-items-center">
                  <span style={{ width: 70 }}>Plotear:</span>
                  <select className="form-control" style={{ flex: 1 }} value={this.state.csvPlotField}
                    onChange={e => this.setState({ csvPlotField: e.target.value, csvColorMap: this.generateColorMap(this.state.csvLogData, e.target.value) }, this.drawCanvasForCurrentItem)}>
                    <option value="">-- Seleccionar --</option>
                    {this.state.csvLogHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                {this.state.csvPlotField && (
                  <div className="mt-2" style={{ maxHeight: 100, overflowY: 'auto' }}>
                    <strong style={{ fontSize: '0.7rem' }}>Leyenda:</strong>
                    <div className="d-flex flex-wrap" style={{ gap: 4, marginTop: 4 }}>
                      {Object.entries(this.state.csvColorMap).map(([k, c]) => (
                        <span key={k} style={{ backgroundColor: c, color: '#fff', padding: '1px 4px', borderRadius: 3, fontSize: '0.65rem' }}>{k}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {cur && (cur.status === 'error' || (cur.status === 'done' && cur.errorMsg)) && (
          <div style={{ fontSize: '0.8rem' }} className="alert alert-warning mt-2 py-2 px-3">{cur.errorMsg}</div>
        )}

        {cur?.status === 'done' && cur.result && (
          <div className="rqd-card mt-3">
            <h5>Resultados Numéricos</h5>
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-title">RQD</div>
                <div className="kpi-value">{cur.result.rqd_pct}%</div>
                <div className="kpi-sub">({cur.result.rqd_total_m} m)</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-title">Recuperación</div>
                <div className="kpi-value">{cur.result.recuperacion_pct}%</div>
                <div className="kpi-sub">({cur.result.recuperado_total_m} m)</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  renderRuler() {
    const { min, max } = this.getDepthRange();
    const { major, minor } = this.getTickIntervals();
    const ticks: number[] = [];
    for (let d = Math.ceil(min / minor) * minor; d <= max; d += minor) ticks.push(d);
    const isMajor = (d: number) => Math.abs(d % major) < 0.001 || Math.abs((d % major) - major) < 0.001;
    const label = (top: string, text: string, key: string) => (
      <div key={key} style={{ position: 'absolute', top, right: 0, width: '100%', height: 1 }}>
        <div style={{ position: 'absolute', right: 0, width: 8, height: 1, backgroundColor: '#888' }} />
        <div style={{ position: 'absolute', right: 12, top: -6, fontSize: 11, color: '#666', fontFamily: 'sans-serif' }}>{text}</div>
      </div>
    );
    return (
      <div className="rqd-global-ruler" onMouseMove={this.handleRulerMouseMove} onMouseLeave={this.handleRulerMouseLeave}
        onClick={this.handleRulerClick} onMouseDown={e => e.stopPropagation()}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 60, backgroundColor: '#F4F4F4', zIndex: 15, cursor: 'crosshair' }}>
        <div style={{ position: 'absolute', top: 20, bottom: 20, left: 0, right: 0, borderRight: '2px solid #888' }}>
          {ticks.map(d => {
            const top = `${((d - min) / (max - min)) * 100}%`;
            return isMajor(d)
              ? label(top, d.toFixed(0), `tick-${d}`)
              : <div key={`tick-${d}`} style={{ position: 'absolute', top, right: 0, width: 4, height: 1, backgroundColor: '#ccc' }} />;
          })}
          {Math.abs(min % major) > 0.001 && label('0%', min.toFixed(2), 'min')}
          {Math.abs(max % major) > 0.001 && label('100%', max.toFixed(2), 'max')}
        </div>
        <div ref={this.rulerTooltipRef} style={{
          position: 'absolute', left: 60, display: 'none', backgroundColor: '#e5e5e5', padding: '4px 12px', borderRadius: 4,
          border: '1px solid #d0d0d0', fontWeight: 'bold', fontSize: 13, pointerEvents: 'none', transform: 'translateY(-50%)',
          boxShadow: '2px 2px 5px rgba(0,0,0,0.1)', color: '#333',
        }}>0.00</div>
      </div>
    );
  }

  renderLightTable() {
    const { images, currentIndex } = this.state;
    return (
      <div ref={this.containerRef} className="rqd-preview-container"
        onWheel={this.handleWheel} onMouseDown={this.handleMouseDown} onMouseMove={this.handleMouseMove}
        onMouseUp={this.handleMouseUp} onMouseLeave={this.handleMouseUp}
        onTouchStart={this.handleTouchStart} onTouchMove={this.handleTouchMove} onTouchEnd={this.handleMouseUp}
        style={{ display: this.props.view === 'light_table' ? 'block' : 'none', cursor: 'grab', position: 'relative', overflow: 'hidden' }}>
        {this.renderRuler()}
        <div ref={this.wrapperRef} className="rqd-zoom-wrapper" style={{
          display: 'flex', flexDirection: 'column', padding: 40, backgroundColor: 'white',
          boxShadow: '0 0 10px rgba(0,0,0,0.05)', margin: '40px auto', width: 'fit-content', position: 'relative',
          transform: `translate(${this.zoomOffsetX}px, ${this.zoomOffsetY}px) scale(${this.zoomScale})`, transformOrigin: '0 0',
        }}>
          <div style={{ paddingLeft: 80, marginBottom: 8, fontFamily: 'sans-serif' }}>
            <div style={{ fontSize: 18 }}>{images[0]?.collar || '—'}</div>
            <div style={{ fontSize: 18, fontWeight: 'bold' }}>Core Boxes</div>
            <div style={{ fontSize: 16 }}>Dry</div>
          </div>
          {images.map((img, i) => (
            <div key={img.id} className={`rqd-box-row ${currentIndex === i ? 'active-box' : ''}`}
              onClick={() => this.setState({ currentIndex: i })} style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
              <div className="rqd-depth-labels" style={{ width: 120, textAlign: 'right', paddingRight: 20, color: '#333', fontSize: 48, fontWeight: 'bold', flexShrink: 0, position: 'relative' }}>
                <div style={{ position: 'absolute', top: -28, right: 20 }}>{img.fromDepth ? parseFloat(img.fromDepth).toFixed(2) : '0.00'}</div>
                {i === images.length - 1 && (
                  <div style={{ position: 'absolute', bottom: -28, right: 20 }}>{img.toDepth ? parseFloat(img.toDepth).toFixed(2) : ''}</div>
                )}
              </div>
              <div className="rqd-box-canvas-container" style={{
                border: currentIndex === i ? '4px solid var(--primary)' : '2px solid transparent',
                borderBottom: '1px solid #ddd', transition: 'border 0.2s', padding: 2, backgroundColor: '#fff',
              }}>
                <canvas ref={c => { this.canvasRefs[img.id] = c; }} style={{ display: 'block' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  renderGallery() {
    return (
      <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: '#F4F4F4', padding: '40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {this.state.images.map((img, i) => (
            <div key={img.id} onClick={() => this.setState({ currentIndex: i })} style={{ backgroundColor: 'white', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
              <div style={{ padding: '8px 12px', backgroundColor: '#f9f9f9', borderBottom: '1px solid #eee', fontSize: 14, fontWeight: 'bold', color: '#333', textAlign: 'center' }}>
                {img.fromDepth || '0.00'} - {img.toDepth || '0.00'}
                {img.result && <span style={{ fontWeight: 400, color: '#666' }}> · RQD {img.result.rqd_pct}%</span>}
              </div>
              <div style={{ width: '100%', height: 200, backgroundColor: '#eee', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                <img src={img.origImg ? img.origImg.src : URL.createObjectURL(img.file)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  editTaco = (cajaIdx: number) => {
    // null primero para que el mismo taco vuelva a enfocarse si se pide de nuevo
    this.setState({ stripTab: 'tacos', focusTaco: null }, () => this.setState({ focusTaco: cajaIdx }));
  };

  locateTaco = (cajaIdx: number) => {
    const segs = this.state.images[this.state.currentIndex]?.result?.tacoSegments || [];
    let seg = segs.findIndex((t: any) => t.endTacoIdx === cajaIdx);
    if (seg === -1) seg = segs.findIndex((t: any) => t.startTacoIdx === cajaIdx);
    this.setState({ stripTab: 'strip', focusSegment: null }, () => this.setState({ focusSegment: seg === -1 ? null : seg }));
  };

  renderStripPanel(cur: ImageItem | null) {
    const { stripOpen, stripTab, focusSegment, focusTaco } = this.state;
    if (!stripOpen) {
      return (
        <button type="button" className="rqd-strip-reopen" onClick={() => this.setState({ stripOpen: true })} title="Mostrar panel">
          ◀ Tacos / Strip log
        </button>
      );
    }
    const nTacos = cur?.result?.tacoOrder?.length ?? 0;
    const nBad = cur?.result?.rejectedTacos?.length ?? 0;
    return (
      <aside className="rqd-strip-panel">
        <div className="rqd-strip-header">
          <div className="rqd-strip-tabs">
            <button type="button" className={stripTab === 'tacos' ? 'active' : ''} onClick={() => this.setState({ stripTab: 'tacos' })}>
              Tacos ({nTacos}){nBad > 0 && <span className="tab-badge">{nBad}</span>}
            </button>
            <button type="button" className={stripTab === 'strip' ? 'active' : ''} onClick={() => this.setState({ stripTab: 'strip' })}>Strip log</button>
          </div>
          <button type="button" className="rqd-strip-close" onClick={() => this.setState({ stripOpen: false })} title="Ocultar">▶</button>
        </div>
        <div className="rqd-strip-body">
          {stripTab === 'tacos' ? (
            <TacoList
              item={cur}
              focusTaco={focusTaco}
              onChange={(cajaIdx, v) => this.handleTacoEdit(this.state.currentIndex, cajaIdx, v)}
              onLocate={this.locateTaco}
            />
          ) : (
            <StripLog item={cur} focusSegment={focusSegment} onEditTaco={this.editTaco} />
          )}
        </div>
      </aside>
    );
  }

  render() {
    const { images, currentIndex, loading, loadingMessage } = this.state;
    const cur = currentIndex >= 0 ? images[currentIndex] : null;
    const { view } = this.props;

    return (
      <div className="widget-rqd embedded">
        <div className="rqd-main-layout">
          {this.renderSidebar(cur)}

          {cur ? (
            <div className={`rqd-preview-pane ${cur.status === 'done' ? 'status-done' : ''}`}>
              {loading && (
                <div className="rqd-loading-overlay">
                  <div className="spinner" />
                  <p>{loadingMessage}</p>
                </div>
              )}
              {this.renderLightTable()}
              {view === 'light_table' && (
                <ResultsTable
                  images={images}
                  currentImageId={cur.id}
                  collapsed={this.state.resultsCollapsed}
                  onToggle={() => this.setState(s => ({ resultsCollapsed: !s.resultsCollapsed }))}
                  onSelect={(imageId, segIndex) => {
                    const idx = images.findIndex(i => i.id === imageId);
                    if (idx === -1) return;
                    this.setState({ stripTab: 'strip', focusSegment: null }, () => this.setState({ focusSegment: segIndex }));
                    this.scrollToImage(idx);
                  }}
                />
              )}
              {view === 'gallery' && this.renderGallery()}
              {view === 'map' && (
                <div style={{ width: '100%', height: '100%', backgroundColor: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ color: '#555', fontSize: 16 }}>No selected imagery contains coordinate data.</div>
                </div>
              )}
            </div>
          ) : (
            <div className="rqd-preview-pane">
              <div className="rqd-empty-state">
                <div className="rqd-empty-state-icon">📁</div>
                <h4>No hay imágenes cargadas</h4>
                <p className="text-muted">Por favor, utilice el Panel de Acciones a la izquierda para comenzar.</p>
              </div>
            </div>
          )}

          {images.length > 0 && view === 'light_table' && this.renderStripPanel(cur)}
        </div>

        <ImagoLoginModal
          isOpen={this.state.showImagoModal}
          onClose={() => this.setState({ showImagoModal: false })}
          onLoadImages={this.handleImagoImport}
        />
        <CameraCropModal
          isOpen={this.state.showCameraModal}
          initialSondaje={this.state.lastCameraSondaje}
          initialFrom={this.state.lastCameraToDepth}
          onClose={() => this.setState({ showCameraModal: false })}
          onConfirm={this.handleCameraPhoto}
        />
      </div>
    );
  }
}
