/**
 * サンプル画像生成モジュール（花、猫、幾何学模様）
 * 外部画像ファイルに依存せず、高解像度Canvasで即時生成します。
 */

export function createSampleImage(type, size = 600) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 白背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  if (type === 'flower') {
    drawFlowerSample(ctx, size);
  } else if (type === 'cat') {
    drawCatSample(ctx, size);
  } else if (type === 'geometric') {
    drawGeometricSample(ctx, size);
  }

  return canvas;
}

function drawFlowerSample(ctx, size) {
  const cx = size * 0.5;
  const cy = size * 0.47;
  ctx.save();
  ctx.strokeStyle = '#18181b';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 茎と葉（下部）
  ctx.lineWidth = size * 0.022;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.12);
  ctx.quadraticCurveTo(cx - size * 0.03, cy + size * 0.3, cx + size * 0.01, cy + size * 0.42);
  ctx.stroke();

  // 左右の葉
  const drawLeaf = (dir) => {
    ctx.save();
    ctx.translate(cx, cy + size * 0.27);
    ctx.scale(dir, 1);
    ctx.fillStyle = '#f4f4f5';
    ctx.lineWidth = size * 0.018;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(size * 0.12, -size * 0.08, size * 0.26, -size * 0.03, size * 0.30, size * 0.05);
    ctx.bezierCurveTo(size * 0.22, size * 0.13, size * 0.10, size * 0.10, 0, 0.02 * size);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 葉脈
    ctx.lineWidth = size * 0.011;
    ctx.beginPath();
    ctx.moveTo(size * 0.02, 0.01 * size);
    ctx.quadraticCurveTo(size * 0.15, 0, size * 0.26, size * 0.045);
    ctx.moveTo(size * 0.10, 0.005 * size);
    ctx.lineTo(size * 0.15, -size * 0.025);
    ctx.moveTo(size * 0.16, 0.015 * size);
    ctx.lineTo(size * 0.21, -size * 0.01);
    ctx.moveTo(size * 0.12, 0.015 * size);
    ctx.lineTo(size * 0.17, size * 0.05);
    ctx.stroke();
    ctx.restore();
  };

  drawLeaf(-1);
  drawLeaf(1);

  // 外側の花びら (8枚)
  const outerPetals = 8;
  for (let i = 0; i < outerPetals; i++) {
    const angle = (i * Math.PI * 2) / outerPetals + Math.PI / outerPetals;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // 陰影グラデーションでSobel/Adaptiveでも美しく出るようにする
    const grad = ctx.createRadialGradient(0, -size * 0.16, size * 0.02, 0, -size * 0.18, size * 0.22);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.75, '#f1f5f9');
    grad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = grad;
    ctx.lineWidth = size * 0.018;

    ctx.beginPath();
    ctx.moveTo(0, -size * 0.06);
    ctx.bezierCurveTo(
      -size * 0.11, -size * 0.16,
      -size * 0.09, -size * 0.31,
      0, -size * 0.34
    );
    ctx.bezierCurveTo(
      size * 0.09, -size * 0.31,
      size * 0.11, -size * 0.16,
      0, -size * 0.06
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 花びらの筋
    ctx.lineWidth = size * 0.009;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.11);
    ctx.lineTo(0, -size * 0.27);
    ctx.moveTo(-size * 0.025, -size * 0.15);
    ctx.quadraticCurveTo(-size * 0.035, -size * 0.21, -size * 0.02, -size * 0.25);
    ctx.moveTo(size * 0.025, -size * 0.15);
    ctx.quadraticCurveTo(size * 0.035, -size * 0.21, size * 0.02, -size * 0.25);
    ctx.stroke();

    ctx.restore();
  }

  // 内側の花びら (8枚)
  for (let i = 0; i < outerPetals; i++) {
    const angle = (i * Math.PI * 2) / outerPetals;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = size * 0.018;

    ctx.beginPath();
    ctx.moveTo(0, -size * 0.05);
    ctx.bezierCurveTo(
      -size * 0.085, -size * 0.12,
      -size * 0.075, -size * 0.24,
      0, -size * 0.27
    );
    ctx.bezierCurveTo(
      size * 0.075, -size * 0.24,
      size * 0.085, -size * 0.12,
      0, -size * 0.05
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = size * 0.009;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.10);
    ctx.lineTo(0, -size * 0.21);
    ctx.stroke();

    ctx.restore();
  }

  // 花の中心部
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = size * 0.02;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.095, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.lineWidth = size * 0.013;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.062, 0, Math.PI * 2);
  ctx.stroke();

  // 中心のドット模様
  ctx.fillStyle = '#18181b';
  const ringCount = 10;
  for (let i = 0; i < ringCount; i++) {
    const a = (i * Math.PI * 2) / ringCount;
    const rx = cx + Math.cos(a) * size * 0.036;
    const ry = cy + Math.sin(a) * size * 0.036;
    ctx.beginPath();
    ctx.arc(rx, ry, size * 0.009, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.014, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCatSample(ctx, size) {
  const cx = size * 0.5;
  const cy = size * 0.52;

  ctx.save();
  ctx.strokeStyle = '#18181b';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.022;

  // しっぽ（右側にカール）
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.13, cy + size * 0.29);
  ctx.bezierCurveTo(
    cx + size * 0.33, cy + size * 0.28,
    cx + size * 0.36, cy + size * 0.02,
    cx + size * 0.24, cy - size * 0.02
  );
  ctx.bezierCurveTo(
    cx + size * 0.18, cy - size * 0.04,
    cx + size * 0.16, cy + size * 0.03,
    cx + size * 0.22, cy + size * 0.06
  );
  ctx.bezierCurveTo(
    cx + size * 0.28, cy + size * 0.09,
    cx + size * 0.25, cy + size * 0.22,
    cx + size * 0.12, cy + size * 0.23
  );
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.stroke();

  // 体（お座りシルエット）
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.13, cy - size * 0.05);
  ctx.bezierCurveTo(
    cx - size * 0.22, cy + size * 0.08,
    cx - size * 0.22, cy + size * 0.26,
    cx - size * 0.14, cy + size * 0.32
  );
  ctx.lineTo(cx + size * 0.14, cy + size * 0.32);
  ctx.bezierCurveTo(
    cx + size * 0.22, cy + size * 0.26,
    cx + size * 0.22, cy + size * 0.08,
    cx + size * 0.13, cy - size * 0.05
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 前足と肉球のライン
  ctx.lineWidth = size * 0.017;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.06, cy + size * 0.10);
  ctx.lineTo(cx - size * 0.05, cy + size * 0.32);
  ctx.moveTo(cx + size * 0.06, cy + size * 0.10);
  ctx.lineTo(cx + size * 0.05, cy + size * 0.32);
  ctx.moveTo(cx, cy + size * 0.18);
  ctx.lineTo(cx, cy + size * 0.32);
  ctx.stroke();

  // 足先の丸み
  ctx.beginPath();
  ctx.arc(cx - size * 0.095, cy + size * 0.30, size * 0.042, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + size * 0.095, cy + size * 0.30, size * 0.042, 0, Math.PI);
  ctx.stroke();

  // 頭（耳付きの輪郭）
  const headY = cy - size * 0.16;
  ctx.lineWidth = size * 0.022;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  // 額の中央からスタート
  ctx.moveTo(cx - size * 0.07, headY - size * 0.155);
  // 左耳
  ctx.lineTo(cx - size * 0.21, headY - size * 0.27);
  ctx.lineTo(cx - size * 0.20, headY - size * 0.07);
  // 左頬
  ctx.bezierCurveTo(
    cx - size * 0.25, headY + size * 0.04,
    cx - size * 0.18, headY + size * 0.17,
    cx, headY + size * 0.17
  );
  // 右頬
  ctx.bezierCurveTo(
    cx + size * 0.18, headY + size * 0.17,
    cx + size * 0.25, headY + size * 0.04,
    cx + size * 0.20, headY - size * 0.07
  );
  // 右耳
  ctx.lineTo(cx + size * 0.21, headY - size * 0.27);
  ctx.lineTo(cx + size * 0.07, headY - size * 0.155);
  // 頭頂部
  ctx.quadraticCurveTo(cx, headY - size * 0.18, cx - size * 0.07, headY - size * 0.155);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 内耳の三角形
  ctx.lineWidth = size * 0.014;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.10, headY - size * 0.14);
  ctx.lineTo(cx - size * 0.175, headY - size * 0.215);
  ctx.lineTo(cx - size * 0.165, headY - size * 0.09);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + size * 0.10, headY - size * 0.14);
  ctx.lineTo(cx + size * 0.175, headY - size * 0.215);
  ctx.lineTo(cx + size * 0.165, headY - size * 0.09);
  ctx.closePath();
  ctx.stroke();

  // 額のトラ模様
  ctx.lineWidth = size * 0.015;
  ctx.beginPath();
  ctx.moveTo(cx, headY - size * 0.15);
  ctx.lineTo(cx, headY - size * 0.08);
  ctx.moveTo(cx - size * 0.04, headY - size * 0.14);
  ctx.lineTo(cx - size * 0.03, headY - size * 0.09);
  ctx.moveTo(cx + size * 0.04, headY - size * 0.14);
  ctx.lineTo(cx + size * 0.03, headY - size * 0.09);
  ctx.stroke();

  // 目
  const drawEye = (ex) => {
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.ellipse(ex, headY - size * 0.01, size * 0.035, size * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    // ハイライト
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - size * 0.01, headY - size * 0.022, size * 0.012, 0, Math.PI * 2);
    ctx.fill();
  };
  drawEye(cx - size * 0.085);
  drawEye(cx + size * 0.085);

  // 鼻と口
  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.moveTo(cx, headY + size * 0.055);
  ctx.lineTo(cx - size * 0.025, headY + size * 0.03);
  ctx.lineTo(cx + size * 0.025, headY + size * 0.03);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = size * 0.015;
  ctx.beginPath();
  ctx.moveTo(cx, headY + size * 0.055);
  ctx.quadraticCurveTo(cx - size * 0.025, headY + size * 0.095, cx - size * 0.055, headY + size * 0.075);
  ctx.moveTo(cx, headY + size * 0.055);
  ctx.quadraticCurveTo(cx + size * 0.025, headY + size * 0.095, cx + size * 0.055, headY + size * 0.075);
  ctx.stroke();

  // ひげ
  ctx.lineWidth = size * 0.013;
  const drawWhiskers = (dir) => {
    ctx.beginPath();
    ctx.moveTo(cx + dir * size * 0.12, headY + size * 0.03);
    ctx.lineTo(cx + dir * size * 0.25, headY + size * 0.01);
    ctx.moveTo(cx + dir * size * 0.12, headY + size * 0.06);
    ctx.lineTo(cx + dir * size * 0.26, headY + size * 0.06);
    ctx.moveTo(cx + dir * size * 0.12, headY + size * 0.09);
    ctx.lineTo(cx + dir * size * 0.24, headY + size * 0.11);
    ctx.stroke();
  };
  drawWhiskers(-1);
  drawWhiskers(1);

  // 首輪と鈴
  ctx.lineWidth = size * 0.020;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.12, headY + size * 0.155);
  ctx.quadraticCurveTo(cx, headY + size * 0.195, cx + size * 0.12, headY + size * 0.155);
  ctx.stroke();

  // 鈴
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = size * 0.016;
  ctx.beginPath();
  ctx.arc(cx, headY + size * 0.205, size * 0.032, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.028, headY + size * 0.20);
  ctx.lineTo(cx + size * 0.028, headY + size * 0.20);
  ctx.stroke();

  ctx.restore();
}

