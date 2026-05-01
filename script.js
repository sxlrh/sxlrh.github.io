// 心灵树洞 - Supabase 版本
// 使用 Supabase 作为后端数据库和存储

// ==================== Supabase 配置 ====================
const SUPABASE_URL = 'https://tgadmkpyufqnnciowydo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnYWRta3B5dWZxbm5jaW93eWRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTc3NDUsImV4cCI6MjA5MDc5Mzc0NX0.Vj7cyl0Yqj55ZM4-S66vZ3-uWh6MOfGeKBus706eJow';

// ==================== Supabase 初始化 ====================
// 使用本地 UMD 版本（lib/supabase.min.js），不依赖 CDN import
// 微信内置浏览器无法加载 CDN ES Module，本地文件最可靠
// 注意：supabase变量由lib/supabase.min.js(UMD)声明，这里不再重复声明
var supabaseLoadFailed = false;

function initSupabase() {
    console.log('[琳琳调试] initSupabase() 被调用, typeof window.supabase =', typeof window.supabase, ', createClient exists?', !!(window.supabase && window.supabase.createClient));
    try {
        // window.supabase 是 UMD 包暴露的全局对象
        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('Supabase SDK 加载成功（本地 UMD）');
        } else {
            console.error('Supabase SDK 未找到：window.supabase 不存在或缺少 createClient');
            supabaseLoadFailed = true;
        }
    } catch (e) {
        console.error('Supabase 初始化失败:', e);
        supabaseLoadFailed = true;
    }
}

// 不再需要 async loadSupabase，直接同步初始化
async function loadSupabase() {
    if (supabase) return supabase;
    initSupabase();
    return supabase;
}

// ==================== 全局状态 ====================
let posts = [];
let currentUser = null;
let currentImage = null;
let currentVideo = null;
let currentVoice = null;
let mediaRecorder = null;
let audioChunks = [];
let viewedPosts = new Set();
let subscriptions = [];

// 加载浏览记录
function loadViewedPosts() {
    if (!currentUser) return;
    try {
        const stored = localStorage.getItem(`viewed_${currentUser.id}`);
        if (stored) {
            viewedPosts = new Set(JSON.parse(stored));
        }
    } catch (e) {
        console.error('加载浏览记录失败:', e);
    }
}

// 保存浏览记录
function saveViewedPosts() {
    if (!currentUser) return;
    try {
        localStorage.setItem(`viewed_${currentUser.id}`, JSON.stringify([...viewedPosts]));
    } catch (e) {
        console.error('保存浏览记录失败:', e);
    }
}

// ==================== 初始化 ====================
async function init() {
    console.log('[琳琳调试] init() 开始执行');
    // 首先显示骨架屏（确保等待 Supabase 时用户看到加载状态）
    showSkeleton();
    try {
        // 初始化 Supabase（本地 UMD，同步即可）
        initSupabase();
        if (!supabase) {
            // Supabase 初始化失败，显示错误但允许显示空内容
            console.error('Supabase 无法初始化，页面将显示空内容');
            posts = [];
            renderPosts();  // 显示空状态
            showToast('数据加载失败，请刷新重试', 'error');
            return;
        }
        
        // 并行执行所有初始化操作（不阻塞）
        const savedUser = localStorage.getItem('treeholeUser');
        if (savedUser) {
            try {
                currentUser = JSON.parse(savedUser);
                // 验证用户（带超时，失败不影响页面加载）
                const userPromise = supabase.from('users').select('*').eq('id', currentUser.id).single();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 5000));
                
                const { data, error } = await Promise.race([userPromise, timeoutPromise]).catch(() => ({ data: null, error: null }));
                if (!data && !error) {
                    // 超时或查询失败，保留本地存储的登录状态，不清除
                    console.log('用户验证超时，但保留本地登录状态');
                } else if (data) {
                    currentUser = data;
                }
                // 验证失败时保留 currentUser（已从 localStorage 恢复），不清除
            } catch (e) {
                console.error('用户验证失败:', e);
                // 验证失败时保留本地登录状态，不清除
            }
        }
        
        // 立即更新 UI（不等待）
        updateUserInfo();
        
        // 后台执行的操作（不阻塞页面渲染）
        setTimeout(() => {
            loadViewedPosts();
            checkNotificationCount();
            subscribeToNotifications();
        }, 100);
        
        // 绑定事件
        bindEvents();
        bindAuthEvents();
        
        // 加载帖子（主要操作）
        await loadPosts();
        
        // 启动实时订阅
        setupRealtimeSubscription();
        
    } catch (error) {
        console.error('初始化失败:', error);
        showToast('加载失败，请重试', 'error');
        // 确保页面能正常显示
        posts = [];
        renderPosts();
    }
}

// ==================== 实时订阅（防抖） ====================
let realtimeDebounce = null;
let _lastRefreshTime = 0;
function setupRealtimeSubscription() {
    try {
        const postsChannel = supabase
            .channel('posts-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
                // 忽略浏览量更新（views字段变更）触发的刷新
                if (payload.eventType === 'UPDATE' && payload.old && payload.new) {
                    const oldViews = payload.old.views;
                    const newViews = payload.new.views;
                    // 如果只有views变化，其他字段没变，则忽略
                    const onlyViewsChanged = Object.keys(payload.new).every(key => {
                        if (key === 'views') return true;
                        return payload.old[key] === payload.new[key];
                    });
                    if (onlyViewsChanged) {
                        console.log('忽略浏览量更新触发的刷新');
                        return;
                    }
                }
                
                // 防抖：3秒内多次变更只刷新一次
                if (realtimeDebounce) clearTimeout(realtimeDebounce);
                realtimeDebounce = setTimeout(() => {
                    // 额外防护：如果5秒内刚刷新过，跳过
                    const now = Date.now();
                    if (now - _lastRefreshTime < 5000) {
                        console.log('刷新太频繁，跳过');
                        return;
                    }
                    _lastRefreshTime = now;
                    loadPosts();
                }, 3000);
            })
            .subscribe();
        
        subscriptions.push(postsChannel);
    } catch (e) {
        console.error('实时订阅失败:', e);
    }
}

// ==================== 工具函数 ====================
function showLoading(show) {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 安全地拼接 onclick 字符串中的 ID/用户名（防止 XSS 注入）
function safeAttr(str) {
    return String(str || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 简单哈希函数（用于密码）
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

// ==================== 事件绑定 ====================
function bindEvents() {
    document.getElementById('post-button').addEventListener('click', handlePost);
    document.getElementById('image-upload').addEventListener('change', handleImageUpload);
    document.getElementById('video-upload').addEventListener('change', handleVideoUpload);
    document.getElementById('voice-record').addEventListener('click', toggleVoiceRecord);
}

function bindAuthEvents() {
    console.log('[琳琳调试] bindAuthEvents() 被调用');
    document.getElementById('login-btn')?.addEventListener('click', showAuthModal);
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', function() { this.closest('.modal').style.display = 'none'; });
    });
    window.addEventListener('click', e => {
        document.querySelectorAll('.modal').forEach(m => { if (e.target === m) m.style.display = 'none'; });
    });
    document.getElementById('submit-login')?.addEventListener('click', login);
    document.getElementById('submit-register')?.addEventListener('click', register);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('settings-btn')?.addEventListener('click', showSettingsModal);
    document.getElementById('friends-btn')?.addEventListener('click', showFriendsModal);
    document.getElementById('notification-btn')?.addEventListener('click', showNotificationModal);
    document.getElementById('save-settings')?.addEventListener('click', saveSettings);
    document.getElementById('avatar-upload')?.addEventListener('change', handleAvatarUpload);
    document.getElementById('add-friend-btn')?.addEventListener('click', addFriend);
    document.getElementById('send-message-btn')?.addEventListener('click', sendMessage);
    document.getElementById('chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('friend-search')?.addEventListener('input', function() { searchFriends(this.value); });
}

// ==================== 用户认证 ====================
function showAuthModal() { document.getElementById('auth-modal').style.display = 'block'; }
function hideAuthModal() { document.getElementById('auth-modal').style.display = 'none'; }

window.switchAuthTab = function(tab, el) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    const activeTab = el || document.querySelector(`.auth-tab[onclick*="${tab}"]`);
    if (activeTab) activeTab.classList.add('active');
    document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('modal-title').textContent = tab === 'login' ? '登录' : '注册';
};

async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    
    if (!username || !password) {
        showToast('请输入用户名和密码', 'error');
        return;
    }
    
    // 检查 Supabase 是否可用
    if (!supabase || supabaseLoadFailed) {
        showToast('网络连接失败，请稍后重试或刷新页面', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // 设置超时
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('登录超时')), 8000)
        );
        
        const loginPromise = supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        const { data, error } = await Promise.race([loginPromise, timeoutPromise]);
        
        if (error || !data) {
            showToast('用户名不存在', 'error');
            return;
        }
        
        // 验证密码（存在数据库）
        if (data.password && data.password !== simpleHash(password)) {
            showToast('密码错误', 'error');
            return;
        }
        
        currentUser = data;
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        updateUserInfo();
        loadViewedPosts();
        checkNotificationCount();
        subscribeToNotifications(); // 启动实时通知
        hideAuthModal();
        showToast('登录成功', 'success');
        
    } catch (error) {
        console.error('登录失败:', error);
        showToast('登录失败，请重试', 'error');
    } finally {
        showLoading(false);
    }
}

