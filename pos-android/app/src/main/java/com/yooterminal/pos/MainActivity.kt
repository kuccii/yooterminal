package com.yooterminal.pos

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.yooterminal.pos.databinding.ActivityMainBinding
import com.yooterminal.pos.net.TlsProbe
import com.yooterminal.pos.net.TlsResult
import com.yooterminal.pos.net.TrustMode
import com.yooterminal.pos.printer.PrintResult
import com.yooterminal.pos.printer.SunmiPrinter
import com.yooterminal.pos.printer.Ticket
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var printer: SunmiPrinter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        printer = SunmiPrinter(applicationContext)

        binding.checkTlsButton.setOnClickListener { checkTls() }
        binding.checkPrinterButton.setOnClickListener { checkPrinter() }
        binding.printTicketButton.setOnClickListener { printSample() }
    }

    override fun onStart() {
        super.onStart()
        printer.bind()
    }

    override fun onStop() {
        printer.unbind()
        super.onStop()
    }

    private fun checkTls() {
        binding.checkTlsButton.isEnabled = false
        lifecycleScope.launch {
            appendLine("tls: checking $HEALTH_URL")
            val cert = runCatching {
                resources.openRawResource(R.raw.isrg_root_x1).use { TlsProbe.bundledRootCertificate(it) }
            }.getOrNull()
            appendLine("system trust: ${describe(TlsProbe.probe(HEALTH_URL, TrustMode.SYSTEM))}")
            if (cert == null) {
                appendLine("system + ISRG root: Failed(could not load bundled root)")
            } else {
                appendLine(
                    "system + ISRG root: " +
                        describe(TlsProbe.probe(HEALTH_URL, TrustMode.SYSTEM_PLUS_ISRG, cert))
                )
            }
            binding.checkTlsButton.isEnabled = true
        }
    }

    private fun checkPrinter() {
        lifecycleScope.launch {
            val version = printer.serviceVersion()
            appendLine("service version: ${version ?: "not bound"}")
            appendLine("printer status: ${printer.status()}")
            appendLine("last broadcast: ${printer.lastBroadcastAction() ?: "none"}")
        }
    }

    private fun printSample() {
        binding.printTicketButton.isEnabled = false
        lifecycleScope.launch {
            when (val result = printer.print(sampleTicket())) {
                is PrintResult.Success -> appendLine("print: success")
                is PrintResult.Failed -> appendLine("print: failed — ${result.message}")
            }
            binding.printTicketButton.isEnabled = true
        }
    }

    private fun sampleTicket() = Ticket(
        operatorName = "RWENZORI EXPRESS",
        originCity = "Kampala",
        destinationCity = "Kigali",
        travelDate = "Sat 14 Nov 2026",
        departureTime = "07:00",
        passengerName = "John Doe",
        seat = "12A",
        passengerIndex = 1,
        passengerCount = 2,
        bookingRef = "BLDEMO42",
        amountLabel = "UGX 45,000",
        paymentLabel = "CASH",
        contactPhone = "+256700000000",
        issuedAt = "09 Nov 2026 14:32",
        reprintCount = 0,
    )

    private fun describe(result: TlsResult): String = when (result) {
        is TlsResult.Ok -> "Ok(${result.status})"
        is TlsResult.Failed -> "Failed(${result.message})"
    }

    private fun appendLine(line: String) {
        binding.statusText.append(line + "\n")
    }

    companion object {
        private const val HEALTH_URL = "https://www.yooterminal.com/api/health"
    }
}
