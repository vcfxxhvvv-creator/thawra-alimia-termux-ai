import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Animated, Dimensions, StatusBar, SafeAreaView, ScrollView } from 'react-native';
import TerminalScreen from './src/TerminalScreen';

const { width } = Dimensions.get('window');
const PORT = 5000;

interface Msg { id:string; text:string; sender:'user'|'ai'; ts:Date; conf?:number; }

const KB:Record<string,string> = {
  'فيزياء':'🔬 الفيزياء: E=mc² | F=ma | ∇×E=-∂B/∂t | iℏ∂ψ/∂t=Ĥψ',
  'كيمياء':'⚗️ الكيمياء: الجدول الدوري 118 عنصر | H₂O+CO₂→H₂CO₃',
  'ذكاء اصطناعي':'🤖 AI محلي عبر Termux! Flask API منفذ 5000 | تعلم عميق | شبكات عصبية',
  'رياضيات':'📐 الرياضيات: ∫e^(-x²)dx=√π/2 | e^(iπ)+1=0 | a²+b²=c²',
  'فلك':'🌌 الفلك: الكون 93 مليار سنة ضوئية | 2 تريليون مجرة',
  'ffmpeg':'🎥 FFmpegKit: اضغط فيديو | استخرج صوت | حول صيغ',
  'سلام':'🌟 أهلاً! ثورة علمية v2.0 | AI محلي + Termux + FFmpegKit',
};

