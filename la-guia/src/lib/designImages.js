import { supabase } from './supabase.js';

export function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

export async function urlToBase64(url) {
  const blob = await fetch(url).then(r => r.blob());
  return { blob, base64: await blobToBase64(blob) };
}

export function base64ToDataUrl(base64, mimeType = 'image/png') {
  return `data:${mimeType};base64,${base64}`;
}

export async function base64ToBlob(base64, mimeType = 'image/png') {
  const res = await fetch(base64ToDataUrl(base64, mimeType));
  return res.blob();
}

// The rolling design_versions row that stores the full layered Photopea
// document (PSD) — the design's working file. Display surfaces (previews,
// history, activity) must SKIP rows with this label; the canvas-restore path
// PREFERS it so reopening a design brings the whole layer stack back.
export const PSD_VERSION_LABEL = 'Working file (PSD)';

// Uploads the layered working file. Timestamped name on purpose: public URLs
// are CDN-cached, so reusing one filename would serve stale bytes.
export async function uploadDesignPsd(blob, productId) {
  const fileName = `${productId}-working-${Date.now()}.psd`;
  const { error } = await supabase.storage.from('mockups').upload(fileName, blob, { contentType: 'image/vnd.adobe.photoshop', upsert: true });
  if (error) throw new Error('PSD upload failed: ' + error.message);
  const { data: { publicUrl } } = supabase.storage.from('mockups').getPublicUrl(fileName);
  return publicUrl;
}

// Uploads a generated/edited image to the shared `mockups` bucket (same one
// Design Studio snapshots and tech pack images already use) and returns its
// public URL for storing on a design_versions row, moodboard entry, etc.
export async function uploadDesignImage(blob, productId, prefix = 'ai') {
  const fileName = `${productId}-${prefix}-${Date.now()}.png`;
  const { error } = await supabase.storage.from('mockups').upload(fileName, blob, { contentType: 'image/png', upsert: true });
  if (error) throw new Error('Image upload failed: ' + error.message);
  const { data: { publicUrl } } = supabase.storage.from('mockups').getPublicUrl(fileName);
  return publicUrl;
}