async function register() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirmPassword = document.getElementById('register-confirm-password').value.trim();
    
    if (!username || !password || !confirmPassword) {
        showToast('请填写所有字段', 'error');
        return;
    }
    
    // 检查 Supabase 是否可用
    if (!supabase || supabaseLoadFailed) {
        showToast('网络连接失败，请稍后重试或刷新页面', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showToast('两次密码不一致', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('密码至少6位', 'error');
        return;
    }
    
    if (username.length < 2 || username.length > 20) {
        showToast('用户名2-20个字符', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const userId = generateId();
        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff&size=128`;
        
        // 设置超时
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('注册超时')), 8000)
        );
        
        const insertPromise = supabase
            .from('users')
            .insert({
                id: userId,
                username: username,
                avatar: avatar,
                password: simpleHash(password)
            });
        
        const { error } = await Promise.race([insertPromise, timeoutPromise]);
        
        if (error) {
            if (error.code === '23505') {
                showToast('用户名已存在', 'error');
            } else {
                showToast('注册失败: ' + error.message, 'error');
            }
            return;
        }
        
        currentUser = { id: userId, username, avatar };
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        
        updateUserInfo();
        loadViewedPosts();
        checkNotificationCount();
        subscribeToNotifications(); // 启动实时通知
        hideAuthModal();
        showToast('注册成功！', 'success');
        
    } catch (error) {
        console.error('注册失败:', error);
        showToast('注册失败，请重试', 'error');
    } finally {
        showLoading(false);
    }
}

function logout() {
    if (!confirm('确定要退出登录吗？')) return;
    currentUser = null;
    localStorage.removeItem('treeholeUser');
    unsubscribeFromNotifications(); // 取消实时通知订阅
    updateUserInfo();
    showToast('已退出登录', 'success');
}

function updateUserInfo() {
    if (currentUser) {
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('user-avatar').src = currentUser.avatar;
        document.getElementById('user-name').textContent = currentUser.username;
    } else {
        document.getElementById('user-info').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
    }
}

// 第三方登录（模拟）
window.loginWithWechat = async function() {
    const username = '微信用户' + Math.floor(Math.random() * 100000);
    await quickRegister(username, '07C160');
};

window.loginWithQQ = async function() {
    const username = 'QQ用户' + Math.floor(Math.random() * 100000);
    await quickRegister(username, '12B7F5');
};

async function quickRegister(username, color) {
    showLoading(true);
    try {
        const userId = generateId();
        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${color}&color=fff&size=128`;
        
        const { error } = await supabase
            .from('users')
            .insert({ id: userId, username, avatar });
        
        if (error) {
            showToast('登录失败，请重试', 'error');
            return;
        }
        
        currentUser = { id: userId, username, avatar };
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        
        updateUserInfo();
        hideAuthModal();
        showToast('登录成功', 'success');
        
    } catch (error) {
        console.error(error);
        showToast('登录失败', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 设置 ====================
function showSettingsModal() {
    if (currentUser) {
        document.getElementById('settings-avatar').src = currentUser.avatar;
        document.getElementById('settings-username').value = currentUser.username;
        document.getElementById('settings-user-id').value = currentUser.id;
        document.getElementById('settings-modal').style.display = 'block';
    }
}

function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 50 * 1024 * 1024) {
            showToast('图片不能超过50MB', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('settings-avatar').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function saveSettings() {
    const username = document.getElementById('settings-username').value.trim();
    const avatar = document.getElementById('settings-avatar').src;
    
    if (!username) {
        showToast('请输入用户名', 'error');
        return;
    }
    
    // 安全校验：头像 URL 必须为本地文件或受信任来源
    const allowedAvatar = avatar.startsWith('data:') ||
                          avatar.startsWith('https://ui-avatars.com/') ||
                          avatar.startsWith('https://tgadmkpyufqnnciowydo.supabase.co/storage/');
    if (!allowedAvatar) {
        showToast('头像来源不受信任，请上传本地图片', 'error');
        return;
    }
    
    showLoading(true);
    
    showLoading(true);
    
    try {
        // 更新用户表
        const { error } = await supabase
            .from('users')
            .update({ username, avatar })
            .eq('id', currentUser.id);
        
        if (error) {
            if (error.code === '23505') {
                showToast('用户名已被占用', 'error');
            } else {
                showToast('保存失败', 'error');
            }
            return;
        }
        
    // 同步更新所有帖子的头像和用户名（一次 update 搞定）
    await supabase
        .from('posts')
        .update({ username: username, user_avatar: avatar })
        .eq('user_id', currentUser.id);
        
        // 更新本地用户信息
        currentUser.username = username;
        currentUser.avatar = avatar;
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        
        updateUserInfo();
        document.getElementById('settings-modal').style.display = 'none';
        showToast('设置保存成功，已同步更新所有帖子', 'success');
        
        // 刷新帖子显示新头像
        await loadPosts();
        
    } catch (error) {
        console.error(error);
        showToast('保存失败', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 帖子 ====================
async function loadPosts() {
    try {
        // 确保 Supabase 已加载
        if (supabaseLoadFailed || !supabase) {
            console.error('Supabase 未加载，显示空内容');
            hideSkeleton();
            posts = [];  // 确保 posts 是空数组
            renderPosts();  // 显示"还没有分享"的空状态
            return;
        }
        
        // 记录本次刷新时间，防止实时订阅循环
        _lastRefreshTime = Date.now();
        
        // 优化：缩短超时时间，加快错误检测
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('请求超时')), 5000)
        );
        
        const postsPromise = supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);  // 优化：减少初始加载数量，从30减少到20
        
        const { data } = await Promise.race([
            postsPromise,
            timeoutPromise
        ]).catch(() => ({ data: null }));
        
        if (!data || data.length === 0) {
            posts = [];
            renderPosts();
            return;
        }
        
        // 批量获取点赞和收藏数据（带超时）
        const postIds = data.map(p => p.id);
        
        const batchPromise = Promise.all([
            supabase.from('likes').select('post_id').in('post_id', postIds),
            supabase.from('favorites').select('post_id').in('post_id', postIds),
            currentUser ? supabase.from('likes').select('post_id').eq('user_id', currentUser.id).in('post_id', postIds) : Promise.resolve({ data: [] }),
            currentUser ? supabase.from('favorites').select('post_id').eq('user_id', currentUser.id).in('post_id', postIds) : Promise.resolve({ data: [] }),
            supabase.from('comments').select('*').in('post_id', postIds).order('created_at', { ascending: true })
        ]);
        
        const batchTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('批量查询超时')), 5000));  // 优化：缩短超时
        const [likesData, favoritesData, userLikes, userFavorites, commentsRes] = await Promise.race([batchPromise, batchTimeout]).catch(() => [null, null, null, null, null]);
        
        // 统计点赞和收藏数
        const likesCount = {};
        const favoritesCount = {};
        
        if (likesData?.data) likesData.data.forEach(l => { likesCount[l.post_id] = (likesCount[l.post_id] || 0) + 1; });
        if (favoritesData?.data) favoritesData.data.forEach(f => { favoritesCount[f.post_id] = (favoritesCount[f.post_id] || 0) + 1; });
        
        // 按帖子分组评论（顶级评论 + 子回复）
        const commentsByPost = {};
        if (commentsRes?.data) {
            commentsRes.data.forEach(c => {
                if (!commentsByPost[c.post_id]) {
                    commentsByPost[c.post_id] = { top: [], replies: {} };
                }
                if (c.parent_id) {
                    // 子回复
                    if (!commentsByPost[c.post_id].replies[c.parent_id]) {
                        commentsByPost[c.post_id].replies[c.parent_id] = [];
                    }
                    commentsByPost[c.post_id].replies[c.parent_id].push(c);
                } else {
                    // 顶级评论
                    commentsByPost[c.post_id].top.push(c);
                }
            });
        }
        
        // 用户已点赞/收藏的帖子
        const userLikedPosts = new Set((userLikes?.data || []).map(l => l.post_id));
        const userFavoritedPosts = new Set((userFavorites?.data || []).map(f => f.post_id));
        
        posts = data.map(post => ({
            ...post,
            likes: likesCount[post.id] || 0,
            favorites: favoritesCount[post.id] || 0,
            liked: userLikedPosts.has(post.id),
            favorited: userFavoritedPosts.has(post.id),
            comments: commentsByPost[post.id] || { top: [], replies: {} }
        }));
        
        renderPosts();
        
    } catch (error) {
        console.error('加载帖子失败:', error);
        // 如果帖子列表为空，显示空状态
        if (posts.length === 0) {
            renderPosts();
        }
    }
}

function renderPosts() {
    // 首次渲染完成时隐藏骨架屏
    hideSkeleton();
    
    const container = document.getElementById('posts-container');
    if (!container) {
        console.error('renderPosts: posts-container 元素不存在！');
        return;
    }
    
    container.innerHTML = '';
    
    if (posts.length === 0) {
        console.log('renderPosts: 显示空状态提示');
        container.innerHTML = '<p class="no-posts" style="text-align:center;padding:40px;color:#666;">还没有分享，快来发布第一条吧！</p>';
        return;
    }
    
    console.log('renderPosts: 渲染', posts.length, '条帖子');
    
    posts.forEach(post => {
        container.appendChild(createPostElement(post));
    });
}

function createPostElement(post) {
    const div = document.createElement('div');
    div.className = 'post-item';
    div.dataset.id = post.id;
    
    // 浏览量计数
    if (!viewedPosts.has(post.id)) {
        viewedPosts.add(post.id);
        incrementViewCount(post.id);
    }
    
    let media = '';
    if (post.image_url) {
        media = `<div class="post-item-media"><img src="${post.image_url}" alt="图片" onclick="toggleImageZoom(this)" loading="lazy"></div>`;
    } else if (post.video_url) {
        media = `<div class="post-item-media"><video controls preload="metadata"><source src="${post.video_url}"></video></div>`;
    } else if (post.voice_url) {
        media = `<div class="post-item-media"><audio controls preload="metadata"><source src="${post.voice_url}"></audio></div>`;
    }
    
    const userHtml = `<div class="post-user" onclick="openUserProfile('${safeAttr(post.user_id)}')" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer;">
        <img src="${post.user_avatar}" style="width:30px;height:30px;border-radius:50%;">
        <span style="font-weight:600;color:#667eea;">${post.username}</span>
    </div>`;
    
    let commentsHtml = '';
    const commentData = post.comments;
    const topComments = commentData?.top || [];
    const repliesMap = commentData?.replies || {};
    const totalComments = topComments.length + Object.values(repliesMap).reduce((sum, arr) => sum + arr.length, 0);
    
    if (topComments.length > 0) {
        commentsHtml = `<div class="post-comments"><h4>评论 (${totalComments})</h4><ul class="comments-list">`;
        topComments.slice(-5).forEach(c => {
            const isCommentOwner = currentUser && c.user_id === currentUser.id;
            const replies = repliesMap[c.id] || [];
            let repliesHtml = '';
            replies.slice(-3).forEach(r => {
                const isReplyOwner = currentUser && r.user_id === currentUser.id;
                repliesHtml += `<div class="comment-reply" style="margin:5px 0 5px 25px;padding:5px 8px;background:rgba(102,126,234,0.05);border-radius:6px;font-size:0.85rem;">
                    <span style="font-weight:600;color:#667eea;">${r.username}</span>
                    ${r.reply_to ? `<span style="color:#999;font-size:0.8rem;"> 回复 </span><span style="font-weight:600;color:#667eea;">${r.reply_to}</span>` : ''}
                    <span style="color:var(--text-primary);"> ${parseContent(r.content)}</span>
                    <span class="comment-time" style="margin-left:8px;">${new Date(r.created_at).toLocaleString('zh-CN')}</span>
                    ${isReplyOwner ? `<button onclick="event.stopPropagation(); deleteComment('${safeAttr(post.id)}', '${safeAttr(r.id)}')" style="background:none;border:none;color:#999;font-size:0.7rem;cursor:pointer;margin-left:5px;">删除</button>` : ''}
                </div>`;
            });
            commentsHtml += `<li class="comment-item" onclick="openUserProfile('${safeAttr(c.user_id)}')">
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                    <img src="${c.user_avatar}" style="width:20px;height:20px;border-radius:50%;">
                    <span style="font-weight:600;font-size:0.8rem;color:#667eea;">${c.username}</span>
                    <button onclick="event.stopPropagation(); showReplyInput('${safeAttr(post.id)}', '${safeAttr(c.id)}', '${safeAttr(c.username)}')" style="background:none;border:none;color:#999;font-size:0.75rem;cursor:pointer;">回复</button>
                    ${isCommentOwner ? `<button onclick="event.stopPropagation(); deleteComment('${safeAttr(post.id)}', '${safeAttr(c.id)}')" style="background:none;border:none;color:#999;font-size:0.75rem;cursor:pointer;margin-left:5px;">删除</button>` : ''}
                </div>
                <span class="comment-text">${parseContent(c.content)}</span>
                <span class="comment-time">${new Date(c.created_at).toLocaleString('zh-CN')}</span>
                ${repliesHtml}
            </li>`;
        });
        commentsHtml += '</ul></div>';
    }
    
    div.innerHTML = `
        ${userHtml}
        <div class="post-item-content">${parseContent(post.content)}</div>
        ${media}
        <div class="post-item-meta">
            <span class="post-time">${new Date(post.created_at).toLocaleString('zh-CN')} · ${post.views || 0} 浏览</span>
            <div class="post-item-actions">
                <button class="action-btn like-btn ${post.liked ? 'liked' : ''}" data-id="${post.id}">
                    <i class="fas fa-heart"></i> ${post.likes}
                </button>
                <button class="action-btn favorite-btn ${post.favorited ? 'favorited' : ''}" data-id="${post.id}" title="收藏">
                    <i class="fas fa-bookmark"></i> ${post.favorites || 0}
                </button>
                <button class="action-btn edit-btn" data-id="${post.id}" title="编辑"><i class="fas fa-edit"></i></button>
                <button class="action-btn report-btn" data-id="${post.id}" title="举报"><i class="fas fa-flag"></i></button>
                <button class="action-btn delete-btn" data-id="${post.id}"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        ${commentsHtml}
        <div class="comment-form">
            <input type="text" class="comment-input" placeholder="写下你的评论..." data-id="${post.id}">
            <button class="comment-btn" data-id="${post.id}"><i class="fas fa-paper-plane"></i></button>
        </div>`;
    
    div.querySelector('.like-btn')?.addEventListener('click', () => toggleLike(post.id));
    div.querySelector('.favorite-btn')?.addEventListener('click', () => toggleFavorite(post.id));
    div.querySelector('.edit-btn')?.addEventListener('click', () => showEditPost(post.id));
    div.querySelector('.report-btn')?.addEventListener('click', () => reportPost(post.id));
    div.querySelector('.delete-btn')?.addEventListener('click', () => deletePost(post.id));
    div.querySelector('.comment-btn')?.addEventListener('click', () => addComment(post.id));
    div.querySelector('.comment-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addComment(post.id);
    });
    
    return div;
}

async function incrementViewCount(postId) {
    // 防抖：同一帖子 1 秒内只更新一次
    if (incrementViewCount._pending && incrementViewCount._pending[postId]) return;
    if (!incrementViewCount._pending) incrementViewCount._pending = {};
    incrementViewCount._pending[postId] = true;
    
    setTimeout(async () => {
        delete incrementViewCount._pending[postId];
        
        // 先尝试普通 update（RPC 可能不存在）
        const post = posts.find(p => p.id === postId);
        if (post) {
            const { error } = await supabase.from('posts').update({ views: (post.views || 0) + 1 }).eq('id', postId);
            if (!error) {
                post.views++;
            }
        }
        saveViewedPosts();
    }, 1000);
}

// ==================== 发布 ====================
async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 50 * 1024 * 1024) {
            showToast('图片不能超过50MB', 'error');
            return;
        }
        currentImage = file;
        currentVideo = null;
        currentVoice = null;
        showToast('图片已选择', 'success');
    }
}

