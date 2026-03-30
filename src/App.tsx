import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Square, Circle as CircleIcon, Triangle as TriangleIcon, CircleDot, Hexagon, Octagon, Download, ZoomIn, ZoomOut, Maximize, FileText, Sparkles, Loader2, Upload, X, Pencil, Type, RotateCcw, Grid, Magnet } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { GoogleGenAI, Type as GenAIType, ThinkingLevel } from '@google/genai';
import opentype from 'opentype.js';

type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'donut' | 'ellipse' | 'semicircle' | 'u-shape' | 'c-shape' | 't-shape' | 'hollow-rect' | 'hexagon' | 'octagon' | 'custom' | 'polygon' | 'text';
type LayoutType = 'grid' | 'staggered';
type AppView = 'form' | 'planner';

interface Point { x: number; y: number; }

interface SavedShape {
  id: string;
  name: string;
  path: string;
  image?: string | null;
}

interface FormLampItem {
  id: string;
  objectShape: ShapeType;
  shapeName: string;
  w: number;
  l: number;
  innerDia: number;
  modulesPerLamp: number;
  q: number;
  h: string;
  d: string;
  f: string;
  t: string;
  file: File | null;
}

// Higher render resolution for crisper user-downloaded PDFs.
const TEMPLATE_DOWNLOAD_WIDTH = 4200;
const TEMPLATE_DOWNLOAD_HEIGHT = 2968;
const TEMPLATE_API_WIDTH = 1680;
const TEMPLATE_API_HEIGHT = 1188;

const SHAPE_OPTIONS: Array<{ value: ShapeType; label: string }> = [
  { value: 'rectangle', label: 'Rectangle (สี่เหลี่ยม)' },
  { value: 'circle', label: 'Circle (วงกลม)' },
  { value: 'triangle', label: 'Triangle (สามเหลี่ยม)' },
  { value: 'donut', label: 'Donut (วงแหวน)' },
  { value: 'ellipse', label: 'Ellipse (วงรี)' },
  { value: 'semicircle', label: 'Semicircle (ครึ่งวงกลม)' },
  { value: 'u-shape', label: 'U-Shape (ตัวยู)' },
  { value: 'c-shape', label: 'C-Shape (ตัวซี)' },
  { value: 't-shape', label: 'T-Shape (ตัวที)' },
  { value: 'hollow-rect', label: 'Hollow Rectangle (กรอบสี่เหลี่ยม)' },
  { value: 'hexagon', label: 'Hexagon (หกเหลี่ยม)' },
  { value: 'octagon', label: 'Octagon (แปดเหลี่ยม)' },
  { value: 'polygon', label: 'Custom Polygon (หลายเหลี่ยม)' },
  { value: 'text', label: 'Text Shape (ตัวอักษร)' },
  { value: 'custom', label: 'AI Custom (กำหนดเอง)' },
];

const parseHeightMeters = (value: string): number => {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getSpacingByDepth = (depth: string): { x: number; y: number } | null => {
  if (depth.includes('10')) return { x: 100, y: 100 };
  if (depth.includes('15')) return { x: 150, y: 150 };
  if (depth.includes('20')) return { x: 200, y: 200 };
  return null;
};

const getModuleColorsByLightTemp = (lightTemp: string): { fill: string; stroke: string; dot: string } => {
  const normalized = String(lightTemp || '').toLowerCase();

  if (normalized.includes('3000')) {
    return { fill: 'rgba(255, 195, 112, 0.26)', stroke: '#d97706', dot: '#b45309' };
  }
  if (normalized.includes('4000')) {
    return { fill: 'rgba(255, 243, 214, 0.34)', stroke: '#a16207', dot: '#854d0e' };
  }
  if (normalized.includes('5000')) {
    return { fill: 'rgba(224, 242, 254, 0.30)', stroke: '#0284c7', dot: '#0369a1' };
  }
  if (normalized.includes('6500')) {
    return { fill: 'rgba(181, 225, 255, 0.28)', stroke: '#2563eb', dot: '#1d4ed8' };
  }
  if (normalized.includes('tunable')) {
    return { fill: 'rgba(232, 242, 255, 0.30)', stroke: '#0ea5e9', dot: '#0369a1' };
  }
  if (normalized.includes('rgbw')) {
    return { fill: 'rgba(196, 126, 255, 0.28)', stroke: '#9333ea', dot: '#6b21a8' };
  }

  return { fill: 'rgba(255, 243, 214, 0.34)', stroke: '#a16207', dot: '#854d0e' };
};

const shouldForceDualModuleLayout = (lightTemp: string): boolean => {
  const normalized = String(lightTemp || '').toLowerCase();
  return normalized.includes('tunable') || normalized.includes('5000');
};

const LED_MODULE_WATT = 1.44;
const SWITCHING_POWER_WATT = 120;
const SWITCHING_PRICE_PER_UNIT = 500;
const MODULE_PRICE_PER_UNIT = 24;
const BOQ_WATERMARK_TEXT = 'ข้อมูลนี้ใช้เฉพาะภายในบริษัท LE& เท่านั้น';

const roundUpToInteger = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil(value);
};

const escapeSvgText = (value: string): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getNextShapeName = (lamps: FormLampItem[]): string => {
  const maxSeq = lamps.reduce((max, lamp) => {
    const match = String(lamp.shapeName || '').trim().match(/^SC-(\d+)$/i);
    if (!match) return max;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return max;
    return Math.max(max, value);
  }, 0);
  return `SC-${String(maxSeq + 1).padStart(2, '0')}`;
};

const normalizeShapeName = (name: string): string => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

const toValidQty = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return value > 0 ? value : 0;
};

