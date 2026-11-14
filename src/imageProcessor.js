/**
 * 線画抽出エンジン（Canvas API）
 * - 輪郭抽出 (Sobelフィルタ)
 * - 局所適応 2値化 (Adaptive - Integral Image方式)
 * - 標準2値化 (Threshold)
 * - モルフォロジー演算による線の太さ調整 (-3 〜 +5)
 * - 閾値、コントラスト、ぼかし、白黒反転のリアルタイム処理
 */

export function processImageToLineArt(sourceImage, params, resolution = 320) {
  const {
    mode = 'adaptive',       // 'sobel' | 'adaptive' | 'threshold'
    threshold = 135,         // 1 - 250
    contrast = 20,           // -100 - 100
    blur = 1,                // 0 - 8
    thickness = 0,           // -3 - +5
    invert = false,          // boolean
    imageScale = 88,         // 40 - 130 (%)
    despeckle = true         // 微小ノイズ除去
  } = params;

  const width = resolution;
  const height = resolution;

  // 1. ソース画像を正方形ワークキャンバスへ描画（アスペクト比維持・中央配置）
  const workCanvas = document.createElement('canvas');
  workCanvas.width = width;
  workCanvas.height = height;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const srcW = sourceImage.width || sourceImage.videoWidth || width;
  const srcH = sourceImage.height || sourceImage.videoHeight || height;
  const scaleFactor = (imageScale / 100) * Math.min(width / srcW, height / srcH);
  const drawW = srcW * scaleFactor;
  const drawH = srcH * scaleFactor;
  const offsetX = (width - drawW) * 0.5;
  const offsetY = (height - drawH) * 0.5;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceImage, offsetX, offsetY, drawW, drawH);

  const imgData = ctx.getImageData(0, 0, width, height);
  const rgba = imgData.data;

  // 2. グレースケール変換 ＆ コントラスト調整
  const gray = new Float32Array(width * height);
  const contrastClamped = Math.max(-100, Math.min(100, contrast));
  const contrastFactor = (259 * (contrastClamped + 255)) / (255 * (259 - contrastClamped));

  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    // 透過ピクセルは白背景と合成
    const r = rgba[p] * a + 255 * (1 - a);
    const g = rgba[p + 1] * a + 255 * (1 - a);
    const b = rgba[p + 2] * a + 255 * (1 - a);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const adj = contrastFactor * (lum - 128) + 128;
    gray[i] = adj < 0 ? 0 : adj > 255 ? 255 : adj;
  }

  // 3. ガウシアンぼかし（Separable 1D Convolution）
  const blurred = blur > 0 ? applyGaussianBlur(gray, width, height, blur) : gray;

  // 4. 線画2値マスク抽出 (1 = 線画の盛り上がり部分, 0 = 背景)
  let mask = new Uint8Array(width * height);

  if (mode === 'sobel') {
    extractSobel(blurred, mask, width, height, threshold);
  } else if (mode === 'adaptive') {
    extractAdaptive(blurred, mask, width, height, threshold);
  } else {
    extractThreshold(blurred, mask, width, height, threshold);
  }

  // 5. 白黒反転
  if (invert) {
    for (let i = 0; i < mask.length; i++) {
      mask[i] = mask[i] ? 0 : 1;
    }
  }

  // 6. モルフォロジー演算による線の太さ調整 (-3 〜 +5)
  if (thickness !== 0) {
    mask = applyMorphology(mask, width, height, thickness);
  }

  // 7. 微小な孤立ノイズの除去（3Dプリント時のゴミ防止）
  if (despeckle) {
    mask = removeSmallSpeckles(mask, width, height, 3);
  }

  return {
    mask,
    width,
    height
  };
}

/**
 * 分離型ガウシアンブラー
 */
