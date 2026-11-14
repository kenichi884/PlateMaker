/**
 * 3Dモデル生成 ＆ 水密（Watertight / Manifold）STL出力モジュール
 *
 * 仕様:
 * - 台座厚さ: 2.0 mm (z = 0.0 〜 2.0 mm)
 * - 線画盛り上がり厚さ: 2.0 mm (z = 2.0 〜 4.0 mm, 合計 4.0 mm厚)
 * - 台座形状:
 *   1. square  : 40mm × 40mm の正方形
 *   2. circle  : 直径 40mm の丸
 *   3. bell    : 40mm × 50mm の釣鐘型
 *   4. heart   : 50mm × 40mm のハート形
 *   5. contour : 線画の外側の輪郭から2mm外側に膨らんだ形で50×50mmの大きさ
 */

export const PLATE_SHAPES = {
  square: {
    id: 'square',
    label: '正方形 (40×40mm)',
    widthMm: 40,
    heightMm: 40
  },
  circle: {
    id: 'circle',
    label: '丸 (直径40mm)',
    widthMm: 40,
    heightMm: 40
  },
  bell: {
    id: 'bell',
    label: '釣鐘型 (40×40mm)',
    widthMm: 40,
    heightMm: 40
  },
  heart: {
    id: 'heart',
    label: 'ハート形 (40×40mm)',
    widthMm: 40,
    heightMm: 40
  },
  contour: {
    id: 'contour',
    label: '輪郭+2mm (50×50mm)',
    widthMm: 50,
    heightMm: 50
  }
};

export const BASE_THICKNESS_MM = 2.0;
export const RELIEF_THICKNESS_MM = 2.0;
export const TOTAL_THICKNESS_MM = BASE_THICKNESS_MM + RELIEF_THICKNESS_MM; // 4.0 mm

// ハート形状の高精度ポリゴンキャッシュ（40x40mmに厳密正規化）
let cachedHeartPolygon = null;

function getHeartPolygon() {
  if (cachedHeartPolygon) return cachedHeartPolygon;
  const N = 360;
  const rawPts = [];
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < N; i++) {
    const t = (i * Math.PI * 2) / N;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    rawPts.push([x, y]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // 幅 40.0mm (-20.0 〜 +20.0), 高さ 40.0mm (-20.0 〜 +20.0) に厳密正規化
  cachedHeartPolygon = rawPts.map(([x, y]) => [
    ((x - minX) / (maxX - minX) - 0.5) * 40.0,
    ((y - minY) / (maxY - minY) - 0.5) * 40.0
  ]);
  return cachedHeartPolygon;
}

/**
 * 点 (x, y) がハート形 (40x40mm) の内部にあるか判定
 */
function isPointInHeart(x, y) {
  if (x < -20.0 || x > 20.0 || y < -20.0 || y > 20.0) return false;
  const poly = getHeartPolygon();
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 釣鐘型 (40x40mm: x in [-20, 20], y in [-20, 20]) の内部判定
 */
function isPointInBell(x, y) {
  if (y < -20.0 || y > 20.0 || x < -20.0 || x > 20.0) return false;
  const ax = Math.abs(x);
  // 正規化高さ t in [0, 1] (0 = 下端 -20mm, 1 = 上端 +20mm)
  const t = (y + 20.0) / 40.0;

  let halfW = 0;
  if (t < 0.06) {
    // 下端の丸みエッジ (t = 0 で 17.5mm -> t = 0.06 で 20.0mm)
    const u = t / 0.06;
    halfW = 17.5 + 2.5 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - u, 2)));
  } else if (t < 0.22) {
    // 裾の広がり部分（最大幅 40mm = 半幅 20.0mm）
    const u = (t - 0.06) / 0.16;
    halfW = 20.0 - 2.6 * (u * u * (3 - 2 * u));
  } else if (t < 0.62) {
    // 釣鐘の胴体（緩やかなテーパー）
    const u = (t - 0.22) / 0.40;
    halfW = 17.4 - 1.8 * u;
  } else if (t < 0.90) {
    // 上部ドーム肩（丸く絞る）
    const u = (t - 0.62) / 0.28;
    halfW = 15.6 * Math.sqrt(Math.max(0, 1 - Math.pow(u, 1.85)));
  } else {
    // 頂部の竜頭（ベルの吊り手リング突起: t = 0.88〜1.0, 中心 (0, 17.0mm), 半径 3.0mm）
    const dy = y - 17.0;
    const r = 3.0;
    if (dy * dy <= r * r) {
      halfW = Math.sqrt(Math.max(0, r * r - dy * dy));
    } else {
      halfW = 0;
    }
  }

  // ドーム頂部と竜頭の接続を滑らかにブレンド
  if (t >= 0.84 && t <= 0.93) {
    const dy = y - 17.0;
    const r = 3.0;
    const crownW = dy * dy <= r * r ? Math.sqrt(Math.max(0, r * r - dy * dy)) : 0;
    const u = Math.min(1, (t - 0.62) / 0.28);
    const domeW = 15.6 * Math.sqrt(Math.max(0, 1 - Math.pow(u, 1.85)));
    halfW = Math.max(domeW, crownW, 3.0);
  }

  return ax <= halfW;
}

