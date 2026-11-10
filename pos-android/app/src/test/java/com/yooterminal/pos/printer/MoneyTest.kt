package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Test

class MoneyTest {

    @Test
    fun `formats currencies without minor units`() {
        assertEquals("UGX 45,000", Money.format(45_000, "UGX"))
        assertEquals("UGX 12,500,000", Money.format(12_500_000, "UGX"))
        assertEquals("RWF 3,000", Money.format(3_000, "rwf"))
    }

    @Test
    fun `formats currencies with minor units`() {
        assertEquals("USD 45.50", Money.format(4_550, "USD"))
        assertEquals("USD 45.05", Money.format(4_505, "USD"))
        assertEquals("KES 0.99", Money.format(99, "KES"))
    }

    @Test
    fun `groups thousands at every boundary`() {
        assertEquals("UGX 0", Money.format(0, "UGX"))
        assertEquals("UGX 999", Money.format(999, "UGX"))
        assertEquals("UGX 1,000", Money.format(1_000, "UGX"))
        assertEquals("UGX 999,999", Money.format(999_999, "UGX"))
        assertEquals("UGX 1,000,000", Money.format(1_000_000, "UGX"))
    }

    @Test
    fun `formats refunds as negative`() {
        assertEquals("UGX -45,000", Money.format(-45_000, "UGX"))
    }
}