async function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 50 * 1024 * 1024) {
            showToast('视频不能超过50MB', 'error');
            return;
        }
        currentVideo = file;
        currentImage = null;
        currentVoice = null;
        showToast('视频已选择', 'success');
    }
}

function toggleVoiceRecord() {
    const btn = document.getElementById('voice-record');
    if (mediaRecorder?.state === 'recording') {
        mediaRecorder.stop();
        btn.innerHTML = '<i class="fas fa-microphone"></i> 语音';
        btn.style.background = '#f8f9fa';
        btn.style.color = '#666';
    } else {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                currentVoice = new Blob(audioChunks, { type: 'audio/webm' });
                currentImage = null;
                currentVideo = null;
                showToast('语音录制完成', 'success');
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorder.start();
            btn.innerHTML = '<i class="fas fa-stop"></i> 停止';
            btn.style.background = '#ff6b6b';
            btn.style.color = 'white';
        }).catch(e => {
            console.error(e);
            showToast('无法访问麦克风', 'error');
        });
    }
}

async function uploadFile(file, bucket = 'images') {
    const fileName = `${currentUser.id}/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);
    
    if (error) throw error;
    
    const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);
    
    return urlData.publicUrl;
}

async function handlePost() {
    const text = document.getElementById('post-text').value.trim();
    
    if (!text && !currentImage && !currentVideo && !currentVoice) {
        showToast('请输入内容', 'error');
        return;
    }
    
    // 安全校验：内容长度限制（防 DoS + 数据库保护）
    const MAX_CONTENT_LENGTH = 5000;
    if (text.length > MAX_CONTENT_LENGTH) {
        showToast(`内容不能超过 ${MAX_CONTENT_LENGTH} 字`, 'error');
        return;
    }
    
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    showLoading(true);
    
    try {
        let imageUrl = null;
        let videoUrl = null;
        let voiceUrl = null;
        
        // 上传文件到 Supabase Storage
        if (currentImage) {
            imageUrl = await uploadFile(currentImage, 'images');
        }
        if (currentVideo) {
            videoUrl = await uploadFile(currentVideo, 'videos');
        }
        if (currentVoice) {
            voiceUrl = await uploadFile(currentVoice, 'audio');
        }
        
        const postId = generateId();
        
        const { error } = await supabase
            .from('posts')
            .insert({
                id: postId,
                user_id: currentUser.id,
                username: currentUser.username,
                user_avatar: currentUser.avatar,
                content: text,
                image_url: imageUrl,
                video_url: videoUrl,
                voice_url: voiceUrl
            });
        
        if (error) throw error;
        
        // 清空表单
        document.getElementById('post-text').value = '';
        currentImage = null;
        currentVideo = null;
        currentVoice = null;
        document.getElementById('image-upload').value = '';
        document.getElementById('video-upload').value = '';
        
        await loadPosts();
        showToast('发布成功', 'success');
        
    } catch (error) {
        console.error('发布失败:', error);
        showToast('发布失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 互动 ====================
window.toggleLike = async function(postId) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    try {
        const post = posts.find(p => p.id === postId);
        if (!post) return;
        
        if (post.liked) {
            // 取消点赞
            await supabase
                .from('likes')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', currentUser.id);
            post.liked = false;
            post.likes = Math.max(0, post.likes - 1);
        } else {
            // 点赞
            await supabase
                .from('likes')
                .insert({
                    post_id: postId,
                    user_id: currentUser.id
                });
            post.liked = true;
            post.likes++;
        }
        
        renderPosts();
        
    } catch (error) {
        console.error('点赞失败:', error);
        showToast('操作失败', 'error');
    }
}

// ==================== 收藏功能 ====================
async function toggleFavorite(postId) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    try {
        const post = posts.find(p => p.id === postId);
        if (!post) return;
        
        if (post.favorited) {
            // 取消收藏
            await supabase
                .from('favorites')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', currentUser.id);
            post.favorited = false;
            post.favorites = Math.max(0, post.favorites - 1);
            showToast('已取消收藏', 'success');
        } else {
            // 添加收藏
            await supabase
                .from('favorites')
                .insert({
                    post_id: postId,
                    user_id: currentUser.id
                });
            post.favorited = true;
            post.favorites = (post.favorites || 0) + 1;
            showToast('收藏成功', 'success');
        }
        
        renderPosts();
        
    } catch (error) {
        console.error('收藏失败:', error);
        showToast('操作失败', 'error');
    }
}

// ==================== 帖子编辑 ====================
window.showEditPost = function(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post || post.user_id !== currentUser.id) {
        showToast('无权限编辑', 'error');
        return;
    }
    
    const newContent = prompt('编辑帖子内容：', post.content);
    if (newContent === null || newContent.trim() === post.content) return;
    
    showLoading(true);
    
    supabase.from('posts').update({ content: newContent.trim() }).eq('id', postId)
        .then(() => {
            showToast('编辑成功', 'success');
            loadPosts();
        })
        .catch(error => {
            console.error('编辑失败:', error);
            showToast('编辑失败', 'error');
        })
        .finally(() => showLoading(false));
};

async function deletePost(postId) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return;
    }
    
    const post = posts.find(p => p.id === postId);
    if (!post || post.user_id !== currentUser.id) {
        showToast('无权限删除', 'error');
        return;
    }
    
    if (!confirm('确定删除这条分享？')) return;
    
    showLoading(true);
    
    try {
        // 删除相关点赞和评论
        await supabase.from('likes').delete().eq('post_id', postId);
        await supabase.from('comments').delete().eq('post_id', postId);
        
        // 删除帖子
        await supabase.from('posts').delete().eq('id', postId);
        
        await loadPosts();
        showToast('删除成功', 'success');
        
    } catch (error) {
        console.error('删除失败:', error);
        showToast('删除失败', 'error');
    } finally {
        showLoading(false);
    }
}

async function addComment(postId) {
    const input = document.querySelector(`.comment-input[data-id="${postId}"]`);
    const text = input?.value.trim();
    
    if (!text) {
        showToast('请输入评论', 'error');
        return;
    }
    
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    try {
        await supabase
            .from('comments')
            .insert({
                post_id: postId,
                user_id: currentUser.id,
                username: currentUser.username,
                user_avatar: currentUser.avatar,
                content: text
            });
        
        input.value = '';
        await loadPosts();
        showToast('评论成功', 'success');
        
    } catch (error) {
        console.error('评论失败:', error);
        showToast('评论失败', 'error');
    }
}

// ==================== 评论删除 ====================
window.deleteComment = async function(postId, commentId) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return;
    }
    
    if (!confirm('确定删除这条评论？')) return;
    
    try {
        // 直接从 comments 表删除，不依赖本地数据
        const { data, error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId)
            .eq('user_id', currentUser.id)
            .select();
        
        if (error) {
            console.error('删除评论失败:', error);
            showToast('删除失败：' + (error.message || '未知错误'), 'error');
            return;
        }
        
        if (!data || data.length === 0) {
            showToast('删除失败：评论不存在或无权限', 'error');
            return;
        }
        
        // 从本地列表移除（如果还存在的话）
        const post = posts.find(p => p.id === postId);
        if (post && post.comments) {
            // 顶级评论
            if (post.comments.top) {
                post.comments.top = post.comments.top.filter(c => c.id !== commentId);
                delete post.comments.replies[commentId]; // 删子回复
            }
            // 子回复
            if (post.comments.replies) {
                for (const parentId in post.comments.replies) {
                    post.comments.replies[parentId] = post.comments.replies[parentId].filter(c => c.id !== commentId);
                }
            }
            renderPosts();
        } else {
            await loadPosts();
        }
        
        showToast('删除成功', 'success');
        
    } catch (error) {
        console.error('删除评论失败:', error);
        showToast('删除失败', 'error');
    }
};

// ==================== 举报功能 ====================
window.reportPost = async function(postId) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return;
    }
    
    const reasons = ['垃圾信息', '不当内容', '抄袭侵权', '其他'];
    const reason = prompt('请选择举报原因：\n1. 垃圾信息\n2. 不当内容\n3. 抄袭侵权\n4. 其他\n\n请输入数字（1-4）：');
    
    if (!reason || !['1','2','3','4'].includes(reason)) return;
    
    try {
        await supabase.from('reports').insert({
            post_id: postId,
            user_id: currentUser.id,
            reason: reasons[parseInt(reason) - 1],
            status: 'pending'
        });
        showToast('举报成功，我们会尽快处理', 'success');
    } catch (error) {
        console.error('举报失败:', error);
        showToast('举报失败，请重试', 'error');
    }
};

// ==================== 排行榜 ====================
window.showRanking = function(type, el) {
    document.querySelectorAll('.ranking-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    
    let sorted = [...posts];
    if (type === 'likes') sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    else if (type === 'views') sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (type === 'comments') sorted.sort((a, b) => {
                const countA = (a.comments?.top?.length || 0) + Object.values(a.comments?.replies || {}).reduce((s, arr) => s + arr.length, 0);
                const countB = (b.comments?.top?.length || 0) + Object.values(b.comments?.replies || {}).reduce((s, arr) => s + arr.length, 0);
                return countB - countA;
            });
    
    const container = document.getElementById('ranking-container');
    container.innerHTML = '';
    
    if (!sorted.length) {
        container.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">还没有分享</p>';
        return;
    }
    
    sorted.slice(0, 10).forEach((post, i) => {
        const div = document.createElement('div');
        div.className = 'post-item';
        const rankColor = ['#ffd700', '#c0c0c0', '#cd7f32'][i] || '#667eea';
        
        div.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:15px;">
                <div style="font-size:1.5rem;font-weight:bold;color:${rankColor};">${i + 1}</div>
                <div style="flex:1;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <img src="${post.user_avatar}" style="width:30px;height:30px;border-radius:50%;">
                        <span style="font-weight:600;color:#667eea;">${post.username}</span>
                    </div>
                    <div class="post-item-content">${escapeHtml(post.content || '')}</div>
                    <div class="post-item-meta">
                        <span class="post-time">${new Date(post.created_at).toLocaleString('zh-CN')} · ${post.views || 0} 浏览</span>
                        <button class="action-btn like-btn ${post.liked ? 'liked' : ''}" onclick="toggleLike('${safeAttr(post.id)}')">
                            <i class="fas fa-heart"></i> ${post.likes}
                        </button>
                    </div>
                </div>
            </div>`;
        container.appendChild(div);
    });
};

