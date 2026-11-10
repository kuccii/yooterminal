package com.yooterminal.pos.printer

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The AIDL is vendored from a third-party mirror (see
 * `app/src/main/aidl/PROVENANCE.md`). This guards the contract: if someone
 * swaps the file for a version that lacks a method we call, the build would
 * still succeed but the app would fail at runtime with NoSuchMethodError.
 */
class AidlContractTest {

    private val service = File("src/main/aidl/woyou/aidlservice/jiuiv5/IWoyouService.aidl")
    private val transBean = File("src/main/aidl/com/sunmi/trans/TransBean.aidl")

    @Test
    fun `vendored AIDL still declares every method we call`() {
        assertTrue("missing ${service.path}", service.isFile)
        assertTrue("missing ${transBean.path}", transBean.isFile)

        val source = service.readText()
        assertTrue(source.contains("package woyou.aidlservice.jiuiv5;"))

        val required = listOf(
            "void printerInit(in ICallback",
            "void printText(String text, in ICallback",
            "void setAlignment(int alignment, in ICallback",
            "void sendRAWData(in byte[] data, in ICallback",
            "void lineWrap(int n, in ICallback",
            "void printBitmap(in Bitmap bitmap, in ICallback",
            "String getServiceVersion();",
            "int getFirmwareStatus();",
            "String getPrinterModal();",
            "String getPrinterSerialNo();",
        )

        val missing = required.filterNot { source.contains(it) }
        assertTrue("AIDL is missing: $missing", missing.isEmpty())
    }
}
