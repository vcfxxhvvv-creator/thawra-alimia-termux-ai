import { NativeEventEmitter, NativeModules } from 'react-native';

const { TerminalModule } = NativeModules;

if (!TerminalModule) {
  // Most likely cause: native code changed but the app wasn't rebuilt.
  // This module only exists after a real native build (EAS/GitHub Actions),
  // not in a plain `expo start` JS-only reload.
  console.warn(
    '[Terminal] Native TerminalModule not found - rebuild the app ' +
    '(this only appears after a native build picks up the android/ changes).'
  );
}

const emitter = TerminalModule ? new NativeEventEmitter(TerminalModule) : null;

export type InstallProgress = { pct: number; label: string };
export type SessionState = 'started' | 'stopped';

/**
 * Thin wrapper around the native PRoot/Alpine terminal.
 * Real shell, real filesystem, runs entirely inside this app's own sandbox
 * (no separate Termux app involved, no root).
 */
export const Terminal = {
  isInstalled(): Promise<boolean> {
    return TerminalModule.isInstalled();
  },

  /** Confirms CI actually shipped a proot binary matching this device's ABI. */
  checkPrerequisites(): Promise<{
    prootFound: boolean;
    termuxExecFound: boolean;
    nativeLibDir: string;
    abi: string;
  }> {
    return TerminalModule.checkPrerequisites();
  },

  /** Unpacks proot + termux-exec + the Alpine rootfs from the APK on first run. */
  installRootfs(onProgress?: (p: InstallProgress) => void): Promise<boolean> {
    let sub: { remove: () => void } | null = null;
    if (onProgress && emitter) {
      sub = emitter.addListener('onInstallProgress', (raw: string) => {
        const [pctStr, label] = raw.split('|');
        onProgress({ pct: Number(pctStr), label });
      });
    }
    return TerminalModule.installRootfs().finally(() => sub?.remove());
  },

  startSession(): Promise<boolean> {
    return TerminalModule.startSession();
  },

  sendCommand(command: string): Promise<boolean> {
    return TerminalModule.sendCommand(command);
  },

  stopSession(): Promise<boolean> {
    return TerminalModule.stopSession();
  },

  /** Streams each output line as it arrives. Call the returned function to unsubscribe. */
  onOutput(callback: (line: string) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener('onTerminalOutput', callback);
    return () => sub.remove();
  },

  onSessionState(callback: (state: SessionState) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener('onSessionState', callback);
    return () => sub.remove();
  },
};