// ==================== 好友系统 ====================
function showFriendsModal() {
    if (currentUser) {
        document.getElementById('friends-modal').style.display = 'block';
        loadFriends();
    }
}

window.switchFriendsTab = function(tab, el) {
    document.querySelectorAll('.friends-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    document.querySelectorAll('.friends-content').forEach(c => c.style.display = 'none');
    document.getElementById(tab).style.display = 'block';
    if (tab === 'list') loadFriends();
};

async function loadFriends() {
    const container = document.getElementById('friends-container');
    container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">加载中...</p>';
    
    try {
        const { data } = await supabase
            .from('friends')
            .select('friend_id, users!friends_friend_id_fkey(*)')
            .eq('user_id', currentUser.id);
        
        container.innerHTML = '';
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">还没有好友</p>';
            return;
        }
        
        data.forEach(item => {
            const friend = item.users;
            if (friend) {
                const div = document.createElement('div');
                div.className = 'friend-item';
                div.innerHTML = `
                    <img src="${friend.avatar}">
                    <div class="friend-item-info">
                        <div class="friend-item-name">${friend.username}</div>
                    </div>
                    <div class="friend-item-actions">
                        <button class="upload-btn" onclick="removeFriend('${safeAttr(friend.id)}')" style="padding:5px 10px;">删除</button>
                    </div>`;
                container.appendChild(div);
            }
        });
        
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">加载失败</p>';
    }
}

