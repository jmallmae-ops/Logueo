export async function loadONNXRuntime() {
  if ((window as any).ort) return (window as any).ort;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.js';
    script.onload = () => resolve((window as any).ort);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function loadTesseract() {
  if ((window as any).Tesseract) return (window as any).Tesseract;
  return new Promise((resolve, reject) => {
    // Hide AMD define to force UMD to expose global Tesseract
    const originalDefine = (window as any).define;
    if (originalDefine && originalDefine.amd) {
      (window as any).define = undefined;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => {
      if (originalDefine) {
        (window as any).define = originalDefine;
      }
      resolve((window as any).Tesseract);
    };
    script.onerror = (e) => {
      if (originalDefine) {
        (window as any).define = originalDefine;
      }
      reject(e);
    };
    document.head.appendChild(script);
  });
}

let tesseractWorker: any = null;
export async function initTesseractWorker() {
  const Tesseract = await loadTesseract();
  if (!tesseractWorker) {
    tesseractWorker = await (Tesseract as any).createWorker('eng');
    // Removed whitelist to prevent forcing letters (like 'm') into digits (like '3')
  }
  return tesseractWorker;
}

function extractNumber(text: string): number | null {
  // Remove all characters except digits, dots, and commas
  let clean = text.replace(/[^\d\.,]/g, '');
  if (!clean) return null;

  // Standardize decimal separator
  clean = clean.replace(/,/g, '.');

  const dotIndex = clean.lastIndexOf('.');
  if (dotIndex !== -1) {
    // It found a dot. Clean any extra dots.
    const integer = clean.substring(0, dotIndex).replace(/\./g, '');
    const decimal = clean.substring(dotIndex + 1).replace(/\./g, '');
    const parsed = parseFloat(`${integer}.${decimal}`);
    return isNaN(parsed) ? null : parsed;
  } else {
    // No dot found! Tesseract missed it (e.g. read "1060" instead of "10.60")
    // Rule: Tacos always have 2 decimals.
    if (clean.length >= 3) {
      const integerPart = clean.slice(0, -2);
      const decimalPart = clean.slice(-2);
      const parsed = parseFloat(`${integerPart}.${decimalPart}`);
      return isNaN(parsed) ? null : parsed;
    }
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? null : parsed;
  }
}

export interface OcrReading { value: number; conf: number; }

/** Igual que recognizeCrop, pero devuelve todas las lecturas con su confianza (0-100). */
export async function recognizeCropDetailed(worker: any, canvas: HTMLCanvasElement, rotate90: boolean = false): Promise<OcrReading[]> {
  const readings: OcrReading[] = [];
  await recognizeCrop(worker, canvas, rotate90, readings);
  // Una lectura por valor (la de mayor confianza), ordenadas de mejor a peor
  const best = new Map<number, number>();
  readings.forEach(r => { if ((best.get(r.value) ?? -1) < r.conf) best.set(r.value, r.conf); });
  return Array.from(best.entries()).map(([value, conf]) => ({ value, conf })).sort((a, b) => b.conf - a.conf);
}

export async function recognizeCrop(worker: any, canvas: HTMLCanvasElement, rotate90: boolean = false, collect?: OcrReading[]): Promise<number | null> {
  const psmModes = [3, 7]; 
  
  let angles = [0];
  if (rotate90) {
    angles = [-90, 90]; 
  }

  let bestNum: number | null = null;
  let bestConf = -1;

  for (const angle of angles) {
    const finalCanvas = document.createElement('canvas');
    // Emulando cv2.resize(..., fx=2, fy=2, INTER_CUBIC)
    const scale = 2; 
    
    const cropX = canvas.width * 0.05;
    const cropY = canvas.height * 0.05;
    const cropW = canvas.width * 0.90;
    const cropH = canvas.height * 0.90;
    
    const padding = 20 * scale; 
    
    let drawW = cropW * scale;
    let drawH = cropH * scale;
    
    if (angle === 0) {
      finalCanvas.width = drawW + padding * 2;
      finalCanvas.height = drawH + padding * 2;
    } else {
      finalCanvas.width = drawH + padding * 2;
      finalCanvas.height = drawW + padding * 2;
    }
    
    const ctx = finalCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    
    ctx.translate(finalCanvas.width / 2, finalCanvas.height / 2);
    ctx.rotate(angle * Math.PI / 180);
    
    // Emulando cv2.GaussianBlur(..., (5,5), 0)
    ctx.filter = 'blur(1px)';
    ctx.drawImage(canvas, cropX, cropY, cropW, cropH, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.filter = 'none'; // reset
    
    const processCtx = finalCanvas.getContext('2d')!;
    const imgData = processCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
    const data = imgData.data;
    
    // 1. Convert to grayscale directly
    const grayData = new Uint8Array(finalCanvas.width * finalCanvas.height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      grayData[j] = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
    }
    
    // 2. Otsu's Thresholding Algorithm (Emulando cv2.THRESH_OTSU)
    let hist = new Int32Array(256);
    for (let i = 0; i < grayData.length; i++) {
      hist[grayData[i]]++;
    }
    
    let total = grayData.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    
    let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 0;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      
      sumB += i * hist[i];
      let mB = sumB / wB;
      let mF = (sum - sumB) / wF;
      let varBetween = wB * wF * (mB - mF) * (mB - mF);
      
      if (varBetween > varMax) {
        varMax = varBetween;
        threshold = i;
      }
    }
    
    // Apply Otsu Threshold
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const val = grayData[j] < threshold ? 0 : 255;
      data[i] = data[i+1] = data[i+2] = val;
    }
    processCtx.putImageData(imgData, 0, 0);

    for (const psm of psmModes) {
      // Emulando --oem 3 --psm 3
      await worker.setParameters({ 
        tessjs_create_osd: '0', 
        tessedit_pageseg_mode: psm.toString(),
        tessedit_char_whitelist: '0123456789.'
      });
      const { data: ocrData } = await worker.recognize(finalCanvas);
      
      let num = extractNumber(ocrData.text);
      if (num !== null && num > 1000) num = num / 100;
      if (num !== null && collect) collect.push({ value: num, conf: ocrData.confidence });
      
      if (num !== null && ocrData.confidence > bestConf) {
        bestConf = ocrData.confidence;
        bestNum = num;
      }
    }
  }

  if (bestConf > 10) {
    return bestNum;
  }
  return null;
}

export function drawImageToCanvas(file: File, targetSize: number = 1024): Promise<{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, imgData: ImageData, scale: number, padX: number, padY: number, origW: number, origH: number, origImg: HTMLImageElement}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      
      const scale = Math.min(targetSize / img.width, targetSize / img.height);
      const newW = img.width * scale;
      const newH = img.height * scale;
      const padX = (targetSize - newW) / 2;
      const padY = (targetSize - newH) / 2;

      // Fill with gray (114, 114, 114) for YOLO
      ctx.fillStyle = 'rgb(114, 114, 114)';
      ctx.fillRect(0, 0, targetSize, targetSize);
      ctx.drawImage(img, padX, padY, newW, newH);

      const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
      URL.revokeObjectURL(img.src);
      resolve({canvas, ctx, imgData, scale, padX, padY, origW: img.width, origH: img.height, origImg: img});
    };
    img.onerror = reject;
  });
}

