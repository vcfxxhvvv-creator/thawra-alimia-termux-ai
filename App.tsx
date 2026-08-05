import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Animated, Dimensions, StatusBar, SafeAreaView, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FFmpegKit, ReturnCode } from '@ffmpeg-kit/react-native';

const { width } = Dimensions.get('window');
const PORT = 5000;

interface Msg { id:string; text:string; sender:'user'|'ai'|'system'; ts:Date; type:string; conf?:number; }
interface TxSt { connected:boolean; api:boolean; model:boolean; port:number; }

const KB:Record<string,{a:string;t:string;c:number}> = {
  'فيزياء':{a:'🔬 الفيزياء:\nE=mc² | F=ma | ∇×E=-∂B/∂t | iℏ∂ψ/∂t=Ĥψ',t:'scientific',c:0.97},
  'كيمياء':{a:'⚗️ الكيمياء:\nالجدول الدوري 118 عنصر | H₂O+CO₂→H₂CO₃',t:'scientific',c:0.96},
  'ذكاء اصطناعي':{a:'🤖 AI محلي عبر Termux!\nFlask API منفذ 5000\nتعلم عميق | شبكات عصبية | NLP',t:'scientific',c:0.98},
  'رياضيات':{a:'📐 الرياضيات:\n∫e^(-x²)dx=√π/2 | e^(iπ)+1=0 | a²+b²=c²',t:'scientific',c:0.99},
  'فلك':{a:'🌌 الفلك:\nالكون 93 مليار سنة ضوئية | 2 تريليون مجرة',t:'scientific',c:0.95},
  'ffmpeg':{a:'🎥 FFmpegKit جاهز!\nاضغط فيديو | استخرج صوت | حول صيغ',t:'text',c:0.99},
  'سلام':{a:'🌟 أهلاً! ثورة علمية v2.0\nAI محلي + Termux + FFmpegKit\nاسأل: فيزياء|كيمياء|رياضيات|فلك|ffmpeg',t:'text',c:0.99},
};

class FF {
  async compress(i:string,o:string){try{const s=await FFmpegKit.execute('-i '+i+' -vcodec libx264 -crf 28 -acodec aac '+o);const r=await s.getReturnCode();return ReturnCode.isSuccess(r)?{ok:true,m:'✅ تم!'}:{ok:false,m:'❌ فشل'}}catch(e:any){return{ok:false,m:'❌ '+e.message}}}
  async audio(i:string,o:string){try{const s=await FFmpegKit.execute('-i '+i+' -vn -acodec libmp3lame '+o);const r=await s.getReturnCode();return ReturnCode.isSuccess(r)?{ok:true,m:'✅ تم!'}:{ok:false,m:'❌ فشل'}}catch(e:any){return{ok:false,m:'❌ '+e.message}}}
}
const ff = new FF();

