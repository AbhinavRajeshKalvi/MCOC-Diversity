/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Champion art is served as small, compressed WebP copies resized by Next.js
    // and cached after the first request. Keep this list in sync with
    // OPTIMIZED_IMAGE_HOSTS in src/components/ChampionCard.tsx.
    remotePatterns: [{ protocol: "https", hostname: "mcocscout.com", pathname: "/champion_images/**" }],
    formats: ["image/webp"],
    imageSizes: [96, 128, 160, 200, 256],
    // Image URLs are versioned (?v=...), so cached copies can live a long time.
    minimumCacheTTL: 60 * 60 * 24 * 30
  },
  experimental: {
    // tesseract.js starts a worker thread from its own files, so it can't be bundled.
    serverComponentsExternalPackages: ["tesseract.js"],
    // Ship the bundled English OCR data with the analyze route (no CDN download).
    outputFileTracingIncludes: { "/api/roster/analyze": ["./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**"] }
  }
};

export default nextConfig;