export function preprocess(imgData: ImageData, isUnet: boolean = false): Float32Array {
  const { data, width, height } = imgData;
  const tensor = new Float32Array(1 * 3 * width * height);
  if (isUnet) {
    // ImageNet normalization
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    for (let i = 0; i < width * height; i++) {
      tensor[i] = ((data[i * 4] / 255.0) - mean[0]) / std[0]; // R
      tensor[width * height + i] = ((data[i * 4 + 1] / 255.0) - mean[1]) / std[1]; // G
      tensor[2 * width * height + i] = ((data[i * 4 + 2] / 255.0) - mean[2]) / std[2]; // B
    }
  } else {
    for (let i = 0; i < width * height; i++) {
      tensor[i] = data[i * 4] / 255.0; // R
      tensor[width * height + i] = data[i * 4 + 1] / 255.0; // G
      tensor[2 * width * height + i] = data[i * 4 + 2] / 255.0; // B
    }
  }
  return tensor;
}

function iou(box1: number[], box2: number[]) {
  const x1 = Math.max(box1[0], box2[0]);
  const y1 = Math.max(box1[1], box2[1]);
  const x2 = Math.min(box1[2], box2[2]);
  const y2 = Math.min(box1[3], box2[3]);
  const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const box1Area = (box1[2] - box1[0]) * (box1[3] - box1[1]);
  const box2Area = (box2[2] - box2[0]) * (box2[3] - box2[1]);
  return interArea / (box1Area + box2Area - interArea);
}

