import { createSampleImage } from './samples.js';
import { processImageToLineArt, renderLineArtPreview } from './imageProcessor.js';
import {
  BASE_THICKNESS_MM,
  RELIEF_THICKNESS_MM,
  DEFAULT_CONTOUR_OFFSET_MM,
  buildPlateMasks,
  generateWatertightPlateMesh,
  exportBinarySTL
} from './plateGeometry.js';
import { PlateViewer3D, FILAMENT_PRESETS } from './viewer3d.js';

// アプリケーションの状態管理
const state = {
  sourceImage: null,
  sourceName: 'flower',
  shapeId: 'square',
  contourOffsetMm: DEFAULT_CONTOUR_OFFSET_MM,
  baseThicknessMm: BASE_THICKNESS_MM,
  reliefThicknessMm: RELIEF_THICKNESS_MM,
  mode: 'adaptive',
  thickness: 0,
  threshold: 135,
  contrast: 20,
  blur: 1,
  imageScale: 88,
  invert: false,
  showPlateGuide: true,
  gridResolution: 280
};

let viewer3d = null;
let currentMeshData = null;
let currentLineArtData = null;
let currentPlateMasks = null;
let updateTimer = null;

// カメラストリーム管理
let cameraStream = null;
let cameraFacingMode = 'environment';

function initApp() {
  const threeContainer = document.getElementById('three-container');
  viewer3d = new PlateViewer3D(threeContainer);

  bindInputEvents();
  bindParameterEvents();
  bindShapeEvents();
  bindViewerToolbarEvents();
  bindCameraEvents();
  bindDownloadEvent();

  // 初期サンプル（花）の読み込み
  loadSample('flower');
}

/**
 * サンプル画像の読み込み
 */
function loadSample(sampleType) {
  state.sourceName = sampleType;
  state.sourceImage = createSampleImage(sampleType, 600);

  document.querySelectorAll('.sample-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.sample === sampleType);
  });

  runFullPipeline();
}

/**
 * ユーザーが選択または撮影した画像を読み込む
 */
function loadUserImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.sourceImage = img;
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'custom';
      state.sourceName = baseName;

      document.querySelectorAll('.sample-btn').forEach((btn) => btn.classList.remove('active'));
      runFullPipeline();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * 画像処理 → 台座マスク生成 → 2Dプレビュー → 3D水密メッシュ生成 の一連パイプライン
 */
function runFullPipeline() {
  if (!state.sourceImage) return;

  // 1. 線画抽出
  currentLineArtData = processImageToLineArt(
    state.sourceImage,
    {
      mode: state.mode,
      threshold: state.threshold,
      contrast: state.contrast,
      blur: state.blur,
      thickness: state.thickness,
      invert: state.invert,
      imageScale: state.imageScale,
      despeckle: true
    },
    state.gridResolution
  );

  // 2. 台座形状＆レリーフマスク構築
  currentPlateMasks = buildPlateMasks(currentLineArtData, state.shapeId, {
    contourOffsetMm: state.contourOffsetMm
  });

  // 3. 2Dプレビューキャンバス更新
  const canvas2d = document.getElementById('canvas-lineart');
  renderLineArtPreview(canvas2d, currentLineArtData, currentPlateMasks, state.showPlateGuide);

  // 4. 3Dメッシュ生成＆Three.jsプレビュー更新
  currentMeshData = generateWatertightPlateMesh(currentPlateMasks, {
    baseThicknessMm: state.baseThicknessMm,
    reliefThicknessMm: state.reliefThicknessMm
  });
  viewer3d.updateMesh(currentMeshData);

  // 5. ステータスUI更新
  updateSpecsUI(currentMeshData);
}

function schedulePipelineUpdate() {
  if (updateTimer) cancelAnimationFrame(updateTimer);
  updateTimer = requestAnimationFrame(() => {
    runFullPipeline();
  });
}

