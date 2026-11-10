package com.yooterminal.pos.net

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class TlsProbeTest {
    @Test
    fun `bundled root parses as ISRG Root X1`() {
        val cert = TlsProbe.bundledRootCertificate(File("src/main/res/raw/isrg_root_x1.pem"))
        assertTrue(cert.subjectX500Principal.name.contains("CN=ISRG Root X1"))
        assertTrue(cert.basicConstraints >= 0)
    }
}
