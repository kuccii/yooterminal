package com.yooterminal.pos.printer

enum class Align(val value: Int) {
    LEFT(0),
    CENTER(1),
    RIGHT(2),
}

/**
 * Everything printed on one passenger's ticket.
 *
 * Dates and times arrive pre-formatted by the caller: the formatter only lays
 * out columns, it does not localise or pick a timezone. [qrPayload] is supplied
 * by the caller because what the code contains is a security decision (a signed
 * token or a verification URL), not a layout one — printing the bare booking
 * reference lets anyone with a printer forge a ticket.
 */
data class Ticket(
    val operatorName: String,
    val operatorPlate: String,
    val originCity: String,
    val destinationCity: String,
    val boardingPoint: String,
    val travelDate: String,
    val departureTime: String,
    val boardingCloses: String,
    val passengerName: String,
    val passengerPhone: String,
    val seat: String,
    val passengerIndex: Int,
    val passengerCount: Int,
    val bookingRef: String,
    val fareMinor: Long,
    val currency: String,
    val paymentLabel: String,
    val issuedAt: String,
    val qrPayload: String,
    val reprintCount: Int = 0,
) {
    init {
        require(bookingRef.isNotBlank()) { "bookingRef must not be blank" }
        require(qrPayload.isNotBlank()) { "qrPayload must not be blank" }
        require(passengerCount >= 1) { "passengerCount must be >= 1" }
        require(passengerIndex in 1..passengerCount) {
            "passengerIndex $passengerIndex outside 1..$passengerCount"
        }
        require(fareMinor >= 0) { "fareMinor must not be negative" }
    }

    val fareLabel: String get() = Money.format(fareMinor, currency)
}