function updateSpecsUI(meshData) {
  const dimEl = document.getElementById('spec-dimensions');
  const thickEl = document.getElementById('spec-thickness');
  const headerNoteEl = document.getElementById('header-spec-note');
  const triEl = document.getElementById('spec-triangles');
  const sizeHintEl = document.getElementById('stl-size-hint');

  const baseStr = meshData.baseThicknessMm.toFixed(1);
  const reliefStr = meshData.reliefThicknessMm.toFixed(1);
  const totalStr = meshData.depthMm.toFixed(1);

  if (dimEl) {
    dimEl.textContent = `${meshData.widthMm.toFixed(1)} × ${meshData.heightMm.toFixed(1)} × ${totalStr} mm`;
  }
  if (thickEl) {
    thickEl.textContent = `台座 ${baseStr}mm + 線画 ${reliefStr}mm`;
  }
  if (headerNoteEl) {
    headerNoteEl.textContent = `台座厚さ ${baseStr}mm ＋ 線画盛り上がり ${reliefStr}mm（合計 ${totalStr}mm厚）・3Dプリンタ用水密STL出力`;
  }
  if (triEl) {
    triEl.textContent = `${meshData.triangleCount.toLocaleString()} tris`;
  }
  if (sizeHintEl) {
    const bytes = 84 + meshData.triangleCount * 50;
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    sizeHintEl.textContent = `${mb} MB`;
  }
}

/**
 * ファイル入力・ドラッグ＆ドロップ・サンプル選択イベント
 */
function bindInputEvents() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      loadUserImageFile(e.target.files[0]);
      e.target.value = '';
    }
  });

  // ドラッグ＆ドロップ
  ['dragenter', 'dragover'].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      loadUserImageFile(files[0]);
    }
  });

  // ウィンドウ全体へのドロップもサポート
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      loadUserImageFile(files[0]);
    }
  });

  // サンプル画像ボタン
  document.querySelectorAll('.sample-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      loadSample(btn.dataset.sample);
    });
  });
}

/**
 * 線画抽出エンジンのパラメータ変更イベント
 */
function bindParameterEvents() {
  // モード切替タブ (Sobel / Adaptive / Threshold)
  document.querySelectorAll('#mode-selector .mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.mode = tab.dataset.mode;
      document.querySelectorAll('#mode-selector .mode-tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
      });
      schedulePipelineUpdate();
    });
  });

  const sliderThickness = document.getElementById('slider-thickness');
  const valThickness = document.getElementById('val-thickness');
  sliderThickness.addEventListener('input', () => {
    const v = parseInt(sliderThickness.value, 10);
    state.thickness = v;
    if (v === 0) valThickness.textContent = '0 (標準)';
    else if (v > 0) valThickness.textContent = `+${v} (膨張)`;
    else valThickness.textContent = `${v} (収縮)`;
    schedulePipelineUpdate();
  });

  const sliderThreshold = document.getElementById('slider-threshold');
  const valThreshold = document.getElementById('val-threshold');
  sliderThreshold.addEventListener('input', () => {
    state.threshold = parseInt(sliderThreshold.value, 10);
    valThreshold.textContent = String(state.threshold);
    schedulePipelineUpdate();
  });

  const sliderContrast = document.getElementById('slider-contrast');
  const valContrast = document.getElementById('val-contrast');
  sliderContrast.addEventListener('input', () => {
    const v = parseInt(sliderContrast.value, 10);
    state.contrast = v;
    valContrast.textContent = v > 0 ? `+${v}` : String(v);
    schedulePipelineUpdate();
  });

  const sliderBlur = document.getElementById('slider-blur');
  const valBlur = document.getElementById('val-blur');
  sliderBlur.addEventListener('input', () => {
    state.blur = parseInt(sliderBlur.value, 10);
    valBlur.textContent = `${state.blur} px`;
    schedulePipelineUpdate();
  });

  const sliderScale = document.getElementById('slider-scale');
  const valScale = document.getElementById('val-scale');
  sliderScale.addEventListener('input', () => {
    state.imageScale = parseInt(sliderScale.value, 10);
    valScale.textContent = `${state.imageScale}%`;
    schedulePipelineUpdate();
  });

  const chkInvert = document.getElementById('chk-invert');
  chkInvert.addEventListener('change', () => {
    state.invert = chkInvert.checked;
    schedulePipelineUpdate();
  });

  const chkGuide = document.getElementById('chk-plate-guide');
  chkGuide.addEventListener('change', () => {
    state.showPlateGuide = chkGuide.checked;
    if (currentLineArtData && currentPlateMasks) {
      const canvas2d = document.getElementById('canvas-lineart');
      renderLineArtPreview(canvas2d, currentLineArtData, currentPlateMasks, state.showPlateGuide);
    }
  });

  // パラメータリセット
  document.getElementById('btn-reset-params').addEventListener('click', () => {
    state.mode = 'adaptive';
    state.thickness = 0;
    state.threshold = 135;
    state.contrast = 20;
    state.blur = 1;
    state.imageScale = 88;
    state.invert = false;

    sliderThickness.value = '0';
    valThickness.textContent = '0 (標準)';
    sliderThreshold.value = '135';
    valThreshold.textContent = '135';
    sliderContrast.value = '20';
    valContrast.textContent = '+20';
    sliderBlur.value = '1';
    valBlur.textContent = '1 px';
    sliderScale.value = '88';
    valScale.textContent = '88%';
    chkInvert.checked = false;

    document.querySelectorAll('#mode-selector .mode-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.mode === 'adaptive');
    });

    schedulePipelineUpdate();
  });
}

