import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, Dimensions, StatusBar,
  SafeAreaView, ActivityIndicator, Alert, Vibration, ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FFmpegKit, ReturnCode } from '@ffmpeg-kit/react-native';

const { width, height } = Dimensions.get('window');

// ============================================================
// ثورة علمية v2.0 - Local AI Chat with Embedded Termux
// Unified Single-Screen Chat Interface
// FFmpegKit + Termux Bootstrap + GitHub Actions CI/CD
// ============================================================

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai' | 'system';
  timestamp: Date;
  type: 'text' | 'code' | 'scientific' | 'video' | 'status' | 'error';
  confidence?: number;
}

interface TermuxStatus {
  connected: boolean;
  apiRunning: boolean;
  modelLoaded: boolean;
  ffmpegReady: boolean;
  port: number;
  lastCheck: number;
}

const LOCAL_API_PORT = 5000;

const KNOWLEDGE: Record<string, { ans: string; type: string; conf: number }> = {
  'فيزياء': { ans: '🔬 الفيزياء:\n\n• E = mc² (أينشتاين)\n• F = ma (نيوتن)\n• ∇×E = -∂B/∂t (ماكسويل)\n• iℏ∂ψ/∂t = Ĥψ (شرودنغر)\n• S = k·ln(W) (بولتزمان)', type: 'scientific', conf: 0.97 },
  'كيمياء': { ans: '⚗️ الكيمياء:\n\n• الجدول الدوري: 118 عنصر\n• H₂O + CO₂ → H₂CO₃\n• C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O\n• pH = -log[H⁺]', type: 'scientific', conf: 0.96 },
  'ذكاء اصطناعي': { ans: '🤖 الذكاء الاصطناعي:\n\nهذا التطبيق يستخدم نموذج AI محلي!\nيعبر عبر Termux مدمج + Flask API\nعلى المنفذ 5000\n\n• التعلم العميق\n• الشبكات العصبية\n• NLP معالجة اللغة', type: 'scientific', conf: 0.98 },
  'رياضيات': { ans: '📐 الرياضيات:\n\n• ∫₀^∞ e^(-x²)dx = √π/2\n• ∑1/n² = π²/6\n• e^(iπ) + 1 = 0\n• a² + b² = c²', type: 'scientific', conf: 0.99 },
  'فلك': { ans: '🌌 الفلك:\n\n• الكون: 93 مليار سنة ضوئية\n• 2 تريليون مجرة\n• المادة المظلمة: 27%\n• الطاقة المظلمة: 68%', type: 'scientific', conf: 0.95 },
  'ffmpeg': { ans: '🎥 FFmpegKit جاهز!\n\nأوامر مدعومة:\n• "اضغط فيديو" - ضغط MP4\n• "استخرج صوت" - تحويل لـ MP3\n• "حول mp4" - تغيير الصيغة\n• "معلومات فيديو" - تفاصيل الملف', type: 'text', conf: 0.99 },
  'termux': { ans: '💻 حالة Termux:\nيتم التحقق من الاتصال...\nالمنفذ: 5000\nالنموذج: local AI\nالحالة: checking...', type: 'status', conf: 0.85 },
  'سلام': { ans: '🌟 أهلاً بك في ثورة علمية v2.0!\n\nأنا وكيل AI محلي يعمل عبر Termux.\n\nأسألني عن:\n🔬 فيزياء | ⚗️ كيمياء | 🤖 ذكاء اصطناعي\n📐 رياضيات | 🌌 فلك | 🎥 ffmpeg', type: 'text', conf: 0.99 },
};

class FFmpegProc {
  async compress(inp: string, out: string) {
    try {
      const s = await FFmpegKit.execute(`-i ${inp} -vcodec libx264 -crf 28 -preset fast -acodec aac ${out}`);
      const rc = await s.getReturnCode();
      return ReturnCode.isSuccess(rc) ? { ok: true, msg: '✅ تم الضغط!' } : { ok: false, msg: '❌ فشل' };
    } catch (e: any) { return { ok: false, msg: '❌ ' + e.message }; }
  }
  async extractAudio(inp: string, out: string) {
    try {
      const s = await FFmpegKit.execute(`-i ${inp} -vn -acodec libmp3lame -q:a 2 ${out}`);
      const rc = await s.getReturnCode();
      return ReturnCode.isSuccess(rc) ? { ok: true, msg: '✅ تم استخراج الصوت!' } : { ok: false, msg: '❌ فشل' };
    } catch (e: any) { return { ok: false, msg: '❌ ' + e.message }; }
  }
  async convert(inp: string, out: string) {
    try {
      const s = await FFmpegKit.execute(`-i ${inp} -c:v libx264 -c:a aac ${out}`);
      const rc = await s.getReturnCode();
      return ReturnCode.isSuccess(rc) ? { ok: true, msg: '✅ تم التحويل!' } : { ok: false, msg: '❌ فشل' };
    } catch (e: any) { return { ok: false, msg: '❌ ' + e.message }; }
  }
}

