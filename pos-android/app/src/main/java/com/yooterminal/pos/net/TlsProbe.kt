package com.yooterminal.pos.net

import android.annotation.SuppressLint
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ConnectionSpec
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLPeerUnverifiedException
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

enum class TrustMode { SYSTEM, SYSTEM_PLUS_ISRG }

/**
 * Deliberately distinguishes *why* a probe failed. "Android 6 does not trust
 * this chain" and "the device has no internet" are the two outcomes the gate
 * decision hinges on, and collapsing them into one message makes the result
 * unreadable.
 */
sealed class TlsResult {
    data class Ok(val status: Int) : TlsResult()
    data class NotTrusted(val message: String) : TlsResult()
    data class NetworkError(val message: String) : TlsResult()
    data class HttpError(val status: Int) : TlsResult()
    data class Failed(val message: String) : TlsResult()
}

object TlsProbe {

    fun bundledRootCertificate(file: File): X509Certificate =
        file.inputStream().use { bundledRootCertificate(it) }

    fun bundledRootCertificate(input: InputStream): X509Certificate {
        val factory = CertificateFactory.getInstance("X.509")
        return factory.generateCertificate(input) as X509Certificate
    }

    suspend fun probe(
        url: String,
        mode: TrustMode,
        bundledRoot: X509Certificate? = null,
    ): TlsResult = withContext(Dispatchers.IO) {
        try {
            val client = when (mode) {
                TrustMode.SYSTEM -> baseClient().build()
                TrustMode.SYSTEM_PLUS_ISRG -> {
                    requireNotNull(bundledRoot) { "bundledRoot is required for $mode" }
                    clientWithBundledRoot(bundledRoot)
                }
            }
            client.newCall(Request.Builder().url(url).get().build()).execute().use { response ->
                if (response.isSuccessful) {
                    TlsResult.Ok(response.code)
                } else {
                    TlsResult.HttpError(response.code)
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: SSLHandshakeException) {
            TlsResult.NotTrusted(describe(e))
        } catch (e: SSLPeerUnverifiedException) {
            TlsResult.NotTrusted(describe(e))
        } catch (e: GeneralSecurityException) {
            TlsResult.NotTrusted(describe(e))
        } catch (e: UnknownHostException) {
            TlsResult.NetworkError(describe(e))
        } catch (e: SocketTimeoutException) {
            TlsResult.NetworkError(describe(e))
        } catch (e: IOException) {
            TlsResult.NetworkError(describe(e))
        } catch (e: Exception) {
            TlsResult.Failed(describe(e))
        }
    }

    /**
     * Both probes share this so the only variable between them is trust. A
     * production client should use `MODERN_TLS`; a diagnostic must not, or a
     * cipher mismatch looks indistinguishable from a trust failure.
     */
    private fun baseClient(): OkHttpClient.Builder = OkHttpClient.Builder()
        .connectionSpecs(listOf(ConnectionSpec.COMPATIBLE_TLS))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)

    private fun clientWithBundledRoot(root: X509Certificate): OkHttpClient {
        val composite = CompositeTrustManager(platformTrustManager(), trustManagerFor(root))
        val context = SSLContext.getInstance("TLS")
        context.init(null, arrayOf<TrustManager>(composite), null)
        return baseClient()
            .sslSocketFactory(context.socketFactory, composite)
            .build()
    }

    private fun platformTrustManager(): X509TrustManager {
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        factory.init(null as KeyStore?)
        return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
    }

    private fun trustManagerFor(cert: X509Certificate): X509TrustManager {
        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType())
        keyStore.load(null, null)
        keyStore.setCertificateEntry("isrg-root-x1", cert)
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        factory.init(keyStore)
        return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
    }

    private fun describe(e: Exception): String =
        "${e::class.java.simpleName}: ${e.message ?: "no message"}"

    /**
     * Lint flags every custom trust manager because most of them disable
     * validation. This one does the opposite: it delegates to the platform
     * manager first and only falls back to the one extra root, so a chain that
     * Android already trusts can never be rejected by this class.
     */
    @SuppressLint("CustomX509TrustManager")
    private class CompositeTrustManager(
        private val platform: X509TrustManager,
        private val extra: X509TrustManager,
    ) : X509TrustManager {

        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            platform.checkClientTrusted(chain, authType)
        }

        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            try {
                platform.checkServerTrusted(chain, authType)
            } catch (e: CertificateException) {
                extra.checkServerTrusted(chain, authType)
            }
        }

        override fun getAcceptedIssuers(): Array<X509Certificate> =
            platform.acceptedIssuers + extra.acceptedIssuers
    }
}
