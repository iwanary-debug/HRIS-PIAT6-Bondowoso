/**
 * Client helpers for the storage abstraction: upload a File into Convex
 * storage and return the storageId to register with `lifecycle.uploadDocument`.
 * (Document registration itself runs through `useMutation(api.lifecycle.uploadDocument)`
 * so permission checks and audit stay server-side.)
 */

import { getStoredToken } from "@/lib/convex";
import { convexApiUrl } from "@/lib/backendUrl";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export function validateUpload(file: File): string | null {
  if (file.size === 0) return "Berkas kosong.";
  if (file.size > MAX_UPLOAD_BYTES) return "Ukuran berkas maksimal 15 MB.";
  if (ACCEPTED_MIME.length > 0 && file.type && !ACCEPTED_MIME.includes(file.type)) {
    return "Format berkas tidak didukung (gunakan PDF, gambar, atau Office).";
  }
  return null;
}

export async function uploadFile(file: File): Promise<{ storageId: string }> {
  const url = await fetchUploadUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Unggah gagal (${response.status}). Coba lagi.`);
  }
  const result = (await response.json()) as { storageId: string };
  if (!result?.storageId) throw new Error("Unggah gagal — respons tidak dikenal.");
  return result;
}

async function fetchUploadUrl(): Promise<string> {
  const token = getStoredToken();
  // Call the mutation over HTTP so a plain File can be POSTed to the URL.
  const response = await fetch(convexApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "storage:generateUploadUrl",
      format: "json",
      args: {},
      authorization: token ? `Bearer ${token}` : undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(`Tidak dapat menyiapkan unggahan (${response.status}).`);
  }
  const payload = (await response.json()) as { status: string; value?: string };
  if (payload.status !== "success" || !payload.value) {
    throw new Error("Tidak dapat menyiapkan unggahan.");
  }
  return payload.value;
}