/**
 * 点 (x, y) [単位: mm] が指定された台座形状の内部にあるか判定
 */
function isPointInAnalyticShape(shapeId, x, y) {
  switch (shapeId) {
    case 'square': {
      // 40mm x 40mm の正方形（角のみ半径1.0mmで微小フィレット処理し造形品質を向上）
      const half = 20.0;
      const r = 1.0;
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      if (ax > half || ay > half) return false;
      if (ax <= half - r || ay <= half - r) return true;
      const dx = ax - (half - r);
      const dy = ay - (half - r);
      return dx * dx + dy * dy <= r * r;
    }
    case 'circle': {
      // 直径40mmの丸 (半径20mm)
      return x * x + y * y <= 20.0 * 20.0;
    }
    case 'bell': {
      // 40x40mmの釣鐘型
      return isPointInBell(x, y);
    }
    case 'heart': {
      // 40x40mmのハート形
      return isPointInHeart(x, y);
    }
    default:
      return Math.abs(x) <= 20.0 && Math.abs(y) <= 20.0;
  }
}

/**
 * 2次元ユークリッド距離変換 (Exact 2D Euclidean Distance Transform - Felzenszwalb & Huttenlocher O(N) 法)
 * binaryMask[i] === 1 のピクセルからの距離（ピクセル単位）を Float32Array で返す
 */
function computeEDT(binaryMask, width, height) {
  const INF = 1e12;
  const f = new Float64Array(Math.max(width, height));
  const d = new Float64Array(width * height);
  const v = new Int32Array(Math.max(width, height));
  const z = new Float64Array(Math.max(width, height) + 1);

  for (let i = 0; i < width * height; i++) {
    d[i] = binaryMask[i] ? 0 : INF;
  }

  // 1D 二乗距離変換ヘルパー
  const edt1D = (n) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = +INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = +INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const dx = q - v[k];
      f[q] = dx * dx + f[v[k]];
    }
  };

  // 列方向のパス
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      f[y] = d[y * width + x];
    }
    edt1D(height);
    for (let y = 0; y < height; y++) {
      d[y * width + x] = f[y];
    }
  }

  // 行方向のパス ＆ 平方根
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      f[x] = d[row + x];
    }
    edt1D(width);
    for (let x = 0; x < width; x++) {
      out[row + x] = Math.sqrt(f[x]);
    }
  }

  return out;
}

/**
 * 外周境界からのフラッドフィルによって内部の穴をすべて埋める
 */
function fillInteriorHoles(mask, width, height) {
  const exterior = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  // 外周4辺の背景ピクセルをシードとして登録
  for (let x = 0; x < width; x++) {
    const topIdx = x;
    const botIdx = (height - 1) * width + x;
    if (!mask[topIdx] && !exterior[topIdx]) { exterior[topIdx] = 1; queue[tail++] = topIdx; }
    if (!mask[botIdx] && !exterior[botIdx]) { exterior[botIdx] = 1; queue[tail++] = botIdx; }
  }
  for (let y = 0; y < height; y++) {
    const leftIdx = y * width;
    const rightIdx = y * width + (width - 1);
    if (!mask[leftIdx] && !exterior[leftIdx]) { exterior[leftIdx] = 1; queue[tail++] = leftIdx; }
    if (!mask[rightIdx] && !exterior[rightIdx]) { exterior[rightIdx] = 1; queue[tail++] = rightIdx; }
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;

    if (x > 0) {
      const n = idx - 1;
      if (!mask[n] && !exterior[n]) { exterior[n] = 1; queue[tail++] = n; }
    }
    if (x < width - 1) {
      const n = idx + 1;
      if (!mask[n] && !exterior[n]) { exterior[n] = 1; queue[tail++] = n; }
    }
    if (y > 0) {
      const n = idx - width;
      if (!mask[n] && !exterior[n]) { exterior[n] = 1; queue[tail++] = n; }
    }
    if (y < height - 1) {
      const n = idx + width;
      if (!mask[n] && !exterior[n]) { exterior[n] = 1; queue[tail++] = n; }
    }
  }

  const filled = new Uint8Array(width * height);
  for (let i = 0; i < filled.length; i++) {
    filled[i] = exterior[i] ? 0 : 1;
  }
  return filled;
}

