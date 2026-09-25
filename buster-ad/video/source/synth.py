import numpy as np, json, wave
SR=44100; DUR=15.0; N=int(SR*DUR)
mix=np.zeros(N)
rng=np.random.default_rng(3)
def mtof(m): return 440*2**((m-69)/12)
def env(n,a=.005,r=.05,sus=1.0):
    t=np.arange(n)/SR; e=np.minimum(1,t/max(a,1e-4)); rel=np.clip((n/SR-t)/r,0,1); return e*np.minimum(rel,1)*sus
def osc(kind,f,n,duty=.5):
    t=np.arange(n)/SR
    if np.isscalar(f): ph=(t*f)%1
    else: ph=np.cumsum(f)/SR%1
    if kind=='sq': return np.where(ph<duty,1.,-1.)
    if kind=='tri': return 4*np.abs(ph-.5)-1
    if kind=='sin': return np.sin(2*np.pi*ph)
def add(t0,sig,vol):
    i=int(t0*SR); 
    if i>=N: return
    s=sig[:N-i]; mix[i:i+len(s)]+=s*vol
def note(t0,m,dur,kind='sq',vol=.1,duty=.5,r=.03):
    n=int(dur*SR); add(t0,osc(kind,mtof(m),n,duty)*env(n,r=r),vol)
def sweep(t0,f0,f1,dur,kind='sq',vol=.1):
    n=int(dur*SR); f=np.geomspace(f0,f1,n); add(t0,osc(kind,f,n)*env(n,r=dur*.6),vol)
def noise(t0,dur,vol,decay=30):
    n=int(dur*SR); t=np.arange(n)/SR; add(t0,rng.uniform(-1,1,n)*np.exp(-t*decay),vol)
def kick(t0): sweep(t0,160,45,.14,'sin',.5)
def snare(t0): noise(t0,.12,.14,25)
def hat(t0): noise(t0,.03,.04,120)

# --- intro: CRT power-on ---
sweep(.25,50,900,.55,'sin',.12); noise(.8,.45,.06,4)
# --- music ---
BEAT=.4; START=1.4
chords=[(57,[57,60,64]),(53,[53,57,60]),(48,[48,52,55]),(55,[55,59,62])]   # Am F C G
lead=[81,None,84,None,88,86,84,81, 79,None,81,None,84,None,79,76, 76,None,79,81,84,None,81,79, 79,81,83,None,86,None,83,None]
t=START; bar=0
while t<12.2-1e-6:
    root,tri=chords[bar%4]
    for e in range(8):   # eighth notes
        tt=t+e*BEAT/2
        if tt>=12.2: break
        note(tt,root-12+(12 if e%2 else 0),BEAT/2*.9,'sq',.07,.5)
        if tt>=4.0:
            for s in range(2):
                note(tt+s*BEAT/4,tri[(e*2+s)%3]+24,BEAT/4*.8,'sq',.035,.25)
            hat(tt)
            if tt<9.8 or tt>=10.0:
                m=lead[(bar%4)*8+e]
                if m: note(tt,m-12 if tt<9.8 else m,BEAT/2*.95,'sq',.05,.125,r=.06)
        if e%2==0:
            b=e//2
            if b in (0,2) or tt>=4.0: kick(tt)
            if b in (1,3) and tt>=2.2: snare(tt)
    t+=4*BEAT; bar+=1
# --- scripted SFX ---
for i in range(6):   # letter landings
    tl=1.4+i*.14+.22; sweep(tl,320,70,.12,'sq',.12); noise(tl,.08,.1,40)
for i in range(3):   # feature card slams
    tc=10.0+i*.75; kick(tc); noise(tc,.25,.2,14); sweep(tc,900,200,.15,'sq',.06)
# coin + price
note(12.72,83,.07,'sq',.12); note(12.79,88,.45,'sq',.12,r=.3)
kick(12.95); noise(12.95,.5,.25,8); sweep(12.95,200,40,.4,'sq',.12)
for k,m in enumerate([69,73,76,81,85,88]): note(13.0+k*.08,m,.4,'sq',.05,.25,r=.2)
for m in [57,61,64,69]: note(13.5,m,1.4,'tri',.12,r=.9)
# outro groove (A major arp), fading
t=13.5
while t<15:
    for k,m in enumerate([69,73,76,81]):
        note(t+k*.1,m+12,.08,'sq',.03*max(0,(15-t)/1.5),.25)
    t+=.4
# --- game events ---
ev=json.load(open('events.json'))
last=-1; pent=[0,3,5,7,10,12,15]
for e in ev:
    if e['type']=='hit':
        if e['t']-last<.045: continue
        last=e['t']; note(e['t'],72+pent[(5-e['row'])%len(pent)],.06,'sq',.08,.5)
    elif e['type']=='pad': note(e['t'],64,.05,'sq',.07)
    elif e['type']=='multi':
        for k,m in enumerate([72,76,79,84,88]): note(e['t']+k*.05,m,.08,'sq',.08)
    elif e['type']=='clear':
        noise(e['t'],.4,.15,10)
        for k,m in enumerate([84,88,91,96]): note(e['t']+k*.07,m,.12,'sq',.07)
# master
fade=np.ones(N); fn=int(.35*SR); fade[-fn:]=np.linspace(1,0,fn)
out=np.tanh(mix*1.4)*fade; out/=np.max(np.abs(out))/.89
pcm=(out*32767).astype(np.int16); st=np.stack([pcm,pcm],1)
with wave.open('music.wav','wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
print('ok')
