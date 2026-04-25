using SkiaSharp;
using ZXing;
using ZXing.Common;

/// <summary>
/// Decodes a single QR code from a base64-encoded JPEG/PNG image.
/// Returns the raw text payload, or null if no QR code is found.
/// All exceptions are swallowed — QR scanning is always optional and must never
/// fail a request that has other work to do.
/// </summary>
public class QrScanService
{
    public string? ScanBase64Image(string? imageBase64)
    {
        if (string.IsNullOrEmpty(imageBase64)) return null;
        try
        {
            var bytes = Convert.FromBase64String(imageBase64);
            using var bitmap = SKBitmap.Decode(bytes);
            if (bitmap is null) return null;

            // Convert pixels to a grayscale luminance array for ZXing
            var pixels   = bitmap.Pixels;
            var luminance = new byte[pixels.Length];
            for (var i = 0; i < pixels.Length; i++)
                luminance[i] = (byte)(pixels[i].Red * 0.299 + pixels[i].Green * 0.587 + pixels[i].Blue * 0.114);

            var source = new RGBLuminanceSource(luminance, bitmap.Width, bitmap.Height,
                             RGBLuminanceSource.BitmapFormat.Gray8);

            // New reader per call — BarcodeReaderGeneric works directly from LuminanceSource
            var reader = new BarcodeReaderGeneric
            {
                AutoRotate = true,
                Options    = new DecodingOptions
                {
                    TryHarder       = true,
                    PossibleFormats = new List<BarcodeFormat> { BarcodeFormat.QR_CODE },
                },
            };

            return reader.Decode(source)?.Text;
        }
        catch
        {
            return null;
        }
    }
}
