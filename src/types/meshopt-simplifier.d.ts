declare module "three/examples/jsm/libs/meshopt_simplifier.module.js" {
  type SimplifyFlag = "LockBorder" | "Sparse" | "ErrorAbsolute" | "Prune" | "Regularize" | "Permissive";
  export const MeshoptSimplifier: {
    readonly ready: Promise<void>;
    readonly simplifyWithAttributes: (
      indices: Uint32Array,
      vertexPositions: Float32Array,
      vertexPositionsStride: number,
      vertexAttributes: Float32Array,
      vertexAttributesStride: number,
      attributeWeights: number[],
      vertexLock: Uint8Array | null,
      targetIndexCount: number,
      targetError: number,
      flags?: SimplifyFlag[],
    ) => [Uint32Array, number];
  };
}
