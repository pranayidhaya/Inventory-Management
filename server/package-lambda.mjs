import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const stageDir = path.join(__dirname, '.lambda-build')
const zipPath = path.join(__dirname, 'lambda-package.zip')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options,
  })

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

try {
  rmSync(stageDir, { recursive: true, force: true })
  rmSync(zipPath, { force: true })

  mkdirSync(stageDir, { recursive: true })

  for (const file of ['index.js', 'package.json', 'package-lock.json']) {
    const source = path.join(__dirname, file)
    if (existsSync(source)) {
      cpSync(source, path.join(stageDir, file))
    }
  }

  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-fund', '--no-audit'], { cwd: stageDir })

  const zipCommand = process.platform === 'win32'
    ? 'powershell'
    : 'zip'
  const zipArgs = process.platform === 'win32'
    ? ['-NoProfile', '-Command', `Compress-Archive -Path "${stageDir}\\*" -DestinationPath "${zipPath}" -Force`]
    : ['-qr', zipPath, '.']

  run(zipCommand, zipArgs, { cwd: process.platform === 'win32' ? undefined : stageDir })

  console.log(`Lambda deployment package created at ${zipPath}`)
  console.log('Contents include index.js, package.json, and production dependencies at the ZIP root.')
} catch (error) {
  console.error('Failed to package Lambda deployment:', error.message)
  process.exitCode = 1
}
