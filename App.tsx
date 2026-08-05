import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, Dimensions, StatusBar,
  SafeAreaView, ActivityIndicator, Alert, Linking, Vibration
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FFmpegKit, ReturnCode } from '@ffmpeg-kit/react-native';
import RNFS from 'react-native-fs';
import TcpSocket from 'react-native-tcp-socket';

const { width, height } = Dimensions.get('window');

// ============================================================
// ثورة علمية v2.0 - Local AI Chat with Embedded Termux
// Unified Chat Interface + FFmpegKit + Termux Bootstrap
// ============================================================

// ─── Types ────────────────────────────────────────────────────
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai' | 'system';
  timestamp: Date;
  type: 'text' | 'code' | 'scientific' | 'video' | 'status';
  metadata?: Record<string, any>;
}

interface TermuxStatus {
  connected: boolean;
  apiRunning: boolean;
  modelLoaded: boolean;
  ffmpegReady: boolean;
  port: number;
}

interface AgentState {
  thinking: boolean;
  task: string;
  progress: number;
  confidence: number;
}

// ─── Constants ────────────────────────────────────────────────
const LOCAL_API_PORT = 5000;
const TERMUX_BOOTSTRAP_URL = 'https://github.com/termux/termux-packages/releases';
const FFMPEG_DEB_ARCH = 'aarch64';
const AI_MODEL_DIR = '/data/data/com.thawra.termux.ai/files/models';

// ─── Scientific Knowledge Base ────────────────────────────────
const KNOWLEDGE_BASE: Record<string, { answer: string; type: string; confidence: number }> = {
  'فيزياء': {
    answer: '🔬 الفيزياء - علم المادة والطاقة:\n\n• الميكانيكا الكلاسيكية (نيوتن)\n• النسبية الخاصة والعامة (أينشتاين)\n• ميكانيكا الكم (بلانك، بور، هايزنبرغ)\n• الديناميكا الحرارية\n• الكهرومغناطيسية (ماكسويل)\n\n⚡ E = mc²\n🌊 λ = h/p\n🔥 ΔS ≥ 0',
    type: 'scientific', confidence: 0.96
  },
  'كيمياء': {
    answer: '️ الكيمياء - علم التفاعلات:\n\n• الجدول الدوري (118 عنصر)\n• الروابط الكيميائية (أيونية، تساهمية، فلزية)\n• التفاعلات الكيميائية\n• الكيمياء العضوية\n• الكيمياء الحيوية\n\n🧪 H₂O + CO₂ → H₂CO₃\n⚛️ C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O',
    type: 'scientific', confidence: 0.95
  },
  'ذكاء اصطناعي': {
    answer: '🤖 الذكاء الاصطناعي:\n\n• التعلم العميق (Deep Learning)\n• الشبكات العصبية (Neural Networks)\n• معالجة اللغة الطبيعية (NLP)\n• الرؤية الحاسوبية (Computer Vision)\n• التعلم المعزز (Reinforcement Learning)\n\n📊 هذا التطبيق يستخدم نموذج AI محلي يعمل عبر Termux!',
    type: 'scientific', confidence: 0.97
  },
  'رياضيات': {
    answer: ' الرياضيات - لغة الكون:\n\n• الجبر الخطي\n• التفاضل والتكامل\n• الاحتمالات والإحصاء\n• نظرية الأعداد\n• الطوبولوجيا\n\n∫₀^∞ e^(-x²) dx = √π/2\n∑(n=1→∞) 1/n² = π²/6\neiπ + 1 = 0',
    type: 'scientific', confidence: 0.98
  },
  'فلك': {
    answer: '🌌 علم الفلك:\n\n• الكون المرئي: 93 مليار سنة ضوئية\n• المجرات: 2 تريليون مجرة\n• الثقوب السوداء\n• المادة المظلمة (27%)\n• الطاقة المظلمة (68%)\n\n🌍 الأرض → ☀️ الشمس → 🌌 درب التبانة',
    type: 'scientific', confidence: 0.94
  },
  'ffmpeg': {
    answer: '🎥 FFmpegKit مدمج في التطبيق!\n\nيمكنك:\n• تحويل صيغ الفيديو\n• ضغط الملفات\n• استخراج الصوت\n• إضافة تأثيرات\n• دمج الفيديوهات\n\nجرب: "حول فيديو" أو "اضغط فيديو"',
    type: 'text', confidence: 0.99
  },
  'termux': {
    answer: '💻 Termux مدمج في التطبيق!\n\n• بيئة Linux كاملة على Android\n• تشغيل نماذج AI محلياً\n• Flask API server على المنفذ 5000\n• معالجة بيانات بدون إنترنت\n\nالحالة: يتم التحقق...',
    type: 'status', confidence: 0.90
  },
};