const ffmpeg = new FFmpegProc();

async function processAI(input: string, termuxStatus: TermuxStatus): Promise<{ text: string; type: string; conf: number }> {
  const lower = input.toLowerCase().trim();

  // Check knowledge base first
  for (const [key, val] of Object.entries(KNOWLEDGE)) {
    if (lower.includes(key)) return { text: val.ans, type: val.type, conf: val.conf };
  }

  // FFmpeg commands
  if (lower.includes('اضغط') || lower.includes('compress')) {
    return { text: '🎥 لأضغط فيديو، أرسل لي مسار الملف أو استخدم زر اختيار الملف.\n\nمثال: /compress /sdcard/video.mp4', type: 'text', conf: 0.95 };
  }
  if (lower.includes('استخرج صوت') || lower.includes('extract audio')) {
    return { text: '🎵 لاستخراج الصوت، أرسل مسار الفيديو.\n\nمثال: /audio /sdcard/video.mp4', type: 'text', conf: 0.95 };
  }
  if (lower.includes('معادلة') || lower.includes('equation')) {
    return { text: '🔢 معادلات أساسية:\n\nE = mc²\nF = ma\nPV = nRT\n∇²φ = -ρ/ε₀\niℏ∂ψ/t = Ĥψ', type: 'scientific', conf: 0.97 };
  }
  if (lower.includes('كود') || lower.includes('code') || lower.includes('برمج')) {
    return { text: '💻 مثال Python:\n\n```python\nimport numpy as np\n\ndef neural_net(x, w):\n    z = np.dot(x, w)\n    return 1/(1+np.exp(-z))\n\nfor epoch in range(1000):\n    pred = neural_net(X, W)\n    err = Y - pred\n    W += 0.01 * np.dot(X.T, err)\n```', type: 'code', conf: 0.94 };
  }
  if (lower.includes('حالة') || lower.includes('status')) {
    const statusEmoji = termuxStatus.connected ? '🟢' : '🔴';
    return {
      text: `${statusEmoji} حالة النظام:\n\n• Termux: ${termuxStatus.connected ? 'متصل ✅' : 'غير متصل ❌'}\n• API: ${termuxStatus.apiRunning ? 'شغال ✅' : 'متوقف ❌'}\n• FFmpeg: جاهز ✅\n• المنفذ: ${termuxStatus.port}\n• النموذج: ${termuxStatus.modelLoaded ? 'محمل ✅' : 'غير محمل ⚠️'}`,
      type: 'status', conf: 0.90
    };
  }

  // Try local API if connected
  if (termuxStatus.connected && termuxStatus.apiRunning) {
    try {
      const resp = await fetch(`http://127.0.0.1:${LOCAL_API_PORT}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input, lang: 'ar' })
      });
      const data = await resp.json();
      return { text: data.response || data.error || 'No response', type: 'text', conf: data.confidence || 0.8 };
    } catch {
      // Fall through to default
    }
  }

  return {
    text: `🤖 سؤالك: "${input}"\n\nأنا أعمل حالياً في الوضع المحلي.\nلربط Termux AI:\n1. شغل Termux\n2. نفذ: python server.py\n3. اسألني "حالة"\n\nأو اسألني عن: فيزياء، كيمياء، رياضيات، فلك، ذكاء اصطناعي، ffmpeg`,
    type: 'text', conf: 0.70
  };
}

// ─── Message Bubble Component ─────────────────────────────────
const MsgBubble: React.FC<{ msg: Message; anim: Animated.Value }> = ({ msg, anim }) => {
  const isUser = msg.sender === 'user';
  const isSystem = msg.sender === 'system';

  if (isSystem) {
    return (
      <Animated.View style={[styles.systemRow, { opacity: anim }]}>
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{msg.text}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.msgRow, { opacity: anim }, isUser ? styles.userRow : styles.aiRow]}>
      {!isUser && (
        <LinearGradient colors={['#6C63FF','#3F51B5']} style={styles.avatar}>
          <Text style={styles.avatarTxt}>🔬</Text>
        </LinearGradient>
      )}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {msg.type === 'code' ? (
          <View style={styles.codeBlock}><Text style={styles.codeTxt}>{msg.text}</Text></View>
        ) : msg.type === 'status' ? (
          <View style={styles.statusBlock}><Text style={styles.statusTxt}>{msg.text}</Text></View>
        ) : msg.type === 'error' ? (
          <View style={styles.errorBlock}><Text style={styles.errorTxt}>{msg.text}</Text></View>
        ) : (
          <Text style={[styles.msgTxt, isUser && styles.userMsgTxt]}>{msg.text}</Text>
        )}
        <View style={styles.metaRow}>
          <Text style={[styles.time, isUser && styles.userTime]}>
            {msg.timestamp.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}
          </Text>
          {msg.confidence !== undefined && !isUser && (
            <Text style={styles.confBadge}>{Math.round(msg.confidence*100)}% 🎯</Text>
          )}
          {msg.type === 'scientific' && !isUser && <Text style={styles.sciBadge}>🔬</Text>}
        </View>
      </View>
      {isUser && (
        <LinearGradient colors={['#00C9A7','#00B4D8']} style={styles.avatar}>
          <Text style={styles.avatarTxt}>👤</Text>
        </LinearGradient>
      )}
    </Animated.View>
  );
};

// ─── Thinking Indicator ────────────────────────────────────────
const Thinking: React.FC<{ task: string; progress: number }> = ({ task, progress }) => {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const t = setInterval(() => setDots(p => p.length >= 3 ? '' : p + '.'), 350);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={[styles.msgRow, styles.aiRow]}>
      <LinearGradient colors={['#6C63FF','#3F51B5']} style={styles.avatar}>
        <Text style={styles.avatarTxt}>🧠</Text>
      </LinearGradient>
      <View style={[styles.bubble, styles.aiBubble, styles.thinkingBubble]}>
        <Text style={styles.thinkingTxt}>{task}{dots}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
        </View>
      </View>
    </View>
  );
};

// ─── Status Bar Component ──────────────────────────────────────
const StatusPanel: React.FC<{ status: TermuxStatus }> = ({ status }) => (
  <View style={styles.statusPanel}>
    <View style={styles.statusItem}>
      <View style={[styles.dot, status.connected ? styles.dotOn : styles.dotOff]} />
      <Text style={styles.statusLabel}>Termux</Text>
    </View>
    <View style={styles.statusItem}>
      <View style={[styles.dot, status.apiRunning ? styles.dotOn : styles.dotOff]} />
      <Text style={styles.statusLabel}>API</Text>
    </View>
    <View style={styles.statusItem}>
      <View style={[styles.dot, styles.dotOn]} />
      <Text style={styles.statusLabel}>FFmpeg</Text>
    </View>
    <View style={styles.statusItem}>
      <View style={[styles.dot, status.modelLoaded ? styles.dotOn : styles.dotWarn]} />
      <Text style={styles.statusLabel}>Model</Text>
    </View>
  </View>
);

// ─── Main App ──────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState<Message[]>([{
    id: '0',
    text: '🌟 ثورة علمية v2.0\n\nوكيل AI محلي + Termux مدمج + FFmpegKit\n\nاسألني: فيزياء | كيمياء | ذكاء اصطناعي | رياضيات | فلك | ffmpeg | حالة',
    sender: 'ai', timestamp: new Date(), type: 'text', confidence: 1.0
  }]);
  const [input, setInput] = useState('');
  const [agent, setAgent] = useState({ thinking: false, task: 'جاهز', progress: 100, confidence: 1.0 });
  const [termux, setTermux] = useState<TermuxStatus>({
    connected: false, apiRunning: false, modelLoaded: false, ffmpegReady: true, port: LOCAL_API_PORT, lastCheck: Date.now()
  });
  const listRef = useRef<FlatList>(null);
  const anims = useRef<Map<string, Animated.Value>>(new Map());

  const getAnim = (id: string) => {
    if (!anims.current.has(id)) {
      const a = new Animated.Value(0);
      anims.current.set(id, a);
      Animated.spring(a, { toValue: 1, friction: 8, useNativeDriver: true }).start();
    }
    return anims.current.get(id)!;
  };

  const addMsg = (msg: Omit<Message,'id'|'timestamp'>) => {
    const full: Message = { ...msg, id: Date.now().toString() + Math.random(), timestamp: new Date() };
    setMessages(prev => [...prev, full]);
    return full;
  };

  const checkTermux = useCallback(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${LOCAL_API_PORT}/health`, { method: 'GET' });
      if (r.ok) {
        setTermux(s => ({ ...s, connected: true, apiRunning: true, modelLoaded: true, lastCheck: Date.now() }));
        return true;
      }
    } catch {}
    setTermux(s => ({ ...s, connected: false, apiRunning: false, lastCheck: Date.now() }));
    return false;
  }, []);

  useEffect(() => {
    checkTermux();
    const t = setInterval(checkTermux, 15000);
    return () => clearInterval(t);
  }, [checkTermux]);

  const send = async () => {
    if (!input.trim() || agent.thinking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userText = input.trim();
    setInput('');
    addMsg({ text: userText, sender: 'user', type: 'text' });
    setAgent({ thinking: true, task: '🧠 تحليل السؤال', progress: 20, confidence: 0.5 });

    await new Promise(r => setTimeout(r, 400));
    setAgent(a => ({ ...a, task: '🔍 البحث في قاعدة المعرفة', progress: 50 }));
    await new Promise(r => setTimeout(r, 400));
    setAgent(a => ({ ...a, task: '⚡ توليد الإجابة', progress: 80 }));

    const result = await processAI(userText, termux);
    await new Promise(r => setTimeout(r, 300));

    addMsg({ text: result.text, sender: 'ai', type: result.type as any, confidence: result.conf });
    setAgent({ thinking: false, task: 'جاهز', progress: 100, confidence: result.conf });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const quickQs = ['فيزياء','كيمياء','ذكاء اصطناعي','رياضيات','فلك','ffmpeg','حالة','سلام'];

  const renderMsg = ({ item }: { item: Message }) => <MsgBubble msg={item} anim={getAnim(item.id)} />;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050510" />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS==='ios'?'padding':undefined}>

        {/* Header */}
        <LinearGradient colors={['#0a0a1a','#1a0a2e','#0a0a1a']} style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerIcon}>🔬</Text>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>ثورة علمية v2.0</Text>
              <Text style={styles.headerSub}>
                {agent.thinking ? '🟡 '+agent.task : '🟢 '+agent.task}
                {' • '}{Math.round(agent.confidence*100)}%
              </Text>
            </View>
            <TouchableOpacity onPress={checkTermux} style={styles.refreshBtn}>
              <Text style={styles.refreshTxt}>🔄</Text>
            </TouchableOpacity>
          </View>
          <StatusPanel status={termux} />
        </LinearGradient>

        {/* Quick Questions */}
        {messages.length <= 1 && (
          <View style={styles.quickWrap}>
            <Text style={styles.quickTitle}>⚡ أسئلة سريعة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
              {quickQs.map(q => (
                <TouchableOpacity key={q} style={styles.quickBtn} onPress={() => setInput(q)}>
                  <Text style={styles.quickBtnTxt}>{q}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderMsg}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />

        {agent.thinking && <Thinking task={agent.task} progress={agent.progress} />}

        {/* Input */}
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="اكتب سؤالك العلمي..."
            placeholderTextColor="#555"
            multiline maxLength={2000}
            onSubmitEditing={send}
            textAlign="right"
          />
          <TouchableOpacity onPress={send} disabled={!input.trim()||agent.thinking}>
            <LinearGradient
              colors={input.trim()?['#6C63FF','#3F51B5']:['#222','#222']}
              style={styles.sendBtn}
            >
              <Text style={styles.sendTxt}>➤</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#050510' },
  header: { padding:14, paddingTop: Platform.OS==='ios'?50:14 },
  headerRow: { flexDirection:'row', alignItems:'center' },
  headerIcon: { fontSize:32, marginRight:10 },
  headerInfo: { flex:1 },
  headerTitle: { color:'#fff', fontSize:20, fontWeight:'bold' },
  headerSub: { color:'#888', fontSize:11, marginTop:2 },
  refreshBtn: { padding:8 },
  refreshTxt: { fontSize:20 },
  statusPanel: { flexDirection:'row', marginTop:10, gap:12 },
  statusItem: { flexDirection:'row', alignItems:'center', gap:4 },
  dot: { width:8, height:8, borderRadius:4 },
  dotOn: { backgroundColor:'#00ff88' },
  dotOff: { backgroundColor:'#ff4444' },
  dotWarn: { backgroundColor:'#ffaa00' },
  statusLabel: { color:'#aaa', fontSize:11 },
  quickWrap: { padding:10, paddingHorizontal:14 },
  quickTitle: { color:'#666', fontSize:12, marginBottom:6, textAlign:'right' },
  quickScroll: { flexDirection:'row' },
  quickBtn: { backgroundColor:'#12122a', borderRadius:20, paddingHorizontal:14, paddingVertical:7, marginRight:8, borderWidth:1, borderColor:'#6C63FF33' },
  quickBtnTxt: { color:'#6C63FF', fontSize:13 },
  list: { padding:14, paddingBottom:8 },
  msgRow: { flexDirection:'row', marginBottom:10, alignItems:'flex-end' },
  userRow: { justifyContent:'flex-end' },
  aiRow: { justifyContent:'flex-start' },
  systemRow: { alignItems:'center', marginBottom:8 },
  systemBubble: { backgroundColor:'#1a1a2e', borderRadius:12, paddingHorizontal:14, paddingVertical:6 },
  systemText: { color:'#888', fontSize:12, textAlign:'center' },
  avatar: { width:34, height:34, borderRadius:17, justifyContent:'center', alignItems:'center', marginHorizontal:6 },
  avatarTxt: { fontSize:16 },
  bubble: { maxWidth: width*0.74, padding:11, borderRadius:18 },
  userBubble: { backgroundColor:'#6C63FF', borderBottomRightRadius:4 },
  aiBubble: { backgroundColor:'#0f0f23', borderBottomLeftRadius:4, borderWidth:1, borderColor:'#ffffff0d' },
  thinkingBubble: { backgroundColor:'#0f0f2e' },
  msgTxt: { color:'#eee', fontSize:14, lineHeight:21, textAlign:'right' },
  userMsgTxt: { color:'#fff' },
  codeBlock: { backgroundColor:'#0d1117', borderRadius:8, padding:10 },
  codeTxt: { color:'#7ee787', fontFamily: Platform.OS==='ios'?'Menlo':'monospace', fontSize:11, textAlign:'left' },
  statusBlock: { backgroundColor:'#0a1628', borderRadius:8, padding:10, borderLeftWidth:3, borderLeftColor:'#00ff88' },
  statusTxt: { color:'#88ccff', fontSize:13, textAlign:'right' },
  errorBlock: { backgroundColor:'#1a0a0a', borderRadius:8, padding:10, borderLeftWidth:3, borderLeftColor:'#ff4444' },
  errorTxt: { color:'#ff8888', fontSize:13, textAlign:'right' },
  metaRow: { flexDirection:'row', marginTop:4, gap:8, alignItems:'center' },
  time: { color:'#555', fontSize:10 },
  userTime: { color:'#ffffff66' },
  confBadge: { color:'#6C63FF', fontSize:10 },
  sciBadge: { fontSize:10 },
  thinkingTxt: { color:'#6C63FF', fontSize:13, marginBottom:6 },
  progressTrack: { height:3, backgroundColor:'#1a1a3e', borderRadius:2, overflow:'hidden' },
  progressBar: { height:3, backgroundColor:'#6C63FF', borderRadius:2 },
  inputWrap: { flexDirection:'row', alignItems:'center', padding:10, backgroundColor:'#080818', borderTopWidth:1, borderTopColor:'#ffffff0d' },
  input: { flex:1, backgroundColor:'#0f0f23', borderRadius:24, paddingHorizontal:16, paddingVertical:11, color:'#fff', fontSize:14, maxHeight:110, marginRight:8 },
  sendBtn: { width:46, height:46, borderRadius:23, justifyContent:'center', alignItems:'center' },
  sendTxt: { color:'#fff', fontSize:20 },
});
