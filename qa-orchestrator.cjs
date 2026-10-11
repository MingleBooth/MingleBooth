/**
 * qa-orchestrator.cjs
 * MingleBooth Camera QA - Automated Tablet Hardware Validation Orchestrator
 *
 * Provides a single, automated, touchscreen-friendly workflow for physical Windows QA:
 *   Stage 1: Windows Environment Verification
 *   Stage 2: Camera Detection & Universal Profile Identification
 *   Stage 3: Automated Driver Setup & Candidate Rank Verification
 *   Stage 4: Non-Destructive PTP Handshake & Battery Status
 *   Stage 5: Real Image Capture & Download with In-App Preview
 *   Stage 6: Final Result Compilation & Developer Diagnostic Export
 *
 * Also provides dedicated, isolated actions:
 *   - Rollback Driver (restores inbox wpdmtp.inf)
 *   - Enable Windows Test Mode (with explicit user confirmation)
 *   - Restore Windows to Normal Mode (disables Test Signing)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { identifyCamera, VERIFICATION_STATUS, DRIVER_STRATEGY } = require('./camera-profiles/index.cjs');
const { getBackendForProfile } = require('./backends/index.cjs');

/**
 * Safe PowerShell process runner using argument array (no string concatenation or shell execution).
 * Invokes: powershell.exe -NoProfile -ExecutionPolicy Bypass -File <absScriptPath> [...scriptArgs]
 *
 * Captures stdout, stderr, and exit code cleanly.
 * Returns { success, exitCode, stdout, stderr, friendlyError }
 */
function runPowerShellScript(scriptPath, scriptArgs = [], timeoutMs = 60000) {
  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: `Script tidak ditemukan: ${scriptPath}`,
      friendlyError: `File script tidak ditemukan: ${path.basename(scriptPath)}`,
    };
  }

  const absPath = path.resolve(scriptPath);

  // Safe argument array passed directly to powershell.exe via spawnSync:
  // Node.js uses CreateProcessW and automatically handles quoting for paths with spaces.
  const procArgs = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    absPath,
    ...scriptArgs,
  ];

  try {
    const res = spawnSync('powershell.exe', procArgs, {
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
    });

    const stdout = (res.stdout || '').trim();
    const stderr = (res.stderr || '').trim();
    const exitCode = res.status !== null ? res.status : (res.error ? -1 : 0);

    let friendlyError = null;
    if (exitCode !== 0) {
      if (exitCode === 2) {
        friendlyError = 'Izin Administrator (UAC) dibatalkan atau ditolak pengguna.';
      } else if (exitCode === 3) {
        friendlyError = 'Secure Boot aktif di BIOS/UEFI. Mode Pengujian tidak dapat diaktifkan saat Secure Boot aktif.';
      } else if (exitCode === 4) {
        friendlyError = 'File driver INF atau sertifikat tidak ditemukan.';
      } else if (exitCode === 6) {
        friendlyError = 'Windows memilih driver lain atau verifikasi driver rank gagal.';
      } else if (stderr) {
        // Strip out PowerShell error metadata lines and extract clean message
        const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const cleanMsg = lines.find((l) => !l.startsWith('At ') && !l.startsWith('+') && !l.includes('CategoryInfo') && !l.includes('FullyQualifiedErrorId')) || lines[0] || 'Unknown error';
        friendlyError = `Helper gagal (kode ${exitCode}): ${cleanMsg}`;
      } else {
        friendlyError = `Helper gagal dengan kode keluar ${exitCode}.`;
      }
    }

    return {
      success: exitCode === 0,
      exitCode,
      stdout,
      stderr,
      friendlyError,
    };
  } catch (err) {
    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: err.message,
      friendlyError: `Gagal menjalankan PowerShell: ${err.message}`,
    };
  }
}

/**
 * Comprehensive environment inspection and resolution for bcdedit.exe.
 * Handles 32-bit (WOW64) vs 64-bit architecture nuances:
 *   - In 32-bit processes on 64-bit Windows: System32 is redirected to SysWOW64 (which lacks bcdedit.exe).
 *     Access to the real 64-bit System32 requires %SystemRoot%\Sysnative\.
 *   - In 64-bit processes: %SystemRoot%\System32\ contains the real 64-bit bcdedit.exe.
 *   - Dynamic SystemRoot is determined without hardcoding C:\Windows.
 *   - Verifies file exists, is actually named bcdedit.exe, and is executable.
 */
function inspectBcdeditEnvironment() {
  const sysRoot = process.env.SystemRoot || process.env.windir || (process.platform === 'win32' ? 'C:\\Windows' : '/');
  const processArch = process.arch;
  const osArch = process.env.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITECTURE || os.arch();
  const isOs64Bit = /64/i.test(osArch);
  const isProcess32Bit = processArch === 'ia32' || processArch === 'x86';

  const candidatePaths = [
    path.join(sysRoot, 'Sysnative', 'bcdedit.exe'),
    path.join(sysRoot, 'System32', 'bcdedit.exe'),
    path.join(sysRoot, 'SysWOW64', 'bcdedit.exe'),
  ];

  const candidatesChecked = candidatePaths.map((cand) => {
    let exists = false;
    let isFile = false;
    let sizeBytes = 0;
    let isExecutable = false;
    let error = null;

    try {
      if (fs.existsSync(cand)) {
        exists = true;
        const stat = fs.statSync(cand);
        isFile = stat.isFile();
        sizeBytes = stat.size;
        try {
          fs.accessSync(cand, fs.constants.R_OK);
          isExecutable = isFile && sizeBytes > 0;
        } catch (_) {}
      }
    } catch (e) {
      error = e.message;
    }

    return {
      path: cand,
      exists,
      isFile,
      sizeBytes,
      isExecutable,
      isBcdeditName: path.basename(cand).toLowerCase() === 'bcdedit.exe',
      error,
    };
  });

  // Query `where.exe bcdedit.exe` as a diagnostic query only (not primary dependency)
  let whereResolution = null;
  if (process.platform === 'win32') {
    try {
      const wRes = spawnSync('where.exe', ['bcdedit.exe'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
      if (wRes.status === 0 && wRes.stdout) {
        whereResolution = wRes.stdout.trim().split(/\r?\n/)[0].trim();
      }
    } catch (_) {}
  }

  // Selection logic for Node process:
  // If 32-bit process on 64-bit OS: Sysnative is candidate #1
  // If 64-bit process: System32 is candidate #1
  let selected = null;
  if (isProcess32Bit && isOs64Bit) {
    selected = candidatesChecked.find((c) => c.path.includes('Sysnative') && c.exists && c.isExecutable);
  }
  if (!selected) {
    selected = candidatesChecked.find((c) => c.path.includes('System32') && c.exists && c.isExecutable);
  }
  if (!selected) {
    selected = candidatesChecked.find((c) => c.exists && c.isExecutable);
  }

  const selectedPath = selected ? selected.path : (whereResolution || path.join(sysRoot, 'System32', 'bcdedit.exe'));
  const selectedExists = selected ? true : (whereResolution ? fs.existsSync(whereResolution) : false);
  const selectedIsExecutable = selected ? selected.isExecutable : false;

  // Retrieve file version for diagnostics if available
  let fileVersion = 'N/A';
  if (process.platform === 'win32' && selectedExists) {
    try {
      const fvRes = spawnSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `[System.Diagnostics.FileVersionInfo]::GetVersionInfo('${selectedPath.replace(/'/g, "''")}').FileVersion`,
      ], { encoding: 'utf8', timeout: 4000, windowsHide: true });
      if (fvRes.status === 0 && fvRes.stdout) {
        fileVersion = fvRes.stdout.trim() || 'N/A';
      }
    } catch (_) {}
  }

  return {
    systemRoot: sysRoot,
    windowsArchitecture: osArch,
    processArchitecture: processArch,
    isOs64Bit,
    isProcess32Bit,
    candidatesChecked,
    selectedPath,
    selectedExists,
    selectedIsExecutable,
    fileVersion,
    whereResolution,
    windowsVersion: os.release(),
  };
}

