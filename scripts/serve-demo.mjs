// Máy chủ tĩnh nhỏ cho bản demo đã xuất (out/), phục vụ dưới /DAIVIETCRM như GitHub Pages. Chỉ dùng để kiểm thử.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const ROOT = join(process.cwd(), "out");
const BASE = "/DAIVIETCRM";
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(302, { location: `${BASE}/` }).end();
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname.slice(BASE.length)) || "/");
  if (path.includes("..")) return res.writeHead(400).end();
  let file = join(ROOT, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    createReadStream(join(ROOT, "404.html")).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`Demo: http://127.0.0.1:${PORT}${BASE}/`));
