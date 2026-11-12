// The one outside library of this function: a JPEG decoder in plain
// JavaScript (no native code, nothing fetched at run time). Kept in its own
// file so the rest can be tested in Node without it.
// Limits are set here as well as in work.ts: a photo that would need more
// memory than the function has is refused by the decoder itself.
import jpeg from 'https://esm.sh/jpeg-js@0.4.4';
import type { Decode } from './work.ts';

export const decodeJpeg: Decode = (bytes) => {
  const d = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true, maxResolutionInMP: 8, maxMemoryUsageInMB: 160 });
  return { data: d.data, width: d.width, height: d.height };
};
