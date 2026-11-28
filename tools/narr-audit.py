# -*- coding: utf-8 -*-
"""narr-audit.py — 學測題解旁白（113、114、115）收稿小程式（11/27 學習串）

取代 規劃/學習-學測113/narr_audit.py、學習-學測115/audit115.py、gate115.py、alt115.py 和各年的 build_tracks 重念段。
收稿判則照「倪的龍騰聲音」，學習分支同一做法，只擋三種：
  1. Whisper 一致度 < 0.7（稿子有阿拉伯數字、或 Whisper 把念的數字寫成阿拉伯數字或 % 時，放寬到 0.5）
  2. 爆音（noise_check --raw 的「爆音」）
  3. 語速離譜（每秒 < 2 或 > 6.5 個音，照錄音長度算）
錄音來源（八卦社正卦聲線 ni-bv-v5-mix＋lively_wow，tone/runs 底下）：
  113：examweb_lively_1127（句號前加 y113_）
  114：examweb_lively_1127（y114_）；影片已念過的句子沿用 xc114/b0*（reuse114.tsv，句號前加 L）
  115：exam115_lively_1127

用法（都用 python -I）：
  build <年> <工作區> <m4a 輸出資料夾>   每句挑好的錄音剪頭尾（加淡入淡出防切口爆音）轉 m4a，
                                          只改工作區 js/exam 裡該句的 "duration"（字幕文字不動）
  check <年> <m4a 資料夾> <檢查資料夾>    m4a→wav、跑 noise_check --raw、照上面三條擋，印出擋下的句子（結束碼＝擋下句數，上限 100）
  alt <年> <檢查資料夾> <句號…>          擋下的句子：把同句其他錄音段列成清單、跑 noise_check，印出每段的 Whisper／爆音
  swap <年> <句號> <錄音檔>               用同句另一段錄音取代挑選結果（原檔備份成 .orig.wav），之後重跑 build、check
  tally <檢查資料夾>                      依問題種類統計（不含「整句太快」：那是悟理行者的語速標準）
m4a 放 R2（audio/study/exam-<年>/），不進 git；上傳用 G:\\Claude\\tools\\r2\\r2.py put。
"""
import glob, io, os, re, subprocess, sys, wave
sys.stdout.reconfigure(encoding='utf-8')
RUNS = r'G:\Claude\tools\voice-clone\tone\runs'
VC = r'G:\Claude\tools\voice-clone'
FF = r'C:\Program Files (x86)\Digiarty\VideoProc Converter'
WEB = os.path.join(RUNS, 'examweb_lively_1127')
TRIM = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,afade=t=in:d=0.01,areverse,'
        'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,afade=t=in:d=0.02,areverse')


def rows(p):
    if not os.path.exists(p): return []
    return [l.rstrip('\n').split('\t') for l in io.open(p, encoding='utf-8') if '\t' in l and not l.startswith('#')]


def run_table(run):
    """一個念稿資料夾：句號 → (念的稿, pick_report 那一列)"""
    tts = {}
    for p in rows(os.path.join(run, 'lines.tsv')):
        if len(p) >= 2: tts[p[0]] = (p[2] if len(p) > 2 and p[2] else p[1])
    if True:  # xc114 的 lines.tsv 句號沒有 L，map.tsv 才有；兩個都讀，lines.tsv 優先
        for p in rows(os.path.join(run, 'map.tsv')):
            if len(p) >= 3 and p[1] not in tts: tts[p[1]] = p[3] if len(p) > 3 and p[3] else p[2]
    rep = {p[0]: p for p in rows(os.path.join(run, 'pick', 'pick_report.tsv')) if len(p) >= 5}
    return tts, rep


_cache = {}


def source(year, sid):
    """回傳 dict(run, key, wav, tts, whisper, alts)；找不到挑好的錄音時 wav 為 None。"""
    year = str(year)
    if year == '115': cands = [(os.path.join(RUNS, 'exam115_lively_1127'), sid)]
    elif year == '113': cands = [(WEB, 'y113_' + sid)]
    elif year == '114':
        reuse = _cache.setdefault('reuse', {p[0]: p[1] for p in rows(os.path.join(WEB, 'reuse114.tsv'))})
        cands = [(r, reuse[sid]) for r in sorted(glob.glob(os.path.join(RUNS, 'xc114', 'b0*')))] if sid in reuse else [(WEB, 'y114_' + sid)]
    else: sys.exit('沒有這個年度：' + year)
    for run, key in cands:
        tts, rep = _cache.setdefault(run, run_table(run))
        if key not in tts: continue
        r = rep.get(key); wav = os.path.join(run, 'pick', key + '.wav')
        w = None; heard = r[8] if r and len(r) > 8 else ''
        if r:
            try: w = float(r[4].split()[0])
            except (ValueError, IndexError): pass
        sw = {q[0]: q for q in rows(os.path.join(run, 'pick', 'swaps.tsv'))}.get(key)
        if sw:  # 換過段：用換上那段的 Whisper 分數與聽到的字
            try: w = float(sw[2])
            except (ValueError, IndexError): w = None
            heard = sw[3] if len(sw) > 3 else ''
        alts = []
        if r:
            for x in [r[1]] + (r[9].split() if len(r) > 9 else []):
                f = x.split(':')[0]
                for base in (run, os.path.join(run, 'pick')):
                    if os.path.exists(os.path.join(base, f)): alts.append(os.path.join(base, f)); break
        return dict(run=run, key=key, wav=wav if os.path.exists(wav) else None, tts=tts[key], whisper=w, heard=heard, alts=alts)
    return dict(run=None, key=None, wav=None, tts=None, whisper=None, heard='', alts=[])


