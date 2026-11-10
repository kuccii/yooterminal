package com.yooterminal.pos

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.yooterminal.pos.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.checkTlsButton.setOnClickListener { viewModel.checkTls() }
        binding.checkPrinterButton.setOnClickListener { viewModel.checkPrinter() }
        binding.printTicketButton.setOnClickListener { viewModel.printSample() }
        binding.copyDiagnosticsButton.setOnClickListener { copyDiagnostics() }
        binding.clearButton.setOnClickListener { viewModel.clearLog() }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { viewModel.log.collect(::render) }
                launch { viewModel.busy.collect(::setBusy) }
            }
        }
    }

    private fun render(lines: List<String>) {
        binding.statusText.text =
            lines.joinToString("\n").ifEmpty { getString(R.string.status_placeholder) }
        // The newest line is the one that matters; keep it in view.
        binding.statusScroll.post { binding.statusScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun setBusy(busy: Boolean) {
        binding.checkTlsButton.isEnabled = !busy
        binding.checkPrinterButton.isEnabled = !busy
        binding.printTicketButton.isEnabled = !busy
    }

    private fun copyDiagnostics() {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(
            ClipData.newPlainText(
                getString(R.string.diagnostics_label),
                viewModel.diagnosticsText(),
            )
        )
        Toast.makeText(this, R.string.diagnostics_copied, Toast.LENGTH_SHORT).show()
    }
}
