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
