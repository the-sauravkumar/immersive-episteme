import * as THREE from "three";

const LAND_BELOW_THE_WELLS = -0.9;

const HILL_REPEATS = 18;
const SCRUB_COLOURS = ["#6f7a44", "#5e6b3c", "#818a52", "#49552f"];

function scrubCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 4096;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  for (let bush = 0; bush < 120; bush++) {
    const centre = Math.random() * canvas.width;
    const radius = canvas.height * (0.22 + Math.random() * 0.42);
    const y = canvas.height - radius * 0.45;
    for (let leaf = 0; leaf < radius * 46; leaf++) {
      const angle = Math.random() * 7;
      const reach = Math.sqrt(Math.random()) * radius;
      const leafY = y + Math.sin(angle) * reach * 0.72;
      if (leafY > canvas.height) continue;
      context.fillStyle = SCRUB_COLOURS[Math.floor(Math.random() * SCRUB_COLOURS.length)]!;
      context.globalAlpha = 0.5 + Math.random() * 0.5;
      const leafX = centre + Math.cos(angle) * reach * 1.3;
      const [wide, tall, turn] = [1 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3];
      for (const wrap of [-canvas.width, 0, canvas.width]) {
        context.beginPath();
        context.ellipse(leafX + wrap, leafY, wide, tall, turn, 0, 7);
        context.fill();
      }
    }
  }
  return canvas;
}

export function addHorizon(scene: THREE.Scene, earth: THREE.Texture): THREE.Group {
  const hills = new THREE.Group();
  const groundTexture = earth.clone();
  groundTexture.repeat.set(300, 300);
  groundTexture.needsUpdate = true;
  const land = new THREE.Mesh(new THREE.CircleGeometry(880, 96), new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1, color: new THREE.Color(2.5, 1.62, 1.22) }));
  land.rotation.x = -Math.PI / 2;
  land.position.y = LAND_BELOW_THE_WELLS;
  land.receiveShadow = false;
  scene.add(land);
  const soft = document.createElement("canvas");
  soft.width = 4096;
  soft.height = 512;
  const softContext = soft.getContext("2d")!;
  softContext.filter = "blur(5px)";
  const scrub = scrubCanvas();
  for (const wrap of [-soft.width, 0, soft.width]) softContext.drawImage(scrub, wrap, 0);
  const texture = new THREE.CanvasTexture(soft);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  texture.repeat.x = HILL_REPEATS;
  for (const [radius, height] of [
    [130, 9],
    [210, 16],
  ] as const) {
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 96, 1, true, radius), material);
    belt.position.y = height / 2 + LAND_BELOW_THE_WELLS;
    hills.add(belt);
  }
  scene.add(hills);
  return hills;
}
