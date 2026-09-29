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
  }
};

export default nextConfig;
