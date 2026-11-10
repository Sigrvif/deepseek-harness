@echo off
rem DeepSeek Harness (dsh) - self-contained offline launcher for Windows x64.
rem
rem Usage:
rem   dsh.cmd                     start the Web UI (default; http://127.0.0.1:3080)
rem   dsh.cmd web                 start the Web UI explicitly
rem   dsh.cmd web --no-open       start without opening a browser
rem   dsh.cmd --version           print the dsh version
rem   dsh.cmd --help              full CLI help
rem
rem Any other arguments are forwarded to dsh unchanged. Keep this console
rem window open while dsh is running; closing it stops dsh.
rem
rem Environment:
rem   DSH_HOME                 where profiles/settings/sessions are stored
rem                            (default: dsh-home folder next to this script)
rem   DSH_TELEMETRY_DISABLED   set to 1 (default here) to keep the harness offline
setlocal
set "HERE=%~dp0"
if not defined DSH_HOME set "DSH_HOME=%HERE%dsh-home"
if not defined DSH_TELEMETRY_DISABLED set "DSH_TELEMETRY_DISABLED=1"
rem SLR Runtime ignores API keys, but dsh requires one on every provider:
rem ship a harmless placeholder so the preset works out of the box.
if not defined SLR_RUNTIME_API_KEY set "SLR_RUNTIME_API_KEY=slr-local"
rem The bundled superpowers workflow skills ride the app's node_modules;
rem point the skill-filesystem bundled root at them.
if not defined DSH_BUNDLED_SKILL_DIR set "DSH_BUNDLED_SKILL_DIR=%HERE%app\node_modules\@deepseek-ai\dsh-superpowers-skills\skills"
rem MCP servers configured with a bare `npx`/`npm` command resolve against the
rem bundled Node.js (fork local-test): without this, an npx-based stdio server
rem fails to spawn on machines without their own Node install.
set "PATH=%HERE%node;%PATH%"
if "%~1"=="" (
    "%HERE%node\node.exe" "%HERE%app\lib\bin.js" web
) else (
    "%HERE%node\node.exe" "%HERE%app\lib\bin.js" %*
)