function applyGaussianBlur(src, width, height, radius) {
  const r = Math.max(1, Math.min(12, Math.round(radius)));
  const sigma = Math.max(0.6, radius * 0.65);
  const kernelSize = r * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  let sum = 0;

  for (let i = -r; i <= r; i++) {
    const val = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + r] = val;
    sum += val;
  }
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }

  const temp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);

  // 水平パス
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const nx = Math.min(width - 1, Math.max(0, x + k));
        acc += src[rowOffset + nx] * kernel[k + r];
      }
      temp[rowOffset + x] = acc;
    }
  }

  // 垂直パス
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const ny = Math.min(height - 1, Math.max(0, y + k));
        acc += temp[ny * width + x] * kernel[k + r];
      }
      dst[rowOffset + x] = acc;
    }
  }

  return dst;
}

/**
 * 輪郭抽出 (Sobelフィルタ)
 */
function extractSobel(gray, mask, width, height, threshold) {
  // 閾値スライダーが高いほど細かいエッジまで拾うように変換
  const cutoff = Math.max(8, (255 - threshold) * 1.35);

  for (let y = 1; y < height - 1; y++) {
    const r0 = (y - 1) * width;
    const r1 = y * width;
    const r2 = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const gx =
        -gray[r0 + x - 1] + gray[r0 + x + 1] +
        -2 * gray[r1 + x - 1] + 2 * gray[r1 + x + 1] +
        -gray[r2 + x - 1] + gray[r2 + x + 1];

      const gy =
        -gray[r0 + x - 1] - 2 * gray[r0 + x] - gray[r0 + x + 1] +
        gray[r2 + x - 1] + 2 * gray[r2 + x] + gray[r2 + x + 1];

      const mag = Math.hypot(gx, gy) * 0.25;
      mask[r1 + x] = mag >= cutoff ? 1 : 0;
    }
  }
}

/**
 * 局所適応2値化 (Integral Image による高速局所平均比較)
 */
function extractAdaptive(gray, mask, width, height, threshold) {
  // 積分画像 (Integral Image) の作成
  const integral = new Float64Array((width + 1) * (height + 1));
  const stride = width + 1;

  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    const srcRow = (y - 1) * width;
    const dstRow = y * stride;
    const prevRow = (y - 1) * stride;
    for (let x = 1; x <= width; x++) {
      rowSum += gray[srcRow + (x - 1)];
      integral[dstRow + x] = integral[prevRow + x] + rowSum;
    }
  }

  const winRadius = Math.max(6, Math.round(width * 0.045));
  // threshold (1..250): 大きいほどより淡い線も抽出
  const bias = Math.max(2, (255 - threshold) * 0.26);

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - winRadius);
    const y1 = Math.min(height - 1, y + winRadius);
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - winRadius);
      const x1 = Math.min(width - 1, x + winRadius);

      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];

      const localMean = sum / count;
      const val = gray[rowOffset + x];

      // 局所平均よりbias以上暗いピクセルを線として抽出（かつ極端に明るい白背景ノイズを除外）
      mask[rowOffset + x] = (val < localMean - bias && val < 242) ? 1 : 0;
    }
  }
}

/**
 * 標準2値化 (Threshold)
 */
function extractThreshold(gray, mask, width, height, threshold) {
  for (let i = 0; i < gray.length; i++) {
    mask[i] = gray[i] < threshold ? 1 : 0;
  }
}

/**
 * モルフォロジー演算（膨張 Dilation / 収縮 Erosion）
 * steps > 0: 膨張（線を太くする, +1 〜 +5）
 * steps < 0: 収縮（線を細くする, -1 〜 -3）
 * 4近傍と8近傍を交互に適用することで自然な円形・八角形カーネル近似を実現
 */