/**
 * 台座形状および厚さの選択イベント
 */
function bindShapeEvents() {
  document.querySelectorAll('#shape-selector .shape-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.shapeId = btn.dataset.shape;
      document.querySelectorAll('#shape-selector .shape-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      schedulePipelineUpdate();
    });
  });

  const bindThicknessInput = (inputId, stateKey, defaultValue) => {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;

    const clampThickness = (val) => Math.min(20, Math.max(0.1, Number(val.toFixed(2))));

    inputEl.addEventListener('input', () => {
      const parsed = parseFloat(inputEl.value);
      if (Number.isFinite(parsed) && parsed >= 0.1) {
        state[stateKey] = clampThickness(parsed);
        schedulePipelineUpdate();
      }
    });

    inputEl.addEventListener('change', () => {
      const parsed = parseFloat(inputEl.value);
      const valid = Number.isFinite(parsed) ? clampThickness(parsed) : defaultValue;
      state[stateKey] = valid;
      inputEl.value = valid.toFixed(1);
      schedulePipelineUpdate();
    });
  };

  bindThicknessInput('input-base-thickness', 'baseThicknessMm', BASE_THICKNESS_MM);
  bindThicknessInput('input-relief-thickness', 'reliefThicknessMm', RELIEF_THICKNESS_MM);

  // 外周輪郭の膨張長さ (mm)
  const contourInput = document.getElementById('input-contour-offset');
  const contourBadge = document.getElementById('contour-offset-badge');
  if (contourInput) {
    const clampOffset = (val) => Math.min(10.0, Math.max(0.1, Number(val.toFixed(2))));

    const activateContourShapeIfNeeded = () => {
      if (state.shapeId !== 'contour') {
        state.shapeId = 'contour';
        document.querySelectorAll('#shape-selector .shape-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.shape === 'contour');
        });
      }
    };

    contourInput.addEventListener('input', () => {
      const parsed = parseFloat(contourInput.value);
      if (Number.isFinite(parsed) && parsed >= 0.1) {
        const clamped = clampOffset(parsed);
        state.contourOffsetMm = clamped;
        if (contourBadge) contourBadge.textContent = clamped.toFixed(1);
        activateContourShapeIfNeeded();
        schedulePipelineUpdate();
      }
    });

    contourInput.addEventListener('change', () => {
      const parsed = parseFloat(contourInput.value);
      const valid = Number.isFinite(parsed) ? clampOffset(parsed) : DEFAULT_CONTOUR_OFFSET_MM;
      state.contourOffsetMm = valid;
      contourInput.value = valid.toFixed(1);
      if (contourBadge) contourBadge.textContent = valid.toFixed(1);
      activateContourShapeIfNeeded();
      schedulePipelineUpdate();
    });
  }
}

/**
 * 3Dビューアの視点・ワイヤーフレーム・フィラメント色切替イベント
 */
function bindViewerToolbarEvents() {
  const btnTop = document.getElementById('btn-view-top');
  const btnOblique = document.getElementById('btn-view-oblique');
  const btnWireframe = document.getElementById('btn-wireframe');

  btnTop.addEventListener('click', () => {
    viewer3d.setTopView();
    btnTop.classList.add('active');
    btnOblique.classList.remove('active');
  });

  btnOblique.addEventListener('click', () => {
    viewer3d.setObliqueView();
    btnOblique.classList.add('active');
    btnTop.classList.remove('active');
  });

  btnWireframe.addEventListener('click', () => {
    const nextState = !viewer3d.isWireframe;
    viewer3d.setWireframe(nextState);
    btnWireframe.classList.toggle('active', nextState);
  });

  // フィラメントカラースウォッチ
  const nameLabel = document.getElementById('filament-name-label');
  document.querySelectorAll('#filament-selector .swatch-btn').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const fid = swatch.dataset.filament;
      viewer3d.setFilamentColor(fid);
      document.querySelectorAll('#filament-selector .swatch-btn').forEach((s) => {
        s.classList.toggle('active', s === swatch);
      });
      if (nameLabel && FILAMENT_PRESETS[fid]) {
        nameLabel.textContent = FILAMENT_PRESETS[fid].name;
      }
    });
  });
}

