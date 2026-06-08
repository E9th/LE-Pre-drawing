export type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'donut' | 'ellipse' | 'semicircle' | 'u-shape' | 'c-shape' | 't-shape' | 'hollow-rect' | 'hexagon' | 'octagon' | 'custom' | 'polygon' | 'text';
export type LayoutType = 'grid' | 'staggered';
export type AppView = 'form' | 'planner';
export type LightControlType = '-' | 'On-Off' | 'Dimmable' | 'Tunable White';
export type AdvancedControlMode = 'dimmable' | 'tunable' | null;

export interface Point { x: number; y: number; }

export interface SavedShape {
  id: string;
  name: string;
  path: string;
  image?: string | null;
}

export interface FormLampItem {
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
  c: LightControlType;
  file: File | null;
}

export interface DocumentDetails {
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

export interface PageData {
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
  c: LightControlType;
  exactAreaSqm: number;
}

export interface LogoSvgData {
  viewBox: string;
  inner: string;
}

export const SHAPE_OPTIONS: Array<{ value: ShapeType; label: string }> = [
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

export const LIGHT_TEMP_OPTIONS = ['3000K', '4000K', '5000K', '6500K', 'RGBW'] as const;

export const LIGHT_CONTROL_OPTIONS: Array<{ value: LightControlType; label: string }> = [
  { value: '-', label: '-' },
  { value: 'On-Off', label: 'เปิด-ปิด(On-Off)' },
  { value: 'Dimmable', label: 'สามารถหรี่แสงได้ (Dimmable)' },
  { value: 'Tunable White', label: 'เปลี่ยนอุณหภูมิแสงได้ (Tunable White)' },
];

export const FABRIC_OPTIONS = [
  { value: 'ผ้าใบขาว', label: 'ผ้าใบขาว' },
  { value: 'พิมพ์ลาย', label: 'พิมพ์ลาย' },
];

export const DEPTH_OPTIONS = [
  { value: '5 เซนติเมตร', label: '5 เซนติเมตร' },
  { value: '10 เซนติเมตร', label: '10 เซนติเมตร' },
  { value: '15 เซนติเมตร (Standard)', label: '15 เซนติเมตร (Standard)' },
  { value: '20 เซนติเมตร', label: '20 เซนติเมตร' },
  { value: 'อื่นๆ', label: 'อื่นๆ' },
];

export const DEFAULT_FORM_INPUTS = {
  lampQ: 1,
  lampH: '3',
  lampD: '15 เซนติเมตร (Standard)',
  lampF: 'ผ้าใบขาว',
  lampLight: '3000K',
  lampControl: '-' as LightControlType,
};

export const createDefaultDocumentDetails = (): DocumentDetails => ({
  projectName: '',
  location: '',
  projectNumber: '',
  date: 'XX/XX/2026',
  client: '',
  drawingTitle: 'Floor plan',
  status: 'Draft, Design , Development',
  designBy: 'DRAFT01',
  checkedBy: 'Visawa.De',
  approvedBy: '',
});

export const createDefaultFormLamp = (): FormLampItem => ({
  id: Math.random().toString(36).slice(2),
  objectShape: 'rectangle',
  shapeName: 'SC-01',
  w: Number.NaN,
  l: Number.NaN,
  innerDia: 500,
  modulesPerLamp: 1,
  q: Number.NaN,
  h: '3',
  d: '15 เซนติเมตร (Standard)',
  f: 'ผ้าใบขาว',
  t: '3000K',
  c: '-',
  file: null,
});

export const getSpacingByDepth = (depth: string): { x: number; y: number } | null => {
  const match = String(depth || '').match(/(\d+)/);
  const cm = match ? Number(match[1]) : Number.NaN;
  if (cm === 5) return { x: 50, y: 50 };
  if (cm === 10) return { x: 100, y: 100 };
  if (cm === 15) return { x: 150, y: 150 };
  if (cm === 20) return { x: 200, y: 200 };
  return null;
};

const normalizeInput = (value: string): string => String(value || '').toLowerCase();

export const getModuleColorsByLightTemp = (lightTemp: string, lightControl: LightControlType | string = '-'): { fill: string; stroke: string; dot: string } => {
  const normalized = normalizeInput(lightTemp);
  const normalizedControl = normalizeInput(String(lightControl || ''));

  if (normalizedControl.includes('tunable')) {
    return { fill: 'rgba(232, 242, 255, 0.30)', stroke: '#0ea5e9', dot: '#0369a1' };
  }

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
  if (normalized.includes('rgbw')) {
    return { fill: 'rgba(196, 126, 255, 0.28)', stroke: '#9333ea', dot: '#6b21a8' };
  }

  return { fill: 'rgba(255, 243, 214, 0.34)', stroke: '#a16207', dot: '#854d0e' };
};

export const shouldForceDualModuleLayout = (lightTemp: string, lightControl: LightControlType | string = '-'): boolean => {
  const normalized = normalizeInput(lightTemp);
  const normalizedControl = normalizeInput(String(lightControl || ''));
  // Keep backward compatibility for older saved data that may still have Tunable White in light temperature.
  return normalizedControl.includes('tunable') || normalized.includes('tunable') || normalized.includes('5000');
};

export const isDimmableControl = (lightControl: LightControlType | string): boolean => {
  return normalizeInput(String(lightControl || '')).includes('dimmable');
};

export const isTunableWhiteControl = (lightControl: LightControlType | string): boolean => {
  return normalizeInput(String(lightControl || '')).includes('tunable');
};

export const getAdvancedControlMode = (lightControl: LightControlType | string): AdvancedControlMode => {
  if (isTunableWhiteControl(lightControl)) return 'tunable';
  if (isDimmableControl(lightControl)) return 'dimmable';
  return null;
};

export const isAdvancedControl = (lightControl: LightControlType | string): boolean => {
  return getAdvancedControlMode(lightControl) !== null;
};

export const getDriverLabelByControlMode = (mode: AdvancedControlMode): string => {
  return mode === 'tunable' ? 'Driver DT8 CCT' : 'Driver PWM';
};

export const getSmartControllerLabelByControlMode = (mode: AdvancedControlMode): string => {
  return mode === 'tunable' ? 'Wise Play2 Smart Remote RSS05' : 'Wise Play 2 Smart Keypad';
};

export const getDriverUnitPriceByControlMode = (mode: AdvancedControlMode): number => {
  return mode === 'tunable' ? 1150 : 1150;
};

export const getSmartControllerUnitPriceByControlMode = (mode: AdvancedControlMode): number => {
  return mode === 'tunable' ? 1050 : 1600;
};

export const getAdvancedBoqColumnLabels = (mode: AdvancedControlMode) => {
  const driverLabel = getDriverLabelByControlMode(mode);
  const smartControllerLabel = getSmartControllerLabelByControlMode(mode);
  return {
    driverQtyPerLamp: `จำนวน ${driverLabel}/โคม`,
    driverQtyPerType: `จำนวน ${driverLabel}/Type`,
    driverCostTotal: `ราคา ${driverLabel}/รวม`,
    smartControllerQtyPerLamp: mode === 'dimmable'
      ? 'จำนวน DWise Play 2 Smart Keypad/โคม'
      : `จำนวน ${smartControllerLabel}/โคม`,
    smartControllerQtyPerType: `จำนวน ${smartControllerLabel}/Type`,
    smartControllerCostTotal: `ราคา ${smartControllerLabel}/รวม`,
  };
};

export const roundUpToInteger = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil(value);
};

export const roundUpToDecimalPlaces = (value: number, decimals: number): number => {
  if (!Number.isFinite(value)) return 0;
  const safeDecimals = Math.max(0, decimals);
  const factor = 10 ** safeDecimals;
  return Math.ceil((value + Number.EPSILON) * factor) / factor;
};

export const escapeSvgText = (value: string): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const getNextShapeName = (lamps: FormLampItem[]): string => {
  const maxSeq = lamps.reduce((max, lamp) => {
    const match = String(lamp.shapeName || '').trim().match(/^SC-(\d+)$/i);
    if (!match) return max;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return max;
    return Math.max(max, value);
  }, 0);
  return `SC-${String(maxSeq + 1).padStart(2, '0')}`;
};

export const normalizeShapeName = (name: string): string => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const toValidQty = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return value > 0 ? value : 0;
};

export const parseHeightMeters = (value: string): number => {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};