// 巴御前 -TOMOE- 3Dアセット（プリミティブで組むプロシージャルモデル）
// buildTomoe(THREE) → THREE.Group（高さ約2.1、+Z が正面）
// buildFx(THREE)    → { group, update(t) } 桜の花びら＋火の粉
// Remotion（src/）と単体ビューア（public/tomoe-demo/model.html）の両方から使う

export function makeMaterials(THREE) {
  const std = (color, roughness, metalness, extra = {}) =>
    new THREE.MeshStandardMaterial({color, roughness, metalness, ...extra});
  return {
    vermilion: std(0xc8302a, 0.35, 0.25),
    vermilionDark: std(0x7e1712, 0.45, 0.2),
    silver: std(0xdfe3ea, 0.22, 0.9),
    silverDim: std(0x9aa0b3, 0.35, 0.8),
    gold: std(0xc9a45a, 0.28, 0.95),
    lacquer: std(0x141418, 0.3, 0.3),
    skin: std(0xf6e3d8, 0.6, 0.0),
    hair: std(0x0b0b12, 0.42, 0.15),
    cloth: std(0xf4f2ee, 0.8, 0.0, {side: THREE.DoubleSide}),
    hakama: std(0x1d1a29, 0.8, 0.05),
    lace: std(0xeef0f6, 0.5, 0.3),
    wood: std(0x4a2a1a, 0.5, 0.1),
    eye: std(0x120d10, 0.2, 0.0),
    lip: std(0xc0504a, 0.5, 0.0),
    glow: new THREE.MeshBasicMaterial({color: 0xff5a3c, transparent: true, opacity: 0.85}),
  };
}

// 小札（こざね）の段を並べたパネル：rows段、幅w、朱と白銀の威（おどし）を交互に
function lamellarPanel(THREE, M, {w, rows, rowH = 0.07, depth = 0.03, curve = 0}) {
  const g = new THREE.Group();
  for (let i = 0; i < rows; i++) {
    const y = -i * rowH;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(w, rowH * 0.78, depth), M.vermilion);
    plate.position.set(0, y, i * curve);
    g.add(plate);
    // 威糸（白銀の横帯）
    const lace = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, rowH * 0.18, depth * 1.1), M.lace);
    lace.position.set(0, y - rowH * 0.45, i * curve);
    g.add(lace);
    // 縦の縅（点々）
    for (let k = -3; k <= 3; k++) {
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.012, rowH * 0.5, depth * 1.2), M.silver);
      dot.position.set((k / 7) * w, y, i * curve);
      g.add(dot);
    }
  }
  // 金の縁取り（最下段）
  const hem = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.018, depth * 1.3), M.gold);
  hem.position.set(0, -(rows - 0.5) * rowH, (rows - 1) * curve);
  g.add(hem);
  return g;
}

