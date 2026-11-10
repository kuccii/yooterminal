package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Test

class PrinterStatusTest {
    @Test
    fun `maps vendor broadcast actions`() {
        assertEquals(PrinterStatus.OUT_OF_PAPER, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.OUT_OF_PAPER_ACTION"))
        assertEquals(PrinterStatus.COVER_OPEN, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.COVER_OPEN_ACTION"))
        assertEquals(PrinterStatus.OVERHEATED, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.OVER_HEATING_ACITON"))
        assertEquals(PrinterStatus.ERROR, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.ERROR_ACTION"))
        assertEquals(PrinterStatus.READY, PrinterStatus.fromBroadcast("woyou.aidlservice.jiuv5.NORMAL_ACTION"))
        assertEquals(PrinterStatus.UNKNOWN, PrinterStatus.fromBroadcast(null))
        assertEquals(PrinterStatus.UNKNOWN, PrinterStatus.fromBroadcast("something.else"))
    }
}
