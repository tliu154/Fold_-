/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 / node-cron 是原生/服务端模块，禁止被 bundler 打包
  serverExternalPackages: ["better-sqlite3", "node-cron"],
};

export default nextConfig;
