package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TicketFormatterTest {

    private val sample = Ticket(
        operatorName = "RWENZORI EXPRESS",
        operatorPlate = "UBF 123X",
        originCity = "Kampala",
        destinationCity = "Kigali",
        boardingPoint = "Kisenyi Terminal",
        travelDate = "Sat 14 Nov 2026",
        departureTime = "07:00",
        boardingCloses = "06:45",
        passengerName = "John Doe",
        passengerPhone = "+256700000000",
        seat = "12A",
        passengerIndex = 1,
        passengerCount = 2,
        bookingRef = "BLDEMO42",
        fareMinor = 45_000,
        currency = "UGX",
        paymentLabel = "CASH",
        issuedAt = "09 Nov 2026 14:32",
        qrPayload = "BLDEMO42",
        reprintCount = 0,
    )

    @Test
    fun `renders the 58mm layout`() {
        assertEquals(
            listOf(
                "YOOTERMINAL",
                "RWENZORI EXPRESS",
                "--------------------------------",
                "Kampala -> Kigali",
                "Sat 14 Nov 2026" + " ".repeat(12) + "07:00",
                "Board  Kisenyi Terminal",
                "Closes 06:45",
                "--------------------------------",
                "PASSENGER",
                "John Doe",
                "+256700000000",
                "--------------------------------",
                "Seat 12A" + " ".repeat(18) + "1 of 2",
                "--------------------------------",
                "REF  BLDEMO42",
                "QR:BLDEMO42",
                "--------------------------------",
                "UGX 45,000" + " ".repeat(18) + "CASH",
                "Plate  UBF 123X",
                "Issued 09 Nov 2026 14:32",
                "--------------------------------",
                "Board 15 min before departure",
                "--------------------------------",
                "Thank you for travelling",
            ),
            render(sample),
        )
    }

    @Test
    fun `every line fits the print head for adversarial input`() {
        val nasty = sample.copy(
            operatorName = "RWENZORI EXPRESS INTERNATIONAL COACH SERVICES LIMITED",
            originCity = "Kampala Bus Terminal",
            destinationCity = "Kigali Nyabugogo",
            boardingPoint = "Kisenyi Terminal Gate Four",
            passengerName = "Bartholomew Nkusiwagila Musinguzi Kaggwa",
            seat = "VIP-12A",
            passengerIndex = 10,
            passengerCount = 12,
            fareMinor = 12_500_000,
            paymentLabel = "MOBILE MONEY",
        )

        val overflow = render(nasty).filter { it.length > TicketFormatter.WIDTH }
        assertEquals("lines wider than ${TicketFormatter.WIDTH}: $overflow", emptyList<String>(), overflow)
    }

    @Test
    fun `keeps the right-hand column intact when the left one overflows`() {
        val expensive = sample.copy(
            fareMinor = 12_500_000,
            paymentLabel = "MOBILE MONEY",
            seat = "VIP-12A",
            passengerIndex = 10,
            passengerCount = 12,
        )

        val lines = render(expensive)
        val fare = lines.single { it.endsWith("MOBILE MONEY") }
        assertEquals(TicketFormatter.WIDTH, fare.length)

        val seat = lines.single { it.endsWith("10 of 12") }
        assertEquals(TicketFormatter.WIDTH, seat.length)
    }

    @Test
    fun `wraps a long operator name instead of truncating it`() {
        val name = "RWENZORI EXPRESS INTERNATIONAL COACH SERVICES"
        val lines = render(sample.copy(operatorName = name))

        assertTrue(lines.any { it.startsWith("RWENZORI EXPRESS") })
        assertTrue(lines.all { it.length <= TicketFormatter.WIDTH })
        // Nothing is lost, only wrapped.
        assertEquals(name, lines.filter { name.contains(it) }.joinToString(" "))
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
        val lines = render(sample.copy(reprintCount = 2))
        assertTrue(lines.any { it.contains("REPRINT 2") })
    }

    private fun render(ticket: Ticket): List<String> =
        TicketFormatter.format(ticket).map { line ->
            when (line) {
                is TicketLine.Text -> line.value
                is TicketLine.Qr -> "QR:${line.content}"
            }
        }
}
