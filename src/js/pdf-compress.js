// pdf-compress.js
// Engine de compressao de PDF (porta da logica original de optimize.js +
// images.js + index.js). Recomprime imagens embutidas em JPEG na qualidade
// escolhida e reserializa a estrutura de forma compacta. Funciona tanto dentro
// do Web Worker quanto na thread principal (fallback) — por isso importa as
// dependencias por URL completa de CDN jsDelivr (/+esm, versao fixa; import maps
// nao se aplicam a workers).

import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFNumber } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
import pako from "https://cdn.jsdelivr.net/npm/pako@2.1.0/+esm";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hasCanvas =
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap !== "undefined";

/**
 * Ponto de pausa/cancelamento cooperativo. Cede o event loop (para o worker
 * processar mensagens de pause/cancel), lanca em cancelamento e aguarda
 * enquanto estiver pausado.
 */
async function checkpoint(ctx) {
  await sleep(0);
  if (ctx && ctx.isCancelled && ctx.isCancelled()) throw new Error("TASK_CANCELLED");
  while (ctx && ctx.isPaused && ctx.isPaused()) await sleep(150);
  if (ctx && ctx.isCancelled && ctx.isCancelled()) throw new Error("TASK_CANCELLED");
}

// --------------------------- helpers de imagem ---------------------------
function filterIncludes(value, needle) {
  if (!value) return false;
  return value.toString().includes(needle);
}
function colorSpaceChannels(cs) {
  if (cs instanceof PDFName) {
    const s = cs.toString();
    if (s.includes("DeviceRGB")) return 3;
    if (s.includes("DeviceGray")) return 1;
  }
  return null;
}
function rawToRGBA(raw, width, height, channels) {
  const px = width * height;
  if (raw.length < px * channels) return null;
  const rgba = new Uint8ClampedArray(px * 4);
  if (channels === 3) {
    for (let i = 0; i < px; i++) {
      rgba[i * 4] = raw[i * 3];
      rgba[i * 4 + 1] = raw[i * 3 + 1];
      rgba[i * 4 + 2] = raw[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 0; i < px; i++) {
      const v = raw[i];
      rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
    }
  }
  return rgba;
}
async function decodeJpeg(bytes) {
  if (hasCanvas) {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const cctx = canvas.getContext("2d");
    cctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = cctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close?.();
    return { rgba: data, width, height };
  }
  const jpeg = (await import("https://cdn.jsdelivr.net/npm/jpeg-js@0.4.4/+esm")).default;
  const r = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { rgba: r.data, width: r.width, height: r.height };
}
async function encodeJpeg(rgba, width, height, quality) {
  const q = Math.max(1, Math.min(100, quality));
  if (hasCanvas) {
    const canvas = new OffscreenCanvas(width, height);
    const cctx = canvas.getContext("2d");
    cctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: q / 100 });
    return new Uint8Array(await blob.arrayBuffer());
  }
  const jpeg = (await import("https://cdn.jsdelivr.net/npm/jpeg-js@0.4.4/+esm")).default;
  const out = jpeg.encode({ data: rgba, width, height }, Math.round(q));
  return new Uint8Array(out.data);
}

/**
 * Recomprime as imagens elegiveis do documento (porta de images.js).
 * @returns {Promise<number>} imagens efetivamente substituidas.
 */
