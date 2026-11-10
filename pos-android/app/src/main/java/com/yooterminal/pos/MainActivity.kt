package com.yooterminal.pos

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.yooterminal.pos.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.checkTlsButton.setOnClickListener { appendLine("tls: not implemented yet") }
        binding.checkPrinterButton.setOnClickListener { appendLine("printer: not implemented yet") }
        binding.printTicketButton.setOnClickListener { appendLine("print: not implemented yet") }
    }

    private fun appendLine(line: String) {
        binding.statusText.append(line + "\n")
    }
}
