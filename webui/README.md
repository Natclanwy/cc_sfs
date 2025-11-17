## Web UI Build

Build the production web assets for the ESP32 device:

```bash
npm install
npm run build
```

This compiles TypeScript, builds optimized assets with Vite, and copies them to `../data/` with gzip compression for LittleFS.
