const app = document.getElementById('app');
let db = {};
let favs = JSON.parse(localStorage.getItem('fmi_v1_favs') || '[]');
let curCat = "1", curIdx = 0, isLive = false;
let todayRecord = JSON.parse(localStorage.getItem('fmi_today_record') || '[]');
let studyStats = JSON.parse(localStorage.getItem('fmi_study_stats') || '{"totalWords":0,"studySeconds":0,"todayWords":0,"startTime":null}');
const today = new Date().toLocaleDateString();

app.innerHTML = `
<aside class="sidebar" id="sidebar">
    <div class="toggle-tab" onclick="document.getElementById('sidebar').classList.toggle('collapsed')">
        <i class="fas fa-bars"></i>
    </div>
    <div class="sidebar-inner" id="menu-box"></div>
</aside>

<main class="main-container">
    <header><h1 class="main-title">印尼语学习助手</h1></header>

    <div class="top-info-bar">
        <div class="date-time" id="date-time">加载中...</div>
        <div class="weather-location" id="weather-location">
            <i class="fas fa-cloud"></i>
            <span>加载中...</span>
        </div>
        <div class="user-status" id="user-status">
            未登录
            <button class="logout-btn" id="logout-btn" onclick="logout()" style="display:none;">退出登录</button>
        </div>
    </div>

    <!-- 学习进度统计栏 -->
    <div class="stats-bar" id="stats-bar">
        <div class="stat-item">📚 今日：<span id="stat-today">0</span> 词</div>
        <div class="stat-item">📈 总计：<span id="stat-total">0</span> 词</div>
        <div class="stat-item">⏱ 时长：<span id="stat-time">0</span></div>
        <div class="stat-item">🎯 完成率：<span id="stat-rate">0%</span></div>
    </div>

    <div class="tip-box" id="study-tip">
        <div class="tip-title">学习小贴士</div>
        <div id="tip-content">加载中...</div>
    </div>

    <section class="study-card" id="main-card">
        <div class="top-meta">
            <div class="word-badge" id="word-idx">01</div>
            <div class="star-btn" id="fav-trigger" onclick="handleFav()"><i class="fas fa-star"></i></div>
        </div>
        <div class="indo-box" id="disp-indo">Loading</div>
        <div class="zh-box" id="disp-zh">请稍等</div>
        <div class="nav-row">
            <button class="circle-btn" onclick="navWord(-1)"><i class="fas fa-chevron-left"></i></button>
            <button id="main-play" class="circle-btn play-btn" onclick="toggleSpeech()"><i class="fas fa-play" id="play-ico"></i></button>
            <button class="circle-btn" onclick="navWord(1)"><i class="fas fa-chevron-right"></i></button>
            <button class="circle-btn" onclick="openShareModal()"><i class="fas fa-share-alt"></i></button>
        </div>
    </section>

    <div class="study-record-box">
        <div class="record-title">
            <span>今日学习记录</span>
            <button class="clear-record-btn" onclick="clearTodayRecord()">清空记录</button>
        </div>
        <div class="record-list" id="record-list">
            <div style="grid-column: 1 / 3; text-align: center; color: var(--text-muted);">暂无学习记录</div>
        </div>
    </div>

    <footer class="control-panel">
        <div class="ctrl-row">
            <span class="ctrl-label">语音语速</span>
            <div style="flex:1; display:flex; align-items:center; gap:25px;">
                <input type="range" style="flex:1" id="inp-rate" min="0.1" max="1.5" step="0.1" value="0.8" oninput="updateSetting('rate', this.value)">
                <span class="ctrl-value"><span id="val-rate">0.8</span>X</span>
            </div>
        </div>
        <div class="ctrl-row">
            <span class="ctrl-label">循环播放</span>
            <div style="flex:1; display:flex; align-items:center; gap:25px;">
                <input type="range" style="flex:1" id="inp-loop" min="1" max="10" step="1" value="1" oninput="updateSetting('loop', this.value)">
                <span class="ctrl-value"><span id="val-loop">1</span>次</span>
            </div>
        </div>
        <div class="ctrl-row">
            <span class="ctrl-label">隐藏答案</span>
            <label class="switch">
                <input type="checkbox" id="hide-toggle" onchange="renderCurrent()">
                <span class="slider"></span>
            </label>
        </div>
    </footer>

    <div class="copyright">
        仅供学习・禁止商用 © <span class="clickable" onclick="goAdmin()">2026</span>｜联系：FMI <span class="clickable" onclick="showQR()">王鹤</span> 
        Ver <span class="clickable" onclick="openHotCodeModal()">${CONFIG.version}</span>
    </div>
</main>

<div id="qr-modal" class="modal-overlay" onclick="this.style.display='none'">
    <div class="modal-content" onclick="event.stopPropagation()">
        <img src="Wang_he.jpg" style="width:280px; height:280px; border-radius:20px;">
        <p style="margin-top:20px; font-weight:bold; font-size:1.2rem;">微信扫码联系 王鹤</p>
    </div>
</div>

<div id="admin-modal" class="modal-overlay">
    <div class="modal-content" style="width:600px;">
        <h3 style="margin-bottom:15px;">Hot-Code 管理后台</h3>
        <textarea id="hotcode-input" style="width:100%; height:300px; background:#0f172a; color:#10b981; padding:15px; border-radius:15px; font-family:monospace; border:1px solid #334155;"></textarea>
        <div style="margin-top:20px; display:flex; gap:15px; justify-content:flex-end;">
            <button onclick="document.getElementById('admin-modal').style.display='none'" style="background:#475569; color:white; border:none; padding:10px 25px; border-radius:10px; cursor:pointer;">取消</button>
            <button onclick="applyHotCode()" style="background:var(--accent); color:white; border:none; padding:10px 25px; border-radius:10px; cursor:pointer; font-weight:bold;">应用更新</button>
        </div>
    </div>
</div>

<div id="share-modal" class="modal-overlay" onclick="this.style.display='none'">
    <div class="modal-content share-modal-content" onclick="event.stopPropagation()">
        <h3 style="margin-bottom:20px;">学习打卡分享</h3>
        <div class="share-card" id="share-card">
            <div class="share-header">🇮🇩 印尼语学习打卡</div>
            <div class="share-stats" id="share-stats"></div>
            <div class="share-tip" id="share-tip">💡 学习小贴士：加载中...</div>
            <div id="share-record-list"></div>
        </div>
        <div>
            <button class="share-copy-btn" onclick="copyShareText()">复制文案</button>
            <button class="share-save-btn" onclick="saveShareImage()">保存高清打卡图</button>
        </div>
    </div>
</div>
`;

