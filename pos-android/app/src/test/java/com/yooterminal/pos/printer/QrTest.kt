package com.yooterminal.pos.printer

import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QrTest {

    @Test
    fun `encodes a matrix that actually scans back`() {
        val pixels = Qr.encodePixels("BLDEMO42", 384)

        assertEquals(384, pixels.width)
        assertEquals(384, pixels.height)

        val decoded = MultiFormatReader().decode(
            BinaryBitmap(
                HybridBinarizer(RGBLuminanceSource(pixels.width, pixels.height, pixels.argb))
            )
        )
        assertEquals("BLDEMO42", decoded.text)
    }

    @Test
    fun `keeps a four-module quiet zone`() {
        val pixels = Qr.encodePixels("BLDEMO42", 384)

        val firstDarkColumn = (0 until pixels.width).first { x ->
            (0 until pixels.height).any { y -> pixels.isDark(x, y) }
        }

        // Eight characters fit a version-1 code: 21 modules plus 8 quiet-zone
        // modules = 29 across 384 px, so four modules is about 53 px. Under 40
        // means the quiet zone was reduced below the spec.
        assertTrue(
            "quiet zone was only $firstDarkColumn px",
            firstDarkColumn >= 40,
        )
    }

    @Test
    fun `rejects an empty payload`() {
        val failure = runCatching { Qr.encodePixels("", 384) }.exceptionOrNull()
        assertTrue(failure is IllegalArgumentException)
    }
}
