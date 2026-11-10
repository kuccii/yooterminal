package com.yooterminal.pos.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PrinterStatusTest {

    @Test
    fun `maps vendor broadcast actions`() {
        assertEquals(PrinterStatus.OUT_OF_PAPER, PrinterStatus.fromBroadcast(SunmiActions.OUT_OF_PAPER))
        assertEquals(PrinterStatus.COVER_OPEN, PrinterStatus.fromBroadcast(SunmiActions.COVER_OPEN))
        assertEquals(PrinterStatus.OVERHEATED, PrinterStatus.fromBroadcast(SunmiActions.OVER_HEATING))
        assertEquals(PrinterStatus.FIRMWARE_UPDATING, PrinterStatus.fromBroadcast(SunmiActions.FIRMWARE_UPDATING))
        assertEquals(PrinterStatus.ERROR, PrinterStatus.fromBroadcast(SunmiActions.ERROR))
        assertEquals(PrinterStatus.READY, PrinterStatus.fromBroadcast(SunmiActions.NORMAL))
        assertEquals(PrinterStatus.UNKNOWN, PrinterStatus.fromBroadcast(null))
        assertEquals(PrinterStatus.UNKNOWN, PrinterStatus.fromBroadcast("something.else"))
    }

    @Test
    fun `maps firmware mode codes from the vendor AIDL`() {
        assertEquals(FirmwareMode.UNKNOWN, PrinterStatus.fromFirmwareStatus(0))
        assertEquals(FirmwareMode.BOOTLOADER, PrinterStatus.fromFirmwareStatus(0xA5))
        assertEquals(FirmwareMode.PRINT_MODE, PrinterStatus.fromFirmwareStatus(0xC3))
        assertEquals(FirmwareMode.OTHER, PrinterStatus.fromFirmwareStatus(0x42))
    }

    @Test
    fun `parses a DLE EOT status reply`() {
        assertEquals(PrinterStatus.READY, PrinterStatus.fromEot("\u0012"))
        assertEquals(PrinterStatus.OUT_OF_PAPER, PrinterStatus.fromEot("\u0032"))
        assertEquals(PrinterStatus.ERROR, PrinterStatus.fromEot("\u001A"))
    }

    @Test
    fun `rejects replies that are not raw status bytes`() {
        // Some firmware answers with hex text. Reading "1" as a byte would
        // wrongly claim the printer is out of paper.
        assertNull(PrinterStatus.fromEot("1"))
        assertNull(PrinterStatus.fromEot("OK"))
        assertNull(PrinterStatus.fromEot(""))
        assertNull(PrinterStatus.fromEot(null))
    }

    @Test
    fun `only blocking states stop a sale`() {
        assertTrue(PrinterStatus.OUT_OF_PAPER.blocksPrinting)
        assertTrue(PrinterStatus.COVER_OPEN.blocksPrinting)
        assertTrue(PrinterStatus.OVERHEATED.blocksPrinting)
        assertTrue(PrinterStatus.ERROR.blocksPrinting)
        assertTrue(PrinterStatus.FIRMWARE_UPDATING.blocksPrinting)

        assertFalse(PrinterStatus.READY.blocksPrinting)
        assertFalse(PrinterStatus.LOW_VOLTAGE.blocksPrinting)
        // Unknown must not block: blocking on it would make the printer
        // unusable on models that do not answer DLE EOT.
        assertFalse(PrinterStatus.UNKNOWN.blocksPrinting)
    }
}
