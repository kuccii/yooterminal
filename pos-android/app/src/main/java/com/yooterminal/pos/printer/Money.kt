package com.yooterminal.pos.printer

/**
 * Fares travel as integer minor units so no rounding happens in the UI layer.
 * UGX and RWF are quoted in whole shillings, so their minor unit is one
 * shilling; KES and USD use cents.
 */
object Money {

    private val POWERS_OF_TEN = longArrayOf(1, 10, 100, 1_000)

    private val DECIMALS = mapOf(
        "UGX" to 0,
        "RWF" to 0,
        "KES" to 2,
        "USD" to 2,
    )

    fun format(amountMinor: Long, currency: String): String {
        val code = currency.trim().uppercase()
        require(code.isNotEmpty()) { "currency must not be blank" }

        val decimals = DECIMALS[code] ?: 2
        val scale = POWERS_OF_TEN[decimals]
        val negative = amountMinor < 0
        val magnitude = if (negative) -amountMinor else amountMinor
        val whole = group(magnitude / scale)
        val sign = if (negative) "-" else ""

        return if (decimals == 0) {
            "$code $sign$whole"
        } else {
            "$code $sign$whole." + (magnitude % scale).toString().padStart(decimals, '0')
        }
    }

    private fun group(value: Long): String {
        val digits = value.toString()
        if (digits.length <= 3) return digits

        val out = StringBuilder(digits.length + digits.length / 3)
        for ((index, digit) in digits.withIndex()) {
            if (index > 0 && (digits.length - index) % 3 == 0) out.append(',')
            out.append(digit)
        }
        return out.toString()
    }
}