def ff(*a): subprocess.run([os.path.join(FF, 'ffmpeg.exe'), '-y', '-loglevel', 'error'] + list(a), check=True)


def dur(p):
    return float(subprocess.run([os.path.join(FF, 'ffprobe.exe'), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
                                capture_output=True, text=True).stdout.strip())


def ids_in_js(W, year):
    """工作區 js/exam 裡這一年的句號（依檔案順序）與所在檔。"""
    out = {}
    files = sorted(glob.glob(os.path.join(W, 'js', 'exam', year, 'q*.js'))) + ([os.path.join(W, 'js', 'exam', year + '-timings.js')] if os.path.exists(os.path.join(W, 'js', 'exam', year + '-timings.js')) else [])
    for f in files:
        for m in re.finditer(r'"id":\s*"(Q\d+_\d+)"', io.open(f, encoding='utf-8').read()): out.setdefault(m.group(1), f)
    return out


def build(year, W, OUT):
    ids = ids_in_js(W, year); miss = []; per = {}
    os.makedirs(OUT, exist_ok=True)
    for sid, f in ids.items():
        s = source(year, sid)
        if not s['wav']: miss.append(sid); continue
        o = os.path.join(OUT, sid + '.m4a')
        if not os.path.exists(o) or os.path.getmtime(o) < os.path.getmtime(s['wav']):
            ff('-i', s['wav'], '-af', TRIM, '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', o)
        per.setdefault(f, {})[sid] = round(dur(o), 2)
    if miss: sys.exit(f'{len(miss)} 句還沒有挑好的錄音，先不改秒數：' + ' '.join(miss[:20]))
    for f, d in per.items():
        s = io.open(f, encoding='utf-8', newline='').read(); n = 0
        for sid, v in d.items():
            s, k = re.subn(r'("id":\s*"%s"[^{}]*?"duration":\s*)[\d.]+' % sid, lambda m: m.group(1) + ('%g' % v), s, count=1); n += k
        io.open(f, 'w', encoding='utf-8', newline='').write(s)
        print(os.path.relpath(f, W), n, '句秒數已更新', round(sum(d.values()), 1), '秒')
    print(year, '共', sum(len(d) for d in per.values()), '句 m4a 在', OUT)


def noise(lst, out):
    py = os.path.join(VC, 'gsv-venv', 'Scripts', 'python.exe')
    env = dict(os.environ, MODELSCOPE_OFFLINE='1', HF_HUB_OFFLINE='1')
    subprocess.run([py, '-X', 'utf8', os.path.join(VC, 'tone', 'noise_check.py'), lst, out, '--raw'], cwd=VC, env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res = {}
    for p in rows(out):
        if len(p) > 2 and p[1] in ('OK', 'NG'): res[p[0].replace('\\', '/')] = p[3].split('; ') if len(p) > 3 and p[3] else []
    return res


def wav_len(p):
    with wave.open(p) as wf: return wf.getnframes() / wf.getframerate()


def judge(text, w, issues, seconds, heard=''):
    why = []
    # 倪的龍騰聲音：Whisper 把念的數字寫成阿拉伯數字或 %（「百分之七」→「7%」）只是字數對不上，門檻放到 0.5
    lim = 0.5 if re.search(r'\d', text) or re.search(r'[\d%％]', heard or '') else 0.7
    if w is None: why.append('沒有 Whisper 分數')
    elif w < lim: why.append(f'Whisper {w:.2f} < {lim}')
    why += [i for i in issues if i.startswith('爆音')]
    n = len(re.findall(r'[\u4e00-\u9fff]|[A-Za-z]', text)) + len(re.findall(r'\d', text))
    rate = n / seconds if seconds else 0
    if rate < 2 or rate > 6.5: why.append(f'語速 {rate:.2f} 音／秒')
    return why


def check(year, SRCDIR, A):
    dst = os.path.join(A, 'wav', year); os.makedirs(dst, exist_ok=True)
    lst, meta = [], {}
    for f in sorted(os.listdir(SRCDIR)):
        if not f.endswith('.m4a'): continue
        sid = f[:-4]; s = source(year, sid)
        if not s['tts']: print('找不到稿子', sid); continue
        w = os.path.join(dst, sid + '.wav')
        if not os.path.exists(w) or os.path.getmtime(w) < os.path.getmtime(os.path.join(SRCDIR, f)):
            ff('-i', os.path.join(SRCDIR, f), '-ac', '1', '-ar', '44100', w)
        lst.append(w + '\t' + s['tts']); meta[w.replace('\\', '/')] = (sid, s)
    lp = os.path.join(A, 'list.tsv')
    io.open(lp, 'w', encoding='utf-8', newline='\n').write('\n'.join(lst) + '\n')
    res = noise(lp, os.path.join(A, 'out.tsv'))
    bad = []
    for w, (sid, s) in meta.items():
        why = judge(s['tts'], s['whisper'], res.get(w, []), wav_len(w), s['heard'])
        if why: bad.append(sid); print(sid, '；'.join(why), '｜', s['tts'])
    io.open(os.path.join(A, 'blocked.txt'), 'w', encoding='utf-8', newline='\n').write('\n'.join(bad) + '\n')
    print(year, '共', len(meta), '句；擋下', len(bad), '句：', ' '.join(bad))
    sys.exit(min(len(bad), 100))


def alt(year, A, ids):
    # 候選段是念稿原檔（浮點 wav、沒剪頭尾）：照 build 的剪法剪好、壓成同樣的 AAC 48k m4a，再轉回 16 位元 wav，
    # 檢查的就是會上線的樣子（11/28：只剪不壓 AAC 時，起音處 AAC 產生的爆音測不到，alt 說 OK、check 卻擋）
    lst, who, orig = [], {}, {}
    d = os.path.join(A, 'alt', year); os.makedirs(d, exist_ok=True)
    for sid in ids:
        s = source(year, sid)
        if not s['alts']: print(sid, '沒有其他錄音段'); continue
        for f in s['alts']:
            o = os.path.join(d, sid + '__' + os.path.basename(f)); m = o[:-4] + '.m4a'
            try:
                ff('-i', f, '-af', TRIM, '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '48k', m)
                ff('-i', m, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', o)
            except subprocess.CalledProcessError:
                print(sid, os.path.basename(f), '剪完是空的，跳過'); continue
            lst.append(o + '\t' + s['tts']); who[o.replace('\\', '/')] = sid; orig[o.replace('\\', '/')] = f
    lp = os.path.join(A, 'alt_list.tsv')
    io.open(lp, 'w', encoding='utf-8', newline='\n').write('\n'.join(lst) + '\n')
    res = noise(lp, os.path.join(A, 'alt_out.tsv'))
    for f, sid in who.items():
        s = source(year, sid); rep = rows(os.path.join(s['run'], 'pick', 'pick_report.tsv'))
        w = None
        for r in rep:
            if r[0] == s['key']:
                for x in [r[1] + ':' + r[3] + '/' + r[4].split()[0]] + (r[9].split() if len(r) > 9 else []):
                    if x.split(':')[0] == os.path.basename(orig[f]):
                        try: w = float(x.split('/')[-1])
                        except ValueError: pass
        why = judge(s['tts'], w, res.get(f, []), wav_len(f))
        print(sid, os.path.basename(orig[f]), 'OK' if not why else '；'.join(why), '｜', orig[f])


def swap(year, sid, f):
    s = source(year, sid)
    if not s['wav']: sys.exit('找不到挑好的錄音：' + sid)
    w, heard = None, ''  # 找換上這段在挑稿報告裡的分數（選用欄 → 第 5、9 欄；其他欄 → 檔名:聲調/Whisper）
    for r in rows(os.path.join(s['run'], 'pick', 'pick_report.tsv')):
        if len(r) > 4 and r[1] == os.path.basename(f):
            w = r[4].split()[0]; heard = r[8] if len(r) > 8 else ''; break
        for x in (r[9].split() if len(r) > 9 else []):
            if x.split(':')[0] == os.path.basename(f): w = x.split('/')[-1]
    with io.open(os.path.join(s['run'], 'pick', 'swaps.tsv'), 'a', encoding='utf-8', newline='\n') as fp:
        fp.write('\t'.join([s['key'], os.path.basename(f), str(w or ''), heard]) + '\n')
    bak = s['wav'][:-4] + '.orig.wav'
    if not os.path.exists(bak): os.replace(s['wav'], bak)
    import shutil; shutil.copyfile(f, s['wav'])
    print(sid, '改用', f, '（原檔', bak, '）')


def tally(A):
    import collections
    c = collections.Counter(); ex = {}; bad = 0
    for p in rows(os.path.join(A, 'out.tsv')):
        if len(p) < 3 or p[1] not in ('OK', 'NG'): continue
        its = [i for i in (p[3].split('; ') if len(p) > 3 else []) if i and not i.startswith('整句太快')]
        bad += bool(its)
        for i in its:
            k = re.sub(r'[\d.]+', '#', re.sub(r'「[^」]*」', '「X」', i)); c[k] += 1; ex.setdefault(k, os.path.basename(p[0]) + '：' + i)
    print('有問題（不含語速）', bad, '句')
    for k, n in c.most_common(40): print(n, k, '｜例', ex[k][:100])


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(2)
    if a[0] == 'build': build(a[1], a[2], a[3])
    elif a[0] == 'check': check(a[1], a[2], a[3])
    elif a[0] == 'alt': alt(a[1], a[2], a[3:])
    elif a[0] == 'swap': swap(a[1], a[2], a[3])
    elif a[0] == 'tally': tally(a[1])
    else: print(__doc__); sys.exit(2)
