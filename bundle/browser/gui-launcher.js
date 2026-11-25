// Windowed front-end for the offline dsh bundle.
//
// Starts the bundle's own dsh web server with --no-open (so the system
// browser is never used), waits for it to print its token URL, and opens
// that page in the bundle's bundled LibreWolf browser running with its own
// profile and -no-remote: fully independent of any installed browser and of
// any running browser instance. Closing the browser window stops the dsh
// server; if the server dies on its own, the browser is closed with an
// error printed here and to dsh-home/gui.log.
//
// Extra command-line arguments are forwarded to the dsh web command
// (e.g. dsh-gui --port 8080). DSH_GUI_BROWSER overrides the browser
// executable (used by the bundle's own tests).
'use strict'

const { spawn, spawnSync } = require('child_process')
const net = require('net')
const path = require('path')
const fs = require('fs')

const isWin = process.platform === 'win32'
const bundleRoot = path.resolve(__dirname, '..')
const nodeBin = isWin
  ? path.join(bundleRoot, 'node', 'node.exe')
  : path.join(bundleRoot, 'node', 'bin', 'node')
// The deploy closure puts the CLI entry at app/lib/bin.js; the npm-tree
// layout keeps it at app/node_modules/@deepseek-ai/dsh/lib/bin.js. Accept both.
const dshBinDeploy = path.join(bundleRoot, 'app', 'lib', 'bin.js')
const dshBinNpm = path.join(bundleRoot, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const dshBin = fs.existsSync(dshBinDeploy) ? dshBinDeploy : dshBinNpm
const defaultBrowserBin = isWin
  ? path.join(bundleRoot, 'browser', 'librewolf', 'LibreWolf', 'librewolf.exe')
  : path.join(bundleRoot, 'browser', 'librewolf', 'AppRun')
const browserBin = process.env.DSH_GUI_BROWSER || defaultBrowserBin
// The dsh CLI signature inside a command line; matches absolute and
// relative, forward- and back-slashed spellings of either layout's entry.
const DSH_CMDLINE = /(@deepseek-ai[/\\]dsh[/\\]lib|app[/\\]lib)[/\\]bin\.js/

let server = null
let browser = null
let url = null
let quitting = false

// Everything the server prints goes to gui.log next to the data folder, so
// a failed start can be diagnosed after the fact.
const homeDir = process.env.DSH_HOME || path.join(bundleRoot, 'dsh-home')
const logFile = path.join(homeDir, 'gui.log')
const pidFile = path.join(homeDir, 'gui.pid')
function log(line) {
  // The window stays open for the lifetime of the session, so it doubles as
  // the live log: mirror every line to the console as well as the file.
  try { process.stdout.write(line + '\n') } catch (err) { /* console gone */ }
  try { fs.appendFileSync(logFile, line + '\n') } catch (err) { /* read-only home */ }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function pidAlive(pid) {
  try { process.kill(pid, 0); return true } catch (err) { return err.code === 'EPERM' }
}

// Only ever signal a process that is really a dsh server of THIS bundle, so
// a recycled pid belonging to something else is left alone.
function pidIsOurServer(pid) {
  if (isWin) {
    const out = spawnSync('tasklist', ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'], { windowsHide: true })
    return String(out.stdout || '').includes('node.exe')
  }
  try {
    return DSH_CMDLINE.test(fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8'))
  } catch (err) { return false }
}

// dsh server processes of this bundle found by command line. Used only when
// the port is busy and the pidfile cannot account for it.
function findServerPids() {
  if (isWin) {
    const out = spawnSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*app*lib*bin.js*' } | ForEach-Object { $_.ProcessId }"],
      { windowsHide: true, encoding: 'utf8' })
    return String(out.stdout || '').split(/\s+/).map(Number).filter(Number.isInteger)
  }
  const pids = []
  try {
    for (const entry of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      try {
        if (DSH_CMDLINE.test(fs.readFileSync('/proc/' + entry + '/cmdline', 'utf8'))) {
          pids.push(Number(entry))
        }
      } catch (err) { /* not ours to read */ }
    }
  } catch (err) { /* /proc unreadable */ }
  return pids
}

function portBusy(port) {
  return new Promise((resolve) => {
    const probe = net.connect({ port, host: '127.0.0.1' })
    probe.once('connect', () => { probe.destroy(); resolve(true) })
    probe.once('error', () => resolve(false))
  })
}

// The port the web command will bind, from an optional --port argument.
function targetPort(extraArgs) {
  for (let i = 0; i < extraArgs.length - 1; i++) {
    if (extraArgs[i] === '--port') return Number(extraArgs[i + 1]) || 3080
  }
  const eq = extraArgs.find((a) => a.startsWith('--port='))
  return (eq && Number(eq.slice(7))) || 3080
}

// If a previous run died without stopping its server (crash, power loss),
// that server still holds the port and a fresh one cannot bind. Stop it
// first, like SLR Runtime's --stop. The pidfile names the server we last
// started; when it cannot account for a busy port, fall back to a process
// scan for this bundle's dsh CLI and stop what it finds.
async function stopStaleServer(extraArgs) {
  if (!(await portBusy(targetPort(extraArgs)))) return
  const pids = new Set()
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10)
    if (Number.isInteger(pid) && pid > 1 && pidAlive(pid) && pidIsOurServer(pid)) pids.add(pid)
  } catch (err) { /* no usable pidfile */ }
  if (pids.size === 0) {
    for (const pid of findServerPids()) {
      if (pidAlive(pid) && pidIsOurServer(pid)) pids.add(pid)
    }
  }
  if (pids.size === 0) {
    log('port ' + targetPort(extraArgs) + ' is busy but no dsh server of this bundle was found; not stopping anything')
    return
  }
  for (const pid of pids) {
    log('stopping stale dsh server from an earlier run (pid ' + pid + ')')
    try {
      if (isWin) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
      else process.kill(pid, 'SIGTERM')
    } catch (err) { log('stale-stop failed: ' + err) }
  }
  for (let i = 0; i < 20 && [...pids].some(pidAlive); i++) await sleep(250)
}

function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return
  if (isWin) {
    // Node's kill on Windows terminates only the direct process; the tree
    // kill reaches the helpers both dsh and the browser spawn.
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true })
  } else {
    try { proc.kill('SIGTERM') } catch (err) { /* already gone */ }
  }
}

