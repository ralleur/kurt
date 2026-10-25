// SPDX-License-Identifier: AGPL-3.0-only
// The optional full-resolution build never overwrites the canonical iOS atlas.
export const cell = process.env.KURT_LARGE_ARTWORK === '1' ? 512 : 256;
export const costume = process.env.KURT_COSTUME || "";
export function atlasDirectory(stage) {
  if (costume) return new URL(`../../.build/costumes/${cell}/${costume}/${stage}/`, import.meta.url).pathname;
  return new URL(cell === 512 ? `../../.build/artwork-512/${stage}/` : `../${stage}/ios-assets/`, import.meta.url).pathname;
}
