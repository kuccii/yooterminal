package com.yooterminal.pos

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.yooterminal.pos.net.TlsProbe
import com.yooterminal.pos.net.TlsResult
import com.yooterminal.pos.net.TrustMode
import com.yooterminal.pos.printer.PrintResult
import com.yooterminal.pos.printer.Ticket
import com.yooterminal.pos.printer.TicketPrinter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val printer: TicketPrinter = (application as PosApp).printer

    private val _log = MutableStateFlow<List<String>>(emptyList())
    val log: StateFlow<List<String>> = _log.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    fun checkTls() = runExclusive {
        append("tls: checking $HEALTH_URL")
        val root = runCatching {
            getApplication<Application>().resources.openRawResource(R.raw.isrg_root_x1)
                .use { TlsProbe.bundledRootCertificate(it) }
        }.getOrNull()

        append("system trust:  ${describe(TlsProbe.probe(HEALTH_URL, TrustMode.SYSTEM))}")
        if (root == null) {
            append("system + ISRG: could not load bundled root")
        } else {
            append(
                "system + ISRG: " +
                    describe(TlsProbe.probe(HEALTH_URL, TrustMode.SYSTEM_PLUS_ISRG, root))
            )
        }
    }

    fun checkPrinter() = runExclusive {
        append("service version: ${printer.serviceVersion() ?: "not bound"}")
        append("printer model:   ${printer.printerModel() ?: "unknown"}")
        append("printer serial:  ${printer.printerSerial() ?: "unknown"}")
        append("firmware mode:   ${printer.firmwareMode() ?: "unknown"}")
        append("printer status:  ${printer.refreshStatus().label()}")
        append("status reply:    ${printer.lastStatusResponse()?.let(::hex) ?: "none (DLE EOT unsupported)"}")
        append("last broadcast:  ${printer.lastBroadcastAction() ?: "none"}")
    }

    fun printSample() = runExclusive {
        append("print: sending sample ticket")
        when (val result = printer.print(sampleTicket())) {
            is PrintResult.Success -> append("print: success")
            is PrintResult.Failed -> append("print: failed — ${result.message}")
        }
        append("printer status:  ${printer.refreshStatus().label()}")
    }

    fun clearLog() {
        _log.value = emptyList()
    }

    fun diagnosticsText(): String = buildString {
        appendLine("YooTerminal POS ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
        appendLine("Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        appendLine("Device ${Build.MANUFACTURER} ${Build.MODEL}")
        appendLine("---")
        _log.value.forEach { appendLine(it) }
    }

    private fun runExclusive(block: suspend () -> Unit) {
        if (_busy.value) return
        _busy.value = true
        viewModelScope.launch {
            try {
                block()
            } finally {
                _busy.value = false
            }
        }
    }

    private fun append(line: String) {
        _log.value = (_log.value + line).takeLast(MAX_LOG_LINES)
    }

    private fun hex(text: String): String =
        text.map { "%02X".format(it.code and 0xFF) }.joinToString(" ")

    private fun describe(result: TlsResult): String = when (result) {
        is TlsResult.Ok -> "Ok(${result.status})"
        is TlsResult.NotTrusted -> "NotTrusted(${result.message})"
        is TlsResult.NetworkError -> "NetworkError(${result.message})"
        is TlsResult.HttpError -> "HttpError(${result.status})"
        is TlsResult.Failed -> "Failed(${result.message})"
    }

    private fun sampleTicket() = Ticket(
        operatorName = "RWENZORI EXPRESS",
        operatorPlate = "UBF 123X",
        originCity = "Kampala",
        destinationCity = "Kigali",
        boardingPoint = "Kisenyi Terminal",
        travelDate = "Sat 14 Nov 2026",
        departureTime = "07:00",
        boardingCloses = "06:45",
        passengerName = "John Doe",
        passengerPhone = "+256700000000",
        seat = "12A",
        passengerIndex = 1,
        passengerCount = 2,
        bookingRef = "BLDEMO42",
        fareMinor = 45_000,
        currency = "UGX",
        paymentLabel = "CASH",
        issuedAt = "09 Nov 2026 14:32",
        qrPayload = "BLDEMO42",
        reprintCount = 0,
    )

    companion object {
        private const val HEALTH_URL = "https://www.yooterminal.com/api/health"
        private const val MAX_LOG_LINES = 200
    }
}
