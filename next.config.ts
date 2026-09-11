import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Cada chamada de upload envia exatamente 1 arquivo (ver
      // src/app/files/UploadForm.tsx) — o limite padrão de 1 MB do Next.js
      // existe para evitar abuso (Prompt Mestre item 25/26), então ele é
      // elevado só o suficiente para 1 arquivo de MAX_FILE_SIZE_BYTES
      // (src/lib/storage/constants.ts, hoje 20 MiB) + margem para o
      // overhead do multipart/form-data, nunca para o lote inteiro.
      bodySizeLimit: "21mb",
    },
  },
};

export default nextConfig;
