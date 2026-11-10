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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import woyou.aidlservice.jiuiv5.ICallback
import woyou.aidlservice.jiuiv5.IWoyouService
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

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

    override suspend fun print(ticket: Ticket): PrintResult {
        val boundService = service.get() ?: return PrintResult.Failed("print service not bound")
        return try {
            performPrint(boundService, ticket)
            PrintResult.Success
        } catch (e: TimeoutCancellationException) {
            PrintResult.Failed("print timed out: ${e.message}")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            PrintResult.Failed(e.message ?: e::class.java.simpleName)
        }
    }

    private suspend fun performPrint(boundService: IWoyouService, ticket: Ticket) {
        await("printerInit") { boundService.printerInit(it) }
        for (line in TicketFormatter.format(ticket)) {
            when (line) {
                is TicketLine.Text -> printTextLine(boundService, line)
                is TicketLine.Qr -> await("printBitmap") {
                    val bitmap = Qr.toBitmap(Qr.encodeMatrix(line.content, QR_SIZE_PX))
                    boundService.printBitmap(bitmap, it)
                }
            }
        }
        await("lineWrap") { boundService.lineWrap(FEED_LINES, it) }
    }

    private suspend fun printTextLine(boundService: IWoyouService, line: TicketLine.Text) {
        await("setAlignment") { boundService.setAlignment(line.align.value, it) }
        await("setFontSize") { boundService.setFontSize(line.size / BASE_FONT_SIZE, it) }
        if (line.bold) {
            await("boldOn") { boundService.sendRAWData(BOLD_ON, it) }
        }
        await("printText") { boundService.printText(line.value + "\n", it) }
        if (line.bold) {
            await("boldOff") { boundService.sendRAWData(BOLD_OFF, it) }
        }
    }

    private suspend fun await(step: String, block: (ICallback) -> Unit) =
        withTimeout(STEP_TIMEOUT_MS) {
            suspendCancellableCoroutine<Unit> { cont ->
                val callback = object : ICallback.Stub() {
                    override fun onRunResult(isSuccess: Boolean) {
                        if (!cont.isActive) return
                        if (isSuccess) {
                            cont.resume(Unit)
                        } else {
                            cont.resumeWithException(IllegalStateException("$step failed"))
                        }
                    }

                    override fun onReturnString(result: String?) = Unit

                    override fun onRaiseException(code: Int, msg: String?) {
                        if (!cont.isActive) return
                        cont.resumeWithException(IllegalStateException("$step raised $code: $msg"))
                    }
                }
                try {
                    block(callback)
                } catch (e: Exception) {
                    if (cont.isActive) cont.resumeWithException(e)
                }
            }
        }

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
        private const val STEP_TIMEOUT_MS = 5_000L
        private const val QR_SIZE_PX = 384
        private const val FEED_LINES = 4
        private const val BASE_FONT_SIZE = 24f
        private val BOLD_ON = byteArrayOf(0x1B, 0x45, 0x01)
        private val BOLD_OFF = byteArrayOf(0x1B, 0x45, 0x00)
    }
}
