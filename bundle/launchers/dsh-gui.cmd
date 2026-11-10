@echo off
rem DeepSeek Harness (dsh) - offline GUI launcher for Windows x64.
rem
rem Starts the bundled dsh web server and opens its UI in the bundle's own
rem LibreWolf browser (browser\librewolf, official portable build). No
rem installed browser is used or required, and the -no-remote profile keeps
rem it fully separate from any running browser. Closing the LibreWolf
rem window stops the server.
rem
rem Usage:
rem   dsh-gui.cmd                   open the dsh Web UI in a window
rem   dsh-gui.cmd --port 8080       serve on another port
rem
rem Environment: same as dsh.cmd (DSH_HOME, DSH_TELEMETRY_DISABLED), plus
rem DSH_GUI_BROWSER to substitute the browser executable (testing).
setlocal
set "HERE=%~dp0"
rem SLR Runtime ignores API keys, but dsh requires one on every provider:
rem ship a harmless placeholder so the preset works out of the box.
if not defined SLR_RUNTIME_API_KEY set "SLR_RUNTIME_API_KEY=slr-local"
rem The bundled superpowers workflow skills ride the app's node_modules;
rem point the skill-filesystem bundled root at them.
if not defined DSH_BUNDLED_SKILL_DIR set "DSH_BUNDLED_SKILL_DIR=%HERE%app\node_modules\@deepseek-ai\dsh-superpowers-skills\skills"
rem MCP servers configured with a bare `npx`/`npm` command resolve against the
rem bundled Node.js (fork local-test).
set "PATH=%HERE%node;%PATH%"
"%HERE%node\node.exe" "%HERE%browser\gui-launcher.js" %*
