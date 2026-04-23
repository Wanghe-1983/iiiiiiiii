/**
 * 印尼语学习助手 - 全局配置
 * Ver 2.0 - 接入 Cloudflare KV 后端
 */

const CONFIG = {
    // 学习小贴士接口
    studyTipApi: "https://v1.hitokoto.cn/?c=i",

    // 高德天气API（留空则不显示）
    amapKey: "",

    // 词库地址
    dataUrl: "./indonesian_learning_data.json",

    // API 基础地址（Cloudflare Pages Functions 自动路由 /api/*）
    // 本地开发改为 http://localhost:8788
    apiBase: "",

    // 版本
    version: "2.0"
};

/**
 * API 请求封装
 * 自动处理 token、错误提示、踢出下线等
 */
const API = {
    _token: null,

    // 初始化 token
    init() {
        this._token = localStorage.getItem('fmi_token') || null;
    },

    // 保存 token
    setToken(token) {
        this._token = token;
        localStorage.setItem('fmi_token', token);
    },

    // 清除 token
    clearToken() {
        this._token = null;
        localStorage.removeItem('fmi_token');
    },

    // 获取 token
    getToken() {
        return this._token;
    },

    // 判断是否已登录
    isLoggedIn() {
        return !!this._token;
    },

    // 通用请求
    async request(path, options = {}) {
        const url = CONFIG.apiBase + '/api/' + path;
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (this._token) {
            headers['Authorization'] = 'Bearer ' + this._token;
        }
        try {
            const resp = await fetch(url, { ...options, headers });
            const data = await resp.json();
            // 被踢下线
            if (data.error === 'kicked') {
                this.clearToken();
                localStorage.removeItem('fmi_login_status');
                alert('您已被管理员强制下线');
                window.location.href = 'login.html';
                return data;
            }
            // 访客时长到期
            if (data.error === 'visitor_expired') {
                this.clearToken();
                localStorage.removeItem('fmi_login_status');
                localStorage.removeItem('fmi_visitor_login');
                localStorage.removeItem('fmi_visitor_expire');
                alert('访客体验时间已到，感谢使用！如需继续学习，请注册账号。');
                window.location.href = 'login.html';
                return data;
            }
            // token 过期
            if (resp.status === 401 && data.error !== '用户名或密码错误') {
                this.clearToken();
                // 不自动跳转，让各页面自行处理
            }
            return data;
        } catch (err) {
            // 网络错误，可能后端未部署，静默失败
            console.warn('API request failed:', path, err);
            return { error: 'network', message: '网络请求失败，请检查网络连接' };
        }
    },

    // ========== 认证 ==========
    async login(username, password) {
        const data = await this.request('auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    },

    async register(username, password, name, userType, companyCode, empNo) {
        return await this.request('auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, name, userType, companyCode, empNo }),
        });
    },

    // ========== 心跳 ==========
    async heartbeat() {
        return await this.request('user/heartbeat', { method: 'POST' });
    },

    // ========== 用户 ==========
    async getMe() {
        return await this.request('user/me');
    },

    async changePassword(oldPassword, newPassword) {
        return await this.request('user/password', {
            method: 'PUT',
            body: JSON.stringify({ oldPassword, newPassword }),
        });
    },

    // ========== 学习记录 ==========
    async saveStudy(data) {
        return await this.request('study/save', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async getStats() {
        return await this.request('study/stats');
    },

    // ========== 排行榜 ==========
    async getLeaderboard(date) {
        const query = date ? `?date=${date}` : '';
        return await this.request('leaderboard' + query);
    },

    async submitLeaderboard(entry) {
        return await this.request('leaderboard/submit', {
            method: 'POST',
            body: JSON.stringify(entry),
        });
    },

    // ========== 系统信息（公开）==========
    async getSystemInfo() {
        return await this.request('system/info');
    },

    // ========== 管理员接口 ==========
    async adminGetUsers() {
        return await this.request('admin/users');
    },

    async adminCreateUser(userData) {
        return await this.request('admin/users', {
            method: 'POST',
            body: JSON.stringify(userData),
        });
    },

    async adminUpdateUser(username, updates) {
        return await this.request('admin/users', {
            method: 'PUT',
            body: JSON.stringify({ username, ...updates }),
        });
    },

    async adminDeleteUser(username) {
        return await this.request('admin/users', {
            method: 'DELETE',
            body: JSON.stringify({ username }),
        });
    },

    async adminKick(username) {
        return await this.request('admin/kick', {
            method: 'POST',
            body: JSON.stringify({ username }),
        });
    },

    async adminBan(username, ban) {
        return await this.request('admin/ban', {
            method: 'POST',
            body: JSON.stringify({ username, ban }),
        });
    },

    async adminGetOnline() {
        return await this.request('admin/online');
    },

    async adminGetSettings() {
        return await this.request('admin/settings');
    },

    async adminSetSettings(settings) {
        return await this.request('admin/settings', {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
    },

    async adminGetWhitelist() {
        return await this.request('admin/whitelist');
    },

    async adminSetWhitelist(list) {
        return await this.request('admin/whitelist', {
            method: 'PUT',
            body: JSON.stringify(list),
        });
    },

    async adminGetLeaderboardConfig() {
        return await this.request('admin/leaderboard-config');
    },

    async adminSetLeaderboardConfig(config) {
        return await this.request('admin/leaderboard-config', {
            method: 'PUT',
            body: JSON.stringify(config),
        });
    },

    async adminInitUsers(users) {
        return await this.request('admin/init-users', {
            method: 'POST',
            body: JSON.stringify({ users }),
        });
    },
};

// 页面加载时初始化 API
API.init();