async function addFriend() {
    const input = document.getElementById('add-friend-username').value.trim();
    if (!input) {
        showToast('请输入用户名或ID', 'error');
        return;
    }
    
    try {
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .or(`username.eq.${input},id.eq.${input}`)
            .neq('id', currentUser.id)
            .single();
        
        if (!user) {
            showToast('未找到该用户', 'error');
            return;
        }
        
        // 检查是否已是好友
        const { data: existing } = await supabase
            .from('friends')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('friend_id', user.id)
            .single();
        
        if (existing) {
            showToast('已经是好友', 'error');
            return;
        }
        
        await supabase.from('friends').insert({
            user_id: currentUser.id,
            friend_id: user.id
        });
        
        showToast('添加成功', 'success');
        document.getElementById('add-friend-username').value = '';
        loadFriends();
        
    } catch (error) {
        console.error(error);
        showToast('添加失败', 'error');
    }
}

window.removeFriend = async function(friendId) {
    if (!confirm('确定删除此好友？')) return;
    
    try {
        await supabase
            .from('friends')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('friend_id', friendId);
        
        loadFriends();
        showToast('已删除', 'success');
    } catch (error) {
        console.error(error);
        showToast('删除失败', 'error');
    }
};

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    showToast('聊天功能开发中...', 'info');
}

async function searchFriends(keyword) {
    if (!keyword) {
        loadFriends();
        return;
    }
    
    const container = document.getElementById('friends-container');
    container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">搜索中...</p>';
    
    try {
        const { data } = await supabase
            .from('friends')
            .select('friend_id, users!friends_friend_id_fkey(*)')
            .eq('user_id', currentUser.id);
        
        const filtered = data.filter(item => {
            const f = item.users;
            return f && (f.username.toLowerCase().includes(keyword.toLowerCase()) || f.id.includes(keyword));
        });
        
        container.innerHTML = '';
        
        if (!filtered.length) {
            container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">未找到匹配的好友</p>';
            return;
        }
        
        filtered.forEach(item => {
            const friend = item.users;
            const div = document.createElement('div');
            div.className = 'friend-item';
            div.innerHTML = `
                <img src="${friend.avatar}">
                <div class="friend-item-info">
                    <div class="friend-item-name">${friend.username}</div>
                    <div style="font-size:0.8rem;color:#999;">ID: ${friend.id}</div>
                </div>
                <div class="friend-item-actions">
                    <button class="upload-btn" onclick="removeFriend('${safeAttr(friend.id)}')" style="padding:5px 10px;">删除</button>
                </div>`;
            container.appendChild(div);
        });
        
    } catch (error) {
        console.error(error);
    }
}

