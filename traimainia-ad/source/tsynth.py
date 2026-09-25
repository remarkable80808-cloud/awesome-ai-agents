import numpy as np, json, wave
SR=44100; DUR=15.0; N=int(SR*DUR)
L=np.zeros(N); R=np.zeros(N)
rng=np.random.default_rng(11)
def filt(x,lo=None,hi=None):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR)+1e-6
    if hi: X*=1/(1+(f/hi)**4)
    if lo: X*=(f/lo)**4/(1+(f/lo)**4)
    return np.fft.irfft(X,len(x))
def add(t0,sig,vol,pan=0.):
    i=int(t0*SR)
    if i>=N: return
    s=sig[:N-i]*vol; L[i:i+len(s)]+=s*(1-pan)*.5*2**.5*.7071*1.414; R[i:i+len(s)]+=s*(1+pan)*.5*1.0
def ts(n): return np.arange(n)/SR
def osc(kind,f,n):
    ph=(np.cumsum(np.broadcast_to(f,(n,)))/SR)%1
    return {'saw':2*ph-1,'sq':np.where(ph<.5,1.,-1.),'sin':np.sin(2*np.pi*ph)}[kind]
def env(n,a=.005,d=None,r=.05):
    t=ts(n); e=np.minimum(1,t/a); e*=np.clip((n/SR-t)/r,0,1)
    if d: e*=np.exp(-t/d)
    return e
def noise(n): return rng.uniform(-1,1,n)
def mtof(m): return 440*2**((m-69)/12)
def kick(t0,v=.9): n=int(.3*SR); f=np.geomspace(150,40,n); add(t0,osc('sin',f,n)*env(n,d=.12),v)
def snare(t0,v=.35): n=int(.2*SR); add(t0,filt(noise(n),lo=900)*env(n,d=.06)+.4*osc('sin',190,n)*env(n,d=.04),v)
def hat(t0,v=.07): n=int(.04*SR); add(t0,filt(noise(n),lo=6000)*env(n,d=.012),v,rng.uniform(-.4,.4))
def boom(t0,size=1.,v=.8):
    n=int(2.2*size*SR); add(t0,filt(noise(n),hi=500*size**-.3)*env(n,a=.003,d=.45*size),v)
    m=int(1.2*SR); add(t0,osc('sin',np.geomspace(70,28,m),m)*env(m,d=.35*size),v*.9)
    k=int(.15*SR); add(t0,filt(noise(k),lo=2500)*env(k,d=.03),v*.4)
def shot(t0):
    n=int(.25*SR); add(t0,filt(noise(n),hi=4500)*env(n,a=.001,d=.035),.55,.15)
    m=int(.12*SR); add(t0,osc('sin',np.geomspace(140,60,m),m)*env(m,a=.001,d=.04),.6)
def riser(t0,dur,v=.25):
    n=int(dur*SR); t=ts(n); s=filt(noise(n),lo=1500)*(t/dur)**2.5; add(t0,s*env(n,r=.02),v)
    add(t0,osc('saw',np.geomspace(80,700,n),n)*(t/dur)**3*env(n,r=.02),v*.25)
def horn(t0,dur,doppler_t=None,v=.3):
    n=int(dur*SR); t=ts(n)+t0
    shift=np.ones(n) if doppler_t is None else 1.05-0.12/(1+np.exp(-(t-doppler_t)*6))
    s=sum(osc('saw',f*shift*(1+.003*np.sin(2*np.pi*5*ts(n))),n) for f in (293.7,349.2,440.0))
    add(t0,filt(s,hi=1800)*env(n,a=.08,r=.3),v)
