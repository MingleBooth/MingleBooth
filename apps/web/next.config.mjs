/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@minglebooth/shared',
    '@minglebooth/camera',
    '@minglebooth/template-engine',
    '@minglebooth/photo-engine',
    '@minglebooth/license',
    '@minglebooth/sync-engine',
    '@minglebooth/event-core',
    '@minglebooth/gif-engine',
  ],
};

export default nextConfig;
