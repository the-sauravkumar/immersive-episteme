import * as THREE from "three";

const SCRUB_COLOURS = ["#6f7a44", "#5e6b3c", "#818a52", "#49552f"];

function scrubCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 4096;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  for (let bush = 0; bush < 120; bush++) {
    const x = Math.random() * canvas.width;
    const radius = canvas.height * (0.22 + Math.random() * 0.42);
    const y = canvas.height - radius * 0.45;
    for (let leaf = 0; leaf < radius * 46; leaf++) {
      const angle = Math.random() * 7;
      const reach = Math.sqrt(Math.random()) * radius;
      const leafY = y + Math.sin(angle) * reach * 0.72;
      if (leafY > canvas.height) continue;
      context.fillStyle = SCRUB_COLOURS[Math.floor(Math.random() * SCRUB_COLOURS.length)]!;
      context.globalAlpha = 0.5 + Math.random() * 0.5;
      context.beginPath();
      context.ellipse(x + Math.cos(angle) * reach * 1.3, leafY, 1 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3, 0, 7);
      context.fill();
    }
  }
  return canvas;
}

export function addHorizon(scene: THREE.Scene, earth: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  const groundTexture = earth.clone();
  groundTexture.repeat.set(300, 300);
  groundTexture.needsUpdate = true;
  const land = new THREE.Mesh(new THREE.CircleGeometry(880, 96), new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1, color: new THREE.Color(2.5, 1.62, 1.22) }));
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.04;
  land.receiveShadow = false;
  group.add(land);
  const texture = new THREE.CanvasTexture(scrubCanvas());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.25, alphaToCoverage: true, side: THREE.DoubleSide });
  const ring = 18;
  for (const [radius, height] of [
    [130, 9],
    [210, 16],
  ] as const) {
    for (let i = 0; i < ring; i++) {
      const angle = (i / ring) * Math.PI * 2 + radius;
      const width = 2 * radius * Math.tan(Math.PI / ring) * 1.02;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
      strip.position.set(Math.cos(angle) * radius, height / 2 - 0.5, Math.sin(angle) * radius);
      strip.rotation.y = -angle - Math.PI / 2;
      group.add(strip);
    }
  }
  scene.add(group);
  return group;
}
