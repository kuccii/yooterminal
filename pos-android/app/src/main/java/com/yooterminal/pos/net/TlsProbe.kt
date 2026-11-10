package com.yooterminal.pos.net

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ConnectionSpec
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.InputStream
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

enum class TrustMode { SYSTEM, SYSTEM_PLUS_ISRG }

sealed class TlsResult {
    data class Ok(val status: Int) : TlsResult()
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
                TrustMode.SYSTEM -> defaultClient()
                TrustMode.SYSTEM_PLUS_ISRG -> {
                    requireNotNull(bundledRoot) { "bundledRoot is required for $mode" }
                    clientWithBundledRoot(bundledRoot)
                }
            }
            client.newCall(Request.Builder().url(url).get().build()).execute().use { response ->
                TlsResult.Ok(response.code)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            TlsResult.Failed(e.message ?: e::class.java.simpleName)
        }
    }

    private fun defaultClient(): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()

    private fun clientWithBundledRoot(root: X509Certificate): OkHttpClient {
        val composite = CompositeTrustManager(platformTrustManager(), trustManagerFor(root))
        val context = SSLContext.getInstance("TLS")
        context.init(null, arrayOf<TrustManager>(composite), null)
        return OkHttpClient.Builder()
            .sslSocketFactory(context.socketFactory, composite)
            .connectionSpecs(listOf(ConnectionSpec.MODERN_TLS))
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
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
