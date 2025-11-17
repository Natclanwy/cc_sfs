import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { createReadStream, createWriteStream } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const dataDir = path.resolve(projectRoot, '..', 'data')

async function exists(p) {
  try { await fs.access(p); return true } catch { return false }
}

async function rmIfExists(p) {
  if (await exists(p)) {
    await fs.rm(p, { recursive: true, force: true })
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true })
}

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src)
  if (stat.isDirectory()) {
    await ensureDir(dest)
    const entries = await fs.readdir(src)
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
  } else {
    await ensureDir(path.dirname(dest))
    await fs.copyFile(src, dest)
  }
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else {
      yield full
    }
  }
}

async function gzipFile(srcPath) {
  const dstPath = srcPath + '.gz'
  const gzip = createGzip({ level: 9 })
  await pipeline(createReadStream(srcPath), gzip, createWriteStream(dstPath))
}

async function main() {
  // 1) Clean prior output in data
  await rmIfExists(path.join(dataDir, 'assets'))
  await rmIfExists(path.join(dataDir, 'index.htm'))
  await rmIfExists(path.join(dataDir, 'index.htm.gz'))

  // 2) Copy dist -> data
  await ensureDir(dataDir)
  await copyRecursive(distDir, dataDir)

  // 3) Rename index.html -> index.htm (keep original semantics)
  const indexHtml = path.join(dataDir, 'index.html')
  const indexHtm = path.join(dataDir, 'index.htm')
  if (await exists(indexHtml)) {
    await rmIfExists(indexHtm)
    await fs.rename(indexHtml, indexHtm)
  }

  // 4) Gzip .htm/.css/.js (keep originals)
  for await (const file of walk(dataDir)) {
    const ext = path.extname(file).toLowerCase()
    if (ext === '.htm' || ext === '.css' || ext === '.js') {
      await gzipFile(file)
    }
  }

  console.log('Postbuild complete: assets copied to data and gzipped')
}

main().catch((err) => {
  console.error('Postbuild error:', err)
  process.exit(1)
})
