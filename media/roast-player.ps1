# Error Roaster - Floating Video Player (forced playback version)
param(
    [Parameter(Mandatory = $true)]
    [string]$VideoPath
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

Write-Host "=== Error Roaster Player ==="
Write-Host "VideoPath = $VideoPath"

if (-not (Test-Path -LiteralPath $VideoPath)) {
    [System.Windows.Forms.MessageBox]::Show("Video file not found:`n$VideoPath", "Error Roaster") | Out-Null
    exit 1
}

$fullPath = (Resolve-Path -LiteralPath $VideoPath).Path
Write-Host "Full path: $fullPath"

$uriString = "file:///" + $fullPath.Replace("\", "/")
$uri = [Uri]$uriString
Write-Host "URI: $uriString"

$script:playCount = 0
$maxPlays = 3
$script:opened = $false

$window = New-Object System.Windows.Window
$window.Title = "Error Roaster"
$window.Width = 360
$window.Height = 640
$window.WindowStyle = "None"
$window.Background = "Black"
$window.Topmost = $true
$window.ResizeMode = "NoResize"
$window.WindowStartupLocation = "CenterScreen"
$window.ShowInTaskbar = $true

$window.Add_MouseLeftButtonDown({ try { $window.DragMove() } catch {} })

$closeBtn = New-Object System.Windows.Controls.Button
$closeBtn.Content = "X"
$closeBtn.Width = 30
$closeBtn.Height = 30
$closeBtn.HorizontalAlignment = "Right"
$closeBtn.VerticalAlignment = "Top"
$closeBtn.Margin = "0,5,5,0"
$closeBtn.Background = "Transparent"
$closeBtn.Foreground = "White"
$closeBtn.BorderThickness = 0
$closeBtn.FontSize = 16
$closeBtn.FontWeight = "Bold"
$closeBtn.Add_Click({ $window.Close() })

$media = New-Object System.Windows.Controls.MediaElement
$media.LoadedBehavior = "Manual"
$media.UnloadedBehavior = "Manual"
$media.Stretch = "Uniform"
$media.Volume = 1.0
$media.IsMuted = $false
$media.ScrubbingEnabled = $true

$grid = New-Object System.Windows.Controls.Grid
[void]$grid.Children.Add($media)
[void]$grid.Children.Add($closeBtn)
$window.Content = $grid

$media.Add_MediaOpened({
    $script:opened = $true
    Write-Host "MediaOpened - starting Play()"
    $media.Play()
})

$media.Add_MediaEnded({
    $script:playCount++
    Write-Host "MediaEnded - count = $script:playCount"
    if ($script:playCount -ge $maxPlays) {
        Write-Host "3 plays finished - closing"
        $window.Close()
    } else {
        $media.Position = [TimeSpan]::Zero
        $media.Play()
    }
})

$media.Add_MediaFailed({
    param($s, $e)
    $msg = "MediaFailed"
    if ($e.ErrorException) { $msg = $e.ErrorException.Message }
    Write-Host "ERROR: $msg"
    [System.Windows.Forms.MessageBox]::Show("Cannot play video:`n$msg`n`nFile = $fullPath", "Error Roaster") | Out-Null
    $window.Close()
})

$window.Add_KeyDown({
    param($s, $e)
    if ($e.Key -eq "Escape") { $window.Close() }
})

$window.Add_Loaded({
    Write-Host "Window Loaded - assigning Source and forcing Play"
    $media.Source = $uri
    Start-Sleep -Milliseconds 300
    try {
        $media.Play()
        Write-Host "Forced Play() called"
    } catch {
        Write-Host "Forced Play failed: $_"
    }
})

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(4)
$timer.Add_Tick({
    $timer.Stop()
    if (-not $script:opened) {
        Write-Host "TIMEOUT: MediaOpened never fired"
        [System.Windows.Forms.MessageBox]::Show(
            "Video did not start playing.`n`nPossible causes:`n- Windows Media codecs missing`n- Unsupported MP4`n`nFile: $fullPath",
            "Error Roaster - Timeout"
        ) | Out-Null
        $window.Close()
    }
})
$timer.Start()

Write-Host "ShowDialog starting..."
$window.ShowDialog() | Out-Null
Write-Host "Finished. playCount = $script:playCount"
exit 0