/**
 * カメラによる直接撮影機能
 */
function bindCameraEvents() {
  const modal = document.getElementById('camera-modal');
  const video = document.getElementById('camera-video');
  const errEl = document.getElementById('camera-error');
  const btnOpen = document.getElementById('btn-camera');
  const btnClose = document.getElementById('btn-close-camera');
  const btnSwitch = document.getElementById('btn-switch-camera');
  const btnCapture = document.getElementById('btn-capture-photo');

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    video.srcObject = null;
  };

  const startCamera = async () => {
    stopCamera();
    errEl.hidden = true;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacingMode,
          width: { ideal: 1080 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      video.srcObject = cameraStream;
      await video.play();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent = 'カメラへのアクセスが許可されていないか、カメラが見つかりませんでした。ファイル選択からも画像を読み込めます。';
    }
  };

  btnOpen.addEventListener('click', () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // モバイル等でgetUserMedia非対応環境の場合はcapture付きファイル入力へフォールバック
      const fallbackInput = document.createElement('input');
      fallbackInput.type = 'file';
      fallbackInput.accept = 'image/*';
      fallbackInput.capture = 'environment';
      fallbackInput.onchange = (e) => {
        if (e.target.files?.[0]) loadUserImageFile(e.target.files[0]);
      };
      fallbackInput.click();
      return;
    }
    modal.hidden = false;
    startCamera();
  });

  btnClose.addEventListener('click', () => {
    stopCamera();
    modal.hidden = true;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      stopCamera();
      modal.hidden = true;
    }
  });

  btnSwitch.addEventListener('click', () => {
    cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    startCamera();
  });

  btnCapture.addEventListener('click', () => {
    if (!video.videoWidth || !video.videoHeight) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) * 0.5;
    const sy = (video.videoHeight - size) * 0.5;

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = 600;
    captureCanvas.height = 600;
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 600, 600);

    state.sourceImage = captureCanvas;
    state.sourceName = 'camera_capture';
    document.querySelectorAll('.sample-btn').forEach((btn) => btn.classList.remove('active'));

    stopCamera();
    modal.hidden = true;
    runFullPipeline();
  });
}

/**
 * 水密バイナリSTLダウンロード機能（ファイル名指定モーダル対応）
 */
function bindDownloadEvent() {
  const btnDownload = document.getElementById('btn-download-stl');
  const modal = document.getElementById('stl-filename-modal');
  const inputFilename = document.getElementById('input-stl-filename');
  const btnClose = document.getElementById('btn-close-stl-modal');
  const btnCancel = document.getElementById('btn-cancel-stl-download');
  const btnConfirm = document.getElementById('btn-confirm-stl-download');

  const getDefaultBaseName = () => {
    const w = Math.round(currentMeshData.widthMm);
    const h = Math.round(currentMeshData.heightMm);
    const d = currentMeshData.depthMm.toFixed(1);
    return `platemaker_${state.sourceName}_${state.shapeId}_${w}x${h}x${d}mm`;
  };

  const sanitizeBaseName = (raw) => {
    const stripped = String(raw || '')
      .trim()
      .replace(/\.stl$/i, '')
      .replace(/[\\/:*?"<>|]/g, '_');
    return stripped || getDefaultBaseName();
  };

  const executeDownload = (baseName) => {
    if (!currentMeshData) return;
    const stlBuffer = exportBinarySTL(currentMeshData);
    const blob = new Blob([stlBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const fileName = `${sanitizeBaseName(baseName)}.stl`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const closeModal = () => {
    modal.hidden = true;
  };

  btnDownload.addEventListener('click', () => {
    if (!currentMeshData) return;
    inputFilename.value = getDefaultBaseName();
    modal.hidden = false;
    inputFilename.focus();
    inputFilename.select();
  });

  btnConfirm.addEventListener('click', () => {
    executeDownload(inputFilename.value);
    closeModal();
  });

  inputFilename.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeDownload(inputFilename.value);
      closeModal();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });

  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

window.addEventListener('DOMContentLoaded', initApp);
