import * as THREE from "three";

export interface RenderView {
  readonly render: () => void;
  readonly resize: (width: number, height: number) => void;
  readonly prepare: (group: THREE.Object3D) => Promise<void>;
}

const VERTEX = "varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}";

export function createRenderView(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): RenderView {
  renderer.toneMapping = THREE.NoToneMapping;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const main = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const bloomA = new THREE.WebGLRenderTarget(size.x >> 2, size.y >> 2, { type: THREE.HalfFloatType });
  const bloomB = bloomA.clone();
  const passScene = new THREE.Scene();
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  triangle.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const threshold = pass("varying vec2 v;uniform sampler2D t;void main(){vec3 c=texture2D(t,v).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(1.05,1.65,l),1.);}", { t: { value: null } });
  const blur = pass(
    "varying vec2 v;uniform sampler2D t;uniform vec2 d;void main(){vec3 c=texture2D(t,v).rgb*.227;c+=(texture2D(t,v+d*1.38).rgb+texture2D(t,v-d*1.38).rgb)*.316;c+=(texture2D(t,v+d*3.23).rgb+texture2D(t,v-d*3.23).rgb)*.07;gl_FragColor=vec4(c,1.);}",
    { t: { value: null }, d: { value: new THREE.Vector2() } },
  );
  const composite = pass(
    "varying vec2 v;uniform sampler2D t,b;vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}void main(){vec3 c=texture2D(t,v).rgb+texture2D(b,v).rgb*.28;c=aces(c*.82);vec2 q=v-.5;c*=1.-.1*smoothstep(.28,.82,length(q*vec2(1.05,1.)));c=mix(12.92*c,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));gl_FragColor=vec4(c,1.);}",
    { t: { value: main.texture }, b: { value: null } },
  );
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
      blur.uniforms.t!.value = bloomA.texture;
      (blur.uniforms.d!.value as THREE.Vector2).set(1.4 / bloomA.width, 0);
      run(blur, bloomB);
      blur.uniforms.t!.value = bloomB.texture;
      (blur.uniforms.d!.value as THREE.Vector2).set(0, 1.4 / bloomA.height);
      run(blur, bloomA);
      composite.uniforms.b!.value = bloomA.texture;
      run(composite, null);
    },
    resize(width, height) {
      main.setSize(width, height);
      bloomA.setSize(width >> 2, height >> 2);
      bloomB.setSize(width >> 2, height >> 2);
    },
    async prepare(group) {
      renderer.setRenderTarget(main);
      const compiled = renderer.compileAsync(group, camera, scene);
      renderer.setRenderTarget(null);
      await compiled;
    },
  };
}

export function createRenderer(canvasHost: HTMLElement, width: number, height: number): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