/**
 * 複数の分離した島がある場合、最短経路でブリッジ接続して1つのパーツに統合する
 */
function connectDisconnectedIslands(mask, width, height, bridgeRadiusPx) {
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i] !== 0) continue;
    const compId = components.length + 1;
    const boundaryPts = [];
    let count = 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    labels[i] = compId;

    while (head < tail) {
      const idx = queue[head++];
      count++;
      const x = idx % width;
      const y = (idx - x) / width;

      let isBoundary = false;
      if (x > 0) {
        const n = idx - 1;
        if (!mask[n]) isBoundary = true;
        else if (labels[n] === 0) { labels[n] = compId; queue[tail++] = n; }
      }
      if (x < width - 1) {
        const n = idx + 1;
        if (!mask[n]) isBoundary = true;
        else if (labels[n] === 0) { labels[n] = compId; queue[tail++] = n; }
      }
      if (y > 0) {
        const n = idx - width;
        if (!mask[n]) isBoundary = true;
        else if (labels[n] === 0) { labels[n] = compId; queue[tail++] = n; }
      }
      if (y < height - 1) {
        const n = idx + width;
        if (!mask[n]) isBoundary = true;
        else if (labels[n] === 0) { labels[n] = compId; queue[tail++] = n; }
      }
      if (isBoundary) {
        boundaryPts.push([x, y]);
      }
    }
    components.push({ id: compId, count, boundaryPts });
  }

  if (components.length <= 1) return mask;

  // 最大の島をメインコンポーネントとし、他の島を最短ラインで接続
  components.sort((a, b) => b.count - a.count);
  const out = new Uint8Array(mask);
  const mainPts = components[0].boundaryPts;
  const r = Math.max(2, Math.round(bridgeRadiusPx));
  const rSq = r * r;

  for (let c = 1; c < components.length; c++) {
    const subPts = components[c].boundaryPts;
    let bestD2 = Infinity;
    let bestA = mainPts[0];
    let bestB = subPts[0];

    // サンプリングして最短ペアを探索
    const stepA = Math.max(1, Math.floor(mainPts.length / 120));
    const stepB = Math.max(1, Math.floor(subPts.length / 80));
    for (let i = 0; i < mainPts.length; i += stepA) {
      const [ax, ay] = mainPts[i];
      for (let j = 0; j < subPts.length; j += stepB) {
        const [bx, by] = subPts[j];
        const d2 = (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestA = [ax, ay];
          bestB = [bx, by];
        }
      }
    }

    // bestA から bestB まで太さ r のカプセルを描画
    const [x0, y0] = bestA;
    const [x1, y1] = bestB;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let s = 0; s <= steps; s++) {
      const cx = Math.round(x0 + ((x1 - x0) * s) / steps);
      const cy = Math.round(y0 + ((y1 - y0) * s) / steps);
      for (let dy = -r; dy <= r; dy++) {
        const ny = cy + dy;
        if (ny < 1 || ny >= height - 1) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx;
          if (nx < 1 || nx >= width - 1) continue;
          if (dx * dx + dy * dy <= rSq) {
            out[ny * width + nx] = 1;
          }
        }
      }
    }
  }

  return fillInteriorHoles(out, width, height);
}

/**
 * 2x2 チェッカーボード（非多様体コーナー）を解消して完全2-Manifoldを保証する
 */
function enforceManifoldGrid(mask, width, height) {
  let changed = true;
  let pass = 0;
  while (changed && pass < 5) {
    changed = false;
    pass++;
    for (let y = 0; y < height - 1; y++) {
      const r0 = y * width;
      const r1 = (y + 1) * width;
      for (let x = 0; x < width - 1; x++) {
        const a = mask[r0 + x];
        const b = mask[r0 + x + 1];
        const c = mask[r1 + x];
        const d = mask[r1 + x + 1];
        if (a === 1 && d === 1 && b === 0 && c === 0) {
          mask[r0 + x + 1] = 1;
          mask[r1 + x] = 1;
          changed = true;
        } else if (b === 1 && c === 1 && a === 0 && d === 0) {
          mask[r0 + x] = 1;
          mask[r1 + x + 1] = 1;
          changed = true;
        }
      }
    }
  }
}

/**
 * 線画マスクと選択された台座形状から、物理グリッド上の `baseMask` と `reliefMask` を構築する
 */
