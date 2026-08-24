package com.thawra.termux.ai.terminal

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

/**
 * Bridges a real PRoot-based Linux (Alpine) session into the app.
 *
 * This does NOT shell out to the separately-installed Termux app - it runs a
 * proot binary that is bundled inside this app's own assets and extracted
 * into this app's own private files directory (filesDir), the same general
 * approach used by UserLAnd (github.com/CypherpunkArmory/UserLAnd) to run a
 * full Linux distro inside a non-Termux Android app.
 *
 * Everything this module does is local to the device: it spawns a child
 * process under this app's own UID, with no elevated/root privileges, and
 * streams its stdout/stdin back and forth over the React Native bridge so
 * JS can show it in the UI and/or let the on-device model use it as a tool.
 *
 * proot and termux-exec ship as jniLibs (libproot.so / libtermuxexec.so,
 * produced by CI - see .github/workflows/build-terminal-assets.yml) so
 * Android's own packaging places them somewhere execution is permitted
 * on Android 10+. Only the Alpine rootfs (plain data) is extracted into
 * filesDir at runtime - see AssetInstaller.
 */
class TerminalModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var process: Process? = null
    private var readerThread: Thread? = null

    private val distDir: File
        get() = File(reactApplicationContext.filesDir, "proot-dist")

    private val nativeLibDir: String
        get() = reactApplicationContext.applicationInfo.nativeLibraryDir

    override fun getName() = "TerminalModule"

    private fun emit(eventName: String, data: String) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, data)
    }

    /** Required boilerplate so RN's NativeEventEmitter doesn't warn. */
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    @ReactMethod
    fun isInstalled(promise: Promise) {
        val marker = File(distDir, ".installed")
        promise.resolve(marker.exists())
    }

    /** Sanity check that CI actually produced a proot binary for this device's ABI. */
    @ReactMethod
    fun checkPrerequisites(promise: Promise) {
        val prootBin = File(nativeLibDir, "libproot.so")
        val execShim = File(nativeLibDir, "libtermuxexec.so")
        val tallocLib = File(nativeLibDir, "libtalloc.so")
        val result = com.facebook.react.bridge.Arguments.createMap()
        result.putBoolean("prootFound", prootBin.exists())
        result.putBoolean("termuxExecFound", execShim.exists())
        result.putBoolean("tallocFound", tallocLib.exists())
        result.putString("nativeLibDir", nativeLibDir)
        result.putString("abi", android.os.Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
        promise.resolve(result)
    }

    /**
     * Extracts the proot binary, termux-exec shim, and Alpine rootfs from
     * the APK's assets/ into this app's private filesDir. Runs once; safe
     * to call again (no-ops if already installed).
     */
    @ReactMethod
    fun installRootfs(promise: Promise) {
        Thread {
            try {
                AssetInstaller.installIfNeeded(reactApplicationContext, distDir) { pct, label ->
                    emit("onInstallProgress", "$pct|$label")
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("INSTALL_FAILED", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun startSession(promise: Promise) {
        if (process != null) {
            promise.reject("ALREADY_RUNNING", "A terminal session is already running")
            return
        }
        if (!File(distDir, ".installed").exists()) {
            promise.reject("NOT_INSTALLED", "Call installRootfs() first")
            return
        }

        val prootFile = File(nativeLibDir, "libproot.so")
        val execFile = File(nativeLibDir, "libtermuxexec.so")
        if (!prootFile.exists()) {
            promise.reject(
                "PROOT_MISSING",
                "No proot binary for this device's ABI (${android.os.Build.SUPPORTED_ABIS.joinToString()}) " +
                    "in $nativeLibDir. CI likely only built for one ABI - check build-terminal-assets.yml."
            )
            return
        }

        Thread {
            try {
                val prootBin = prootFile.absolutePath
                val ldPreload = execFile.absolutePath
                val rootfs = File(distDir, "alpine").absolutePath
                val tmp = File(reactApplicationContext.filesDir, "proot-tmp").apply { mkdirs() }

                val cmd = mutableListOf(
                    prootBin,
                    "--link2symlink",
                    "-0",
                    "-r", rootfs,
                    "-b", "/dev", "-b", "/proc", "-b", "/sys",
                    "-w", "/root",
                    "/usr/bin/env", "-i",
                    "HOME=/root",
                    "TERM=xterm-256color",
                    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                    "/bin/sh"
                )

                val pb = ProcessBuilder(cmd)
                pb.environment()["PROOT_TMP_DIR"] = tmp.absolutePath
                // libtalloc.so ships as a jniLib next to libproot.so (proot
                // links against it dynamically) - point its linker there.
                pb.environment()["LD_LIBRARY_PATH"] = nativeLibDir
                if (execFile.exists()) {
                    pb.environment()["LD_PRELOAD"] = ldPreload
                } else {
                    emit("onSessionState", "warning:termux-exec missing, exec() edge cases may fail")
                }
                pb.redirectErrorStream(true)
                pb.directory(distDir)

                val proc = pb.start()
                process = proc
                promise.resolve(true)
                emit("onSessionState", "started")

                readerThread = Thread {
                    try {
                        val reader = BufferedReader(InputStreamReader(proc.inputStream))
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            emit("onTerminalOutput", line ?: "")
                        }
                    } catch (_: Exception) {
                        // stream closed because the session ended - not an error
                    } finally {
                        emit("onSessionState", "stopped")
                        process = null
                    }
                }.apply { start() }
            } catch (e: Exception) {
                promise.reject("START_FAILED", e.message, e)
            }
        }.start()
    }

    /** Sends one line/command into the running shell's stdin. */
    @ReactMethod
    fun sendCommand(command: String, promise: Promise) {
        val proc = process
        if (proc == null) {
            promise.reject("NOT_RUNNING", "No terminal session running - call startSession() first")
            return
        }
        try {
            proc.outputStream.write((command + "\n").toByteArray(Charsets.UTF_8))
            proc.outputStream.flush()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("WRITE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stopSession(promise: Promise) {
        process?.destroy()
        process = null
        readerThread = null
        promise.resolve(true)
    }
}