export function nms(boxes: any[], iouThreshold: number) {
  boxes.sort((a, b) => b.prob - a.prob);
  const selected = [];
  const active = new Array(boxes.length).fill(true);
  for (let i = 0; i < boxes.length; i++) {
    if (!active[i]) continue;
    selected.push(boxes[i]);
    for (let j = i + 1; j < boxes.length; j++) {
      if (active[j] && iou(boxes[i].box, boxes[j].box) > iouThreshold) {
        active[j] = false;
      }
    }
  }
  return selected;
}

export function getExpectedSize(session: any): number {
  try {
    // In some versions of ort, session.inputs is available
    const inputName = session.inputNames[0];
    const input = session.inputs ? session.inputs[inputName] : null;
    if (input && input.dims && input.dims.length >= 4) {
      return input.dims[2];
    }
  } catch (e) {}
  return 640; // Default fallback
}

export function postprocess(output: Float32Array, numClasses: number, targetSize: number, scale: number, padX: number, padY: number, origW: number, origH: number, confThreshold: number) {
  const numAnchors = output.length / (4 + numClasses);
  const boxes = [];

  for (let i = 0; i < numAnchors; i++) {
    let maxClassProb = 0;
    let maxClassId = -1;
    for (let c = 0; c < numClasses; c++) {
      const prob = output[(4 + c) * numAnchors + i];
      if (prob > maxClassProb) {
        maxClassProb = prob;
        maxClassId = c;
      }
    }

    if (maxClassProb > confThreshold) {
      const xc = output[0 * numAnchors + i];
      const yc = output[1 * numAnchors + i];
      const w = output[2 * numAnchors + i];
      const h = output[3 * numAnchors + i];

      let x1 = (xc - w / 2 - padX) / scale;
      let y1 = (yc - h / 2 - padY) / scale;
      let x2 = (xc + w / 2 - padX) / scale;
      let y2 = (yc + h / 2 - padY) / scale;

      x1 = Math.max(0, Math.min(x1, origW));
      y1 = Math.max(0, Math.min(y1, origH));
      x2 = Math.max(0, Math.min(x2, origW));
      y2 = Math.max(0, Math.min(y2, origH));

      boxes.push({ box: [x1, y1, x2, y2], prob: maxClassProb, classId: maxClassId });
    }
  }

  return nms(boxes, 0.45);
}

export async function runInference(ort: any, session: any, tensorData: Float32Array) {
  const size = Math.sqrt(tensorData.length / 3);
  const tensor = new ort.Tensor('float32', tensorData, [1, 3, size, size]);
  const feeds: Record<string, any> = {};
  feeds[session.inputNames[0]] = tensor;
  const results = await session.run(feeds);
  return results[session.outputNames[0]].data as Float32Array;
}

