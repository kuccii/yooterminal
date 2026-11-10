package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TicketFormatterTest {
    private val sample = Ticket(
        operatorName = "RWENZORI EXPRESS",
        originCity = "Kampala",
        destinationCity = "Kigali",
        travelDate = "Sat 14 Nov 2026",
        departureTime = "07:00",
        passengerName = "John Doe",
        seat = "12A",
        passengerIndex = 1,
        passengerCount = 2,
        bookingRef = "BLDEMO42",
        amountLabel = "UGX 45,000",
        paymentLabel = "CASH",
        contactPhone = "+256700000000",
        issuedAt = "09 Nov 2026 14:32",
        reprintCount = 0,
    )

    @Test
    fun `renders the 58mm layout`() {
        val lines = TicketFormatter.format(sample).map { line ->
            when (line) {
                is TicketLine.Text -> line.value
                is TicketLine.Qr -> "QR:${line.content}"
            }
        }
        assertEquals(
            listOf(
                "YOOTERMINAL",
                "RWENZORI EXPRESS",
                "--------------------------------",
                "Kampala  ->  Kigali",
                "Sat 14 Nov 2026      07:00",
                "Seat 12A     1 of 2 passengers",
                "--------------------------------",
                "PASSENGER",
                "John Doe",
                "--------------------------------",
                "REF  BLDEMO42",
                "QR:BLDEMO42",
                "--------------------------------",
                "Paid  UGX 45,000    CASH",
                "Contact  +256700000000",
                "Issued   09 Nov 2026 14:32",
                "--------------------------------",
                "Thank you for travelling",
            ),
            lines,
        )
    }

    @Test
    fun `wraps a long passenger name without losing characters`() {
        val name = "Bartholomew Nkusiwagila Musinguzi"
        val lines = TicketFormatter.wrap(name)
        assertTrue(lines.all { it.length <= TicketFormatter.WIDTH })
        assertEquals(name, lines.joinToString(" "))
    }

    @Test
    fun `hard splits a long non-ascii word without breaking surrogate pairs`() {
        val word = "\uD83D\uDE42".repeat(40)
        val lines = TicketFormatter.wrap(word, 5)
        assertTrue(lines.all { it.length <= 5 })
        assertEquals(word, lines.joinToString(""))
        assertTrue(lines.none { it.lastOrNull()?.isHighSurrogate() == true })
        assertTrue(lines.none { it.firstOrNull()?.isLowSurrogate() == true })
    }

    @Test
    fun `adds a reprint marker`() {
        val text = TicketFormatter.format(sample.copy(reprintCount = 2))
            .filterIsInstance<TicketLine.Text>()
            .map { it.value }
        assertTrue(text.any { it.contains("REPRINT 2") })
    }
}
