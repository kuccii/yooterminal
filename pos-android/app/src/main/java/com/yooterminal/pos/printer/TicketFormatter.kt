package com.yooterminal.pos.printer

sealed interface TicketLine {
    data class Text(
        val value: String,
        val align: Align = Align.LEFT,
        val bold: Boolean = false,
    ) : TicketLine

    data class Qr(val content: String) : TicketLine
}

/**
 * Lays a [Ticket] out for a 58 mm head at the printer's default font.
 *
 * Font size is deliberately never changed: the vendor documents that resizing
 * the font changes the character width, which breaks the fixed 32-column
 * layout this formatter relies on.
 */
object TicketFormatter {

    /** Printable characters per line at the default font. */
    const val WIDTH = 32

    private const val COLUMN_GAP = 2
    private const val DIVIDER = "--------------------------------"

    fun format(ticket: Ticket): List<TicketLine> {
        val lines = mutableListOf<TicketLine>()

        lines += TicketLine.Text("YOOTERMINAL", Align.CENTER, bold = true)
        wrap(ticket.operatorName).forEach { lines += TicketLine.Text(it, Align.CENTER) }
        lines += divider()

        val route = "${ticket.originCity} -> ${ticket.destinationCity}"
        if (route.length <= WIDTH) {
            lines += TicketLine.Text(route)
        } else {
            wrap(route).forEach { lines += TicketLine.Text(it) }
        }
        lines += TicketLine.Text(columns(ticket.travelDate, ticket.departureTime))
        lines += TicketLine.Text(clip("Board  ${ticket.boardingPoint}"))
        lines += TicketLine.Text(clip("Closes ${ticket.boardingCloses}"))

        lines += divider()
        lines += TicketLine.Text("PASSENGER", bold = true)
        wrap(ticket.passengerName).forEach { lines += TicketLine.Text(it) }
        lines += TicketLine.Text(clip(ticket.passengerPhone))

        lines += divider()
        lines += TicketLine.Text(columns("Seat ${ticket.seat}", "${ticket.passengerIndex} of ${ticket.passengerCount}"))

        lines += divider()
        lines += TicketLine.Text(clip("REF  ${ticket.bookingRef}"))
        lines += TicketLine.Qr(ticket.qrPayload)
        lines += divider()

        lines += TicketLine.Text(columns(ticket.fareLabel, ticket.paymentLabel))
        lines += TicketLine.Text(clip("Plate  ${ticket.operatorPlate}"))
        lines += TicketLine.Text(clip("Issued ${ticket.issuedAt}"))

        lines += divider()
        lines += TicketLine.Text("Board 15 min before departure", Align.CENTER)
        lines += divider()
        lines += TicketLine.Text("Thank you for travelling", Align.CENTER)

        if (ticket.reprintCount > 0) {
            lines += TicketLine.Text("REPRINT ${ticket.reprintCount}", Align.CENTER)
        }

        // Hard invariant: nothing may exceed the print head width. Every line
        // above is already clamped; this guards future edits to the layout.
        return lines.map { line ->
            if (line is TicketLine.Text && line.value.length > WIDTH) {
                line.copy(value = line.value.take(WIDTH))
            } else {
                line
            }
        }
    }

    /**
     * Greedy word wrap. Words longer than [width] are hard-split without
     * breaking a surrogate pair, so an emoji or a non-BMP name survives intact.
     */
    fun wrap(text: String, width: Int = WIDTH): List<String> {
        val words = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return emptyList()

        val lines = mutableListOf<String>()
        var current = StringBuilder()

        for (word in words) {
            val candidate = if (current.isEmpty()) word else "$current $word"
            if (candidate.length <= width) {
                current = StringBuilder(candidate)
                continue
            }
            if (current.isNotEmpty()) {
                lines += current.toString()
                current = StringBuilder()
            }
            var rest = word
            while (rest.length > width) {
                val cut = safeCut(rest, width)
                lines += rest.substring(0, cut)
                rest = rest.substring(cut)
            }
            current = StringBuilder(rest)
        }

        if (current.isNotEmpty()) lines += current.toString()
        return lines
    }

    /**
     * Two-column row. The right-hand value is preserved in full and the left is
     * clipped, because the right column carries the value the operator reads
     * out ("MOBILE MONEY", "1 of 2"). Never exceeds [WIDTH].
     */
    private fun columns(left: String, right: String): String {
        val rightPart = clip(right)
        val available = (WIDTH - rightPart.length - COLUMN_GAP).coerceAtLeast(0)
        val leftPart = clip(left).take(available)
        val padding = (WIDTH - rightPart.length - leftPart.length).coerceAtLeast(0)
        return leftPart + " ".repeat(padding) + rightPart
    }

    private fun clip(text: String): String =
        if (text.length <= WIDTH) text else text.take(safeCut(text, WIDTH))

    private fun divider() = TicketLine.Text(DIVIDER)

    private fun safeCut(text: String, width: Int): Int {
        var cut = minOf(width, text.length)
        if (cut > 0 && cut < text.length && Character.isHighSurrogate(text[cut - 1])) {
            cut -= 1
        }
        return if (cut == 0) minOf(2, text.length) else cut
    }
}
