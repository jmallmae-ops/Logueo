export interface ImageItem {
  id: string;
  file: File;
  name: string;
  collar: string;
  fromDepth: string;
  toDepth: string;
  boxWidth: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  errorMsg: string;
  result: any;
  csvData: string[][];
  csvDataTacos: string[][];

  origImg: HTMLImageElement | null;
  origW: number;
  origH: number;
  scale: number;
  padX: number;
  padY: number;
  cajas: any[];
  fracturas: any[];
  filas: any[];
}