export function applyMorphology(mask, width, height, steps) {
  let current = new Uint8Array(mask);
  const count = Math.abs(Math.round(steps));
  const isDilate = steps > 0;

  for (let iter = 0; iter < count; iter++) {
    const next = new Uint8Array(width * height);
    const useDiagonal = iter % 2 === 1;

    if (isDilate) {
      for (let y = 0; y < height; y++) {
        const yMin = Math.max(0, y - 1);
        const yMax = Math.min(height - 1, y + 1);
        for (let x = 0; x < width; x++) {
          if (current[y * width + x]) {
            next[y * width + x] = 1;
            continue;
          }
          const xMin = Math.max(0, x - 1);
          const xMax = Math.min(width - 1, x + 1);
          let hit =
            current[yMin * width + x] ||
            current[yMax * width + x] ||
            current[y * width + xMin] ||
            current[y * width + xMax];

          if (!hit && useDiagonal) {
            hit =
              current[yMin * width + xMin] ||
              current[yMin * width + xMax] ||
              current[yMax * width + xMin] ||
              current[yMax * width + xMax];
          }
          next[y * width + x] = hit ? 1 : 0;
        }
      }
    } else {
      // Erosion
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (!current[y * width + x]) continue;
          let keep =
            current[(y - 1) * width + x] &&
            current[(y + 1) * width + x] &&
            current[y * width + (x - 1)] &&
            current[y * width + (x + 1)];

          if (keep && useDiagonal) {
            keep =
              current[(y - 1) * width + (x - 1)] &&
              current[(y - 1) * width + (x + 1)] &&
              current[(y + 1) * width + (x - 1)] &&
              current[(y + 1) * width + (x + 1)];
          }
          next[y * width + x] = keep ? 1 : 0;
        }
      }
    }

    current = next;
  }

  return current;
}

/**
 * 孤立した微小ピクセル塊（minSize未満）を除去
 */
function removeSmallSpeckles(mask, width, height, minSize = 3) {
  const out = new Uint8Array(mask);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const component = [];

  for (let i = 0; i < out.length; i++) {
    if (!out[i] || visited[i]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;
    component.length = 0;

    while (head < tail) {
      const idx = queue[head++];
      component.push(idx);
      const x = idx % width;
      const y = (idx - x) / width;

      if (x > 0) {
        const n = idx - 1;
        if (out[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
      }
      if (x < width - 1) {
        const n = idx + 1;
        if (out[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
      }
      if (y > 0) {
        const n = idx - width;
        if (out[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
      }
      if (y < height - 1) {
        const n = idx + width;
        if (out[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; }
      }
    }

    if (component.length < minSize) {
      for (let k = 0; k < component.length; k++) {
        out[component[k]] = 0;
      }
    }
  }

  return out;
}

/**
 * 2Dプレビューキャンバスへのレンダリング（台座外形ガイドライン表示対応）
 */
export function renderLineArtPreview(canvas, lineArtData, baseMaskData = null, showPlateGuide = true) {
  const { mask, width, height } = lineArtData;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const baseMask = baseMaskData ? baseMaskData.baseMask : null;
  const reliefMask = baseMaskData ? baseMaskData.reliefMask : mask;

  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    const inBase = baseMask ? baseMask[i] === 1 : true;
    const inRelief = reliefMask[i] === 1;

    if (inRelief && inBase) {
      // 盛り上がる線画部分（濃いチャコールブラック）
      data[p] = 20;
      data[p + 1] = 24;
      data[p + 2] = 33;
      data[p + 3] = 255;
    } else if (inBase) {
      // 台座プレート領域（明るいクリーンホワイト）
      data[p] = 250;
      data[p + 1] = 251;
      data[p + 2] = 253;
      data[p + 3] = 255;
    } else {
      // 台座の外側（薄いチェッカー/グレー背景色）
      const x = i % width;
      const y = (i - x) / width;
      const checker = ((x >> 3) + (y >> 3)) & 1;
      const bg = checker ? 226 : 216;
      data[p] = bg;
      data[p + 1] = bg + 2;
      data[p + 2] = bg + 6;
      data[p + 3] = 255;
    }
  }

  // 台座境界エッジをアクセントラインでハイライト描画
  if (showPlateGuide && baseMask) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (!baseMask[idx]) continue;
        const isEdge =
          !baseMask[idx - 1] ||
          !baseMask[idx + 1] ||
          !baseMask[idx - width] ||
          !baseMask[idx + width];
        if (isEdge) {
          const p = idx * 4;
          data[p] = 59;
          data[p + 1] = 130;
          data[p + 2] = 246;
          data[p + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
