import React, { useRef } from 'react';

interface Props {
  direction: 'x' | 'y';                 // x = borde vertical (cambia ancho), y = borde horizontal (cambia alto)
  onResize: (deltaPx: number) => void;  // desplazamiento desde el inicio del arrastre
  onStart?: () => void;
  onDoubleClick?: () => void;           // doble clic = ocultar/mostrar
  title?: string;
}

/** Barra para arrastrar y redimensionar un panel (ratón y táctil). */
export default function Splitter({ direction, onResize, onStart, onDoubleClick, title }: Props) {
  const start = useRef<number | null>(null);
  return (
    <div
      className={`rqd-splitter ${direction}`}
      title={title || 'Arrastra para cambiar el tamaño · doble clic para ocultar'}
      onPointerDown={e => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = direction === 'x' ? e.clientX : e.clientY;
        onStart?.();
        document.body.classList.add('rqd-resizing');
      }}
      onPointerMove={e => {
        if (start.current === null) return;
        onResize((direction === 'x' ? e.clientX : e.clientY) - start.current);
      }}
      onPointerUp={e => {
        start.current = null;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        document.body.classList.remove('rqd-resizing');
      }}
      onDoubleClick={onDoubleClick}
    />
  );
}
