package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QrTest {
    @Test
    fun `encodes a square matrix with dark modules`() {
        val matrix = Qr.encodeMatrix("BLDEMO42", 200)
        assertEquals(200, matrix.width)
        assertEquals(200, matrix.height)
        assertTrue((0 until 200).any { x -> (0 until 200).any { y -> matrix[x, y] } })
    }
}
