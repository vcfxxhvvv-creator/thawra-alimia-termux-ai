#!/usr/bin/env python3
from flask import Flask, request, jsonify
import os
from datetime import datetime
app = Flask(__name__)
KB = {'physics':'E=mc2 F=ma PV=nRT','chemistry':'H2O CO2 118 elements','math':'a2+b2=c2'}
@app.route('/health')
def health():
    return jsonify(status='ok',version='2.0.0',ts=datetime.now().isoformat())
@app.route('/chat',methods=['POST'])
def chat():
    d=request.get_json() or {}
    p=d.get('prompt','').lower()
    for k,v in KB.items():
        if k in p: return jsonify(response=v,confidence=0.95)
    return jsonify(response='Local AI in Termux. Ask physics/chemistry/math.',confidence=0.70)
if __name__=='__main__':
    app.run(host='127.0.0.1',port=5000,threaded=True)
