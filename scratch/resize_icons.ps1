Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param (
        [string]$SourcePath,
        [string]$TargetPath,
        [int]$Size
    )
    $src = [System.Drawing.Image]::FromFile($SourcePath)
    $dest = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    
    # Enable high quality rendering
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Clear with transparency
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # Calculate dimensions to maintain aspect ratio (fit)
    $srcWidth = $src.Width
    $srcHeight = $src.Height
    
    if ($srcWidth -gt $srcHeight) {
        $destWidth = $Size
        $destHeight = [int]($srcHeight * ($Size / $srcWidth))
    } else {
        $destHeight = $Size
        $destWidth = [int]($srcWidth * ($Size / $srcHeight))
    }
    
    $x = [int](($Size - $destWidth) / 2)
    $y = [int](($Size - $destHeight) / 2)
    
    $g.DrawImage($src, $x, $y, $destWidth, $destHeight)
    
    $dest.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $g.Dispose()
    $dest.Dispose()
    $src.Dispose()
    Write-Output "Successfully resized $SourcePath to $TargetPath at $Size x $Size"
}

# We make a copy of the original icon first to use as a source, because we are overwriting public/icon-192.png
Copy-Item "public/icon-192.png" "public/icon-temp.png" -Force
Resize-Image -SourcePath "public/icon-temp.png" -TargetPath "public/icon-192.png" -Size 192
Resize-Image -SourcePath "public/icon-temp.png" -TargetPath "public/icon-512.png" -Size 512
Remove-Item "public/icon-temp.png" -Force
