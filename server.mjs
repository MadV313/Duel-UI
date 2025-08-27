// server.mjs — Duel-UI
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import mime from "mime-types";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Boot banner so you can see exactly what is running
console.log("BOOT env UI:", {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  PWD: process.cwd(),
  FILES: (() => { try { return fs.readdirSync("."); } catch { return []; } })(),
});

const app  = express();                 // <-- only defined once
const PORT = process.env.PORT || 5173;

// Prefer a build folder if present; otherwise serve repo root
const DIST  = path.join(__dirname, "dist");
const ROOT  = fs.existsSync(DIST) ? DIST : __dirname;
const INDEX = path.join(ROOT, "index.html");

// Minimal request log (helps when debugging 502s)
app.use((req, _res, next) => { console.log(`➡️  ${req.method} ${req.url}`); next(); });

// Healthcheck Railway can hit
app.get("/health", (_req, res) => res.type("text/plain").send("ok"));

// Content-type + light caching for static assets
app.use((req, res, next) => {
  const type = mime.lookup(req.path);
  if (type) res.type(type);
  if (/\.(png|jpe?g|gif|webp|svg|css|js|woff2?)$/i.test(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=600");
  }
  next();
});

// Serve static files
app.use(express.static(ROOT, { extensions: ["html"] }));

// SPA fallback to index.html
app.get("*", (_req, res) => {
  if (!fs.existsSync(INDEX)) {
    return res.status(500).type("text/plain").send(`index.html not found in ${ROOT}`);
  }
  res.sendFile(INDEX);
});

// Bind to the exact PORT on all interfaces
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Duel-UI listening on ${PORT}, serving ${ROOT}, index=${INDEX}`);
});
