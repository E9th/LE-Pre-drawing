import {
  type DocumentDetails,
  type FormLampItem,
  type LayoutType,
  type LightControlType,
  type LogoSvgData,
  type PageData,
  type ShapeType,
  escapeSvgText,
  getModuleColorsByLightTemp,
  getSpacingByDepth,
  shouldForceDualModuleLayout,
  toValidQty,
} from './lampDomain';

const buildLeLogoMarkup = (logoSvgData: LogoSvgData | null, x: number, y: number, width: number, height: number) => {
  if (logoSvgData) {
    return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${logoSvgData.viewBox}" preserveAspectRatio="xMidYMid meet">${logoSvgData.inner}</svg>`;
  }
  return `<image href="/logo_LE.svg" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />`;
};

export interface FormTemplatePageParams {
  lamp: FormLampItem;
  index: number;
  modW: number;
  modH: number;
  spaceX: number;
  spaceY: number;
  layoutType: LayoutType;
  showCenterLines: boolean;
  moduleName: string;
  lampLight: string;
  lampControl: LightControlType;
}

export const buildFormTemplatePage = ({
  lamp,
  index,
  modW,
  modH,
  spaceX,
  spaceY,
  layoutType,
  showCenterLines,
  moduleName,
  lampLight,
  lampControl,
}: FormTemplatePageParams): PageData => {
  type PlacedModule = { x: number; y: number; w: number; h: number };

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
  const modules: PlacedModule[] = [];

  const forceDualModuleLayout = shouldForceDualModuleLayout(lamp.t || lampLight, lamp.c || lampControl);
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
  let modXLocal: PlacedModule | null = null;
  let minDyLocal = Infinity;
  let modYLocal: PlacedModule | null = null;

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

  const moduleColor = getModuleColorsByLightTemp(lamp.t || lampLight, lamp.c || lampControl);
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

  const centerOffsetXMarkup = (() => {
    if (!showCenterLines || !modXLocal || minDxLocal <= 0.1) return '';
    const placedModule = modXLocal as PlacedModule;
    const centerX = placedModule.x + placedModule.w / 2;
    return `
      <g stroke="#525252" fill="none" stroke-width="${localStroke}" style="font-size: ${localFont * 0.8}px" class="font-mono">
        <line x1="${width / 2}" y1="${-localTick}" x2="${width / 2}" y2="${-localOffset / 2 - localTick}" />
        <line x1="${centerX}" y1="${-localTick}" x2="${centerX}" y2="${-localOffset / 2 - localTick}" />
        <line x1="${width / 2}" y1="${-localOffset / 2}" x2="${centerX}" y2="${-localOffset / 2}" />
        <path d="M ${width / 2 + localArrow} ${-localOffset / 2 - localArrow / 2} L ${width / 2} ${-localOffset / 2} L ${width / 2 + localArrow} ${-localOffset / 2 + localArrow / 2}" />
        <path d="M ${centerX - localArrow} ${-localOffset / 2 - localArrow / 2} L ${centerX} ${-localOffset / 2} L ${centerX - localArrow} ${-localOffset / 2 + localArrow / 2}" />
        <text x="${(width / 2 + centerX) / 2}" y="${-localOffset / 2 - localFont * 0.3}" fill="#525252" stroke="none" text-anchor="middle">${Math.round(minDxLocal * 10) / 10}</text>
      </g>
    `;
  })();

  const centerOffsetYMarkup = (() => {
    if (!showCenterLines || !modYLocal || minDyLocal <= 0.1) return '';
    const placedModule = modYLocal as PlacedModule;
    const centerY = placedModule.y + placedModule.h / 2;
    return `
      <g stroke="#525252" fill="none" stroke-width="${localStroke}" style="font-size: ${localFont * 0.8}px" class="font-mono">
        <line x1="${-localTick}" y1="${height / 2}" x2="${-localOffset / 2 - localTick}" y2="${height / 2}" />
        <line x1="${-localTick}" y1="${centerY}" x2="${-localOffset / 2 - localTick}" y2="${centerY}" />
        <line x1="${-localOffset / 2}" y1="${height / 2}" x2="${-localOffset / 2}" y2="${centerY}" />
        <path d="M ${-localOffset / 2 - localArrow / 2} ${height / 2 + localArrow} L ${-localOffset / 2} ${height / 2} L ${-localOffset / 2 + localArrow / 2} ${height / 2 + localArrow}" />
        <path d="M ${-localOffset / 2 - localArrow / 2} ${centerY - localArrow} L ${-localOffset / 2} ${centerY} L ${-localOffset / 2 + localArrow / 2} ${centerY - localArrow}" />
        <text x="${-localOffset / 2 - localFont * 0.3}" y="${(height / 2 + centerY) / 2}" fill="#525252" stroke="none" text-anchor="middle" transform="rotate(-90, ${-localOffset / 2 - localFont * 0.3}, ${(height / 2 + centerY) / 2})">${Math.round(minDyLocal * 10) / 10}</text>
      </g>
    `;
  })();

  const qty = toValidQty(lamp.q);
  const labelMarkup = `
      <text x="0" y="${height + localPadding + localLabelFont}" font-size="${localLabelFont}" fill="#141414" font-family="sans-serif">${lamp.shapeName || `Lamp ${index + 1}`} x ${qty} SET</text>
      <text x="0" y="${height + localPadding + localLabelFont + localLabelGap}" font-size="${localLabelFont}" fill="#141414" font-family="sans-serif">${moduleName} : ${modules.length} pcs.</text>
      <text x="0" y="${height + localPadding + localLabelFont + localLabelGap * 2}" font-size="${localLabelFont}" fill="#141414" font-family="sans-serif">Spacing : ${currentSpaceX}x${currentSpaceY} mm.</text>
      <text x="${width}" y="${height + localPadding + localLabelFont + localLabelGap * 2}" text-anchor="end" style="font-size: ${localFont * 0.8}px" class="font-sans fill-neutral-500 italic">* All dimensions are in mm</text>
    `;

  const areaSqm = (width * height) / 1000000;
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
    c: lamp.c,
    exactAreaSqm: areaSqm,
  };
};

export const generateCoverPageSVG = (details: DocumentDetails, logoSvgData: LogoSvgData | null) => {
  const coverLogoMarkup = buildLeLogoMarkup(logoSvgData, 1500, 400, 1200, 549);
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

export const generateDrawingPageSVG = (details: DocumentDetails, page: PageData, pageNum: number, totalPages: number, logoSvgData: LogoSvgData | null) => {
  const sideLogoMarkup = buildLeLogoMarkup(logoSvgData, 90, 80, 400, 183);
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