export function postprocessSegmentation(
  output0: Float32Array,
  output1: Float32Array,
  numClasses: number,
  targetSize: number,
  scale: number,
  padX: number,
  padY: number,
  origW: number,
  origH: number,
  confThreshold: number
) {
  const numMasks = 32;
  const numAnchors = output0.length / (4 + numClasses + numMasks);
  const maskW = Math.sqrt(output1.length / numMasks);
  const maskH = maskW;
  
  const boxes = [];

  for (let i = 0; i < numAnchors; i++) {
    let maxClassProb = 0;
    let maxClassId = -1;
    for (let c = 0; c < numClasses; c++) {
      const prob = output0[(4 + c) * numAnchors + i];
      if (prob > maxClassProb) {
        maxClassProb = prob;
        maxClassId = c;
      }
    }

    if (maxClassProb > confThreshold) {
      const xc = output0[0 * numAnchors + i];
      const yc = output0[1 * numAnchors + i];
      const w = output0[2 * numAnchors + i];
      const h = output0[3 * numAnchors + i];

      let x1 = (xc - w / 2 - padX) / scale;
      let y1 = (yc - h / 2 - padY) / scale;
      let x2 = (xc + w / 2 - padX) / scale;
      let y2 = (yc + h / 2 - padY) / scale;

      x1 = Math.max(0, Math.min(x1, origW));
      y1 = Math.max(0, Math.min(y1, origH));
      x2 = Math.max(0, Math.min(x2, origW));
      y2 = Math.max(0, Math.min(y2, origH));

      const maskCoeffs = new Float32Array(numMasks);
      for (let m = 0; m < numMasks; m++) {
        maskCoeffs[m] = output0[(4 + numClasses + m) * numAnchors + i];
      }

      boxes.push({ 
        box: [x1, y1, x2, y2], 
        prob: maxClassProb, 
        classId: maxClassId,
        maskCoeffs,
        rawBox: [xc, yc, w, h]
      });
    }
  }

  const selectedBoxes = nms(boxes, 0.55);

  for (const item of selectedBoxes) {
    const mask = new Float32Array(maskW * maskH);
    for (let i = 0; i < maskW * maskH; i++) {
      let val = 0;
      for (let m = 0; m < numMasks; m++) {
        val += item.maskCoeffs[m] * output1[m * maskW * maskH + i];
      }
      mask[i] = 1 / (1 + Math.exp(-val));
    }
    item.mask = mask;
  }

  return selectedBoxes;
}

export async function runSegmentationInference(ort: any, session: any, tensorData: Float32Array) {
  const size = Math.sqrt(tensorData.length / 3);
  const tensor = new ort.Tensor('float32', tensorData, [1, 3, size, size]);
  const feeds: Record<string, any> = {};
  feeds[session.inputNames[0]] = tensor;
  const results = await session.run(feeds);
  
  const outNames = session.outputNames;
  
  if (outNames.length === 1) {
    // UNet
    return { output0: results[outNames[0]].data as Float32Array, output1: null };
  }
  
  let output0, output1;
  if (results[outNames[0]].dims[1] === 32) {
      output1 = results[outNames[0]].data;
      output0 = results[outNames[1]].data;
  } else {
      output0 = results[outNames[0]].data;
      output1 = results[outNames[1]].data;
  }
  return { output0, output1 };
}

