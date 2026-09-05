import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const standaloneRoot = join(projectRoot, '.next', 'standalone')

const copyRecursive = (from, to) => {
  if (!existsSync(from)) return
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true, force: true })
}

copyRecursive(join(projectRoot, '.next', 'static'), join(standaloneRoot, '.next', 'static'))
copyRecursive(join(projectRoot, 'public'), join(standaloneRoot, 'public'))