async function recompressImages(pdfDoc, quality, { ctx, onImage } = {}) {
  const context = pdfDoc.context;
  const candidates = [];
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    const subtype = dict.lookup(PDFName.of("Subtype"));
    if (!(subtype instanceof PDFName) || !subtype.toString().includes("Image")) continue;
    candidates.push([ref, obj]);
  }

  const count = candidates.length;
  if (onImage) onImage({ index: 0, count });

  let replaced = 0;
  let processed = 0;

  for (const [ref, obj] of candidates) {
    await checkpoint(ctx);
    try {
      const dict = obj.dict;
      if (dict.lookup(PDFName.of("SMask")) || dict.lookup(PDFName.of("Mask")) || dict.lookup(PDFName.of("ImageMask"))) continue;

      const widthObj = dict.lookup(PDFName.of("Width"));
      const heightObj = dict.lookup(PDFName.of("Height"));
      if (!(widthObj instanceof PDFNumber) || !(heightObj instanceof PDFNumber)) continue;
      const width = widthObj.asNumber();
      const height = heightObj.asNumber();
      if (!width || !height) continue;

      const filter = dict.get(PDFName.of("Filter"));
      const original = obj.contents;
      let decoded = null;

      if (filterIncludes(filter, "DCTDecode")) {
        decoded = await decodeJpeg(original);
      } else if (filterIncludes(filter, "FlateDecode")) {
        const bpc = dict.lookup(PDFName.of("BitsPerComponent"));
        if (!(bpc instanceof PDFNumber) || bpc.asNumber() !== 8) continue;
        const decodeParms = dict.lookup(PDFName.of("DecodeParms")) || dict.lookup(PDFName.of("DecodeParams"));
        if (decodeParms instanceof PDFDict) {
          const predictor = decodeParms.lookup(PDFName.of("Predictor"));
          if (predictor instanceof PDFNumber && predictor.asNumber() > 1) continue;
        }
        const channels = colorSpaceChannels(dict.lookup(PDFName.of("ColorSpace")));
        if (!channels) continue;
        let raw;
        try { raw = pako.inflate(original); } catch { continue; }
        const rgba = rawToRGBA(raw, width, height, channels);
        if (!rgba) continue;
        decoded = { rgba, width, height };
      } else {
        continue; // CCITT/JBIG2/JPX/indexada: preservar
      }

      if (!decoded) continue;
      const jpegBytes = await encodeJpeg(decoded.rgba, decoded.width, decoded.height, quality);
      if (jpegBytes.length >= original.length) continue;

      const newDict = dict.clone(context);
      newDict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      newDict.set(PDFName.of("BitsPerComponent"), context.obj(8));
      newDict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
      newDict.set(PDFName.of("Width"), context.obj(decoded.width));
      newDict.set(PDFName.of("Height"), context.obj(decoded.height));
      newDict.delete(PDFName.of("DecodeParms"));
      newDict.delete(PDFName.of("DecodeParams"));
      newDict.delete(PDFName.of("Length"));
      context.assign(ref, PDFRawStream.of(newDict, jpegBytes));
      replaced++;
    } catch (e) {
      if (e && e.message === "TASK_CANCELLED") throw e;
      // demais falhas: mantem a imagem original
    } finally {
      processed++;
      if (onImage) onImage({ index: processed, count });
    }
  }
  return replaced;
}

/** Uma passada: load + recompress + save compacto (porta de optimizeOnce). */
async function optimizeOnce(bytes, quality, { ctx, onImage } = {}) {
  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  await recompressImages(pdfDoc, quality, { ctx, onImage });
  return pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
}

/**
 * Comprime os bytes de um PDF em N passadas (porta de compressPDFMultipleTimes).
 * @returns {Promise<{ bytes: Uint8Array, initialSize: number, finalSize: number }>}
 */
export async function compressBytes(bytes, {
  quality = 50,
  passes = 2,
  qualityStep = 0.3,
  minQuality = 1,
  ctx,
  onPass,    // ({ pass, totalPasses, bytes })
  onImage,   // ({ pass, totalPasses, index, count })
} = {}) {
  let current = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const initialSize = current.length;
  let imageQuality = quality;
  let compressCount = 0;
  let previousFileSize = 0;

  while (compressCount < passes) {
    await checkpoint(ctx);
    const passNumber = compressCount + 1;
    const result = await optimizeOnce(current, imageQuality, {
      ctx,
      onImage: onImage ? (info) => onImage({ ...info, pass: passNumber, totalPasses: passes }) : undefined,
    });
    const currentFileSize = result.length;

    if (currentFileSize === previousFileSize) {
      if (imageQuality - qualityStep < minQuality) {
        previousFileSize = currentFileSize; // piso anti-loop: aceita a passada
      } else {
        imageQuality = Number((imageQuality - qualityStep).toFixed(4));
        continue; // repete sem contar a passada
      }
    } else {
      previousFileSize = currentFileSize;
    }

    current = result;
    compressCount++;
    if (onPass) onPass({ pass: compressCount, totalPasses: passes, bytes: currentFileSize });
  }

  return { bytes: current, initialSize, finalSize: current.length };
}

export { checkpoint };
