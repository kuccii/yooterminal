package com.yooterminal.pos.printer

enum class Align(val value: Int) {
    LEFT(0),
    CENTER(1),
    RIGHT(2),
}

data class Ticket(
    val operatorName: String,
    val originCity: String,
    val destinationCity: String,
    val travelDate: String,
    val departureTime: String,
    val passengerName: String,
    val seat: String,
    val passengerIndex: Int,
    val passengerCount: Int,
    val bookingRef: String,
    val amountLabel: String,
    val paymentLabel: String,
    val contactPhone: String,
    val issuedAt: String,
    val reprintCount: Int = 0,
)
