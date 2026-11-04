const http = require("http");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "../..");
const agentData = "C:/Users/thesa/.claude/projects/C--Work-IIT-KGP-Paper-1/agentdata";
const types = { ".html": "text/html", ".js": "text/javascript", ".ttf": "font/ttf", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gltf": "model/gltf+json" };

const bundle = () =>
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, process.env.LAB_ENTRY || "lab.ts")],
    bundle: true,
    format: "esm",
    target: "es2022",
    write: false,
    tsconfig: path.join(root, "tsconfig.json"),
    logLevel: "error",
    define: { "process.env.NODE_ENV": '"production"' },
  }).outputFiles[0].text;

const fileFor = (url) => {
  if (url === "/") return path.join(__dirname, "index.html");
  if (url.startsWith("/agent-state/")) return path.join(agentData, "state", path.basename(url));
  return path.join(root, "public", url);
};

http
  .createServer((request, response) => {
    const url = decodeURIComponent(request.url.split("?")[0]);
    if (url === "/lab.js") {
      response.setHeader("Content-Type", "text/javascript");
      try {
        response.end(bundle());
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
