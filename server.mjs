import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.url}`);
  next();
});
const PORT = process.env.PORT || 5173;

// Light caching for static assets
app.use((req, res, next) => {
  if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=300");
  }
  next();
});

// Serve everything from the repo root
app.use(express.static(__dirname, { extensions: ["html"] }));

// Default route -> index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`🟢 Duel-UI listening on ${PORT}`);
});
