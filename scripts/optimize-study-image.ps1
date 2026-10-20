param(
  [string]$Source = "public/images/japanese-study-desk.png",
  [string]$Destination = "public/images/japanese-study-desk.jpg",
  [int]$Width = 1280,
  [int]$Quality = 82
)

Add-Type -AssemblyName System.Drawing

$sourcePath = (Resolve-Path $Source).Path
$destinationPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Destination))
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$height = [Math]::Round($sourceImage.Height * $Width / $sourceImage.Width)
$bitmap = New-Object System.Drawing.Bitmap($Width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.DrawImage($sourceImage, 0, 0, $Width, $height)

  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' }
  $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality,
    [long]$Quality
  )
  $bitmap.Save($destinationPath, $jpegCodec, $encoderParameters)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
  $sourceImage.Dispose()
}
