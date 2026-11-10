package com.yooterminal.pos.printer

sealed interface TicketLine {
    data class Text(
        val value: String,
        val align: Align = Align.LEFT,
        val bold: Boolean = false,
        val size: Float = 24f,
    ) : TicketLine

    data class Qr(
        val content: String,
        val moduleSize: Int = 6,
    ) : TicketLine
}

object TicketFormatter {

    const val WIDTH = 32

    private const val DIVIDER = "--------------------------------"
    private const val DATE_COLUMN = 21
    private const val SEAT_COLUMN = 13
    private const val PAYMENT_COLUMN = 20

    fun format(ticket: Ticket): List<TicketLine> {
        val lines = mutableListOf<TicketLine>()

        lines += TicketLine.Text("YOOTERMINAL", Align.CENTER, bold = true)
        lines += TicketLine.Text(ticket.operatorName, Align.CENTER)
        lines += divider()

        lines += TicketLine.Text("${ticket.originCity}  ->  ${ticket.destinationCity}")
        lines += TicketLine.Text(ticket.travelDate.padEnd(DATE_COLUMN) + ticket.departureTime)
        lines += TicketLine.Text(
            "Seat ${ticket.seat}".padEnd(SEAT_COLUMN) +
                "${ticket.passengerIndex} of ${ticket.passengerCount} passengers"
        )

        lines += divider()
        lines += TicketLine.Text("PASSENGER", bold = true)
        wrap(ticket.passengerName).forEach { lines += TicketLine.Text(it) }

        lines += divider()
        lines += TicketLine.Text("REF  ${ticket.bookingRef}")
        lines += TicketLine.Qr(ticket.bookingRef)
        lines += divider()

        lines += TicketLine.Text("Paid  ${ticket.amountLabel}".padEnd(PAYMENT_COLUMN) + ticket.paymentLabel)
        lines += TicketLine.Text("Contact  ${ticket.contactPhone}")
        lines += TicketLine.Text("Issued   ${ticket.issuedAt}")

        lines += divider()
        lines += TicketLine.Text("Thank you for travelling", Align.CENTER)

        if (ticket.reprintCount > 0) {
            lines += TicketLine.Text("REPRINT ${ticket.reprintCount}", Align.CENTER)
        }

        return lines
    }

    fun wrap(text: String, width: Int = WIDTH): List<String> {
        val words = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
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

        if (current.isNotEmpty()) {
            lines += current.toString()
        }
        return lines
    }

    private fun divider() = TicketLine.Text(DIVIDER)

    private fun safeCut(text: String, width: Int): Int {
        var cut = minOf(width, text.length)
        if (cut > 0 && cut < text.length && Character.isHighSurrogate(text[cut - 1])) {
            cut -= 1
        }
        return if (cut == 0) minOf(2, text.length) else cut
    }
}