// 初始化统计
function initStats() {
    if (!studyStats.startTime) studyStats.startTime = Date.now();
    setInterval(() => {
        studyStats.studySeconds += 1;
        localStorage.setItem('fmi_study_stats', JSON.stringify(studyStats));
        refreshStatsUI();
    }, 1000);
    refreshStatsUI();
}

function refreshStatsUI() {
    const total = studyStats.totalWords;
    const today = todayRecord.length;
    studyStats.todayWords = today;
    const sec = studyStats.studySeconds;
    const time = `${Math.floor(sec/60)}分${sec%60}秒`;
    const totalDbWords = 300;
    const rate = Math.min(100, Math.round((today / 50) * 100));

    document.getElementById('stat-today').innerText = today;
    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-time').innerText = time;
    document.getElementById('stat-rate').innerText = rate + '%';
}

async function init() {
    checkLoginStatus();
    try {
        const r = await fetch(CONFIG.dataUrl + '?t=' + Date.now());
        db = await r.json();
        buildMenu();
        showWord("1", 0);
    } catch(e) { console.error("词库加载失败"); }
    
    initDateTime();
    initWeatherAndLocation();
    initStudyTip();
    initStats();
    renderTodayRecord();
}

function buildMenu() {
    const box = document.getElementById('menu-box');
    let favHtml = `<div class="cat-item">
        <div class="cat-head" style="color:#fbbf24" onclick="this.nextElementSibling.classList.toggle('active')">
            <span>⭐ 我的收藏 (${favs.length})</span><i class="fas fa-chevron-down"></i>
        </div>
        <div class="sub-menu">
            ${favs.length ? favs.map((w,i)=>`<div style="display:flex;justify-content:space-between;padding:8px;font-size:13px;color:#94a3b8;cursor:pointer" onclick="showFav(${i})">
                <span>${i+1}. ${w.indonesian}</span>
                <i class="fas fa-trash-alt" style="color:#ef4444" onclick="delFav(event,${i})"></i>
            </div>`).join('') : '<div style="padding:8px;font-size:13px;color:#94a3b8">暂无收藏</div>'}
            ${favs.length ? `<button onclick="clearAllFav(event)" style="width:100%;margin-top:10px;background:none;border:1px solid #ef4444;color:#ef4444;padding:5px;border-radius:8px;font-size:11px;cursor:pointer">清空收藏</button>` : ''}
        </div>
    </div>`;
    
    let dbHtml = '';
    for(let id in db) {
        const words = db[id].lessons["1"].words;
        dbHtml += `<div class="cat-item">
            <div class="cat-head" onclick="this.nextElementSibling.classList.toggle('active')"><span>${db[id].name}</span><i class="fas fa-chevron-down"></i></div>
            <div class="sub-menu ${id==curCat?'active':''}">
                ${words.map((w,i)=>`<div style="padding:8px 10px;font-size:13px;color:#94a3b8;cursor:pointer" onclick="showWord('${id}',${i})">${i+1}. ${w.indonesian}</div>`).join('')}
            </div>
        </div>`;
    }
    box.innerHTML = favHtml + dbHtml;
}

