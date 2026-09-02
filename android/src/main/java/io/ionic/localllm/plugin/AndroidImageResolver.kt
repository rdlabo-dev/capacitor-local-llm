package io.ionic.localllm.plugin

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.webkit.MimeTypeMap
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.util.Base64
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

internal sealed interface AndroidImageInput {
    data class UriValue(val value: String) : AndroidImageInput
    data class Base64Value(val value: String) : AndroidImageInput
}

internal class ResolvedAndroidImages(
    val paths: List<String>,
    private val temporaryFiles: List<File>
) : AutoCloseable {
    suspend fun decodeBitmaps(): List<Bitmap> {
        val bitmaps = mutableListOf<Bitmap>()
        try {
            withContext(Dispatchers.IO) {
                var totalPixels = 0L
                paths.forEach { path ->
                    currentCoroutineContext().ensureActive()
                    val bitmap = decodeImage(path)
                    bitmaps += bitmap
                    totalPixels = checkedTotalPixels(totalPixels, bitmap.width, bitmap.height)
                }
            }
            currentCoroutineContext().ensureActive()
            return bitmaps
        } catch (error: CancellationException) {
            bitmaps.forEach(Bitmap::recycle)
            throw error
        } catch (error: Exception) {
            bitmaps.forEach(Bitmap::recycle)
            if (error is LocalLLMError) throw error
            throw LocalLLMError.ImageNotReadable(error)
        } catch (error: OutOfMemoryError) {
            bitmaps.forEach(Bitmap::recycle)
            throw LocalLLMError.ImageTooLarge("decoded images exceeded available memory", error)
        }
    }

    override fun close() {
        temporaryFiles.forEach(File::delete)
    }
}

internal class AndroidImageResolver(private val context: Context) {
    suspend fun resolve(inputs: List<AndroidImageInput>): ResolvedAndroidImages {
        val temporaryFiles = mutableListOf<File>()
        try {
            val paths = withContext(Dispatchers.IO) {
                inputs.map { input -> resolveOne(input, temporaryFiles) }
            }
            currentCoroutineContext().ensureActive()
            return ResolvedAndroidImages(paths, temporaryFiles)
        } catch (error: CancellationException) {
            temporaryFiles.forEach(File::delete)
            throw error
        } catch (error: LocalLLMError) {
            temporaryFiles.forEach(File::delete)
            throw error
        } catch (error: Exception) {
            temporaryFiles.forEach(File::delete)
            throw LocalLLMError.ImageNotReadable(error)
        }
    }

    private suspend fun resolveOne(input: AndroidImageInput, temporaryFiles: MutableList<File>): String {
        if (input is AndroidImageInput.Base64Value) {
            return resolveBase64(input.value, temporaryFiles)
        }
        val value = (input as AndroidImageInput.UriValue).value
        if (value.startsWith(CONTENT_URI_PREFIX)) {
            val uri = Uri.parse(value)
            val extension = MimeTypeMap.getSingleton()
                .getExtensionFromMimeType(context.contentResolver.getType(uri))
                ?.let { ".$it" } ?: ".img"
            val temporary = File.createTempFile("image-", extension, context.cacheDir)
            temporaryFiles += temporary
            context.contentResolver.openInputStream(uri)?.use { input ->
                temporary.outputStream().use { output -> copyWithByteLimit(input, output) }
            } ?: throw LocalLLMError.ImageNotReadable()
            return temporary.absolutePath
        }

        val file = resolveLocalFile(value, "image")
        if (!file.isAbsolute || !file.isFile || !file.canRead()) {
            throw LocalLLMError.ImageNotReadable()
        }
        if (file.length() > ImageInputPolicy.MAX_FILE_BYTES) {
            throw LocalLLMError.ImageTooLarge()
        }
        return file.absolutePath
    }

    private fun resolveBase64(value: String, temporaryFiles: MutableList<File>): String {
        val bytes = decodeBase64Image(value)
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        if (options.outWidth <= 0 || options.outHeight <= 0) throw LocalLLMError.ImageNotReadable()

        val temporary = File.createTempFile("image-", ".img", context.cacheDir)
        temporaryFiles += temporary
        temporary.writeBytes(bytes)
        return temporary.absolutePath
    }
}

internal fun decodeBase64Image(value: String): ByteArray {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) {
        throw LocalLLMError.InvalidOptions("each image must contain non-empty base64 data")
    }
    val encoded = if (trimmed.startsWith(DATA_URI_PREFIX)) {
        val comma = trimmed.indexOf(',')
        if (comma < 0 || !trimmed.substring(0, comma).endsWith(";base64", ignoreCase = true)) {
            throw LocalLLMError.ImageNotReadable()
        }
        trimmed.substring(comma + 1)
    } else {
        trimmed
    }
    if (encoded.length.toLong() > ImageInputPolicy.MAX_BASE64_CHARACTERS) {
        throw LocalLLMError.ImageTooLarge()
    }
    val bytes = try {
        Base64.getDecoder().decode(encoded)
    } catch (error: IllegalArgumentException) {
        throw LocalLLMError.ImageNotReadable(error)
    }
    if (bytes.isEmpty()) throw LocalLLMError.ImageNotReadable()
    if (bytes.size.toLong() > ImageInputPolicy.MAX_FILE_BYTES) throw LocalLLMError.ImageTooLarge()
    return bytes
}

internal object ImageInputPolicy {
    const val MAX_IMAGES = 4
    const val MAX_FILE_MEBIBYTES = 32
    const val MAX_FILE_BYTES = MAX_FILE_MEBIBYTES * 1024L * 1024L
    const val MAX_BASE64_CHARACTERS = ((MAX_FILE_BYTES + 2L) / 3L) * 4L
    const val MAX_LONG_EDGE = 2048
    const val MAX_PIXEL_COUNT = 4_194_304L
    const val MAX_TOTAL_PIXEL_COUNT = 8_388_608L
}

private fun decodeImage(path: String): Bitmap {
    val source = ImageDecoder.createSource(File(path))
    return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
        val width = info.size.width
        val height = info.size.height
        if (width <= 0 || height <= 0) throw LocalLLMError.ImageNotReadable()
        val longEdgeScale = ImageInputPolicy.MAX_LONG_EDGE.toDouble() / maxOf(width, height)
        val pixelScale = kotlin.math.sqrt(ImageInputPolicy.MAX_PIXEL_COUNT.toDouble() / (width.toLong() * height))
        val scale = minOf(1.0, longEdgeScale, pixelScale)
        if (scale < 1.0) {
            decoder.setTargetSize(maxOf(1, (width * scale).toInt()), maxOf(1, (height * scale).toInt()))
        }
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
    }
}

internal fun checkedTotalPixels(current: Long, width: Int, height: Int): Long {
    val total = current + width.toLong() * height
    if (total > ImageInputPolicy.MAX_TOTAL_PIXEL_COUNT) {
        throw LocalLLMError.ImageTooLarge("decoded images exceed the total pixel budget")
    }
    return total
}

internal suspend fun copyWithByteLimit(
    input: InputStream,
    output: OutputStream,
    maxBytes: Long = ImageInputPolicy.MAX_FILE_BYTES
) {
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var copied = 0L
    while (true) {
        currentCoroutineContext().ensureActive()
        val count = input.read(buffer)
        if (count < 0) return
        copied += count
        if (copied > maxBytes) throw LocalLLMError.ImageTooLarge()
        output.write(buffer, 0, count)
    }
}

private const val CONTENT_URI_PREFIX = "content://"
private const val DATA_URI_PREFIX = "data:"