// ==================== 导入导出 ====================
window.exportData = async function() {
    const data = JSON.stringify(posts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'treehole-data.json';
    a.click();
    URL.revokeObjectURL(url);
};

window.importData = function(e) {
    showToast('导入功能开发中...', 'info');
};

// ==================== 图片放大 ====================
window.toggleImageZoom = function(img) {
    if (img.classList.contains('zoomed')) {
        img.classList.remove('zoomed');
    } else {
        img.classList.add('zoomed');
        // 点击遮罩层关闭
        const closeHandler = (e) => {
            if (e.target === img) return;
            img.classList.remove('zoomed');
            document.removeEventListener('click', closeHandler, true);
        };
        document.addEventListener('click', closeHandler, true);
    }
};

// ==================== 话题标签解析 ====================
function parseContent(text) {
    if (!text) return '';
    
    // 转义 HTML
    let result = escapeHtml(text);
    
    // 处理换行（在话题标签解析之前，避免标签内的换行被干扰）
    result = result.replace(/\n/g, '<br>');
    
    // 解析话题标签 #话题（&#39; 代替单引号防 XSS）
    result = result.replace(/#(\S+)/g, '<span class="topic-tag" onclick="searchTopic(&#39;$1&#39;)">#$1</span>');
    
    // 解析 @提及（&#39; 代替单引号防 XSS）
    result = result.replace(/@(\S+)/g, '<span class="mention-tag" onclick="mentionUser(&#39;$1&#39;)">@$1</span>');
    
    // 解析链接
    result = result.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#667eea;">$1</a>');
    
    return result;
}

// 搜索话题
window.searchTopic = async function(topic) {
    const container = document.getElementById('posts-container');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 搜索中...</div>';
    window._searchState = { type: 'topic', value: topic };

    try {
        const { data } = await supabase
            .from('posts').select('*')
            .ilike('content', `%#${topic}%`)
            .order('created_at', { ascending: false })
            .limit(30);

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="no-posts">
                    <p style="font-size:3rem;">🔍</p>
                    <p>没有找到 #${escapeHtml(topic)} 相关的帖子</p>
                    <button onclick="clearSearch()" style="margin-top:15px;padding:8px 20px;background:#667eea;color:white;border:none;border-radius:20px;cursor:pointer;">返回全部</button>
                </div>`;
            return;
        }

        // 批量查询点赞、收藏、评论
        const postIds = data.map(p => p.id);
        const [likesRes, favoritesRes, userLikesRes, userFavsRes, commentsRes] = await Promise.all([
            supabase.from('likes').select('post_id', { count: 'exact' }).in('post_id', postIds),
            supabase.from('favorites').select('post_id', { count: 'exact' }).in('post_id', postIds),
            currentUser ? supabase.from('likes').select('post_id').in('post_id', postIds).eq('user_id', currentUser.id) : Promise.resolve({ data: [] }),
            currentUser ? supabase.from('favorites').select('post_id').in('post_id', postIds).eq('user_id', currentUser.id) : Promise.resolve({ data: [] }),
            supabase.from('comments').select('*').in('post_id', postIds)
        ]);

        const userLikeSet = new Set((userLikesRes.data || []).map(l => l.post_id));
        const userFavSet = new Set((userFavsRes.data || []).map(f => f.post_id));
        const likeCounts = {};
        const favCounts = {};
        (likesRes.data || []).forEach(l => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
        (favoritesRes.data || []).forEach(f => { favCounts[f.post_id] = (favCounts[f.post_id] || 0) + 1; });

        // 分组评论
        const commentsByPost = {};
        (commentsRes.data || []).forEach(c => {
            if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = { top: [], replies: {} };
            if (c.parent_id) {
                if (!commentsByPost[c.post_id].replies[c.parent_id]) commentsByPost[c.post_id].replies[c.parent_id] = [];
                commentsByPost[c.post_id].replies[c.parent_id].push(c);
            } else {
                commentsByPost[c.post_id].top.push(c);
            }
        });

        container.innerHTML = `
            <div style="text-align:center;padding:10px 0 5px;color:var(--text-secondary);font-size:0.85rem;">
                🔍 话题 <strong>#${escapeHtml(topic)}</strong> 的结果 (${data.length} 条)
                <button onclick="clearSearch()" style="margin-left:10px;padding:3px 12px;background:#eee;color:#333;border:none;border-radius:12px;cursor:pointer;font-size:0.8rem;">返回</button>
            </div>`;

        data.forEach(post => {
            const enriched = {
                ...post,
                likes: likeCounts[post.id] || 0,
                liked: userLikeSet.has(post.id),
                favorites: favCounts[post.id] || 0,
                favorited: userFavSet.has(post.id),
                comments: commentsByPost[post.id] || { top: [], replies: {} }
            };
            container.appendChild(createPostElement(enriched));
        });

    } catch (error) {
        console.error('话题搜索失败:', error);
        container.innerHTML = '<div class="no-posts"><p>搜索失败，请重试</p></div>';
    }
};

// 提及用户
window.mentionUser = async function(username) {
    const container = document.getElementById('posts-container');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 搜索中...</div>';
    window._searchState = { type: 'mention', value: username };

    try {
        const { data } = await supabase
            .from('posts').select('*')
            .ilike('content', `%@${username}%`)
            .order('created_at', { ascending: false })
            .limit(30);

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="no-posts">
                    <p style="font-size:3rem;">🔍</p>
                    <p>没有找到 @${escapeHtml(username)} 相关的帖子</p>
                    <button onclick="clearSearch()" style="margin-top:15px;padding:8px 20px;background:#667eea;color:white;border:none;border-radius:20px;cursor:pointer;">返回全部</button>
                </div>`;
            return;
        }

        // 批量查询点赞、收藏、评论
        const postIds = data.map(p => p.id);
        const [likesRes, favoritesRes, userLikesRes, userFavsRes, commentsRes] = await Promise.all([
            supabase.from('likes').select('post_id', { count: 'exact' }).in('post_id', postIds),
            supabase.from('favorites').select('post_id', { count: 'exact' }).in('post_id', postIds),
            currentUser ? supabase.from('likes').select('post_id').in('post_id', postIds).eq('user_id', currentUser.id) : Promise.resolve({ data: [] }),
            currentUser ? supabase.from('favorites').select('post_id').in('post_id', postIds).eq('user_id', currentUser.id) : Promise.resolve({ data: [] }),
            supabase.from('comments').select('*').in('post_id', postIds)
        ]);

        const userLikeSet = new Set((userLikesRes.data || []).map(l => l.post_id));
        const userFavSet = new Set((userFavsRes.data || []).map(f => f.post_id));
        const likeCounts = {};
        const favCounts = {};
        (likesRes.data || []).forEach(l => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
        (favoritesRes.data || []).forEach(f => { favCounts[f.post_id] = (favCounts[f.post_id] || 0) + 1; });

        const commentsByPost = {};
        (commentsRes.data || []).forEach(c => {
            if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = { top: [], replies: {} };
            if (c.parent_id) {
                if (!commentsByPost[c.post_id].replies[c.parent_id]) commentsByPost[c.post_id].replies[c.parent_id] = [];
                commentsByPost[c.post_id].replies[c.parent_id].push(c);
            } else {
                commentsByPost[c.post_id].top.push(c);
            }
        });

        container.innerHTML = `
            <div style="text-align:center;padding:10px 0 5px;color:var(--text-secondary);font-size:0.85rem;">
                🔍 提及 @${escapeHtml(username)} 的结果 (${data.length} 条)
                <button onclick="clearSearch()" style="margin-left:10px;padding:3px 12px;background:#eee;color:#333;border:none;border-radius:12px;cursor:pointer;font-size:0.8rem;">返回</button>
            </div>`;

        data.forEach(post => {
            const enriched = {
                ...post,
                likes: likeCounts[post.id] || 0,
                liked: userLikeSet.has(post.id),
                favorites: favCounts[post.id] || 0,
                favorited: userFavSet.has(post.id),
                comments: commentsByPost[post.id] || { top: [], replies: {} }
            };
            container.appendChild(createPostElement(enriched));
        });

    } catch (error) {
        console.error('用户提及搜索失败:', error);
        container.innerHTML = '<div class="no-posts"><p>搜索失败，请重试</p></div>';
    }
};

// 返回全部帖子（清除搜索状态）
window.clearSearch = async function() {
    window._searchState = null;
    const container = document.getElementById('posts-container');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
    await loadPosts();
};

// ==================== 无限滚动 ====================
let currentPage = 1; // loadPosts 已加载第1页(20条)，从第2页开始
const pageSize = 20;
let isLoadingMore = false;
let hasMorePosts = true;

async function loadMorePosts() {
    if (isLoadingMore || !hasMorePosts) return;
    
    isLoadingMore = true;
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';
        loadMoreBtn.disabled = true;
    }
    
    try {
        const { data, error } = await supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false })
            .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            currentPage++;
            
            // 获取点赞、收藏和评论（批量优化）
            const postIds = data.map(p => p.id);
            const [likesRes, favoritesRes, userLikesRes, userFavsRes, commentsRes] = await Promise.all([
                supabase.from('likes').select('post_id', { count: 'exact' }).in('post_id', postIds),
                supabase.from('favorites').select('post_id', { count: 'exact' }).in('post_id', postIds),
                currentUser ? supabase.from('likes').select('post_id').in('post_id', postIds).eq('user_id', currentUser.id) : Promise.resolve({ data: [] }),
                currentUser ? supabase.from('favorites').select('post_id').in('post_id', postIds).eq('user_id', currentUser.id) : Promise.resolve({ data: [] }),
                supabase.from('comments').select('*').in('post_id', postIds)
            ]);

            const userLikeSet = new Set((userLikesRes.data || []).map(l => l.post_id));
            const userFavSet = new Set((userFavsRes.data || []).map(f => f.post_id));
            const likeCounts = {};
            const favCounts = {};
            (likesRes.data || []).forEach(l => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
            (favoritesRes.data || []).forEach(f => { favCounts[f.post_id] = (favCounts[f.post_id] || 0) + 1; });

            // 分组评论
            const commentsByPost = {};
            (commentsRes.data || []).forEach(c => {
                if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = { top: [], replies: {} };
                if (c.parent_id) {
                    if (!commentsByPost[c.post_id].replies[c.parent_id]) commentsByPost[c.post_id].replies[c.parent_id] = [];
                    commentsByPost[c.post_id].replies[c.parent_id].push(c);
                } else {
                    commentsByPost[c.post_id].top.push(c);
                }
            });

            const newPosts = data.map(post => ({
                ...post,
                likes: likeCounts[post.id] || 0,
                liked: userLikeSet.has(post.id),
                favorites: favCounts[post.id] || 0,
                favorited: userFavSet.has(post.id),
                comments: commentsByPost[post.id] || { top: [], replies: {} }
            }));
            
            posts = [...posts, ...newPosts];
            
            // 渲染新帖子
            const container = document.getElementById('posts-container');
            newPosts.forEach(post => {
                container.appendChild(createPostElement(post));
            });
            
            if (data.length < pageSize) {
                hasMorePosts = false;
            }
        } else {
            hasMorePosts = false;
        }
        
    } catch (error) {
        console.error('加载更多失败:', error);
    } finally {
        isLoadingMore = false;
        if (loadMoreBtn && hasMorePosts) {
            loadMoreBtn.innerHTML = '<i class="fas fa-chevron-down"></i> 加载更多';
            loadMoreBtn.disabled = false;
        } else if (loadMoreBtn) {
            loadMoreBtn.innerHTML = '没有更多了';
            loadMoreBtn.disabled = true;
        }
    }
}

// 滚动监听
function setupInfiniteScroll() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMorePosts);
        loadMoreBtn.style.display = 'block';
    }
    
    // 滚动到底部自动加载
    window.addEventListener('scroll', () => {
        if (isLoadingMore || !hasMorePosts) return;
        
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = document.documentElement.clientHeight;
        
        if (scrollTop + clientHeight >= scrollHeight - 200) {
            loadMorePosts();
        }
    });
}

// ==================== 下拉刷新 ====================
let touchStartY = 0;
let isPulling = false;

function setupPullRefresh() {
    const container = document.body;
    
    container.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            touchStartY = e.touches[0].clientY;
            isPulling = true;
        }
    });
    
    container.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        
        const touchY = e.touches[0].clientY;
        const diff = touchY - touchStartY;
        
        if (diff > 100 && window.scrollY === 0) {
            const pullRefresh = document.getElementById('pull-refresh');
            if (pullRefresh) {
                pullRefresh.classList.add('active');
            }
        }
    });
    
    container.addEventListener('touchend', () => {
        const pullRefresh = document.getElementById('pull-refresh');
        if (pullRefresh && pullRefresh.classList.contains('active')) {
            // 刷新
            location.reload();
        }
        isPulling = false;
        if (pullRefresh) {
            pullRefresh.classList.remove('active');
        }
    });
}

// ==================== 显示骨架屏 ====================
function showSkeleton() {
    const skeletonContainer = document.getElementById('skeleton-container');
    if (skeletonContainer) {
        skeletonContainer.style.display = 'block';
    }
}

// ==================== 隐藏骨架屏 ====================
function hideSkeleton() {
    const skeletonContainer = document.getElementById('skeleton-container');
    if (skeletonContainer) {
        skeletonContainer.style.display = 'none';
    }
}

