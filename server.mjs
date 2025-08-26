import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import mime from "mime-types";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5173;

const DIST = path.join(__dirname, "dist");
const ROOT = fs.existsSync(DIST) ? DIST : __dirname;
const INDEX = path.join(ROOT, "index.html");

app.get("/health", (_req, res) => res.type("text/plain").send("ok"));

app.use((req, res, next) => {
  const type = mime.lookup(req.path);
  if (type) res.type(type);
  if (/\.(png|jpe?g|gif|webp|svg|css|js|woff2?)$/i.test(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=600");
  }
  next();
});

app.use(express.static(ROOT, { extensions: ["html"] }));
app.get("*", (_req, res) => res.sendFile(INDEX));

app.listen(PORT, () => {
  console.log(`✅ Duel-UI listening on ${PORT}, serving ${ROOT}`);
});
