package com.yooterminal.pos

import android.app.Application
import com.yooterminal.pos.printer.SunmiPrinter
import com.yooterminal.pos.printer.TicketPrinter

/**
 * Owns the printer for the whole process.
 *
 * Binding is not tied to an Activity: a POS must be able to print when a
 * confirmation arrives while the screen is off, and an Activity that is being
 * recreated must never yank the service out from under an in-flight ticket.
 */
class PosApp : Application() {

    lateinit var printer: TicketPrinter
        private set

    override fun onCreate() {
        super.onCreate()
        printer = SunmiPrinter(this)
        printer.bind()
    }
}
