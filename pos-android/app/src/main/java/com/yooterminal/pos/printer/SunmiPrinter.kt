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
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
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
    private var lastResponse: String? = null

    @Volatile
    private var receiverRegistered = false

    @Volatile
    private var bound = false

    private val noopCallback = object : ICallback.Stub() {
        override fun onRunResult(isSuccess: Boolean) = Unit
        override fun onReturnString(result: String?) = Unit
        override fun onRaiseException(code: Int, msg: String?) = Unit
    }

    private val bindTimeout = Runnable {
        if (service.get() == null) {
            currentStatus = PrinterStatus.ERROR
            Log.w(TAG, "print service not bound after ${BIND_TIMEOUT_MS}ms")
        }
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            service.set(IWoyouService.Stub.asInterface(binder))
            mainHandler.removeCallbacks(bindTimeout)
            // The bind timeout may already have marked the printer broken.
            // Clear that, but do not claim READY without asking the hardware.
            if (currentStatus == PrinterStatus.ERROR) currentStatus = PrinterStatus.UNKNOWN
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
        if (bound) return
        bound = true

        val intent = Intent().apply {
            setPackage(SERVICE_PACKAGE)
            setAction(SERVICE_ACTION)
        }

        runCatching { context.startService(intent) }
            .onFailure { Log.w(TAG, "startService($SERVICE_PACKAGE) failed: ${it.message}") }

        val bindResult = runCatching {
            context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        }
        bindResult.onFailure { Log.w(TAG, "bindService($SERVICE_PACKAGE) threw: ${it.message}") }
        if (!bindResult.getOrDefault(false)) {
            // Nothing else can tell us: without a bound service neither a
            // broadcast nor a binder call will ever arrive.
            currentStatus = PrinterStatus.ERROR
            Log.w(TAG, "bindService returned false — vendor print service missing?")
        }

        registerStatusReceiver()
        mainHandler.postDelayed(bindTimeout, BIND_TIMEOUT_MS)
    }

    override fun unbind() {
        if (!bound) return
        bound = false

        mainHandler.removeCallbacks(bindTimeout)
        if (receiverRegistered) {
            runCatching { context.unregisterReceiver(statusReceiver) }
                .onFailure { Log.w(TAG, "unregisterReceiver failed: ${it.message}") }
            receiverRegistered = false
        }
        runCatching { context.unbindService(connection) }
            .onFailure { Log.w(TAG, "unbindService failed: ${it.message}") }

        service.set(null)
        lastAction = null
        lastResponse = null
        currentStatus = PrinterStatus.UNKNOWN
    }

    override suspend fun serviceVersion(): String? = withService { it.serviceVersion }

    override suspend fun printerModel(): String? = withService { it.printerModal }

    override suspend fun printerSerial(): String? = withService { it.printerSerialNo }

    override suspend fun firmwareMode(): FirmwareMode? = withService {
        PrinterStatus.fromFirmwareStatus(it.firmwareStatus)
    }

    override fun status(): PrinterStatus = currentStatus

    override fun lastBroadcastAction(): String? = lastAction

    override fun lastStatusResponse(): String? = lastResponse

    override suspend fun refreshStatus(): PrinterStatus = withContext(Dispatchers.IO) {
        val boundService = service.get() ?: return@withContext currentStatus
        readStatus(boundService)
    }

    override suspend fun print(ticket: Ticket): PrintResult = withContext(Dispatchers.IO) {
        val boundService = service.get()
            ?: return@withContext PrintResult.Failed("print service not bound")

        try {
            withTimeout(PRINT_TIMEOUT_MS) {
                val before = readStatus(boundService)
                if (before.blocksPrinting) {
                    return@withTimeout PrintResult.Failed("printer not ready: ${before.label()}")
                }

                performPrint(boundService, ticket)

                val after = readStatus(boundService)
                if (after.blocksPrinting) {
                    PrintResult.Failed(
                        "sent, but the printer now reports ${after.label()} — check the printout"
                    )
                } else {
                    PrintResult.Success
                }
            }
        } catch (e: TimeoutCancellationException) {
            PrintResult.Failed("print timed out after ${PRINT_TIMEOUT_MS}ms")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "print failed", e)
            PrintResult.Failed(e.message ?: e::class.java.simpleName)
        }
    }

    private suspend fun readStatus(boundService: IWoyouService): PrinterStatus {
        val response = runCatching { rawQuery(boundService, EOT_QUERY) }.getOrNull()
        lastResponse = response

        val parsed = PrinterStatus.fromEot(response)
        if (parsed != null) {
            currentStatus = parsed
            return parsed
        }

        // This firmware does not answer DLE EOT, or answered in a shape we do
        // not recognise. Fall back to the last broadcast instead of guessing.
        Log.d(TAG, "DLE EOT unsupported or unparsed; falling back to broadcasts")
        return currentStatus
    }

    /**
     * Sends a raw ESC/POS command and waits for the printer's reply. Returns
     * null when the firmware answers nothing within [STATUS_GRACE_MS], which is
     * the documented behaviour on models that do not implement DLE EOT.
     */
    private suspend fun rawQuery(
        boundService: IWoyouService,
        command: ByteArray,
    ): String? = withTimeoutOrNull(STATUS_GRACE_MS) {
        val replies = Channel<String>(Channel.UNLIMITED)
        val callback = object : ICallback.Stub() {
            override fun onRunResult(isSuccess: Boolean) = Unit

            override fun onReturnString(result: String?) {
                if (!result.isNullOrEmpty()) replies.trySend(result)
            }

            override fun onRaiseException(code: Int, msg: String?) {
                Log.w(TAG, "status query raised $code: $msg")
            }
        }
        boundService.sendRAWData(command, callback)
        replies.receive()
    }

    private suspend fun performPrint(boundService: IWoyouService, ticket: Ticket) {
        await("printerInit") { boundService.printerInit(it) }

        val style = PrintStyle()
        try {
            for (line in TicketFormatter.format(ticket)) {
                when (line) {
                    is TicketLine.Text -> {
                        applyStyle(boundService, style, line.align, line.bold)
                        await("printText") { boundService.printText(line.value + "\n", it) }
                        style.commit(line.align, line.bold)
                    }

                    is TicketLine.Qr -> {
                        applyStyle(boundService, style, Align.CENTER, bold = false)
                        val pixels = Qr.encodePixels(line.content, QR_SIZE_PX)
                        await("printBitmap") { boundService.printBitmap(Qr.toBitmap(pixels), it) }
                        style.commit(Align.CENTER, bold = false)
                    }
                }
            }
            await("lineWrap") { boundService.lineWrap(FEED_LINES, it) }
        } finally {
            // A throw mid-ticket must not leave the next ticket bold.
            style.reset()
            runCatching { boundService.sendRAWData(BOLD_OFF, noopCallback) }
                .onFailure { Log.w(TAG, "could not reset emphasis: ${it.message}") }
        }
    }

    private suspend fun applyStyle(
        boundService: IWoyouService,
        style: PrintStyle,
        align: Align,
        bold: Boolean,
    ) {
        for (change in style.changesFor(align, bold)) {
            when (change) {
                StyleChange.ALIGNMENT ->
                    await("setAlignment") { boundService.setAlignment(align.value, it) }
                StyleChange.BOLD_ON ->
                    await("boldOn") { boundService.sendRAWData(BOLD_ON, it) }
                StyleChange.BOLD_OFF ->
                    await("boldOff") { boundService.sendRAWData(BOLD_OFF, it) }
            }
        }
    }

    private suspend fun await(step: String, block: (ICallback) -> Unit) =
        withTimeout(STEP_TIMEOUT_MS) {
            suspendCancellableCoroutine<Unit> { continuation ->
                val callback = object : ICallback.Stub() {
                    override fun onRunResult(isSuccess: Boolean) {
                        if (!continuation.isActive) return
                        if (isSuccess) {
                            continuation.resume(Unit)
                        } else {
                            continuation.resumeWithException(IllegalStateException("$step failed"))
                        }
                    }

                    override fun onReturnString(result: String?) = Unit

                    override fun onRaiseException(code: Int, msg: String?) {
                        if (!continuation.isActive) return
                        continuation.resumeWithException(
                            IllegalStateException("$step raised $code: $msg")
                        )
                    }
                }

                try {
                    block(callback)
                } catch (e: Exception) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                }
            }
        }

    private suspend fun <T> withService(block: (IWoyouService) -> T): T? =
        withContext(Dispatchers.IO) {
            val boundService = service.get() ?: return@withContext null
            runCatching { block(boundService) }
                .onFailure { Log.w(TAG, "binder call failed: ${it.message}") }
                .getOrNull()
        }

    private fun registerStatusReceiver() {
        if (receiverRegistered) return

        val filter = IntentFilter().apply { SunmiActions.ALL.forEach { addAction(it) } }
        runCatching {
            // EXPORTED is required: these broadcasts come from the vendor's app,
            // not from ours. Without it they stop arriving on Android 13+.
            ContextCompat.registerReceiver(
                context,
                statusReceiver,
                filter,
                ContextCompat.RECEIVER_EXPORTED,
            )
            receiverRegistered = true
        }.onFailure { Log.w(TAG, "could not register status receiver: ${it.message}") }
    }

    companion object {
        private const val TAG = "SunmiPrinter"
        private const val SERVICE_PACKAGE = "woyou.aidlservice.jiuiv5"
        private const val SERVICE_ACTION = "woyou.aidlservice.jiuiv5.IWoyouService"
        private const val BIND_TIMEOUT_MS = 10_000L
        private const val STEP_TIMEOUT_MS = 5_000L
        private const val PRINT_TIMEOUT_MS = 20_000L
        private const val STATUS_GRACE_MS = 1_000L
        private const val QR_SIZE_PX = 384
        private const val FEED_LINES = 4

        private val EOT_QUERY = byteArrayOf(0x10, 0x04, 0x01)
        private val BOLD_ON = byteArrayOf(0x1B, 0x45, 0x01)
        private val BOLD_OFF = byteArrayOf(0x1B, 0x45, 0x00)
    }
}
