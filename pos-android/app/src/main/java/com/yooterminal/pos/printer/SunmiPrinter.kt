package com.yooterminal.pos.printer

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import woyou.aidlservice.jiuiv5.IWoyouService
import java.util.concurrent.atomic.AtomicReference

class SunmiPrinter(private val context: Context) : TicketPrinter {

    private val service = AtomicReference<IWoyouService?>(null)
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var lastAction: String? = null

    @Volatile
    private var currentStatus: PrinterStatus = PrinterStatus.UNKNOWN

    @Volatile
    private var receiverRegistered = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            service.set(IWoyouService.Stub.asInterface(binder))
            Log.d(TAG, "print service connected")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service.set(null)
            currentStatus = PrinterStatus.UNKNOWN
            Log.w(TAG, "print service disconnected")
        }
    }

    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(receiverContext: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            lastAction = action
            currentStatus = PrinterStatus.fromBroadcast(action)
            Log.d(TAG, "printer status broadcast: $action")
        }
    }

    override fun bind() {
        val intent = Intent().apply {
            setPackage(SERVICE_PACKAGE)
            setAction(SERVICE_ACTION)
        }
        runCatching { context.startService(intent) }
        runCatching { context.bindService(intent, connection, Context.BIND_AUTO_CREATE) }
        registerStatusReceiver()
        mainHandler.postDelayed({
            if (service.get() == null) {
                currentStatus = PrinterStatus.ERROR
                Log.w(TAG, "print service not bound after ${BIND_TIMEOUT_MS}ms")
            }
        }, BIND_TIMEOUT_MS)
    }

    override fun unbind() {
        mainHandler.removeCallbacksAndMessages(null)
        if (receiverRegistered) {
            runCatching { context.unregisterReceiver(statusReceiver) }
            receiverRegistered = false
        }
        runCatching { context.unbindService(connection) }
        service.set(null)
    }

    override suspend fun serviceVersion(): String? = withContext(Dispatchers.IO) {
        runCatching { service.get()?.serviceVersion }.getOrNull()
    }

    override fun status(): PrinterStatus = currentStatus

    override fun lastBroadcastAction(): String? = lastAction

    override suspend fun print(ticket: Ticket): PrintResult =
        PrintResult.Failed("printing is not implemented yet")

    private fun registerStatusReceiver() {
        if (receiverRegistered) return
        val filter = IntentFilter().apply { SunmiActions.ALL.forEach { addAction(it) } }
        runCatching {
            context.registerReceiver(statusReceiver, filter)
            receiverRegistered = true
        }.onFailure { Log.w(TAG, "could not register status receiver: ${it.message}") }
    }

    companion object {
        private const val TAG = "SunmiPrinter"
        private const val SERVICE_PACKAGE = "woyou.aidlservice.jiuiv5"
        private const val SERVICE_ACTION = "woyou.aidlservice.jiuiv5.IWoyouService"
        private const val BIND_TIMEOUT_MS = 10_000L
    }
}
