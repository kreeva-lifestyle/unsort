declare module 'https://esm.sh/jpeg-js@0.4.4' {
  const jpeg: {
    decode(data: Uint8Array, opts?: { useTArray?: boolean; formatAsRGBA?: boolean; tolerantDecoding?: boolean; maxResolutionInMP?: number; maxMemoryUsageInMB?: number }): { data: Uint8Array; width: number; height: number };
  };
  export default jpeg;
}