// ─── Termux Connection Manager ────────────────────────────────
class TermuxManager {
  private socket: any = null;
  private port: number;
  private onStatusChange: (status: Partial<TermuxStatus>) => void;

  constructor(port: number, onStatusChange: (s: Partial<TermuxStatus>) => void) {
    this.port = port;
    this.onStatusChange = onStatusChange;
  }

  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.socket = TcpSocket.createConnection({ port: this.port, host: '127.0.0.1' }, () => {
          this.onStatusChange({ connected: true, apiRunning: true });
          resolve(true);
        });
        this.socket.on('error', () => {
          this.onStatusChange({ connected: false, apiRunning: false });
          resolve(false);
        });
        this.socket.on('close', () => {
          this.onStatusChange({ connected: false });
        });
        setTimeout(() => resolve(false), 3000);
      } catch {
        resolve(false);
      }
    });
  }

  async sendPrompt(prompt: string): Promise<string> {
    if (!this.socket) return 'ERROR: Not connected to Termux';
    return new Promise((resolve) => {
      const request = JSON.stringify({ prompt, timestamp: Date.now() });
      let response = '';
      this.socket.write(request + '\n');
      this.socket.on('data', (data: Buffer) => {
        response += data.toString();
        try {
          const parsed = JSON.parse(response);
          resolve(parsed.response || parsed.error || response);
        } catch {
          if (response.includes('\n')) resolve(response.trim());
        }
      });
      setTimeout(() => resolve(response || 'Timeout waiting for AI response'), 30000);
    });
  }

  disconnect() {
    if (this.socket) { this.socket.destroy(); this.socket = null; }
  }
}

// ─── FFmpeg Processor ─────────────────────────────────────────
class FFmpegProcessor {
  async compressVideo(inputPath: string, outputPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const cmd = `-i ${inputPath} -vcodec libx264 -crf 28 -preset fast -acodec aac -b:a 128k ${outputPath}`;
      const session = await FFmpegKit.execute(cmd);
      const rc = await session.getReturnCode();
      if (ReturnCode.isSuccess(rc)) {
        return { success: true, message: '✅ تم ضغط الفيديو بنجاح!' };
      }
      return { success: false, message: '❌ فشل ضغط الفيديو' };
    } catch (e: any) {
      return { success: false, message: '❌ خطأ: ' + e.message };
    }
  }

  async extractAudio(inputPath: string, outputPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const cmd = `-i ${inputPath} -vn -acodec libmp3lame -q:a 2 ${outputPath}`;
      const session = await FFmpegKit.execute(cmd);
      const rc = await session.getReturnCode();
      if (ReturnCode.isSuccess(rc)) {
        return { success: true, message: '✅ تم استخراج الصوت بنجاح!' };
      }
      return { success: false, message: '❌ فشل استخراج الصوت' };
    } catch (e: any) {
      return { success: false, message: '❌ خطأ: ' + e.message };
    }
  }

  async convertFormat(inputPath: string, outputPath: string, format: string): Promise<{ success: boolean; message: string }> {
    try {
      const cmd = `-i ${inputPath} -c:v libx264 -c:a aac ${outputPath}`;
      const session = await FFmpegKit.execute(cmd);
      const rc = await session.getReturnCode();
      if (ReturnCode.isSuccess(rc)) {
        return { success: true, message: `✅ تم التحويل إلى ${format} بنجاح!` };
      }
      return { success: false, message: '❌ فشل التحويل' };
    } catch (e: any) {
      return { success: false, message: '❌ خطأ: ' + e.message };
    }
  }

  async getMediaInfo(inputPath: string): Promise<string> {
    try {
      const cmd = `-i ${inputPath} -f null -`;
      const session = await FFmpegKit.execute(cmd);
      const logs = await session.getAllLogsAsString();
      return logs || 'No info available';
    } catch {
      return 'Error getting media info';
    }
  }
}