export function buildPlateMasks(lineArtData, shapeId = 'square') {
  const { mask: srcMask, width: gridW, height: gridH } = lineArtData;
  const shapeInfo = PLATE_SHAPES[shapeId] || PLATE_SHAPES.square;

  const baseMask = new Uint8Array(gridW * gridH);
  const reliefMask = new Uint8Array(gridW * gridH);

  // グリッド外周1ピクセルは常に0（外側境界壁を確実に閉じるため）
  const marginPx = 2;

  if (shapeId === 'contour') {
    // 「線画の外側の輪郭から2mm外側に膨らんだ形で50x50mmの大きさ」
    // 1. 入力線画のバウンディングボックスを取得
    let minX = gridW, maxX = -1, minY = gridH, maxY = -1;
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        if (srcMask[y * gridW + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // 万一線画が空の場合は中央にデフォルト円を配置
    if (maxX < minX) {
      minX = Math.floor(gridW * 0.25);
      maxX = Math.floor(gridW * 0.75);
      minY = Math.floor(gridH * 0.25);
      maxY = Math.floor(gridH * 0.75);
    }

    // 物理領域: 50mm x 50mm (外周余白を含め 52mm ドメインにマッピング)
    // 線画の長辺が 46.0mm になるよう正規化し、外側へ +2.0mm (両側で +4.0mm) 膨張させるとちょうど 50.0mm になる
    const domainMm = 52.0;
    const mmPerPx = domainMm / gridW;
    const targetLineSpanMm = 46.0; // 46mm + 2mm*2 = 50.0mm
    const targetLineSpanPx = targetLineSpanMm / mmPerPx;

    const srcSpanX = Math.max(1, maxX - minX + 1);
    const srcSpanY = Math.max(1, maxY - minY + 1);
    const srcMaxSpan = Math.max(srcSpanX, srcSpanY);
    const scale = targetLineSpanPx / srcMaxSpan;

    const srcCx = (minX + maxX) * 0.5;
    const srcCy = (minY + maxY) * 0.5;
    const dstCx = gridW * 0.5;
    const dstCy = gridH * 0.5;

    for (let y = marginPx; y < gridH - marginPx; y++) {
      for (let x = marginPx; x < gridW - marginPx; x++) {
        const sx = Math.round((x - dstCx) / scale + srcCx);
        const sy = Math.round((y - dstCy) / scale + srcCy);
        if (sx >= 0 && sx < gridW && sy >= 0 && sy < gridH) {
          reliefMask[y * gridW + x] = srcMask[sy * gridW + sx];
        }
      }
    }

    // 2. 線画からのユークリッド距離変換 (mm単位)
    const distFromLinePx = computeEDT(reliefMask, gridW, gridH);

    // 輪郭の隙間（最大3.5mm程度）を閉じて図柄の内部領域を充填したシルエットを作る
    const closeRadiusPx = 3.5 / mmPerPx;
    const closedTemp = new Uint8Array(gridW * gridH);
    for (let i = 0; i < closedTemp.length; i++) {
      closedTemp[i] = distFromLinePx[i] <= closeRadiusPx ? 1 : 0;
    }
    const filledHull = fillInteriorHoles(closedTemp, gridW, gridH);

    // 充填されたハルの外周から closeRadiusPx 分だけ内側に戻して正確な図柄シルエットを復元
    const invHull = new Uint8Array(gridW * gridH);
    for (let i = 0; i < invHull.length; i++) {
      invHull[i] = filledHull[i] ? 0 : 1;
    }
    const distFromExteriorPx = computeEDT(invHull, gridW, gridH);
    const silhouette = new Uint8Array(gridW * gridH);
    for (let i = 0; i < silhouette.length; i++) {
      silhouette[i] = (reliefMask[i] || distFromExteriorPx[i] > closeRadiusPx) ? 1 : 0;
    }

    // 3. シルエットの外側輪郭から厳密に 2.0mm 外側へ膨張させる
    const distFromSilhouettePx = computeEDT(silhouette, gridW, gridH);
    const offset2mmPx = 2.0 / mmPerPx;

    for (let y = marginPx; y < gridH - marginPx; y++) {
      for (let x = marginPx; x < gridW - marginPx; x++) {
        const idx = y * gridW + x;
        if (distFromSilhouettePx[idx] <= offset2mmPx) {
          baseMask[idx] = 1;
        }
      }
    }

    // 内部の穴埋めと離れ島のブリッジ接続
    const holeFilled = fillInteriorHoles(baseMask, gridW, gridH);
    const connected = connectDisconnectedIslands(holeFilled, gridW, gridH, 1.5 / mmPerPx);
    baseMask.set(connected);

    enforceManifoldGrid(reliefMask, gridW, gridH);
    for (let i = 0; i < reliefMask.length; i++) {
      if (reliefMask[i]) baseMask[i] = 1;
    }
    enforceManifoldGrid(baseMask, gridW, gridH);

    return {
      baseMask,
      reliefMask,
      width: gridW,
      height: gridH,
      domainWidthMm: domainMm,
      domainHeightMm: domainMm,
      plateWidthMm: 50.0,
      plateHeightMm: 50.0,
      shapeId
    };
  }

  // 定型プレート (square: 40x40, circle: 40x40, bell: 40x40, heart: 40x40)
  const plateW = shapeInfo.widthMm;
  const plateH = shapeInfo.heightMm;
  const maxDimMm = Math.max(plateW, plateH);
  // 外周に余白を持たせた物理ドメイン
  const domainMm = maxDimMm + 2.0;
  const mmPerPx = domainMm / gridW;

  // 台座の外周から最低 1.2mm 内側に線画が収まるようにマスクを作る
  for (let y = marginPx; y < gridH - marginPx; y++) {
    // 2D画像の上が +Y (3D) に対応
    const yMm = (0.5 - y / (gridH - 1)) * domainMm;
    for (let x = marginPx; x < gridW - marginPx; x++) {
      const xMm = (x / (gridW - 1) - 0.5) * domainMm;
      const idx = y * gridW + x;
      if (isPointInAnalyticShape(shapeId, xMm, yMm)) {
        baseMask[idx] = 1;
      }
    }
  }

  // 台座の境界から 1.0mm 内側のみに線画レリーフを配置（台座の縁からはみ出さないようにする）
  const invBase = new Uint8Array(gridW * gridH);
  for (let i = 0; i < invBase.length; i++) invBase[i] = baseMask[i] ? 0 : 1;
  const distToEdgePx = computeEDT(invBase, gridW, gridH);
  const edgeMarginPx = 1.0 / mmPerPx;

  // 台座のアスペクト比に合わせて線画を中央マッピング
  const fitSpanMm = Math.min(plateW, plateH) * 0.88;
  const fitSpanPx = fitSpanMm / mmPerPx;
  const scale = fitSpanPx / gridW;
  const cx = gridW * 0.5;
  const cy = gridH * 0.5;

  for (let y = marginPx; y < gridH - marginPx; y++) {
    for (let x = marginPx; x < gridW - marginPx; x++) {
      const idx = y * gridW + x;
      if (distToEdgePx[idx] <= edgeMarginPx) continue;

      const sx = Math.round((x - cx) / scale + cx);
      const sy = Math.round((y - cy) / scale + cy);
      if (sx >= 0 && sx < gridW && sy >= 0 && sy < gridH) {
        if (srcMask[sy * gridW + sx]) {
          reliefMask[idx] = 1;
        }
      }
    }
  }

  enforceManifoldGrid(reliefMask, gridW, gridH);
  for (let i = 0; i < reliefMask.length; i++) {
    if (reliefMask[i]) baseMask[i] = 1;
  }
  enforceManifoldGrid(baseMask, gridW, gridH);

  return {
    baseMask,
    reliefMask,
    width: gridW,
    height: gridH,
    domainWidthMm: domainMm,
    domainHeightMm: domainMm,
    plateWidthMm: plateW,
    plateHeightMm: plateH,
    shapeId
  };
}

/**
 * 境界チェーン上のグリッド頂点をTaubin平滑化（縮小しない輪郭スムージング）し、
 * ジャギー（階段状のギザギザ）のない滑らかな3D曲面壁を生成する
 */
function computeSmoothedGridVertices(baseMask, reliefMask, gridW, gridH, domainW, domainH) {
  const vxCount = gridW + 1;
  const vyCount = gridH + 1;
  const totalVerts = vxCount * vyCount;

  const origX = new Float32Array(totalVerts);
  const origY = new Float32Array(totalVerts);
  const posX = new Float32Array(totalVerts);
  const posY = new Float32Array(totalVerts);

  const dx = domainW / gridW;
  const dy = domainH / gridH;

  for (let j = 0; j < vyCount; j++) {
    const yMm = (0.5 - j / gridH) * domainH;
    const row = j * vxCount;
    for (let i = 0; i < vxCount; i++) {
      const xMm = (i / gridW - 0.5) * domainW;
      origX[row + i] = xMm;
      origY[row + i] = yMm;
      posX[row + i] = xMm;
      posY[row + i] = yMm;
    }
  }

  // 境界エッジの隣接リストを構築
  // Layer 0: baseMask の境界, Layer 1: reliefMask の境界
  const smoothBoundaryLayer = (mask, iterations, maxOffsetRatio) => {
    // 各頂点に接続する境界隣接頂点（最大4つ、通常2つ）を記録
    const adjCount = new Uint8Array(totalVerts);
    const adjList = new Int32Array(totalVerts * 4);

    const addEdge = (u, v) => {
      const cu = adjCount[u];
      if (cu < 4) {
        adjList[u * 4 + cu] = v;
        adjCount[u] = cu + 1;
      }
      const cv = adjCount[v];
      if (cv < 4) {
        adjList[v * 4 + cv] = u;
        adjCount[v] = cv + 1;
      }
    };

    // 水平境界エッジ
    for (let y = 1; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const up = mask[(y - 1) * gridW + x];
        const dn = mask[y * gridW + x];
        if (up !== dn) {
          const u = y * vxCount + x;
          const v = y * vxCount + (x + 1);
          addEdge(u, v);
        }
      }
    }

    // 垂直境界エッジ
    for (let y = 0; y < gridH; y++) {
      for (let x = 1; x < gridW; x++) {
        const lf = mask[y * gridW + (x - 1)];
        const rt = mask[y * gridW + x];
        if (lf !== rt) {
          const u = y * vxCount + x;
          const v = (y + 1) * vxCount + x;
          addEdge(u, v);
        }
      }
    }

    const tempX = new Float32Array(totalVerts);
    const tempY = new Float32Array(totalVerts);
    const maxShiftX = dx * maxOffsetRatio;
    const maxShiftY = dy * maxOffsetRatio;

    // Taubin (lambda / mu) フィルタで輪郭を縮めずに階段ジャギーを滑らかにする
    const factors = [0.45, -0.47];
    for (let iter = 0; iter < iterations; iter++) {
      const lambda = factors[iter % 2];
      tempX.set(posX);
      tempY.set(posY);

      for (let v = 0; v < totalVerts; v++) {
        const deg = adjCount[v];
        if (deg < 2) continue;
        let sumX = 0;
        let sumY = 0;
        const baseIdx = v * 4;
        for (let k = 0; k < deg; k++) {
          const nb = adjList[baseIdx + k];
          sumX += posX[nb];
          sumY += posY[nb];
        }
        const avgX = sumX / deg;
        const avgY = sumY / deg;
        let nx = posX[v] + lambda * (avgX - posX[v]);
        let ny = posY[v] + lambda * (avgY - posY[v]);

        // セルの反転（自己交差）を完全に防ぐため元のグリッド座標の ±0.42 セル以内に制限
        const ox = origX[v];
        const oy = origY[v];
        if (nx > ox + maxShiftX) nx = ox + maxShiftX;
        if (nx < ox - maxShiftX) nx = ox - maxShiftX;
        if (ny > oy + maxShiftY) ny = oy + maxShiftY;
        if (ny < oy - maxShiftY) ny = oy - maxShiftY;

        tempX[v] = nx;
        tempY[v] = ny;
      }

      posX.set(tempX);
      posY.set(tempY);
    }
  };

  // 線画の境界と台座外周の境界をそれぞれ滑らかにする
  smoothBoundaryLayer(reliefMask, 6, 0.40);
  smoothBoundaryLayer(baseMask, 8, 0.42);

  return { posX, posY, vxCount, vyCount };
}

/**
 * 水密（Watertight / 2-Manifold）な3Dメッシュデータを生成する
 * - 台座層: z = 0.0 〜 2.0 mm
 * - 線画レリーフ層: z = 2.0 〜 4.0 mm
 * - すべての垂直壁を [0, 2] 層と [2, 4] 層に分割することで T-junction を完全にゼロにする
 */
export function generateWatertightPlateMesh(plateMaskData) {
  const {
    baseMask,
    reliefMask,
    width: gridW,
    height: gridH,
    domainWidthMm,
    domainHeightMm,
    shapeId
  } = plateMaskData;

  const { posX, posY, vxCount } = computeSmoothedGridVertices(
    baseMask,
    reliefMask,
    gridW,
    gridH,
    domainWidthMm,
    domainHeightMm
  );

  // 三角形数を事前カウントして TypedArray を一括確保（高速・省メモリ）
  let triCount = 0;
  for (let y = 0; y < gridH; y++) {
    const row = y * gridW;
    for (let x = 0; x < gridW; x++) {
      const idx = row + x;
      if (!baseMask[idx]) continue;

      // 上面 (2 tris) + 底面 (2 tris) = 4 tris
      triCount += 4;

      // Layer 1 壁 (z: 0 -> 2): 隣接セルが baseMask === 0 の場合 (2 tris / 辺)
      if (x === 0 || !baseMask[idx - 1]) triCount += 2;
      if (x === gridW - 1 || !baseMask[idx + 1]) triCount += 2;
      if (y === 0 || !baseMask[idx - gridW]) triCount += 2;
      if (y === gridH - 1 || !baseMask[idx + gridW]) triCount += 2;

      // Layer 2 壁 (z: 2 -> 4): 自身が reliefMask === 1 で隣接セルが reliefMask === 0 の場合
      if (reliefMask[idx]) {
        if (x === 0 || !reliefMask[idx - 1]) triCount += 2;
        if (x === gridW - 1 || !reliefMask[idx + 1]) triCount += 2;
        if (y === 0 || !reliefMask[idx - gridW]) triCount += 2;
        if (y === gridH - 1 || !reliefMask[idx + gridW]) triCount += 2;
      }
    }
  }

  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);
  let ptr = 0;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  const updateBounds = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  // 三角形1枚を追加し、外向き法線を自動計算して書き込む
  const pushTriangle = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    positions[ptr] = ax;     positions[ptr + 1] = ay; positions[ptr + 2] = az;
    positions[ptr + 3] = bx; positions[ptr + 4] = by; positions[ptr + 5] = bz;
    positions[ptr + 6] = cx; positions[ptr + 7] = cy; positions[ptr + 8] = cz;

    normals[ptr] = nx;     normals[ptr + 1] = ny; normals[ptr + 2] = nz;
    normals[ptr + 3] = nx; normals[ptr + 4] = ny; normals[ptr + 5] = nz;
    normals[ptr + 6] = nx; normals[ptr + 7] = ny; normals[ptr + 8] = nz;

    ptr += 9;
  };

  // 垂直壁クアッド (A -> B が高い方のセルの反時計回りエッジ、zLo から zHi への壁)
  const pushWallQuad = (ax, ay, bx, by, zLo, zHi) => {
    pushTriangle(ax, ay, zLo, bx, by, zLo, bx, by, zHi);
    pushTriangle(ax, ay, zLo, bx, by, zHi, ax, ay, zHi);
  };

  const z0 = 0.0;
  const zBase = BASE_THICKNESS_MM;    // 2.0 mm
  const zTop = TOTAL_THICKNESS_MM;    // 4.0 mm

  for (let y = 0; y < gridH; y++) {
    const row = y * gridW;
    const vRow0 = y * vxCount;
    const vRow1 = (y + 1) * vxCount;

    for (let x = 0; x < gridW; x++) {
      const idx = row + x;
      if (!baseMask[idx]) continue;

      const v00 = vRow0 + x;
      const v10 = vRow0 + (x + 1);
      const v01 = vRow1 + x;
      const v11 = vRow1 + (x + 1);

      const x00 = posX[v00], y00 = posY[v00];
      const x10 = posX[v10], y10 = posY[v10];
      const x01 = posX[v01], y01 = posY[v01];
      const x11 = posX[v11], y11 = posY[v11];

      updateBounds(x00, y00);
      updateBounds(x11, y11);

      const isRelief = reliefMask[idx] === 1;
      const zCellTop = isRelief ? zTop : zBase;

      // 1. 底面 (z = 0.0, 法線 -Z)
      pushTriangle(x00, y00, z0, x11, y11, z0, x01, y01, z0);
      pushTriangle(x00, y00, z0, x10, y10, z0, x11, y11, z0);

      // 2. 上面 (z = 2.0 または 4.0, 法線 +Z)
      pushTriangle(x00, y00, zCellTop, x01, y01, zCellTop, x11, y11, zCellTop);
      pushTriangle(x00, y00, zCellTop, x11, y11, zCellTop, x10, y10, zCellTop);

      // 3. Layer 1 側面壁 (z = 0.0 〜 2.0 mm: 台座の外周壁)
      // 左辺 (v00 -> v01)
      if (x === 0 || !baseMask[idx - 1]) {
        pushWallQuad(x00, y00, x01, y01, z0, zBase);
      }
      // 下辺 (v01 -> v11)
      if (y === gridH - 1 || !baseMask[idx + gridW]) {
        pushWallQuad(x01, y01, x11, y11, z0, zBase);
      }
      // 右辺 (v11 -> v10)
      if (x === gridW - 1 || !baseMask[idx + 1]) {
        pushWallQuad(x11, y11, x10, y10, z0, zBase);
      }
      // 上辺 (v10 -> v00)
      if (y === 0 || !baseMask[idx - gridW]) {
        pushWallQuad(x10, y10, x00, y00, z0, zBase);
      }

      // 4. Layer 2 側面壁 (z = 2.0 〜 4.0 mm: 線画の立ち上がり壁)
      if (isRelief) {
        if (x === 0 || !reliefMask[idx - 1]) {
          pushWallQuad(x00, y00, x01, y01, zBase, zTop);
        }
        if (y === gridH - 1 || !reliefMask[idx + gridW]) {
          pushWallQuad(x01, y01, x11, y11, zBase, zTop);
        }
        if (x === gridW - 1 || !reliefMask[idx + 1]) {
          pushWallQuad(x11, y11, x10, y10, zBase, zTop);
        }
        if (y === 0 || !reliefMask[idx - gridW]) {
          pushWallQuad(x10, y10, x00, y00, zBase, zTop);
        }
      }
    }
  }

  // 外形寸法を厳密な目標サイズ（例: 40x40mm, 50x50mm）へ微調整スケーリング
  const rawSpanX = maxX - minX;
  const rawSpanY = maxY - minY;
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;

  let finalWidthMm = rawSpanX;
  let finalHeightMm = rawSpanY;

  if (rawSpanX > 0 && rawSpanY > 0) {
    let scaleX = 1.0;
    let scaleY = 1.0;

    if (shapeId === 'contour') {
      // 輪郭+2mmモード: アスペクト比を維持したまま長辺をちょうど 50.0mm に正規化
      const maxSpan = Math.max(rawSpanX, rawSpanY);
      const s = 50.0 / maxSpan;
      scaleX = s;
      scaleY = s;
    } else {
      const targetShape = PLATE_SHAPES[shapeId] || PLATE_SHAPES.square;
      scaleX = targetShape.widthMm / rawSpanX;
      scaleY = targetShape.heightMm / rawSpanY;
    }

    for (let i = 0; i < ptr; i += 3) {
      positions[i] = (positions[i] - centerX) * scaleX;
      positions[i + 1] = (positions[i + 1] - centerY) * scaleY;
    }

    finalWidthMm = rawSpanX * scaleX;
    finalHeightMm = rawSpanY * scaleY;
  }

  return {
    positions,
    normals,
    triangleCount: triCount,
    widthMm: Number(finalWidthMm.toFixed(1)),
    heightMm: Number(finalHeightMm.toFixed(1)),
    depthMm: TOTAL_THICKNESS_MM,
    baseThicknessMm: BASE_THICKNESS_MM,
    reliefThicknessMm: RELIEF_THICKNESS_MM,
    isWatertight: true
  };
}

