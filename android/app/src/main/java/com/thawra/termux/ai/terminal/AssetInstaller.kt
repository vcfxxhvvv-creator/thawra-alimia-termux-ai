package com.thawra.termux.ai.terminal

import android.content.Context
import android.content.res.AssetManager
import android.system.Os
import java.io.File
import java.io.FileOutputStream
import java.util.zip.GZIPInputStream

/**
 * IMPORTANT: proot and termux-exec are NOT handled here as copied assets.
 *
 * Android 10+ enforces W^X on app-private storage (files copied into
 * filesDir/cache and chmod'd executable at runtime are blocked from
 * executing on many devices/kernels - this is the actual cause behind
 * the "behaves differently depending on the device" behavior mentioned
 * early on). The reliable, standard way around this (what Termux and
 * UserLAnd both do) is to ship native executables as fake `.so` files
 * under jniLibs/<abi>/, which Android's own packaging extracts to the
 * app's nativeLibraryDir - a location Android explicitly permits
 * execution from. See android/app/src/main/jniLibs/ (populated by CI)
 * and how TerminalModule resolves `context.applicationInfo.nativeLibraryDir`.
 *
 * This class only handles the Alpine rootfs, which is plain data (no
 * execute bit needed), so extracting it into filesDir is fine.
 *
 * Expected asset (produced by CI): assets/proot-dist/alpine-minirootfs.tar.gz
 */
object AssetInstaller {

    private const val ASSET_ROOT = "proot-dist"

    fun installIfNeeded(
        context: Context,
        targetDir: File,
        onProgress: (pct: Int, label: String) -> Unit
    ) {
        val marker = File(targetDir, ".installed")
        if (marker.exists()) return

        targetDir.mkdirs()
        val am = context.assets

        onProgress(10, "unpacking alpine rootfs")
        val tarball = File(targetDir, "alpine-minirootfs.tar.gz")
        copyAssetFile(am, "$ASSET_ROOT/alpine-minirootfs.tar.gz", tarball)

        val rootfsDir = File(targetDir, "alpine")
        rootfsDir.mkdirs()
        GZIPInputStream(tarball.inputStream().buffered()).use { gz ->
            MiniTarExtractor.extract(gz, rootfsDir) { pct ->
                // scale the 0-100 extraction progress into our 10-95 slice
                onProgress(10 + (pct * 85 / 100), "unpacking alpine rootfs")
            }
        }
        tarball.delete()

        onProgress(98, "finishing up")
        // proot needs a writable tmp dir that isn't on a noexec-mounted path
        File(context.filesDir, "proot-tmp").mkdirs()

        marker.createNewFile()
        onProgress(100, "done")
    }

    private fun copyAssetFile(am: AssetManager, assetPath: String, outFile: File) {
        outFile.parentFile?.mkdirs()
        am.open(assetPath).use { input ->
            FileOutputStream(outFile).use { output ->
                input.copyTo(output, bufferSize = 1 shl 16)
            }
        }
    }
}

/**
 * Minimal pure-Kotlin TAR reader (no external deps). Supports what Alpine's
 * official minirootfs tarball actually uses: regular files, directories,
 * symlinks, and GNU long-name entries ('L' typeflag). This has NOT been
 * exercised against a real Alpine tarball yet (that happens once CI
 * produces one) - treat this as a first pass that will likely need at
 * least one round of real-device debugging.
 */
object MiniTarExtractor {

    fun extract(input: java.io.InputStream, destDir: File, onProgress: (Int) -> Unit) {
        val header = ByteArray(512)
        var pendingLongName: String? = null
        var totalRead = 0L

        while (true) {
            val n = readFully(input, header)
            if (n < 512) break
            totalRead += 512

            // Two consecutive zero blocks mark end-of-archive.
            if (header.all { it == 0.toByte() }) break

            val name = pendingLongName ?: readCString(header, 0, 100)
            pendingLongName = null
            if (name.isEmpty()) continue

            val sizeStr = readCString(header, 124, 12).trim()
            val size = if (sizeStr.isEmpty()) 0L else sizeStr.toLong(8)
            val typeFlag = header[156].toInt().toChar()
            val linkName = readCString(header, 157, 100)

            val prefix = readCString(header, 345, 155)
            val fullName = if (prefix.isNotEmpty()) "$prefix/$name" else name

            when (typeFlag) {
                'L' -> {
                    // GNU long name: file content of this entry IS the next entry's real name.
                    val nameBytes = ByteArray(size.toInt())
                    readFully(input, nameBytes)
                    pendingLongName = String(nameBytes, Charsets.UTF_8).trimEnd('\u0000')
                    skipPadding(input, size)
                }
                '5' -> {
                    // directory
                    File(destDir, fullName).mkdirs()
                }
                '2' -> {
                    // symlink
                    val target = File(destDir, fullName)
                    target.parentFile?.mkdirs()
                    try {
                        if (!target.exists()) Os.symlink(linkName, target.absolutePath)
                    } catch (_: Exception) {
                        // non-fatal: some symlinks (e.g. pointing outside the rootfs)
                        // may fail on certain filesystems - skip rather than abort
                    }
                }
                '0', '\u0000' -> {
                    // regular file
                    val outFile = File(destDir, fullName)
                    outFile.parentFile?.mkdirs()
                    FileOutputStream(outFile).use { out ->
                        copyExact(input, out, size)
                    }
                    val mode = readCString(header, 100, 8).trim()
                    val modeVal = if (mode.isEmpty()) 0 else mode.toInt(8)
                    if (modeVal and 0b001_000_000 != 0) outFile.setExecutable(true, false)
                    skipPadding(input, size)
                }
                else -> {
                    // hardlinks / device files / fifos etc. - skip content, not needed for a minimal rootfs
                    skipExact(input, size)
                    skipPadding(input, size)
                }
            }

            totalRead += size + paddingFor(size)
            // Alpine minirootfs is roughly ~3MB compressed / ~9-10MB uncompressed;
            // this is a rough estimate just to drive a progress bar, not exact.
            onProgress(((totalRead.toDouble() / (10L * 1024 * 1024)) * 100).toInt().coerceIn(0, 99))
        }
    }

    private fun paddingFor(size: Long): Long {
        val rem = size % 512
        return if (rem == 0L) 0 else 512 - rem
    }

    private fun skipPadding(input: java.io.InputStream, size: Long) {
        val pad = paddingFor(size)
        if (pad > 0) skipExact(input, pad)
    }

    private fun copyExact(input: java.io.InputStream, out: FileOutputStream, size: Long) {
        val buf = ByteArray(1 shl 16)
        var remaining = size
        while (remaining > 0) {
            val toRead = minOf(buf.size.toLong(), remaining).toInt()
            val n = input.read(buf, 0, toRead)
            if (n < 0) break
            out.write(buf, 0, n)
            remaining -= n
        }
    }

    private fun skipExact(input: java.io.InputStream, size: Long) {
        var remaining = size
        val buf = ByteArray(8192)
        while (remaining > 0) {
            val n = input.read(buf, 0, minOf(buf.size.toLong(), remaining).toInt())
            if (n < 0) break
            remaining -= n
        }
    }

    private fun readFully(input: java.io.InputStream, buf: ByteArray): Int {
        var off = 0
        while (off < buf.size) {
            val n = input.read(buf, off, buf.size - off)
            if (n < 0) break
            off += n
        }
        return off
    }

    private fun readCString(buf: ByteArray, offset: Int, len: Int): String {
        var end = offset
        val limit = offset + len
        while (end < limit && buf[end] != 0.toByte()) end++
        return String(buf, offset, end - offset, Charsets.UTF_8)
    }
}
