import React, { useState, useMemo, useRef } from 'react';
import { Square, Circle as CircleIcon, Triangle as TriangleIcon, CircleDot, Hexagon, Octagon, Download, ZoomIn, ZoomOut, Maximize, FileText, Sparkles, Loader2, Upload, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'donut' | 'ellipse' | 'semicircle' | 'u-shape' | 'c-shape' | 't-shape' | 'hollow-rect' | 'hexagon' | 'octagon' | 'custom';
type LayoutType = 'grid' | 'staggered';

interface Point { x: number; y: number; }

interface SavedShape {
  id: string;
  name: string;
  path: string;
  image?: string | null;
}

const Input = ({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) => (
  <div>
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">{label}</label>
    <input 
      type="number" 
      value={value} 
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono bg-white"
    />
  </div>
);

const TextInput = ({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) => (
  <div>
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">{label}</label>
    <input 
      type="text" 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono bg-white"
    />
  </div>
);

const preprocessImage = (dataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        totalBrightness += v;
      }
      const avgBrightness = totalBrightness / (data.length / 4);
      const threshold = avgBrightness * 0.9; 

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const bin = v >= threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = bin;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

export default function App() {
  const [shape, setShape] = useState<ShapeType>('rectangle');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [rectW, setRectW] = useState(500);
  const [rectH, setRectH] = useState(500);
  const [circleD, setCircleD] = useState(500);
  const [triA, setTriA] = useState(500);
  const [triB, setTriB] = useState(500);
  const [triC, setTriC] = useState(500);
  const [donutOuterD, setDonutOuterD] = useState(2400);
  const [donutInnerD, setDonutInnerD] = useState(1200);
  const [ellipseW, setEllipseW] = useState(800);
  const [ellipseH, setEllipseH] = useState(500);
  const [semicircleD, setSemicircleD] = useState(1000);
  const [uW, setUW] = useState(800);
  const [uH, setUH] = useState(800);
  const [uT, setUT] = useState(200);
  const [cW, setCW] = useState(800);
  const [cH, setCH] = useState(800);
  const [cT, setCT] = useState(200);
  const [tW, setTW] = useState(800);
  const [tH, setTH] = useState(800);
  const [tT, setTT] = useState(200);
  const [hRectW, setHRectW] = useState(1000);
  const [hRectH, setHRectH] = useState(600);
  const [hRectT, setHRectT] = useState(150);
  const [hexW, setHexW] = useState(800);
  const [hexH, setHexH] = useState(800);
  const [octW, setOctW] = useState(800);
  const [octH, setOctH] = useState(800);
  const [modW, setModW] = useState(44);
  const [modH, setModH] = useState(38);
  const [spaceX, setSpaceX] = useState(150);
  const [spaceY, setSpaceY] = useState(150);
  const [objectName, setObjectName] = useState('SC-01');
  const [moduleName, setModuleName] = useState('SLM04');
  const [layoutType, setLayoutType] = useState<LayoutType>('grid');
  const [showCenterLines, setShowCenterLines] = useState(true);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  interface DocumentDetails {
    projectName: string;
    location: string;
    projectNumber: string;
    date: string;
    client: string;
    drawingTitle: string;
    status: string;
    designBy: string;
    checkedBy: string;
    approvedBy: string;
  }

  const [docDetails, setDocDetails] = useState<DocumentDetails>({
    projectName: 'XXXXXXXXXX',
    location: 'XXXXXXXXXX',
    projectNumber: 'XXXX-XXX',
    date: 'XX/XX/2026',
    client: '',
    drawingTitle: 'Floor plan',
    status: 'Draft, Design , Development',
    designBy: 'DRAFT01',
    checkedBy: 'Visawa.De',
    approvedBy: ''
  });

  interface PageData {
    id: string;
    svgContent: string;
    viewBox: string;
    bbW: number;
    bbH: number;
    name: string;
  }
  const [pages, setPages] = useState<PageData[]>([]);
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const [savedShapes, setSavedShapes] = useState<SavedShape[]>(() => {
    try {
      const saved = localStorage.getItem('savedCustomShapes');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [newShapeName, setNewShapeName] = useState('');

  React.useEffect(() => {
    localStorage.setItem('savedCustomShapes', JSON.stringify(savedShapes));
  }, [savedShapes]);

  React.useEffect(() => {
    if ((modW === 44 && modH === 38) || (modW === 38 && modH === 44)) {
      setModuleName('SLM04');
    } else {
      setModuleName(`${modW}x${modH}`);
    }
  }, [modW, modH]);

  const result = useMemo(() => {
    let modules: {x: number, y: number, w: number, h: number}[] = [];
    let shapePath = '';
    let bbW = 0;
    let bbH = 0;
    let error = '';
    let triPts: Point[] = [];
    let hexPts: Point[] = [];
    let octPts: Point[] = [];

    if (modW <= 0 || modH <= 0 || spaceX <= 0 || spaceY <= 0) {
      return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Module dimensions and spacing must be > 0' };
    }

    if (shape === 'rectangle') {
      if (rectW <= 0 || rectH <= 0) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Dimensions must be > 0' };
      bbW = rectW; bbH = rectH;
      shapePath = `M 0 0 L ${bbW} 0 L ${bbW} ${bbH} L 0 ${bbH} Z`;
    } else if (shape === 'circle') {
      if (circleD <= 0) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Diameter must be > 0' };
      bbW = circleD; bbH = circleD;
      const r = circleD / 2;
      shapePath = `M ${r} ${r} m -${r}, 0 a ${r},${r} 0 1,0 ${circleD},0 a ${r},${r} 0 1,0 -${circleD},0`;
    } else if (shape === 'triangle') {
      if (triA <= 0 || triB <= 0 || triC <= 0) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Sides must be > 0' };
      if (triA + triB <= triC || triA + triC <= triB || triB + triC <= triA) {
        return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Invalid triangle sides' };
      }
      const a = triA, b = triB, c = triC;
      const xC = (b*b + c*c - a*a) / (2*c);
      const yC = Math.sqrt(b*b - xC*xC);
      let ptA = {x: 0, y: 0}, ptB = {x: c, y: 0}, ptC = {x: xC, y: yC};
      const minX = Math.min(ptA.x, ptB.x, ptC.x), maxX = Math.max(ptA.x, ptB.x, ptC.x);
      const minY = Math.min(ptA.y, ptB.y, ptC.y), maxY = Math.max(ptA.y, ptB.y, ptC.y);
      bbW = maxX - minX; bbH = maxY - minY;
      ptA = {x: ptA.x - minX, y: ptA.y - minY};
      ptB = {x: ptB.x - minX, y: ptB.y - minY};
      ptC = {x: ptC.x - minX, y: ptC.y - minY};
      triPts = [ptA, ptB, ptC];
      shapePath = `M ${ptA.x} ${ptA.y} L ${ptB.x} ${ptB.y} L ${ptC.x} ${ptC.y} Z`;
    } else if (shape === 'donut') {
      if (donutOuterD <= 0 || donutInnerD <= 0 || donutInnerD >= donutOuterD) {
        return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Invalid donut dimensions' };
      }
      bbW = donutOuterD; bbH = donutOuterD;
      const rOuter = donutOuterD / 2;
      const rInner = donutInnerD / 2;
      shapePath = `M ${rOuter} ${rOuter} m -${rOuter}, 0 a ${rOuter},${rOuter} 0 1,0 ${donutOuterD},0 a ${rOuter},${rOuter} 0 1,0 -${donutOuterD},0 M ${rOuter} ${rOuter} m -${rInner}, 0 a ${rInner},${rInner} 0 1,1 ${donutInnerD},0 a ${rInner},${rInner} 0 1,1 -${donutInnerD},0`;
    } else if (shape === 'ellipse') {
      if (ellipseW <= 0 || ellipseH <= 0) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Dimensions must be > 0' };
      bbW = ellipseW; bbH = ellipseH;
      const rx = ellipseW / 2;
      const ry = ellipseH / 2;
      shapePath = `M ${rx} ${ry} m -${rx}, 0 a ${rx},${ry} 0 1,0 ${ellipseW},0 a ${rx},${ry} 0 1,0 -${ellipseW},0`;
    } else if (shape === 'semicircle') {
      if (semicircleD <= 0) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Diameter must be > 0' };
      bbW = semicircleD; bbH = semicircleD / 2;
      const r = semicircleD / 2;
      shapePath = `M 0 ${r} A ${r} ${r} 0 0 1 ${semicircleD} ${r} L 0 ${r} Z`;
    } else if (shape === 'u-shape') {
      if (uW <= 0 || uH <= 0 || uT <= 0 || uT * 2 >= uW || uT >= uH) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Invalid U-Shape dimensions' };
      bbW = uW; bbH = uH;
      shapePath = `M 0 0 L ${uT} 0 L ${uT} ${uH - uT} L ${uW - uT} ${uH - uT} L ${uW - uT} 0 L ${uW} 0 L ${uW} ${uH} L 0 ${uH} Z`;
    } else if (shape === 'c-shape') {
      if (cW <= 0 || cH <= 0 || cT <= 0 || cT >= cW || cT * 2 >= cH) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Invalid C-Shape dimensions' };
      bbW = cW; bbH = cH;
      shapePath = `M 0 0 L ${cW} 0 L ${cW} ${cT} L ${cT} ${cT} L ${cT} ${cH - cT} L ${cW} ${cH - cT} L ${cW} ${cH} L 0 ${cH} Z`;
    } else if (shape === 't-shape') {
      if (tW <= 0 || tH <= 0 || tT <= 0 || tT >= tW || tT >= tH) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Invalid T-Shape dimensions' };
      bbW = tW; bbH = tH;
      shapePath = `M 0 0 L ${tW} 0 L ${tW} ${tT} L ${tW/2 + tT/2} ${tT} L ${tW/2 + tT/2} ${tH} L ${tW/2 - tT/2} ${tH} L ${tW/2 - tT/2} ${tT} L 0 ${tT} Z`;
    } else if (shape === 'hollow-rect') {
      if (hRectW <= 0 || hRectH <= 0 || hRectT <= 0 || hRectT * 2 >= hRectW || hRectT * 2 >= hRectH) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Invalid Frame dimensions' };
      bbW = hRectW; bbH = hRectH;
      shapePath = `M 0 0 L ${hRectW} 0 L ${hRectW} ${hRectH} L 0 ${hRectH} Z M ${hRectT} ${hRectT} L ${hRectT} ${hRectH - hRectT} L ${hRectW - hRectT} ${hRectH - hRectT} L ${hRectW - hRectT} ${hRectT} Z`;
    } else if (shape === 'hexagon') {
      if (hexW <= 0 || hexH <= 0) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Dimensions must be > 0' };
      hexPts = [
        { x: hexW / 2, y: 0 },
        { x: hexW, y: hexH / 4 },
        { x: hexW, y: 3 * hexH / 4 },
        { x: hexW / 2, y: hexH },
        { x: 0, y: 3 * hexH / 4 },
        { x: 0, y: hexH / 4 }
      ];
      bbW = hexW;
      bbH = hexH;
      shapePath = `M ${hexPts[0].x} ${hexPts[0].y} ` + hexPts.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z';
    } else if (shape === 'octagon') {
      if (octW <= 0 || octH <= 0) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Dimensions must be > 0' };
      const cx = octW / (2 + Math.sqrt(2));
      const cy = octH / (2 + Math.sqrt(2));
      octPts = [
        { x: cx, y: 0 },
        { x: octW - cx, y: 0 },
        { x: octW, y: cy },
        { x: octW, y: octH - cy },
        { x: octW - cx, y: octH },
        { x: cx, y: octH },
        { x: 0, y: octH - cy },
        { x: 0, y: cy }
      ];
      bbW = octW;
      bbH = octH;
      shapePath = `M ${octPts[0].x} ${octPts[0].y} ` + octPts.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z';
    } else if (shape === 'custom') {
      if (rectW <= 0 || rectH <= 0) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Dimensions must be > 0' };
      bbW = rectW; bbH = rectH;
      shapePath = customPath ? customPath : `M 0 0 L ${bbW} 0 L ${bbW} ${bbH} L 0 ${bbH} Z`;
    }

    let customCtx: CanvasRenderingContext2D | null = null;
    let customPath2D: Path2D | null = null;
    if (shape === 'custom' && customPath) {
      const canvas = document.createElement('canvas');
      customCtx = canvas.getContext('2d');
      if (customCtx) {
        customPath2D = new Path2D(customPath);
      }
    }

    const ny = Math.floor((bbH - modH) / spaceY) + 1;

    if (ny > 0) {
      const arrH = (ny - 1) * spaceY + modH;
      const startY = (bbH - arrH) / 2 + modH / 2;

      let arrW = 0;
      let nx_even = 0;
      let nx_odd = 0;

      if (layoutType === 'grid') {
        nx_even = Math.floor((bbW - modW) / spaceX) + 1;
        nx_odd = nx_even;
        if (nx_even > 0) {
          arrW = (nx_even - 1) * spaceX + modW;
        }
      } else {
        nx_even = Math.floor((bbW - modW) / spaceX) + 1;
        nx_odd = Math.floor((bbW - modW - spaceX / 2) / spaceX) + 1;
        if (nx_even > 0 || nx_odd > 0) {
          const w_even = nx_even > 0 ? (nx_even - 1) * spaceX + modW : 0;
          const w_odd = nx_odd > 0 ? spaceX / 2 + (nx_odd - 1) * spaceX + modW : 0;
          arrW = Math.max(w_even, w_odd);
        }
      }

      if (arrW > 0) {
        const baseStartX = (bbW - arrW) / 2 + modW / 2;

        for (let j = 0; j < ny; j++) {
          const isOddRow = j % 2 !== 0;
          const nx = (layoutType === 'staggered' && isOddRow) ? nx_odd : nx_even;
          const offsetX = (layoutType === 'staggered' && isOddRow) ? spaceX / 2 : 0;
          
          for (let i = 0; i < nx; i++) {
            const cx = baseStartX + offsetX + i * spaceX;
            const cy = startY + j * spaceY;
            let isInside = false;
            const corners = [
              {x: cx - modW/2, y: cy - modH/2}, {x: cx + modW/2, y: cy - modH/2},
              {x: cx + modW/2, y: cy + modH/2}, {x: cx - modW/2, y: cy + modH/2}
            ];

            if (shape === 'rectangle') {
              isInside = corners.every(pt => pt.x >= 0 && pt.x <= bbW && pt.y >= 0 && pt.y <= bbH);
            } else if (shape === 'circle') {
              const r = circleD / 2;
              isInside = corners.every(pt => Math.pow(pt.x - r, 2) + Math.pow(pt.y - r, 2) <= r * r);
            } else if (shape === 'triangle') {
              const sign = (p1: Point, p2: Point, p3: Point) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
              const pointInTriangle = (pt: Point, v1: Point, v2: Point, v3: Point) => {
                const d1 = sign(pt, v1, v2), d2 = sign(pt, v2, v3), d3 = sign(pt, v3, v1);
                const has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
                const has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
                return !(has_neg && has_pos);
              };
              isInside = corners.every(pt => pointInTriangle(pt, triPts[0], triPts[1], triPts[2]));
            } else if (shape === 'donut') {
              const rOuter = donutOuterD / 2;
              const rInner = donutInnerD / 2;
              const cx_center = rOuter;
              const cy_center = rOuter;
              isInside = corners.every(pt => {
                const distSq = Math.pow(pt.x - cx_center, 2) + Math.pow(pt.y - cy_center, 2);
                return distSq <= rOuter * rOuter && distSq >= rInner * rInner;
              });
            } else if (shape === 'ellipse') {
              const rx = ellipseW / 2;
              const ry = ellipseH / 2;
              const cx_center = rx;
              const cy_center = ry;
              isInside = corners.every(pt => {
                return Math.pow(pt.x - cx_center, 2) / Math.pow(rx, 2) + Math.pow(pt.y - cy_center, 2) / Math.pow(ry, 2) <= 1;
              });
            } else if (shape === 'semicircle') {
              const r = semicircleD / 2;
              const cx_center = r;
              const cy_center = r;
              isInside = corners.every(pt => {
                const distSq = Math.pow(pt.x - cx_center, 2) + Math.pow(pt.y - cy_center, 2);
                return distSq <= r * r && pt.y <= r;
              });
            } else if (shape === 'u-shape') {
              isInside = corners.every(pt => pt.x >= 0 && pt.x <= uW && pt.y >= 0 && pt.y <= uH && !(pt.x > uT && pt.x < uW - uT && pt.y < uH - uT));
            } else if (shape === 'c-shape') {
              isInside = corners.every(pt => pt.x >= 0 && pt.x <= cW && pt.y >= 0 && pt.y <= cH && !(pt.x > cT && pt.y > cT && pt.y < cH - cT));
            } else if (shape === 't-shape') {
              isInside = corners.every(pt => pt.x >= 0 && pt.x <= tW && pt.y >= 0 && pt.y <= tH && !(pt.y > tT && (pt.x < tW/2 - tT/2 || pt.x > tW/2 + tT/2)));
            } else if (shape === 'hollow-rect') {
              isInside = corners.every(pt => pt.x >= 0 && pt.x <= hRectW && pt.y >= 0 && pt.y <= hRectH && !(pt.x > hRectT && pt.x < hRectW - hRectT && pt.y > hRectT && pt.y < hRectH - hRectT));
            } else if (shape === 'hexagon' || shape === 'octagon') {
              const polygon = shape === 'hexagon' ? hexPts : octPts;
              const pointInPolygon = (pt: Point, poly: Point[]) => {
                let inside = false;
                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                  const xi = poly[i].x, yi = poly[i].y;
                  const xj = poly[j].x, yj = poly[j].y;
                  const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
                  if (intersect) inside = !inside;
                }
                return inside;
              };
              isInside = corners.every(pt => pointInPolygon(pt, polygon));
            } else if (shape === 'custom') {
              if (customCtx && customPath2D) {
                const scaleX = bbW / 100;
                const scaleY = bbH / 100;
                isInside = corners.every(pt => {
                  return customCtx!.isPointInPath(customPath2D!, pt.x / scaleX, pt.y / scaleY);
                });
              } else {
                isInside = corners.every(pt => pt.x >= 0 && pt.x <= bbW && pt.y >= 0 && pt.y <= bbH);
              }
            }
            if (isInside) modules.push({ x: cx - modW/2, y: cy - modH/2, w: modW, h: modH });
          }
        }
      }
    }
    return { modules, shapePath, bbW, bbH, error };
  }, [shape, rectW, rectH, circleD, triA, triB, triC, donutOuterD, donutInnerD, ellipseW, ellipseH, semicircleD, uW, uH, uT, cW, cH, cT, tW, tH, tT, hRectW, hRectH, hRectT, hexW, hexH, octW, octH, modW, modH, spaceX, spaceY, layoutType, customPath]);

  let minDx = Infinity;
  let modX: {x: number, y: number, w: number, h: number} | null = null;
  let minDy = Infinity;
  let modY: {x: number, y: number, w: number, h: number} | null = null;

  if (showCenterLines && result.modules.length > 0) {
    result.modules.forEach(mod => {
      const cx = mod.x + mod.w / 2;
      const cy = mod.y + mod.h / 2;
      
      const dx = cx - result.bbW / 2;
      if (dx > 0.1) {
        if (dx < minDx - 0.1) {
          minDx = dx;
          modX = mod;
        } else if (Math.abs(dx - minDx) <= 0.1) {
          if (modX && Math.abs(cy - result.bbH / 2) < Math.abs((modX.y + modX.h / 2) - result.bbH / 2)) {
            modX = mod;
          }
        }
      }

      const dy = cy - result.bbH / 2;
      if (dy > 0.1) {
        if (dy < minDy - 0.1) {
          minDy = dy;
          modY = mod;
        } else if (Math.abs(dy - minDy) <= 0.1) {
          if (modY && Math.abs(cx - result.bbW / 2) < Math.abs((modY.x + modY.w / 2) - result.bbW / 2)) {
            modY = mod;
          }
        }
      }
    });
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateCustomShape = async () => {
    if (!customImage) return;
    setIsGenerating(true);
    try {
      const processedImageUrl = await preprocessImage(customImage);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const mimeType = processedImageUrl.split(';')[0].split(':')[1];
      const base64Data = processedImageUrl.split(',')[1];

      const prompt = `You are a Metrology Expert and Senior SVG Designer. Analyze the provided engineering blueprint/image.
Use Chain-of-Thought reasoning to:
1. Identify the main outer boundary shape.
2. Differentiate between overall dimensions of the main shape and the dimensions/spacing of the internal modules.
3. Extract the exact 'd' attribute for the SVG <path> of the main outer shape. Normalize the path coordinates so the bounding box is exactly 0,0 to 100,100.
4. Extract overall width and height.
5. Extract module width, height, and center-to-center spacing (X and Y).
6. Determine if the module layout is 'grid' or 'staggered'.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          reasoning_steps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Chain-of-thought reasoning steps analyzing the image."
          },
          path: {
            type: Type.STRING,
            description: "The 'd' attribute string for an SVG <path> that draws the main shape. MUST be normalized to a 100x100 viewBox (0,0 to 100,100)."
          },
          overall_width: { type: Type.NUMBER, description: "Overall width of the main shape in mm. Null if not found." },
          overall_height: { type: Type.NUMBER, description: "Overall height of the main shape in mm. Null if not found." },
          module_width: { type: Type.NUMBER, description: "Width of a single module in mm. Null if not found." },
          module_height: { type: Type.NUMBER, description: "Height of a single module in mm. Null if not found." },
          module_spacing_x: { type: Type.NUMBER, description: "Horizontal center-to-center spacing between modules in mm. Null if not found." },
          module_spacing_y: { type: Type.NUMBER, description: "Vertical center-to-center spacing between modules in mm. Null if not found." },
          layout_type: { type: Type.STRING, description: "Layout pattern of the modules.", enum: ["grid", "staggered"] }
        },
        required: ["reasoning_steps", "path"]
      };

      const config = {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt }
          ]
        },
        config
      });
      
      const finalData = JSON.parse(response.text || "{}");
      
      if (finalData.path) setCustomPath(finalData.path);
      if (finalData.overall_width) setRectW(finalData.overall_width);
      if (finalData.overall_height) setRectH(finalData.overall_height);
      if (finalData.module_width) setModW(finalData.module_width);
      if (finalData.module_height) setModH(finalData.module_height);
      if (finalData.module_spacing_x) setSpaceX(finalData.module_spacing_x);
      if (finalData.module_spacing_y) setSpaceY(finalData.module_spacing_y);
      if (finalData.layout_type) setLayoutType(finalData.layout_type as LayoutType);

    } catch (error: any) {
      console.error("Failed to generate shape:", error);
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        alert("ขออภัยครับ โควต้าการใช้งาน AI ของคุณเต็มแล้ว (429 Resource Exhausted) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง หรือลองใหม่ในวันพรุ่งนี้ครับ");
      } else {
        alert("Failed to generate shape. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const padding = Math.max(result.bbW, result.bbH) * 0.15 || 80;
  const maxDim = Math.max(result.bbW, result.bbH);
  const dynamicFontSize = Math.max(16, maxDim * 0.03);
  
  const labelFontSize = Math.max(16, maxDim * 0.025);
  const labelLineHeight = labelFontSize * 1.5;
  const bottomPadding = padding + labelLineHeight * 4;

  const baseVbW = result.bbW + padding * 2;
  const baseVbH = result.bbH + padding + bottomPadding;
  const vbW = baseVbW / zoom;
  const vbH = baseVbH / zoom;
  const vbX = -padding + (baseVbW - vbW) / 2;
  const vbY = -padding + (baseVbH - vbH) / 2;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  // Calculate dynamic font size based on the bounding box size
  const dynamicStrokeWidth = Math.max(1, maxDim * 0.002);
  const offset = Math.max(40, maxDim * 0.08);
  const tickSize = Math.max(5, maxDim * 0.01);
  const arrowSize = Math.max(6, maxDim * 0.012);

  const downloadSVG = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'module-layout.svg';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const svgToPng = (svgString: string, width: number, height: number): Promise<string> => {
    return new Promise((resolve) => {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  };

  const generateCoverPageSVG = (details: DocumentDetails) => {
    return `
      <svg width="4200" height="2970" viewBox="0 0 4200 2970" xmlns="http://www.w3.org/2000/svg">
        <rect width="4200" height="2970" fill="white" />
        <rect x="100" y="100" width="4000" height="2770" fill="none" stroke="black" stroke-width="5"/>
        <rect x="120" y="120" width="3960" height="2730" fill="none" stroke="black" stroke-width="2"/>
        
        <g transform="translate(1800, 600)">
          <rect x="15" y="15" width="570" height="170" rx="85" ry="85" fill="none" stroke="#007BFF" stroke-width="30"/>
          <text x="300" y="145" font-family="'Arial Black', Impact, sans-serif" font-size="130" font-weight="900" fill="#007BFF" text-anchor="middle" letter-spacing="5">L&amp;E</text>
        </g>

        <g transform="translate(1200, 1200)" font-family="sans-serif" font-size="40">
          <line x1="0" y1="0" x2="1800" y2="0" stroke="black" stroke-width="2"/>
          <text x="800" y="60" text-anchor="end" font-weight="bold">Project Name :</text>
          <text x="850" y="60">${details.projectName}</text>
          
          <line x1="0" y1="180" x2="1800" y2="180" stroke="black" stroke-width="2"/>
          <text x="800" y="240" text-anchor="end" font-weight="bold">Location :</text>
          <text x="850" y="240">${details.location}</text>
          
          <line x1="0" y1="300" x2="1800" y2="300" stroke="black" stroke-width="2"/>
          <text x="800" y="360" text-anchor="end" font-weight="bold">Project Number :</text>
          <text x="850" y="360">${details.projectNumber}</text>
          
          <line x1="0" y1="420" x2="1800" y2="420" stroke="black" stroke-width="2"/>
          <text x="800" y="480" text-anchor="end" font-weight="bold">Date :</text>
          <text x="850" y="480">${details.date}</text>
          
          <line x1="0" y1="540" x2="1800" y2="540" stroke="black" stroke-width="2"/>
          <text x="800" y="600" text-anchor="end" font-weight="bold">Project Name :</text>
          <text x="850" y="600">${details.drawingTitle}</text>
          
          <line x1="0" y1="720" x2="1800" y2="720" stroke="black" stroke-width="2"/>
          <text x="800" y="780" text-anchor="end" font-weight="bold">Approve by Client :</text>
          <text x="850" y="780">${details.approvedBy}</text>
          
          <line x1="0" y1="840" x2="1800" y2="840" stroke="black" stroke-width="2"/>
        </g>
      </svg>
    `;
  };

  const generateDrawingPageSVG = (details: DocumentDetails, page: PageData, pageNum: number, totalPages: number) => {
    return `
      <svg width="4200" height="2970" viewBox="0 0 4200 2970" xmlns="http://www.w3.org/2000/svg">
        <style>
          .font-mono { font-family: monospace; }
          .font-sans { font-family: sans-serif; }
          .fill-neutral-600 { fill: #525252; }
          .fill-neutral-500 { fill: #737373; }
          .italic { font-style: italic; }
        </style>
        <rect width="4200" height="2970" fill="white" />
        <rect x="100" y="100" width="4000" height="2770" fill="none" stroke="black" stroke-width="5"/>
        <rect x="120" y="120" width="3960" height="2730" fill="none" stroke="black" stroke-width="2"/>
        
        <rect x="120" y="120" width="3380" height="300" fill="none" stroke="black" stroke-width="2"/>
        <line x1="1246" y1="120" x2="1246" y2="420" stroke="black" stroke-width="2"/>
        <line x1="2373" y1="120" x2="2373" y2="420" stroke="black" stroke-width="2"/>
        
        <g font-family="sans-serif" font-size="30" text-anchor="middle">
          <text x="683" y="200">*** พื้นที่อาจมีความคลาดเคลื่อน ควรตรวจสอบพื้นที่จริงอีกครั้ง ***</text>
          <text x="683" y="260">Areas may have discrepancies.</text>
          <text x="683" y="300">The actual area should be re-examined.</text>
          
          <text x="1809" y="200">*** ควรตรวจสอบหน้างานจริงอีกครั้งก่อนการผลิตและติดตั้ง ***</text>
          <text x="1809" y="260">The actual site should be inspected again</text>
          <text x="1809" y="300">before production and installation.</text>
          
          <text x="2936" y="220">*** ควรหย่อนสายเมน ตรงตำแหน่งของกล่องไฟทุกครั้ง ***</text>
          <text x="2936" y="280">The main cable should be placed in every distribution box</text>
        </g>

        <rect x="3500" y="120" width="580" height="2730" fill="none" stroke="black" stroke-width="2"/>
        
        <g transform="translate(3500, 120)">
          <text x="290" y="60" font-family="sans-serif" font-size="45" font-weight="bold" text-anchor="middle">STRETCH CEILING</text>
          
          <g transform="translate(140, 90)">
            <rect x="7.5" y="7.5" width="285" height="85" rx="42.5" ry="42.5" fill="none" stroke="#007BFF" stroke-width="15"/>
            <text x="150" y="72.5" font-family="'Arial Black', Impact, sans-serif" font-size="65" font-weight="900" fill="#007BFF" text-anchor="middle" letter-spacing="2.5">L&amp;E</text>
          </g>
          
          <text x="290" y="240" font-family="sans-serif" font-size="20" text-anchor="middle">539/2, 16-17 F. Gypsum Metropolitan Tower</text>
          <text x="290" y="270" font-family="sans-serif" font-size="20" text-anchor="middle">Rajthevee, Bangkok, Thailand, 10400</text>
          
          <line x1="0" y1="300" x2="580" y2="300" stroke="black" stroke-width="2"/>
          <text x="20" y="330" font-family="sans-serif" font-size="20" font-weight="bold">Project Name</text>
          <text x="290" y="390" font-family="sans-serif" font-size="30" text-anchor="middle">${details.projectName}</text>
          
          <line x1="0" y1="450" x2="580" y2="450" stroke="black" stroke-width="2"/>
          <text x="20" y="480" font-family="sans-serif" font-size="20" font-weight="bold">Project Number :</text>
          <text x="200" y="480" font-family="sans-serif" font-size="25">${details.projectNumber}</text>
          
          <line x1="0" y1="510" x2="580" y2="510" stroke="black" stroke-width="2"/>
          <text x="20" y="540" font-family="sans-serif" font-size="20" font-weight="bold">Client.</text>
          <text x="290" y="600" font-family="sans-serif" font-size="30" text-anchor="middle">${details.client}</text>
          
          <line x1="0" y1="660" x2="580" y2="660" stroke="black" stroke-width="2"/>
          <text x="20" y="690" font-family="sans-serif" font-size="20" font-weight="bold">Location :</text>
          <text x="150" y="690" font-family="sans-serif" font-size="25">${details.location}</text>
          
          <line x1="0" y1="720" x2="580" y2="720" stroke="black" stroke-width="2"/>
          <text x="20" y="750" font-family="sans-serif" font-size="20" font-weight="bold">Note :</text>
          
          <line x1="0" y1="850" x2="580" y2="850" stroke="black" stroke-width="2"/>
          <text x="20" y="880" font-family="sans-serif" font-size="20" font-weight="bold">Drawing Title.</text>
          <text x="290" y="960" font-family="sans-serif" font-size="35" text-anchor="middle">${details.drawingTitle}</text>
          
          <line x1="0" y1="1050" x2="580" y2="1050" stroke="black" stroke-width="2"/>
          <text x="290" y="1080" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">Revisions</text>
          
          <line x1="0" y1="1100" x2="580" y2="1100" stroke="black" stroke-width="2"/>
          <line x1="80" y1="1100" x2="80" y2="1400" stroke="black" stroke-width="2"/>
          <line x1="450" y1="1100" x2="450" y2="1400" stroke="black" stroke-width="2"/>
          
          <text x="40" y="1130" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">Rev.</text>
          <text x="265" y="1130" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">Issue / Revision</text>
          <text x="515" y="1130" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">Date.</text>
          
          <line x1="0" y1="1150" x2="580" y2="1150" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1200" x2="580" y2="1200" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1250" x2="580" y2="1250" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1300" x2="580" y2="1300" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1350" x2="580" y2="1350" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1400" x2="580" y2="1400" stroke="black" stroke-width="2"/>
          
          <line x1="150" y1="1400" x2="150" y2="2730" stroke="black" stroke-width="2"/>
          
          <text x="20" y="1440" font-family="sans-serif" font-size="20" font-weight="bold">Status :</text>
          <text x="170" y="1440" font-family="sans-serif" font-size="25">${details.status}</text>
          
          <line x1="0" y1="1480" x2="580" y2="1480" stroke="black" stroke-width="2"/>
          <text x="20" y="1520" font-family="sans-serif" font-size="20" font-weight="bold">Design by :</text>
          <text x="170" y="1520" font-family="sans-serif" font-size="25">${details.designBy}</text>
          
          <line x1="0" y1="1560" x2="580" y2="1560" stroke="black" stroke-width="2"/>
          <text x="20" y="1600" font-family="sans-serif" font-size="20" font-weight="bold">Checked by :</text>
          <text x="170" y="1600" font-family="sans-serif" font-size="25">${details.checkedBy}</text>
          
          <line x1="0" y1="1640" x2="580" y2="1640" stroke="black" stroke-width="2"/>
          <text x="20" y="1680" font-family="sans-serif" font-size="20" font-weight="bold">Approved</text>
          <text x="20" y="1710" font-family="sans-serif" font-size="20" font-weight="bold">by Client :</text>
          
          <line x1="0" y1="1750" x2="580" y2="1750" stroke="black" stroke-width="2"/>
          <text x="20" y="1790" font-family="sans-serif" font-size="20" font-weight="bold">Signature and</text>
          <text x="20" y="1820" font-family="sans-serif" font-size="20" font-weight="bold">Company Stamp :</text>
          
          <line x1="0" y1="1950" x2="580" y2="1950" stroke="black" stroke-width="2"/>
          <text x="20" y="1990" font-family="sans-serif" font-size="20" font-weight="bold">Page Size :</text>
          <text x="170" y="1990" font-family="sans-serif" font-size="25">A3</text>
          
          <line x1="0" y1="2030" x2="580" y2="2030" stroke="black" stroke-width="2"/>
          <text x="20" y="2070" font-family="sans-serif" font-size="20" font-weight="bold">Scale :</text>
          <text x="170" y="2070" font-family="sans-serif" font-size="25">NTS</text>
          
          <line x1="0" y1="2110" x2="580" y2="2110" stroke="black" stroke-width="2"/>
          <text x="20" y="2150" font-family="sans-serif" font-size="20" font-weight="bold">Unit :</text>
          <text x="170" y="2150" font-family="sans-serif" font-size="25">mm.</text>
          
          <line x1="0" y1="2190" x2="580" y2="2190" stroke="black" stroke-width="2"/>
          <text x="20" y="2230" font-family="sans-serif" font-size="20" font-weight="bold">Date :</text>
          <text x="170" y="2230" font-family="sans-serif" font-size="25">${details.date}</text>
          
          <line x1="0" y1="2270" x2="580" y2="2270" stroke="black" stroke-width="2"/>
          <text x="20" y="2310" font-family="sans-serif" font-size="20" font-weight="bold">Sheet No :</text>
          <text x="170" y="2310" font-family="sans-serif" font-size="25">${pageNum}/${totalPages}</text>
          
          <line x1="0" y1="2350" x2="580" y2="2350" stroke="black" stroke-width="2"/>
        </g>

        <svg x="120" y="420" width="3380" height="2430" viewBox="${page.viewBox}">
          ${page.svgContent}
        </svg>
      </svg>
    `;
  };

  const addToTemplate = () => {
    if (!svgRef.current) return;
    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
    const innerHTML = svgClone.innerHTML;
    
    setPages([...pages, {
      id: Math.random().toString(36).substring(7),
      svgContent: innerHTML,
      viewBox: viewBox,
      bbW: result.bbW,
      bbH: result.bbH,
      name: `${shape} ${pages.length + 1}`
    }]);
  };

  const generateTemplatePDF = async () => {
    if (pages.length === 0) {
      alert("Please add at least one page to the template.");
      return;
    }
    
    setIsGeneratingPDF(true);
    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a3'
      });
      
      const coverSvgString = generateCoverPageSVG(docDetails);
      const coverImgData = await svgToPng(coverSvgString, 4200, 2970);
      pdf.addImage(coverImgData, 'PNG', 0, 0, 420, 297);
      
      for (let i = 0; i < pages.length; i++) {
        pdf.addPage('a3', 'landscape');
        const pageSvgString = generateDrawingPageSVG(docDetails, pages[i], i + 1, pages.length);
        const pageImgData = await svgToPng(pageSvgString, 4200, 2970);
        pdf.addImage(pageImgData, 'PNG', 0, 0, 420, 297);
      }
      
      pdf.save(`${docDetails.projectName || 'template'}.pdf`);
      setShowTemplateSettings(false);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const downloadPDF = () => {
    if (!svgRef.current) return;
    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', String(baseVbW));
    svgClone.setAttribute('height', String(baseVbH));
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = baseVbW * scale;
      canvas.height = baseVbH * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = canvas.toDataURL('image/png');
        
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save('module-layout.pdf');
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="flex h-screen bg-neutral-100 font-sans text-neutral-900">
      <div className="w-80 bg-white border-r border-neutral-200 flex flex-col shadow-sm z-10">
        <div className="p-4 border-b border-neutral-200">
          <h1 className="text-lg font-semibold tracking-tight">Module Array Planner</h1>
          <p className="text-xs text-neutral-500 mt-1">Automate module distribution</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Project Details</label>
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Object Name" value={objectName} onChange={setObjectName} />
              <TextInput label="Module Name" value={moduleName} onChange={setModuleName} />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Object Shape</label>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => setShape('rectangle')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'rectangle' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <Square size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Rect</span>
              </button>
              <button onClick={() => setShape('circle')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'circle' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <CircleIcon size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Circle</span>
              </button>
              <button onClick={() => setShape('triangle')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'triangle' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <TriangleIcon size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Tri</span>
              </button>
              <button onClick={() => setShape('donut')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'donut' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <CircleDot size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Donut</span>
              </button>
              <button onClick={() => setShape('ellipse')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'ellipse' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <div className="w-6 h-4 border-2 border-current rounded-[50%] mb-1"></div>
                <span className="text-[10px] font-medium">Ellipse</span>
              </button>
              <button onClick={() => setShape('semicircle')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'semicircle' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M2 12a10 10 0 0 1 20 0Z"></path></svg>
                <span className="text-[10px] font-medium">Arch</span>
              </button>
              <button onClick={() => setShape('u-shape')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'u-shape' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M4 4v10a8 8 0 0 0 16 0V4" /></svg>
                <span className="text-[10px] font-medium">U-Shape</span>
              </button>
              <button onClick={() => setShape('c-shape')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'c-shape' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M18 4a8 8 0 1 0 0 16" /></svg>
                <span className="text-[10px] font-medium">C-Shape</span>
              </button>
              <button onClick={() => setShape('t-shape')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 't-shape' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M4 4h16v4h-6v12h-4V8H4Z" /></svg>
                <span className="text-[10px] font-medium">T-Shape</span>
              </button>
              <button onClick={() => setShape('hollow-rect')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'hollow-rect' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>
                <span className="text-[10px] font-medium">Frame</span>
              </button>
              <button onClick={() => setShape('hexagon')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'hexagon' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <Hexagon size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Hexagon</span>
              </button>
              <button onClick={() => setShape('octagon')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'octagon' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <Octagon size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Octagon</span>
              </button>
              <button onClick={() => setShape('custom')} className={`col-span-2 flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'custom' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <Sparkles size={20} className="mb-1" />
                <span className="text-[10px] font-medium">AI Custom</span>
              </button>
            </div>
          </div>

          {shape === 'custom' && (
            <div className="space-y-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
              <label className="text-xs font-semibold uppercase tracking-wider text-purple-700">AI Shape from Image</label>
              
              {!customImage ? (
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-purple-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-purple-50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-6 h-6 mb-2 text-purple-500" />
                    <p className="text-xs text-purple-600 font-medium">Click to upload image</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              ) : (
                <div className="space-y-2">
                  <div className="relative w-full h-24 bg-white rounded-lg border border-purple-200 overflow-hidden flex items-center justify-center">
                    <img src={customImage} alt="Upload preview" className="max-h-full object-contain" />
                    <button 
                      onClick={() => setCustomImage(null)}
                      className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-sm text-neutral-500 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <button 
                    onClick={generateCustomShape}
                    disabled={isGenerating}
                    className="w-full py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {isGenerating ? 'Analyzing Image...' : 'Generate Shape'}
                  </button>
                </div>
              )}

              {customPath && (
                <div className="mt-4 pt-4 border-t border-purple-200 space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-purple-700">Save Current Shape</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Shape name..." 
                      value={newShapeName}
                      onChange={(e) => setNewShapeName(e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm border border-purple-300 rounded focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                    />
                    <button 
                      onClick={() => {
                        if (!newShapeName.trim()) return;
                        const newShape: SavedShape = {
                          id: Date.now().toString(),
                          name: newShapeName.trim(),
                          path: customPath,
                          image: customImage
                        };
                        setSavedShapes([...savedShapes, newShape]);
                        setNewShapeName('');
                      }}
                      disabled={!newShapeName.trim()}
                      className="px-3 py-1.5 bg-purple-100 text-purple-700 text-sm font-medium rounded hover:bg-purple-200 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {savedShapes.length > 0 && (
                <div className="mt-4 pt-4 border-t border-purple-200 space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-purple-700">Saved Shapes</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {savedShapes.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-2 bg-white rounded border border-purple-100 hover:border-purple-300 transition-colors">
                        <button 
                          className="flex-1 text-left text-sm font-medium text-neutral-700 truncate"
                          onClick={() => {
                            setCustomPath(s.path);
                            if (s.image) setCustomImage(s.image);
                          }}
                        >
                          {s.name}
                        </button>
                        <button 
                          onClick={() => setSavedShapes(savedShapes.filter(x => x.id !== s.id))}
                          className="p-1 text-neutral-400 hover:text-red-500 rounded"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Object Dimensions (mm)</label>
            {(shape === 'rectangle' || shape === 'custom') && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Width" value={rectW} onChange={setRectW} />
                <Input label="Length" value={rectH} onChange={setRectH} />
              </div>
            )}
            {shape === 'circle' && (
              <div className="grid grid-cols-1 gap-3">
                <Input label="Diameter" value={circleD} onChange={setCircleD} />
              </div>
            )}
            {shape === 'triangle' && (
              <div className="grid grid-cols-3 gap-3">
                <Input label="Side A" value={triA} onChange={setTriA} />
                <Input label="Side B" value={triB} onChange={setTriB} />
                <Input label="Side C" value={triC} onChange={setTriC} />
              </div>
            )}
            {shape === 'donut' && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Outer Dia." value={donutOuterD} onChange={setDonutOuterD} />
                <Input label="Inner Dia." value={donutInnerD} onChange={setDonutInnerD} />
              </div>
            )}
            {shape === 'ellipse' && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Width" value={ellipseW} onChange={setEllipseW} />
                <Input label="Height" value={ellipseH} onChange={setEllipseH} />
              </div>
            )}
            {shape === 'semicircle' && (
              <div className="grid grid-cols-1 gap-3">
                <Input label="Diameter" value={semicircleD} onChange={setSemicircleD} />
              </div>
            )}
            {shape === 'u-shape' && (
              <div className="grid grid-cols-3 gap-3">
                <Input label="Width" value={uW} onChange={setUW} />
                <Input label="Height" value={uH} onChange={setUH} />
                <Input label="Thickness" value={uT} onChange={setUT} />
              </div>
            )}
            {shape === 'c-shape' && (
              <div className="grid grid-cols-3 gap-3">
                <Input label="Width" value={cW} onChange={setCW} />
                <Input label="Height" value={cH} onChange={setCH} />
                <Input label="Thickness" value={cT} onChange={setCT} />
              </div>
            )}
            {shape === 't-shape' && (
              <div className="grid grid-cols-3 gap-3">
                <Input label="Width" value={tW} onChange={setTW} />
                <Input label="Height" value={tH} onChange={setTH} />
                <Input label="Thickness" value={tT} onChange={setTT} />
              </div>
            )}
            {shape === 'hollow-rect' && (
              <div className="grid grid-cols-3 gap-3">
                <Input label="Width" value={hRectW} onChange={setHRectW} />
                <Input label="Height" value={hRectH} onChange={setHRectH} />
                <Input label="Thickness" value={hRectT} onChange={setHRectT} />
              </div>
            )}
            {shape === 'hexagon' && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Width" value={hexW} onChange={setHexW} />
                <Input label="Height" value={hexH} onChange={setHexH} />
              </div>
            )}
            {shape === 'octagon' && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Width" value={octW} onChange={setOctW} />
                <Input label="Height" value={octH} onChange={setOctH} />
              </div>
            )}
            {result.error && <p className="text-xs text-red-500 mt-1">{result.error}</p>}
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Module Size (mm)</label>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Width" value={modW} onChange={setModW} />
              <Input label="Length" value={modH} onChange={setModH} />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Spacing C-to-C (mm)</label>
            <div className="grid grid-cols-2 gap-3">
              <Input label="X Axis" value={spaceX} onChange={setSpaceX} />
              <Input label="Y Axis" value={spaceY} onChange={setSpaceY} />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Layout Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setLayoutType('grid')} className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${layoutType === 'grid' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                Grid
              </button>
              <button onClick={() => setLayoutType('staggered')} className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${layoutType === 'staggered' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                Staggered
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Display Options</label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={showCenterLines} 
                onChange={(e) => setShowCenterLines(e.target.checked)}
                className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-neutral-700">Show Center Lines</span>
            </label>
          </div>
        </div>
        
        <div className="p-4 border-t border-neutral-200 bg-neutral-50">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-600">Total Modules:</span>
            <span className="text-2xl font-bold font-mono text-blue-600">{result.modules.length}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden cad-bg">
        <div className="absolute top-4 right-4 flex gap-2 z-10 bg-white p-1 rounded-lg shadow-sm border border-neutral-200">
          <button onClick={() => setZoom(z => z * 1.2)} className="p-2 hover:bg-neutral-100 rounded text-neutral-600" title="Zoom In"><ZoomIn size={18} /></button>
          <button onClick={() => setZoom(z => z / 1.2)} className="p-2 hover:bg-neutral-100 rounded text-neutral-600" title="Zoom Out"><ZoomOut size={18} /></button>
          <button onClick={() => setZoom(1)} className="p-2 hover:bg-neutral-100 rounded text-neutral-600" title="Reset Zoom"><Maximize size={18} /></button>
          <div className="w-px bg-neutral-200 mx-1 my-1"></div>
          <button onClick={addToTemplate} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-sm font-medium flex items-center gap-2">
            <FileText size={16} /> Add to Template
          </button>
          <button onClick={() => setShowTemplateSettings(true)} className="px-3 py-1.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded text-sm font-medium flex items-center gap-2">
            Template Settings {pages.length > 0 && <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pages.length}</span>}
          </button>
          <div className="w-px bg-neutral-200 mx-1 my-1"></div>
          <button onClick={downloadSVG} className="p-2 hover:bg-neutral-100 rounded text-blue-600" title="Download SVG"><Download size={18} /></button>
          <button onClick={downloadPDF} className="p-2 hover:bg-neutral-100 rounded text-red-600" title="Download PDF"><FileText size={18} /></button>
        </div>
        
        <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
          {!result.error && (
            <svg ref={svgRef} width="100%" height="100%" viewBox={viewBox} className="drop-shadow-sm">
              <g style={{ fontSize: `${dynamicFontSize}px` }} className="font-mono fill-neutral-600" stroke="none">
                {/* Top Dimension */}
                <line x1="0" y1={-offset} x2={result.bbW} y2={-offset} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <line x1="0" y1={-offset - tickSize} x2="0" y2={-tickSize} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <line x1={result.bbW} y1={-offset - tickSize} x2={result.bbW} y2={-tickSize} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <path d={`M ${arrowSize} ${-offset - arrowSize/2} L 0 ${-offset} L ${arrowSize} ${-offset + arrowSize/2}`} fill="none" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <path d={`M ${result.bbW - arrowSize} ${-offset - arrowSize/2} L ${result.bbW} ${-offset} L ${result.bbW - arrowSize} ${-offset + arrowSize/2}`} fill="none" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <text x={result.bbW/2} y={-offset - dynamicFontSize * 0.5} textAnchor="middle" fill="#525252">{result.bbW}</text>
                
                {/* Left Dimension */}
                <line x1={-offset} y1="0" x2={-offset} y2={result.bbH} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <line x1={-offset - tickSize} y1="0" x2={-tickSize} y2="0" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <line x1={-offset - tickSize} y1={result.bbH} x2={-tickSize} y2={result.bbH} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <path d={`M ${-offset - arrowSize/2} ${arrowSize} L ${-offset} 0 L ${-offset + arrowSize/2} ${arrowSize}`} fill="none" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <path d={`M ${-offset - arrowSize/2} ${result.bbH - arrowSize} L ${-offset} ${result.bbH} L ${-offset + arrowSize/2} ${result.bbH - arrowSize}`} fill="none" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <text x={-offset - dynamicFontSize * 0.5} y={result.bbH/2} textAnchor="middle" fill="#525252" transform={`rotate(-90, ${-offset - dynamicFontSize * 0.5}, ${result.bbH/2})`}>{result.bbH}</text>
              </g>

              {shape === 'custom' && customPath ? (
                <path 
                  d={result.shapePath} 
                  transform={`scale(${result.bbW / 100}, ${result.bbH / 100})`} 
                  fill="white" 
                  stroke="#525252" 
                  strokeWidth={dynamicStrokeWidth * 2} 
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <path d={result.shapePath} fill="white" stroke="#525252" strokeWidth={dynamicStrokeWidth * 2} />
              )}
              
              {showCenterLines && (
                <g stroke="#a3a3a3" strokeWidth={dynamicStrokeWidth} opacity="0.8">
                  {/* Center Crosshair */}
                  <path d={`M ${result.bbW/2 - tickSize*1.5} ${result.bbH/2} L ${result.bbW/2 + tickSize*1.5} ${result.bbH/2} M ${result.bbW/2} ${result.bbH/2 - tickSize*1.5} L ${result.bbW/2} ${result.bbH/2 + tickSize*1.5}`} />
                  {/* Vertical Center Line */}
                  <line x1={result.bbW/2} y1={-offset/2} x2={result.bbW/2} y2={result.bbH/2 - tickSize*3} strokeDasharray={`${tickSize*5}, ${tickSize}, ${tickSize}, ${tickSize}`} />
                  <line x1={result.bbW/2} y1={result.bbH/2 + tickSize*3} x2={result.bbW/2} y2={result.bbH + offset/2} strokeDasharray={`${tickSize*5}, ${tickSize}, ${tickSize}, ${tickSize}`} />
                  {/* Horizontal Center Line */}
                  <line x1={-offset/2} y1={result.bbH/2} x2={result.bbW/2 - tickSize*3} y2={result.bbH/2} strokeDasharray={`${tickSize*5}, ${tickSize}, ${tickSize}, ${tickSize}`} />
                  <line x1={result.bbW/2 + tickSize*3} y1={result.bbH/2} x2={result.bbW + offset/2} y2={result.bbH/2} strokeDasharray={`${tickSize*5}, ${tickSize}, ${tickSize}, ${tickSize}`} />
                </g>
              )}

              {/* Center Offset Dimensions */}
              {showCenterLines && modX && minDx > 0.1 && (
                <g stroke="#525252" fill="none" strokeWidth={dynamicStrokeWidth} style={{ fontSize: `${dynamicFontSize * 0.8}px` }} className="font-mono">
                  {/* Extension lines */}
                  <line x1={result.bbW/2} y1={-tickSize} x2={result.bbW/2} y2={-offset/2 - tickSize} />
                  <line x1={modX.x + modX.w/2} y1={-tickSize} x2={modX.x + modX.w/2} y2={-offset/2 - tickSize} />
                  {/* Dimension line */}
                  <line x1={result.bbW/2} y1={-offset/2} x2={modX.x + modX.w/2} y2={-offset/2} />
                  {/* Arrows */}
                  <path d={`M ${result.bbW/2 + arrowSize} ${-offset/2 - arrowSize/2} L ${result.bbW/2} ${-offset/2} L ${result.bbW/2 + arrowSize} ${-offset/2 + arrowSize/2}`} />
                  <path d={`M ${modX.x + modX.w/2 - arrowSize} ${-offset/2 - arrowSize/2} L ${modX.x + modX.w/2} ${-offset/2} L ${modX.x + modX.w/2 - arrowSize} ${-offset/2 + arrowSize/2}`} />
                  {/* Text */}
                  <text x={(result.bbW/2 + modX.x + modX.w/2)/2} y={-offset/2 - dynamicFontSize * 0.3} fill="#525252" stroke="none" textAnchor="middle">{Math.round(minDx * 10) / 10}</text>
                </g>
              )}
              {showCenterLines && modY && minDy > 0.1 && (
                <g stroke="#525252" fill="none" strokeWidth={dynamicStrokeWidth} style={{ fontSize: `${dynamicFontSize * 0.8}px` }} className="font-mono">
                  {/* Extension lines */}
                  <line x1={-tickSize} y1={result.bbH/2} x2={-offset/2 - tickSize} y2={result.bbH/2} />
                  <line x1={-tickSize} y1={modY.y + modY.h/2} x2={-offset/2 - tickSize} y2={modY.y + modY.h/2} />
                  {/* Dimension line */}
                  <line x1={-offset/2} y1={result.bbH/2} x2={-offset/2} y2={modY.y + modY.h/2} />
                  {/* Arrows */}
                  <path d={`M ${-offset/2 - arrowSize/2} ${result.bbH/2 + arrowSize} L ${-offset/2} ${result.bbH/2} L ${-offset/2 + arrowSize/2} ${result.bbH/2 + arrowSize}`} />
                  <path d={`M ${-offset/2 - arrowSize/2} ${modY.y + modY.h/2 - arrowSize} L ${-offset/2} ${modY.y + modY.h/2} L ${-offset/2 + arrowSize/2} ${modY.y + modY.h/2 - arrowSize}`} />
                  {/* Text */}
                  <text x={-offset/2 - dynamicFontSize * 0.3} y={(result.bbH/2 + modY.y + modY.h/2)/2} fill="#525252" stroke="none" textAnchor="middle" transform={`rotate(-90, ${-offset/2 - dynamicFontSize * 0.3}, ${(result.bbH/2 + modY.y + modY.h/2)/2})`}>{Math.round(minDy * 10) / 10}</text>
                </g>
              )}

              {result.modules.map((mod, i) => (
                <g key={i} transform={`translate(${mod.x}, ${mod.y})`}>
                  <rect width={mod.w} height={mod.h} fill="rgba(59, 130, 246, 0.15)" stroke="#2563eb" strokeWidth={dynamicStrokeWidth} />
                  <circle cx={mod.w/2} cy={mod.h/2} r={dynamicStrokeWidth * 1.5} fill="#2563eb" />
                </g>
              ))}

              {/* Labels */}
              <text x={0} y={result.bbH + padding + labelFontSize} fontSize={labelFontSize} fill="#141414" fontFamily="sans-serif">{objectName}</text>
              <text x={0} y={result.bbH + padding + labelFontSize + labelLineHeight} fontSize={labelFontSize} fill="#141414" fontFamily="sans-serif">{moduleName} : {result.modules.length} pcs.</text>
              <text x={0} y={result.bbH + padding + labelFontSize + labelLineHeight * 2} fontSize={labelFontSize} fill="#141414" fontFamily="sans-serif">Spacing : {spaceX}x{spaceY} mm.</text>

              {/* Remark */}
              <text x={result.bbW} y={result.bbH + padding + labelFontSize + labelLineHeight * 2} textAnchor="end" style={{ fontSize: `${dynamicFontSize * 0.8}px` }} className="font-sans fill-neutral-500 italic">
                * All dimensions are in mm
              </text>
            </svg>
          )}
        </div>
      </div>
      
      {showTemplateSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Template Settings & Export</h3>
              <button onClick={() => setShowTemplateSettings(false)} className="text-neutral-500 hover:text-neutral-800"><X size={20} /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 grid grid-cols-2 gap-4">
              <TextInput label="Project Name" value={docDetails.projectName} onChange={(v) => setDocDetails({...docDetails, projectName: v})} />
              <TextInput label="Location" value={docDetails.location} onChange={(v) => setDocDetails({...docDetails, location: v})} />
              <TextInput label="Project Number" value={docDetails.projectNumber} onChange={(v) => setDocDetails({...docDetails, projectNumber: v})} />
              <TextInput label="Date" value={docDetails.date} onChange={(v) => setDocDetails({...docDetails, date: v})} />
              <TextInput label="Client" value={docDetails.client} onChange={(v) => setDocDetails({...docDetails, client: v})} />
              <TextInput label="Drawing Title" value={docDetails.drawingTitle} onChange={(v) => setDocDetails({...docDetails, drawingTitle: v})} />
              <TextInput label="Status" value={docDetails.status} onChange={(v) => setDocDetails({...docDetails, status: v})} />
              <TextInput label="Design by" value={docDetails.designBy} onChange={(v) => setDocDetails({...docDetails, designBy: v})} />
              <TextInput label="Checked by" value={docDetails.checkedBy} onChange={(v) => setDocDetails({...docDetails, checkedBy: v})} />
              <TextInput label="Approved by" value={docDetails.approvedBy} onChange={(v) => setDocDetails({...docDetails, approvedBy: v})} />
            </div>
            
            <div className="p-4 bg-neutral-50 border-t border-neutral-200">
              <div className="mb-4">
                <h4 className="text-sm font-medium text-neutral-700 mb-2">Pages in Template ({pages.length})</h4>
                {pages.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">No pages added yet. Click "Add to Template" in the preview panel.</p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {pages.map((p) => (
                      <div key={p.id} className="relative flex-shrink-0 w-24 h-24 bg-white border border-neutral-200 rounded flex items-center justify-center group">
                        <svg viewBox={p.viewBox} className="w-20 h-20" dangerouslySetInnerHTML={{__html: p.svgContent}}></svg>
                        <button onClick={() => setPages(pages.filter(page => page.id !== p.id))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                          <X size={12} />
                        </button>
                        <div className="absolute bottom-1 left-0 right-0 text-center text-[8px] text-neutral-500 bg-white/80">{p.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowTemplateSettings(false)} className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-200 rounded">Cancel</button>
                <button 
                  onClick={generateTemplatePDF} 
                  disabled={pages.length === 0 || isGeneratingPDF}
                  className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded disabled:opacity-50 flex items-center gap-2"
                >
                  {isGeneratingPDF ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  {isGeneratingPDF ? 'Generating...' : 'Generate Multi-page PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