export function buildTomoe(THREE) {
  const M = makeMaterials(THREE);
  const root = new THREE.Group();
  root.name = 'Tomoe';
  const add = (parent, geo, mat, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // ── 脚（袴・臑当・足）
  for (const s of [-1, 1]) {
    add(root, new THREE.CylinderGeometry(0.11, 0.15, 0.62, 16), M.hakama, [s * 0.12, 0.42, 0]);
    // 臑当（すねあて）：朱の縦板3枚＋金縁
    for (let k = -1; k <= 1; k++) {
      add(root, new THREE.BoxGeometry(0.05, 0.3, 0.02), M.vermilion, [s * 0.12 + k * 0.055, 0.25, 0.13], [0.08, 0, 0]);
    }
    add(root, new THREE.BoxGeometry(0.18, 0.02, 0.03), M.gold, [s * 0.12, 0.4, 0.125]);
    // 足（足袋＋草鞋）
    add(root, new THREE.BoxGeometry(0.12, 0.07, 0.24), M.cloth, [s * 0.12, 0.05, 0.04]);
    add(root, new THREE.BoxGeometry(0.14, 0.025, 0.27), M.wood, [s * 0.12, 0.012, 0.04]);
  }

  // ── 草摺（くさずり）：腰回り4枚
  const kusazuri = new THREE.Group();
  kusazuri.position.y = 1.02;
  root.add(kusazuri);
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((a, i) => {
    const p = lamellarPanel(THREE, M, {w: i % 2 ? 0.3 : 0.38, rows: 5, rowH: 0.075, curve: 0.012});
    const holder = new THREE.Group();
    holder.rotation.y = a;
    p.position.set(0, 0, 0.26);
    p.rotation.x = -0.12;
    holder.add(p);
    kusazuri.add(holder);
  });

  // ── 胴（白銀の胴に朱の帯）
  add(root, new THREE.CylinderGeometry(0.25, 0.23, 0.46, 24), M.silver, [0, 1.28, 0]);
  for (let i = 0; i < 4; i++) {
    add(root, new THREE.TorusGeometry(0.245 - i * 0.004, 0.012, 8, 32), M.vermilion, [0, 1.12 + i * 0.1, 0], [Math.PI / 2, 0, 0]);
  }
  // 胸板（金縁の弦走）
  add(root, new THREE.BoxGeometry(0.3, 0.16, 0.04), M.vermilion, [0, 1.44, 0.22], [-0.15, 0, 0]);
  add(root, new THREE.BoxGeometry(0.32, 0.02, 0.05), M.gold, [0, 1.52, 0.235], [-0.15, 0, 0]);
  // 腰の白帯
  add(root, new THREE.TorusGeometry(0.24, 0.035, 10, 32), M.cloth, [0, 1.06, 0], [Math.PI / 2, 0, 0]);

  // ── 大袖（おおそで）
  for (const s of [-1, 1]) {
    const sode = lamellarPanel(THREE, M, {w: 0.24, rows: 6, rowH: 0.07, curve: 0.006});
    sode.position.set(s * 0.36, 1.58, 0.0);
    sode.rotation.set(0, s * Math.PI / 2, s * 0.18);
    root.add(sode);
    add(root, new THREE.SphereGeometry(0.09, 16, 12), M.silver, [s * 0.3, 1.55, 0]);
  }

  // ── 腕（籠手）
  const armL = new THREE.Group();
  armL.position.set(-0.33, 1.5, 0.02);
  armL.rotation.set(-0.9, 0, 0.35);
  root.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.33, 1.5, 0.02);
  armR.rotation.set(-1.1, 0, -0.25);
  root.add(armR);
  for (const arm of [armL, armR]) {
    add(arm, new THREE.CylinderGeometry(0.065, 0.055, 0.5, 12), M.vermilionDark, [0, -0.25, 0]);
    add(arm, new THREE.CylinderGeometry(0.058, 0.05, 0.3, 12), M.silverDim, [0, -0.4, 0]);
    add(arm, new THREE.SphereGeometry(0.055, 12, 10), M.skin, [0, -0.55, 0]);
  }

  // ── 首・頭
  add(root, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), M.skin, [0, 1.62, 0]);
  const head = new THREE.Group();
  head.position.set(0, 1.82, 0);
  root.add(head);
  add(head, new THREE.SphereGeometry(0.17, 32, 24), M.skin, [0, 0, 0], [0, 0, 0]).scale.set(0.92, 1.05, 0.95);
  // 目・眉・口
  for (const s of [-1, 1]) {
    // アニメ調の大きな瞳＋ハイライト
    add(head, new THREE.SphereGeometry(0.03, 16, 12), M.eye, [s * 0.058, -0.005, 0.145]).scale.set(1.0, 1.35, 0.45);
    add(head, new THREE.SphereGeometry(0.008, 8, 6), M.lace, [s * 0.052, 0.012, 0.158]);
    add(head, new THREE.BoxGeometry(0.065, 0.011, 0.01), M.hair, [s * 0.06, 0.05, 0.15], [0, 0, s * -0.25]);
  }
  add(head, new THREE.BoxGeometry(0.035, 0.008, 0.01), M.lip, [0, -0.075, 0.148]);
  // 髪：頭頂のキャップ＋前髪＋腰まで届く長い黒髪
  add(head, new THREE.SphereGeometry(0.182, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), M.hair, [0, 0.025, -0.01]);
  for (let i = -3; i <= 3; i++) {
    add(head, new THREE.ConeGeometry(0.03, 0.14, 6), M.hair, [i * 0.035, 0.08, 0.15], [Math.PI + 0.25, 0, i * 0.05]);
  }
  for (let i = 0; i < 17; i++) {
    const a = (-0.95 + (i / 16) * 1.9) * Math.PI * 0.55 + Math.PI; // 背面側の扇
    const len = 0.9 + Math.sin(i * 1.7) * 0.08;
    const strand = add(root, new THREE.CylinderGeometry(0.035, 0.008, len, 6), M.hair,
      [Math.sin(a) * 0.17, 1.86 - len / 2, Math.cos(a) * 0.17 - 0.03], [-0.12, 0, Math.sin(a) * 0.12]);
    strand.scale.z = 0.55;
  }
  // 白鉢巻＋銀の額当て＋結び目のリボン
  add(head, new THREE.TorusGeometry(0.176, 0.022, 8, 40), M.cloth, [0, 0.07, 0], [Math.PI / 2 - 0.12, 0, 0]);
  add(head, new THREE.BoxGeometry(0.1, 0.045, 0.012), M.silver, [0, 0.085, 0.17], [-0.1, 0, 0]);
  add(head, new THREE.SphereGeometry(0.012, 8, 6), M.gold, [0, 0.085, 0.178]);
  for (const s of [-1, 1]) {
    add(head, new THREE.PlaneGeometry(0.07, 0.34), M.cloth, [s * 0.04, -0.08, -0.2], [0.35, s * 0.25, s * 0.25]);
  }

  // ── 長刀（大太刀）：右手に持たせる
  const blade = new THREE.Group();
  blade.name = 'Odachi';
  blade.position.set(0.42, 1.0, 0.36);
  blade.rotation.set(0.25, 0, -0.55);
  root.add(blade);
  add(blade, new THREE.CylinderGeometry(0.018, 0.02, 1.2, 10), M.lacquer, [0, 0, 0]);
  for (let i = 0; i < 6; i++) add(blade, new THREE.TorusGeometry(0.021, 0.004, 6, 12), M.gold, [0, -0.5 + i * 0.2, 0], [Math.PI / 2, 0, 0]);
  add(blade, new THREE.TorusGeometry(0.04, 0.009, 8, 20), M.gold, [0, 0.61, 0], [Math.PI / 2, 0, 0]);
  // 反りのある刃（Shape を押し出し）
  const bs = new THREE.Shape();
  bs.moveTo(-0.018, 0);
  bs.quadraticCurveTo(-0.02, 0.45, 0.06, 0.9);
  bs.lineTo(0.035, 0.9);
  bs.quadraticCurveTo(0.0, 0.5, 0.018, 0);
  bs.lineTo(-0.018, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bs, {depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1});
  add(blade, bladeGeo, M.silver, [0, 0.63, -0.004]).scale.set(1.7, 1.25, 1);

  // ── 背中：和弓と矢筒
  const back = new THREE.Group();
  back.position.set(0, 1.2, -0.3);
  back.rotation.z = 0.35;
  root.add(back);
  const bowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1.0, 0.02), new THREE.Vector3(0, -0.5, -0.1), new THREE.Vector3(0, 0.1, -0.14),
    new THREE.Vector3(0, 0.7, -0.08), new THREE.Vector3(0, 1.15, 0.04),
  ]);
  add(back, new THREE.TubeGeometry(bowCurve, 64, 0.016, 8, false), M.lacquer);
  for (let i = 0; i < 9; i++) {
    const p = bowCurve.getPoint(0.08 + i * 0.105);
    add(back, new THREE.TorusGeometry(0.019, 0.004, 6, 12), M.vermilion, [p.x, p.y, p.z], [Math.PI / 2, 0, 0]);
  }
  const s0 = bowCurve.getPoint(0), s1 = bowCurve.getPoint(1);
  const stringGeo = new THREE.CylinderGeometry(0.003, 0.003, s0.distanceTo(s1), 4);
  add(back, stringGeo, M.lace, [(s0.x + s1.x) / 2, (s0.y + s1.y) / 2, (s0.z + s1.z) / 2 + 0.02]);
  // 矢筒（やづつ）
  const quiver = new THREE.Group();
  quiver.position.set(0.14, 1.25, -0.28);
  quiver.rotation.z = -0.4;
  root.add(quiver);
  add(quiver, new THREE.CylinderGeometry(0.07, 0.06, 0.6, 14), M.wood);
  add(quiver, new THREE.TorusGeometry(0.071, 0.01, 6, 16), M.vermilion, [0, 0.15, 0], [Math.PI / 2, 0, 0]);
  add(quiver, new THREE.TorusGeometry(0.066, 0.01, 6, 16), M.vermilion, [0, -0.15, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.035, z = Math.sin(a) * 0.035;
    add(quiver, new THREE.CylinderGeometry(0.005, 0.005, 0.3, 4), M.wood, [x, 0.42, z]);
    add(quiver, new THREE.PlaneGeometry(0.03, 0.09), M.cloth, [x, 0.52, z], [0, a, 0]);
  }

  // ── 台座（光る朱の輪）
  add(root, new THREE.CylinderGeometry(0.75, 0.8, 0.05, 64), M.lacquer, [0, -0.025, 0]).receiveShadow = true;
  add(root, new THREE.TorusGeometry(0.78, 0.008, 8, 96), M.glow, [0, 0.005, 0], [Math.PI / 2, 0, 0]);

  return root;
}