function drawGeometricSample(ctx, size) {
  const cx = size * 0.5;
  const cy = size * 0.5;
  const maxR = size * 0.40;

  ctx.save();
  ctx.strokeStyle = '#18181b';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 外周リング
  ctx.lineWidth = size * 0.020;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = size * 0.013;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.91, 0, Math.PI * 2);
  ctx.stroke();

  // 外周の12角星ポリゴン（2つの6角形＋回転）
  const drawStarPolygon = (numPoints, step, radius, lineWidth) => {
    ctx.lineWidth = lineWidth;
    for (let s = 0; s < numPoints; s++) {
      const a1 = (s * Math.PI * 2) / numPoints - Math.PI / 2;
      const a2 = (((s + step) % numPoints) * Math.PI * 2) / numPoints - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius);
      ctx.lineTo(cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius);
      ctx.stroke();
    }
  };

  drawStarPolygon(12, 5, maxR * 0.90, size * 0.013);
  drawStarPolygon(8, 3, maxR * 0.64, size * 0.015);

  // 中間リング
  ctx.lineWidth = size * 0.016;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.64, 0, Math.PI * 2);
  ctx.stroke();

  // ロゼット花弁模様
  const petals = 12;
  ctx.lineWidth = size * 0.013;
  for (let i = 0; i < petals; i++) {
    const a = (i * Math.PI * 2) / petals;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -maxR * 0.22);
    ctx.quadraticCurveTo(maxR * 0.14, -maxR * 0.42, 0, -maxR * 0.63);
    ctx.quadraticCurveTo(-maxR * 0.14, -maxR * 0.42, 0, -maxR * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  // 内側リングと中心の八芒星
  ctx.lineWidth = size * 0.016;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.24, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#18181b';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12 + Math.PI / 12;
    const rx = cx + Math.cos(a) * maxR * 0.77;
    const ry = cy + Math.sin(a) * maxR * 0.77;
    ctx.beginPath();
    ctx.arc(rx, ry, size * 0.011, 0, Math.PI * 2);
    ctx.fill();
  }

  // 中心サークル
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