// ==================== 评论回复功能 ====================
window.showReplyInput = function(postId, commentId, replyToUsername) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    const replyInput = document.createElement('div');
    replyInput.style.cssText = 'display:flex;gap:10px;margin-top:10px;padding:10px;background:#f8f9fa;border-radius:8px;';
    replyInput.innerHTML = `
        <input type="text" class="reply-input" placeholder="回复 @${replyToUsername}..." 
               style="flex:1;padding:8px 12px;border:1px solid #e0e0e0;border-radius:20px;font-size:0.85rem;">
        <button class="reply-submit-btn" style="padding:8px 15px;background:#667eea;color:white;border:none;border-radius:20px;cursor:pointer;font-size:0.85rem;">
            发送
        </button>
    `;
    
    const commentItems = document.querySelectorAll('.comment-item');
    commentItems.forEach(item => {
        const usernameSpan = item.querySelector('span[style*="color:#667eea"]');
        if (usernameSpan && usernameSpan.textContent === replyToUsername) {
            const existingReply = item.querySelector('.reply-input-container');
            if (existingReply) existingReply.remove();
            
            replyInput.className = 'reply-input-container';
            item.appendChild(replyInput);
            
            const input = replyInput.querySelector('.reply-input');
            const submitBtn = replyInput.querySelector('.reply-submit-btn');
            
            submitBtn.onclick = () => replyComment(postId, commentId, input.value);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') replyComment(postId, commentId, input.value);
            });
            input.focus();
        }
    });
};

window.replyComment = async function(postId, commentId, content) {
    if (!content.trim()) {
        showToast('请输入回复内容', 'error');
        return;
    }
    
    try {
        // 直接往 comments 表插入回复
        const { data: parentComment } = await supabase
            .from('comments')
            .select('id, username')
            .eq('id', commentId)
            .single();
        
        if (!parentComment) {
            showToast('原评论不存在', 'error');
            return;
        }
        
        const { error } = await supabase
            .from('comments')
            .insert({
                post_id: postId,
                parent_id: commentId,
                user_id: currentUser.id,
                username: currentUser.username,
                user_avatar: currentUser.avatar,
                content: content.trim(),
                reply_to: parentComment.username
            });
        
        if (error) {
            console.error('回复失败:', error);
            showToast('回复失败', 'error');
            return;
        }
        
        // 移除回复输入框
        const replyContainer = document.querySelector('.reply-input-container');
        if (replyContainer) replyContainer.remove();
        
        await loadPosts();
        showToast('回复成功', 'success');
        
    } catch (error) {
        console.error('回复失败:', error);
        showToast('回复失败', 'error');
    }
};

// ==================== 用户主页功能 ====================
window.openUserProfile = async function(userId) {
    const modal = document.getElementById('user-profile-modal');
    if (!modal) return;
    
    window._currentProfileUserId = userId;
    modal.style.display = 'block';
    document.getElementById('profile-posts').innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载中...</p>';
    
    try {
        const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
        if (!user) {
            document.getElementById('profile-posts').innerHTML = '<p style="text-align:center;color:#999;padding:20px;">用户不存在</p>';
            return;
        }
        
        document.getElementById('profile-username').textContent = user.username + ' 的主页';
        document.getElementById('profile-avatar').src = user.avatar;
        document.getElementById('profile-name').textContent = user.username;
        document.getElementById('profile-id').textContent = 'ID: ' + user.id;
        
        const [followersRes, followingRes] = await Promise.all([
            supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', userId),
            supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', userId)
        ]);
        
        document.getElementById('profile-followers-count').textContent = followersRes.count || 0;
        document.getElementById('profile-following-count').textContent = followingRes.count || 0;
        
        const { count: postsCount } = await supabase.from('posts').select('*', { count: 'exact' }).eq('user_id', userId);
        document.getElementById('profile-posts-count').textContent = postsCount || 0;
        
        const actionsDiv = document.getElementById('profile-actions');
        if (currentUser && currentUser.id !== userId) {
            const { data: existingFollow } = await supabase
                .from('follows')
                .select('id')
                .eq('follower_id', currentUser.id)
                .eq('following_id', userId)
                .single();
            
            const isFollowing = !!existingFollow;
            actionsDiv.innerHTML = `
                <button onclick="toggleFollowUser('${safeAttr(userId)}')" 
                        style="padding:8px 24px;background:${isFollowing ? '#999' : '#667eea'};color:white;border:none;border-radius:20px;cursor:pointer;font-size:0.9rem;">
                    ${isFollowing ? '已关注' : '+ 关注'}
                </button>
            `;
        } else {
            actionsDiv.innerHTML = '';
        }
        
        const { data: userPosts } = await supabase
            .from('posts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);
        
        const postsDiv = document.getElementById('profile-posts');
        postsDiv.innerHTML = '';
        
        if (!userPosts || userPosts.length === 0) {
            postsDiv.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无帖子</p>';
            return;
        }
        
        userPosts.forEach(post => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:12px;border-bottom:1px solid #e0e0e0;cursor:pointer;';
            div.innerHTML = `
                <div style="color:#333;margin-bottom:5px;">${escapeHtml(post.content || '').substring(0, 80)}${post.content?.length > 80 ? '...' : ''}</div>
                <div style="color:#999;font-size:0.8rem;">${new Date(post.created_at).toLocaleString('zh-CN')} · ${post.views || 0} 浏览 · ${post.likes || 0} 赞</div>
            `;
            div.onclick = () => {
                modal.style.display = 'none';
                const postEl = document.querySelector('[data-id="' + post.id + '"]');
                if (postEl) postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
            postsDiv.appendChild(div);
        });
        
    } catch (error) {
        console.error('加载用户主页失败:', error);
        document.getElementById('profile-posts').innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载失败</p>';
    }
};

window.closeUserProfile = function() {
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.style.display = 'none';
};

// 显示用户主页的标签页
let _profileFavDebounce = null;
window.showProfileTab = function(tab, el) {
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    
    if (tab === 'posts') {
        document.getElementById('profile-posts').style.display = 'block';
        document.getElementById('profile-favorites').style.display = 'none';
    } else if (tab === 'favorites') {
        document.getElementById('profile-posts').style.display = 'none';
        document.getElementById('profile-favorites').style.display = 'block';
        const userId = window._currentProfileUserId;
        if (userId) loadUserFavorites(userId);
    }
};

// 加载用户收藏
let _favLoadingUserId = null;
async function loadUserFavorites(userId) {
    const container = document.getElementById('profile-favorites');
    // 防抖：如果已经在加载同一个人，直接跳过
    if (_favLoadingUserId === userId) return;
    _favLoadingUserId = userId;
    
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载中...</p>';
    
    try {
        const { data: favorites } = await supabase
            .from('favorites')
            .select('post_id, posts(*)')
            .eq('user_id', userId);
        
        // 如果在等待期间切换了用户，丢弃结果
        if (_favLoadingUserId !== userId) return;
        
        if (!favorites || favorites.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无收藏</p>';
            return;
        }
        
        container.innerHTML = '';
        favorites.forEach(fav => {
            if (fav.posts) {
                const div = document.createElement('div');
                div.style.cssText = 'padding:12px;border-bottom:1px solid #e0e0e0;cursor:pointer;';
                div.innerHTML = `
                    <div style="color:#333;margin-bottom:5px;">${escapeHtml(fav.posts.content || '').substring(0, 80)}${fav.posts.content?.length > 80 ? '...' : ''}</div>
                    <div style="color:#999;font-size:0.8rem;">${new Date(fav.posts.created_at).toLocaleString('zh-CN')} · ${fav.posts.views || 0} 浏览</div>
                `;
                div.onclick = () => {
                    document.getElementById('user-profile-modal').style.display = 'none';
                    const postEl = document.querySelector('[data-id="' + fav.posts.id + '"]');
                    if (postEl) postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                };
                container.appendChild(div);
            }
        });
    } catch (error) {
        console.error('加载收藏失败:', error);
        if (_favLoadingUserId === userId)
            container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载失败</p>';
    } finally {
        if (_favLoadingUserId === userId) _favLoadingUserId = null;
    }
}

// 点击模态框外部关闭
document.addEventListener('click', function(e) {
    const profileModal = document.getElementById('user-profile-modal');
    if (profileModal && e.target === profileModal) {
        profileModal.style.display = 'none';
    }
});

window.toggleFollowUser = async function(userId) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return;
    }
    
    try {
        const { data: existing } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', currentUser.id)
            .eq('following_id', userId)
            .single();
        
        if (existing) {
            await supabase.from('follows').delete().eq('id', existing.id);
            showToast('已取消关注', 'success');
        } else {
            await supabase.from('follows').insert({
                follower_id: currentUser.id,
                following_id: userId
            });
            showToast('关注成功', 'success');
        }
        
        openUserProfile(userId);
        
    } catch (error) {
        console.error('关注操作失败:', error);
        showToast('操作失败', 'error');
    }
};