function findConnectedComponents(mask: Uint8Array, width: number, height: number): Array<{box: [number, number, number, number], area: number, indices: number[]}> {
  const visited = new Uint8Array(width * height);
  const components: Array<{box: [number, number, number, number], area: number, indices: number[]}> = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 1 && visited[idx] === 0) {
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let area = 0;
        const indices: number[] = [];
        
        const queue: number[] = [idx];
        visited[idx] = 1;
        
        let qHead = 0;
        while (qHead < queue.length) {
          const currIdx = queue[qHead++];
          const currX = currIdx % width;
          const currY = Math.floor(currIdx / width);
          
          area++;
          indices.push(currIdx);
          
          if (currX < minX) minX = currX;
          if (currX > maxX) maxX = currX;
          if (currY < minY) minY = currY;
          if (currY > maxY) maxY = currY;
          
          // Inline neighbor checks to avoid array allocations in loop
          if (currX > 0) {
            const nIdx = currIdx - 1;
            if (mask[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
          if (currX < width - 1) {
            const nIdx = currIdx + 1;
            if (mask[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
          if (currY > 0) {
            const nIdx = currIdx - width;
            if (mask[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
          if (currY < height - 1) {
            const nIdx = currIdx + width;
            if (mask[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
        }
        
        if (area > 100) {
          components.push({
            box: [minX, minY, maxX, maxY],
            area,
            indices
          });
        }
      }
    }
  }
  return components;
}

export function postprocessUnet(
  output: Float32Array,
  targetSize: number,
  scale: number,
  padX: number,
  padY: number,
  origW: number,
  origH: number,
  confThreshold: number
) {
  const width = targetSize;
  const height = targetSize;
  
  const nucleoMask = new Uint8Array(width * height);
  const tacoMask = new Uint8Array(width * height);
  const nucleoProbs = new Float32Array(width * height);
  const tacoProbs = new Float32Array(width * height);
  
  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    const l0 = output[i];
    const l1 = output[totalPixels + i];
    const l2 = output[2 * totalPixels + i];
    
    // Fast argmax and lazy softmax to avoid Math.exp calls on background pixels
    if (l1 > l2 && l1 > l0) {
      const exp0 = Math.exp(l0 - l1);
      const exp2 = Math.exp(l2 - l1);
      const p1 = 1 / (exp0 + 1 + exp2);
      if (p1 > confThreshold) {
        nucleoMask[i] = 1;
        nucleoProbs[i] = p1;
      }
    } else if (l2 > l1 && l2 > l0) {
      const exp0 = Math.exp(l0 - l2);
      const exp1 = Math.exp(l1 - l2);
      const p2 = 1 / (exp0 + 1 + exp1);
      if (p2 > confThreshold) {
        tacoMask[i] = 1;
        tacoProbs[i] = p2;
      }
    }
  }
  
  const nucleoComponents = findConnectedComponents(nucleoMask, width, height);
  const tacoComponents = findConnectedComponents(tacoMask, width, height);
  
  const boxes = [];
  
  for (const comp of nucleoComponents) {
    const [minX, minY, maxX, maxY] = comp.box;
    let x1 = (minX - padX) / scale;
    let y1 = (minY - padY) / scale;
    let x2 = (maxX - padX) / scale;
    let y2 = (maxY - padY) / scale;
    
    x1 = Math.max(0, Math.min(x1, origW));
    y1 = Math.max(0, Math.min(y1, origH));
    x2 = Math.max(0, Math.min(x2, origW));
    y2 = Math.max(0, Math.min(y2, origH));
    
    let sumProb = 0;
    for (let j = 0; j < comp.indices.length; j++) {
      sumProb += nucleoProbs[comp.indices[j]];
    }
    const avgProb = sumProb / comp.indices.length;
    
    const compMask = new Float32Array(totalPixels);
    for (let j = 0; j < comp.indices.length; j++) {
      const idx = comp.indices[j];
      compMask[idx] = nucleoProbs[idx];
    }
    
    boxes.push({
      box: [x1, y1, x2, y2],
      prob: avgProb,
      classId: 0,
      mask: compMask,
      rawBox: [minX, minY, maxX - minX, maxY - minY]
    });
  }
  
  for (const comp of tacoComponents) {
    const [minX, minY, maxX, maxY] = comp.box;
    let x1 = (minX - padX) / scale;
    let y1 = (minY - padY) / scale;
    let x2 = (maxX - padX) / scale;
    let y2 = (maxY - padY) / scale;
    
    x1 = Math.max(0, Math.min(x1, origW));
    y1 = Math.max(0, Math.min(y1, origH));
    x2 = Math.max(0, Math.min(x2, origW));
    y2 = Math.max(0, Math.min(y2, origH));
    
    let sumProb = 0;
    for (let j = 0; j < comp.indices.length; j++) {
      sumProb += tacoProbs[comp.indices[j]];
    }
    const avgProb = sumProb / comp.indices.length;
    
    const compMask = new Float32Array(totalPixels);
    for (let j = 0; j < comp.indices.length; j++) {
      const idx = comp.indices[j];
      compMask[idx] = tacoProbs[idx];
    }
    
    boxes.push({
      box: [x1, y1, x2, y2],
      prob: avgProb,
      classId: 1,
      mask: compMask,
      rawBox: [minX, minY, maxX - minX, maxY - minY]
    });
  }
  
  return boxes;
}
