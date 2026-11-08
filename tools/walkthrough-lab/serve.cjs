const http = require("http");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "../..");
const agentData = "C:/Users/thesa/.claude/projects/C--Work-IIT-KGP-Paper-1/agentdata";
const types = { ".html": "text/html", ".js": "text/javascript", ".ttf": "font/ttf", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gltf": "model/gltf+json" };

const bundle = (entry) => {
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [path.join(__dirname, entry)],
    bundle: true,
    format: "esm",
    target: "es2022",
    write: false,
    outdir: path.join(__dirname, "bundle"),
    jsx: "automatic",
    external: ["/walkthrough/*"],
    tsconfig: path.join(root, "tsconfig.json"),
    logLevel: "error",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  return { js: outputFiles.find((file) => file.path.endsWith(".js")).text, css: outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "" };
};

const BUNDLED = { "/lab.js": () => bundle(process.env.LAB_ENTRY || "lab.ts").js, "/geometry-levels-worker.ts": () => bundle("../../src/features/walkthrough/infrastructure/geometry-levels-worker.ts").js, "/panel.js": () => bundle("panel.tsx").js, "/panel.css": () => bundle("panel.tsx").css };

const fileFor = (url) => {
  if (url === "/") return path.join(__dirname, "index.html");
  if (url === "/panel.html") return path.join(__dirname, "panel.html");
  if (url.startsWith("/agent-state/")) return path.join(agentData, "state", path.basename(url));
  if (url.startsWith("/study-photos/")) return path.join(root, "scripts", "content", "study-photos", path.basename(url));
  return path.join(root, "public", url);
};

http
  .createServer((request, response) => {
    const url = decodeURIComponent(request.url.split("?")[0]);
    if (BUNDLED[url]) {
      response.setHeader("Content-Type", url.endsWith(".css") ? "text/css" : "text/javascript");
      try {
        response.end(BUNDLED[url]());
      } catch (error) {
        response.statusCode = 500;
        response.end(String(error));
      }
      return;
    }
    const file = fileFor(url);
    fs.readFile(file, (error, data) => {
      if (error) {
        response.statusCode = 404;
        response.end("not found");
        return;
      }
      response.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
      response.end(data);
    });
  })
  .listen(+(process.env.LAB_PORT || 8940), "127.0.0.1", () => console.log("lab ready"));

setTimeout(() => process.exit(0), 6 * 3600e3);
