# Error Roaster

**A fun Visual Studio Code extension for Windows** that automatically plays a funny reaction video whenever a terminal command or VS Code task fails.

The video appears in a small floating desktop window (not a Webview), plays with original audio three times, then closes automatically.

---

## Features

- **Automatic terminal failure detection** – uses VS Code shell integration. Triggers only on real non-zero exit codes.
- **Automatic task failure detection** – listens to `onDidEndTaskProcess`.
- **Manual test command** – `Error Roaster: Test Reaction Video` (always available, bypasses cooldown).
- **Floating WPF window** – always-on-top, draggable, Escape or × to close, black background.
- **Configurable cooldown** (default 30 seconds).
- **Independent toggles** for terminal and task triggers.
- **Detailed Output Channel** (`Error Roaster`) for full diagnostics.

## Requirements

- **Windows 10 or Windows 11** only
- Visual Studio Code 1.93.0 or later
- No extra media players needed (uses built-in WPF MediaElement via PowerShell)

On non-Windows platforms the extension activates but shows a clear warning and refuses to play video.

## Installation

### From Marketplace (after publishing)

Search for **Error Roaster** in the Extensions view.

### From VSIX

1. Download the latest `.vsix` from [Releases](https://github.com/Matinfly-slp/error-roaster/releases) or build it yourself.
2. In VS Code: `Extensions: Install from VSIX…`

### Development

```bash
git clone https://github.com/Matinfly-slp/error-roaster.git
cd error-roaster
npm install
npm run compile
# Press F5 in VS Code
```

## Usage

1. Make sure shell integration is enabled in your terminal (default in modern VS Code).
2. Run a failing command (e.g. `nonexistent-command`).
3. The reaction video appears in a floating window, plays three times, and closes.
4. Manual test anytime: `Ctrl+Shift+P` → **Error Roaster: Test Reaction Video`.

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `errorRoaster.cooldownSeconds` | number | 30 | Seconds between automatic plays (0 = no cooldown) |
| `errorRoaster.playOnTerminalFailure` | boolean | true | React to terminal command failures |
| `errorRoaster.playOnTaskFailure` | boolean | true | React to VS Code task failures |

### Diagnostics

Open **View → Output** and select **Error Roaster** from the dropdown.  
It logs activation, detections, cooldown decisions, file paths, PowerShell output, and errors.

## Project Structure

```
error-roaster/
├── src/
│   └── extension.ts          # Main extension logic
├── media/
│   ├── roast.mp4             # Reaction video (replace with your own)
│   └── roast-player.ps1      # WPF floating player script
├── out/
│   └── extension.js          # Compiled output
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── package.json
├── tsconfig.json
├── .gitignore
├── .vscodeignore
├── LICENSE
└── README.md
```

## Building & Packaging

```bash
npm install
npm run compile
npx vsce package
```

This produces `error-roaster-1.0.0.vsix`.

## Replacing the Video

Overwrite `media/roast.mp4` with your own MP4 (H.264 + AAC recommended).  
Keep the same filename or update the paths in the code.

## How the Player Works

- Extension spawns `powershell.exe -STA -File roast-player.ps1 -VideoPath <absolute-path>`
- Creates a borderless, top-most WPF window
- Plays the video with original audio, loops exactly 3 times, then closes
- User can close early with × or Escape

## License

MIT

---

Made for fun. Enjoy the roasts. 🔥