function renderCurrent() {
    const card = document.getElementById('main-card');
    card.classList.add('card-anim');
    setTimeout(()=>{
        const list = curCat === 'fav' ? favs : db[curCat]?.lessons["1"]?.words;
        if(!list?.length) return;
        const w = list[curIdx];
        const hide = document.getElementById('hide-toggle').checked;
        document.getElementById('disp-indo').innerText = w.indonesian;
        document.getElementById('disp-zh').innerText = hide ? '••••••' : w.chinese;
        document.getElementById('word-idx').innerText = (curIdx+1).toString().padStart(2,'0');
        document.getElementById('fav-trigger').className = 'star-btn' + (favs.some(x=>x.indonesian===w.indonesian)?' active':'');
        card.classList.remove('card-anim');
        addToTodayRecord(w);
    },180);
}

function handleFav() {
    const w = (curCat==='fav'?favs:db[curCat].lessons["1"].words)[curIdx];
    const i = favs.findIndex(x=>x.indonesian===w.indonesian);
    i>-1 ? favs.splice(i,1) : favs.push(w);
    localStorage.setItem('fmi_v1_favs',JSON.stringify(favs));
    buildMenu(); renderCurrent();
}

function delFav(e,i){e.stopPropagation();favs.splice(i,1);localStorage.setItem('fmi_v1_favs',JSON.stringify(favs));buildMenu();renderCurrent();}
function clearAllFav(e){e.stopPropagation();if(confirm('确认清空？')){favs=[];localStorage.setItem('fmi_v1_favs','[]');buildMenu();renderCurrent();}}
function showWord(c,i){stopVoice();curCat=c;curIdx=i;renderCurrent();buildMenu();}
function showFav(i){stopVoice();curCat='fav';curIdx=i;renderCurrent();}
function navWord(d){stopVoice();const l=curCat==='fav'?favs:db[curCat].lessons["1"].words;curIdx=(curIdx+d+l.length)%l.length;renderCurrent();}

