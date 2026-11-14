/**
 * Three.js 3Dプレビューアモジュール
 * - マウスドラッグによる360度回転、ズーム、パン (OrbitControls)
 * - 上面視点／斜め視点リセットボタン
 * - ワイヤーフレーム表示切り替え
 * - 各種フィラメントカラー（ホワイト、ブラック、グレー、シルクゴールド等）での表示
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const FILAMENT_PRESETS = {
  white: {
    id: 'white',
    name: 'ホワイト',
    hex: '#f8fafc',
    color: 0xf8fafc,
    roughness: 0.42,
    metalness: 0.05
  },
  gray: {
    id: 'gray',
    name: 'グレー',
    hex: '#94a3b8',
    color: 0x94a3b8,
    roughness: 0.38,
    metalness: 0.10
  },
  black: {
    id: 'black',
    name: 'ブラック',
    hex: '#27272a',
    color: 0x33363f,
    roughness: 0.45,
    metalness: 0.12
  },
  silkgold: {
    id: 'silkgold',
    name: 'シルクゴールド',
    hex: '#f59e0b',
    color: 0xfbbf24,
    roughness: 0.22,
    metalness: 0.65
  },
  silksilver: {
    id: 'silksilver',
    name: 'シルクシルバー',
    hex: '#cbd5e1',
    color: 0xe2e8f0,
    roughness: 0.20,
    metalness: 0.70
  },
  terracotta: {
    id: 'terracotta',
    name: 'テラコッタ',
    hex: '#ea580c',
    color: 0xf97316,
    roughness: 0.44,
    metalness: 0.06
  },
  mint: {
    id: 'mint',
    name: 'ミント',
    hex: '#10b981',
    color: 0x34d399,
    roughness: 0.38,
    metalness: 0.06
  }
};

export class PlateViewer3D {
  constructor(container) {
    this.container = container;
    this.currentFilament = 'silkgold';
    this.isWireframe = false;
    this.plateMesh = null;

    this.initScene();
    this.initLights();
    this.initBuildPlate();
    this.initResizeObserver();
    this.animate();
  }

  initScene() {
    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 480;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    // Z-up 座標系（3Dプリンタ・スライサー標準: XYがビルドプレート、+Zが高さmm）
    this.camera = new THREE.PerspectiveCamera(38, width / height, 1, 500);
    this.camera.up.set(0, 0, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 220;
    this.controls.minDistance = 20;
    this.controls.target.set(0, 0, 1.5);

    this.setObliqueView();
  }

  initLights() {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 0.85);
    hemiLight.position.set(0, 0, 100);
    this.scene.add(hemiLight);

    // メインキーライト（斜め上から照射して2mmのレリーフ段差をくっきり見せる）
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.65);
    keyLight.position.set(45, -55, 80);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 200;
    const d = 42;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // フィルライト（反対側からエッジを浮かび上がらせる）
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.75);
    fillLight.position.set(-55, 45, 50);
    this.scene.add(fillLight);

    // リムライト
    const rimLight = new THREE.DirectionalLight(0xfef08a, 0.45);
    rimLight.position.set(0, 65, 35);
    this.scene.add(rimLight);
  }

  /**
   * 3Dプリンタ風ビルドプレート（60mm×60mmグリッド＋10mm目盛り）
   */
  initBuildPlate() {
    const group = new THREE.Group();

    // ビルドプレート台座面 (z = -0.05mm)
    const bedGeo = new THREE.PlaneGeometry(64, 64);
    const bedMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.15
    });
    const bedMesh = new THREE.Mesh(bedGeo, bedMat);
    bedMesh.position.z = -0.06;
    bedMesh.receiveShadow = true;
    group.add(bedMesh);

    // 60mmグリッド (10mm間隔の主線 + 5mm間隔の補助線)
    const gridPoints = [];
    const majorPoints = [];
    const half = 30;
    for (let i = -half; i <= half; i += 5) {
      const target = i % 10 === 0 ? majorPoints : gridPoints;
      target.push(new THREE.Vector3(i, -half, -0.02), new THREE.Vector3(i, half, -0.02));
      target.push(new THREE.Vector3(-half, i, -0.02), new THREE.Vector3(half, i, -0.02));
    }

    const subGeo = new THREE.BufferGeometry().setFromPoints(gridPoints);
    const subMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.55 });
    group.add(new THREE.LineSegments(subGeo, subMat));

    const majGeo = new THREE.BufferGeometry().setFromPoints(majorPoints);
    const majMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.85 });
    group.add(new THREE.LineSegments(majGeo, majMat));

    // 50mm×50mm 枠ガイドライン（最大プレート寸法目安）
    const borderPts = [
      new THREE.Vector3(-25, -25, 0.01),
      new THREE.Vector3(25, -25, 0.01),
      new THREE.Vector3(25, 25, 0.01),
      new THREE.Vector3(-25, 25, 0.01),
      new THREE.Vector3(-25, -25, 0.01)
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4 });
    group.add(new THREE.Line(borderGeo, borderMat));

    this.scene.add(group);
  }

  /**
   * 生成された水密メッシュデータをThree.jsシーンに反映する
   */
  updateMesh(meshData) {
    if (this.plateMesh) {
      this.scene.remove(this.plateMesh);
      this.plateMesh.geometry.dispose();
      this.plateMesh.material.dispose();
      this.plateMesh = null;
    }

    const { positions, normals } = meshData;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    // 高さと法線に応じた自然な陰影コントラスト（頂点カラー）を付与して
    // 台座(2mm)と盛り上がり線画(4mm)の境界をどの角度からでも視認しやすくする
    const vertCount = positions.length / 3;
    const colors = new Float32Array(positions.length);
    for (let i = 0; i < vertCount; i++) {
      const z = positions[i * 3 + 2];
      const nz = normals[i * 3 + 2];
      let shade = 1.0;

      if (z >= 3.9 && nz > 0.5) {
        // 線画レリーフ上面 (z = 4.0mm): 明るく際立たせる
        shade = 1.06;
      } else if (z > 2.01 && Math.abs(nz) < 0.5) {
        // 線画レリーフ側面壁 (z = 2.0〜4.0mm): 立体感を強める微細なアンビエントオクルージョン
        shade = 0.82;
      } else if (Math.abs(z - 2.0) < 0.1 && nz > 0.5) {
        // 台座プレート上面 (z = 2.0mm)
        shade = 0.91;
      } else {
        // 台座側面・底面
        shade = 0.86;
      }

      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const preset = FILAMENT_PRESETS[this.currentFilament] || FILAMENT_PRESETS.silkgold;
    const material = new THREE.MeshStandardMaterial({
      color: preset.color,
      roughness: preset.roughness,
      metalness: preset.metalness,
      vertexColors: true,
      wireframe: this.isWireframe,
      side: THREE.FrontSide
    });

    this.plateMesh = new THREE.Mesh(geometry, material);
    this.plateMesh.castShadow = true;
    this.plateMesh.receiveShadow = true;
    this.scene.add(this.plateMesh);
  }

  /**
   * フィラメントカラー変更
   */
  setFilamentColor(filamentId) {
    if (!FILAMENT_PRESETS[filamentId]) return;
    this.currentFilament = filamentId;
    if (this.plateMesh) {
      const preset = FILAMENT_PRESETS[filamentId];
      this.plateMesh.material.color.setHex(preset.color);
      this.plateMesh.material.roughness = preset.roughness;
      this.plateMesh.material.metalness = preset.metalness;
      this.plateMesh.material.needsUpdate = true;
    }
  }

  /**
   * ワイヤーフレーム表示切り替え
   */
  setWireframe(enabled) {
    this.isWireframe = Boolean(enabled);
    if (this.plateMesh) {
      this.plateMesh.material.wireframe = this.isWireframe;
      this.plateMesh.material.needsUpdate = true;
    }
  }

  /**
   * 上面視点リセット
   */
  setTopView() {
    this.controls.target.set(0, 0, 2.0);
    // 真上から見下ろす（ジンバルロック回避のためYに極小オフセット）
    this.camera.position.set(0, -0.01, 82);
    this.camera.up.set(0, 0, 1);
    this.controls.update();
  }

  /**
   * 斜め視点リセット
   */
  setObliqueView() {
    this.controls.target.set(0, 0, 1.5);
    this.camera.position.set(18, -56, 52);
    this.camera.up.set(0, 0, 1);
    this.controls.update();
  }

  initResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      if (width > 0 && height > 0) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      }
    });
    this.resizeObserver.observe(this.container);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) {
      this.controls.update();
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