async function ai(inp:string, tx:TxSt):Promise<{text:string;type:string;conf:number}>{
  const low=inp.toLowerCase().trim();
  for(const[k,v]of Object.entries(KB)){if(low.includes(k))return{text:v.a,type:v.t,conf:v.c}}
  if(low.includes('حالة')||low.includes('status')){const e=tx.connected?'🟢':'🔴';return{text:e+' Termux:'+(tx.connected?'متصل✅':'غير متصل❌')+' API:'+(tx.api?'شغال✅':'متوقف❌')+' FFmpeg:جاهز✅ منفذ:'+tx.port,type:'status',conf:0.9}}
  if(tx.connected&&tx.api){try{const r=await fetch('http://127.0.0.1:'+PORT+'/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:inp})});const d=await r.json();return{text:d.response||'No response',type:'text',conf:d.confidence||0.8}}catch{}}
  return{text:'🤖 سؤالك: '+inp+'\nاسأل عن: فيزياء، كيمياء، رياضيات، فلك، ffmpeg، حالة',type:'text',conf:0.7};
}

const Bubble:React.FC<{m:Msg;a:Animated.Value}>=({m,a})=>{
  const isU=m.sender==='user';
  return(<Animated.View style={[S.row,{opacity:a},isU?S.uR:S.aR]}>
    {!isU&&<LinearGradient colors={['#6C63FF','#3F51B5']} style={S.av}><Text style={S.avT}>🔬</Text></LinearGradient>}
    <View style={[S.bub,isU?S.uB:S.aB]}>
      {m.type==='status'?<View style={S.stB}><Text style={S.stT}>{m.text}</Text></View>:
       <Text style={[S.mT,isU&&S.uMT]}>{m.text}</Text>}
      <View style={S.meta}><Text style={[S.time,isU&&S.uTime]}>{m.ts.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</Text>
      {m.conf!==undefined&&!isU&&<Text style={S.conf}>{Math.round(m.conf*100)}%🎯</Text>}</View>
    </View>
    {isU&&<LinearGradient colors={['#00C9A7','#00B4D8']} style={S.av}><Text style={S.avT}>👤</Text></LinearGradient>}
  </Animated.View>);
};

const Think:React.FC<{t:string;p:number}>=({t,p})=>{
  const[d,setD]=useState('');
  useEffect(()=>{const i=setInterval(()=>setD(x=>x.length>=3?'':x+'.'),350);return()=>clearInterval(i)},[]);
  return(<View style={[S.row,S.aR]}><LinearGradient colors={['#6C63FF','#3F51B5']} style={S.av}><Text style={S.avT}>🧠</Text></LinearGradient>
    <View style={[S.bub,S.aB,S.thB]}><Text style={S.thT}>{t}{d}</Text>
    <View style={S.pTr}><View style={[S.pBar,{width:p+'%'}]}/></View></View></View>);
};

export default function App(){
  const[msgs,setMsgs]=useState<Msg[]>([{id:'0',text:'🌟 ثورة علمية v2.0\nAI محلي + Termux + FFmpegKit\nاسأل: فيزياء|كيمياء|ذكاء اصطناعي|رياضيات|فلك|ffmpeg|حالة',sender:'ai',ts:new Date(),type:'text',conf:1}]);
  const[inp,setInp]=useState('');
  const[ag,setAg]=useState({th:false,task:'جاهز',prog:100,conf:1});
  const[tx,setTx]=useState<TxSt>({connected:false,api:false,model:false,port:PORT});
  const lr=useRef<FlatList>(null);
  const an=useRef<Map<string,Animated.Value>>(new Map());
  const gA=(id:string)=>{if(!an.current.has(id)){const a=new Animated.Value(0);an.current.set(id,a);Animated.spring(a,{toValue:1,friction:8,useNativeDriver:true}).start()}return an.current.get(id)!};
  const add=(m:Omit<Msg,'id'|'ts'>)=>{const f:Msg={...m,id:Date.now()+''+Math.random(),ts:new Date()};setMsgs(p=>[...p,f])};
  const chk=useCallback(async()=>{try{const r=await fetch('http://127.0.0.1:'+PORT+'/health');if(r.ok){setTx(s=>({...s,connected:true,api:true,model:true}));return true}}catch{}setTx(s=>({...s,connected:false,api:false}));return false},[]);
  useEffect(()=>{chk();const t=setInterval(chk,15000);return()=>clearInterval(t)},[chk]);
  const send=async()=>{if(!inp.trim()||ag.th)return;Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);const t=inp.trim();setInp('');add({text:t,sender:'user',type:'text'});setAg({th:true,task:'🧠 تحليل',prog:20,conf:0.5});await new Promise(r=>setTimeout(r,400));setAg(a=>({...a,task:'🔍 بحث',prog:50}));await new Promise(r=>setTimeout(r,400));setAg(a=>({...a,task:'⚡ إجابة',prog:80}));const res=await ai(t,tx);await new Promise(r=>setTimeout(r,300));add({text:res.text,sender:'ai',type:res.type,conf:res.conf});setAg({th:false,task:'جاهز',prog:100,conf:res.conf});Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)};
  const qs=['فيزياء','كيمياء','ذكاء اصطناعي','رياضيات','فلك','ffmpeg','حالة','سلام'];
  return(<SafeAreaView style={S.c}>
    <StatusBar barStyle='light-content' backgroundColor='#050510'/>
    <KeyboardAvoidingView style={S.c} behavior={Platform.OS==='ios'?'padding':undefined}>
      <LinearGradient colors={['#0a0a1a','#1a0a2e','#0a0a1a']} style={S.hdr}>
        <View style={S.hRow}><Text style={S.hI}>🔬</Text><View style={S.hInf}><Text style={S.hT}>ثورة علمية v2.0</Text><Text style={S.hS}>{ag.th?'🟡 '+ag.task:'🟢 '+ag.task} • {Math.round(ag.conf*100)}%</Text></View><TouchableOpacity onPress={chk}><Text style={{fontSize:20}}>🔄</Text></TouchableOpacity></View>
        <View style={S.sP}>{[['Termux',tx.connected],['API',tx.api],['FFmpeg',true]].map(([l,v])=><View key={l as string} style={S.sI}><View style={[S.dot,(v as boolean)?S.dOn:S.dOff]}/><Text style={S.sL}>{l as string}</Text></View>)}</View>
      </LinearGradient>
      {msgs.length<=1&&<View style={S.qW}><Text style={S.qT}>⚡ أسئلة سريعة</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{qs.map(q=><TouchableOpacity key={q} style={S.qB} onPress={()=>setInp(q)}><Text style={S.qBT}>{q}</Text></TouchableOpacity>)}</ScrollView></View>}
      <FlatList ref={lr} data={msgs} renderItem={({item})=><Bubble m={item} a={gA(item.id)}/>} keyExtractor={i=>i.id} contentContainerStyle={S.list} onContentSizeChange={()=>lr.current?.scrollToEnd({animated:true})}/>
      {ag.th&&<Think t={ag.task} p={ag.prog}/>}
      <View style={S.iW}><TextInput style={S.inp} value={inp} onChangeText={setInp} placeholder='اكتب سؤالك...' placeholderTextColor='#555' multiline maxLength={2000} onSubmitEditing={send} textAlign='right'/><TouchableOpacity onPress={send} disabled={!inp.trim()||ag.th}><LinearGradient colors={inp.trim()?['#6C63FF','#3F51B5']:['#222','#222']} style={S.sBtn}><Text style={S.sBtnT}>➤</Text></LinearGradient></TouchableOpacity></View>
    </KeyboardAvoidingView>
  </SafeAreaView>);
}

const S=StyleSheet.create({
  c:{flex:1,backgroundColor:'#050510'},hdr:{padding:14,paddingTop:Platform.OS==='ios'?50:14},
  hRow:{flexDirection:'row',alignItems:'center'},hI:{fontSize:32,marginRight:10},hInf:{flex:1},
  hT:{color:'#fff',fontSize:20,fontWeight:'bold'},hS:{color:'#888',fontSize:11,marginTop:2},
  sP:{flexDirection:'row',marginTop:10,gap:12},sI:{flexDirection:'row',alignItems:'center',gap:4},
  dot:{width:8,height:8,borderRadius:4},dOn:{backgroundColor:'#00ff88'},dOff:{backgroundColor:'#ff4444'},sL:{color:'#aaa',fontSize:11},
  qW:{padding:10,paddingHorizontal:14},qT:{color:'#666',fontSize:12,marginBottom:6,textAlign:'right'},
  qB:{backgroundColor:'#12122a',borderRadius:20,paddingHorizontal:14,paddingVertical:7,marginRight:8,borderWidth:1,borderColor:'#6C63FF33'},qBT:{color:'#6C63FF',fontSize:13},
  list:{padding:14,paddingBottom:8},
  row:{flexDirection:'row',marginBottom:10,alignItems:'flex-end'},uR:{justifyContent:'flex-end'},aR:{justifyContent:'flex-start'},
  av:{width:34,height:34,borderRadius:17,justifyContent:'center',alignItems:'center',marginHorizontal:6},avT:{fontSize:16},
  bub:{maxWidth:width*0.74,padding:11,borderRadius:18},uB:{backgroundColor:'#6C63FF',borderBottomRightRadius:4},
  aB:{backgroundColor:'#0f0f23',borderBottomLeftRadius:4,borderWidth:1,borderColor:'#ffffff0d'},
  thB:{backgroundColor:'#0f0f2e'},mT:{color:'#eee',fontSize:14,lineHeight:21,textAlign:'right'},uMT:{color:'#fff'},
  stB:{backgroundColor:'#0a1628',borderRadius:8,padding:10,borderLeftWidth:3,borderLeftColor:'#00ff88'},stT:{color:'#88ccff',fontSize:13,textAlign:'right'},
  meta:{flexDirection:'row',marginTop:4,gap:8},time:{color:'#555',fontSize:10},uTime:{color:'#ffffff66'},conf:{color:'#6C63FF',fontSize:10},
  thT:{color:'#6C63FF',fontSize:13,marginBottom:6},pTr:{height:3,backgroundColor:'#1a1a3e',borderRadius:2,overflow:'hidden'},pBar:{height:3,backgroundColor:'#6C63FF',borderRadius:2},
  iW:{flexDirection:'row',alignItems:'center',padding:10,backgroundColor:'#080818',borderTopWidth:1,borderTopColor:'#ffffff0d'},
  inp:{flex:1,backgroundColor:'#0f0f23',borderRadius:24,paddingHorizontal:16,paddingVertical:11,color:'#fff',fontSize:14,maxHeight:110,marginRight:8},
  sBtn:{width:46,height:46,borderRadius:23,justifyContent:'center',alignItems:'center'},sBtnT:{color:'#fff',fontSize:20},
});