// 桜の花びら＋火の粉。update(t) は秒単位の時刻で決定的に位置を計算（Remotion向け）
export function buildFx(THREE, {petals = 160, embers = 260, radius = 2.2} = {}) {
  const group = new THREE.Group();
  const rand = (i, k) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const petalGeo = new THREE.PlaneGeometry(0.045, 0.03);
  const petalMat = new THREE.MeshBasicMaterial({color: 0xf5b8c9, side: THREE.DoubleSide, transparent: true, opacity: 0.9});
  const petalMesh = new THREE.InstancedMesh(petalGeo, petalMat, petals);
  group.add(petalMesh);
  const emberGeo = new THREE.BufferGeometry();
  const emberPos = new Float32Array(embers * 3);
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({color: 0xff8a3d, size: 0.03, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false});
  group.add(new THREE.Points(emberGeo, emberMat));
  const dummy = new THREE.Object3D();
  const update = (t) => {
    for (let i = 0; i < petals; i++) {
      const r = 0.6 + rand(i, 1) * radius;
      const a = rand(i, 2) * Math.PI * 2 + t * (0.25 + rand(i, 3) * 0.3);
      const h = 2.6 - ((t * (0.18 + rand(i, 4) * 0.2) + rand(i, 5) * 3) % 3);
      dummy.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
      dummy.rotation.set(t * 2 + i, t * 1.3 + i * 0.5, t + i);
      dummy.updateMatrix();
      petalMesh.setMatrixAt(i, dummy.matrix);
    }
    petalMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < embers; i++) {
      const r = 0.3 + rand(i, 6) * radius;
      const a = rand(i, 7) * Math.PI * 2 + t * 0.15;
      const h = ((t * (0.25 + rand(i, 8) * 0.5) + rand(i, 9) * 3) % 3) - 0.1;
      emberPos[i * 3] = Math.cos(a) * r + Math.sin(t * 2 + i) * 0.03;
      emberPos[i * 3 + 1] = h;
      emberPos[i * 3 + 2] = Math.sin(a) * r;
    }
    emberGeo.attributes.position.needsUpdate = true;
  };
  update(0);
  return {group, update};
}
