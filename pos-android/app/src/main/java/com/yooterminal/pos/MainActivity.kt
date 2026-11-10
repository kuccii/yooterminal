package com.yooterminal.pos

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.yooterminal.pos.databinding.ActivityMainBinding
import com.yooterminal.pos.net.TlsProbe
import com.yooterminal.pos.net.TlsResult
import com.yooterminal.pos.net.TrustMode
import com.yooterminal.pos.printer.SunmiPrinter
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
        binding.printTicketButton.setOnClickListener { appendLine("print: not implemented yet") }
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
                TlsProbe.bundledRootCertificate(resources.openRawResource(R.raw.isrg_root_x1))
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
