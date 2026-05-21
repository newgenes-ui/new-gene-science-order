Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\admin\.gemini\antigravity\brain\f9b97c13-7b84-40f4-b861-9cef1d19099e\media__1779107514821.png"
$outputPath = Join-Path $PSScriptRoot "..\public\stamp.png"

$bmp = New-Object System.Drawing.Bitmap($sourcePath)
$width = $bmp.Width
$height = $bmp.Height

# We will scan the representative area: X[400 to 600], Y[100 to 300]
$startX = 400
$endX = 600
$startY = 100
$endY = 300

# Count red pixels to find the center of the circular seal
$sumX = 0
$sumY = 0
$count = 0

for ($y = $startY; $y -lt $endY; $y++) {
    for ($x = $startX; $x -lt $endX; $x++) {
        if ($x -ge 0 -and $x -lt $width -and $y -ge 0 -and $y -lt $height) {
            $color = $bmp.GetPixel($x, $y)
            # Red pixel check
            if ($color.R -gt 150 -and $color.G -lt 110 -and $color.B -lt 110) {
                $sumX += $x
                $sumY += $y
                $count++
            }
        }
    }
}

if ($count -gt 0) {
    # Calculate the exact center of the red circular stamp
    $centerX = [int]($sumX / $count)
    $centerY = [int]($sumY / $count)
    Write-Output "Found stamp center at: X=$centerX, Y=$centerY (based on $count red pixels)"
    
    # We crop a perfect square (diameter of the stamp is around 100-110 pixels)
    $size = 110
    $cropX = $centerX - [int]($size / 2)
    $cropY = $centerY - [int]($size / 2)
    
    # Boundary checks
    if ($cropX -lt 0) { $cropX = 0 }
    if ($cropY -lt 0) { $cropY = 0 }
    if ($cropX + $size -gt $width) { $size = $width - $cropX }
    if ($cropY + $size -gt $height) { $size = $height - $cropY }
    
    Write-Output "Cropping a perfect square stamp at: X=$cropX, Y=$cropY, Size=$size x $size"
    
    $stampBmp = New-Object System.Drawing.Bitmap($size, $size)
    
    for ($y = 0; $y -lt $size; $y++) {
        for ($x = 0; $x -lt $size; $x++) {
            $origColor = $bmp.GetPixel($cropX + $x, $cropY + $y)
            
            # Check if this pixel is red (part of the stamp)
            # If it's red, we keep it. If it's white or another color, we make it transparent.
            if ($origColor.R -gt 130 -and $origColor.G -lt 140 -and $origColor.B -lt 140) {
                $stampBmp.SetPixel($x, $y, $origColor)
            } else {
                $transparentColor = [System.Drawing.Color]::FromArgb(0, 255, 255, 255)
                $stampBmp.SetPixel($x, $y, $transparentColor)
            }
        }
    }
    
    if (Test-Path $outputPath) {
        Remove-Item $outputPath -Force
    }
    $stampBmp.Save($outputPath)
    $stampBmp.Dispose()
    Write-Output "Successfully saved perfect square cropped stamp to $outputPath!"
} else {
    Write-Error "No red pixels found in the target representative area."
}

$bmp.Dispose()
