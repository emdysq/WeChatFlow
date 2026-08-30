import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const v1 = resolve(here, '..')
const lock = JSON.parse(readFileSync(resolve(v1, 'upstream/doocs-md.lock.json'), 'utf8'))
const target = resolve(v1, 'upstream/doocs-md')

if (!existsSync(target)) {
  execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', lock.repository, target], { stdio: 'inherit' })
}
execFileSync('git', ['-C', target, 'fetch', '--depth=1', 'origin', lock.commit], { stdio: 'inherit' })
execFileSync('git', ['-C', target, 'checkout', '--detach', lock.commit], { stdio: 'inherit' })
console.log(`doocs/md pinned at ${lock.commit}`)