function shutdown(code) {
  if (quitting) return
  quitting = true
  killTree(browser)
  killTree(server)
  // Give graceful shutdowns a moment, then exit regardless.
  const exitNow = () => process.exit(code)
  const guard = setTimeout(exitNow, 5000)
  guard.unref()
  const gone = () => {
    if (server === null && browser === null) { clearTimeout(guard); exitNow() }
    else setTimeout(gone, 200)
  }
  gone()
}

function fail(title, message) {
  // log() mirrors to the console; a second stderr write would duplicate it.
  log('dsh-gui error: ' + title + ' - ' + message)
  shutdown(1)
}

async function start() {
  const env = Object.assign({}, process.env)
  if (!env.DSH_HOME) env.DSH_HOME = homeDir
  if (!env.DSH_TELEMETRY_DISABLED) env.DSH_TELEMETRY_DISABLED = '1'
  const extraArgs = process.argv.slice(2)
  const profileDir = path.join(homeDir, 'browser-profile')

  await stopStaleServer(extraArgs)

  log('--- dsh-gui starting ' + new Date().toISOString() + ' ---')
  server = spawn(nodeBin, [dshBin, 'web', '--no-open', ...extraArgs], {
    env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  let out = ''
  server.stdout.setEncoding('utf8')
  server.stdout.on('data', (chunk) => {
    out += chunk
    log(chunk.trimEnd())
    const found = out.match(/dsh web: (https?:\/\/\S+)/)
    if (found && !url) {
      url = found[1]
      // The server is confirmed serving: now a launcher crash is
      // recoverable, because the pidfile names a live server.
      try { fs.writeFileSync(pidFile, String(server.pid)) } catch (err) { /* best effort */ }
      openBrowser(url, profileDir, env)
    }
  })
  server.stderr.setEncoding('utf8')
  server.stderr.on('data', (chunk) => log('[stderr] ' + chunk.trimEnd()))
  server.on('error', (err) => fail('Could not start the bundled dsh server', String(err)))
  server.on('exit', (code, signal) => {
    server = null
    if (quitting) return
    fail(url ? 'The dsh server stopped unexpectedly' : 'The dsh server exited before it was ready',
      'Exit code ' + code + ', signal ' + signal + '.\nDetails are in ' + logFile)
  })
  // A server that never reports its URL (hung profile init, disk full...).
  setTimeout(() => { if (!url && !quitting) fail('Timed out waiting for the dsh server', 'Details are in ' + logFile) }, 60000)

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))
}

function openBrowser(target, profileDir, env) {
  // The browser refuses to load a profile directory that does not exist
  // ("profile cannot be loaded"), so create it first; an empty directory
  // initializes a fresh profile.
  try {
    fs.mkdirSync(profileDir, { recursive: true })
    fs.accessSync(profileDir, fs.constants.W_OK)
  } catch (err) {
    fail('Could not prepare the browser profile directory',
      String(err) + ' (' + profileDir + '). Check that the folder is\n' +
      'writable, or point DSH_HOME somewhere writable and restart.')
    return
  }
  log('browser: ' + browserBin + ' -no-remote -profile ' + profileDir + ' --new-window <url>')
  const args = ['-no-remote', '-profile', profileDir, '--new-window', target]
  browser = spawn(browserBin, args, { env, stdio: 'ignore', windowsHide: true })
  browser.on('error', (err) => fail('Could not start the bundled browser', String(err)))
  browser.on('exit', () => {
    browser = null
    if (quitting) return
    // The spawned process may have been a launcher stub that handed off to a
    // second browser process (observed on Windows) — its exit is not the
    // window closing. Wait until no LibreWolf process is using this bundle's
    // profile, then stop the server and leave cleanly.
    const recheck = () => {
      if (quitting) return
      browserStillRunning(profileDir, (running) => {
        if (running) { setTimeout(recheck, 2000); return }
        shutdown(0)
      })
    }
    recheck()
  })
}

// Whether any LibreWolf process still references this bundle's browser
// profile. Best-effort: a missing process-list tool reports "not running",
// which keeps the previous quit-on-browser-exit behavior.
function browserStillRunning(profileDir, callback) {
  try {
    if (isWin) {
      const like = profileDir.replace(/'/g, "''")
      const out = spawnSync('powershell', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='librewolf.exe'\" | Where-Object { $_.CommandLine -like '*" + like + "*' } | Measure-Object | Select-Object -ExpandProperty Count"],
        { windowsHide: true, encoding: 'utf8', timeout: 15000 })
      const count = Number(String(out.stdout || '').trim())
      callback(Number.isInteger(count) && count > 0)
      return
    }
    const out = spawnSync('pgrep', ['-f', profileDir], { encoding: 'utf8', timeout: 15000 })
    callback(out.status === 0)
  } catch (err) {
    callback(false)
  }
}

start()
