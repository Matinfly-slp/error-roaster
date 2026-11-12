import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

const OUTPUT_CHANNEL_NAME = 'Error Roaster';
const COMMAND_ID = 'errorRoaster.testReaction';

let outputChannel: vscode.OutputChannel;
let lastAutoPlayTime = 0;
let playerProcess: ChildProcess | null = null;
let extensionPath: string;

function log(message: string): void {
    const ts = new Date().toISOString();
    outputChannel.appendLine(`[${ts}] ${message}`);
}

function getConfig() {
    const cfg = vscode.workspace.getConfiguration('errorRoaster');
    return {
        cooldownSeconds: cfg.get<number>('cooldownSeconds', 30),
        playOnTerminalFailure: cfg.get<boolean>('playOnTerminalFailure', true),
        playOnTaskFailure: cfg.get<boolean>('playOnTaskFailure', true),
    };
}

function isWindows(): boolean {
    return process.platform === 'win32';
}

function getMediaPaths(): { videoPath: string; scriptPath: string } {
    const mediaDir = path.join(extensionPath, 'media');
    return {
        videoPath: path.join(mediaDir, 'roast.mp4'),
        scriptPath: path.join(mediaDir, 'roast-player.ps1'),
    };
}

function validateMediaFiles(): { ok: boolean; message?: string } {
    const { videoPath, scriptPath } = getMediaPaths();
    if (!fs.existsSync(scriptPath)) {
        return { ok: false, message: `PowerShell player script missing: ${scriptPath}` };
    }
    if (!fs.existsSync(videoPath)) {
        return { ok: false, message: `Video file missing: ${videoPath}` };
    }
    return { ok: true };
}

function canAutoPlay(): boolean {
    const { cooldownSeconds } = getConfig();
    if (cooldownSeconds <= 0) {
        return true;
    }
    const elapsed = (Date.now() - lastAutoPlayTime) / 1000;
    return elapsed >= cooldownSeconds;
}

function isPlayerRunning(): boolean {
    return playerProcess !== null && !playerProcess.killed && playerProcess.exitCode === null;
}

async function launchPlayer(reason: string, bypassCooldown: boolean): Promise<void> {
    log(`Launch requested. Reason: ${reason}, bypassCooldown: ${bypassCooldown}`);

    if (!isWindows()) {
        const msg = 'Error Roaster only supports Windows 10/11. Current platform: ' + process.platform;
        log(msg);
        vscode.window.showErrorMessage(msg);
        return;
    }

    if (isPlayerRunning()) {
        log('Player process already running – skipping new launch.');
        return;
    }

    if (!bypassCooldown && !canAutoPlay()) {
        const { cooldownSeconds } = getConfig();
        const remaining = Math.ceil(cooldownSeconds - (Date.now() - lastAutoPlayTime) / 1000);
        log(`Cooldown active (${remaining}s remaining) – skipping automatic reaction.`);
        return;
    }

    const validation = validateMediaFiles();
    if (!validation.ok) {
        log(`Validation failed: ${validation.message}`);
        vscode.window.showErrorMessage(`Error Roaster: ${validation.message}`);
        outputChannel.show(true);
        return;
    }

    const { videoPath, scriptPath } = getMediaPaths();
    log(`Video path: ${videoPath}`);
    log(`Script path: ${scriptPath}`);

    try {
        const psArgs = [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-STA',
            '-File', scriptPath,
            '-VideoPath', videoPath,
        ];

        log(`Spawning: powershell.exe ${psArgs.join(' ')}`);

        playerProcess = spawn('powershell.exe', psArgs, {
            windowsHide: false,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const pid = playerProcess.pid;
        log(`Player process started (pid=${pid})`);

        if (!bypassCooldown) {
            lastAutoPlayTime = Date.now();
        }

        playerProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                log(`[PS stdout] ${text}`);
            }
        });

        playerProcess.stderr?.on('data', (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                log(`[PS stderr] ${text}`);
            }
        });

        playerProcess.on('error', (err: Error) => {
            log(`Player process error: ${err.message}`);
            vscode.window.showErrorMessage(`Error Roaster failed to start player: ${err.message}`);
            outputChannel.show(true);
            playerProcess = null;
        });

        playerProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            log(`Player process exited. code=${code}, signal=${signal}`);
            playerProcess = null;
        });

        setTimeout(() => {
            if (playerProcess && playerProcess.exitCode !== null) {
                log(`Player exited very quickly with code ${playerProcess.exitCode}`);
            }
        }, 1500);

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Exception while launching player: ${message}`);
        vscode.window.showErrorMessage(`Error Roaster: ${message}`);
        outputChannel.show(true);
        playerProcess = null;
    }
}

export function activate(context: vscode.ExtensionContext): void {
    extensionPath = context.extensionPath;
    outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

    log('Extension activating…');
    log(`Extension path: ${extensionPath}`);
    log(`Platform: ${process.platform}`);

    if (!isWindows()) {
        log('WARNING: Non-Windows platform detected. Automatic and manual playback will be disabled.');
        vscode.window.showWarningMessage(
            'Error Roaster is designed for Windows. Video playback is unavailable on this OS.'
        );
    }

    const testCmd = vscode.commands.registerCommand(COMMAND_ID, async () => {
        log('Manual command "Error Roaster: Test Reaction Video" invoked.');
        await launchPlayer('manual-test', true);
    });
    context.subscriptions.push(testCmd);

    const terminalSub = vscode.window.onDidEndTerminalShellExecution(async (event) => {
        const exitCode = event.exitCode;
        const cmd = event.execution.commandLine?.value ?? '(unknown)';
        log(`Terminal shell execution ended. exitCode=${exitCode}, command=${cmd}`);

        if (exitCode === undefined || exitCode === null) {
            log('Exit code undefined – ignoring (possible Ctrl+C, empty enter, or missing integration).');
            return;
        }

        if (exitCode === 0) {
            log('Command succeeded – no reaction.');
            return;
        }

        const { playOnTerminalFailure } = getConfig();
        if (!playOnTerminalFailure) {
            log('playOnTerminalFailure is disabled – skipping.');
            return;
        }

        log(`Non-zero exit code (${exitCode}) detected – triggering reaction.`);
        await launchPlayer(`terminal-failure:${exitCode}`, false);
    });
    context.subscriptions.push(terminalSub);

    const taskSub = vscode.tasks.onDidEndTaskProcess(async (event) => {
        const exitCode = event.exitCode;
        const taskName = event.execution.task.name;
        log(`Task process ended. task="${taskName}", exitCode=${exitCode}`);

        if (exitCode === undefined || exitCode === null) {
            log('Task exit code undefined – ignoring.');
            return;
        }

        if (exitCode === 0) {
            log('Task succeeded – no reaction.');
            return;
        }

        const { playOnTaskFailure } = getConfig();
        if (!playOnTaskFailure) {
            log('playOnTaskFailure is disabled – skipping.');
            return;
        }

        log(`Task failed with exit code ${exitCode} – triggering reaction.`);
        await launchPlayer(`task-failure:${taskName}:${exitCode}`, false);
    });
    context.subscriptions.push(taskSub);

    context.subscriptions.push(outputChannel);

    log('Extension activated successfully.');
    log('Command registered: ' + COMMAND_ID);
    log('Listening for terminal shell executions and task process ends.');
}

export function deactivate(): void {
    if (playerProcess && !playerProcess.killed) {
        try {
            playerProcess.kill();
        } catch {
            // ignore
        }
        playerProcess = null;
    }
    log('Extension deactivated.');
}
