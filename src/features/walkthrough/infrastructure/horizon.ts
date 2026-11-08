import * as THREE from "three";

const LAND_BELOW_THE_WELLS = -0.9;

const HILL_REPEATS = 18;

export function addHorizon(scene: THREE.Scene, earth: THREE.Texture, scrub: THREE.Texture): THREE.Group {
  const hills = new THREE.Group();
  const groundTexture = earth.clone();
  groundTexture.repeat.set(300, 300);
  groundTexture.needsUpdate = true;
  const land = new THREE.Mesh(new THREE.CircleGeometry(880, 96), new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1, color: new THREE.Color(2.5, 1.62, 1.22) }));
  land.rotation.x = -Math.PI / 2;
  land.position.y = LAND_BELOW_THE_WELLS;
  land.receiveShadow = false;
  scene.add(land);
  const material = new THREE.MeshBasicMaterial({ map: scrub, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  scrub.repeat.x = HILL_REPEATS;
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
