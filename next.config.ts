import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse / pdfjs-dist load `pdf.worker.mjs` at runtime via dynamic import.
  // When Next bundles them through webpack the worker path is rewritten into
  // `.next/dev/server/chunks/` where the file does not exist, breaking PDF
  // text extraction for tax document uploads. Leave both packages alone in
  // node_modules so pdfjs can resolve its own worker.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