async function ai(inp:string):Promise<{text:string;conf:number}>{
  const low=inp.toLowerCase().trim();
  for(const[k,v]of Object.entries(KB)){if(low.includes(k))return{text:v,conf:0.95}}
  try{const r=await fetch('http://127.0.0.1:'+PORT+'/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:inp})});const d=await r.json();return{text:d.response||'No response',conf:d.confidence||0.8}}catch{}
  return{text:'🤖 سؤالك: '+inp+' | اسأل: فيزياء، كيمياء، رياضيات، فلك، ffmpeg، سلام',conf:0.7};
}

const Bubble:React.FC<{m:Msg;a:Animated.Value}>=({m,a})=>{
  const isU=m.sender==='user';
  return(<Animated.View style={[S.row,{opacity:a},isU?S.uR:S.aR]}>
    {!isU&&<View style={S.av}><Text style={S.avT}>🔬</Text></View>}
    <View style={[S.bub,isU?S.uB:S.aB]}><Text style={[S.mT,isU&&S.uMT]}>{m.text}</Text>
    <View style={S.meta}><Text style={[S.time,isU&&S.uTime]}>{m.ts.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</Text>
    {m.conf!==undefined&&!isU&&<Text style={S.conf}>{Math.round(m.conf*100)}%🎯</Text>}</View></View>
    {isU&&<View style={[S.av,S.avU]}><Text style={S.avT}>👤</Text></View>}
  </Animated.View>);
};

export default function App(){
  const[view,setView]=useState<'chat'|'terminal'>('chat');
  const[msgs,setMsgs]=useState<Msg[]>([{id:'0',text:'🌟 ثورة علمية v2.0\nAI محلي + Termux + FFmpegKit\nاسأل: فيزياء|كيمياء|ذكاء اصطناعي|رياضيات|فلك|ffmpeg|سلام',sender:'ai',ts:new Date(),conf:1}]);
  const[inp,setInp]=useState('');
  const[loading,setLoading]=useState(false);
  const lr=useRef<FlatList>(null);
  const an=useRef<Map<string,Animated.Value>>(new Map());
  const gA=(id:string)=>{if(!an.current.has(id)){const a=new Animated.Value(0);an.current.set(id,a);Animated.spring(a,{toValue:1,friction:8,useNativeDriver:true}).start()}return an.current.get(id)!};
  const add=(m:Omit<Msg,'id'|'ts'>)=>{const f:Msg={...m,id:Date.now()+''+Math.random(),ts:new Date()};setMsgs(p=>[...p,f])};
  const send=async()=>{if(!inp.trim()||loading)return;const t=inp.trim();setInp('');add({text:t,sender:'user'});setLoading(true);const res=await ai(t);add({text:res.text,sender:'ai',conf:res.conf});setLoading(false)};
  const qs=['فيزياء','كيمياء','ذكاء اصطناعي','رياضيات','فلك','ffmpeg','سلام'];

  if(view==='terminal'){
    return(<SafeAreaView style={S.c}>
      <StatusBar barStyle='light-content' backgroundColor='#050510'/>
      <View style={S.hdr}><View style={S.hRow}>
        <TouchableOpacity onPress={()=>setView('chat')}><Text style={S.hI}>💬</Text></TouchableOpacity>
        <View style={S.hInf}><Text style={S.hT}>الترمينال</Text><Text style={S.hS}>proot + Alpine + termux-exec</Text></View>
      </View></View>
      <TerminalScreen/>
    </SafeAreaView>);
  }

  return(<SafeAreaView style={S.c}>
    <StatusBar barStyle='light-content' backgroundColor='#050510'/>
    <KeyboardAvoidingView style={S.c} behavior={Platform.OS==='ios'?'padding':undefined}>
      <View style={S.hdr}><View style={S.hRow}><Text style={S.hI}>🔬</Text><View style={S.hInf}><Text style={S.hT}>ثورة علمية v2.0</Text><Text style={S.hS}>{loading?'🟡 جاري التفكير...':'🟢 جاهز'}</Text></View><TouchableOpacity onPress={()=>setView('terminal')}><Text style={S.hI}>🖥️</Text></TouchableOpacity></View></View>
      {msgs.length<=1&&<View style={S.qW}><Text style={S.qT}>⚡ أسئلة سريعة</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{qs.map(q=><TouchableOpacity key={q} style={S.qB} onPress={()=>setInp(q)}><Text style={S.qBT}>{q}</Text></TouchableOpacity>)}</ScrollView></View>}
      <FlatList ref={lr} data={msgs} renderItem={({item})=><Bubble m={item} a={gA(item.id)}/>} keyExtractor={i=>i.id} contentContainerStyle={S.list} onContentSizeChange={()=>lr.current?.scrollToEnd({animated:true})}/>
      {loading&&<View style={[S.row,S.aR]}><View style={S.av}><Text style={S.avT}>🧠</Text></View><View style={[S.bub,S.aB]}><Text style={S.thT}>جاري التفكير...</Text></View></View>}
      <View style={S.iW}><TextInput style={S.inp} value={inp} onChangeText={setInp} placeholder='اكتب سؤالك...' placeholderTextColor='#555' multiline maxLength={2000} onSubmitEditing={send} textAlign='right'/><TouchableOpacity onPress={send} disabled={!inp.trim()||loading}><View style={[S.sBtn,{backgroundColor:inp.trim()?'#6C63FF':'#222'}]}><Text style={S.sBtnT}>➤</Text></View></TouchableOpacity></View>
    </KeyboardAvoidingView>
  </SafeAreaView>);
}

const S=StyleSheet.create({
  c:{flex:1,backgroundColor:'#050510'},hdr:{padding:14,paddingTop:Platform.OS==='ios'?50:14,backgroundColor:'#0a0a1a'},
  hRow:{flexDirection:'row',alignItems:'center'},hI:{fontSize:32,marginRight:10},hInf:{flex:1},
  hT:{color:'#fff',fontSize:20,fontWeight:'bold'},hS:{color:'#888',fontSize:11,marginTop:2},
  qW:{padding:10,paddingHorizontal:14},qT:{color:'#666',fontSize:12,marginBottom:6,textAlign:'right'},
  qB:{backgroundColor:'#12122a',borderRadius:20,paddingHorizontal:14,paddingVertical:7,marginRight:8,borderWidth:1,borderColor:'#6C63FF33'},qBT:{color:'#6C63FF',fontSize:13},
  list:{padding:14,paddingBottom:8},
  row:{flexDirection:'row',marginBottom:10,alignItems:'flex-end'},uR:{justifyContent:'flex-end'},aR:{justifyContent:'flex-start'},
  av:{width:34,height:34,borderRadius:17,justifyContent:'center',alignItems:'center',marginHorizontal:6,backgroundColor:'#6C63FF'},
  avU:{backgroundColor:'#00C9A7'},avT:{fontSize:16},
  bub:{maxWidth:width*0.74,padding:11,borderRadius:18},uB:{backgroundColor:'#6C63FF',borderBottomRightRadius:4},
  aB:{backgroundColor:'#0f0f23',borderBottomLeftRadius:4,borderWidth:1,borderColor:'#ffffff0d'},
  mT:{color:'#eee',fontSize:14,lineHeight:21,textAlign:'right'},uMT:{color:'#fff'},
  meta:{flexDirection:'row',marginTop:4,gap:8},time:{color:'#555',fontSize:10},uTime:{color:'#ffffff66'},conf:{color:'#6C63FF',fontSize:10},
  thT:{color:'#6C63FF',fontSize:13},
  iW:{flexDirection:'row',alignItems:'center',padding:10,backgroundColor:'#080818',borderTopWidth:1,borderTopColor:'#ffffff0d'},
  inp:{flex:1,backgroundColor:'#0f0f23',borderRadius:24,paddingHorizontal:16,paddingVertical:11,color:'#fff',fontSize:14,maxHeight:110,marginRight:8},
  sBtn:{width:46,height:46,borderRadius:23,justifyContent:'center',alignItems:'center'},sBtnT:{color:'#fff',fontSize:20},
});