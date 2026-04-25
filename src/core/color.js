// color.js - Utilities for finding the dominant color of a bounding box

const _canvas = document.createElement('canvas');
const _ctx = _canvas.getContext('2d', { willReadFrequently: true });

// Basic Euclidean distance in RGB space to classify colors
const BASE_COLORS = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
};

/**
 * Extracts the average RGB color from the center of a bounding box in the video.
 * @param {HTMLVideoElement} videoEl
 * @param {Object} box {x, y, w, h} normalized coords 0..1
 * @returns {Array} [r, g, b]
 */
function getCenterColor(videoEl, box) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  
  if (!vw || !vh) return [0, 0, 0];

  // Sample a 10x10 patch from the exact center of the bounding box
  const pxX = Math.round((box.x + box.w / 2) * vw);
  const pxY = Math.round((box.y + box.h / 2) * vh);

  const patchSize = 10;
  const sx = Math.max(0, pxX - patchSize / 2);
  const sy = Math.max(0, pxY - patchSize / 2);
  const sWidth = Math.min(vw - sx, patchSize);
  const sHeight = Math.min(vh - sy, patchSize);

  _canvas.width = patchSize;
  _canvas.height = patchSize;
  
  _ctx.drawImage(videoEl, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
  const imgData = _ctx.getImageData(0, 0, sWidth, sHeight);
  const data = imgData.data;

  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i+1];
    b += data[i+2];
    count++;
  }
  
  if (count === 0) return [0, 0, 0];
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function colorDistance(c1, c2) {
  return Math.sqrt(
    Math.pow(c1[0] - c2[0], 2) +
    Math.pow(c1[1] - c2[1], 2) +
    Math.pow(c1[2] - c2[2], 2)
  );
}

/**
 * Given an [r, g, b] array, returns the closest matching color string.
 */
export function classifyColor(rgb) {
  let bestColor = null;
  let minDistance = Infinity;

  for (const [name, value] of Object.entries(BASE_COLORS)) {
    const dist = colorDistance(rgb, value);
    if (dist < minDistance) {
      minDistance = dist;
      bestColor = name;
    }
  }

  // If the color is too dark or washed out, the distance might still find a match,
  // but let's assume it's good enough for a simple game heuristic.
  return bestColor;
}

export function detectObjectColor(videoEl, box) {
  const rgb = getCenterColor(videoEl, box);
  return classifyColor(rgb);
}
