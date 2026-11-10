package com.yooterminal.pos.printer

import android.graphics.Bitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

/** Rendered QR pixels, kept free of `android.graphics` so it can be unit tested. */
class QrPixels(val width: Int, val height: Int, val argb: IntArray) {
    fun isDark(x: Int, y: Int): Boolean = argb[y * width + x] == DARK

    companion object {
        val DARK = 0xFF000000.toInt()
        val LIGHT = 0xFFFFFFFF.toInt()
    }
}

object Qr {

    /**
     * The QR spec requires a four-module quiet zone. One module (the previous
     * value) left the code almost touching the 58 mm head's unreliable edge.
     */
    const val QUIET_ZONE_MODULES = 4

    /** Renders at [sizePx] square; the vendor rejects bitmaps wider than 384. */
    fun encodePixels(content: String, sizePx: Int): QrPixels {
        require(content.isNotEmpty()) { "QR content must not be empty" }
        require(sizePx in 1..384) { "sizePx must be 1..384, was $sizePx" }

        val matrix = QRCodeWriter().encode(
            content,
            BarcodeFormat.QR_CODE,
            sizePx,
            sizePx,
            mapOf(EncodeHintType.MARGIN to QUIET_ZONE_MODULES),
        )

        val width = matrix.width
        val height = matrix.height
        val argb = IntArray(width * height)
        for (y in 0 until height) {
            val row = y * width
            for (x in 0 until width) {
                argb[row + x] = if (matrix[x, y]) QrPixels.DARK else QrPixels.LIGHT
            }
        }
        return QrPixels(width, height, argb)
    }

    fun toBitmap(pixels: QrPixels): Bitmap =
        Bitmap.createBitmap(pixels.argb, pixels.width, pixels.height, Bitmap.Config.ARGB_8888)
}