function toggleSpeech(){isLive?stopVoice():startVoice();}
function startVoice(){
    const w=(curCat==='fav'?favs:db[curCat].lessons["1"].words)[curIdx];
    const rate=+document.getElementById('inp-rate').value;
    const loop=+document.getElementById('inp-loop').value;
    isLive=1;document.getElementById('play-ico').className='fas fa-stop';
    let c=0;const run=()=>{
        if(!isLive||c>=loop){stopVoice();return;}
        const u=new SpeechSynthesisUtterance(w.indonesian);
        u.lang='id-ID';u.rate=rate;u.onend=()=>{c++;isLive&&setTimeout(run,500);}
        speechSynthesis.speak(u);
    };run();
}
function stopVoice(){isLive=0;speechSynthesis.cancel();document.getElementById('play-ico').className='fas fa-play';}
function updateSetting(k,v){document.getElementById('val-'+k).innerText=v;}
function showQR(){document.getElementById('qr-modal').style.display='flex';}
function openHotCodeModal(){prompt('密码：')===CONFIG.adminPass&&(document.getElementById('admin-modal').style.display='flex');}
function applyHotCode(){const c=document.getElementById('hotcode-input').value;c&&(document.write(c),document.close());}

function checkLoginStatus(){
    const s=JSON.parse(localStorage.getItem('fmi_login_status')||'{"isLogin":false}');
    if(!s.isLogin)location.href='login.html';
    document.getElementById('user-status').innerHTML=`欢迎，${s.user.name}<button class="logout-btn" onclick="logout()">退出</button>`;
}
function logout(){localStorage.removeItem('fmi_login_status');location.href='login.html';}
function goAdmin(){
    const s=JSON.parse(localStorage.getItem('fmi_login_status')||'{}');
    s.user?.id==='admin'?location.href='admin.html':alert('仅管理员可进入');
}

function initDateTime(){
    const pad=n=>n.toString().padStart(2,'0');
    const up=()=>{
        const d=new Date();
        document.getElementById('date-time').innerText=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };up();setInterval(up,1000);
}

async function initWeatherAndLocation(){
    if(!CONFIG.amapKey)return document.getElementById('weather-location').innerHTML='<i class="fas fa-map-marker-alt"></i><span>未配置天气</span>';
    const el=document.getElementById('weather-location');
    try{
        const p=await new Promise((r,j)=>navigator.geolocation.getCurrentPosition(r,j));
        const res=await fetch(`https://restapi.amap.com/v3/geocode/regeo?location=${p.coords.longitude},${p.coords.latitude}&key=${CONFIG.amapKey}&extensions=base`);
        const j=await res.json();
        const city=j.regeocode.addressComponent.city||j.regeocode.addressComponent.province;
        const wres=await fetch(`https://restapi.amap.com/v3/weather/weatherInfo?city=${encodeURIComponent(city)}&key=${CONFIG.amapKey}`);
        const wj=await wres.json();
        const w=wj.lives[0];
        el.innerHTML=`<i class="fas ${w.weather.includes('晴')?'fa-sun':w.weather.includes('雨')?'fa-cloud-rain':'fa-cloud'}"></i><span>${city} ${w.weather} ${w.temperature}℃</span>`;
    }catch{e=>el.innerHTML='<i class="fas fa-map-marker-alt"></i><span>获取失败</span>';}
}

async function initStudyTip(){
    const el=document.getElementById('tip-content');
    try{
        const res=await fetch(CONFIG.studyTipApi);
        const d=await res.json();
        el.innerText=d.hitokoto+(d.from?` —— ${d.from}`:'');
    }catch{e=>el.innerText='坚持学习，每天进步一点点！';}
}

