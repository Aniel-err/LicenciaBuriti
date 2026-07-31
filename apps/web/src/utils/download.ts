export function saveBlob(blob: Blob, fileName: string) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error("O arquivo está vazio ou não está disponível para download.");
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
