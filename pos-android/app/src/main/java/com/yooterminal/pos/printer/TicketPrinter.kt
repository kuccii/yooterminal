package com.yooterminal.pos.printer

enum class PrinterStatus {
    READY,
    OUT_OF_PAPER,
    COVER_OPEN,
    OVERHEATED,
    LOW_VOLTAGE,
    ERROR,
    UNKNOWN;

    companion object {
        fun fromBroadcast(action: String?): PrinterStatus = when (action) {
            SunmiActions.OUT_OF_PAPER -> OUT_OF_PAPER
            SunmiActions.COVER_OPEN, SunmiActions.COVER_ERROR -> COVER_OPEN
            SunmiActions.OVER_HEATING -> OVERHEATED
            SunmiActions.ERROR,
            SunmiActions.KNIFE_ERROR_1,
            SunmiActions.KNIFE_ERROR_2,
            -> ERROR
            SunmiActions.NORMAL -> READY
            else -> UNKNOWN
        }
    }
}

/**
 * Vendor broadcast actions. The typos (`jiuv5`, `ACITON`) are Sunmi's and must
 * not be corrected: the device sends exactly these strings.
 */
object SunmiActions {
    const val OUT_OF_PAPER = "woyou.aidlservice.jiuv5.OUT_OF_PAPER_ACTION"
    const val ERROR = "woyou.aidlservice.jiuv5.ERROR_ACTION"
    const val NORMAL = "woyou.aidlservice.jiuv5.NORMAL_ACTION"
    const val COVER_OPEN = "woyou.aidlservice.jiuv5.COVER_OPEN_ACTION"
    const val COVER_ERROR = "woyou.aidlservice.jiuv5.COVER_ERROR_ACTION"
    const val KNIFE_ERROR_1 = "woyou.aidlservice.jiuv5.KNIFE_ERROR_ACTION_1"
    const val KNIFE_ERROR_2 = "woyou.aidlservice.jiuv5.KNIFE_ERROR_ACTION_2"
    const val OVER_HEATING = "woyou.aidlservice.jiuv5.OVER_HEATING_ACITON"
    const val FIRMWARE_UPDATING = "woyou.aidlservice.jiuv5.FIRMWARE_UPDATING_ACITON"

    val ALL = listOf(
        OUT_OF_PAPER,
        ERROR,
        NORMAL,
        COVER_OPEN,
        COVER_ERROR,
        KNIFE_ERROR_1,
        KNIFE_ERROR_2,
        OVER_HEATING,
        FIRMWARE_UPDATING,
    )
}

sealed class PrintResult {
    object Success : PrintResult()
    data class Failed(val message: String) : PrintResult()
}

interface TicketPrinter {
    fun bind()
    fun unbind()
    suspend fun serviceVersion(): String?
    fun status(): PrinterStatus
    fun lastBroadcastAction(): String?
    suspend fun print(ticket: Ticket): PrintResult
}
