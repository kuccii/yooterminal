package com.yooterminal.pos.printer

enum class PrinterStatus {
    READY,
    OUT_OF_PAPER,
    COVER_OPEN,
    OVERHEATED,
    LOW_VOLTAGE,
    FIRMWARE_UPDATING,
    ERROR,
    UNKNOWN;

    /** True when sending a ticket would waste paper or fail outright. */
    val blocksPrinting: Boolean
        get() = this == OUT_OF_PAPER ||
            this == COVER_OPEN ||
            this == OVERHEATED ||
            this == FIRMWARE_UPDATING ||
            this == ERROR

    fun label(): String = when (this) {
        READY -> "ready"
        OUT_OF_PAPER -> "out of paper"
        COVER_OPEN -> "cover open"
        OVERHEATED -> "overheated"
        LOW_VOLTAGE -> "low voltage"
        FIRMWARE_UPDATING -> "firmware updating"
        ERROR -> "error"
        UNKNOWN -> "unknown"
    }

    companion object {

        fun fromBroadcast(action: String?): PrinterStatus = when (action) {
            SunmiActions.OUT_OF_PAPER -> OUT_OF_PAPER
            SunmiActions.COVER_OPEN, SunmiActions.COVER_ERROR -> COVER_OPEN
            SunmiActions.OVER_HEATING -> OVERHEATED
            SunmiActions.FIRMWARE_UPDATING -> FIRMWARE_UPDATING
            SunmiActions.ERROR,
            SunmiActions.KNIFE_ERROR_1,
            SunmiActions.KNIFE_ERROR_2,
            -> ERROR
            SunmiActions.NORMAL -> READY
            else -> UNKNOWN
        }

        /**
         * `IWoyouService.getFirmwareStatus()` reports the firmware's mode, not
         * the paper state: 0 unknown, 0xA5 bootloader, 0xC3 print mode. If the
         * printer is not in print mode nothing will come out of it.
         */
        fun fromFirmwareStatus(code: Int): FirmwareMode = when (code) {
            0 -> FirmwareMode.UNKNOWN
            0xA5 -> FirmwareMode.BOOTLOADER
            0xC3 -> FirmwareMode.PRINT_MODE
            else -> FirmwareMode.OTHER
        }

        /**
         * Parses the one-byte reply to an ESC/POS `DLE EOT 1` status query.
         *
         * The reply has a fixed bit pattern (bit 0 clear, bit 1 set, bit 4 set,
         * bit 7 clear). Validating it matters: some firmware answers with hex
         * text instead of raw bytes, and reading `"1"` as a raw byte would
         * wrongly report "out of paper". Anything that does not match the
         * pattern returns null, which means "this firmware did not answer" and
         * the caller falls back to the status broadcasts.
         */
        fun fromEot(response: String?): PrinterStatus? {
            val byte = response?.firstOrNull()?.code ?: return null
            if (byte > 0xFF) return null
            if (byte and 0x03 != 0x02) return null
            if (byte and 0x10 == 0) return null
            if (byte and 0x80 != 0) return null

            return when {
                byte and 0x20 != 0 -> OUT_OF_PAPER
                byte and 0x08 != 0 -> ERROR
                else -> READY
            }
        }
    }
}

enum class FirmwareMode {
    UNKNOWN,
    BOOTLOADER,
    PRINT_MODE,
    OTHER,
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
    suspend fun printerModel(): String?
    suspend fun printerSerial(): String?
    suspend fun firmwareMode(): FirmwareMode?

    /** Actively asks the hardware; falls back to the last broadcast. */
    suspend fun refreshStatus(): PrinterStatus

    /** Last known status without asking the hardware. */
    fun status(): PrinterStatus
    fun lastBroadcastAction(): String?
    fun lastStatusResponse(): String?
    suspend fun print(ticket: Ticket): PrintResult
}