ev=json.load(open('traim_events.json'))
# ---- intro: rumble, horn, clacks, whoosh ----
n=int(3.1*SR); t=ts(n); swell=np.exp(-((t-1.35)/.7)**2)*.9+.15
add(0,filt(noise(n),hi=180)*swell*env(n,a=.4,r=.1),1.4)
horn(.35,1.5,doppler_t=1.35,v=.28)
for c in np.arange(.8,2.3,.24): 
    for o in (0,.07): k=int(.03*SR); add(c+o,filt(noise(k),lo=1200,hi=6000)*env(k,d=.006),.35*np.exp(-((c-1.4)/.5)**2),.3)
k=int(.9*SR); add(1.0,filt(noise(k),lo=400,hi=3000)*np.sin(np.pi*ts(k)/.9)**2,.5)
riser(2.1,.9)
# ---- score: D minor, 130 bpm ----
B=60/130; start=3.0
prog=[50,46,41,48]   # D, Bb, F, C roots (midi, bass octave 2-3)
bass=np.zeros(N); pad=np.zeros(N)
bar=0; t0=start
while t0<11.0-1e-6:
    root=prog[bar%4]
    for e in range(16):
        tt=t0+e*B/4
        if tt>=11.0: break
        if e%4 in (0,2,3) or e in (6,14):
            m=root-12+(12 if e in (6,14) else 0); nn=int(B/4*.9*SR); i=int(tt*SR)
            s=osc('saw',mtof(m),nn)*env(nn,r=.02); bass[i:i+nn]+=s[:N-i]*.5
        if e%4==0 and (e//4)%2==0: kick(tt)
        if e%4==0 and (e//4)%2==1: snare(tt)
        hat(tt,.05 if e%2 else .08)
    chord=[root+12,root+15 if root in (50,) else root+16,root+19]; 
    if root==50: chord=[62,65,69]
    elif root==46: chord=[58,62,65]
    elif root==41: chord=[57,60,65]
    else: chord=[55,60,64]
    nn=int(4*B*SR); i=int(t0*SR); s=sum(osc('saw',mtof(m)*(1+d),nn) for m in chord for d in (-.004,.004))*env(nn,a=.2,r=.3)
    pad[i:i+nn]+=s[:N-i]*.05
    t0+=4*B; bar+=1
L+=filt(bass,hi=700)*.55; R+=filt(bass,hi=700)*.55
p=filt(pad,hi=1500); L+=p*.9; R+=p*1.1
# chug texture 3-15
for tt in np.arange(3.0,15.0,B/4):
    k=int(.05*SR); add(tt,filt(noise(k),lo=200,hi=900)*env(k,d=.015),.12*(1 if tt<11 else max(0,(15-tt)/4)))
# ---- events ----
for e in ev:
    if e['type']=='shot': shot(e['t'])
    elif e['type']=='kill': boom(e['t'],.6,.5); n2=int(.3*SR); add(e['t']+.02,osc('sin',1800,n2)*env(n2,d=.07),.08)
    elif e['type']=='boom': boom(e['t'],1.2,.85)
    elif e['type']=='cut': boom(e['t'],.7,.45)
riser(10.2,.8,.3)
# ---- end card ----
boom(11.3,1.6,1.0)
n=int(3.7*SR); s=sum(osc('saw',mtof(m)*(1+d),n) for m in (26,33,38) for d in (-.006,.006)); add(11.3,filt(s,hi=600)*env(n,a=.01,d=1.6,r=.5),.35)
n=int(3.7*SR); s=sum(osc('saw',mtof(m)*(1+d),n) for m in (62,65,69,74) for d in (-.005,.005)); add(11.5,filt(s,hi=1200)*env(n,a=.8,r=1.2),.05)
for tt in (12.8,13.4): kick(tt,.7)
horn(13.6,1.2,v=.12)
# ---- master ----
fade=np.ones(N); fn=int(.5*SR); fade[-fn:]=np.linspace(1,0,fn)
st=np.stack([L,R],1); st=np.tanh(st*1.2); st*=fade[:,None]; st/=np.max(np.abs(st))/.9
with wave.open('traim_audio.wav','wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st*32767).astype(np.int16).tobytes())
print('ok')