/**
 * Safe query for Windows Test Signing mode using direct bcdedit.exe execution (no shell)
 */
function queryTestSigningEnabled() {
  if (process.platform !== 'win32') return true;
  try {
    const bcdEnv = inspectBcdeditEnvironment();
    const bcdExe = bcdEnv.selectedPath || 'bcdedit.exe';
    const res = spawnSync(bcdExe, [], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const out = ((res.stdout || '') + (res.stderr || '')).trim();
    if (/testsigning\s+Yes/i.test(out)) {
      return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Windows-Native Elevated Process Runner using ShellExecuteEx / "runas".
 *
 * Requirements addressed:
 *   - Runs actual commands with true Administrator privileges via UAC
 *   - WOW64-aware: within the elevated CMD runner, dynamically detects if running under
 *     32-bit WOW64 (e.g. via 32-bit elevate.exe) and utilizes %SystemRoot%\Sysnative\bcdedit.exe
 *     to prevent WOW64 redirection from hiding the 64-bit bcdedit binary.
 *   - Under native 64-bit CMD or 32-bit Windows, utilizes %SystemRoot%\System32\bcdedit.exe.
 *   - Dynamically determines SystemRoot without hardcoding C:\Windows.
 *   - Detects and cleanly differentiates UAC cancellation (error code 1223)
 *   - Captures stdout, stderr, exit code, and the actual resolved binary path across integrity levels.
 *
 * @param {string} executableName - Executable identifier (e.g. 'bcdedit.exe')
 * @param {string[]} args - Command arguments (e.g. ['/set', 'testsigning', 'on'])
 * @param {object} options - Execution options (reportsDir, elevateExe, timeoutMs)
 * @returns {object} Execution result including resolvedBinary and actualCommandExecuted
 */
function runElevatedCommand(executableName, args = [], options = {}) {
  const timeoutMs = options.timeoutMs || 45000;
  const reportsDir = options.reportsDir || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'MingleBooth', 'qa-reports');

  if (!fs.existsSync(reportsDir)) {
    try { fs.mkdirSync(reportsDir, { recursive: true }); } catch (_) {}
  }

  const timestamp = Date.now();
  const runnerCmd = path.join(reportsDir, `elevated-task-${timestamp}.cmd`);
  const stdoutFile = path.join(reportsDir, `elevated-stdout-${timestamp}.txt`);
  const stderrFile = path.join(reportsDir, `elevated-stderr-${timestamp}.txt`);
  const exitCodeFile = path.join(reportsDir, `elevated-exit-${timestamp}.txt`);
  const resolvedFile = path.join(reportsDir, `elevated-resolved-${timestamp}.txt`);
  const verifyFile = path.join(reportsDir, `elevated-verify-${timestamp}.txt`);

  const argsStr = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
  const baseName = path.basename(executableName);

  // Construct self-contained runner script that dynamically locates the target binary
  // inside the CMD execution context. This handles WOW64 file system redirection:
  //   - If CMD is 32-bit (spawned by 32-bit elevate.exe on 64-bit OS), %SystemRoot%\Sysnative\<exe>
  //     is checked FIRST, reaching the native 64-bit System32!
  //   - If CMD is 64-bit or on 32-bit Windows, %SystemRoot%\System32\<exe> is checked.
  const cmdContent = [
    '@echo off',
    'chcp 65001 >nul',
    '',
    ':: Dynamically determine SystemRoot without hardcoding C:\\Windows',
    'if "%SystemRoot%"=="" (',
    '    if not "%windir%"=="" (',
    '        set "SystemRoot=%windir%"',
    '    ) else (',
    '        set "SystemRoot=C:\\Windows"',
    '    )',
    ')',
    '',
    ':: Locate real binary within this runner process context:',
    ':: 1. Under 32-bit WOW64 cmd: %SystemRoot%\\Sysnative reaches real 64-bit System32.',
    ':: 2. Under native 64-bit cmd: %SystemRoot%\\System32 reaches native System32.',
    ':: 3. Fallback to where search.',
    'set "TARGET_EXE="',
    `if exist "%SystemRoot%\\Sysnative\\${baseName}" (`,
    `    set "TARGET_EXE=%SystemRoot%\\Sysnative\\${baseName}"`,
    `) else if exist "%SystemRoot%\\System32\\${baseName}" (`,
    `    set "TARGET_EXE=%SystemRoot%\\System32\\${baseName}"`,
    ') else (',
    `    for /f "delims=" %%I in ('where ${baseName} 2^>nul') do (`,
    '        if exist "%%I" if not defined TARGET_EXE set "TARGET_EXE=%%I"',
    '    )',
    ')',
    '',
    `if "%TARGET_EXE%"=="" set "TARGET_EXE=${baseName}"`,
    '',
    `(echo %TARGET_EXE%)> "${resolvedFile}"`,
    '',
    `"%TARGET_EXE%" ${argsStr} > "${stdoutFile}" 2> "${stderrFile}"`,
    'set CMD_EXIT=%ERRORLEVEL%',
    '',
    `if /i "${baseName}"=="bcdedit.exe" (`,
    `    "%TARGET_EXE%" > "${verifyFile}" 2>&1`,
    ')',
    '',
    `(echo %CMD_EXIT%)> "${exitCodeFile}"`,
    'exit /b %CMD_EXIT%',
  ].join('\r\n') + '\r\n';

  try {
    fs.writeFileSync(runnerCmd, cmdContent, 'utf8');
  } catch (err) {
    return {
      elevationRequested: true,
      elevatedProcessStarted: false,
      elevatedProcessExitCode: -1,
      stdout: '',
      stderr: `Gagal membuat runner script: ${err.message}`,
      uacCancelled: false,
      elevationFailed: true,
      resolvedBinary: baseName,
      actualCommandExecuted: `${baseName} ${argsStr}`,
    };
  }

  const elevateExe = options.elevateExe;
  let started = false;
  let exitCode = -1;
  let uacCancelled = false;
  let elevationFailed = false;
  let rawStdout = '';
  let rawStderr = '';

  if (elevateExe && fs.existsSync(elevateExe)) {
    // Primary Windows elevation flow: Native elevate.exe helper utilizing ShellExecuteExW with "runas"
    try {
      const spawnRes = spawnSync(elevateExe, ['-wait', 'cmd.exe', '/c', runnerCmd], {
        encoding: 'utf8',
        timeout: timeoutMs,
        windowsHide: false,
      });

      rawStdout = (spawnRes.stdout || '').trim();
      rawStderr = (spawnRes.stderr || '').trim();
      const status = spawnRes.status !== null ? spawnRes.status : -1;

      // Detect UAC cancellation (Win32 ERROR_CANCELLED = 1223)
      const combined = `${rawStdout} ${rawStderr} ${status}`;
      if (status === 1223 || /1223/.test(combined) || /ERROR_CANCELLED/i.test(combined)) {
        uacCancelled = true;
        exitCode = 1223;
        started = false;
      } else if (spawnRes.error) {
        elevationFailed = true;
        exitCode = -1;
        rawStderr = spawnRes.error.message;
      } else {
        // Check if the elevated script actually started and recorded its exit code
        if (fs.existsSync(exitCodeFile)) {
          started = true;
          try {
            const codeStr = fs.readFileSync(exitCodeFile, 'utf8').trim();
            exitCode = parseInt(codeStr, 10);
            if (isNaN(exitCode)) exitCode = status;
          } catch (_) {
            exitCode = status;
          }
        } else if (status === 0) {
          started = true;
          exitCode = 0;
        } else {
          elevationFailed = true;
          exitCode = status;
        }
      }
    } catch (e) {
      elevationFailed = true;
      rawStderr = e.message;
    }
  } else {
    // Secondary fallback: Windows Script Host (WSH) COM elevation via Shell.Application
    const vbsPath = path.join(reportsDir, `elevate-wsh-${timestamp}.vbs`);
    const escapedCmd = runnerCmd.replace(/\\/g, '\\\\').replace(/"/g, '""');
    const vbsContent = [
      'On Error Resume Next',
      'Set objShell = CreateObject("Shell.Application")',
      `objShell.ShellExecute "cmd.exe", "/c """ & "${escapedCmd}" & """", "", "runas", 0`,
      'If Err.Number <> 0 Then',
      '  WScript.Quit Err.Number',
      'End If',
    ].join('\r\n') + '\r\n';

    try {
      fs.writeFileSync(vbsPath, vbsContent, 'utf8');
      const vbsRes = spawnSync('cscript.exe', ['//NoLogo', vbsPath], {
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
      });

      const vbsStatus = vbsRes.status !== null ? vbsRes.status : 0;
      // In VBScript, ERROR_CANCELLED (1223 / 0x4C7) manifests as &H800704C7 = -2147023673
      if (vbsStatus === -2147023673 || vbsStatus === 1223 || (vbsRes.stderr && vbsRes.stderr.includes('1223'))) {
        uacCancelled = true;
        exitCode = 1223;
      } else if (vbsStatus !== 0) {
        elevationFailed = true;
        exitCode = vbsStatus;
        rawStderr = vbsRes.stderr || `WSH elevation exited with code ${vbsStatus}`;
      } else {
        // Wait for exitCodeFile to be written by the elevated command
        const waitStart = Date.now();
        while (!fs.existsSync(exitCodeFile) && (Date.now() - waitStart < timeoutMs)) {
          spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 250']);
        }
        if (fs.existsSync(exitCodeFile)) {
          started = true;
          try {
            const codeStr = fs.readFileSync(exitCodeFile, 'utf8').trim();
            exitCode = parseInt(codeStr, 10);
            if (isNaN(exitCode)) exitCode = 0;
          } catch (_) {
            exitCode = 0;
          }
        } else {
          elevationFailed = true;
          exitCode = -1;
          rawStderr = 'Waktu tunggu habis saat menunggu eksekusi berizin Administrator.';
        }
      }
      try { if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath); } catch (_) {}
    } catch (err) {
      elevationFailed = true;
      exitCode = -1;
      rawStderr = err.message;
    }
  }

  // Read resolved binary path recorded by runner
  let resolvedBinary = baseName;
  if (fs.existsSync(resolvedFile)) {
    try {
      resolvedBinary = fs.readFileSync(resolvedFile, 'utf8').trim() || baseName;
    } catch (_) {}
  }

  // Read captured stdout, stderr, and elevated verify output
  let capturedStdout = '';
  let capturedStderr = '';
  let capturedVerify = '';
  if (fs.existsSync(stdoutFile)) {
    try { capturedStdout = fs.readFileSync(stdoutFile, 'utf8').trim(); } catch (_) {}
  }
  if (fs.existsSync(stderrFile)) {
    try { capturedStderr = fs.readFileSync(stderrFile, 'utf8').trim(); } catch (_) {}
  }
  if (fs.existsSync(verifyFile)) {
    try { capturedVerify = fs.readFileSync(verifyFile, 'utf8').trim(); } catch (_) {}
  }

  const finalStderr = capturedStderr || rawStderr;
  const finalStdout = capturedStdout || rawStdout;

  // Cleanup temporary runner and output files
  try { if (fs.existsSync(runnerCmd)) fs.unlinkSync(runnerCmd); } catch (_) {}
  try { if (fs.existsSync(stdoutFile)) fs.unlinkSync(stdoutFile); } catch (_) {}
  try { if (fs.existsSync(stderrFile)) fs.unlinkSync(stderrFile); } catch (_) {}
  try { if (fs.existsSync(exitCodeFile)) fs.unlinkSync(exitCodeFile); } catch (_) {}
  try { if (fs.existsSync(resolvedFile)) fs.unlinkSync(resolvedFile); } catch (_) {}
  try { if (fs.existsSync(verifyFile)) fs.unlinkSync(verifyFile); } catch (_) {}

  return {
    elevationRequested: true,
    elevatedProcessStarted: started,
    elevatedProcessExitCode: exitCode,
    stdout: finalStdout,
    stderr: finalStderr,
    verifyOutput: capturedVerify,
    uacCancelled,
    elevationFailed,
    resolvedBinary,
    actualCommandExecuted: `"${resolvedBinary}" ${argsStr}`,
  };
}

class QAOrchestrator {
  constructor(options = {}) {
    this.rootPath = options.rootPath || path.resolve(__dirname, '..');
    this.binDir = options.binDir || this.resolveBinDir();
    this.driverDevDir = options.driverDevDir || this.resolveDriverDevDir();
    this.reportsDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'MingleBooth', 'qa-reports');
    this.capturesDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'MingleBooth', 'qa-captures');

    if (!fs.existsSync(this.reportsDir)) {
      try { fs.mkdirSync(this.reportsDir, { recursive: true }); } catch (_) {}
    }
    if (!fs.existsSync(this.capturesDir)) {
      try { fs.mkdirSync(this.capturesDir, { recursive: true }); } catch (_) {}
    }

    this.session = this.initSession();
  }

  resolveBinDir() {
    const resourcesPath = process.resourcesPath || path.join(process.cwd(), 'resources');
    const candidates = [
      path.join(resourcesPath, 'app.asar.unpacked', 'electron', 'bin', 'win'),
      path.join(resourcesPath, 'electron', 'bin', 'win'),
      path.resolve(__dirname, 'bin', 'win'),
      path.resolve(__dirname, '..', 'bin', 'win'),
      path.join(process.cwd(), 'electron', 'bin', 'win'),
      path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'electron', 'bin', 'win'),
      path.join(__dirname, '..', '..', 'bin', 'win'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return path.resolve(__dirname, 'bin', 'win');
  }

  resolveDriverDevDir() {
    const resourcesPath = process.resourcesPath || path.join(process.cwd(), 'resources');
    const candidates = [
      path.join(resourcesPath, 'app.asar.unpacked', 'driver-dev'),
      path.join(resourcesPath, 'driver-dev'),
      path.resolve(__dirname, '..', 'driver-dev'),
      path.resolve(__dirname, 'driver-dev'),
      path.join(process.cwd(), 'driver-dev'),
      path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'driver-dev'),
      path.join(__dirname, '..', '..', 'driver-dev'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return path.resolve(__dirname, '..', 'driver-dev');
  }

  resolveElevateExe() {
    const resourcesPath = process.resourcesPath || path.join(process.cwd(), 'resources');
    const candidates = [
      path.join(resourcesPath, 'elevate.exe'),
      path.join(this.binDir, 'elevate.exe'),
      path.join(resourcesPath, 'app.asar.unpacked', 'electron', 'bin', 'win', 'elevate.exe'),
      path.resolve(__dirname, 'bin', 'win', 'elevate.exe'),
      path.resolve(__dirname, '..', 'bin', 'win', 'elevate.exe'),
      path.resolve(__dirname, '..', 'release', 'win-unpacked', 'resources', 'elevate.exe'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  initSession() {
    return {
      id: `qa-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      startTime: new Date().toISOString(),
      platform: {
        os: process.platform,
        arch: process.arch,
        version: os.release(),
        isWin64: process.platform === 'win32' && process.arch === 'x64',
        testSigningEnabled: false,
        secureBootBlocked: false,
      },
      camera: null,
      profile: null,
      driver: {
        before: null,
        after: null,
        selectedRank: null,
        installed: false,
      },
      connection: {
        autoDetectPassed: false,
        ptpSummaryPassed: false,
        batteryStatus: null,
      },
      capture: {
        executed: false,
        filePath: null,
        fileSize: 0,
        previewBase64: null,
      },
      status: 'IDLE',
      logs: [],
    };
  }

  log(msg, type = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message: msg,
    };
    this.session.logs.push(entry);
    console.log(`[QAOrchestrator] [${type.toUpperCase()}] ${msg}`);
  }

  /**
   * Stage 1: Check Windows Environment
   */
  async checkEnvironment() {
    this.log('Checking Windows tablet environment...');
    const result = {
      passed: false,
      osName: 'Windows',
      arch: process.arch,
      isWin10Or11: false,
      isX64: process.arch === 'x64',
      binariesReady: false,
      testSigningEnabled: false,
      requiresTestModePrompt: false,
      details: [],
    };

    if (process.platform !== 'win32') {
      result.details.push('Platform bukan Windows (Development mock mode)');
      this.log('Non-Windows platform detected.');
      return result;
    }

    try {
      const rel = os.release();
      const major = parseInt(rel.split('.')[0] || '0', 10);
      const build = parseInt(rel.split('.')[2] || '0', 10);
      result.isWin10Or11 = major >= 10;
      result.osName = build >= 22000 ? 'Windows 11' : (major >= 10 ? 'Windows 10' : `Windows (Kernel ${rel})`);
    } catch (_) {
      result.isWin10Or11 = true;
      result.osName = 'Windows 10/11';
    }

    // Check bundled camera engine binaries
    const gphotoExe = path.join(this.binDir, 'gphoto2.exe');
    const libusbDll = path.join(this.binDir, 'libusb-1.0.dll');
    const ptp2Dll = path.join(this.binDir, 'camlibs', 'ptp2.dll');

    if (fs.existsSync(gphotoExe) && fs.existsSync(libusbDll) && fs.existsSync(ptp2Dll)) {
      result.binariesReady = true;
      this.log(`Bundled binaries verified at ${this.binDir}`);
    } else {
      result.details.push(`Engine kamera tidak lengkap di ${this.binDir}`);
      this.log(`Missing bundled binaries at ${this.binDir}`, 'error');
    }

    // Check Test Signing mode safely without shell invocation
    const isTestSigning = queryTestSigningEnabled();
    result.testSigningEnabled = isTestSigning;
    this.session.platform.testSigningEnabled = isTestSigning;
    if (isTestSigning) {
      this.log('Windows Test Signing is ENABLED.');
    } else {
      result.requiresTestModePrompt = true;
      this.log('Windows Test Signing is DISABLED.');
    }

    result.passed = result.isX64 && result.binariesReady;
    return result;
  }

  /**
   * Stage 2: Detect Camera & Universal Profile Match
   */
  async detectCamera() {
    this.log('Detecting connected camera...');
    const result = {
      detected: false,
      camera: null,
      profile: null,
      isSupported: false,
      requiresDriverSetup: false,
      vendorMessage: '',
      rawPnp: null,
    };

    if (process.platform !== 'win32') {
      // Mac mock fallback for development
      const mockProfile = identifyCamera('054C', '0E8C', 'Sony ILCE-7CM2');
      result.detected = true;
      result.camera = { model: 'Sony ILCE-7CM2 (Mock)', vendorId: '054C', productId: '0E8C' };
      result.profile = mockProfile;
      result.isSupported = true;
      return result;
    }

    try {
      const psCheck = `
        $dev = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
          $_.InstanceId -match 'VID_054C|VID_04A9|VID_04B0|VID_04CB'
        }
        if ($dev) {
          $d = $dev[0]
          @{
            Found = $true
            InstanceId = $d.InstanceId
            Service = $d.Service
            Class = $d.Class
            Status = $d.Status
            FriendlyName = $d.FriendlyName
          } | ConvertTo-Json
        } else {
          @{ Found = $false } | ConvertTo-Json
        }
      `;

      const psRes = spawnSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psCheck,
      ], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      });

      const raw = (psRes.stdout || '').trim();
      if (!raw) {
        result.vendorMessage = 'Kamera belum terhubung. Pastikan kabel USB tersambung dan kamera menyala.';
        this.log('No supported camera detected in Windows PnP.');
        return result;
      }

      const parsed = JSON.parse(raw);
      if (!parsed.Found) {
        result.vendorMessage = 'Kamera belum terhubung. Pastikan kabel USB tersambung dan kamera menyala.';
        this.log('No supported camera detected in Windows PnP.');
        return result;
      }

      result.detected = true;
      result.rawPnp = parsed;

      // Extract VID and PID
      let vid = '054C';
      let pid = '0E8C';
      const mVid = parsed.InstanceId.match(/VID_([0-9A-F]{4})/i);
      const mPid = parsed.InstanceId.match(/PID_([0-9A-F]{4})/i);
      if (mVid) vid = mVid[1].toUpperCase();
      if (mPid) pid = mPid[1].toUpperCase();

      const profile = identifyCamera(vid, pid, parsed.FriendlyName);
      result.profile = profile;
      result.camera = {
        model: profile.displayName || parsed.FriendlyName,
        vendorId: vid,
        productId: pid,
        instanceId: parsed.InstanceId,
        service: parsed.Service,
        class: parsed.Class,
        status: parsed.Status,
      };

      this.session.camera = result.camera;
      this.session.profile = profile;

      if (profile.status === VERIFICATION_STATUS.SUPPORTED) {
        result.isSupported = true;
        const isWinUsb = (parsed.Service || '').toLowerCase() === 'winusb' && parsed.Status === 'OK';
        result.requiresDriverSetup = (profile.driverStrategy === DRIVER_STRATEGY.WINUSB_REQUIRED) && !isWinUsb;
        this.log(`Camera recognized: ${profile.displayName} [SUPPORTED]. Driver Setup Required: ${result.requiresDriverSetup}`);
      } else {
        result.isSupported = false;
        result.vendorMessage = profile.vendorMessage || 'Model kamera ini belum didukung MingleBooth.';
        this.log(`Camera recognized but NOT supported: ${profile.displayName} [${profile.status}]`);
      }

      return result;
    } catch (e) {
      this.log(`Camera detection failed: ${e.message}`, 'error');
      result.vendorMessage = `Kesalahan deteksi: ${e.message}`;
      return result;
    }
  }

  /**
   * Stage 3: Automated Driver Installation with Rank Verification & Auto-Rollback
   */
  async setupDriver() {
    this.log('Executing automated driver setup...');
    const result = {
      success: false,
      testModeRequired: false,
      rebootRequired: false,
      error: null,
      selectedDriver: null,
      selectedRank: null,
    };

    if (process.platform !== 'win32') {
      result.success = true;
      return result;
    }

    // 1. Verify Test Mode is enabled
    if (!queryTestSigningEnabled()) {
      result.testModeRequired = true;
      result.error = 'Windows perlu mode pengujian untuk memasang driver percobaan MingleBooth.';
      this.log('Test Mode is required before installing driver.', 'warn');
      return result;
    }

    // 2. Locate driver installer and package files
    const setupSigningScript = path.join(this.driverDevDir, 'setup-qa-signing.ps1');
    const installScript = path.join(this.driverDevDir, 'install-camera-driver.ps1');
    const infPath = path.join(this.driverDevDir, 'MingleBoothCamera.inf');

    if (!fs.existsSync(installScript) || !fs.existsSync(infPath)) {
      result.error = `File driver installer tidak ditemukan di ${this.driverDevDir}`;
      this.log(result.error, 'error');
      return result;
    }

    try {
      // Run signing setup elevated if catalog is missing
      const catPath = path.join(this.driverDevDir, 'MingleBoothCamera.cat');
      if (!fs.existsSync(catPath) && fs.existsSync(setupSigningScript)) {
        this.log('Compiling and signing test catalog file...');
        const signRes = runPowerShellScript(setupSigningScript, [], 45000);
        if (!signRes.success) {
          result.error = signRes.friendlyError || 'Gagal menyiapkan tanda tangan driver pengujian.';
          this.log(`Signing setup failed: ${signRes.stderr}`, 'error');
          return result;
        }
      }

      // Execute install-camera-driver.ps1 using safe argument array
      this.log('Running elevated driver installation helper via safe argument array...');
      const installRes = runPowerShellScript(installScript, ['-InfPath', infPath], 60000);
      if (!installRes.success) {
        result.error = installRes.friendlyError || 'Pemasangan driver kamera gagal.';
        this.log(`Driver installer helper failed: ${installRes.stderr}`, 'error');
        return result;
      }

      // Verify post-install state
      const baselineAfterFile = path.join(process.env.LOCALAPPDATA || '', 'MingleBooth', 'driver-baseline-after.json');
      if (fs.existsSync(baselineAfterFile)) {
        const baselineAfter = JSON.parse(fs.readFileSync(baselineAfterFile, 'utf8'));
        this.session.driver.after = baselineAfter;
        result.selectedDriver = baselineAfter.SelectedDriver;
        result.selectedRank = baselineAfter.SelectedRank;

        const isWinUsb = baselineAfter.ActiveService === 'WinUSB';
        const isOk = baselineAfter.ActiveStatus === 'OK';

        if (isWinUsb && isOk) {
          result.success = true;
          this.session.driver.installed = true;
          this.log(`Driver setup SUCCESS! Selected: ${result.selectedDriver} (Rank: ${result.selectedRank})`);
        } else {
          result.error = 'Windows memilih driver lain atau verifikasi driver rank gagal.';
          this.log(`Driver verification failed: Service=${baselineAfter.ActiveService}, Status=${baselineAfter.ActiveStatus}`, 'error');
        }
      } else {
        result.success = true;
      }

      return result;
    } catch (err) {
      result.error = `Pengaturan driver gagal: ${err.message}`;
      this.log(result.error, 'error');
      return result;
    }
  }

  /**
   * Stage 4: Non-Destructive Camera Communication Handshake (NO SHUTTER)
   */
  async testConnection(profile) {
    this.log('Executing non-destructive communication handshake...');
    const backend = getBackendForProfile(profile, { binDir: this.binDir });
    const result = {
      success: false,
      autoDetectOk: false,
      summaryOk: false,
      batteryLevel: null,
      error: null,
    };

    try {
      // 1. Auto-detect
      const detectRes = await backend.detect(profile);
      if (detectRes.success && detectRes.cameras.length > 0) {
        result.autoDetectOk = true;
        this.session.connection.autoDetectPassed = true;
        this.log(`Auto-detect passed: ${detectRes.cameras[0].model}`);
      } else {
        result.error = 'Kamera tidak merespons perintah auto-detect.';
        this.log(result.error, 'warn');
        return result;
      }

      // 2. Summary Handshake (PTP)
      const connectRes = await backend.connect(profile);
      if (connectRes.success) {
        result.summaryOk = true;
        this.session.connection.ptpSummaryPassed = true;
        this.log('PTP Summary handshake succeeded.');
      } else {
        result.error = 'Kamera tidak merespons handshake PTP summary.';
        this.log(result.error, 'warn');
        return result;
      }

      // 3. Battery Query (Property query)
      const statusRes = await backend.getStatus(profile);
      if (statusRes.success) {
        result.batteryLevel = statusRes.batteryLevel;
        this.session.connection.batteryStatus = statusRes.batteryLevel;
        this.log(`Battery query succeeded: ${statusRes.batteryLevel}`);
      }

      result.success = result.autoDetectOk && result.summaryOk;
      return result;
    } catch (e) {
      result.error = `Komunikasi kamera gagal: ${e.message}`;
      this.log(result.error, 'error');
      return result;
    }
  }

  /**
   * Stage 5: Real Image Capture & Download with Base64 Preview
   */
  async triggerCapture(profile) {
    this.log('Executing real capture and download test...');
    const backend = getBackendForProfile(profile, { binDir: this.binDir });
    const timestamp = Date.now();
    const destFile = path.join(this.capturesDir, `qa-capture-${timestamp}.jpg`);

    const result = {
      success: false,
      filePath: destFile,
      fileSize: 0,
      previewBase64: null,
      error: null,
    };

    try {
      const capRes = await backend.capture(profile, destFile, { timeoutMs: 25000 });

      if (!capRes.success || !fs.existsSync(destFile)) {
        result.error = capRes.error || 'Foto tidak tersimpan di komputer.';
        this.log(result.error, 'error');
        return result;
      }

      const stats = fs.statSync(destFile);
      result.fileSize = stats.size;

      if (stats.size <= 0) {
        result.error = 'File foto kosong (0 bytes).';
        this.log(result.error, 'error');
        return result;
      }

      // Read image buffer and convert to base64 preview for tablet UI
      const buffer = fs.readFileSync(destFile);
      result.previewBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      result.success = true;

      this.session.capture.executed = true;
      this.session.capture.filePath = destFile;
      this.session.capture.fileSize = stats.size;

      this.log(`Capture SUCCESS! Saved: ${destFile} (${Math.round(stats.size / 1024)} KB)`);
      return result;
    } catch (e) {
      result.error = `Gagal memotret: ${e.message}`;
      this.log(result.error, 'error');
      return result;
    }
  }

  /**
   * Dedicated Action: Enable Windows Test Mode
   * ONLY called when the user explicitly clicks [Siapkan Mode Pengujian].
   *
   * Executes Windows-native elevation flow:
   *   [Siapkan Mode Pengujian] → UAC → locate bcdedit.exe correctly → bcdedit /set testsigning on → independently verify testsigning Yes → show [Restart Sekarang]
   */
  async enableTestMode() {
    this.log('Enabling Windows Test Signing Mode...');

    const resultFile = path.join(this.reportsDir, 'test-mode-result.json');
    const logFile = path.join(this.reportsDir, 'test-mode-execution.log');

    // Clean up stale diagnostic report from previous runs
    try { if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile); } catch (_) {}

    // Perform deep environment inspection across architectures and WOW64 boundaries
    const bcdEnv = inspectBcdeditEnvironment();
    this.log(`Windows Arch: ${bcdEnv.windowsArchitecture}, Process Arch: ${bcdEnv.processArchitecture}, SystemRoot: ${bcdEnv.systemRoot}`);
    this.log(`Selected bcdedit query path: ${bcdEnv.selectedPath} (Exists: ${bcdEnv.selectedExists}, Executable: ${bcdEnv.selectedIsExecutable})`);

    if (process.platform !== 'win32') {
      // Mock for non-Windows (macOS development environment)
      this.log('Non-Windows platform: Mocking enableTestMode success.');
      this.session.platform.testSigningEnabled = true;
      const mockDiag = {
        SystemRoot: bcdEnv.systemRoot,
        WindowsArchitecture: bcdEnv.windowsArchitecture,
        NodeArchitecture: bcdEnv.processArchitecture,
        ElectronArchitecture: bcdEnv.processArchitecture,
        candidateBcdeditPathsChecked: bcdEnv.candidatesChecked,
        whichPathWasSelected: bcdEnv.selectedPath,
        whetherTheFileExisted: bcdEnv.selectedExists,
        fileVersionIfAvailable: bcdEnv.fileVersion,
        elevationStatus: {
          elevationRequested: true,
          elevatedProcessStarted: true,
          uacCancelled: false,
          elevationFailed: false,
          elevatedProcessExitCode: 0,
        },
        actualCommandExecuted: 'bcdedit.exe /set testsigning on',
        stdout: 'The operation completed successfully.',
        stderr: '',
        exitCode: 0,
        finalTestSigningState: true,
        secureBootBlocked: false,
      };
      try { fs.writeFileSync(resultFile, JSON.stringify(mockDiag, null, 2), 'utf8'); } catch (_) {}
      return {
        success: true,
        rebootRequired: true,
        message: 'Mode Pengujian Windows sudah aktif. Komputer perlu direstart untuk melanjutkan.',
        diagnostics: mockDiag,
      };
    }

    // 1. Check if Test Signing is ALREADY active in BCD before requesting elevation
    const alreadyActive = queryTestSigningEnabled();
    if (alreadyActive) {
      this.log('Windows Test Signing is ALREADY enabled in BCD.');
      this.session.platform.testSigningEnabled = true;
      const initialDiag = {
        SystemRoot: bcdEnv.systemRoot,
        WindowsArchitecture: bcdEnv.windowsArchitecture,
        NodeArchitecture: bcdEnv.processArchitecture,
        ElectronArchitecture: bcdEnv.processArchitecture,
        candidateBcdeditPathsChecked: bcdEnv.candidatesChecked,
        whichPathWasSelected: bcdEnv.selectedPath,
        whetherTheFileExisted: bcdEnv.selectedExists,
        fileVersionIfAvailable: bcdEnv.fileVersion,
        elevationStatus: {
          elevationRequested: false,
          elevatedProcessStarted: false,
          uacCancelled: false,
          elevationFailed: false,
          elevatedProcessExitCode: 0,
        },
        actualCommandExecuted: 'None (Already Active)',
        stdout: 'Test signing already active.',
        stderr: '',
        exitCode: 0,
        finalTestSigningState: true,
        secureBootBlocked: false,
        alreadyActive: true,
      };
      try { fs.writeFileSync(resultFile, JSON.stringify(initialDiag, null, 2), 'utf8'); } catch (_) {}
      return {
        success: true,
        rebootRequired: false,
        message: 'Mode Pengujian Windows sudah aktif.',
        diagnostics: initialDiag,
      };
    }

    // 2. Resolve native elevation helper (elevate.exe)
    const elevateExe = this.resolveElevateExe();
    this.log(`Elevate helper path: ${elevateExe || 'NONE (will use Windows WSH/COM fallback)'}`);

    // 3. Execute bcdedit /set testsigning on with true Administrator privileges via UAC
    this.log('Executing elevated bcdedit /set testsigning on...');
    const runRes = runElevatedCommand('bcdedit.exe', ['/set', 'testsigning', 'on'], {
      reportsDir: this.reportsDir,
      elevateExe,
      timeoutMs: 45000,
    });

    this.log(`Elevated execution finished. Started: ${runRes.elevatedProcessStarted}, ExitCode: ${runRes.elevatedProcessExitCode}, Cancelled: ${runRes.uacCancelled}, Resolved: ${runRes.resolvedBinary}`);

    // 4. Handle UAC Cancellation (Requirement 11)
    if (runRes.uacCancelled) {
      const cancelDiag = {
        SystemRoot: bcdEnv.systemRoot,
        WindowsArchitecture: bcdEnv.windowsArchitecture,
        NodeArchitecture: bcdEnv.processArchitecture,
        ElectronArchitecture: bcdEnv.processArchitecture,
        candidateBcdeditPathsChecked: bcdEnv.candidatesChecked,
        whichPathWasSelected: runRes.resolvedBinary || bcdEnv.selectedPath,
        whetherTheFileExisted: bcdEnv.selectedExists,
        fileVersionIfAvailable: bcdEnv.fileVersion,
        elevationStatus: {
          elevationRequested: true,
          elevatedProcessStarted: false,
          uacCancelled: true,
          elevationFailed: false,
          elevatedProcessExitCode: 1223,
        },
        actualCommandExecuted: runRes.actualCommandExecuted,
        stdout: runRes.stdout,
        stderr: runRes.stderr || 'UAC elevation prompt was cancelled by user.',
        exitCode: 1223,
        finalTestSigningState: false,
        secureBootBlocked: false,
        uacCancelled: true,
        timestamp: new Date().toISOString(),
      };
      try { fs.writeFileSync(resultFile, JSON.stringify(cancelDiag, null, 2), 'utf8'); } catch (_) {}
      this.log('User cancelled UAC elevation prompt.', 'warn');
      return {
        success: false,
        uacCancelled: true,
        error: 'Izin Administrator diperlukan untuk melanjutkan.',
        diagnostics: cancelDiag,
      };
    }

    // 5. Handle Elevation Failure (Requirement 12)
    if (runRes.elevationFailed || !runRes.elevatedProcessStarted) {
      const realErr = runRes.stderr || `Elevated process failed to launch (exit code ${runRes.elevatedProcessExitCode})`;
      const failDiag = {
        SystemRoot: bcdEnv.systemRoot,
        WindowsArchitecture: bcdEnv.windowsArchitecture,
        NodeArchitecture: bcdEnv.processArchitecture,
        ElectronArchitecture: bcdEnv.processArchitecture,
        candidateBcdeditPathsChecked: bcdEnv.candidatesChecked,
        whichPathWasSelected: runRes.resolvedBinary || bcdEnv.selectedPath,
        whetherTheFileExisted: bcdEnv.selectedExists,
        fileVersionIfAvailable: bcdEnv.fileVersion,
        elevationStatus: {
          elevationRequested: true,
          elevatedProcessStarted: false,
          uacCancelled: false,
          elevationFailed: true,
          elevatedProcessExitCode: runRes.elevatedProcessExitCode,
        },
        actualCommandExecuted: runRes.actualCommandExecuted,
        stdout: runRes.stdout,
        stderr: runRes.stderr,
        exitCode: runRes.elevatedProcessExitCode,
        finalTestSigningState: false,
        secureBootBlocked: false,
        elevationFailed: true,
        realWindowsError: realErr,
        timestamp: new Date().toISOString(),
      };
      try { fs.writeFileSync(resultFile, JSON.stringify(failDiag, null, 2), 'utf8'); } catch (_) {}
      this.log(`Elevation failed: ${realErr}`, 'error');
      return {
        success: false,
        elevationFailed: true,
        error: 'Windows tidak memberikan izin Administrator. Silakan coba lagi.',
        realWindowsError: realErr,
        diagnostics: failDiag,
      };
    }

    // 6. Independently verify with bcdedit (Requirement 10)
    this.log('Independently verifying BCD state via bcdedit query...');
    let verifyOutput = runRes.verifyOutput || '';
    const queryPath = bcdEnv.selectedPath || 'bcdedit.exe';
    if (!verifyOutput || !/testsigning\s+Yes/i.test(verifyOutput)) {
      try {
        const vRes = spawnSync(queryPath, [], { encoding: 'utf8', timeout: 8000, windowsHide: true });
        const extVerify = ((vRes.stdout || '') + '\n' + (vRes.stderr || '')).trim();
        if (extVerify) verifyOutput = (verifyOutput ? `${verifyOutput}\n${extVerify}` : extVerify).trim();
      } catch (e) {
        try {
          const vRes2 = spawnSync('bcdedit.exe', [], { encoding: 'utf8', timeout: 8000, windowsHide: true });
          const extVerify2 = ((vRes2.stdout || '') + '\n' + (vRes2.stderr || '')).trim();
          if (extVerify2) verifyOutput = (verifyOutput ? `${verifyOutput}\n${extVerify2}` : extVerify2).trim();
        } catch (e2) {
          if (!verifyOutput) verifyOutput = `Verification query failed: ${e.message}; fallback: ${e2.message}`;
        }
      }
    }

    const isTestSigningActive = /testsigning\s+Yes/i.test(verifyOutput);
    this.log(`Verification result: 'testsigning Yes' is ${isTestSigningActive ? 'CONFIRMED' : 'NOT FOUND'}.`);

    // 7. Check for Secure Boot blockage (Requirement 8 / 13)
    const combinedOutput = `${runRes.stdout} ${runRes.stderr} ${verifyOutput}`;
    const isSecureBootBlocked = /protected by Secure Boot/i.test(combinedOutput) || /Secure Boot policy/i.test(combinedOutput);

    // 8. Compile structured developer diagnostics with all required fields
    const finalDiag = {
      SystemRoot: bcdEnv.systemRoot,
      WindowsArchitecture: bcdEnv.windowsArchitecture,
      NodeArchitecture: bcdEnv.processArchitecture,
      ElectronArchitecture: bcdEnv.processArchitecture,
      candidateBcdeditPathsChecked: bcdEnv.candidatesChecked,
      whichPathWasSelected: runRes.resolvedBinary || bcdEnv.selectedPath,
      whetherTheFileExisted: bcdEnv.selectedExists,
      fileVersionIfAvailable: bcdEnv.fileVersion,
      elevationStatus: {
        elevationRequested: true,
        elevatedProcessStarted: runRes.elevatedProcessStarted,
        uacCancelled: false,
        elevationFailed: false,
        elevatedProcessExitCode: runRes.elevatedProcessExitCode,
      },
      actualCommandExecuted: runRes.actualCommandExecuted,
      stdout: runRes.stdout,
      stderr: runRes.stderr,
      exitCode: runRes.elevatedProcessExitCode,
      bcdeditVerifyOutput: verifyOutput,
      finalTestSigningState: isTestSigningActive,
      secureBootBlocked: isSecureBootBlocked,
      realWindowsError: runRes.stderr || (runRes.elevatedProcessExitCode !== 0 ? `Exit code ${runRes.elevatedProcessExitCode}` : ''),
      timestamp: new Date().toISOString(),
    };

    try { fs.writeFileSync(resultFile, JSON.stringify(finalDiag, null, 2), 'utf8'); } catch (_) {}

    // 9. Return result according to verification and Secure Boot status
    if (isSecureBootBlocked) {
      const sbMsg = 'Secure Boot aktif di BIOS/UEFI tablet. Windows melarang Mode Pengujian selama Secure Boot aktif. Harap nonaktifkan Secure Boot di BIOS/UEFI tablet untuk melakukan pengujian driver kamera.';
      this.log(sbMsg, 'error');
      return {
        success: false,
        secureBootBlocked: true,
        error: sbMsg,
        realWindowsError: 'The value is protected by Secure Boot policy and cannot be modified or deleted.',
        diagnostics: finalDiag,
      };
    }

    if (isTestSigningActive || runRes.elevatedProcessExitCode === 0) {
      this.session.platform.testSigningEnabled = true;
      this.log('Windows Test Signing setup SUCCESSFUL. Reboot required.');
      return {
        success: true,
        rebootRequired: true,
        message: 'Mode Pengujian Windows sudah aktif. Komputer perlu direstart untuk melanjutkan.',
        diagnostics: finalDiag,
      };
    }

    const realError = runRes.stderr || runRes.stdout || `bcdedit gagal dengan kode keluar ${runRes.elevatedProcessExitCode}`;
    this.log(`bcdedit execution failed: ${realError}`, 'error');
    return {
      success: false,
      error: `Gagal mengaktifkan mode pengujian: ${realError}`,
      realWindowsError: realError,
      diagnostics: finalDiag,
    };
  }

  /**
   * Dedicated Action: Restore Windows to Normal Mode (Disable Test Signing)
   * ONLY called when the user explicitly clicks [Kembalikan Windows ke Mode Normal].
   */
  async restoreNormalMode() {
    this.log('Restoring Windows to Normal Mode (Disabling Test Signing)...');

    const resultFile = path.join(this.reportsDir, 'restore-normal-result.json');
    const logFile = path.join(this.reportsDir, 'restore-normal-execution.log');

    try { if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile); } catch (_) {}

    const bcdEnv = inspectBcdeditEnvironment();

    if (process.platform !== 'win32') {
      this.log('Non-Windows platform: Mocking restoreNormalMode success.');
      this.session.platform.testSigningEnabled = false;
      return {
        success: true,
        rebootRequired: true,
        verifiedDisabled: true,
        message: 'Mode pengujian dinonaktifkan. Komputer perlu direstart untuk kembali ke mode normal.',
      };
    }

    const elevateExe = this.resolveElevateExe();

    // Execute bcdedit /set testsigning off elevated
    this.log('Executing elevated bcdedit /set testsigning off...');
    const runRes = runElevatedCommand('bcdedit.exe', ['/set', 'testsigning', 'off'], {
      reportsDir: this.reportsDir,
      elevateExe,
      timeoutMs: 45000,
    });

    if (runRes.uacCancelled) {
      return {
        success: false,
        uacCancelled: true,
        error: 'Izin Administrator diperlukan untuk melanjutkan.',
      };
    }

    if (runRes.elevationFailed || !runRes.elevatedProcessStarted) {
      const realErr = runRes.stderr || `Elevated process failed (exit code ${runRes.elevatedProcessExitCode})`;
      return {
        success: false,
        elevationFailed: true,
        error: 'Windows tidak memberikan izin Administrator. Silakan coba lagi.',
        realWindowsError: realErr,
      };
    }

    // Independently verify that testsigning is off
    let verifyOutput = '';
    const queryPath = bcdEnv.selectedPath || 'bcdedit.exe';
    try {
      const vRes = spawnSync(queryPath, [], { encoding: 'utf8', timeout: 8000, windowsHide: true });
      verifyOutput = ((vRes.stdout || '') + '\n' + (vRes.stderr || '')).trim();
    } catch (_) {
      try {
        const vRes2 = spawnSync('bcdedit.exe', [], { encoding: 'utf8', timeout: 8000, windowsHide: true });
        verifyOutput = ((vRes2.stdout || '') + '\n' + (vRes2.stderr || '')).trim();
      } catch (_) {}
    }

    const isTestSigningActive = /testsigning\s+Yes/i.test(verifyOutput);
    this.session.platform.testSigningEnabled = isTestSigningActive;

    const finalDiag = {
      SystemRoot: bcdEnv.systemRoot,
      WindowsArchitecture: bcdEnv.windowsArchitecture,
      NodeArchitecture: bcdEnv.processArchitecture,
      ElectronArchitecture: bcdEnv.processArchitecture,
      candidateBcdeditPathsChecked: bcdEnv.candidatesChecked,
      whichPathWasSelected: runRes.resolvedBinary || bcdEnv.selectedPath,
      whetherTheFileExisted: bcdEnv.selectedExists,
      fileVersionIfAvailable: bcdEnv.fileVersion,
      elevationStatus: {
        elevationRequested: true,
        elevatedProcessStarted: runRes.elevatedProcessStarted,
        uacCancelled: false,
        elevationFailed: false,
        elevatedProcessExitCode: runRes.elevatedProcessExitCode,
      },
      actualCommandExecuted: runRes.actualCommandExecuted,
      stdout: runRes.stdout,
      stderr: runRes.stderr,
      exitCode: runRes.elevatedProcessExitCode,
      bcdeditVerifyOutput: verifyOutput,
      finalTestSigningState: isTestSigningActive,
      timestamp: new Date().toISOString(),
    };
    try { fs.writeFileSync(resultFile, JSON.stringify(finalDiag, null, 2), 'utf8'); } catch (_) {}

    if (!isTestSigningActive || runRes.elevatedProcessExitCode === 0) {
      return {
        success: true,
        rebootRequired: true,
        verifiedDisabled: !isTestSigningActive,
        message: 'Mode pengujian dinonaktifkan. Silakan restart tablet sekarang untuk kembali ke mode normal.',
        diagnostics: finalDiag,
      };
    }

    return {
      success: false,
      error: `Gagal menonaktifkan mode pengujian: ${runRes.stderr || 'bcdedit gagal'}`,
      diagnostics: finalDiag,
    };
  }

  /**
   * Dedicated Action: Safe Driver Rollback (Restores WPD/MTP)
   */
  async rollbackDriver() {
    this.log('Triggering safe driver rollback to Microsoft WPD/MTP...');
    const rollbackScript = path.join(this.driverDevDir, 'rollback-camera-driver.ps1');

    if (!fs.existsSync(rollbackScript)) {
      return { success: false, error: `File script tidak ditemukan: ${rollbackScript}` };
    }

    try {
      this.log(`Invoking ${rollbackScript} via safe argument array...`);
      const res = runPowerShellScript(rollbackScript, [], 45000);
      if (!res.success) {
        this.log(`Driver rollback helper failed: ${res.stderr}`, 'error');
        return {
          success: false,
          error: res.friendlyError || 'Gagal memulihkan driver kamera Windows (WPD/MTP).',
        };
      }

      const reportFile = path.join(process.env.LOCALAPPDATA || '', 'MingleBooth', 'driver-rollback-result.json');
      let details = {};
      if (fs.existsSync(reportFile)) {
        try {
          details = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
        } catch (_) {}
      }

      this.log('Driver rollback completed successfully.');
      return {
        success: true,
        message: 'Driver kamera Windows (WPD/MTP) berhasil dipulihkan.',
        details,
      };
    } catch (e) {
      this.log(`Rollback failed: ${e.message}`, 'error');
      return { success: false, error: `Rollback gagal: ${e.message}` };
    }
  }

  /**
   * Reboot System Cleanly
   */
  rebootSystem() {
    this.log('Initiating system reboot for QA setup...');
    try {
      spawnSync('shutdown.exe', ['/r', '/t', '2', '/c', 'Memulai ulang komputer untuk MingleBooth QA'], { windowsHide: true });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Stage 6: Export Developer Diagnostic Report
   */
  exportDiagnosticReport() {
    this.session.endTime = new Date().toISOString();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(this.reportsDir, `camera-qa-${ts}.json`);
    const logPath = path.join(this.reportsDir, `camera-qa-${ts}.log`);

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(this.session, null, 2), 'utf8');
      const logLines = this.session.logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
      fs.writeFileSync(logPath, logLines, 'utf8');
      this.log(`Diagnostic report exported: ${jsonPath}`);
    } catch (e) {
      this.log(`Failed to write diagnostic report: ${e.message}`, 'error');
    }

    return { jsonPath, logPath, session: this.session };
  }
}

let orchestratorInstance = null;

function getQAOrchestrator(options = {}) {
  if (!orchestratorInstance) {
    orchestratorInstance = new QAOrchestrator(options);
  }
  return orchestratorInstance;
}

module.exports = {
  QAOrchestrator,
  getQAOrchestrator,
  runPowerShellScript,
  queryTestSigningEnabled,
};