const Input = ({ label, value, onChange, required = false, invalid = false, allowBlank = false, placeholder = '', helpText }: { label: string, value: number, onChange: (v: number) => void, required?: boolean, invalid?: boolean, allowBlank?: boolean, placeholder?: string, helpText?: string }) => (
  <div>
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">{label}{required && <span className="text-red-600"> *</span>}</label>
    <input 
      type="number" 
      value={allowBlank && !Number.isFinite(value) ? '' : value}
      onChange={(e) => {
        const raw = e.target.value;
        if (allowBlank && raw === '') {
          onChange(Number.NaN);
          return;
        }
        onChange(Number(raw));
      }}
      placeholder={placeholder}
      className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-1 outline-none transition-all font-mono bg-white ${invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-neutral-300 focus:border-blue-500 focus:ring-blue-500'}`}
    />
    {helpText && <p className="mt-1 text-[11px] text-neutral-500">{helpText}</p>}
  </div>
);

const TextInput = ({ label, value, onChange, required = false, invalid = false, placeholder = '', helpText }: { label: string, value: string, onChange: (v: string) => void, required?: boolean, invalid?: boolean, placeholder?: string, helpText?: string }) => (
  <div>
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">{label}{required && <span className="text-red-600"> *</span>}</label>
    <input 
      type="text" 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-1 outline-none transition-all font-mono bg-white ${invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-neutral-300 focus:border-blue-500 focus:ring-blue-500'}`}
    />
    {helpText && <p className="mt-1 text-[11px] text-neutral-500">{helpText}</p>}
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

// Convert text to SVG path using opentype.js
// Now fontSize is in mm (target height of the text)
const textToPath = async (text: string, targetHeightMM: number, fontUrl?: string): Promise<{ path: string; width: number; height: number }> => {
  const url = fontUrl || 'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff';
  
  try {
    const font = await opentype.load(url);
    // First, render at a reference size to get the actual dimensions
    const refSize = 1000;
    const refPath = font.getPath(text, 0, refSize, refSize);
    const refBbox = refPath.getBoundingBox();
    const refHeight = refBbox.y2 - refBbox.y1;
    
    // Calculate the actual font size needed to achieve the target height in mm
    const scale = targetHeightMM / refHeight;
    const actualFontSize = refSize * scale;
    
    const path = font.getPath(text, 0, actualFontSize, actualFontSize);
    const bbox = path.getBoundingBox();
    
    const pathData = path.toPathData(2);
    const width = bbox.x2 - bbox.x1;
    const height = bbox.y2 - bbox.y1;
    
    // Translate path to start from 0,0
    const translatedPath = `M ${-bbox.x1} ${-bbox.y1} ` + pathData;
    
    return { path: translatedPath, width, height };
  } catch (error) {
    console.error('Failed to load font:', error);
    // Fallback: create a simple rectangle with target dimensions
    const width = targetHeightMM * text.length * 0.6;
    return { 
      path: `M 0 0 L ${width} 0 L ${width} ${targetHeightMM} L 0 ${targetHeightMM} Z`, 
      width, 
      height: targetHeightMM 
    };
  }
};

// L&E Logo SVG path (correct version)
const LOGO_LE_PATH = `M84.8243 0.314266C67.5537 1.61245 50.2804 8.46213 36.1963 19.5976C19.4587 32.831 6.85699 53.2186 2.20669 74.5867C-0.0110881 84.7771 -0.139264 88.9375 0.0721129 143.945L0.27562 196.991L1.78056 203.899C7.73679 231.234 23.02 253.224 45.7245 267.127C54.2044 272.32 64.3291 276.228 74.9846 278.422L81.1702 279.696H306.04H530.909L536.812 278.378C555.506 274.205 570.155 266.159 583.192 252.903C591.308 244.65 596.273 237.707 601.145 227.791C606.899 216.082 609.871 205.437 611.044 192.335C611.44 187.911 611.579 168.279 611.447 135.39C611.249 86.0919 611.223 85.0794 609.982 78.637C604.073 47.9917 585.878 23.1266 559.58 9.75974C549.231 4.49971 539.376 1.65979 527.506 0.517892C521.902 -0.0216864 91.92 -0.219039 84.8243 0.314266ZM85.3865 25.4138C66.3541 27.5139 49.2055 37.7631 37.8479 53.8255C34.2899 58.8574 29.2838 69.0375 27.7502 74.3592C24.9134 84.2022 25.0523 81.2163 24.8235 137.386C24.5863 195.581 24.5913 195.679 28.1026 206.582C36.3717 232.255 58.0092 250.978 83.2609 254.31C86.5372 254.743 153.367 254.874 308.85 254.755L529.785 254.584L535.285 253.022C541.53 251.249 546.373 249.297 550.866 246.745C565.909 238.198 577.936 223.245 583.113 206.652C586.681 195.215 586.564 197.456 586.564 140.523C586.564 101.964 586.386 87.5806 585.872 84.5821C582.497 64.9183 571.292 46.8321 556.226 36.7318C548.628 31.6383 542.269 28.7979 533.439 26.5534L528.66 25.3391L308.007 25.2678C186.648 25.229 86.4686 25.2946 85.3865 25.4138Z`;

const LOGO_LE_L_PATH = `M104.293 73.4609V206.239H196.665V186.076H126.636V73.4609H104.293Z`;

const LOGO_LE_AMPERSAND_PATH = `M325.799 140C340.293 140 352.093 128.2 352.093 113.706C352.093 99.2124 340.293 87.4118 325.799 87.4118C311.306 87.4118 299.505 99.2124 299.505 113.706C299.505 128.2 311.306 140 325.799 140ZM325.799 192.588C340.293 192.588 352.093 180.788 352.093 166.294C352.093 151.8 340.293 140 325.799 140C311.306 140 299.505 151.8 299.505 166.294C299.505 180.788 311.306 192.588 325.799 192.588ZM282.152 113.706C282.152 89.7176 301.811 70.0588 325.799 70.0588C349.788 70.0588 369.447 89.7176 369.447 113.706C369.447 125.127 365.004 135.503 357.799 143.294L369.447 155.882L357.799 166.294L346.152 153.706C338.358 162.092 327.093 167.647 314.505 168.706L314.505 186.059H337.093V206.222H282.152V168.706C264.993 166.596 251.505 151.8 251.505 133.706C251.505 118.588 261.358 105.647 274.858 101.176L282.152 113.706ZM269.505 133.706C269.505 142.788 276.799 150.353 285.799 150.882V116.529C276.799 117.059 269.505 124.624 269.505 133.706Z`;

const LOGO_LE_E_PATH = `M413.505 73.4609V206.239H507.847V186.076H435.847V149.559H498.259V129.397H435.847V93.6239H507.847V73.4609H413.505Z`;

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
  const [layoutType, setLayoutType] = useState<LayoutType>('staggered');
  const [showCenterLines, setShowCenterLines] = useState(true);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  // Polygon drawing state
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [polygonScale, setPolygonScale] = useState(10); // mm per grid unit
  const [polygonGridSize, setPolygonGridSize] = useState(20); // pixels per grid cell
  const [polygonCanvasZoom, setPolygonCanvasZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const polygonCanvasRef = useRef<SVGSVGElement>(null);

  // Text shape state
  const [textInput, setTextInput] = useState('A');
  const [textHeightMM, setTextHeightMM] = useState(500); // Target height in mm
  const [textPath, setTextPath] = useState('');
  const [textBounds, setTextBounds] = useState({ width: 500, height: 500 });
  const [isLoadingText, setIsLoadingText] = useState(false);

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
    projectName: '',
    location: '',
    projectNumber: '',
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
    moduleCount: number;
    name: string;
    q: number;
    h: string;
    d: string;
    f: string;
    t: string;
    exactAreaSqm: number;
  }
  const [pages, setPages] = useState<PageData[]>([]);
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  // --- BOQ Form States ---
  const [lampQ, setLampQ] = useState(1);
  const [lampH, setLampH] = useState('3');
  const [lampD, setLampD] = useState('15 เซนติเมตร (Standard)');
  const [lampF, setLampF] = useState('ผ้าใบขาว');
  const [lampLight, setLampLight] = useState('3000K');
  const [structure, setStructure] = useState('');
  const [aoName, setAoName] = useState('');
  const [isSendingBOQ, setIsSendingBOQ] = useState(false);
  const [isDataConfirmed, setIsDataConfirmed] = useState(false);
  const [appView, setAppView] = useState<AppView>('form');
  const [pricingView, setPricingView] = useState<'summary' | 'type'>('summary');
  const [isSubmittingChecklist, setIsSubmittingChecklist] = useState(false);
  const [submitProgressText, setSubmitProgressText] = useState('');
  const [logoSvgData, setLogoSvgData] = useState<{ viewBox: string; inner: string } | null>(null);
  const [formLamps, setFormLamps] = useState<FormLampItem[]>([
    {
      id: Math.random().toString(36).slice(2),
      objectShape: 'rectangle',
      shapeName: 'SC-01',
      w: Number.NaN,
      l: Number.NaN,
      innerDia: 500,
      modulesPerLamp: 1,
      q: Number.NaN,
      h: '',
      d: '10 เซนติเมตร',
      f: 'ผ้าใบขาว',
      t: '3000K',
      file: null,
    },
  ]);
  const [plannerLampId, setPlannerLampId] = useState<string | null>(null);
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

  React.useEffect(() => {
    if (formLamps.length === 0) {
      setPlannerLampId(null);
      return;
    }
    if (!plannerLampId || !formLamps.some(l => l.id === plannerLampId)) {
      setPlannerLampId(formLamps[0].id);
    }
  }, [formLamps, plannerLampId]);

  React.useEffect(() => {
    setIsDataConfirmed(false);
  }, [
    aoName,
    structure,
    docDetails.projectName,
    docDetails.location,
    docDetails.projectNumber,
    docDetails.client,
    docDetails.drawingTitle,
    JSON.stringify(formLamps),
    JSON.stringify(pages),
  ]);

  React.useEffect(() => {
    const loadLogoForPdf = async () => {
      try {
        const response = await fetch('/logo_LE.svg');
        if (!response.ok) return;
        const rawSvg = await response.text();
        const viewBoxMatch = rawSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
        const inner = rawSvg
          .replace(/^[\s\S]*?<svg[^>]*>/i, '')
          .replace(/<\/svg>\s*$/i, '')
          .trim();

        if (inner) {
          setLogoSvgData({
            viewBox: viewBoxMatch?.[1] || '0 0 612 280',
            inner,
          });
        }
      } catch (error) {
        console.error('Failed to load /logo_LE.svg for PDF render:', error);
      }
    };

    loadLogoForPdf();
  }, []);

  // Generate text path when text input changes
  const generateTextPath = useCallback(async () => {
    if (!textInput.trim()) return;
    setIsLoadingText(true);
    try {
      const result = await textToPath(textInput, textHeightMM);
      setTextPath(result.path);
      setTextBounds({ width: result.width, height: result.height });
    } catch (error) {
      console.error('Failed to generate text path:', error);
    } finally {
      setIsLoadingText(false);
    }
  }, [textInput, textHeightMM]);

  React.useEffect(() => {
    if (shape === 'text') {
      generateTextPath();
    }
  }, [shape, textInput, textHeightMM, generateTextPath]);

  // Generate polygon path from points (in mm)
  const polygonPath = useMemo(() => {
    if (polygonPoints.length < 3) return '';
    // Points are already in mm (gridUnits * polygonScale)
    return `M ${polygonPoints[0].x} ${polygonPoints[0].y} ` + polygonPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z';
  }, [polygonPoints]);

  // Polygon bounding box
  const polygonBounds = useMemo(() => {
    if (polygonPoints.length < 3) return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    const minX = Math.min(...polygonPoints.map(p => p.x));
    const minY = Math.min(...polygonPoints.map(p => p.y));
    const maxX = Math.max(...polygonPoints.map(p => p.x));
    const maxY = Math.max(...polygonPoints.map(p => p.y));
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [polygonPoints]);

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
    } else if (shape === 'polygon') {
      if (polygonPoints.length < 3) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Draw at least 3 points' };
      bbW = polygonBounds.width;
      bbH = polygonBounds.height;
      // Normalize polygon to start from 0,0
      const normalized = polygonPoints.map(p => ({ 
        x: p.x - polygonBounds.minX, 
        y: p.y - polygonBounds.minY 
      }));
      shapePath = `M ${normalized[0].x} ${normalized[0].y} ` + normalized.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z';
    } else if (shape === 'text') {
      if (!textPath) return { modules: [], shapePath: '', bbW: 100, bbH: 100, error: 'Enter text to generate shape' };
      bbW = textBounds.width;
      bbH = textBounds.height;
      shapePath = textPath;
    }

    let customCtx: CanvasRenderingContext2D | null = null;
    let customPath2D: Path2D | null = null;
    if ((shape === 'custom' && customPath) || shape === 'polygon' || shape === 'text') {
      const canvas = document.createElement('canvas');
      customCtx = canvas.getContext('2d');
      if (customCtx) {
        customPath2D = new Path2D(shapePath);
      }
    }

    const forceDualModuleLayout = shouldForceDualModuleLayout(lampLight);
    const effectiveLayoutType: LayoutType = forceDualModuleLayout ? 'grid' : layoutType;
    const placementModW = forceDualModuleLayout ? modW * 2 : modW;

    const ny = Math.floor((bbH - modH) / spaceY) + 1;

    if (ny > 0) {
      const arrH = (ny - 1) * spaceY + modH;
      const startY = (bbH - arrH) / 2 + modH / 2;

      let arrW = 0;
      let nx_even = 0;
      let nx_odd = 0;

      if (effectiveLayoutType === 'grid') {
        nx_even = Math.floor((bbW - placementModW) / spaceX) + 1;
        nx_odd = nx_even;
        if (nx_even > 0) {
          arrW = (nx_even - 1) * spaceX + placementModW;
        }
      } else {
        nx_even = Math.floor((bbW - placementModW) / spaceX) + 1;
        nx_odd = Math.floor((bbW - placementModW - spaceX / 2) / spaceX) + 1;
        if (nx_even > 0 || nx_odd > 0) {
          const w_even = nx_even > 0 ? (nx_even - 1) * spaceX + placementModW : 0;
          const w_odd = nx_odd > 0 ? spaceX / 2 + (nx_odd - 1) * spaceX + placementModW : 0;
          arrW = Math.max(w_even, w_odd);
        }
      }

      if (arrW > 0) {
        const baseStartX = (bbW - arrW) / 2 + placementModW / 2;

        for (let j = 0; j < ny; j++) {
          const isOddRow = j % 2 !== 0;
          const nx = (effectiveLayoutType === 'staggered' && isOddRow) ? nx_odd : nx_even;
          const offsetX = (effectiveLayoutType === 'staggered' && isOddRow) ? spaceX / 2 : 0;
          
          for (let i = 0; i < nx; i++) {
            const cx = baseStartX + offsetX + i * spaceX;
            const cy = startY + j * spaceY;
            let isInside = false;
            const corners = [
              {x: cx - placementModW/2, y: cy - modH/2}, {x: cx + placementModW/2, y: cy - modH/2},
              {x: cx + placementModW/2, y: cy + modH/2}, {x: cx - placementModW/2, y: cy + modH/2}
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
            } else if (shape === 'polygon') {
              // Point in polygon test for custom polygons
              const normalizedPoly = polygonPoints.map(p => ({ 
                x: p.x - polygonBounds.minX, 
                y: p.y - polygonBounds.minY 
              }));
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
              isInside = corners.every(pt => pointInPolygon(pt, normalizedPoly));
            } else if (shape === 'text') {
              if (customCtx && customPath2D) {
                isInside = corners.every(pt => {
                  return customCtx!.isPointInPath(customPath2D!, pt.x, pt.y);
                });
              }
            }
            if (isInside) {
              if (forceDualModuleLayout) {
                const leftX = cx - placementModW / 2;
                modules.push({ x: leftX, y: cy - modH / 2, w: modW, h: modH });
                modules.push({ x: leftX + modW, y: cy - modH / 2, w: modW, h: modH });
              } else {
                modules.push({ x: cx - modW / 2, y: cy - modH / 2, w: modW, h: modH });
              }
            }
          }
        }
      }
    }
    return { modules, shapePath, bbW, bbH, error };
  }, [shape, rectW, rectH, circleD, triA, triB, triC, donutOuterD, donutInnerD, ellipseW, ellipseH, semicircleD, uW, uH, uT, cW, cH, cT, tW, tH, tT, hRectW, hRectH, hRectT, hexW, hexH, octW, octH, modW, modH, spaceX, spaceY, layoutType, customPath, polygonPoints, polygonBounds, textPath, textBounds, lampLight]);

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
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
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
        type: GenAIType.OBJECT,
        properties: {
          reasoning_steps: {
            type: GenAIType.ARRAY,
            items: { type: GenAIType.STRING },
            description: "Chain-of-thought reasoning steps analyzing the image."
          },
          path: {
            type: GenAIType.STRING,
            description: "The 'd' attribute string for an SVG <path> that draws the main shape. MUST be normalized to a 100x100 viewBox (0,0 to 100,100)."
          },
          overall_width: { type: GenAIType.NUMBER, description: "Overall width of the main shape in mm. Null if not found." },
          overall_height: { type: GenAIType.NUMBER, description: "Overall height of the main shape in mm. Null if not found." },
          module_width: { type: GenAIType.NUMBER, description: "Width of a single module in mm. Null if not found." },
          module_height: { type: GenAIType.NUMBER, description: "Height of a single module in mm. Null if not found." },
          module_spacing_x: { type: GenAIType.NUMBER, description: "Horizontal center-to-center spacing between modules in mm. Null if not found." },
          module_spacing_y: { type: GenAIType.NUMBER, description: "Vertical center-to-center spacing between modules in mm. Null if not found." },
          layout_type: { type: GenAIType.STRING, description: "Layout pattern of the modules.", enum: ["grid", "staggered"] }
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

  // Polygon drawing handlers with snap to grid
  const handlePolygonCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawingPolygon) return;
    const svg = polygonCanvasRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const viewBoxWidth = 600 / polygonCanvasZoom;
    const viewBoxHeight = 400 / polygonCanvasZoom;
    
    // Convert screen coordinates to SVG coordinates
    let x = ((e.clientX - rect.left) / rect.width) * viewBoxWidth;
    let y = ((e.clientY - rect.top) / rect.height) * viewBoxHeight;
    
    // Snap to grid if enabled
    if (snapToGrid) {
      x = Math.round(x / polygonGridSize) * polygonGridSize;
      y = Math.round(y / polygonGridSize) * polygonGridSize;
    }
    
    // Convert to mm (grid units * scale)
    const xMM = x * polygonScale / polygonGridSize;
    const yMM = y * polygonScale / polygonGridSize;
    
    setPolygonPoints([...polygonPoints, { x: xMM, y: yMM }]);
  };

  const handlePolygonComplete = () => {
    setIsDrawingPolygon(false);
  };

  const handlePolygonReset = () => {
    setPolygonPoints([]);
    setIsDrawingPolygon(true);
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
  const exportViewBox = `${-padding} ${-padding} ${baseVbW} ${baseVbH}`;

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
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = "anonymous";
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
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to render SVG image during export'));
      };
      img.src = url;
    });
  };

  const buildLeLogoMarkup = (x: number, y: number, width: number, height: number) => {
    if (logoSvgData) {
      return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${logoSvgData.viewBox}" preserveAspectRatio="xMidYMid meet">${logoSvgData.inner}</svg>`;
    }
    return `<image href="/logo_LE.svg" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />`;
  };

  const generateCoverPageSVG = (details: DocumentDetails) => {
    const coverLogoMarkup = buildLeLogoMarkup(1500, 400, 1200, 549);
    return `
      <svg width="4200" height="2970" viewBox="0 0 4200 2970" xmlns="http://www.w3.org/2000/svg">
        <rect width="4200" height="2970" fill="white" />
        <rect x="100" y="100" width="4000" height="2770" fill="none" stroke="black" stroke-width="5"/>
        <rect x="120" y="120" width="3960" height="2730" fill="none" stroke="black" stroke-width="2"/>
        ${coverLogoMarkup}

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
    const sideLogoMarkup = buildLeLogoMarkup(90, 80, 400, 183);
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
          
          ${sideLogoMarkup}
          
          <text x="290" y="290" font-family="sans-serif" font-size="20" text-anchor="middle">539/2, 16-17 F. Gypsum Metropolitan Tower</text>
          <text x="290" y="320" font-family="sans-serif" font-size="20" text-anchor="middle">Rajthevee, Bangkok, Thailand, 10400</text>
          
          <line x1="0" y1="350" x2="580" y2="350" stroke="black" stroke-width="2"/>
          <text x="20" y="380" font-family="sans-serif" font-size="20" font-weight="bold">Project Name</text>
          <text x="290" y="440" font-family="sans-serif" font-size="30" text-anchor="middle">${details.projectName}</text>
          
          <line x1="0" y1="500" x2="580" y2="500" stroke="black" stroke-width="2"/>
          <text x="20" y="530" font-family="sans-serif" font-size="20" font-weight="bold">Project Number :</text>
          <text x="200" y="530" font-family="sans-serif" font-size="25">${details.projectNumber}</text>
          
          <line x1="0" y1="560" x2="580" y2="560" stroke="black" stroke-width="2"/>
          <text x="20" y="590" font-family="sans-serif" font-size="20" font-weight="bold">Client.</text>
          <text x="290" y="650" font-family="sans-serif" font-size="30" text-anchor="middle">${details.client}</text>
          
          <line x1="0" y1="710" x2="580" y2="710" stroke="black" stroke-width="2"/>
          <text x="20" y="740" font-family="sans-serif" font-size="20" font-weight="bold">Location :</text>
          <text x="150" y="740" font-family="sans-serif" font-size="25">${details.location}</text>
          
          <line x1="0" y1="770" x2="580" y2="770" stroke="black" stroke-width="2"/>
          <text x="20" y="800" font-family="sans-serif" font-size="20" font-weight="bold">Note :</text>
          
          <line x1="0" y1="900" x2="580" y2="900" stroke="black" stroke-width="2"/>
          <text x="20" y="930" font-family="sans-serif" font-size="20" font-weight="bold">Drawing Title.</text>
          <text x="290" y="1010" font-family="sans-serif" font-size="35" text-anchor="middle">${details.drawingTitle}</text>
          
          <line x1="0" y1="1100" x2="580" y2="1100" stroke="black" stroke-width="2"/>
          <text x="290" y="1130" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">Revisions</text>
          
          <line x1="0" y1="1150" x2="580" y2="1150" stroke="black" stroke-width="2"/>
          <line x1="80" y1="1150" x2="80" y2="1450" stroke="black" stroke-width="2"/>
          <line x1="450" y1="1150" x2="450" y2="1450" stroke="black" stroke-width="2"/>
          
          <text x="40" y="1180" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">Rev.</text>
          <text x="265" y="1180" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">Issue / Revision</text>
          <text x="515" y="1180" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">Date.</text>
          
          <line x1="0" y1="1200" x2="580" y2="1200" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1250" x2="580" y2="1250" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1300" x2="580" y2="1300" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1350" x2="580" y2="1350" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1400" x2="580" y2="1400" stroke="black" stroke-width="2"/>
          <line x1="0" y1="1450" x2="580" y2="1450" stroke="black" stroke-width="2"/>
          
          <line x1="150" y1="1450" x2="150" y2="2730" stroke="black" stroke-width="2"/>
          
          <text x="20" y="1490" font-family="sans-serif" font-size="20" font-weight="bold">Status :</text>
          <text x="170" y="1490" font-family="sans-serif" font-size="25">${details.status}</text>
          
          <line x1="0" y1="1530" x2="580" y2="1530" stroke="black" stroke-width="2"/>
          <text x="20" y="1570" font-family="sans-serif" font-size="20" font-weight="bold">Design by :</text>
          <text x="170" y="1570" font-family="sans-serif" font-size="25">${details.designBy}</text>
          
          <line x1="0" y1="1610" x2="580" y2="1610" stroke="black" stroke-width="2"/>
          <text x="20" y="1650" font-family="sans-serif" font-size="20" font-weight="bold">Checked by :</text>
          <text x="170" y="1650" font-family="sans-serif" font-size="25">${details.checkedBy}</text>
          
          <line x1="0" y1="1690" x2="580" y2="1690" stroke="black" stroke-width="2"/>
          <text x="20" y="1730" font-family="sans-serif" font-size="20" font-weight="bold">Approved</text>
          <text x="20" y="1760" font-family="sans-serif" font-size="20" font-weight="bold">by Client :</text>
          
          <line x1="0" y1="1800" x2="580" y2="1800" stroke="black" stroke-width="2"/>
          <text x="20" y="1840" font-family="sans-serif" font-size="20" font-weight="bold">Signature and</text>
          <text x="20" y="1870" font-family="sans-serif" font-size="20" font-weight="bold">Company Stamp :</text>
          
          <line x1="0" y1="2000" x2="580" y2="2000" stroke="black" stroke-width="2"/>
          <text x="20" y="2040" font-family="sans-serif" font-size="20" font-weight="bold">Page Size :</text>
          <text x="170" y="2040" font-family="sans-serif" font-size="25">A3</text>
          
          <line x1="0" y1="2080" x2="580" y2="2080" stroke="black" stroke-width="2"/>
          <text x="20" y="2120" font-family="sans-serif" font-size="20" font-weight="bold">Scale :</text>
          <text x="170" y="2120" font-family="sans-serif" font-size="25">NTS</text>
          
          <line x1="0" y1="2160" x2="580" y2="2160" stroke="black" stroke-width="2"/>
          <text x="20" y="2200" font-family="sans-serif" font-size="20" font-weight="bold">Unit :</text>
          <text x="170" y="2200" font-family="sans-serif" font-size="25">mm.</text>
          
          <line x1="0" y1="2240" x2="580" y2="2240" stroke="black" stroke-width="2"/>
          <text x="20" y="2280" font-family="sans-serif" font-size="20" font-weight="bold">Date :</text>
          <text x="170" y="2280" font-family="sans-serif" font-size="25">${details.date}</text>
          
          <line x1="0" y1="2320" x2="580" y2="2320" stroke="black" stroke-width="2"/>
          <text x="20" y="2360" font-family="sans-serif" font-size="20" font-weight="bold">Sheet No :</text>
          <text x="170" y="2360" font-family="sans-serif" font-size="25">${pageNum}/${totalPages}</text>
          
          <line x1="0" y1="2400" x2="580" y2="2400" stroke="black" stroke-width="2"/>
        </g>

        <svg x="120" y="420" width="3380" height="2430" viewBox="${page.viewBox}">
          ${page.svgContent}
        </svg>
      </svg>
    `;
  };

  const calculateExactAreaSqm = () => {
    let areaMm2 = 0;
    if (shape === 'rectangle') areaMm2 = rectW * rectH;
    else if (shape === 'circle') areaMm2 = Math.PI * Math.pow(circleD / 2, 2);
    else if (shape === 'triangle') {
      const s = (triA + triB + triC) / 2;
      areaMm2 = Math.sqrt(s * (s - triA) * (s - triB) * (s - triC)) || 0;
    }
    else if (shape === 'donut') areaMm2 = Math.PI * (Math.pow(donutOuterD/2, 2) - Math.pow(donutInnerD/2, 2));
    else if (shape === 'ellipse') areaMm2 = Math.PI * (ellipseW / 2) * (ellipseH / 2);
    else if (shape === 'semicircle') areaMm2 = 0.5 * Math.PI * Math.pow(semicircleD / 2, 2);
    else if (shape === 'u-shape') areaMm2 = (uW * uH) - ((uW - 2 * uT) * (uH - uT));
    else if (shape === 'c-shape') areaMm2 = (cW * cH) - ((cW - cT) * (cH - 2 * cT));
    else if (shape === 't-shape') areaMm2 = (tW * tT) + ((tH - tT) * tT);
    else if (shape === 'hollow-rect') areaMm2 = (hRectW * hRectH) - ((hRectW - 2 * hRectT) * (hRectH - 2 * hRectT));
    else if (shape === 'hexagon') areaMm2 = 0.75 * hexW * hexH;
    else if (shape === 'octagon') areaMm2 = octW * octH - 2 * Math.pow(octW / (2 + Math.sqrt(2)), 2);
    else if (shape === 'polygon') {
      let sum = 0;
      const pts = polygonPoints;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        sum += (p1.x * p2.y) - (p2.x * p1.y);
      }
      areaMm2 = Math.abs(sum / 2);
    } else {
      areaMm2 = result.bbW * result.bbH; // Fallback for Custom/Text
    }
    return areaMm2 / 1000000; // แปลงตารางมิลลิเมตร เป็น ตารางเมตร
  };

  const getPlannerDimensions = useCallback((shapeToUse: ShapeType): { w: number; l: number } => {
    if (shapeToUse === 'rectangle' || shapeToUse === 'custom') return { w: rectW, l: rectH };
    if (shapeToUse === 'circle') return { w: circleD, l: circleD };
    if (shapeToUse === 'triangle') return { w: result.bbW || triC, l: result.bbH || triB };
    if (shapeToUse === 'donut') return { w: donutOuterD, l: donutOuterD };
    if (shapeToUse === 'ellipse') return { w: ellipseW, l: ellipseH };
    if (shapeToUse === 'semicircle') return { w: semicircleD, l: semicircleD / 2 };
    if (shapeToUse === 'u-shape') return { w: uW, l: uH };
    if (shapeToUse === 'c-shape') return { w: cW, l: cH };
    if (shapeToUse === 't-shape') return { w: tW, l: tH };
    if (shapeToUse === 'hollow-rect') return { w: hRectW, l: hRectH };
    if (shapeToUse === 'hexagon') return { w: hexW, l: hexH };
    if (shapeToUse === 'octagon') return { w: octW, l: octH };
    if (shapeToUse === 'polygon') return { w: polygonBounds.width || result.bbW, l: polygonBounds.height || result.bbH };
    if (shapeToUse === 'text') return { w: textBounds.width || result.bbW, l: textBounds.height || result.bbH };
    return { w: result.bbW, l: result.bbH };
  }, [rectW, rectH, circleD, result.bbW, result.bbH, triC, triB, donutOuterD, ellipseW, ellipseH, semicircleD, uW, uH, cW, cH, tW, tH, hRectW, hRectH, hexW, hexH, octW, octH, polygonBounds.width, polygonBounds.height, textBounds.width, textBounds.height]);

  const applyLampToPlanner = useCallback((lamp: FormLampItem) => {
    const width = Math.max(100, lamp.w || 1000);
    const height = Math.max(100, lamp.l || 1000);
    setObjectName(lamp.shapeName || 'SC-01');
    setShape(lamp.objectShape);
    setLampQ(lamp.q || 1);
    setLampH(lamp.h || '3');
    setLampD(lamp.d || '15 เซนติเมตร (Standard)');
    setLampF(lamp.f || 'ผ้าใบขาว');
    setLampLight(lamp.t || '3000K');

    if (lamp.objectShape === 'rectangle' || lamp.objectShape === 'custom') {
      setRectW(width);
      setRectH(height);
    } else if (lamp.objectShape === 'circle') {
      setCircleD(Math.max(width, height));
    } else if (lamp.objectShape === 'triangle') {
      setTriA(width);
      setTriB(height);
      setTriC(Math.max(100, Math.round((width + height) / 2)));
    } else if (lamp.objectShape === 'donut') {
      const outer = Math.max(width, height);
      setDonutOuterD(outer);
      setDonutInnerD(Math.max(10, Math.min(outer - 10, lamp.innerDia || Math.round(outer * 0.5))));
    } else if (lamp.objectShape === 'ellipse') {
      setEllipseW(width);
      setEllipseH(height);
    } else if (lamp.objectShape === 'semicircle') {
      setSemicircleD(Math.max(width, height));
    } else if (lamp.objectShape === 'u-shape') {
      setUW(width);
      setUH(height);
    } else if (lamp.objectShape === 'c-shape') {
      setCW(width);
      setCH(height);
    } else if (lamp.objectShape === 't-shape') {
      setTW(width);
      setTH(height);
    } else if (lamp.objectShape === 'hollow-rect') {
      setHRectW(width);
      setHRectH(height);
    } else if (lamp.objectShape === 'hexagon') {
      setHexW(width);
      setHexH(height);
    } else if (lamp.objectShape === 'octagon') {
      setOctW(width);
      setOctH(height);
    } else if (lamp.objectShape === 'text') {
      setTextHeightMM(height);
    }
  }, []);

  React.useEffect(() => {
    if (appView !== 'planner' || !plannerLampId) return;
    const selectedLamp = formLamps.find(l => l.id === plannerLampId);
    if (selectedLamp) applyLampToPlanner(selectedLamp);
  }, [appView, plannerLampId]);

  React.useEffect(() => {
    const spacing = getSpacingByDepth(lampD);
    if (!spacing) return;
    if (spaceX !== spacing.x) setSpaceX(spacing.x);
    if (spaceY !== spacing.y) setSpaceY(spacing.y);
  }, [lampD, spaceX, spaceY]);

  React.useEffect(() => {
    if (appView !== 'planner' || !plannerLampId) return;
    const dims = getPlannerDimensions(shape);
    setFormLamps(prev => prev.map(lamp => {
      if (lamp.id !== plannerLampId) return lamp;
      const nextW = Math.max(1, Math.round(dims.w));
      const nextL = Math.max(1, Math.round(dims.l));
      const hasChanges =
        lamp.objectShape !== shape ||
        lamp.shapeName !== objectName ||
        lamp.w !== nextW ||
        lamp.l !== nextL ||
        lamp.q !== lampQ ||
        lamp.h !== lampH ||
        lamp.d !== lampD ||
        lamp.f !== lampF ||
        lamp.t !== lampLight;

      if (!hasChanges) return lamp;
      return {
        ...lamp,
        objectShape: shape,
        shapeName: objectName,
        w: nextW,
        l: nextL,
        innerDia: shape === 'donut' ? donutInnerD : lamp.innerDia,
        modulesPerLamp: Math.max(1, result.modules.length),
        q: lampQ,
        h: lampH,
        d: lampD,
        f: lampF,
        t: lampLight,
      };
    }));
  }, [appView, plannerLampId, shape, objectName, donutInnerD, lampQ, lampH, lampD, lampF, lampLight, getPlannerDimensions, result.modules.length]);

  const addToTemplate = () => {
    if (!svgRef.current) return;
    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
    const innerHTML = svgClone.innerHTML;

    const pageId = plannerLampId || Math.random().toString(36).substring(7);
    const nextPage: PageData = {
      id: pageId,
      svgContent: innerHTML,
      viewBox: exportViewBox,
      bbW: result.bbW,
      bbH: result.bbH,
      moduleCount: result.modules.length,
      name: `${objectName} (${shape})`,
      q: lampQ,
      h: lampH,
      d: lampD,
      f: lampF,
      t: lampLight,
      exactAreaSqm: calculateExactAreaSqm()
    };

    setPages(prev => {
      const idx = prev.findIndex(p => p.id === pageId);
      if (idx >= 0) {
        const clone = [...prev];
        clone[idx] = nextPage;
        return clone;
      }
      return [...prev, nextPage];
    });
  };

  const buildFormTemplatePage = (lamp: FormLampItem, index: number): PageData => {
    const width = Math.max(100, lamp.w || 1000);
    const height = Math.max(100, lamp.l || 1000);
    const thickness = Math.max(20, Math.min(width, height) * 0.2);
    const cx = width / 2;
    const cy = height / 2;
    const donutOuter = Math.max(100, width);
    const donutInner = Math.max(10, Math.min(donutOuter - 10, lamp.innerDia || Math.round(donutOuter * 0.5)));
    const shapePathByType: Record<ShapeType, string> = {
      rectangle: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
      circle: `M ${cx} ${cy} m -${Math.min(width, height) / 2}, 0 a ${Math.min(width, height) / 2},${Math.min(width, height) / 2} 0 1,0 ${Math.min(width, height)},0 a ${Math.min(width, height) / 2},${Math.min(width, height) / 2} 0 1,0 -${Math.min(width, height)},0`,
      triangle: `M ${width / 2} 0 L ${width} ${height} L 0 ${height} Z`,
      donut: `M ${donutOuter / 2} ${donutOuter / 2} m -${donutOuter / 2}, 0 a ${donutOuter / 2},${donutOuter / 2} 0 1,0 ${donutOuter},0 a ${donutOuter / 2},${donutOuter / 2} 0 1,0 -${donutOuter},0 M ${donutOuter / 2} ${donutOuter / 2} m -${donutInner / 2}, 0 a ${donutInner / 2},${donutInner / 2} 0 1,1 ${donutInner},0 a ${donutInner / 2},${donutInner / 2} 0 1,1 -${donutInner},0`,
      ellipse: `M ${cx} ${cy} m -${width / 2}, 0 a ${width / 2},${height / 2} 0 1,0 ${width},0 a ${width / 2},${height / 2} 0 1,0 -${width},0`,
      semicircle: `M 0 ${height} A ${width / 2} ${height} 0 0 1 ${width} ${height} L 0 ${height} Z`,
      'u-shape': `M 0 0 L ${thickness} 0 L ${thickness} ${height - thickness} L ${width - thickness} ${height - thickness} L ${width - thickness} 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
      'c-shape': `M 0 0 L ${width} 0 L ${width} ${thickness} L ${thickness} ${thickness} L ${thickness} ${height - thickness} L ${width} ${height - thickness} L ${width} ${height} L 0 ${height} Z`,
      't-shape': `M 0 0 L ${width} 0 L ${width} ${thickness} L ${width / 2 + thickness / 2} ${thickness} L ${width / 2 + thickness / 2} ${height} L ${width / 2 - thickness / 2} ${height} L ${width / 2 - thickness / 2} ${thickness} L 0 ${thickness} Z`,
      'hollow-rect': `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z M ${thickness} ${thickness} L ${thickness} ${height - thickness} L ${width - thickness} ${height - thickness} L ${width - thickness} ${thickness} Z`,
      hexagon: `M ${width / 2} 0 L ${width} ${height / 4} L ${width} ${3 * height / 4} L ${width / 2} ${height} L 0 ${3 * height / 4} L 0 ${height / 4} Z`,
      octagon: `M ${width * 0.3} 0 L ${width * 0.7} 0 L ${width} ${height * 0.3} L ${width} ${height * 0.7} L ${width * 0.7} ${height} L ${width * 0.3} ${height} L 0 ${height * 0.7} L 0 ${height * 0.3} Z`,
      polygon: `M ${width / 2} 0 L ${width} ${height * 0.35} L ${width * 0.8} ${height} L ${width * 0.2} ${height} L 0 ${height * 0.35} Z`,
      text: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
      custom: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
    };

    const shapePath = shapePathByType[lamp.objectShape] || shapePathByType.rectangle;
    const depthSpacing = getSpacingByDepth(lamp.d || '');
    const currentSpaceX = depthSpacing?.x ?? spaceX;
    const currentSpaceY = depthSpacing?.y ?? spaceY;
    const modules: Array<{ x: number; y: number; w: number; h: number }> = [];

    const forceDualModuleLayout = shouldForceDualModuleLayout(lamp.t || lampLight);
    const effectiveLayoutType: LayoutType = forceDualModuleLayout ? 'grid' : layoutType;
    const placementModW = forceDualModuleLayout ? modW * 2 : modW;

    if (modW > 0 && modH > 0 && currentSpaceX > 0 && currentSpaceY > 0) {
      const path = new Path2D(shapePath);
      const testCanvas = document.createElement('canvas');
      const testCtx = testCanvas.getContext('2d');
      if (testCtx) {
        const ny = Math.floor((height - modH) / currentSpaceY) + 1;
        if (ny > 0) {
          const arrH = (ny - 1) * currentSpaceY + modH;
          const startY = (height - arrH) / 2 + modH / 2;

          let arrW = 0;
          let nxEven = 0;
          let nxOdd = 0;
          if (effectiveLayoutType === 'grid') {
            nxEven = Math.floor((width - placementModW) / currentSpaceX) + 1;
            nxOdd = nxEven;
            if (nxEven > 0) arrW = (nxEven - 1) * currentSpaceX + placementModW;
          } else {
            nxEven = Math.floor((width - placementModW) / currentSpaceX) + 1;
            nxOdd = Math.floor((width - placementModW - currentSpaceX / 2) / currentSpaceX) + 1;
            const wEven = nxEven > 0 ? (nxEven - 1) * currentSpaceX + placementModW : 0;
            const wOdd = nxOdd > 0 ? currentSpaceX / 2 + (nxOdd - 1) * currentSpaceX + placementModW : 0;
            arrW = Math.max(wEven, wOdd);
          }

          if (arrW > 0) {
            const baseStartX = (width - arrW) / 2 + placementModW / 2;
            for (let j = 0; j < ny; j++) {
              const isOddRow = j % 2 !== 0;
              const nx = (effectiveLayoutType === 'staggered' && isOddRow) ? nxOdd : nxEven;
              const offsetX = (effectiveLayoutType === 'staggered' && isOddRow) ? currentSpaceX / 2 : 0;

              for (let i = 0; i < nx; i++) {
                const cxm = baseStartX + offsetX + i * currentSpaceX;
                const cym = startY + j * currentSpaceY;
                const corners = [
                  { x: cxm - placementModW / 2, y: cym - modH / 2 },
                  { x: cxm + placementModW / 2, y: cym - modH / 2 },
                  { x: cxm + placementModW / 2, y: cym + modH / 2 },
                  { x: cxm - placementModW / 2, y: cym + modH / 2 },
                ];
                const inside = corners.every((pt) => testCtx.isPointInPath(path, pt.x, pt.y, 'evenodd'));
                if (inside) {
                  if (forceDualModuleLayout) {
                    const leftX = cxm - placementModW / 2;
                    modules.push({ x: leftX, y: cym - modH / 2, w: modW, h: modH });
                    modules.push({ x: leftX + modW, y: cym - modH / 2, w: modW, h: modH });
                  } else {
                    modules.push({ x: cxm - modW / 2, y: cym - modH / 2, w: modW, h: modH });
                  }
                }
              }
            }
          }
        }
      }
    }

    let minDxLocal = Infinity;
    let modXLocal: { x: number; y: number; w: number; h: number } | null = null;
    let minDyLocal = Infinity;
    let modYLocal: { x: number; y: number; w: number; h: number } | null = null;

    if (showCenterLines && modules.length > 0) {
      modules.forEach((mod) => {
        const centerX = mod.x + mod.w / 2;
        const centerY = mod.y + mod.h / 2;

        const dx = centerX - width / 2;
        if (dx > 0.1) {
          if (dx < minDxLocal - 0.1) {
            minDxLocal = dx;
            modXLocal = mod;
          } else if (Math.abs(dx - minDxLocal) <= 0.1 && modXLocal) {
            const prevDy = Math.abs((modXLocal.y + modXLocal.h / 2) - height / 2);
            const nextDy = Math.abs(centerY - height / 2);
            if (nextDy < prevDy) modXLocal = mod;
          }
        }

        const dy = centerY - height / 2;
        if (dy > 0.1) {
          if (dy < minDyLocal - 0.1) {
            minDyLocal = dy;
            modYLocal = mod;
          } else if (Math.abs(dy - minDyLocal) <= 0.1 && modYLocal) {
            const prevDx = Math.abs((modYLocal.x + modYLocal.w / 2) - width / 2);
            const nextDx = Math.abs(centerX - width / 2);
            if (nextDx < prevDx) modYLocal = mod;
          }
        }
      });
    }

    const localMaxDim = Math.max(width, height);
    const localStroke = Math.max(1, localMaxDim * 0.002);
    const localOffset = Math.max(40, localMaxDim * 0.08);
    const localTick = Math.max(5, localMaxDim * 0.01);
    const localArrow = Math.max(6, localMaxDim * 0.012);
    const localFont = Math.max(12, localMaxDim * 0.018);
    const localPadding = Math.max(width, height) * 0.15;
    const localLabelFont = Math.max(14, localFont);
    const localLabelGap = localLabelFont * 1.6;
    const localBottomPadding = localPadding + localLabelGap * 3;
    const viewBox = `${-localPadding} ${-localPadding} ${width + localPadding * 2} ${height + localPadding + localBottomPadding}`;

    const moduleColor = getModuleColorsByLightTemp(lamp.t || lampLight);
    const moduleRects = modules.map((mod) => `
      <g transform="translate(${mod.x}, ${mod.y})">
        <rect width="${mod.w}" height="${mod.h}" fill="${moduleColor.fill}" stroke="${moduleColor.stroke}" stroke-width="${localStroke}" />
        <circle cx="${mod.w / 2}" cy="${mod.h / 2}" r="${localStroke * 1.5}" fill="${moduleColor.dot}" />
      </g>
    `).join('');

    const dimensionMarkup = `
      <g style="font-size: ${localFont}px" class="font-mono fill-neutral-600" stroke="none">
        <line x1="0" y1="${-localOffset}" x2="${width}" y2="${-localOffset}" stroke="#525252" stroke-width="${localStroke}" />
        <line x1="0" y1="${-localOffset - localTick}" x2="0" y2="${-localTick}" stroke="#525252" stroke-width="${localStroke}" />
        <line x1="${width}" y1="${-localOffset - localTick}" x2="${width}" y2="${-localTick}" stroke="#525252" stroke-width="${localStroke}" />
        <path d="M ${localArrow} ${-localOffset - localArrow / 2} L 0 ${-localOffset} L ${localArrow} ${-localOffset + localArrow / 2}" fill="none" stroke="#525252" stroke-width="${localStroke}" />
        <path d="M ${width - localArrow} ${-localOffset - localArrow / 2} L ${width} ${-localOffset} L ${width - localArrow} ${-localOffset + localArrow / 2}" fill="none" stroke="#525252" stroke-width="${localStroke}" />
        <text x="${width / 2}" y="${-localOffset - localFont * 0.5}" text-anchor="middle" fill="#525252">${width.toFixed(0)}</text>

        <line x1="${-localOffset}" y1="0" x2="${-localOffset}" y2="${height}" stroke="#525252" stroke-width="${localStroke}" />
        <line x1="${-localOffset - localTick}" y1="0" x2="${-localTick}" y2="0" stroke="#525252" stroke-width="${localStroke}" />
        <line x1="${-localOffset - localTick}" y1="${height}" x2="${-localTick}" y2="${height}" stroke="#525252" stroke-width="${localStroke}" />
        <path d="M ${-localOffset - localArrow / 2} ${localArrow} L ${-localOffset} 0 L ${-localOffset + localArrow / 2} ${localArrow}" fill="none" stroke="#525252" stroke-width="${localStroke}" />
        <path d="M ${-localOffset - localArrow / 2} ${height - localArrow} L ${-localOffset} ${height} L ${-localOffset + localArrow / 2} ${height - localArrow}" fill="none" stroke="#525252" stroke-width="${localStroke}" />
        <text x="${-localOffset - localFont * 0.5}" y="${height / 2}" text-anchor="middle" fill="#525252" transform="rotate(-90, ${-localOffset - localFont * 0.5}, ${height / 2})">${height.toFixed(0)}</text>
      </g>
    `;

    const centerLineMarkup = showCenterLines ? `
      <g stroke="#a3a3a3" stroke-width="${localStroke}" opacity="0.8">
        <path d="M ${width / 2 - localTick * 1.5} ${height / 2} L ${width / 2 + localTick * 1.5} ${height / 2} M ${width / 2} ${height / 2 - localTick * 1.5} L ${width / 2} ${height / 2 + localTick * 1.5}" />
        <line x1="${width / 2}" y1="${-localOffset / 2}" x2="${width / 2}" y2="${height / 2 - localTick * 3}" stroke-dasharray="${localTick * 5}, ${localTick}, ${localTick}, ${localTick}" />
        <line x1="${width / 2}" y1="${height / 2 + localTick * 3}" x2="${width / 2}" y2="${height + localOffset / 2}" stroke-dasharray="${localTick * 5}, ${localTick}, ${localTick}, ${localTick}" />
        <line x1="${-localOffset / 2}" y1="${height / 2}" x2="${width / 2 - localTick * 3}" y2="${height / 2}" stroke-dasharray="${localTick * 5}, ${localTick}, ${localTick}, ${localTick}" />
        <line x1="${width / 2 + localTick * 3}" y1="${height / 2}" x2="${width + localOffset / 2}" y2="${height / 2}" stroke-dasharray="${localTick * 5}, ${localTick}, ${localTick}, ${localTick}" />
      </g>
    ` : '';

    const centerOffsetXMarkup = showCenterLines && modXLocal && minDxLocal > 0.1 ? `
      <g stroke="#525252" fill="none" stroke-width="${localStroke}" style="font-size: ${localFont * 0.8}px" class="font-mono">
        <line x1="${width / 2}" y1="${-localTick}" x2="${width / 2}" y2="${-localOffset / 2 - localTick}" />
        <line x1="${modXLocal.x + modXLocal.w / 2}" y1="${-localTick}" x2="${modXLocal.x + modXLocal.w / 2}" y2="${-localOffset / 2 - localTick}" />
        <line x1="${width / 2}" y1="${-localOffset / 2}" x2="${modXLocal.x + modXLocal.w / 2}" y2="${-localOffset / 2}" />
        <path d="M ${width / 2 + localArrow} ${-localOffset / 2 - localArrow / 2} L ${width / 2} ${-localOffset / 2} L ${width / 2 + localArrow} ${-localOffset / 2 + localArrow / 2}" />
        <path d="M ${modXLocal.x + modXLocal.w / 2 - localArrow} ${-localOffset / 2 - localArrow / 2} L ${modXLocal.x + modXLocal.w / 2} ${-localOffset / 2} L ${modXLocal.x + modXLocal.w / 2 - localArrow} ${-localOffset / 2 + localArrow / 2}" />
        <text x="${(width / 2 + modXLocal.x + modXLocal.w / 2) / 2}" y="${-localOffset / 2 - localFont * 0.3}" fill="#525252" stroke="none" text-anchor="middle">${Math.round(minDxLocal * 10) / 10}</text>
      </g>
    ` : '';

    const centerOffsetYMarkup = showCenterLines && modYLocal && minDyLocal > 0.1 ? `
      <g stroke="#525252" fill="none" stroke-width="${localStroke}" style="font-size: ${localFont * 0.8}px" class="font-mono">
        <line x1="${-localTick}" y1="${height / 2}" x2="${-localOffset / 2 - localTick}" y2="${height / 2}" />
        <line x1="${-localTick}" y1="${modYLocal.y + modYLocal.h / 2}" x2="${-localOffset / 2 - localTick}" y2="${modYLocal.y + modYLocal.h / 2}" />
        <line x1="${-localOffset / 2}" y1="${height / 2}" x2="${-localOffset / 2}" y2="${modYLocal.y + modYLocal.h / 2}" />
        <path d="M ${-localOffset / 2 - localArrow / 2} ${height / 2 + localArrow} L ${-localOffset / 2} ${height / 2} L ${-localOffset / 2 + localArrow / 2} ${height / 2 + localArrow}" />
        <path d="M ${-localOffset / 2 - localArrow / 2} ${modYLocal.y + modYLocal.h / 2 - localArrow} L ${-localOffset / 2} ${modYLocal.y + modYLocal.h / 2} L ${-localOffset / 2 + localArrow / 2} ${modYLocal.y + modYLocal.h / 2 - localArrow}" />
        <text x="${-localOffset / 2 - localFont * 0.3}" y="${(height / 2 + modYLocal.y + modYLocal.h / 2) / 2}" fill="#525252" stroke="none" text-anchor="middle" transform="rotate(-90, ${-localOffset / 2 - localFont * 0.3}, ${(height / 2 + modYLocal.y + modYLocal.h / 2) / 2})">${Math.round(minDyLocal * 10) / 10}</text>
      </g>
    ` : '';

    const labelMarkup = `
      <text x="0" y="${height + localPadding + localLabelFont}" font-size="${localLabelFont}" fill="#141414" font-family="sans-serif">${lamp.shapeName || `Lamp ${index + 1}`}</text>
      <text x="0" y="${height + localPadding + localLabelFont + localLabelGap}" font-size="${localLabelFont}" fill="#141414" font-family="sans-serif">${moduleName} : ${modules.length} pcs.</text>
      <text x="0" y="${height + localPadding + localLabelFont + localLabelGap * 2}" font-size="${localLabelFont}" fill="#141414" font-family="sans-serif">Spacing : ${currentSpaceX}x${currentSpaceY} mm.</text>
      <text x="${width}" y="${height + localPadding + localLabelFont + localLabelGap * 2}" text-anchor="end" style="font-size: ${localFont * 0.8}px" class="font-sans fill-neutral-500 italic">* All dimensions are in mm</text>
    `;

    const areaSqm = (width * height) / 1000000;
    const qty = toValidQty(lamp.q);
    const svgContent = `${dimensionMarkup}<path d="${shapePath}" fill="white" stroke="#525252" stroke-width="${localStroke * 2}" />${centerLineMarkup}${centerOffsetXMarkup}${centerOffsetYMarkup}${moduleRects}${labelMarkup}`;

    return {
      id: lamp.id,
      svgContent,
      viewBox,
      bbW: width,
      bbH: height,
      moduleCount: Math.max(1, modules.length || lamp.modulesPerLamp || 1),
      name: `${lamp.shapeName || `Lamp ${index + 1}`} (${lamp.objectShape})`,
      q: qty,
      h: lamp.h,
      d: lamp.d,
      f: lamp.f,
      t: lamp.t,
      exactAreaSqm: areaSqm,
    };
  };

  const formTemplatePages = useMemo(() => formLamps.map((lamp, index) => buildFormTemplatePage(lamp, index)), [formLamps, modW, modH, spaceX, spaceY, layoutType, showCenterLines, lampLight, moduleName]);
  const moduleColors = useMemo(() => getModuleColorsByLightTemp(lampLight), [lampLight]);
  const plannerDraftPage = useMemo<PageData | null>(() => {
    if (appView !== 'planner' || !plannerLampId) return null;
    const moduleRects = result.modules.map((mod) => `
      <g transform="translate(${mod.x}, ${mod.y})">
        <rect width="${mod.w}" height="${mod.h}" fill="${moduleColors.fill}" stroke="${moduleColors.stroke}" stroke-width="${dynamicStrokeWidth}" />
        <circle cx="${mod.w / 2}" cy="${mod.h / 2}" r="${dynamicStrokeWidth * 1.5}" fill="${moduleColors.dot}" />
      </g>
    `).join('');

    const shapeMarkup = shape === 'custom' && customPath
      ? `<path d="${result.shapePath}" transform="scale(${result.bbW / 100}, ${result.bbH / 100})" fill="white" stroke="#525252" stroke-width="${dynamicStrokeWidth * 2}" vector-effect="non-scaling-stroke" />`
      : shape === 'text' && textPath
        ? `<path d="${result.shapePath}" fill="white" stroke="#525252" stroke-width="${dynamicStrokeWidth * 2}" />`
        : `<path d="${result.shapePath}" fill="white" stroke="#525252" stroke-width="${dynamicStrokeWidth * 2}" />`;

    const dimensionMarkup = `
      <g style="font-size: ${dynamicFontSize}px" class="font-mono fill-neutral-600" stroke="none">
        <line x1="0" y1="${-offset}" x2="${result.bbW}" y2="${-offset}" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <line x1="0" y1="${-offset - tickSize}" x2="0" y2="${-tickSize}" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <line x1="${result.bbW}" y1="${-offset - tickSize}" x2="${result.bbW}" y2="${-tickSize}" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <path d="M ${arrowSize} ${-offset - arrowSize / 2} L 0 ${-offset} L ${arrowSize} ${-offset + arrowSize / 2}" fill="none" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <path d="M ${result.bbW - arrowSize} ${-offset - arrowSize / 2} L ${result.bbW} ${-offset} L ${result.bbW - arrowSize} ${-offset + arrowSize / 2}" fill="none" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <text x="${result.bbW / 2}" y="${-offset - dynamicFontSize * 0.5}" text-anchor="middle" fill="#525252">${result.bbW.toFixed(0)}</text>

        <line x1="${-offset}" y1="0" x2="${-offset}" y2="${result.bbH}" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <line x1="${-offset - tickSize}" y1="0" x2="${-tickSize}" y2="0" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <line x1="${-offset - tickSize}" y1="${result.bbH}" x2="${-tickSize}" y2="${result.bbH}" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <path d="M ${-offset - arrowSize / 2} ${arrowSize} L ${-offset} 0 L ${-offset + arrowSize / 2} ${arrowSize}" fill="none" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <path d="M ${-offset - arrowSize / 2} ${result.bbH - arrowSize} L ${-offset} ${result.bbH} L ${-offset + arrowSize / 2} ${result.bbH - arrowSize}" fill="none" stroke="#525252" stroke-width="${dynamicStrokeWidth}" />
        <text x="${-offset - dynamicFontSize * 0.5}" y="${result.bbH / 2}" text-anchor="middle" fill="#525252" transform="rotate(-90, ${-offset - dynamicFontSize * 0.5}, ${result.bbH / 2})">${result.bbH.toFixed(0)}</text>
      </g>
    `;

    const centerLineMarkup = showCenterLines ? `
      <g stroke="#a3a3a3" stroke-width="${dynamicStrokeWidth}" opacity="0.8">
        <path d="M ${result.bbW / 2 - tickSize * 1.5} ${result.bbH / 2} L ${result.bbW / 2 + tickSize * 1.5} ${result.bbH / 2} M ${result.bbW / 2} ${result.bbH / 2 - tickSize * 1.5} L ${result.bbW / 2} ${result.bbH / 2 + tickSize * 1.5}" />
        <line x1="${result.bbW / 2}" y1="${-offset / 2}" x2="${result.bbW / 2}" y2="${result.bbH / 2 - tickSize * 3}" stroke-dasharray="${tickSize * 5}, ${tickSize}, ${tickSize}, ${tickSize}" />
        <line x1="${result.bbW / 2}" y1="${result.bbH / 2 + tickSize * 3}" x2="${result.bbW / 2}" y2="${result.bbH + offset / 2}" stroke-dasharray="${tickSize * 5}, ${tickSize}, ${tickSize}, ${tickSize}" />
        <line x1="${-offset / 2}" y1="${result.bbH / 2}" x2="${result.bbW / 2 - tickSize * 3}" y2="${result.bbH / 2}" stroke-dasharray="${tickSize * 5}, ${tickSize}, ${tickSize}, ${tickSize}" />
        <line x1="${result.bbW / 2 + tickSize * 3}" y1="${result.bbH / 2}" x2="${result.bbW + offset / 2}" y2="${result.bbH / 2}" stroke-dasharray="${tickSize * 5}, ${tickSize}, ${tickSize}, ${tickSize}" />
      </g>
    ` : '';

    const centerOffsetXMarkup = showCenterLines && modX && minDx > 0.1 ? `
      <g stroke="#525252" fill="none" stroke-width="${dynamicStrokeWidth}" style="font-size: ${dynamicFontSize * 0.8}px" class="font-mono">
        <line x1="${result.bbW / 2}" y1="${-tickSize}" x2="${result.bbW / 2}" y2="${-offset / 2 - tickSize}" />
        <line x1="${modX.x + modX.w / 2}" y1="${-tickSize}" x2="${modX.x + modX.w / 2}" y2="${-offset / 2 - tickSize}" />
        <line x1="${result.bbW / 2}" y1="${-offset / 2}" x2="${modX.x + modX.w / 2}" y2="${-offset / 2}" />
        <path d="M ${result.bbW / 2 + arrowSize} ${-offset / 2 - arrowSize / 2} L ${result.bbW / 2} ${-offset / 2} L ${result.bbW / 2 + arrowSize} ${-offset / 2 + arrowSize / 2}" />
        <path d="M ${modX.x + modX.w / 2 - arrowSize} ${-offset / 2 - arrowSize / 2} L ${modX.x + modX.w / 2} ${-offset / 2} L ${modX.x + modX.w / 2 - arrowSize} ${-offset / 2 + arrowSize / 2}" />
        <text x="${(result.bbW / 2 + modX.x + modX.w / 2) / 2}" y="${-offset / 2 - dynamicFontSize * 0.3}" fill="#525252" stroke="none" text-anchor="middle">${Math.round(minDx * 10) / 10}</text>
      </g>
    ` : '';

    const centerOffsetYMarkup = showCenterLines && modY && minDy > 0.1 ? `
      <g stroke="#525252" fill="none" stroke-width="${dynamicStrokeWidth}" style="font-size: ${dynamicFontSize * 0.8}px" class="font-mono">
        <line x1="${-tickSize}" y1="${result.bbH / 2}" x2="${-offset / 2 - tickSize}" y2="${result.bbH / 2}" />
        <line x1="${-tickSize}" y1="${modY.y + modY.h / 2}" x2="${-offset / 2 - tickSize}" y2="${modY.y + modY.h / 2}" />
        <line x1="${-offset / 2}" y1="${result.bbH / 2}" x2="${-offset / 2}" y2="${modY.y + modY.h / 2}" />
        <path d="M ${-offset / 2 - arrowSize / 2} ${result.bbH / 2 + arrowSize} L ${-offset / 2} ${result.bbH / 2} L ${-offset / 2 + arrowSize / 2} ${result.bbH / 2 + arrowSize}" />
        <path d="M ${-offset / 2 - arrowSize / 2} ${modY.y + modY.h / 2 - arrowSize} L ${-offset / 2} ${modY.y + modY.h / 2} L ${-offset / 2 + arrowSize / 2} ${modY.y + modY.h / 2 - arrowSize}" />
        <text x="${-offset / 2 - dynamicFontSize * 0.3}" y="${(result.bbH / 2 + modY.y + modY.h / 2) / 2}" fill="#525252" stroke="none" text-anchor="middle" transform="rotate(-90, ${-offset / 2 - dynamicFontSize * 0.3}, ${(result.bbH / 2 + modY.y + modY.h / 2) / 2})">${Math.round(minDy * 10) / 10}</text>
      </g>
    ` : '';

    const labelMarkup = `
      <text x="0" y="${result.bbH + padding + labelFontSize}" font-size="${labelFontSize}" fill="#141414" font-family="sans-serif">${objectName}</text>
      <text x="0" y="${result.bbH + padding + labelFontSize + labelLineHeight}" font-size="${labelFontSize}" fill="#141414" font-family="sans-serif">${moduleName} : ${result.modules.length} pcs.</text>
      <text x="0" y="${result.bbH + padding + labelFontSize + labelLineHeight * 2}" font-size="${labelFontSize}" fill="#141414" font-family="sans-serif">Spacing : ${spaceX}x${spaceY} mm.</text>
      <text x="${result.bbW}" y="${result.bbH + padding + labelFontSize + labelLineHeight * 2}" text-anchor="end" style="font-size: ${dynamicFontSize * 0.8}px" class="font-sans fill-neutral-500 italic">* All dimensions are in mm</text>
    `;

    return {
      id: plannerLampId,
      svgContent: `${dimensionMarkup}${shapeMarkup}${centerLineMarkup}${centerOffsetXMarkup}${centerOffsetYMarkup}${moduleRects}${labelMarkup}`,
      viewBox: exportViewBox,
      bbW: result.bbW,
      bbH: result.bbH,
      moduleCount: result.modules.length,
      name: `${objectName} (${shape})`,
      q: lampQ,
      h: lampH,
      d: lampD,
      f: lampF,
      t: lampLight,
      exactAreaSqm: calculateExactAreaSqm(),
    };
  }, [
    appView,
    plannerLampId,
    result.modules,
    result.shapePath,
    result.bbW,
    result.bbH,
    shape,
    customPath,
    textPath,
    dynamicStrokeWidth,
    dynamicFontSize,
    offset,
    tickSize,
    arrowSize,
    showCenterLines,
    modX,
    modY,
    minDx,
    minDy,
    padding,
    labelFontSize,
    labelLineHeight,
    moduleName,
    spaceX,
    spaceY,
    exportViewBox,
    objectName,
    lampQ,
    lampH,
    lampD,
    lampF,
    lampLight,
    moduleColors,
    calculateExactAreaSqm,
  ]);

  const effectiveTemplatePages = useMemo(() => {
    const formIds = new Set(formTemplatePages.map(page => page.id));
    const merged = formTemplatePages.map((page) => {
      const customPage = pages.find((p) => p.id === page.id);
      if (!customPage) return page;
      // Keep planner-generated drawing, but always use latest form data for pricing and summary fields.
      return {
        ...customPage,
        bbW: page.bbW,
        bbH: page.bbH,
        moduleCount: page.moduleCount,
        name: page.name,
        q: page.q,
        h: page.h,
        d: page.d,
        f: page.f,
        t: page.t,
        exactAreaSqm: page.exactAreaSqm,
      };
    });
    const withPlannerDraft = merged.map(page => {
      if (!plannerDraftPage || page.id !== plannerDraftPage.id) return page;
      return plannerDraftPage;
    });
    const extras = pages.filter(page => !formIds.has(page.id));
    return [...withPlannerDraft, ...extras];
  }, [pages, formTemplatePages, plannerDraftPage]);

  React.useEffect(() => {
    if (!plannerDraftPage) return;
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === plannerDraftPage.id);
      if (idx < 0) return [...prev, plannerDraftPage];
      const current = prev[idx];
      const unchanged =
        current.svgContent === plannerDraftPage.svgContent &&
        current.viewBox === plannerDraftPage.viewBox &&
        current.bbW === plannerDraftPage.bbW &&
        current.bbH === plannerDraftPage.bbH &&
        current.moduleCount === plannerDraftPage.moduleCount &&
        current.name === plannerDraftPage.name &&
        current.q === plannerDraftPage.q &&
        current.h === plannerDraftPage.h &&
        current.d === plannerDraftPage.d &&
        current.f === plannerDraftPage.f &&
        current.t === plannerDraftPage.t;
      if (unchanged) return prev;
      const clone = [...prev];
      clone[idx] = plannerDraftPage;
      return clone;
    });
  }, [plannerDraftPage]);

  const pricingSummary = useMemo(() => {
    const totalAreaSqm = effectiveTemplatePages.reduce((sum, p) => sum + (p.exactAreaSqm * p.q), 0);
    const totalModules = effectiveTemplatePages.reduce((sum, p) => sum + (Math.max(1, p.moduleCount) * p.q), 0);
    const moduleCost = totalModules * MODULE_PRICE_PER_UNIT;
    const fabricCost = totalAreaSqm * 2170;
    const structureCost = structure === 'ทำ' ? totalAreaSqm * 5000 : 0;
    const installationCost = totalAreaSqm * 1670;
    const requiresScaffold = effectiveTemplatePages.some((p) => parseHeightMeters(p.h) >= 3);
    const scaffoldCost = requiresScaffold ? 8000 : 0;
    const subtotalBeforeGP = fabricCost + structureCost + installationCost + moduleCost + scaffoldCost;
    const estimatedPrice = subtotalBeforeGP / 0.7;

    return {
      totalAreaSqm,
      totalModules,
      moduleCost,
      fabricCost,
      structureCost,
      installationCost,
      scaffoldCost,
      subtotalBeforeGP,
      estimatedPrice,
    };
  }, [effectiveTemplatePages, structure]);

  const pricingByType = useMemo(() => {
    const areaDenominator = pricingSummary.totalAreaSqm > 0 ? pricingSummary.totalAreaSqm : 1;

    return effectiveTemplatePages.map((p, idx) => {
      const totalModulesPerType = Math.max(1, p.moduleCount) * p.q;
      const totalAreaPerType = p.exactAreaSqm * p.q;
      const areaRatio = totalAreaPerType / areaDenominator;

      const fabricCostPerType = pricingSummary.fabricCost * areaRatio;
      const structureCostPerType = pricingSummary.structureCost * areaRatio;
      const installationCostPerType = pricingSummary.installationCost * areaRatio;
      const scaffoldCostPerType = pricingSummary.scaffoldCost * areaRatio;
      const moduleCostPerType = totalModulesPerType * MODULE_PRICE_PER_UNIT;
      const subtotalBeforeGPPerType = fabricCostPerType + structureCostPerType + installationCostPerType + scaffoldCostPerType + moduleCostPerType;
      const estimatedPricePerType = subtotalBeforeGPPerType / 0.7;

      return {
        id: p.id,
        index: idx + 1,
        name: p.name,
        q: p.q,
        totalAreaPerType,
        totalModulesPerType,
        fabricCostPerType,
        structureCostPerType,
        installationCostPerType,
        scaffoldCostPerType,
        moduleCostPerType,
        subtotalBeforeGPPerType,
        estimatedPricePerType,
      };
    });
  }, [effectiveTemplatePages, pricingSummary]);

  const pricingExportRows = useMemo(() => {
    const pageById = new Map<string, PageData>(effectiveTemplatePages.map((p) => [p.id, p]));
    return pricingByType.map((item) => {
      const page = pageById.get(item.id);
      const widthM = (page?.bbW || 0) / 1000;
      const heightM = (page?.bbH || 0) / 1000;
      const areaPerLamp = page?.exactAreaSqm || 0;
      const modulesPerLamp = Math.max(1, page?.moduleCount || 1);
      const ledWattPerLamp = roundUpToInteger(modulesPerLamp * LED_MODULE_WATT);
      const ledWattPerType = roundUpToInteger(item.totalModulesPerType * LED_MODULE_WATT);
      const switchingPerLamp = Math.max(1, Math.ceil(ledWattPerLamp / SWITCHING_POWER_WATT));
      const switchingPerType = Math.max(1, Math.ceil(ledWattPerType / SWITCHING_POWER_WATT));
      const switchingPricePerType = switchingPerType * SWITCHING_PRICE_PER_UNIT;

      return {
        typeName: item.name,
        sizeMetersText: `${widthM.toFixed(2)} x ${heightM.toFixed(2)}`,
        areaPerLamp,
        qty: item.q,
        totalAreaPerType: item.totalAreaPerType,
        vinylCost: item.fabricCostPerType,
        structureCost: item.structureCostPerType,
        installationCost: item.installationCostPerType,
        scaffoldCost: item.scaffoldCostPerType,
        modulesPerLamp,
        totalModules: item.totalModulesPerType,
        modulePricePerType: item.moduleCostPerType,
        ledWattPerLamp,
        ledWattPerType,
        switchingPerLamp,
        switchingPerType,
        switchingPricePerType,
        summaryPricePerType: item.estimatedPricePerType,
      };
    });
  }, [effectiveTemplatePages, pricingByType]);

  const csvEscape = (value: string | number) => {
    const str = String(value ?? '');
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const buildPricingCsvText = useCallback(() => {
    const generatedAt = new Date().toLocaleString('th-TH');
    const totals = pricingExportRows.reduce(
      (acc, row) => ({
        qty: acc.qty + row.qty,
        totalAreaPerType: acc.totalAreaPerType + row.totalAreaPerType,
        vinylCost: acc.vinylCost + row.vinylCost,
        structureCost: acc.structureCost + row.structureCost,
        installationCost: acc.installationCost + row.installationCost,
        scaffoldCost: acc.scaffoldCost + row.scaffoldCost,
        totalModules: acc.totalModules + row.totalModules,
        modulePricePerType: acc.modulePricePerType + row.modulePricePerType,
        ledWattPerType: acc.ledWattPerType + row.ledWattPerType,
        switchingPerType: acc.switchingPerType + row.switchingPerType,
        switchingPricePerType: acc.switchingPricePerType + row.switchingPricePerType,
        summaryPricePerType: acc.summaryPricePerType + row.summaryPricePerType,
      }),
      {
        qty: 0,
        totalAreaPerType: 0,
        vinylCost: 0,
        structureCost: 0,
        installationCost: 0,
        scaffoldCost: 0,
        totalModules: 0,
        modulePricePerType: 0,
        ledWattPerType: 0,
        switchingPerType: 0,
        switchingPricePerType: 0,
        summaryPricePerType: 0,
      }
    );

    const rows: Array<Array<string | number>> = [
      ['L&E Costing Sheet (Preliminary)'],
      ['Generated At', generatedAt],
      ['Project Name', docDetails.projectName || '-'],
      ['Project Number', docDetails.projectNumber || '-'],
      ['Location', docDetails.location || '-'],
      ['AO / Team', aoName || '-'],
      ['Structure', structure || '-'],
      [],
      [
        'Type',
        'ขนาด (ม. x ม.)',
        'พื้นที่ (ตร.ม.)',
        'จำนวนโคม (pcs.)',
        'พื้นที่รวม (ตร.ม.)',
        'Vinyl translucent cost',
        'Structure Cost (Wooden)',
        'Installation LED Cost',
        'Scaffold',
        'จำนวน module/โคม',
        'จำนวน module รวม',
        'ราคา module รวม/Type',
        'Wattage รวม/โคม',
        'Wattage รวม/Type',
        'จำนวน Switching/โคม',
        'จำนวน Switching/Type',
        'ราคา Switching รวม',
        'Price/Type',
      ],
    ];

    pricingExportRows.forEach((item) => {
      rows.push([
        item.typeName,
        item.sizeMetersText,
        item.areaPerLamp.toFixed(3),
        item.qty,
        item.totalAreaPerType.toFixed(3),
        item.vinylCost.toFixed(2),
        item.structureCost.toFixed(2),
        item.installationCost.toFixed(2),
        item.scaffoldCost.toFixed(2),
        item.modulesPerLamp,
        item.totalModules,
        item.modulePricePerType.toFixed(2),
        item.ledWattPerLamp.toFixed(0),
        item.ledWattPerType.toFixed(0),
        item.switchingPerLamp,
        item.switchingPerType,
        item.switchingPricePerType.toFixed(2),
        item.summaryPricePerType.toFixed(2),
      ]);
    });

    rows.push([]);
    rows.push([
      'Totally',
      '-',
      '-',
      totals.qty,
      totals.totalAreaPerType.toFixed(3),
      totals.vinylCost.toFixed(2),
      totals.structureCost.toFixed(2),
      totals.installationCost.toFixed(2),
      totals.scaffoldCost.toFixed(2),
      '-',
      totals.totalModules,
      totals.modulePricePerType.toFixed(2),
      '-',
      totals.ledWattPerType.toFixed(0),
      '-',
      totals.switchingPerType,
      totals.switchingPricePerType.toFixed(2),
      totals.summaryPricePerType.toFixed(2),
    ]);
    rows.push([]);
    rows.push(['Please note that:']);
    rows.push(['- เข้าทำงานปกติ 8.00 - 17.00 น. วันจันทร์ - ศุกร์']);
    rows.push(['- รับประกันสินค้า 2 ปี']);
    rows.push(['- ราคาอาจปรับตามหน้างานจริง']);
    rows.push([`- ค่า Switching คิดที่ ${SWITCHING_PRICE_PER_UNIT.toFixed(2)} บาท/ตัว (สามารถปรับได้)`]);

    return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  }, [
    docDetails.projectName,
    docDetails.projectNumber,
    docDetails.location,
    aoName,
    structure,
    pricingExportRows,
  ]);

  const downloadPricingPDF = async () => {
    if (effectiveTemplatePages.length === 0) {
      alert('ยังไม่มีรายการสำหรับสร้างตารางคำนวณ');
      return;
    }

    const totals = pricingExportRows.reduce(
      (acc, row) => ({
        qty: acc.qty + row.qty,
        totalAreaPerType: acc.totalAreaPerType + row.totalAreaPerType,
        vinylCost: acc.vinylCost + row.vinylCost,
        structureCost: acc.structureCost + row.structureCost,
        installationCost: acc.installationCost + row.installationCost,
        scaffoldCost: acc.scaffoldCost + row.scaffoldCost,
        totalModules: acc.totalModules + row.totalModules,
        modulePricePerType: acc.modulePricePerType + row.modulePricePerType,
        ledWattPerType: acc.ledWattPerType + row.ledWattPerType,
        switchingPerType: acc.switchingPerType + row.switchingPerType,
        switchingPricePerType: acc.switchingPricePerType + row.switchingPricePerType,
        summaryPricePerType: acc.summaryPricePerType + row.summaryPricePerType,
      }),
      {
        qty: 0,
        totalAreaPerType: 0,
        vinylCost: 0,
        structureCost: 0,
        installationCost: 0,
        scaffoldCost: 0,
        totalModules: 0,
        modulePricePerType: 0,
        ledWattPerType: 0,
        switchingPerType: 0,
        switchingPricePerType: 0,
        summaryPricePerType: 0,
      }
    );

    const headers = [
      'Type', 'ขนาด (ม. x ม.)', 'พื้นที่ (ตร.ม.)', 'จำนวนโคม (pcs.)', 'พื้นที่รวม (ตร.ม.)', 'Vinyl translucent cost', 'Structure Cost (Wooden)', 'Installation LED Cost', 'Scaffold',
      'จำนวน module/โคม', 'จำนวน module รวม', 'ราคา module รวม/Type', 'Wattage รวม/โคม', 'Wattage รวม/Type', 'จำนวน Switching/โคม', 'จำนวน Switching/Type', 'ราคา Switching รวม', 'Price/Type',
    ];

    const bodyRows = pricingExportRows.map((row) => [
      row.typeName,
      row.sizeMetersText,
      row.areaPerLamp.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      row.qty.toLocaleString('th-TH'),
      row.totalAreaPerType.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      row.vinylCost.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
      row.structureCost.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
      row.installationCost.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
      row.scaffoldCost.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
      row.modulesPerLamp.toLocaleString('th-TH'),
      row.totalModules.toLocaleString('th-TH'),
      row.modulePricePerType.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
      row.ledWattPerLamp.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
      row.ledWattPerType.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
      row.switchingPerLamp.toLocaleString('th-TH'),
      row.switchingPerType.toLocaleString('th-TH'),
      row.switchingPricePerType.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
      row.summaryPricePerType.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
    ]);

    bodyRows.push([
      'Totally', '-', '-', totals.qty.toLocaleString('th-TH'), totals.totalAreaPerType.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), totals.vinylCost.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
      totals.structureCost.toLocaleString('th-TH', { maximumFractionDigits: 0 }), totals.installationCost.toLocaleString('th-TH', { maximumFractionDigits: 0 }), totals.scaffoldCost.toLocaleString('th-TH', { maximumFractionDigits: 0 }), '-', totals.totalModules.toLocaleString('th-TH'),
      totals.modulePricePerType.toLocaleString('th-TH', { maximumFractionDigits: 0 }), '-', totals.ledWattPerType.toLocaleString('th-TH', { maximumFractionDigits: 0 }), '-', totals.switchingPerType.toLocaleString('th-TH'),
      totals.switchingPricePerType.toLocaleString('th-TH', { maximumFractionDigits: 0 }), totals.summaryPricePerType.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
    ]);

    const pagePxW = 4200;
    const pagePxH = 2970;
    const marginX = 36;
    const marginY = 24;
    const titleY = marginY + 26;
    const metaY = titleY + 34;
    const tableY = metaY + 34;
    const rowH = 62;
    const colWidths = [350, 350, 220, 170, 220, 210, 210, 190, 190, 180, 180, 210, 170, 170, 170, 170, 210, 250];
    const rowsPerPage = Math.max(1, Math.floor((pagePxH - tableY - 80) / rowH) - 1);

    const noteLines = [
      'Please note that :',
      '',
      '- เข้าทำงาน ปกติ 8.00 - 17.00 น. วันจันทร์ - ศุกร์',
      '- รับประกันสินค้า 2 ปี',
      '- ภายในระยะเวลารับประกัน มีการ Service บำรุงรักษา ทำความสะอาด และ ซ่อมแซมอุปกรณ์ 1 ครั้ง กรณีต่างจังหวัดจะมีค่าใช้จ่ายในการเดินทางเพิ่มเติม',
      '- ราคานี้ไม่รวมค่าเดินทาง ค่าที่พัก (กรณีหน้างานไม่ได้อยู่ในกทม.และปริมณฑล) ค่าทำงานในเวลากลางคืน และค่านั่งร้าน โดยหากหน้างานมีความสูง 3 เมตรขึ้นไป หน้างานจะต้องเตรียมนั่งร้านไว้รอทีม stretch ceiling',
      '- ราคา Summary price/type เป็นราคารวมจำนวนโคมทุกตัว ในแต่ละ type',
      '- ราคาอาจมีการเปลี่ยนแปลงหลังจากสำรวจหน้างานจริง',
    ];

    const meta = `Project: ${docDetails.projectName || '-'}   Location: ${docDetails.location || '-'}   Generated: ${new Date().toLocaleString('th-TH')}`;

    const wrapByChars = (text: string, maxChars: number): string[] => {
      const source = String(text || '').trim();
      if (!source) return [''];
      const words = source.split(/\s+/);
      const lines: string[] = [];
      let current = '';
      words.forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxChars) {
          current = next;
        } else {
          if (current) lines.push(current);
          if (word.length > maxChars) {
            let rest = word;
            while (rest.length > maxChars) {
              lines.push(rest.slice(0, maxChars));
              rest = rest.slice(maxChars);
            }
            current = rest;
          } else {
            current = word;
          }
        }
      });
      if (current) lines.push(current);
      return lines;
    };

    const noteWrappedLines = noteLines.flatMap((line, idx) => {
      if (!line.trim()) return [''];
      if (idx === 0) return [line];
      return wrapByChars(line, 115);
    });

    const renderTablePageSvg = (
      rowsChunk: Array<Array<string | number>>,
      pageNo: number,
      totalPages: number,
      options?: { compact?: boolean; includeNotes?: boolean }
    ): string => {
      const compact = options?.compact ?? false;
      const includeNotes = options?.includeNotes ?? false;
      const titleFont = compact ? 22 : 26;
      const textFont = compact ? 16 : 20;
      const headFont = compact ? 14 : 18;
      const rowHeight = compact ? 48 : rowH;
      const textBaseline = compact ? 31 : 38;

      const lines: string[] = [];
      const push = (line: string) => lines.push(line);

      push(`<svg width="${pagePxW}" height="${pagePxH}" viewBox="0 0 ${pagePxW} ${pagePxH}" xmlns="http://www.w3.org/2000/svg">`);
      push('<rect width="100%" height="100%" fill="white"/>');
      push(`<style>.th{font:700 ${titleFont}px \"Noto Sans Thai\",\"Tahoma\",sans-serif;fill:#111}.td{font:400 ${textFont}px \"Noto Sans Thai\",\"Tahoma\",sans-serif;fill:#111}.head{font:700 ${headFont}px \"Noto Sans Thai\",\"Tahoma\",sans-serif;fill:#111}</style>`);

      push(`<text x="${marginX}" y="${titleY}" class="th">${escapeSvgText('L&E Costing Sheet (Preliminary)')}</text>`);
      push(`<text x="${marginX}" y="${metaY}" class="td">${escapeSvgText(meta)}</text>`);
      push(`<text x="${pagePxW - marginX}" y="${metaY}" text-anchor="end" class="td">${escapeSvgText(`Page ${pageNo}/${totalPages}`)}</text>`);
      push(`<g opacity="0.12" transform="rotate(-24 ${pagePxW * 0.22} ${pagePxH * 0.30})"><text x="${pagePxW * 0.22}" y="${pagePxH * 0.30}" text-anchor="middle" class="th" style="font-size:${compact ? 92 : 112}px">${escapeSvgText(BOQ_WATERMARK_TEXT)}</text></g>`);
      push(`<g opacity="0.12" transform="rotate(-24 ${pagePxW / 2} ${pagePxH / 2})"><text x="${pagePxW / 2}" y="${pagePxH / 2}" text-anchor="middle" class="th" style="font-size:${compact ? 100 : 124}px">${escapeSvgText(BOQ_WATERMARK_TEXT)}</text></g>`);
      push(`<g opacity="0.12" transform="rotate(-24 ${pagePxW * 0.78} ${pagePxH * 0.70})"><text x="${pagePxW * 0.78}" y="${pagePxH * 0.70}" text-anchor="middle" class="th" style="font-size:${compact ? 92 : 112}px">${escapeSvgText(BOQ_WATERMARK_TEXT)}</text></g>`);

      let y = tableY;
      let x = marginX;
      headers.forEach((header, idx) => {
        const w = colWidths[idx];
        push(`<rect x="${x}" y="${y}" width="${w}" height="${rowHeight}" fill="#e5edf6" stroke="#9ca3af"/>`);
        push(`<text x="${x + 8}" y="${y + textBaseline}" class="head">${escapeSvgText(String(header))}</text>`);
        x += w;
      });

      rowsChunk.forEach((row, rowIdx) => {
        const rowY = tableY + rowHeight * (rowIdx + 1);
        let rowX = marginX;
        row.forEach((cell, colIdx) => {
          const w = colWidths[colIdx];
          const value = String(cell);
          const isNumeric = /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/.test(value);
          push(`<rect x="${rowX}" y="${rowY}" width="${w}" height="${rowHeight}" fill="white" stroke="#c4c4c4"/>`);
          if (isNumeric) {
            push(`<text x="${rowX + w - 8}" y="${rowY + textBaseline}" text-anchor="end" class="td">${escapeSvgText(value)}</text>`);
          } else {
            push(`<text x="${rowX + 8}" y="${rowY + textBaseline}" class="td">${escapeSvgText(value)}</text>`);
          }
          rowX += w;
        });
      });

      if (includeNotes) {
        const noteStartY = tableY + rowHeight * (rowsChunk.length + 1) + 34;
        const noteStep = compact ? 38 : 52;
        noteWrappedLines.forEach((line, idx) => {
          if (!line.trim()) return;
          const yPos = noteStartY + idx * noteStep;
          const cls = idx === 0 ? 'th' : 'td';
          push(`<text x="${marginX}" y="${yPos}" class="${cls}">${escapeSvgText(line)}</text>`);
        });
      }

      push('</svg>');
      return lines.join('');
    };

    const renderNotePageSvg = (pageNo: number, totalPages: number): string => {
      const lines: string[] = [];
      const push = (line: string) => lines.push(line);
      const noteStartY = 320;
      const lineStep = 72;

      push(`<svg width="${pagePxW}" height="${pagePxH}" viewBox="0 0 ${pagePxW} ${pagePxH}" xmlns="http://www.w3.org/2000/svg">`);
      push('<rect width="100%" height="100%" fill="white"/>');
      push('<style>.th{font:700 32px \"Noto Sans Thai\",\"Tahoma\",sans-serif;fill:#111}.td{font:400 28px \"Noto Sans Thai\",\"Tahoma\",sans-serif;fill:#111}</style>');
      push(`<text x="${marginX}" y="${titleY}" class="th">${escapeSvgText('L&E Costing Sheet (Preliminary)')}</text>`);
      push(`<text x="${marginX}" y="${metaY}" class="td">${escapeSvgText(meta)}</text>`);
      push(`<text x="${pagePxW - marginX}" y="${metaY}" text-anchor="end" class="td">${escapeSvgText(`Page ${pageNo}/${totalPages}`)}</text>`);
      push(`<g opacity="0.12" transform="rotate(-24 ${pagePxW * 0.22} ${pagePxH * 0.30})"><text x="${pagePxW * 0.22}" y="${pagePxH * 0.30}" text-anchor="middle" class="th" style="font-size:112px">${escapeSvgText(BOQ_WATERMARK_TEXT)}</text></g>`);
      push(`<g opacity="0.12" transform="rotate(-24 ${pagePxW / 2} ${pagePxH / 2})"><text x="${pagePxW / 2}" y="${pagePxH / 2}" text-anchor="middle" class="th" style="font-size:124px">${escapeSvgText(BOQ_WATERMARK_TEXT)}</text></g>`);
      push(`<g opacity="0.12" transform="rotate(-24 ${pagePxW * 0.78} ${pagePxH * 0.70})"><text x="${pagePxW * 0.78}" y="${pagePxH * 0.70}" text-anchor="middle" class="th" style="font-size:112px">${escapeSvgText(BOQ_WATERMARK_TEXT)}</text></g>`);

      noteWrappedLines.forEach((line, idx) => {
        const y = noteStartY + idx * lineStep;
        if (line.trim() === '') return;
        const cls = idx === 0 ? 'th' : 'td';
        push(`<text x="${marginX}" y="${y}" class="${cls}">${escapeSvgText(line)}</text>`);
      });

      push('</svg>');
      return lines.join('');
    };

    const compactRowH = 48;
    const compactNoteStep = 38;
    const singlePageRequiredHeight = tableY + compactRowH * (bodyRows.length + 1) + 34 + noteWrappedLines.length * compactNoteStep + 40;
    const canFitSinglePage = singlePageRequiredHeight <= pagePxH;

    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

      if (canFitSinglePage) {
        const onePage = await svgToPng(
          renderTablePageSvg(bodyRows, 1, 1, { compact: true, includeNotes: true }),
          TEMPLATE_DOWNLOAD_WIDTH,
          TEMPLATE_DOWNLOAD_HEIGHT
        );
        pdf.addImage(onePage, 'PNG', 0, 0, 420, 297);
      } else {
        const rowChunks: Array<Array<Array<string | number>>> = [];
        for (let i = 0; i < bodyRows.length; i += rowsPerPage) {
          rowChunks.push(bodyRows.slice(i, i + rowsPerPage));
        }
        const totalPages = rowChunks.length + 1;

        const tableImages = await Promise.all(
          rowChunks.map((chunk, idx) => svgToPng(renderTablePageSvg(chunk, idx + 1, totalPages), TEMPLATE_DOWNLOAD_WIDTH, TEMPLATE_DOWNLOAD_HEIGHT))
        );
        const noteImage = await svgToPng(renderNotePageSvg(totalPages, totalPages), TEMPLATE_DOWNLOAD_WIDTH, TEMPLATE_DOWNLOAD_HEIGHT);

        if (tableImages.length > 0) {
          pdf.addImage(tableImages[0], 'PNG', 0, 0, 420, 297);
          for (let i = 1; i < tableImages.length; i++) {
            pdf.addPage('a3', 'landscape');
            pdf.addImage(tableImages[i], 'PNG', 0, 0, 420, 297);
          }
          pdf.addPage('a3', 'landscape');
        }
        pdf.addImage(noteImage, 'PNG', 0, 0, 420, 297);
      }

      pdf.save(`${docDetails.projectName || 'pricing'}_Pricing_Report.pdf`);
    } catch (error) {
      console.error('Failed to export pricing PDF:', error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`ไม่สามารถสร้างไฟล์ PDF ได้: ${message}`);
    }
  };

  const renderTemplatePdf = async (targetPages: PageData[], exportWidth: number, exportHeight: number) => {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3'
    });

    const coverSvgString = generateCoverPageSVG(docDetails);
    const pageSvgStrings = targetPages.map((page, idx) =>
      generateDrawingPageSVG(docDetails, page, idx + 1, targetPages.length)
    );

    const images = await Promise.all([
      svgToPng(coverSvgString, exportWidth, exportHeight),
      ...pageSvgStrings.map((svg) => svgToPng(svg, exportWidth, exportHeight)),
    ]);

    pdf.addImage(images[0], 'PNG', 0, 0, 420, 297);
    for (let i = 1; i < images.length; i++) {
      pdf.addPage('a3', 'landscape');
      pdf.addImage(images[i], 'PNG', 0, 0, 420, 297);
    }

    return pdf;
  };

  const generateTemplatePDF = async () => {
    if (effectiveTemplatePages.length === 0) {
      alert("Please add at least one page to the template.");
      return;
    }
    
    setIsGeneratingPDF(true);
    try {
      const pdf = await renderTemplatePdf(effectiveTemplatePages, TEMPLATE_DOWNLOAD_WIDTH, TEMPLATE_DOWNLOAD_HEIGHT);
      
      pdf.save(`${docDetails.projectName || 'template'}.pdf`);
      setShowTemplateSettings(false);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`Failed to generate PDF. ${message}`);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const sendToBOQ = async () => {
    if (effectiveTemplatePages.length === 0) {
      alert("Please add at least one page to the template.");
      return;
    }
    setIsSendingBOQ(true);
    setSubmitProgressText('กำลังสร้าง Drawing PDF สำหรับส่งไปยังระบบ...');
    try {
      const pdf = await renderTemplatePdf(effectiveTemplatePages, TEMPLATE_API_WIDTH, TEMPLATE_API_HEIGHT);
      const pdfDataUri = pdf.output('datauristring');
      const pdfBase64 = pdfDataUri.includes(',') ? pdfDataUri.split(',')[1] : pdfDataUri;
      const approxPdfSizeMB = (pdfBase64.length * 0.75) / (1024 * 1024);

      if (approxPdfSizeMB > 8) {
        alert(`⚠️ ไฟล์ PDF มีขนาดประมาณ ${approxPdfSizeMB.toFixed(1)} MB ซึ่งอาจเกินข้อจำกัดของ Google Apps Script และส่งไม่สำเร็จ (413)`);
      }

      // เตรียมข้อมูลยิง API
      const payload = {
        aoName: aoName,
        projectName: docDetails.projectName,
        location: docDetails.location,
        structure: structure,
        templateFile: { mimeType: "application/pdf", data: pdfBase64, name: "Drawing.pdf" },
        pricingSummary: {
          totalAreaSqm: pricingSummary.totalAreaSqm,
          totalModules: pricingSummary.totalModules,
          moduleCost: pricingSummary.moduleCost,
          fabricCost: pricingSummary.fabricCost,
          structureCost: pricingSummary.structureCost,
          installationCost: pricingSummary.installationCost,
          scaffoldCost: pricingSummary.scaffoldCost,
          subtotalBeforeGP: pricingSummary.subtotalBeforeGP,
          estimatedPrice: pricingSummary.estimatedPrice,
        },
        lamps: effectiveTemplatePages.map((p) => ({
          shapeName: p.name,
          moduleCount: p.moduleCount,
          w: (p.bbW / 1000).toFixed(2),
          l: (p.bbH / 1000).toFixed(2),
          q: p.q, h: p.h, d: p.d, f: p.f, t: p.t,
          exactArea: p.exactAreaSqm,
          file: null
        }))
      };

      const apiUrl = "https://script.google.com/macros/s/AKfycbxr80dI_Ge3vg7SrD95vsrUOGWNldUgmyB_UQXSvQKup3_nketsRO_pTdQVanevHPeo_g/exec";

      try {
        setSubmitProgressText('กำลังอัปโหลดข้อมูลและไฟล์ไปยัง Google Sheet / GAS...');
        // ยิงแบบปกติก่อน (อ่านผลตอบกลับได้)
        const response = await fetch(apiUrl, {
          method: "POST",
          body: JSON.stringify(payload)
        });

        const rawResponse = await response.text();
        let apiResult: { status?: string; message?: string } = {};

        if (rawResponse) {
          try {
            apiResult = JSON.parse(rawResponse);
          } catch {
            apiResult = {
              status: "Error",
              message: `Non-JSON response: ${rawResponse.slice(0, 240)}`,
            };
          }
        }

        if (!response.ok) {
          const httpDebug = `HTTP ${response.status} ${response.statusText || ""}`.trim();
          throw new Error(apiResult.message || httpDebug);
        }

        if (apiResult.status === "Success") {
          alert("✅ ประเมินราคาสำเร็จ! ระบบส่งข้อมูลและ PDF เข้า LINE เรียบร้อย");
          setShowTemplateSettings(false);
        } else {
          alert("❌ เกิดข้อผิดพลาด: " + (apiResult.message || "Unknown server response"));
        }
      } catch (normalFetchError) {
        // หากโดน CORS ฝั่ง browser ให้ลองส่งแบบ no-cors เพื่อให้ request ไปถึงปลายทาง
        await fetch(apiUrl, {
          method: "POST",
          mode: "no-cors",
          body: JSON.stringify(payload)
        });
        alert("✅ ระบบส่งคำขอแล้ว (โหมด no-cors) แต่เบราว์เซอร์อ่านผลตอบกลับไม่ได้\nโปรดตรวจผลที่ Google Sheet/LINE เพื่อยืนยัน");
        setShowTemplateSettings(false);
      }
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNetworkOrCors = /Failed to fetch|NetworkError|Load failed|CORS|413|Content Too Large/i.test(errorMessage);
      if (isNetworkOrCors) {
        alert("❌ เชื่อมต่อ API ไม่สำเร็จ (อาจติด CORS/สิทธิ์ Web App)\nรายละเอียด: " + errorMessage);
      } else {
        alert("❌ เกิดข้อผิดพลาด: " + errorMessage);
      }
    } finally {
      setIsSendingBOQ(false);
      setSubmitProgressText('');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const updateFormLamp = (id: string, patch: Partial<FormLampItem>) => {
    setFormLamps(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updateLampShapeName = (id: string, value: string) => {
    const normalized = normalizeShapeName(value);
    const isDuplicate = normalized.length > 0 && formLamps.some((lamp) => lamp.id !== id && normalizeShapeName(lamp.shapeName) === normalized);
    if (isDuplicate) return;
    updateFormLamp(id, { shapeName: value });
  };

  const calculateModulesPerLamp = useCallback((lamp: FormLampItem): number => {
    const width = Math.max(1, lamp.w || 0);
    const height = Math.max(1, lamp.l || 0);
    const innerDia = Math.max(1, Math.min(lamp.innerDia || 1, width - 1));
    const depthSpacing = getSpacingByDepth(lamp.d || '');
    const currentSpaceX = depthSpacing?.x ?? spaceX;
    const currentSpaceY = depthSpacing?.y ?? spaceY;

    if (modW <= 0 || modH <= 0 || currentSpaceX <= 0 || currentSpaceY <= 0) return 1;

    const forceDualModuleLayout = shouldForceDualModuleLayout(lamp.t || '');
    const effectiveLayoutType: LayoutType = forceDualModuleLayout ? 'grid' : layoutType;
    const placementModW = forceDualModuleLayout ? modW * 2 : modW;

    const shapePathByType: Record<ShapeType, string> = {
      rectangle: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
      circle: `M ${width / 2} ${height / 2} m -${Math.min(width, height) / 2}, 0 a ${Math.min(width, height) / 2},${Math.min(width, height) / 2} 0 1,0 ${Math.min(width, height)},0 a ${Math.min(width, height) / 2},${Math.min(width, height) / 2} 0 1,0 -${Math.min(width, height)},0`,
      triangle: `M ${width / 2} 0 L ${width} ${height} L 0 ${height} Z`,
      donut: `M ${width / 2} ${width / 2} m -${width / 2}, 0 a ${width / 2},${width / 2} 0 1,0 ${width},0 a ${width / 2},${width / 2} 0 1,0 -${width},0 M ${width / 2} ${width / 2} m -${innerDia / 2}, 0 a ${innerDia / 2},${innerDia / 2} 0 1,1 ${innerDia},0 a ${innerDia / 2},${innerDia / 2} 0 1,1 -${innerDia},0`,
      ellipse: `M ${width / 2} ${height / 2} m -${width / 2}, 0 a ${width / 2},${height / 2} 0 1,0 ${width},0 a ${width / 2},${height / 2} 0 1,0 -${width},0`,
      semicircle: `M 0 ${height} A ${width / 2} ${height} 0 0 1 ${width} ${height} L 0 ${height} Z`,
      'u-shape': `M 0 0 L ${Math.max(20, width * 0.2)} 0 L ${Math.max(20, width * 0.2)} ${height - Math.max(20, width * 0.2)} L ${width - Math.max(20, width * 0.2)} ${height - Math.max(20, width * 0.2)} L ${width - Math.max(20, width * 0.2)} 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
      'c-shape': `M 0 0 L ${width} 0 L ${width} ${Math.max(20, Math.min(width, height) * 0.2)} L ${Math.max(20, Math.min(width, height) * 0.2)} ${Math.max(20, Math.min(width, height) * 0.2)} L ${Math.max(20, Math.min(width, height) * 0.2)} ${height - Math.max(20, Math.min(width, height) * 0.2)} L ${width} ${height - Math.max(20, Math.min(width, height) * 0.2)} L ${width} ${height} L 0 ${height} Z`,
      't-shape': `M 0 0 L ${width} 0 L ${width} ${Math.max(20, Math.min(width, height) * 0.2)} L ${width / 2 + Math.max(20, Math.min(width, height) * 0.2) / 2} ${Math.max(20, Math.min(width, height) * 0.2)} L ${width / 2 + Math.max(20, Math.min(width, height) * 0.2) / 2} ${height} L ${width / 2 - Math.max(20, Math.min(width, height) * 0.2) / 2} ${height} L ${width / 2 - Math.max(20, Math.min(width, height) * 0.2) / 2} ${Math.max(20, Math.min(width, height) * 0.2)} L 0 ${Math.max(20, Math.min(width, height) * 0.2)} Z`,
      'hollow-rect': `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z M ${Math.max(20, Math.min(width, height) * 0.2)} ${Math.max(20, Math.min(width, height) * 0.2)} L ${Math.max(20, Math.min(width, height) * 0.2)} ${height - Math.max(20, Math.min(width, height) * 0.2)} L ${width - Math.max(20, Math.min(width, height) * 0.2)} ${height - Math.max(20, Math.min(width, height) * 0.2)} L ${width - Math.max(20, Math.min(width, height) * 0.2)} ${Math.max(20, Math.min(width, height) * 0.2)} Z`,
      hexagon: `M ${width / 2} 0 L ${width} ${height / 4} L ${width} ${3 * height / 4} L ${width / 2} ${height} L 0 ${3 * height / 4} L 0 ${height / 4} Z`,
      octagon: `M ${width * 0.3} 0 L ${width * 0.7} 0 L ${width} ${height * 0.3} L ${width} ${height * 0.7} L ${width * 0.7} ${height} L ${width * 0.3} ${height} L 0 ${height * 0.7} L 0 ${height * 0.3} Z`,
      polygon: `M ${width / 2} 0 L ${width} ${height * 0.35} L ${width * 0.8} ${height} L ${width * 0.2} ${height} L 0 ${height * 0.35} Z`,
      text: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
      custom: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
    };

    const path = new Path2D(shapePathByType[lamp.objectShape] || shapePathByType.rectangle);
    const testCanvas = document.createElement('canvas');
    const testCtx = testCanvas.getContext('2d');
    if (!testCtx) return 1;

    const ny = Math.floor((height - modH) / currentSpaceY) + 1;
    if (ny <= 0) return 1;

    const arrH = (ny - 1) * currentSpaceY + modH;
    const startY = (height - arrH) / 2 + modH / 2;

    let arrW = 0;
    let nxEven = 0;
    let nxOdd = 0;
    if (effectiveLayoutType === 'grid') {
      nxEven = Math.floor((width - placementModW) / currentSpaceX) + 1;
      nxOdd = nxEven;
      if (nxEven > 0) arrW = (nxEven - 1) * currentSpaceX + placementModW;
    } else {
      nxEven = Math.floor((width - placementModW) / currentSpaceX) + 1;
      nxOdd = Math.floor((width - placementModW - currentSpaceX / 2) / currentSpaceX) + 1;
      const wEven = nxEven > 0 ? (nxEven - 1) * currentSpaceX + placementModW : 0;
      const wOdd = nxOdd > 0 ? currentSpaceX / 2 + (nxOdd - 1) * currentSpaceX + placementModW : 0;
      arrW = Math.max(wEven, wOdd);
    }

    if (arrW <= 0) return 1;
    const baseStartX = (width - arrW) / 2 + placementModW / 2;

    let count = 0;
    for (let j = 0; j < ny; j++) {
      const isOddRow = j % 2 !== 0;
      const nx = (effectiveLayoutType === 'staggered' && isOddRow) ? nxOdd : nxEven;
      const offsetX = (effectiveLayoutType === 'staggered' && isOddRow) ? currentSpaceX / 2 : 0;

      for (let i = 0; i < nx; i++) {
        const cx = baseStartX + offsetX + i * currentSpaceX;
        const cy = startY + j * currentSpaceY;
        const corners = [
          { x: cx - placementModW / 2, y: cy - modH / 2 },
          { x: cx + placementModW / 2, y: cy - modH / 2 },
          { x: cx + placementModW / 2, y: cy + modH / 2 },
          { x: cx - placementModW / 2, y: cy + modH / 2 },
        ];
        const inside = corners.every((pt) => testCtx.isPointInPath(path, pt.x, pt.y, 'evenodd'));
        if (inside) count += forceDualModuleLayout ? 2 : 1;
      }
    }

    return Math.max(1, count);
  }, [modW, modH, spaceX, spaceY, layoutType]);

  React.useEffect(() => {
    setFormLamps((prev) => {
      let changed = false;
      const next = prev.map((lamp) => {
        const modulesPerLamp = calculateModulesPerLamp(lamp);
        if (lamp.modulesPerLamp === modulesPerLamp) return lamp;
        changed = true;
        return { ...lamp, modulesPerLamp };
      });
      return changed ? next : prev;
    });
  }, [formLamps, calculateModulesPerLamp]);

  const addFormLamp = () => {
    setFormLamps((prev) => {
      const nextLamp: FormLampItem = {
        id: Math.random().toString(36).slice(2),
        objectShape: 'rectangle',
        shapeName: getNextShapeName(prev),
        w: Number.NaN,
        l: Number.NaN,
        innerDia: 500,
        modulesPerLamp: 1,
        q: Number.NaN,
        h: '',
        d: '10 เซนติเมตร',
        f: 'ผ้าใบขาว',
        t: '3000K',
        file: null,
      };
      setPlannerLampId(nextLamp.id);
      return [...prev, nextLamp];
    });
  };

  const removeFormLamp = (id: string) => {
    setFormLamps(prev => (prev.length > 1 ? prev.filter(item => item.id !== id) : prev));
    setPages(prev => prev.filter(page => page.id !== id));
  };

  const getLampMissingFields = (lamp: FormLampItem): string[] => {
    const missing: string[] = [];
    if (!lamp.shapeName.trim()) missing.push('Type');
    const normalizedShapeName = normalizeShapeName(lamp.shapeName);
    if (normalizedShapeName && formLamps.some((item) => item.id !== lamp.id && normalizeShapeName(item.shapeName) === normalizedShapeName)) {
      missing.push('Type ซ้ำ');
    }
    if (!lamp.objectShape) missing.push('Object Shape');
    if (!lamp.h.trim() || parseHeightMeters(lamp.h) <= 0) missing.push('ความสูงหน้างาน (ม.)');
    if (!Number.isFinite(lamp.w) || lamp.w <= 0) missing.push('กว้าง (มม.)');
    if (!Number.isFinite(lamp.l) || lamp.l <= 0) missing.push('ยาว (มม.)');
    if (lamp.objectShape === 'donut') {
      if (!Number.isFinite(lamp.innerDia) || lamp.innerDia <= 0 || lamp.innerDia >= lamp.w) {
        missing.push('Inner Dia. (มม.)');
      }
    }
    if (!Number.isFinite(lamp.q) || lamp.q <= 0) missing.push('จำนวน');
    if (!lamp.d.trim()) missing.push('ความลึกของโครง');
    if (!lamp.f.trim()) missing.push('ชนิดของผ้าใบ');
    if (!lamp.t.trim()) missing.push('อุณหภูมิแสง');
    return missing;
  };

  const submitChecklistForm = async () => {
    if (!aoName.trim() || !docDetails.projectName.trim() || !docDetails.location.trim() || !structure.trim()) {
      alert('กรุณากรอก AO/แผนก, ชื่อ Project, สถานที่หน้างาน และเลือกคำตอบงานโครงสร้างให้ครบ');
      return;
    }
    const invalidLampIndex = formLamps.findIndex(l => getLampMissingFields(l).length > 0);
    if (invalidLampIndex >= 0) {
      const missingFields = getLampMissingFields(formLamps[invalidLampIndex]).join(', ');
      alert(`กรุณากรอกข้อมูลรายการโคมที่ ${invalidLampIndex + 1} ให้ครบ: ${missingFields}`);
      return;
    }

    setIsSubmittingChecklist(true);
  setSubmitProgressText('กำลังสร้าง Drawing PDF สำหรับส่งข้อมูล...');
    try {
      let templatePdfBase64: string | null = null;
      let templateFilePayload: { mimeType: string; data: string; name: string } | null = null;
      let csvFilePayload: { mimeType: string; data: string; name: string } | null = null;
      if (effectiveTemplatePages.length > 0) {
        const templatePdf = await renderTemplatePdf(effectiveTemplatePages, TEMPLATE_API_WIDTH, TEMPLATE_API_HEIGHT);
        const templatePdfDataUri = templatePdf.output('datauristring');
        templatePdfBase64 = templatePdfDataUri.includes(',') ? templatePdfDataUri.split(',')[1] : templatePdfDataUri;
        if (templatePdfBase64) {
          templateFilePayload = {
            mimeType: 'application/pdf',
            data: templatePdfBase64,
            name: `${docDetails.projectName || 'template'}_Drawing.pdf`,
          };
        }
      }

      setSubmitProgressText('กำลังเตรียมตารางราคาและไฟล์ CSV...');
      const csvText = buildPricingCsvText();
      // Add UTF-8 BOM so Microsoft Excel detects Thai text encoding correctly.
      const csvTextWithBom = '\uFEFF' + csvText;
      const csvBytes = new TextEncoder().encode(csvTextWithBom);
      let csvBinary = '';
      csvBytes.forEach((b) => {
        csvBinary += String.fromCharCode(b);
      });
      csvFilePayload = {
        mimeType: 'text/csv;charset=utf-8',
        data: window.btoa(csvBinary),
        name: `${docDetails.projectName || 'pricing'}_Pricing_Report.csv`,
      };

      const pageById = new Map<string, PageData>(effectiveTemplatePages.map((p) => [p.id, p]));

      const lamps = await Promise.all(formLamps.map(async (lamp, index) => {
        const matchedPage = pageById.get(lamp.id);
        const moduleCount = matchedPage ? Math.max(1, matchedPage.moduleCount) : Math.max(1, lamp.modulesPerLamp || 1);
        const exactArea = matchedPage ? matchedPage.exactAreaSqm : (lamp.w * lamp.l) / 1000000;
        const widthMeters = matchedPage ? matchedPage.bbW / 1000 : lamp.w / 1000;
        const lengthMeters = matchedPage ? matchedPage.bbH / 1000 : lamp.l / 1000;

        let filePayload: { mimeType: string; data: string; name: string } | null = null;
        if (lamp.file) {
          if (lamp.file.size > 6 * 1024 * 1024) {
            throw new Error(`ไฟล์ของรายการที่ ${index + 1} ใหญ่เกิน 6MB`);
          }
          const dataUri = await fileToBase64(lamp.file);
          const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
          filePayload = {
            mimeType: lamp.file.type || 'application/octet-stream',
            data: base64Data,
            name: lamp.file.name || `lamp-${index + 1}.pdf`,
          };
        }

        return {
          shapeName: lamp.shapeName,
          objectShape: lamp.objectShape,
          moduleCount,
          w: widthMeters.toFixed(2),
          l: lengthMeters.toFixed(2),
          q: lamp.q,
          h: lamp.h,
          d: lamp.d,
          f: lamp.f,
          t: lamp.t,
          exactArea,
          file: filePayload,
        };
      }));

      const payload = {
        aoName,
        projectName: docDetails.projectName,
        location: docDetails.location,
        structure,
        templateFile: templateFilePayload,
        csvFile: csvFilePayload,
        pricingSummary: {
          totalAreaSqm: pricingSummary.totalAreaSqm,
          totalModules: pricingSummary.totalModules,
          moduleCost: pricingSummary.moduleCost,
          fabricCost: pricingSummary.fabricCost,
          structureCost: pricingSummary.structureCost,
          installationCost: pricingSummary.installationCost,
          scaffoldCost: pricingSummary.scaffoldCost,
          subtotalBeforeGP: pricingSummary.subtotalBeforeGP,
          estimatedPrice: pricingSummary.estimatedPrice,
        },
        lamps,
      };

      const apiUrl = 'https://script.google.com/macros/s/AKfycbxr80dI_Ge3vg7SrD95vsrUOGWNldUgmyB_UQXSvQKup3_nketsRO_pTdQVanevHPeo_g/exec';

      try {
        setSubmitProgressText('กำลังอัปโหลดข้อมูล รอประมาณ 10-20 วินาทีนะครับ');
        const response = await fetch(apiUrl, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const text = await response.text();
        let parsed: { status?: string; message?: string } = {};
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = { status: 'Error', message: `Non-JSON response: ${text.slice(0, 240)}` };
          }
        }

        if (!response.ok) {
          const httpDebug = `HTTP ${response.status} ${response.statusText || ''}`.trim();
          throw new Error(parsed.message || httpDebug);
        }

        if (parsed.status === 'Success') {
          setIsDataConfirmed(true);
          alert('✅ ส่งข้อมูลเรียบร้อย ระบบบันทึกและส่ง LINE สำเร็จ');
        } else {
          alert('❌ เกิดข้อผิดพลาด: ' + (parsed.message || 'Unknown server response'));
        }
      } catch {
        await fetch(apiUrl, {
          method: 'POST',
          mode: 'no-cors',
          body: JSON.stringify(payload),
        });
        setIsDataConfirmed(true);
        alert('✅ ระบบส่งคำขอแล้ว (โหมด no-cors) กรุณาตรวจผลใน Google Sheet/LINE');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      alert('❌ ส่งข้อมูลไม่สำเร็จ: ' + msg);
    } finally {
      setIsSubmittingChecklist(false);
      setSubmitProgressText('');
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
    img.crossOrigin = "anonymous";
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

  // Calculate polygon canvas viewBox based on zoom
  const polygonViewBoxWidth = 600 / polygonCanvasZoom;
  const polygonViewBoxHeight = 400 / polygonCanvasZoom;
  const isGlobalBusy = isSendingBOQ || isSubmittingChecklist || isGeneratingPDF;
  const globalBusyText = submitProgressText || (isSendingBOQ
    ? 'กำลังประมวลผลและส่งข้อมูลไป BOQ...'
    : isSubmittingChecklist
      ? 'กำลังยืนยันข้อมูลและอัปโหลด...'
      : 'กำลังสร้างไฟล์เอกสาร...');

  if (appView === 'form') {
    return (
      <div className="min-h-screen bg-neutral-100 p-4 md:p-8 text-neutral-900">
        <div className="mx-auto w-full max-w-4xl rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 p-6">
            <div className="flex items-center gap-3">
              <img src="/logo_LE.svg" alt="L&E" className="h-10 w-auto" />
              <div>
                <h1 className="text-2xl font-bold text-blue-700">Stretch Ceiling Check List</h1>
                <p className="text-sm text-neutral-500">ประเมินราคาและข้อมูลหน้างาน</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <p className="text-xs font-medium text-red-600">* จำเป็นต้องกรอก</p>
            <p className="text-xs text-neutral-600">หน่วยที่ใช้ในฟอร์ม: ความสูงหน้างาน = เมตร (ม.), กว้าง/ยาว = มิลลิเมตร (มม.)</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextInput label="ชื่อ AO/แผนก" required value={aoName} onChange={setAoName} placeholder="ตัวอย่าง: ปอ แผนก LED" helpText="กรอกชื่อผู้ประสานงานหรือชื่อทีมที่รับผิดชอบ" />
              <TextInput label="ชื่อ Project" required value={docDetails.projectName} onChange={(v) => setDocDetails({ ...docDetails, projectName: v })} placeholder="ตัวอย่าง: One Bangkok" />
              <TextInput label="สถานที่หน้างาน" required value={docDetails.location} onChange={(v) => setDocDetails({ ...docDetails, location: v })} placeholder="ตัวอย่าง: กรุงเทพมหานคร" />
              <TextInput label="Project Number" value={docDetails.projectNumber} onChange={(v) => setDocDetails({ ...docDetails, projectNumber: v })} placeholder="ตัวอย่าง: XXXX-XXX" />
              <TextInput label="ผู้ติดต่อ / Client" value={docDetails.client} onChange={(v) => setDocDetails({ ...docDetails, client: v })} />
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">ต้องการให้ทำโครงสร้างไหม?<span className="text-red-600"> *</span></label>
                <select value={structure} onChange={(e) => setStructure(e.target.value)} className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm">
                  <option value="">-- กรุณาเลือก --</option>
                  <option value="ทำ">ทำ</option>
                  <option value="ไม่ทำ">ไม่ทำ</option>
                </select>
              </div>
            </div>

            <div className="h-px bg-neutral-200" />

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 md:grid-cols-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">พื้นที่รวม (ตร.ม.)</p>
                <p className="text-lg font-bold text-emerald-900">{pricingSummary.totalAreaSqm.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Module รวม (ชิ้น)</p>
                <p className="text-lg font-bold text-emerald-900">{pricingSummary.totalModules}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">ต้นทุนก่อน GP (บาท)</p>
                <p className="text-lg font-bold text-emerald-900">{pricingSummary.subtotalBeforeGP.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">ราคาประเมิน /0.7 (บาท)</p>
                <p className="text-lg font-bold text-emerald-900">{pricingSummary.estimatedPrice.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</p>
              </div>
            </div>
            <p className="text-xs text-emerald-800">ราคาทุนค่านั่งร้านทีมช่าง : {pricingSummary.scaffoldCost > 0 ? `${pricingSummary.scaffoldCost.toLocaleString('th-TH')} บาท (ความสูงหน้างานมากกว่า 3 เมตร)` : '0 บาท'}</p>

            <div className="inline-flex rounded-lg border border-cyan-200 bg-white p-1">
              <button
                onClick={() => setPricingView('summary')}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${pricingView === 'summary' ? 'bg-cyan-600 !text-white' : 'text-cyan-700 hover:bg-cyan-50'}`}
              >
                มุมมองสรุป
              </button>
              <button
                onClick={() => setPricingView('type')}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${pricingView === 'type' ? 'bg-cyan-600 !text-white' : 'text-cyan-700 hover:bg-cyan-50'}`}
              >
                มุมมองแยก Type
              </button>
            </div>

            {pricingView === 'type' && pricingByType.length > 0 && (
              <details className="rounded-lg border border-cyan-200 bg-cyan-50" open>
                <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-cyan-800">ประเมินราคาแยกแต่ละ Type ({pricingByType.length})</summary>
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="min-w-full text-xs text-neutral-800">
                    <thead>
                      <tr className="border-b border-cyan-200 text-cyan-900">
                        <th className="py-2 pr-3 text-left">Type</th>
                        <th className="py-2 pr-3 text-right">จำนวน</th>
                        <th className="py-2 pr-3 text-right">พื้นที่รวม</th>
                        <th className="py-2 pr-3 text-right">Module รวม</th>
                        <th className="py-2 pr-3 text-right">ต้นทุนก่อน GP</th>
                        <th className="py-2 text-right">ราคาประเมิน /0.7</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingByType.map((item) => (
                        <tr key={item.id} className="border-b border-cyan-100 last:border-0">
                          <td className="py-2 pr-3">{item.index}. {item.name}</td>
                          <td className="py-2 pr-3 text-right">{item.q}</td>
                          <td className="py-2 pr-3 text-right">{item.totalAreaPerType.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ตร.ม.</td>
                          <td className="py-2 pr-3 text-right">{item.totalModulesPerType.toLocaleString('th-TH')}</td>
                          <td className="py-2 pr-3 text-right">{item.subtotalBeforeGPPerType.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
                          <td className="py-2 text-right font-semibold text-cyan-900">{item.estimatedPricePerType.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="space-y-4">
              {formLamps.map((lamp, index) => {
                const missingFields = getLampMissingFields(lamp);
                const isComplete = missingFields.length === 0;
                return (
                  <div key={lamp.id} className={`rounded-lg border p-4 ${isComplete ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/40'}`}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-neutral-700">โคมรายการที่ {index + 1}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isComplete ? 'กรอกครบ' : `ยังไม่ครบ ${missingFields.length} ช่อง`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {index > 0 && (
                          <button
                            onClick={() => {
                              const prevLamp = formLamps[index - 1];
                              if (!prevLamp) return;
                              updateFormLamp(lamp.id, {
                                objectShape: prevLamp.objectShape,
                                shapeName: getNextShapeName(formLamps),
                                w: prevLamp.w,
                                l: prevLamp.l,
                                innerDia: prevLamp.innerDia,
                                modulesPerLamp: prevLamp.modulesPerLamp,
                                q: prevLamp.q,
                                h: prevLamp.h,
                                d: prevLamp.d,
                                f: prevLamp.f,
                                t: prevLamp.t,
                                file: null,
                              });
                              setPlannerLampId(lamp.id);
                            }}
                            className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-200"
                          >
                            คัดลอกจากรายการก่อนหน้า
                          </button>
                        )}
                        {formLamps.length > 1 && (
                          <button onClick={() => removeFormLamp(lamp.id)} className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200">
                            ลบรายการนี้
                          </button>
                        )}
                      </div>
                    </div>
                    {!isComplete && (
                      <p className="mb-3 text-xs text-amber-700">ต้องกรอกเพิ่ม: {missingFields.join(', ')}</p>
                    )}
                    <p className="mb-3 text-xs text-neutral-600">หน่วยของรายการนี้: สูง = ม., กว้าง/ยาว = มม.</p>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <TextInput label="Type" required invalid={missingFields.includes('Type') || missingFields.includes('Type ซ้ำ')} value={lamp.shapeName} onChange={(v) => updateLampShapeName(lamp.id, v)} />
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Object Shape<span className="text-red-600"> *</span></label>
                        <select
                          value={lamp.objectShape}
                          onChange={(e) => updateFormLamp(lamp.id, { objectShape: e.target.value as ShapeType })}
                          className={`w-full rounded border bg-white px-2 py-1.5 text-sm ${missingFields.includes('Object Shape') ? 'border-red-400' : 'border-neutral-300'}`}
                        >
                          {SHAPE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <TextInput label="ความสูงหน้างาน (ม.)" required invalid={missingFields.includes('ความสูงหน้างาน (ม.)')} value={lamp.h} onChange={(v) => updateFormLamp(lamp.id, { h: v })} placeholder="ตัวอย่าง: 3" helpText="กรอกเฉพาะตัวเลข เช่น 3 (เมตร) ไม่ต้องใส่หน่วย" />
                      {(lamp.objectShape === 'circle' || lamp.objectShape === 'semicircle') ? (
                        <>
                          <Input
                            label="Diameter (มม.)"
                            required
                            invalid={missingFields.includes('กว้าง (มม.)') || missingFields.includes('ยาว (มม.)')}
                            value={lamp.w}
                            onChange={(v) => updateFormLamp(lamp.id, { w: v, l: v })}
                            allowBlank
                          />
                          <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">ทรงนี้ใช้ Diameter เดียว ระบบจะเท่ากับกว้างและยาวอัตโนมัติ</div>
                        </>
                      ) : lamp.objectShape === 'donut' ? (
                        <>
                          <Input
                            label="Outer Dia. (มม.)"
                            required
                            invalid={missingFields.includes('กว้าง (มม.)') || missingFields.includes('ยาว (มม.)')}
                            value={lamp.w}
                            onChange={(v) => {
                              const nextInner = Number.isFinite(v)
                                ? Math.min(lamp.innerDia, Math.max(1, v - 1))
                                : lamp.innerDia;
                              updateFormLamp(lamp.id, { w: v, l: v, innerDia: nextInner });
                            }}
                            allowBlank
                          />
                          <Input
                            label="Inner Dia. (มม.)"
                            required
                            invalid={missingFields.includes('Inner Dia. (มม.)')}
                            value={lamp.innerDia}
                            onChange={(v) => updateFormLamp(lamp.id, { innerDia: v })}
                          />
                        </>
                      ) : (
                        <>
                          <Input label="กว้าง (มม.)" required invalid={missingFields.includes('กว้าง (มม.)')} value={lamp.w} onChange={(v) => updateFormLamp(lamp.id, { w: v })} allowBlank placeholder="ตัวอย่าง: 1200" />
                          <Input label="ยาว (มม.)" required invalid={missingFields.includes('ยาว (มม.)')} value={lamp.l} onChange={(v) => updateFormLamp(lamp.id, { l: v })} allowBlank placeholder="ตัวอย่าง: 800" />
                        </>
                      )}
                      <Input label="จำนวน" required invalid={missingFields.includes('จำนวน')} value={lamp.q} onChange={(v) => updateFormLamp(lamp.id, { q: v })} allowBlank placeholder="ตัวอย่าง: 1" helpText="กรอกเฉพาะตัวเลข เช่น 1 ไม่ต้องใส่หน่วย" />
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">ความลึกของโครง<span className="text-red-600"> *</span></label>
                        <select value={lamp.d} onChange={(e) => updateFormLamp(lamp.id, { d: e.target.value })} className={`w-full rounded border bg-white px-2 py-1.5 text-sm ${missingFields.includes('ความลึกของโครง') ? 'border-red-400' : 'border-neutral-300'}`}>
                          <option value="10 เซนติเมตร">10 เซนติเมตร</option>
                          <option value="15 เซนติเมตร (Standard)">15 เซนติเมตร (Standard)</option>
                          <option value="20 เซนติเมตร">20 เซนติเมตร</option>
                          <option value="อื่นๆ">อื่นๆ</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">ชนิดของผ้าใบ<span className="text-red-600"> *</span></label>
                        <select value={lamp.f} onChange={(e) => updateFormLamp(lamp.id, { f: e.target.value })} className={`w-full rounded border bg-white px-2 py-1.5 text-sm ${missingFields.includes('ชนิดของผ้าใบ') ? 'border-red-400' : 'border-neutral-300'}`}>
                          <option value="ผ้าใบขาว">ผ้าใบขาว</option>
                          <option value="พิมพ์ลาย">พิมพ์ลาย</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">อุณหภูมิแสง<span className="text-red-600"> *</span></label>
                        <select value={lamp.t} onChange={(e) => updateFormLamp(lamp.id, { t: e.target.value })} className={`w-full rounded border bg-white px-2 py-1.5 text-sm ${missingFields.includes('อุณหภูมิแสง') ? 'border-red-400' : 'border-neutral-300'}`}>
                          <option value="3000K">3000K</option>
                          <option value="4000K">4000K</option>
                          <option value="5000K">5000K</option>
                          <option value="6500K">6500K</option>
                          <option value="Tunable White">Tunable White</option>
                          <option value="RGBW">RGBW</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">ไฟล์ CAD/ภาพ Perspective (ถ้ามี)</label>
                        <div className="flex items-center gap-3 rounded border border-neutral-300 bg-white p-2">
                          <label htmlFor={`lamp-file-${lamp.id}`} className="cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                            เลือกไฟล์
                          </label>
                          <span className="truncate text-sm text-neutral-600">{lamp.file ? lamp.file.name : 'ยังไม่ได้เลือกไฟล์'}</span>
                          <input
                            id={`lamp-file-${lamp.id}`}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf"
                            onChange={(e) => updateFormLamp(lamp.id, { file: e.target.files?.[0] || null })}
                            className="hidden"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button onClick={addFormLamp} className="w-full rounded border border-dashed border-sky-400 bg-sky-50 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100">
                + เพิ่มรายการโคม (Type ใหม่)
              </button>
            </div>

            <div className="flex flex-col gap-3 pt-2 md:flex-row md:justify-end">
              <button
                onClick={() => {
                  const targetLampId = plannerLampId || formLamps[0]?.id || null;
                  setPlannerLampId(targetLampId);
                  setAppView('planner');
                }}
                className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                เปิดเครื่องมือวาดขั้นสูง
              </button>
              <button
                onClick={generateTemplatePDF}
                disabled={!isDataConfirmed || effectiveTemplatePages.length === 0 || isGeneratingPDF}
                className="rounded border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
              >
                {isGeneratingPDF ? 'กำลังสร้าง PDF...' : `ดาวน์โหลด Template PDF (${effectiveTemplatePages.length})`}
              </button>
              <button
                onClick={downloadPricingPDF}
                disabled={!isDataConfirmed || effectiveTemplatePages.length === 0}
                className="rounded border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                ดาวน์โหลดตารางคำนวณ (PDF)
              </button>
              <button
                onClick={submitChecklistForm}
                disabled={isSubmittingChecklist}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-medium !text-white hover:bg-blue-800 disabled:opacity-60 disabled:!text-white"
              >
                {isSubmittingChecklist ? 'กำลังยืนยันข้อมูล...' : 'ยืนยันข้อมูล'}
              </button>
            </div>
          </div>
        </div>
        {isGlobalBusy && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <div className="rounded-xl bg-white px-6 py-5 shadow-xl flex items-center gap-3">
              <Loader2 size={22} className="animate-spin text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-neutral-900">กรุณารอสักครู่</p>
                <p className="text-xs text-neutral-600">{globalBusyText}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="planner-shell flex min-h-screen flex-col bg-neutral-100 font-sans text-neutral-900 lg:h-screen lg:flex-row">
      <div className="planner-sidebar z-10 flex w-full flex-col border-b border-neutral-200 bg-white shadow-sm lg:w-80 lg:border-b-0 lg:border-r">
        <div className="p-4 border-b border-neutral-200">
          <h1 className="text-lg font-semibold tracking-tight">Module Array Planner</h1>
          <p className="text-xs text-neutral-500 mt-1">Automate module distribution</p>
          <button onClick={() => setAppView('form')} className="mt-3 w-full rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300">
            &lt; กลับไปหน้าแบบฟอร์ม
          </button>
        </div>
        
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-sky-700">Editing Lamp/Page</label>
            <select
              value={plannerLampId || ''}
              onChange={(e) => setPlannerLampId(e.target.value)}
              className="w-full rounded border border-sky-300 bg-white px-2 py-1.5 text-sm"
            >
              {formLamps.map((lamp, idx) => (
                <option key={lamp.id} value={lamp.id}>
                  {idx + 1}. {lamp.shapeName || `Lamp ${idx + 1}`} - {lamp.objectShape}
                </option>
              ))}
            </select>
            <button
              onClick={addFormLamp}
              className="w-full rounded border border-dashed border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
            >
              + เพิ่มรายการโคมจากหน้า Planner
            </button>
          </div>

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
              <button onClick={() => { setShape('polygon'); setIsDrawingPolygon(true); }} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'polygon' ? 'border-green-500 bg-green-50 text-green-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <Pencil size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Draw</span>
              </button>
              <button onClick={() => setShape('text')} className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'text' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <Type size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Text</span>
              </button>
              <button onClick={() => setShape('custom')} className={`col-span-2 flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${shape === 'custom' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-neutral-200 hover:bg-neutral-50'}`}>
                <Sparkles size={20} className="mb-1" />
                <span className="text-[10px] font-medium">AI Custom</span>
              </button>
            </div>
          </div>

          {/* Polygon Drawing Panel - Enhanced */}
          {shape === 'polygon' && (
            <div className="space-y-3 p-3 bg-green-50 rounded-lg border border-green-100">
              <label className="text-xs font-semibold uppercase tracking-wider text-green-700">Custom Polygon Builder</label>
              
              {/* Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <button 
                  onClick={() => setSnapToGrid(!snapToGrid)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${snapToGrid ? 'bg-green-600 text-white' : 'bg-white text-green-700 border border-green-300'}`}
                  title="Snap to Grid"
                >
                  <Magnet size={14} /> Snap
                </button>
                <button 
                  onClick={() => setPolygonCanvasZoom(z => Math.min(z * 1.5, 4))}
                  className="p-1.5 bg-white rounded border border-green-300 text-green-700 hover:bg-green-100"
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <button 
                  onClick={() => setPolygonCanvasZoom(z => Math.max(z / 1.5, 0.5))}
                  className="p-1.5 bg-white rounded border border-green-300 text-green-700 hover:bg-green-100"
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <button 
                  onClick={() => setPolygonCanvasZoom(1)}
                  className="p-1.5 bg-white rounded border border-green-300 text-green-700 hover:bg-green-100"
                  title="Reset Zoom"
                >
                  <Maximize size={14} />
                </button>
                <span className="text-[10px] text-green-600 ml-auto">{Math.round(polygonCanvasZoom * 100)}%</span>
              </div>
              
              {/* Canvas */}
              <div className="relative w-full h-64 bg-white rounded-lg border-2 border-dashed border-green-300 overflow-hidden">
                <svg 
                  ref={polygonCanvasRef}
                  width="100%" 
                  height="100%" 
                  viewBox={`0 0 ${polygonViewBoxWidth} ${polygonViewBoxHeight}`}
                  className={`${isDrawingPolygon ? 'cursor-crosshair' : 'cursor-default'}`}
                  onClick={handlePolygonCanvasClick}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Grid background */}
                  <defs>
                    <pattern id="smallGrid" width={polygonGridSize} height={polygonGridSize} patternUnits="userSpaceOnUse">
                      <path d={`M ${polygonGridSize} 0 L 0 0 0 ${polygonGridSize}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                    </pattern>
                    <pattern id="largeGrid" width={polygonGridSize * 5} height={polygonGridSize * 5} patternUnits="userSpaceOnUse">
                      <rect width={polygonGridSize * 5} height={polygonGridSize * 5} fill="url(#smallGrid)"/>
                      <path d={`M ${polygonGridSize * 5} 0 L 0 0 0 ${polygonGridSize * 5}`} fill="none" stroke="#d1d5db" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#largeGrid)" />
                  
                  {/* Grid labels */}
                  {Array.from({ length: Math.ceil(polygonViewBoxWidth / (polygonGridSize * 5)) + 1 }).map((_, i) => (
                    <text key={`x-${i}`} x={i * polygonGridSize * 5 + 2} y={12} fontSize="8" fill="#9ca3af">
                      {i * 5 * polygonScale}
                    </text>
                  ))}
                  {Array.from({ length: Math.ceil(polygonViewBoxHeight / (polygonGridSize * 5)) + 1 }).map((_, i) => (
                    <text key={`y-${i}`} x={2} y={i * polygonGridSize * 5 + 12} fontSize="8" fill="#9ca3af">
                      {i * 5 * polygonScale}
                    </text>
                  ))}
                  
                  {/* Draw polygon preview */}
                  {polygonPoints.length > 0 && (
                    <>
                      <path 
                        d={polygonPoints.length >= 3 
                          ? `M ${polygonPoints[0].x * polygonGridSize / polygonScale} ${polygonPoints[0].y * polygonGridSize / polygonScale} ` + 
                            polygonPoints.slice(1).map(p => `L ${p.x * polygonGridSize / polygonScale} ${p.y * polygonGridSize / polygonScale}`).join(' ') + ' Z'
                          : `M ${polygonPoints[0].x * polygonGridSize / polygonScale} ${polygonPoints[0].y * polygonGridSize / polygonScale} ` + 
                            polygonPoints.slice(1).map(p => `L ${p.x * polygonGridSize / polygonScale} ${p.y * polygonGridSize / polygonScale}`).join(' ')
                        }
                        fill={polygonPoints.length >= 3 ? "rgba(34, 197, 94, 0.2)" : "none"}
                        stroke="#22c55e"
                        strokeWidth="2"
                      />
                      {polygonPoints.map((p, i) => (
                        <g key={i}>
                          <circle 
                            cx={p.x * polygonGridSize / polygonScale} 
                            cy={p.y * polygonGridSize / polygonScale} 
                            r="5" 
                            fill="#22c55e" 
                            stroke="white" 
                            strokeWidth="2" 
                          />
                          <text 
                            x={p.x * polygonGridSize / polygonScale + 8} 
                            y={p.y * polygonGridSize / polygonScale - 4} 
                            fontSize="10" 
                            fill="#166534"
                          >
                            {i + 1}
                          </text>
                        </g>
                      ))}
                    </>
                  )}
                  
                  {isDrawingPolygon && polygonPoints.length === 0 && (
                    <text x={polygonViewBoxWidth / 2} y={20} textAnchor="middle" fontSize="12" fill="#6b7280">
                      Click to add points, then click "Done"
                    </text>
                  )}
                </svg>
              </div>
              
              {/* Controls */}
              <div className="grid grid-cols-2 gap-2">
                <Input label="Grid Size (mm)" value={polygonScale} onChange={setPolygonScale} />
                <Input label="Grid Pixels" value={polygonGridSize} onChange={setPolygonGridSize} />
              </div>
              
              <div className="flex gap-2">
                {isDrawingPolygon ? (
                  <button 
                    onClick={handlePolygonComplete}
                    disabled={polygonPoints.length < 3}
                    className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    Done ({polygonPoints.length} points)
                  </button>
                ) : (
                  <button 
                    onClick={() => setIsDrawingPolygon(true)}
                    className="flex-1 py-2 bg-green-100 text-green-700 text-sm font-medium rounded hover:bg-green-200 flex items-center justify-center gap-2"
                  >
                    <Pencil size={16} /> Continue Drawing
                  </button>
                )}
                <button 
                  onClick={handlePolygonReset}
                  className="px-3 py-2 bg-neutral-100 text-neutral-700 text-sm font-medium rounded hover:bg-neutral-200 flex items-center justify-center gap-2"
                >
                  <RotateCcw size={16} />
                </button>
              </div>

              {polygonPoints.length >= 3 && (
                <p className="text-xs text-green-600 mt-1">
                  Size: {Math.round(polygonBounds.width)}mm x {Math.round(polygonBounds.height)}mm
                </p>
              )}
            </div>
          )}

          {/* Text Shape Panel - Fixed */}
          {shape === 'text' && (
            <div className="space-y-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
              <label className="text-xs font-semibold uppercase tracking-wider text-amber-700">Text Shape Builder</label>
              
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Enter Text</label>
                <input 
                  type="text" 
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="A-Z, 0-9..."
                  className="w-full px-2 py-1.5 text-lg border border-amber-300 rounded focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all font-mono bg-white"
                />
              </div>
              
              <Input label="Text Height (mm)" value={textHeightMM} onChange={setTextHeightMM} />
              
              {isLoadingText && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 size={20} className="animate-spin text-amber-600" />
                  <span className="ml-2 text-sm text-amber-600">Generating text path...</span>
                </div>
              )}
              
              {textPath && !isLoadingText && (
                <div className="relative w-full h-32 bg-white rounded-lg border border-amber-200 overflow-hidden flex items-center justify-center p-2">
                  <svg 
                    viewBox={`0 0 ${textBounds.width} ${textBounds.height}`} 
                    className="max-h-full max-w-full"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <path d={textPath} fill="#f59e0b" />
                  </svg>
                </div>
              )}
              
              {textBounds.width > 0 && (
                <p className="text-xs text-amber-600">
                  Actual Size: {Math.round(textBounds.width)}mm x {Math.round(textBounds.height)}mm
                </p>
              )}
            </div>
          )}

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

          <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <label className="text-xs font-semibold uppercase tracking-wider text-blue-800">BOQ Setup (สำหรับโคมทรงนี้)</label>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Quantity (จำนวน)" value={lampQ} onChange={setLampQ} />
              <TextInput label="Height (สูงหน้างาน ม.)" value={lampH} onChange={setLampH} />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Depth (ความลึก)</label>
                <select value={lampD} onChange={(e) => setLampD(e.target.value)} className="w-full px-2 py-1.5 text-sm border rounded bg-white">
                  <option value="10 เซนติเมตร">10 เซนติเมตร</option>
                  <option value="15 เซนติเมตร (Standard)">15 เซนติเมตร (Standard)</option>
                  <option value="20 เซนติเมตร">20 เซนติเมตร</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Fabric (ผ้าใบ)</label>
                  <select value={lampF} onChange={(e) => setLampF(e.target.value)} className="w-full px-2 py-1.5 text-sm border rounded bg-white">
                    <option value="ผ้าใบขาว">ผ้าใบขาว</option>
                    <option value="พิมพ์ลาย">พิมพ์ลาย</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Light Temp</label>
                  <select value={lampLight} onChange={(e) => setLampLight(e.target.value)} className="w-full px-2 py-1.5 text-sm border rounded bg-white">
                    <option value="3000K">3000K</option>
                    <option value="4000K">4000K</option>
                    <option value="5000K">5000K</option>
                    <option value="6500K">6500K</option>
                    <option value="Tunable White">Tunable White</option>
                    <option value="RGBW">RGBW</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

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
            {shape === 'polygon' && polygonPoints.length < 3 && (
              <p className="text-xs text-neutral-500 italic">Draw at least 3 points to create a polygon</p>
            )}
            {shape === 'text' && !textPath && (
              <p className="text-xs text-neutral-500 italic">Enter text above to generate shape</p>
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

      <div className="cad-bg relative flex min-h-[45vh] flex-1 flex-col overflow-hidden lg:min-h-0">
        <div className="absolute left-2 right-2 top-2 z-10 flex flex-wrap gap-2 rounded-lg border border-neutral-200 bg-white/95 p-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/75 lg:left-auto lg:right-4 lg:top-4 lg:w-auto">
          <button onClick={() => setZoom(z => z * 1.2)} className="p-2 hover:bg-neutral-100 rounded text-neutral-600" title="Zoom In"><ZoomIn size={18} /></button>
          <button onClick={() => setZoom(z => z / 1.2)} className="p-2 hover:bg-neutral-100 rounded text-neutral-600" title="Zoom Out"><ZoomOut size={18} /></button>
          <button onClick={() => setZoom(1)} className="p-2 hover:bg-neutral-100 rounded text-neutral-600" title="Reset Zoom"><Maximize size={18} /></button>
          <div className="w-px bg-neutral-200 mx-1 my-1"></div>
          <button onClick={addToTemplate} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-sm font-medium flex items-center gap-2">
            <FileText size={16} /> Add to Template
          </button>
          <button onClick={() => setShowTemplateSettings(true)} className="px-3 py-1.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded text-sm font-medium flex items-center gap-2">
            Template Settings {effectiveTemplatePages.length > 0 && <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{effectiveTemplatePages.length}</span>}
          </button>
          <div className="w-px bg-neutral-200 mx-1 my-1"></div>
          <button disabled={!isDataConfirmed} onClick={downloadSVG} className="p-2 hover:bg-neutral-100 rounded text-blue-600 disabled:opacity-50" title="Download SVG"><Download size={18} /></button>
          <button disabled={!isDataConfirmed} onClick={downloadPDF} className="p-2 hover:bg-neutral-100 rounded text-red-600 disabled:opacity-50" title="Download PDF"><FileText size={18} /></button>
        </div>
        
        <div className="flex flex-1 items-center justify-center overflow-hidden p-3 pt-20 sm:p-4 sm:pt-20 lg:p-8 lg:pt-8">
          {!result.error && (
            <svg ref={svgRef} width="100%" height="100%" viewBox={viewBox} className="drop-shadow-sm">
              <g style={{ fontSize: `${dynamicFontSize}px` }} className="font-mono fill-neutral-600" stroke="none">
                {/* Top Dimension */}
                <line x1="0" y1={-offset} x2={result.bbW} y2={-offset} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <line x1="0" y1={-offset - tickSize} x2="0" y2={-tickSize} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <line x1={result.bbW} y1={-offset - tickSize} x2={result.bbW} y2={-tickSize} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <path d={`M ${arrowSize} ${-offset - arrowSize/2} L 0 ${-offset} L ${arrowSize} ${-offset + arrowSize/2}`} fill="none" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <path d={`M ${result.bbW - arrowSize} ${-offset - arrowSize/2} L ${result.bbW} ${-offset} L ${result.bbW - arrowSize} ${-offset + arrowSize/2}`} fill="none" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <text x={result.bbW/2} y={-offset - dynamicFontSize * 0.5} textAnchor="middle" fill="#525252">{result.bbW.toFixed(0)}</text>
                
                {/* Left Dimension */}
                <line x1={-offset} y1="0" x2={-offset} y2={result.bbH} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <line x1={-offset - tickSize} y1="0" x2={-tickSize} y2="0" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <line x1={-offset - tickSize} y1={result.bbH} x2={-tickSize} y2={result.bbH} stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <path d={`M ${-offset - arrowSize/2} ${arrowSize} L ${-offset} 0 L ${-offset + arrowSize/2} ${arrowSize}`} fill="none" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <path d={`M ${-offset - arrowSize/2} ${result.bbH - arrowSize} L ${-offset} ${result.bbH} L ${-offset + arrowSize/2} ${result.bbH - arrowSize}`} fill="none" stroke="#525252" strokeWidth={dynamicStrokeWidth} />
                <text x={-offset - dynamicFontSize * 0.5} y={result.bbH/2} textAnchor="middle" fill="#525252" transform={`rotate(-90, ${-offset - dynamicFontSize * 0.5}, ${result.bbH/2})`}>{result.bbH.toFixed(0)}</text>
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
              ) : shape === 'text' && textPath ? (
                <path 
                  d={result.shapePath} 
                  fill="white" 
                  stroke="#525252" 
                  strokeWidth={dynamicStrokeWidth * 2} 
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
                  <rect width={mod.w} height={mod.h} fill={moduleColors.fill} stroke={moduleColors.stroke} strokeWidth={dynamicStrokeWidth} />
                  <circle cx={mod.w/2} cy={mod.h/2} r={dynamicStrokeWidth * 1.5} fill={moduleColors.dot} />
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
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Template Settings & Export</h3>
              <button onClick={() => setShowTemplateSettings(false)} className="text-neutral-500 hover:text-neutral-800"><X size={20} /></button>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
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
                <details className="mb-3 rounded-lg border border-green-200 bg-green-50" open>
                  <summary className="cursor-pointer list-none p-3 text-sm font-medium text-green-800">BOQ Submission Data</summary>
                  <div className="px-3 pb-3">
                    <div className="grid grid-cols-2 gap-4">
                      <TextInput label="AO / แผนก" value={aoName} onChange={setAoName} />
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-green-700 mb-1">ทำโครงสร้างส่วนกลางไหม?</label>
                        <select value={structure} onChange={(e) => setStructure(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-green-300 rounded bg-white">
                          <option value="">-- กรุณาเลือก --</option>
                          <option value="ทำ">ทำ</option>
                          <option value="ไม่ทำ">ไม่ทำ</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </details>

                <details className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50">
                  <summary className="cursor-pointer list-none p-3 text-sm font-medium text-emerald-800">Pricing Breakdown</summary>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-2 px-3 pb-3 text-sm md:grid-cols-2">
                    <div className="text-neutral-600">Total Area (sqm)</div>
                    <div className="text-right font-semibold text-neutral-900">{pricingSummary.totalAreaSqm.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>

                    <div className="text-neutral-600">Total Modules (pcs)</div>
                    <div className="text-right font-semibold text-neutral-900">{pricingSummary.totalModules.toLocaleString('th-TH')}</div>

                    <div className="text-neutral-600">Fabric Cost (THB)</div>
                    <div className="text-right font-semibold text-neutral-900">{pricingSummary.fabricCost.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</div>

                    <div className="text-neutral-600">Structure Cost (THB)</div>
                    <div className="text-right font-semibold text-neutral-900">{pricingSummary.structureCost.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</div>

                    <div className="text-neutral-600">Installation Cost (THB)</div>
                    <div className="text-right font-semibold text-neutral-900">{pricingSummary.installationCost.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</div>

                    <div className="text-neutral-600">Scaffolding Cost (THB)</div>
                    <div className="text-right font-semibold text-neutral-900">{pricingSummary.scaffoldCost.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</div>

                    <div className="text-neutral-600">Module Cost @ 24 THB (THB)</div>
                    <div className="text-right font-semibold text-neutral-900">{pricingSummary.moduleCost.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</div>

                    <div className="text-neutral-600">Subtotal Before GP (THB)</div>
                    <div className="text-right font-semibold text-neutral-900">{pricingSummary.subtotalBeforeGP.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</div>

                    <div className="text-emerald-800 font-semibold">Estimated Price = Subtotal / 0.7</div>
                    <div className="text-right text-emerald-800 font-bold">{pricingSummary.estimatedPrice.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</div>
                  </div>
                  {pricingView === 'type' && pricingByType.length > 0 && (
                    <div className="border-t border-emerald-200 px-3 pb-3 pt-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">By Type</p>
                      <div className="space-y-2">
                        {pricingByType.map((item) => (
                          <div key={`modal-${item.id}`} className="rounded border border-emerald-200 bg-white px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-neutral-800">{item.index}. {item.name}</span>
                              <span className="font-semibold text-emerald-800">{item.estimatedPricePerType.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท</span>
                            </div>
                            <div className="mt-1 text-neutral-600">จำนวน {item.q} | พื้นที่ {item.totalAreaPerType.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ตร.ม. | Module {item.totalModulesPerType.toLocaleString('th-TH')}</div>
                            <div className="text-neutral-600">ต้นทุนก่อน GP {item.subtotalBeforeGPPerType.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </details>

                <h4 className="text-sm font-medium text-neutral-700 mb-2">Pages in Template ({effectiveTemplatePages.length})</h4>
                {effectiveTemplatePages.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">No pages added yet. Click "Add to Template" in the preview panel.</p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {effectiveTemplatePages.map((p) => (
                      <div key={p.id} className="relative flex-shrink-0 w-24 h-24 bg-white border border-neutral-200 rounded flex items-center justify-center group">
                        <svg viewBox={p.viewBox} className="w-20 h-20" dangerouslySetInnerHTML={{__html: p.svgContent}}></svg>
                        <button
                          onClick={() => {
                            const isFromForm = formLamps.some(lamp => lamp.id === p.id);
                            if (isFromForm) {
                              removeFormLamp(p.id);
                            } else {
                              setPages(prev => prev.filter(page => page.id !== p.id));
                            }
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <X size={12} />
                        </button>
                        <div className="absolute bottom-1 left-0 right-0 text-center text-[8px] text-neutral-500 bg-white/80">{p.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => setShowTemplateSettings(false)} className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-200 rounded">Cancel</button>
                <button
                  onClick={downloadPricingPDF}
                  disabled={!isDataConfirmed || effectiveTemplatePages.length === 0}
                  className="px-4 py-2 text-sm font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded disabled:opacity-50"
                >
                  Download Calculation PDF
                </button>
                <button 
                  onClick={generateTemplatePDF} 
                  disabled={!isDataConfirmed || effectiveTemplatePages.length === 0 || isGeneratingPDF}
                  className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded disabled:opacity-50 flex items-center gap-2"
                >
                  {isGeneratingPDF ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  {isGeneratingPDF ? 'Generating...' : 'Generate Multi-page PDF'}
                </button>
                <button 
                  onClick={sendToBOQ} 
                  disabled={effectiveTemplatePages.length === 0 || isSendingBOQ}
                  className="px-4 py-2 text-sm font-medium bg-green-600 text-white hover:bg-green-700 rounded disabled:opacity-50 flex items-center gap-2"
                >
                  {isSendingBOQ ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {isSendingBOQ ? 'กำลังประมวลผลและส่ง...' : 'Send to BOQ & LINE'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isGlobalBusy && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="rounded-xl bg-white px-6 py-5 shadow-xl flex items-center gap-3">
            <Loader2 size={22} className="animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-neutral-900">กรุณารอสักครู่</p>
              <p className="text-xs text-neutral-600">{globalBusyText}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
