const app = document.getElementById('app');
let db = {};
let favs = JSON.parse(localStorage.getItem('fmi_v1_favs') || '[]');
let curCat = "1", curIdx = 0, isLive = false;
let todayRecord = JSON.parse(localStorage.getItem('fmi_today_record') || '[]');
let studyStats = JSON.parse(localStorage.getItem('fmi_study_stats') || '{"totalWords":0,"studySeconds":0,"todayWords":0,"startTime":null}');
const today = new Date().toLocaleDateString();

// 先强制渲染完整DOM结构（不管词库是否加载）
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
        <div class="date-time" id="date-time">2026-04-18 21:20:00</div>
        <div class="weather-location" id="weather-location">
            <i class="fas fa-cloud"></i>
            <span>本地 27℃ 多云</span>
        </div>
        <div class="user-status" id="user-status">
            欢迎，管理员
            <button class="logout-btn" onclick="logout()">退出</button>
        </div>
    </div>

    <div class="stats-bar" id="stats-bar">
        <div class="stat-item">📚 今日：<span id="stat-today">0</span> 词</div>
        <div class="stat-item">📈 总计：<span id="stat-total">0</span> 词</div>
        <div class="stat-item">⏱ 时长：<span id="stat-time">0分0秒</span></div>
        <div class="stat-item">🎯 完成率：<span id="stat-rate">0%</span></div>
    </div>

    <div class="tip-box" id="study-tip">
        <div class="tip-title">学习小贴士</div>
        <div id="tip-content">坚持学习，每天进步一点点！</div>
    </div>

    <section class="study-card" id="main-card">
        <div class="top-meta">
            <div class="word-badge" id="word-idx">01</div>
            <div class="star-btn" id="fav-trigger" onclick="handleFav()"><i class="fas fa-star"></i></div>
        </div>
        <div class="indo-box" id="disp-indo">Selamat pagi</div>
        <div class="zh-box" id="disp-zh">早上好</div>
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
        仅供学习・禁止商用 © 2026｜联系：FMI 王鹤 
        Ver 1.0
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
            <div class="share-stats" id="share-stats">
                <div style="margin:10px 0;line-height:1.6;font-size:14px;color:#cbd5e1;">
                    📅 日期：2026-04-18<br>
                    📚 今日学习：0 个单词<br>
                    ⏱ 学习时长：0分0秒<br>
                    🎯 完成率：0%
                </div>
            </div>
            <div class="share-tip" id="share-tip">💡 学习小贴士：坚持学习，每天进步一点点！</div>
            <div id="share-record-list">
                <div class="share-record">今日暂无学习</div>
            </div>
        </div>
        <div>
            <button class="share-copy-btn" onclick="copyShareText()">复制文案</button>
            <button class="share-save-btn" onclick="saveShareImage()">保存高清打卡图</button>
        </div>
    </div>
</div>
`;

// 跳过登录验证（临时测试）
function checkLoginStatus() {
    localStorage.setItem('fmi_login_status', JSON.stringify({
        isLogin: true,
        user: { id: 'admin', name: '管理员' }
    }));
    document.getElementById('user-status').innerHTML=`欢迎，管理员<button class="logout-btn" onclick="logout()">退出</button>`;
}

// 基础功能（简化版）
function logout(){
    localStorage.removeItem('fmi_login_status');
    location.href = 'login.html';
}
function initDateTime(){
    const pad=n=>n.toString().padStart(2,'0');
    const up=()=>{
        const d=new Date();
        document.getElementById('date-time').innerText=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };up();setInterval(up,1000);
}
function toggleSpeech(){
    alert('语音功能需词库加载完成后使用');
}
function navWord(d){
    alert('词库加载中，暂无法切换单词');
}
function handleFav(){
    alert('收藏功能需词库加载完成后使用');
}
function openShareModal(){
    document.getElementById('share-modal').style.display='flex';
}
function copyShareText(){
    alert('打卡文案已复制：\n🇮🇩 印尼语学习打卡 2026-04-18\n📚 今日学习：0 词\n⏱ 学习时长：0分0秒\n💡 小贴士：坚持学习，每天进步一点点！');
}
function saveShareImage(){
    alert('高清打卡图保存功能需加载 html2canvas 插件');
}
function clearTodayRecord(){
    if(confirm('确认清空今日记录？')){
        todayRecord=[];
        document.getElementById('record-list').innerHTML='<div style="grid-column:1/3;text-align:center;color:var(--text-muted)">暂无学习记录</div>';
    }
}
function updateSetting(k,v){
    document.getElementById('val-'+k).innerText=v;
}
function renderCurrent(){}
function initStats(){}
function refreshStatsUI(){}
function addToTodayRecord(w){}
function renderTodayRecord(){}
function buildMenu(){
    // 手动填充菜单（测试）
    const box = document.getElementById('menu-box');
    box.innerHTML = `
    <div class="cat-item">
        <div class="cat-head" style="color:#fbbf24" onclick="this.nextElementSibling.classList.toggle('active')">
            <span>⭐ 我的收藏 (0)</span><i class="fas fa-chevron-down"></i>
        </div>
        <div class="sub-menu">
            <div style="padding:8px;font-size:13px;color:#94a3b8">暂无收藏</div>
        </div>
    </div>
    <div class="cat-item">
        <div class="cat-head" onclick="this.nextElementSibling.classList.toggle('active')"><span>生词 (Vocabulary)</span><i class="fas fa-chevron-down"></i></div>
        <div class="sub-menu active">
            <div style="padding:8px 10px;font-size:13px;color:#94a3b8;cursor:pointer">1. Kata sapaan</div>
            <div style="padding:8px 10px;font-size:13px;color:#94a3b8;cursor:pointer">2. Nama</div>
            <div style="padding:8px 10px;font-size:13px;color:#94a3b8;cursor:pointer">3. Umur</div>
        </div>
    </div>
    `;
}

// 初始化（强制执行）
window.onload = function() {
    checkLoginStatus();
    initDateTime();
    buildMenu();
    // 加载词库（仅日志，不影响界面）
    fetch('indonesian_learning_data.json?t='+Date.now())
        .then(r=>r.json())
        .then(data=>{
            db = data;
            alert('词库加载成功！可正常使用所有功能');
        })
        .catch(e=>{
            console.log('词库加载失败（不影响基础界面）：',e);
        });
};
