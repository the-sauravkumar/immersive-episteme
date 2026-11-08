import * as THREE from "three";
import { BLOOM_CENTRE_WEIGHT, BLOOM_SIDE_TAPS, bloomBlurPasses } from "../domain/bloom-blur";
import { storeColourTexturesMutably } from "./mutable-colour-storage";

export const CAMERA_NEAR_METRES = 0.15;

export interface RenderView {
  readonly render: () => void;
  readonly resize: (topRatio: number) => void;
  readonly drawShare: (share: number) => void;
  readonly prepare: () => Promise<void>;
}

const VERTEX = "varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}";

const BLUR_SIDES = BLOOM_SIDE_TAPS.map(({ offset, weight }) => `c+=(texture2D(t,v+d*${offset.toFixed(6)}).rgb+texture2D(t,v-d*${offset.toFixed(6)}).rgb)*${weight.toFixed(6)};`).join("");
const BLUR = `varying vec2 v;uniform sampler2D t;uniform vec2 d;void main(){vec3 c=texture2D(t,v).rgb*${BLOOM_CENTRE_WEIGHT.toFixed(6)};${BLUR_SIDES}gl_FragColor=vec4(c,1.);}`;

const nextFrame = (): Promise<void> => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export const MAIN_TARGET_OPTIONS: THREE.RenderTargetOptions = { type: THREE.HalfFloatType, samples: 4 };

export function createRenderView(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, topRatio = renderer.getPixelRatio()): RenderView {
  renderer.toneMapping = THREE.NoToneMapping;
  let ratio = topRatio;
  const size = new THREE.Vector2();
  const fullSize = () => renderer.getSize(size).multiplyScalar(ratio).round();
  fullSize();
  const main = new THREE.WebGLRenderTarget(size.x, size.y, MAIN_TARGET_OPTIONS);
  main.scissorTest = true;
  let share = 1;
  const region = new THREE.Vector2(1, 1);
  const regionEdge = new THREE.Vector2(1, 1);
  const fitRegion = () => {
    const width = Math.max(1, Math.round(size.x * share));
    const height = Math.max(1, Math.round(size.y * share));
    main.viewport.set(0, 0, width, height);
    main.scissor.set(0, 0, width, height);
    region.set(width / size.x, height / size.y);
    regionEdge.set((width - 0.5) / size.x, (height - 0.5) / size.y);
  };
  const bloomA = new THREE.WebGLRenderTarget(size.x >> 2, size.y >> 2, { type: THREE.HalfFloatType });
  const bloomB = bloomA.clone();
  const passScene = new THREE.Scene();
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  triangle.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const regionUniforms = { region: { value: region }, regionEdge: { value: regionEdge } };
  const REGION = "uniform vec2 region,regionEdge;vec2 inRegion(vec2 p){return min(p*region,regionEdge);}";
  const threshold = pass(`varying vec2 v;uniform sampler2D t;${REGION}void main(){vec3 c=min(texture2D(t,inRegion(v)).rgb,vec3(2.5));float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(1.05,1.65,l),1.);}`, { t: { value: null }, ...regionUniforms });
  const blur = pass(BLUR, { t: { value: null }, d: { value: new THREE.Vector2() } });
  const step = blur.uniforms.d!.value as THREE.Vector2;
  const composite = pass(
    `varying vec2 v;uniform sampler2D t,b;${REGION}vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}void main(){vec3 c=texture2D(t,inRegion(v)).rgb+texture2D(b,v).rgb*.28;c=aces(c*.82);vec2 q=v-.5;c*=1.-.1*smoothstep(.28,.82,length(q*vec2(1.05,1.)));c=mix(12.92*c,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));gl_FragColor=vec4(c,1.);}`,
    { t: { value: main.texture }, b: { value: null }, ...regionUniforms },
  );
  fitRegion();
  const quad = new THREE.Mesh(triangle, threshold);
  quad.frustumCulled = false;
  passScene.add(quad);
  const run = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(passScene, passCamera);
  };
  return {
    render() {
      renderer.setRenderTarget(main);
      renderer.render(scene, camera);
      threshold.uniforms.t!.value = main.texture;
      run(threshold, bloomA);
      for (let passes = bloomBlurPasses(ratio); passes > 0; passes--) {
        blur.uniforms.t!.value = bloomA.texture;
        step.set(1 / bloomA.width, 0);
        run(blur, bloomB);
        blur.uniforms.t!.value = bloomB.texture;
        step.set(0, 1 / bloomA.height);
        run(blur, bloomA);
      }
      composite.uniforms.b!.value = bloomA.texture;
      run(composite, null);
    },
    resize(nextRatio) {
      ratio = nextRatio;
      fullSize();
      main.setSize(size.x, size.y);
      bloomA.setSize(size.x >> 2, size.y >> 2);
      bloomB.setSize(size.x >> 2, size.y >> 2);
      fitRegion();
    },
    async prepare() {
      const restore = renderer.getRenderTarget();
      const compiled = ([[threshold, bloomA], [blur, bloomB], [composite, null]] as const).map(([material, target]) => {
        const holder = new THREE.Mesh(triangle, material);
        renderer.setRenderTarget(target);
        return renderer.compileAsync(holder, passCamera);
      });
      renderer.setRenderTarget(restore);
      await Promise.all(compiled);
      threshold.uniforms.t!.value = main.texture;
      blur.uniforms.t!.value = bloomA.texture;
      composite.uniforms.b!.value = bloomB.texture;
      run(threshold, bloomA);
      run(blur, bloomB);
      run(composite, null);
      await nextFrame();
      renderer.setRenderTarget(main);
      renderer.clear();
      await nextFrame();
      const shadowsDue = renderer.shadowMap.needsUpdate;
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      renderer.shadowMap.needsUpdate = shadowsDue;
      renderer.setRenderTarget(restore);
    },
    drawShare(next) {
      share = Math.min(1, Math.max(0, next));
      fitRegion();
    },
  };
}

export function createRenderer(canvasHost: HTMLElement, width: number, height: number, scale: number): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: false, depth: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
  storeColourTexturesMutably(renderer.getContext() as WebGL2RenderingContext);
  renderer.setPixelRatio(scale);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  canvasHost.appendChild(renderer.domElement);
  return renderer;
}

export function addSun(scene: THREE.Scene, focus: THREE.Vector3): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(0xffe6c4, 3.6);
  light.position.set(focus.x - 30, 24, focus.z + 26);
  light.target.position.copy(focus);
  scene.add(light, light.target);
  light.castShadow = true;
  light.shadow.mapSize.set(4096, 4096);
  const camera = light.shadow.camera;
  camera.left = -34;
  camera.right = 34;
  camera.top = 34;
  camera.bottom = -34;
  camera.near = 1;
  camera.far = 120;
  light.shadow.bias = -0.00025;
  light.shadow.normalBias = 0.02;
  light.shadow.radius = 2.2;
  return light;
}