function addToTodayRecord(w){
    if(todayRecord.some(x=>x.indonesian===w.indonesian))return;
    if(JSON.parse(localStorage.getItem('fmi_record_date')||JSON.stringify(today))!==today)todayRecord=[];
    todayRecord.push(w);
    studyStats.totalWords++;
    localStorage.setItem('fmi_today_record',JSON.stringify(todayRecord));
    localStorage.setItem('fmi_record_date',JSON.stringify(today));
    localStorage.setItem('fmi_study_stats',JSON.stringify(studyStats));
    renderTodayRecord();
    refreshStatsUI();
}
function renderTodayRecord(){
    const el=document.getElementById('record-list');
    if(!todayRecord.length)return el.innerHTML='<div style="grid-column:1/3;text-align:center;color:var(--text-muted)">暂无学习记录</div>';
    el.innerHTML=todayRecord.map((x,i)=>`
        <div class="record-item">
            <div class="record-indo">${i+1}. ${x.indonesian}</div>
            <div class="record-zh">${x.chinese}</div>
        </div>
    `).join('');
}
function clearTodayRecord(){if(confirm('确认清空今日记录？')){todayRecord=[];localStorage.setItem('fmi_today_record','[]');renderTodayRecord();refreshStatsUI();}}

// 增强版分享
function openShareModal(){
    const m=document.getElementById('share-modal');
    const tip=document.getElementById('tip-content').innerText;
    document.getElementById('share-tip').innerText=`💡 学习小贴士：${tip}`;
    
    const sec=studyStats.studySeconds;
    const studyTime=`${Math.floor(sec/60)}分${sec%60}秒`;
    const d=new Date();
    const dateStr=`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    
    document.getElementById('share-stats').innerHTML=`
        <div style="margin:10px 0;line-height:1.6;font-size:14px;color:#cbd5e1;">
            📅 日期：${dateStr}<br>
            📚 今日学习：${todayRecord.length} 个单词<br>
            ⏱ 学习时长：${studyTime}<br>
            🎯 完成率：${Math.min(100, Math.round((todayRecord.length/50)*100))}%
        </div>
    `;
    
    const l=document.getElementById('share-record-list');
    if(!todayRecord.length)l.innerHTML='<div class="share-record">今日暂无学习</div>';
    else l.innerHTML=todayRecord.slice(0,8).map(x=>`<div class="share-record">✅ ${x.indonesian} - ${x.chinese}</div>`).join('')+(todayRecord.length>8?`<div class="share-record">...共${todayRecord.length}条</div>`:'');
    m.style.display='flex';
}

function copyShareText(){
    const tip=document.getElementById('tip-content').innerText;
    const sec=studyStats.studySeconds;
    const studyTime=`${Math.floor(sec/60)}分${sec%60}秒`;
    const date = new Date().toLocaleDateString();
    const text=`🇮🇩 印尼语学习打卡 ${date}\n\n📚 今日学习：${todayRecord.length} 词\n⏱ 学习时长：${studyTime}\n💡 小贴士：${tip}\n\n${todayRecord.slice(0,8).map(x=>`✅ ${x.indonesian} - ${x.chinese}`).join('\n')}${todayRecord.length>8?`\n...共${todayRecord.length}条`:''}\n\n坚持学习，未来可期！`;
    navigator.clipboard.writeText(text).then(()=>alert('复制成功')).catch(()=>alert('复制失败'));
}

// 增强导出图片
function saveShareImage(){
    const shareCard = document.getElementById('share-card');
    shareCard.style.background = 'linear-gradient(135deg, #1e293b, #0f172a)';
    shareCard.style.padding = '40px';
    shareCard.style.borderRadius = '24px';
    
    html2canvas(shareCard, {
        scale: 2,
        useCORS: true,
        logging: false
    }).then(canvas=>{
        const a=document.createElement('a');
        a.download='印尼语学习打卡_增强版.png';
        a.href=canvas.toDataURL('image/png');
        a.click();
    });
}

window.onload=init;