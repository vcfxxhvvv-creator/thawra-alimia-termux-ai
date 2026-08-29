import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Terminal } from './Terminal';

type Line = { id: string; text: string };

export default function TerminalScreen() {
  const [phase, setPhase] = useState<'checking' | 'needsInstall' | 'installing' | 'ready' | 'error'>('checking');
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [cmd, setCmd] = useState('');
  const [errorText, setErrorText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const appendLine = (text: string) => {
    setLines((prev) => [...prev, { id: Date.now() + '-' + Math.random(), text }]);
  };

  useEffect(() => {
    const unsubOutput = Terminal.onOutput((line) => appendLine(line));
    const unsubState = Terminal.onSessionState((state) => appendLine(`[session: ${state}]`));

    (async () => {
      try {
        const installed = await Terminal.isInstalled();
        if (!installed) {
          setPhase('needsInstall');
          return;
        }
        await startShell();
      } catch (e: any) {
        setPhase('error');
        setErrorText(String(e?.message ?? e));
      }
    })();

    return () => {
      unsubOutput();
      unsubState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startShell = async () => {
    try {
      const prereq = await Terminal.checkPrerequisites();
      if (!prereq.prootFound) {
        setPhase('error');
        setErrorText(`لا يوجد proot لمعمارية جهازك (${prereq.abi}). راجع build-terminal-assets.yml.`);
        return;
      }
      await Terminal.startSession();
      setPhase('ready');
    } catch (e: any) {
      setPhase('error');
      setErrorText(String(e?.message ?? e));
    }
  };

  const install = async () => {
    setPhase('installing');
    try {
      await Terminal.installRootfs((p) => setProgress(p));
      await startShell();
    } catch (e: any) {
      setPhase('error');
      setErrorText(String(e?.message ?? e));
    }
  };

  const send = async () => {
    if (!cmd.trim()) return;
    appendLine('$ ' + cmd);
    const toSend = cmd;
    setCmd('');
    try {
      await Terminal.sendCommand(toSend);
    } catch (e: any) {
      appendLine('[error] ' + String(e?.message ?? e));
    }
  };

  return (
    <View style={s.container}>
      {phase === 'checking' && (
        <View style={s.center}>
          <ActivityIndicator color="#6C63FF" />
          <Text style={s.dim}>جاري الفحص...</Text>
        </View>
      )}

      {phase === 'needsInstall' && (
        <View style={s.center}>
          <Text style={s.dim}>الترمينال لسه مش متجهز على الجهاز ده.</Text>
          <TouchableOpacity style={s.installBtn} onPress={install}>
            <Text style={s.installBtnText}>تجهيز الترمينال</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'installing' && (
        <View style={s.center}>
          <ActivityIndicator color="#6C63FF" />
          <Text style={s.dim}>
            {progress ? `${progress.label} (${progress.pct}%)` : 'جاري التجهيز...'}
          </Text>
        </View>
      )}

      {phase === 'error' && (
        <View style={s.center}>
          <Text style={s.errorText}>{errorText}</Text>
          <TouchableOpacity style={s.installBtn} onPress={() => { setPhase('checking'); startShell(); }}>
            <Text style={s.installBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'ready' && (
        <>
          <ScrollView
            ref={scrollRef}
            style={s.output}
            contentContainerStyle={s.outputContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {lines.map((l) => (
              <Text key={l.id} style={s.line}>{l.text}</Text>
            ))}
          </ScrollView>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={cmd}
              onChangeText={setCmd}
              placeholder="اكتب أمر..."
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={send}
              textAlign="left"
            />
            <TouchableOpacity onPress={send} style={s.sendBtn}>
              <Text style={s.sendBtnText}>➤</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050510' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  dim: { color: '#888', fontSize: 13, textAlign: 'center' },
  errorText: { color: '#ff6b6b', fontSize: 13, textAlign: 'center' },
  installBtn: { backgroundColor: '#6C63FF', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 },
  installBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  output: { flex: 1 },
  outputContent: { padding: 10 },
  line: { color: '#8fe388', fontFamily: 'monospace', fontSize: 12, marginBottom: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: '#080818', borderTopWidth: 1, borderTopColor: '#ffffff0d' },
  input: { flex: 1, backgroundColor: '#0f0f23', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: '#8fe388', fontFamily: 'monospace', fontSize: 13, marginRight: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6C63FF', justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#fff', fontSize: 18 },
});
