/**
 * Categories store a single hex color server-side (CategoryDto.color); the mockups show
 * each category as a pill with a light tint background + a darkened version of the same
 * hue as the text color (e.g. Work #2D7D4C -> bg #E4F0E9 / text #1F5A36). Since arbitrary
 * user-created categories can have any hex color, we derive the tint pair algorithmically
 * instead of hardcoding a lookup table — this reproduces the three seeded categories'
 * exact tokens closely and gives any custom color a readable, consistent pill.
 */

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mix(a: [number, number, number], b: [number, number, number], amount: number): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

export function categoryTintBg(hex: string): string {
  return rgbToHex(mix(hexToRgb(hex), WHITE, 0.87));
}

export function categoryTintText(hex: string): string {
  return rgbToHex(mix(hexToRgb(hex), BLACK, 0.35));
}