// ==================== 通知系统 ====================
let notifications = [];
let lastNotificationCount = 0;

// 获取最后查看通知的时间
function getLastReadTime() {
    if (!currentUser) return new Date(0);
    const stored = localStorage.getItem(`notifications_read_${currentUser.id}`);
    return stored ? new Date(stored) : new Date(0);
}

// 设置最后查看通知的时间
function setLastReadTime() {
    if (!currentUser) return;
    localStorage.setItem(`notifications_read_${currentUser.id}`, new Date().toISOString());
}

window.showNotificationModal = function() {
    document.getElementById('notification-modal').style.display = 'block';
    loadNotifications();
    // 标记已读并隐藏红点
    setLastReadTime();
    const badge = document.getElementById('notification-badge');
    if (badge) badge.style.display = 'none';
};

window.closeNotificationModal = function() {
    document.getElementById('notification-modal').style.display = 'none';
};

async function loadNotifications() {
    if (!currentUser) return;
    
    const container = document.getElementById('notification-list');
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载中...</p>';
    
    try {
        // 先获取当前用户的帖子 ID（用于过滤）
        const { data: myPosts } = await supabase
            .from('posts').select('id')
            .eq('user_id', currentUser.id);
        
        const myPostIds = (myPosts || []).map(p => p.id);
        
        // 并行获取点赞、评论、关注
        const [likesRes, commentsRes, followsRes] = await Promise.all([
            myPostIds.length > 0
                ? supabase.from('likes').select('*, users(*)').in('post_id', myPostIds).order('created_at', { ascending: false }).limit(20)
                : Promise.resolve({ data: [] }),
            myPostIds.length > 0
                ? supabase.from('comments').select('*, posts(*), users(*)').in('post_id', myPostIds).order('created_at', { ascending: false }).limit(20)
                : Promise.resolve({ data: [] }),
            supabase.from('follows').select('*').eq('following_id', currentUser.id).order('created_at', { ascending: false }).limit(20)
        ]);
        
        notifications = [];
        
        // 点赞通知
        (likesRes.data || []).forEach(like => {
            if (like.users && like.users.id !== currentUser.id) {
                const post = myPosts.find(p => p.id === like.post_id);
                notifications.push({ type: 'like', user: like.users, post: { id: like.post_id, content: post ? post.content : '' }, time: like.created_at });
            }
        });
        
        // 评论通知
        (commentsRes.data || []).forEach(comment => {
            if (comment.users && comment.users.id !== currentUser.id) {
                notifications.push({ type: 'comment', user: comment.users, post: comment.posts, content: comment.content, time: comment.created_at });
            }
        });
        
        // 关注通知
        if (followsRes.data && followsRes.data.length > 0) {
            const userIds = followsRes.data.map(f => f.follower_id);
            const { data: followUsers } = await supabase.from('users').select('*').in('id', userIds);
            if (followUsers) {
                followsRes.data.forEach((follow, i) => {
                    const user = followUsers.find(u => u.id === follow.follower_id);
                    if (user) notifications.push({ type: 'follow', user, time: follow.created_at });
                });
            }
        }
        
        // 按时间排序并渲染
        notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
        renderNotifications();
        
    } catch (error) {
        console.error('加载通知失败:', error);
        container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载失败</p>';
    }
}

function renderNotifications() {
    const container = document.getElementById('notification-list');
    
    if (notifications.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无通知</p>';
        return;
    }
    
    container.innerHTML = '';
    notifications.forEach(n => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:12px;border-bottom:1px solid #e0e0e0;cursor:pointer;display:flex;align-items:center;gap:10px;';
        
        if (n.type === 'like') {
            div.innerHTML = `
                <img src="${n.user.avatar}" style="width:36px;height:36px;border-radius:50%;">
                <div style="flex:1;">
                    <div><span style="font-weight:600;color:#667eea;">${n.user.username}</span> 赞了你的帖子</div>
                    <div style="color:#999;font-size:0.8rem;">${new Date(n.time).toLocaleString('zh-CN')}</div>
                </div>
            `;
            div.onclick = () => { closeNotificationModal(); scrollToPost(n.post.id); };
        } else if (n.type === 'comment') {
            div.innerHTML = `
                <img src="${n.user.avatar}" style="width:36px;height:36px;border-radius:50%;">
                <div style="flex:1;">
                    <div><span style="font-weight:600;color:#667eea;">${n.user.username}</span> 评论了你的帖子</div>
                    <div style="color:#666;font-size:0.85rem;">"${escapeHtml(n.content)}"</div>
                    <div style="color:#999;font-size:0.8rem;">${new Date(n.time).toLocaleString('zh-CN')}</div>
                </div>
            `;
            div.onclick = () => { closeNotificationModal(); scrollToPost(n.post.id); };
        } else if (n.type === 'follow') {
            div.innerHTML = `
                <img src="${n.user.avatar}" style="width:36px;height:36px;border-radius:50%;">
                <div style="flex:1;">
                    <div><span style="font-weight:600;color:#667eea;">${n.user.username}</span> 关注了你</div>
                    <div style="color:#999;font-size:0.8rem;">${new Date(n.time).toLocaleString('zh-CN')}</div>
                </div>
            `;
            div.onclick = () => { closeNotificationModal(); openUserProfile(n.user.id); };
        }
        
        container.appendChild(div);
    });
}

function scrollToPost(postId) {
    const postEl = document.querySelector('[data-id="' + postId + '"]');
    if (postEl) postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function checkNotificationCount() {
    if (!currentUser) return;
    
    try {
        const { data: myPosts } = await supabase
            .from('posts').select('id').eq('user_id', currentUser.id);
        const myPostIds = (myPosts || []).map(p => p.id);
        
        if (myPostIds.length === 0) {
            const badge = document.getElementById('notification-badge');
            if (badge) badge.style.display = 'none';
            return;
        }
        
        // 只查询上次查看时间之后的通知
        const lastRead = getLastReadTime().toISOString();
        
        const [{ count: likeCount }, { count: commentCount }, { count: followCount }] = await Promise.all([
            supabase.from('likes').select('id', { count: 'exact', head: true }).in('post_id', myPostIds).gt('created_at', lastRead),
            supabase.from('comments').select('id', { count: 'exact', head: true }).in('post_id', myPostIds).neq('user_id', currentUser.id).gt('created_at', lastRead),
            supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', currentUser.id).gt('created_at', lastRead)
        ]);
        
        const total = (likeCount || 0) + (commentCount || 0) + (followCount || 0);
        const badge = document.getElementById('notification-badge');
        if (badge) {
            if (total > 0) {
                badge.textContent = total > 9 ? '9+' : total;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('检查通知数失败:', e);
    }
}

// ==================== 实时通知订阅 ====================
let notificationSubscription = null;

function subscribeToNotifications() {
    if (!currentUser || notificationSubscription) return;
    
    // 获取我的帖子ID列表
    supabase.from('posts').select('id').eq('user_id', currentUser.id).then(({ data: myPosts }) => {
        const myPostIds = (myPosts || []).map(p => p.id);
        if (myPostIds.length === 0) return;
        
        // 订阅评论表 - 当有人评论我的帖子时实时通知
        notificationSubscription = supabase
            .channel('notifications')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'comments',
                filter: `post_id=in.(${myPostIds.join(',')})`
            }, (payload) => {
                // 过滤掉自己的评论
                if (payload.new.user_id !== currentUser.id) {
                    // 显示浏览器通知（如果用户允许）
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('心灵树洞', {
                            body: '有人评论了你的帖子',
                            icon: '🌳'
                        });
                    }
                    // 更新红点
                    checkNotificationCount();
                }
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'likes',
                filter: `post_id=in.(${myPostIds.join(',')})`
            }, (payload) => {
                if (payload.new.user_id !== currentUser.id) {
                    checkNotificationCount();
                }
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'follows',
                filter: `following_id=eq.${currentUser.id}`
            }, (payload) => {
                checkNotificationCount();
            })
            .subscribe();
        
        subscriptions.push(notificationSubscription);
    });
}

function unsubscribeFromNotifications() {
    if (notificationSubscription) {
        supabase.removeChannel(notificationSubscription);
        notificationSubscription = null;
    }
}

// ==================== 启动 ====================
// 注意：script.js 现在是普通 <script>（非 module），放在 body 底部
// 此时 DOM 已经解析完毕，DOMContentLoaded 可能已经触发
// 所以用 readyState 检查，避免错过事件
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
} else {
    // DOM 已就绪，直接执行
    onReady();
}

function onReady() {
    console.log('[琳琳调试] onReady() 被调用, readyState =', document.readyState);
    init();
    
    // 延迟设置无限滚动和下拉刷新
    setTimeout(() => {
        setupInfiniteScroll();
        setupPullRefresh();
    }, 1000);
    
    // 请求浏览器通知权限
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
