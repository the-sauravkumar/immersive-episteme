import * as THREE from "three";

export const PIXEL_FOOTPRINT_UNIFORM = "uniform float footprintViewHeight;";
export const pixelMetresAt = (depth: string): string => `(2.0 * max(${depth}, 0.0) / (projectionMatrix[1][1] * footprintViewHeight))`;

const drawingBuffer = new THREE.Vector2();

const tracked = new WeakMap<THREE.Material, { value: number }>();

export function trackPixelFootprint(material: THREE.Material): { value: number } {
  const known = tracked.get(material);
  if (known) return known;
  const viewHeight = { value: 768 };
  tracked.set(material, viewHeight);
  const earlier = material.onBeforeRender.bind(material);
  material.onBeforeRender = (renderer, scene, camera, geometry, object, group) => {
    earlier(renderer, scene, camera, geometry, object, group);
    const target = renderer.getRenderTarget();
    viewHeight.value = target ? target.height : renderer.getDrawingBufferSize(drawingBuffer).y;
  };
  return viewHeight;
}