/**
 * 水密バイナリSTL (ArrayBuffer) へ変換
 * フォーマット:
 * - 80 bytes: ヘッダ文字列
 * - 4 bytes (Uint32 LE): 三角形総数
 * - 各三角形 50 bytes:
 *   - 法線ベクトル (float32 x 3)
 *   - 頂点1 (float32 x 3)
 *   - 頂点2 (float32 x 3)
 *   - 頂点3 (float32 x 3)
 *   - 属性バイトカウント (Uint16 LE = 0)
 */
export function exportBinarySTL(meshData) {
  const { positions, normals, triangleCount } = meshData;
  const bufferByteLength = 84 + triangleCount * 50;
  const buffer = new ArrayBuffer(bufferByteLength);
  const view = new DataView(buffer);

  // 80バイトヘッダ
  const headerText = 'PlateMaker Watertight Binary STL (Unit: mm, Base: 2.0mm, Relief: +2.0mm)';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < headerText.length ? headerText.charCodeAt(i) : 0x20);
  }

  // 三角形数
  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (let t = 0; t < triangleCount; t++) {
    const base = t * 9;

    // 法線
    view.setFloat32(offset, normals[base], true);
    view.setFloat32(offset + 4, normals[base + 1], true);
    view.setFloat32(offset + 8, normals[base + 2], true);

    // 頂点 1, 2, 3
    view.setFloat32(offset + 12, positions[base], true);
    view.setFloat32(offset + 16, positions[base + 1], true);
    view.setFloat32(offset + 20, positions[base + 2], true);

    view.setFloat32(offset + 24, positions[base + 3], true);
    view.setFloat32(offset + 28, positions[base + 4], true);
    view.setFloat32(offset + 32, positions[base + 5], true);

    view.setFloat32(offset + 36, positions[base + 6], true);
    view.setFloat32(offset + 40, positions[base + 7], true);
    view.setFloat32(offset + 44, positions[base + 8], true);

    // Attribute byte count (0)
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }

  return buffer;
}
