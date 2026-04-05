// 心灵树洞 - Supabase 版本
// 使用 Supabase 作为后端数据库和存储

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==================== Supabase 配置 ====================
const SUPABASE_URL = 'https://tgadmkpyufqnnciowydo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnYWRta3B5dWZxbm5jaW93eWRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTc3NDUsImV4cCI6MjA5MDc5Mzc0NX0.Vj7cyl0Yqj55ZM4-S66vZ3-uWh6MOfGeKBus706eJow';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== 全局状态 ====================
let posts = [];
let currentUser = null;
let currentImage = null;
let currentVideo = null;
let currentVoice = null;
let mediaRecorder = null;
let audioChunks = [];
let viewedPosts = new Set(); // 已浏览的帖子ID（基于用户）
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
    showLoading(true);
    
    try {
        // 检查本地存储的用户
        const savedUser = localStorage.getItem('treeholeUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
            // 验证用户是否还存在
            const { data } = await supabase.from('users').select('*').eq('id', currentUser.id).single();
            if (!data) {
                currentUser = null;
                localStorage.removeItem('treeholeUser');
            } else {
                currentUser = data;
            }
        }
        
        updateUserInfo();
        loadViewedPosts(); // 加载用户浏览记录
        await loadPosts();
        bindEvents();
        bindAuthEvents();
        setupRealtimeSubscription();
        
        // 初始化排行榜
        setTimeout(() => showRanking('likes'), 500);
        
    } catch (error) {
        console.error('初始化失败:', error);
        showToast('加载失败，请刷新页面', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 实时订阅 ====================
function setupRealtimeSubscription() {
    // 订阅帖子变化
    const postsChannel = supabase
        .channel('posts-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
            console.log('帖子变化:', payload.eventType);
            // 新帖子或帖子更新
            if (payload.eventType === 'INSERT') {
                // 新帖子
                showToast('有新的分享发布了！', 'info');
            }
            loadPosts();
        })
        .subscribe();
    
    // 订阅点赞变化
    const likesChannel = supabase
        .channel('likes-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => {
            console.log('点赞变化');
            loadPosts();
        })
        .subscribe();
    
    subscriptions.push(postsChannel, likesChannel);
    
    // 定时轮询（每30秒检查一次更新）
    window.pollingInterval = setInterval(async () => {
        // 只在页面可见时轮询
        if (document.visibilityState === 'visible') {
            try {
                const { data: latestPost } = await supabase
                    .from('posts')
                    .select('id, created_at')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                
                if (latestPost && posts.length > 0) {
                    const latestTime = new Date(latestPost.created_at).getTime();
                    const currentLatestTime = new Date(posts[0]?.created_at).getTime();
                    
                    if (latestTime > currentLatestTime) {
                        loadPosts();
                        showToast('有新内容更新', 'info');
                    }
                }
            } catch (e) {
                console.error('轮询失败:', e);
            }
        }
    }, 30000); // 30秒
    
    // 页面可见性变化时刷新
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // 页面重新可见时，检查更新
            loadPosts();
        }
    });
    
    // 窗口获得焦点时刷新
    window.addEventListener('focus', () => {
        loadPosts();
    });
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

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ==================== 事件绑定 ====================
function bindEvents() {
    // 使用可选链避免元素不存在时出错
    document.getElementById('post-button')?.addEventListener('click', handlePost);
    document.getElementById('image-upload')?.addEventListener('change', handleImageUpload);
    document.getElementById('video-upload')?.addEventListener('change', handleVideoUpload);
    document.getElementById('voice-record')?.addEventListener('click', toggleVoiceRecord);
    
    // 确保用户区域按钮在页面加载后立即绑定
    setTimeout(() => {
        document.getElementById('friends-btn')?.addEventListener('click', showFriendsModal);
        document.getElementById('settings-btn')?.addEventListener('click', showSettingsModal);
        document.getElementById('logout-btn')?.addEventListener('click', logout);
    }, 100);
}

function bindAuthEvents() {
    document.getElementById('login-btn').addEventListener('click', showAuthModal);
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', function() { this.closest('.modal').style.display = 'none'; });
    });
    window.addEventListener('click', e => {
        document.querySelectorAll('.modal').forEach(m => { if (e.target === m) m.style.display = 'none'; });
    });
    document.getElementById('submit-login').addEventListener('click', login);
    document.getElementById('submit-register').addEventListener('click', register);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('settings-btn').addEventListener('click', showSettingsModal);
    document.getElementById('friends-btn').addEventListener('click', showFriendsModal);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('avatar-upload').addEventListener('change', handleAvatarUpload);
    document.getElementById('add-friend-btn').addEventListener('click', addFriend);
    document.getElementById('send-message-btn').addEventListener('click', sendMessage);
    document.getElementById('chat-input').addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
    document.getElementById('friend-search').addEventListener('input', function() { searchFriends(this.value); });
}

// ==================== 用户认证 ====================
function showAuthModal() { document.getElementById('auth-modal').style.display = 'block'; }
function hideAuthModal() { document.getElementById('auth-modal').style.display = 'none'; }

window.switchAuthTab = function(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
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
    
    showLoading(true);
    
    // 添加超时保护
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('请求超时')), 15000)
    );
    
    try {
        const { data, error } = await Promise.race([
            supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .single(),
            timeoutPromise
        ]);
        
        if (error || !data) {
            showToast('用户名不存在', 'error');
            showLoading(false);
            return;
        }
        
        const storedPassword = localStorage.getItem(`pwd_${data.id}`);
        if (storedPassword && storedPassword !== password) {
            showToast('密码错误', 'error');
            showLoading(false);
            return;
        }
        
        currentUser = data;
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        updateUserInfo();
        hideAuthModal();
        showToast('登录成功', 'success');
        
    } catch (error) {
        console.error('登录失败:', error);
        showToast('登录失败，请检查网络', 'error');
    } finally {
        showLoading(false);
    }
}

async function register() {
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email')?.value.trim() || '';
    const password = document.getElementById('register-password').value.trim();
    const confirmPassword = document.getElementById('register-confirm-password').value.trim();
    
    if (!username || !password || !confirmPassword) {
        showToast('请填写所有字段', 'error');
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
    
    // 添加超时保护
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('请求超时')), 15000)
    );
    
    try {
        const userId = generateId();
        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff&size=128`;
        
        const { error } = await Promise.race([
            supabase
                .from('users')
                .insert({
                    id: userId,
                    username: username,
                    avatar: avatar,
                    email: email
                }),
            timeoutPromise
        ]);
        
        if (error) {
            if (error.code === '23505') {
                showToast('用户名已存在', 'error');
                showLoading(false);
                return;
            }
            showToast('注册失败: ' + error.message, 'error');
            showLoading(false);
            return;
        }
        
        // 存储密码到本地
        localStorage.setItem(`pwd_${userId}`, password);
        
        currentUser = { id: userId, username, avatar };
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        
        updateUserInfo();
        hideAuthModal();
        showToast('注册成功！您的用户ID: ' + userId, 'success');
        
    } catch (error) {
        console.error('注册失败:', error);
        showToast('注册失败，请检查网络', 'error');
    } finally {
        showLoading(false);
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('treeholeUser');
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
        if (file.size > 2 * 1024 * 1024) {
            showToast('图片不能超过2MB', 'error');
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
    
    showLoading(true);
    
    try {
        // 1. 更新用户表
        const { error: userError } = await supabase
            .from('users')
            .update({ username, avatar })
            .eq('id', currentUser.id);
        
        if (userError) {
            if (userError.code === '23505') {
                showToast('用户名已被占用', 'error');
            } else {
                showToast('保存失败', 'error');
            }
            return;
        }
        
        // 2. 同步更新所有帖子的用户名和头像
        const { data: userPosts } = await supabase
            .from('posts')
            .select('id')
            .eq('user_id', currentUser.id);
        
        if (userPosts && userPosts.length > 0) {
            // 批量更新帖子
            for (const post of userPosts) {
                await supabase
                    .from('posts')
                    .update({ username, user_avatar: avatar })
                    .eq('id', post.id);
            }
        }
        
        // 3. 更新本地用户信息
        currentUser.username = username;
        currentUser.avatar = avatar;
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        
        updateUserInfo();
        document.getElementById('settings-modal').style.display = 'none';
        showToast('设置保存成功，已同步更新所有帖子', 'success');
        
        // 4. 重新加载帖子
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
        const { data, error } = await supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        // 获取每条帖子的点赞数和评论数
        posts = await Promise.all(data.map(async (post) => {
            const [likesRes, commentsRes] = await Promise.all([
                supabase.from('likes').select('id', { count: 'exact' }).eq('post_id', post.id),
                supabase.from('comments').select('*').eq('post_id', post.id)
            ]);
            
            // 检查当前用户是否点赞
            let liked = false;
            if (currentUser) {
                const { data: likeData } = await supabase
                    .from('likes')
                    .select('id')
                    .eq('post_id', post.id)
                    .eq('user_id', currentUser.id)
                    .single();
                liked = !!likeData;
            }
            
            return {
                ...post,
                likes: likesRes.count || 0,
                liked,
                comments: commentsRes.data || []
            };
        }));
        
        renderPosts();
        
    } catch (error) {
        console.error('加载帖子失败:', error);
        showToast('加载失败', 'error');
    }
}

function renderPosts() {
    const container = document.getElementById('posts-container');
    container.innerHTML = '';
    
    if (posts.length === 0) {
        container.innerHTML = '<p class="no-posts" style="text-align:center;padding:40px;color:#666;">还没有分享，快来发布第一条吧！</p>';
        return;
    }
    
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
    
    const userHtml = `<div class="post-user" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <img src="${post.user_avatar}" style="width:30px;height:30px;border-radius:50%;">
        <span style="font-weight:600;color:#667eea;">${post.username}</span>
    </div>`;
    
    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
        commentsHtml = `<div class="post-comments"><h4>评论 (${post.comments.length})</h4><ul class="comments-list">`;
        post.comments.slice(-5).forEach(c => {
            commentsHtml += `<li class="comment-item">
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                    <img src="${c.user_avatar}" style="width:20px;height:20px;border-radius:50%;">
                    <span style="font-weight:600;font-size:0.8rem;color:#667eea;">${c.username}</span>
                </div>
                <span class="comment-text">${escapeHtml(c.content)}</span>
                <span class="comment-time">${new Date(c.created_at).toLocaleString('zh-CN')}</span>
            </li>`;
        });
        commentsHtml += '</ul></div>';
    }
    
    div.innerHTML = `
        ${userHtml}
        <div class="post-item-content">${escapeHtml(post.content || '')}</div>
        ${media}
        <div class="post-item-meta">
            <span class="post-time">${new Date(post.created_at).toLocaleString('zh-CN')} · ${post.views || 0} 浏览</span>
            <div class="post-item-actions">
                <button class="action-btn like-btn ${post.liked ? 'liked' : ''}" data-id="${post.id}">
                    <i class="fas fa-heart"></i> ${post.likes}
                </button>
                <button class="action-btn delete-btn" data-id="${post.id}"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        ${commentsHtml}
        <div class="comment-form">
            <input type="text" class="comment-input" placeholder="写下你的评论..." data-id="${post.id}">
            <button class="comment-btn" data-id="${post.id}"><i class="fas fa-paper-plane"></i></button>
        </div>`;
    
    div.querySelector('.like-btn')?.addEventListener('click', () => toggleLike(post.id));
    div.querySelector('.delete-btn')?.addEventListener('click', () => deletePost(post.id));
    div.querySelector('.comment-btn')?.addEventListener('click', () => addComment(post.id));
    
    return div;
}

async function incrementViewCount(postId) {
    try {
        const post = posts.find(p => p.id === postId);
        if (post) {
            const newViews = (post.views || 0) + 1;
            await supabase
                .from('posts')
                .update({ views: newViews })
                .eq('id', postId);
            // 更新本地数据
            post.views = newViews;
            // 保存浏览记录
            saveViewedPosts();
        }
    } catch (error) {
        console.error('浏览量更新失败:', error);
    }
}

// ==================== 发布 ====================
async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) {
            showToast('图片不能超过5MB', 'error');
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
        if (file.size > 20 * 1024 * 1024) {
            showToast('视频不能超过20MB', 'error');
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
    
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    // 敏感词检测
    if (containsSensitiveWords(text)) {
        showToast('内容包含敏感词，请修改后再发布', 'error');
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
        
        // 过滤敏感词后再存储
        const filteredText = filterSensitiveWords(text);
        
        const { error } = await supabase
            .from('posts')
            .insert({
                id: postId,
                user_id: currentUser.id,
                username: currentUser.username,
                user_avatar: currentUser.avatar,
                content: filteredText,
                image_url: imageUrl,
                video_url: videoUrl,
                voice_url: voiceUrl
            });
        
        if (error) throw error;
        
        // 清空表单和草稿
        document.getElementById('post-text').value = '';
        localStorage.removeItem('treehole_draft');
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
async function toggleLike(postId) {
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

// ==================== 排行榜 ====================
window.showRanking = function(type) {
    document.querySelectorAll('.ranking-tab').forEach(t => t.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
    
    let sorted = [...posts];
    if (type === 'likes') sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    else if (type === 'views') sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (type === 'comments') sorted.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
    
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
                        <button class="action-btn like-btn ${post.liked ? 'liked' : ''}" onclick="toggleLike('${post.id}')">
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

window.switchFriendsTab = function(tab) {
    document.querySelectorAll('.friends-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
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
                        <button class="upload-btn" onclick="removeFriend('${friend.id}')" style="padding:5px 10px;">删除</button>
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
                    <button class="upload-btn" onclick="removeFriend('${friend.id}')" style="padding:5px 10px;">删除</button>
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
        img.style.transform = 'scale(1)';
        img.style.cursor = 'zoom-in';
    } else {
        img.classList.add('zoomed');
        img.style.transform = 'scale(2)';
        img.style.cursor = 'zoom-out';
    }
};

// ==================== 话题标签解析 ====================
function parseContent(text) {
    if (!text) return '';
    
    // 转义 HTML
    let result = escapeHtml(text);
    
    // 解析话题标签 #话题
    result = result.replace(/#(\S+)/g, '<span class="topic-tag" onclick="searchTopic(\'$1\')">#$1</span>');
    
    // 解析 @提及
    result = result.replace(/@(\S+)/g, '<span class="mention-tag" onclick="mentionUser(\'$1\')">@$1</span>');
    
    // 解析链接
    result = result.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#667eea;">$1</a>');
    
    return result;
}

// 搜索话题
window.searchTopic = function(topic) {
    showToast(`搜索话题: #${topic}`, 'info');
    // TODO: 实现话题搜索
};

// 提及用户
window.mentionUser = function(username) {
    showToast(`提及用户: @${username}`, 'info');
    // TODO: 实现用户提及
};

// ==================== 无限滚动 ====================
let currentPage = 0;
const pageSize = 10;
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
            .range(currentPage * pageSize + pageSize, (currentPage + 1) * pageSize + pageSize);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            currentPage++;
            
            // 获取点赞和评论
            const newPosts = await Promise.all(data.map(async (post) => {
                const [likesRes, commentsRes] = await Promise.all([
                    supabase.from('likes').select('id', { count: 'exact' }).eq('post_id', post.id),
                    supabase.from('comments').select('*').eq('post_id', post.id)
                ]);
                
                let liked = false;
                if (currentUser) {
                    const { data: likeData } = await supabase
                        .from('likes')
                        .select('id')
                        .eq('post_id', post.id)
                        .eq('user_id', currentUser.id)
                        .single();
                    liked = !!likeData;
                }
                
                return {
                    ...post,
                    likes: likesRes.count || 0,
                    liked,
                    comments: commentsRes.data || []
                };
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

// ==================== 修改 createPostElement 使用话题解析 ====================
const originalCreatePostElement = createPostElement;
createPostElement = function(post) {
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
    
    // 用户信息（可点击进入主页）
    const userHtml = `<div class="post-user" onclick="openUserProfile('${post.user_id}')" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer;">
        <img src="${post.user_avatar}" style="width:30px;height:30px;border-radius:50%;">
        <span style="font-weight:600;color:#667eea;">${post.username}</span>
    </div>`;
    
    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
        // 按当前排序方式显示评论
        const sortedComments = [...post.comments].sort((a, b) => {
            if (commentSortType === 'hot') return (b.likes || 0) - (a.likes || 0);
            return new Date(b.created_at) - new Date(a.created_at);
        });
        
        commentsHtml = `<div class="post-comments">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h4>评论 (${post.comments.length})</h4>
                <button onclick="toggleCommentSort('${post.id}')" style="background:none;border:none;color:#667eea;cursor:pointer;font-size:0.85rem;">
                    ${commentSortType === 'hot' ? '🔥 最热' : '🕐 最新'}
                </button>
            </div>
            <ul class="comments-list">`;
        sortedComments.slice(-5).forEach(c => {
            const commentLiked = currentUser && c.likedBy?.includes(currentUser.id);
            commentsHtml += `<li class="comment-item">
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;cursor:pointer;" onclick="openUserProfile('${c.user_id}')">
                    <img src="${c.user_avatar}" style="width:20px;height:20px;border-radius:50%;">
                    <span style="font-weight:600;font-size:0.8rem;color:#667eea;">${c.username}</span>
                </div>
                <span class="comment-text">${parseContent(c.content)}</span>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;">
                    <span class="comment-time">${new Date(c.created_at).toLocaleString('zh-CN')}</span>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="action-btn" onclick="showReplyInput('${post.id}', '${c.id}', '${c.username}')" style="font-size:0.75rem;padding:2px 8px;">
                            <i class="fas fa-reply"></i> 回复
                        </button>
                        <button class="action-btn ${commentLiked ? 'liked' : ''}" onclick="toggleCommentLike('${post.id}', '${c.id}')" style="font-size:0.75rem;padding:2px 8px;">
                            <i class="fas fa-heart"></i> ${c.likes || 0}
                        </button>
                    </div>
                </div>
            </li>`;
        });
        commentsHtml += '</ul></div>';
    }
    
    // 使用话题解析和敏感词过滤
    const filteredContent = filterSensitiveWords(post.content);
    const parsedContent = parseContent(filteredContent);
    
    // 检查是否已收藏
    const isFavorited = currentUser?.favorites?.includes(post.id);
    // 检查是否是自己的帖子
    const isOwnPost = currentUser && post.user_id === currentUser.id;
    
    div.innerHTML = `
        ${userHtml}
        <div class="post-item-content">${parsedContent}</div>
        ${media}
        <div class="post-item-meta">
            <span class="post-time">${new Date(post.created_at).toLocaleString('zh-CN')} · ${post.views || 0} 浏览</span>
            <div class="post-item-actions">
                <button class="action-btn like-btn ${post.liked ? 'liked' : ''}" data-id="${post.id}">
                    <i class="fas fa-heart"></i> ${post.likes}
                </button>
                <button class="action-btn favorite-btn ${isFavorited ? 'liked' : ''}" onclick="toggleFavorite('${post.id}')">
                    <i class="fas fa-bookmark"></i>
                </button>
                <button class="action-btn copy-btn" onclick="copyPostContent('${escapeHtml(post.content || '').replace(/'/g, "\\'")}')" title="复制内容">
                    <i class="fas fa-copy"></i>
                </button>
                <button class="action-btn share-btn" onclick="sharePost('${post.id}')">
                    <i class="fas fa-share-alt"></i>
                </button>
                ${isOwnPost ? `<button class="action-btn edit-btn" onclick="editPost('${post.id}')"><i class="fas fa-edit"></i></button>` : ''}
                ${isOwnPost ? `<button class="action-btn delete-btn" data-id="${post.id}"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </div>
        ${commentsHtml}
        <div class="comment-form">
            <input type="text" class="comment-input" placeholder="写下你的评论..." data-id="${post.id}">
            <button class="comment-btn" data-id="${post.id}"><i class="fas fa-paper-plane"></i></button>
        </div>`;
    
    div.querySelector('.like-btn')?.addEventListener('click', () => toggleLike(post.id));
    div.querySelector('.delete-btn')?.addEventListener('click', () => deletePost(post.id));
    div.querySelector('.comment-btn')?.addEventListener('click', () => addComment(post.id));
    
    return div;
};

// ==================== 隐藏骨架屏 ====================
function hideSkeleton() {
    const skeletonContainer = document.getElementById('skeleton-container');
    if (skeletonContainer) {
        skeletonContainer.style.display = 'none';
    }
}

// ==================== 草稿自动保存 ====================
let draftSaveTimeout = null;

function setupDraftAutoSave() {
    const postText = document.getElementById('post-text');
    if (!postText) return;
    
    // 加载草稿
    const savedDraft = localStorage.getItem('treehole_draft');
    if (savedDraft) {
        postText.value = savedDraft;
    }
    
    // 输入时自动保存（防抖）
    postText.addEventListener('input', () => {
        clearTimeout(draftSaveTimeout);
        draftSaveTimeout = setTimeout(() => {
            const content = postText.value.trim();
            if (content) {
                localStorage.setItem('treehole_draft', content);
            } else {
                localStorage.removeItem('treehole_draft');
            }
        }, 500);
    });
    
    // 发布成功后清除草稿
    const originalHandlePost = handlePost;
    handlePost = async function() {
        await originalHandlePost();
        localStorage.removeItem('treehole_draft');
    };
}

// ==================== 图片预览增强 ====================
let imageViewer = null;

function setupImageViewer() {
    // 创建图片查看器
    imageViewer = document.createElement('div');
    imageViewer.id = 'image-viewer';
    imageViewer.innerHTML = `
        <div class="image-viewer-overlay" onclick="closeImageViewer()"></div>
        <div class="image-viewer-content">
            <img id="viewer-image" src="" alt="预览">
            <button class="image-viewer-close" onclick="closeImageViewer()">
                <i class="fas fa-times"></i>
            </button>
            <div class="image-viewer-actions">
                <button onclick="zoomImage(1.2)"><i class="fas fa-search-plus"></i></button>
                <button onclick="zoomImage(0.8)"><i class="fas fa-search-minus"></i></button>
                <button onclick="resetImageZoom()"><i class="fas fa-expand"></i></button>
            </div>
        </div>
    `;
    imageViewer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        display: none;
    `;
    document.body.appendChild(imageViewer);
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .image-viewer-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
        }
        .image-viewer-content {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #viewer-image {
            max-width: 90%;
            max-height: 90%;
            transition: transform 0.3s ease;
        }
        .image-viewer-close {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: rgba(255,255,255,0.2);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 1.5rem;
            transition: all 0.3s ease;
        }
        .image-viewer-close:hover {
            background: rgba(255,255,255,0.3);
            transform: scale(1.1);
        }
        .image-viewer-actions {
            position: absolute;
            bottom: 30px;
            display: flex;
            gap: 15px;
        }
        .image-viewer-actions button {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: rgba(255,255,255,0.2);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 1.2rem;
            transition: all 0.3s ease;
        }
        .image-viewer-actions button:hover {
            background: rgba(255,255,255,0.3);
            transform: scale(1.1);
        }
    `;
    document.head.appendChild(style);
}

window.openImageViewer = function(imgSrc) {
    if (!imageViewer) setupImageViewer();
    const img = document.getElementById('viewer-image');
    img.src = imgSrc;
    img.style.transform = 'scale(1)';
    imageViewer.style.display = 'block';
    document.body.style.overflow = 'hidden';
};

window.closeImageViewer = function() {
    if (imageViewer) {
        imageViewer.style.display = 'none';
        document.body.style.overflow = '';
    }
};

window.zoomImage = function(scale) {
    const img = document.getElementById('viewer-image');
    const currentScale = parseFloat(img.dataset.scale || 1);
    const newScale = Math.max(0.5, Math.min(5, currentScale * scale));
    img.style.transform = `scale(${newScale})`;
    img.dataset.scale = newScale;
};

window.resetImageZoom = function() {
    const img = document.getElementById('viewer-image');
    img.style.transform = 'scale(1)';
    img.dataset.scale = 1;
};

// 覆盖原来的 toggleImageZoom
window.toggleImageZoom = function(img) {
    openImageViewer(img.src);
};

// ==================== 搜索功能 ====================
let searchModal = null;

function setupSearch() {
    // 创建搜索模态框
    searchModal = document.createElement('div');
    searchModal.id = 'search-modal';
    searchModal.className = 'modal';
    searchModal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>🔍 搜索</h3>
                <span class="close-btn" onclick="closeSearchModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <input type="text" id="search-input" placeholder="搜索帖子内容、话题或用户..." 
                           style="width:100%;padding:12px 15px;border:2px solid #e0e0e0;border-radius:25px;font-size:1rem;">
                </div>
                <div id="search-results" style="max-height: 400px; overflow-y: auto;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(searchModal);
    
    // 搜索输入事件
    const searchInput = document.getElementById('search-input');
    let searchTimeout = null;
    
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(e.target.value.trim());
        }, 300);
    });
    
    // ESC 关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSearchModal();
    });
}

window.openSearchModal = function() {
    if (!searchModal) setupSearch();
    searchModal.style.display = 'block';
    document.getElementById('search-input')?.focus();
};

window.closeSearchModal = function() {
    if (searchModal) searchModal.style.display = 'none';
};

async function performSearch(keyword) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    if (!keyword) {
        resultsContainer.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">输入关键词开始搜索</p>';
        return;
    }
    
    resultsContainer.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">搜索中...</p>';
    
    try {
        // 搜索帖子
        const { data: postsData, error } = await supabase
            .from('posts')
            .select('*')
            .or(`content.ilike.%${keyword}%,username.ilike.%${keyword}%`)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        
        resultsContainer.innerHTML = '';
        
        if (!postsData || postsData.length === 0) {
            resultsContainer.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">未找到相关内容</p>';
            return;
        }
        
        postsData.forEach(post => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.style.cssText = 'padding:15px;border-bottom:1px solid #e0e0e0;cursor:pointer;transition:background 0.3s ease;';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                    <img src="${post.user_avatar}" style="width:30px;height:30px;border-radius:50%;">
                    <span style="font-weight:600;color:#667eea;">${post.username}</span>
                </div>
                <div style="color:#333;font-size:0.9rem;">${escapeHtml(post.content || '').substring(0, 100)}...</div>
                <div style="color:#999;font-size:0.8rem;margin-top:5px;">${new Date(post.created_at).toLocaleString('zh-CN')}</div>
            `;
            div.addEventListener('click', () => {
                closeSearchModal();
                // 滚动到该帖子
                const postElement = document.querySelector(`[data-id="${post.id}"]`);
                if (postElement) {
                    postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    postElement.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.5)';
                    setTimeout(() => {
                        postElement.style.boxShadow = '';
                    }, 2000);
                }
            });
            resultsContainer.appendChild(div);
        });
        
    } catch (error) {
        console.error('搜索失败:', error);
        resultsContainer.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">搜索失败，请重试</p>';
    }
}

// ==================== 热门话题 ====================
async function getHotTopics() {
    const topics = {};
    
    posts.forEach(post => {
        if (!post.content) return;
        const matches = post.content.match(/#(\S+)/g);
        if (matches) {
            matches.forEach(tag => {
                const topic = tag.substring(1);
                topics[topic] = (topics[topic] || 0) + 1;
            });
        }
    });
    
    // 排序并返回前10个
    return Object.entries(topics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
}

function setupHotTopics() {
    // 在排行榜区域下方添加热门话题
    const rankingSection = document.querySelector('.content-section:nth-child(2)');
    if (!rankingSection) return;
    
    const topicsSection = document.createElement('section');
    topicsSection.className = 'content-section';
    topicsSection.innerHTML = `
        <h2>🔥 热门话题</h2>
        <div id="hot-topics-container" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:30px;"></div>
    `;
    rankingSection.after(topicsSection);
    
    // 更新热门话题
    updateHotTopics();
}

async function updateHotTopics() {
    const container = document.getElementById('hot-topics-container');
    if (!container) return;
    
    const topics = await getHotTopics();
    
    if (topics.length === 0) {
        container.innerHTML = '<p style="color:#999;">暂无热门话题</p>';
        return;
    }
    
    container.innerHTML = topics.map(([topic, count]) => `
        <span class="topic-tag" onclick="searchTopic('${topic}')" 
              style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;padding:8px 16px;border-radius:20px;cursor:pointer;font-size:0.9rem;transition:transform 0.3s ease;">
            #${topic} <span style="opacity:0.8">(${count})</span>
        </span>
    `).join('');
}

// ==================== 消息通知 ====================
let notificationBadge = null;

function setupNotifications() {
    // 在好友按钮旁边添加通知按钮
    const userInfo = document.getElementById('user-info');
    if (!userInfo) return;
    
    const notifBtn = document.createElement('button');
    notifBtn.id = 'notification-btn';
    notifBtn.className = 'upload-btn';
    notifBtn.style.cssText = 'padding:5px 10px;position:relative;';
    notifBtn.innerHTML = `<i class="fas fa-bell"></i><span id="notif-badge" style="display:none;position:absolute;top:-5px;right:-5px;background:#ff6b6b;color:white;font-size:0.7rem;padding:2px 6px;border-radius:10px;">0</span>`;
    notifBtn.onclick = showNotifications;
    
    const friendsBtn = document.getElementById('friends-btn');
    if (friendsBtn) {
        friendsBtn.before(notifBtn);
    }
}

function showUnreadCount(count) {
    const badge = document.getElementById('notif-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

window.showNotifications = function() {
    showToast('通知功能开发中...', 'info');
};

// 通知用户
function notifyUser(type, data) {
    let message = '';
    switch (type) {
        case 'like':
            message = `${data.username} 赞了你的帖子`;
            break;
        case 'comment':
            message = `${data.username} 评论了你的帖子`;
            break;
        case 'follow':
            message = `${data.username} 关注了你`;
            break;
    }
    
    if (message) {
        showToast(message, 'info');
    }
}

// ==================== 启动 ====================
window.addEventListener('DOMContentLoaded', () => {
    init();
    
    // 延迟设置各种功能
    setTimeout(() => {
        setupInfiniteScroll();
        setupPullRefresh();
        hideSkeleton();
        setupDraftAutoSave();
        setupImageViewer();
        setupSearch();
        setupHotTopics();
        setupNotifications();
        setupUserProfile();
        setupShare();
        setupKeyboardShortcuts();
        setupCharCounter();
        setupDoubleTapLike();
        setupLongPressSave();
        setupAnonymousToggle();
        setupFavoritesPage();
        setupLikeAnimation();
    }, 1000);
});

// 添加搜索快捷键
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearchModal();
    }
});

// ==================== 敏感词过滤 ====================
const sensitiveWords = [
    '傻逼', '煞笔', '沙比', 'sb', 'SB', 'Sb', 'sB',
    '操你', '草你', '艹你', '操蛋',
    '妈的', '他妈', 'TMD', 'tmd',
    '垃圾', '废物', '滚蛋', '滚开',
    '去死', '死全家', '不得好死'
];

function filterSensitiveWords(text) {
    if (!text) return text;
    
    let filtered = text;
    sensitiveWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filtered = filtered.replace(regex, '*'.repeat(word.length));
    });
    
    return filtered;
}

// 检查是否包含敏感词
function containsSensitiveWords(text) {
    if (!text) return false;
    
    const lowerText = text.toLowerCase();
    return sensitiveWords.some(word => lowerText.includes(word.toLowerCase()));
}

// ==================== 用户个人主页 ====================
let userProfileModal = null;

function setupUserProfile() {
    // 创建用户主页模态框
    userProfileModal = document.createElement('div');
    userProfileModal.id = 'user-profile-modal';
    userProfileModal.className = 'modal';
    userProfileModal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3 id="profile-username">用户主页</h3>
                <span class="close-btn" onclick="closeUserProfile()">&times;</span>
            </div>
            <div class="modal-body">
                <div id="profile-info" style="display:flex;align-items:center;gap:20px;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #e0e0e0;">
                    <img id="profile-avatar" src="" style="width:80px;height:80px;border-radius:50%;border:3px solid #667eea;">
                    <div>
                        <div id="profile-name" style="font-size:1.5rem;font-weight:bold;color:#333;"></div>
                        <div id="profile-id" style="color:#999;font-size:0.9rem;margin-top:5px;"></div>
                        <div id="profile-stats" style="display:flex;gap:20px;margin-top:10px;color:#666;">
                            <span><strong id="profile-posts-count">0</strong> 帖子</span>
                            <span><strong id="profile-likes-count">0</strong> 获赞</span>
                        </div>
                    </div>
                </div>
                <div class="profile-tabs" style="display:flex;gap:10px;margin-bottom:20px;">
                    <button class="profile-tab active" onclick="showProfileTab('posts')">发布的帖子</button>
                    <button class="profile-tab" onclick="showProfileTab('likes')">点赞的帖子</button>
                </div>
                <div id="profile-posts" style="max-height: 400px; overflow-y: auto;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(userProfileModal);
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .profile-tab {
            padding: 8px 20px;
            background: #f8f9fa;
            border: 2px solid #e0e0e0;
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .profile-tab:hover {
            border-color: #667eea;
        }
        .profile-tab.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-color: #667eea;
        }
        .profile-post-item {
            padding: 15px;
            border-bottom: 1px solid #e0e0e0;
            cursor: pointer;
            transition: background 0.3s ease;
        }
        .profile-post-item:hover {
            background: #f8f9fa;
        }
    `;
    document.head.appendChild(style);
}

window.closeUserProfile = function() {
    if (userProfileModal) {
        userProfileModal.style.display = 'none';
    }
};

let currentProfileUserId = null;

window.showProfileTab = function(tab) {
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    if (tab === 'posts') {
        loadProfilePosts(currentProfileUserId);
    } else if (tab === 'likes') {
        loadProfileLikes(currentProfileUserId);
    }
};

async function loadProfilePosts(userId) {
    currentProfileUserId = userId;
    const container = document.getElementById('profile-posts');
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载中...</p>';
    
    try {
        const { data } = await supabase
            .from('posts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);
        
        container.innerHTML = '';
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无帖子</p>';
            return;
        }
        
        data.forEach(post => {
            const div = document.createElement('div');
            div.className = 'profile-post-item';
            div.innerHTML = `
                <div style="color:#333;margin-bottom:8px;">${escapeHtml(post.content || '').substring(0, 150)}${post.content?.length > 150 ? '...' : ''}</div>
                <div style="color:#999;font-size:0.85rem;">${new Date(post.created_at).toLocaleString('zh-CN')} · ${post.views || 0} 浏览</div>
            `;
            container.appendChild(div);
        });
        
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载失败</p>';
    }
}

async function loadProfileLikes(userId) {
    const container = document.getElementById('profile-posts');
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载中...</p>';
    
    try {
        // 获取用户点赞的帖子
        const { data: likes } = await supabase
            .from('likes')
            .select('post_id')
            .eq('user_id', userId);
        
        if (!likes || likes.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无点赞的帖子</p>';
            return;
        }
        
        const postIds = likes.map(l => l.post_id);
        const { data } = await supabase
            .from('posts')
            .select('*')
            .in('id', postIds)
            .order('created_at', { ascending: false });
        
        container.innerHTML = '';
        
        data?.forEach(post => {
            const div = document.createElement('div');
            div.className = 'profile-post-item';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                    <img src="${post.user_avatar}" style="width:25px;height:25px;border-radius:50%;">
                    <span style="color:#667eea;font-weight:600;">${post.username}</span>
                </div>
                <div style="color:#333;">${escapeHtml(post.content || '').substring(0, 150)}${post.content?.length > 150 ? '...' : ''}</div>
                <div style="color:#999;font-size:0.85rem;margin-top:5px;">${new Date(post.created_at).toLocaleString('zh-CN')}</div>
            `;
            container.appendChild(div);
        });
        
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载失败</p>';
    }
}

// ==================== 帖子分享 ====================
function setupShare() {
    // 添加分享样式
    const style = document.createElement('style');
    style.textContent = `
        .share-menu {
            position: absolute;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            padding: 10px;
            z-index: 100;
            display: none;
        }
        .share-menu.show {
            display: block;
        }
        .share-menu-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 15px;
            cursor: pointer;
            border-radius: 5px;
            transition: background 0.3s ease;
        }
        .share-menu-item:hover {
            background: #f8f9fa;
        }
    `;
    document.head.appendChild(style);
}

window.sharePost = function(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    const shareUrl = `${window.location.origin}${window.location.pathname}#post-${postId}`;
    
    // 创建分享菜单
    const menu = document.createElement('div');
    menu.className = 'share-menu show';
    menu.innerHTML = `
        <div class="share-menu-item" onclick="copyShareLink('${shareUrl}')">
            <i class="fas fa-link"></i> 复制链接
        </div>
        <div class="share-menu-item" onclick="shareToWeibo('${encodeURIComponent(post.content || '')}', '${shareUrl}')">
            <i class="fab fa-weibo"></i> 分享到微博
        </div>
        <div class="share-menu-item" onclick="shareToTwitter('${encodeURIComponent(post.content || '')}', '${shareUrl}')">
            <i class="fab fa-twitter"></i> 分享到 Twitter
        </div>
    `;
    
    // 定位菜单
    const rect = event.target.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left}px`;
    
    document.body.appendChild(menu);
    
    // 点击其他地方关闭
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
};

window.copyShareLink = function(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('链接已复制', 'success');
    }).catch(() => {
        // 降级方案
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        showToast('链接已复制', 'success');
    });
};

window.shareToWeibo = function(text, url) {
    window.open(`https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${text}`, '_blank');
};

window.shareToTwitter = function(text, url) {
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${text}`, '_blank');
};

// ==================== 复制帖子内容 ====================
window.copyPostContent = function(content) {
    navigator.clipboard.writeText(content).then(() => {
        showToast('内容已复制', 'success');
    }).catch(() => {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = content;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        showToast('内容已复制', 'success');
    });
};

// ==================== 评论排序 ====================
let commentSortType = 'time'; // time 或 hot

window.toggleCommentSort = function(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post || !post.comments || post.comments.length === 0) return;
    
    if (commentSortType === 'time') {
        commentSortType = 'hot';
        showToast('按热度排序', 'info');
    } else {
        commentSortType = 'time';
        showToast('按时间排序', 'info');
    }
    renderPosts();
};

// 修改加载评论的逻辑，按排序显示
const originalLoadPosts = loadPosts;
loadPosts = async function() {
    await originalLoadPosts();
    // 评论排序在 renderPosts 中处理
};

// 在 createPostElement 中应用排序
const originalCreatePost = createPostElement;
createPostElement = function(post) {
    // 排序评论
    if (post.comments && post.comments.length > 0) {
        if (commentSortType === 'hot') {
            post.comments = [...post.comments].sort((a, b) => (b.likes || 0) - (a.likes || 0));
        } else {
            post.comments = [...post.comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }
    }
    return originalCreatePost(post);
};

// ==================== 优化点赞动画 ====================
function setupLikeAnimation() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes likePulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }
        .like-btn.liked {
            animation: likePulse 0.3s ease;
        }
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .post-item {
            animation: fadeInUp 0.4s ease;
        }
        .action-btn {
            transition: all 0.2s ease;
        }
        .action-btn:hover {
            transform: scale(1.1);
        }
    `;
    document.head.appendChild(style);
}

// ==================== 快捷键支持 ====================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter: 发布帖子
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const postBtn = document.getElementById('post-button');
            if (postBtn && !postBtn.disabled) {
                postBtn.click();
            }
        }
        
        // Ctrl/Cmd + Shift + K: 打开搜索
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
            e.preventDefault();
            openSearchModal();
        }
        
        // Ctrl/Cmd + /: 切换主题
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            document.getElementById('theme-toggle')?.click();
        }
        
        // Esc: 关闭所有模态框
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            if (imageViewer) closeImageViewer();
        }
    });
    
    // 添加快捷键提示
    const shortcutsHint = document.createElement('div');
    shortcutsHint.innerHTML = `
        <div style="position:fixed;bottom:90px;right:30px;background:var(--bg-secondary);padding:15px;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.1);font-size:0.85rem;color:var(--text-secondary);z-index:999;display:none;" id="shortcuts-hint">
            <div style="font-weight:bold;margin-bottom:10px;color:var(--accent-color);">⌨️ 快捷键</div>
            <div style="margin-bottom:5px;"><kbd style="background:#f0f0f0;padding:2px 6px;border-radius:3px;">Ctrl</kbd> + <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:3px;">Enter</kbd> 发布帖子</div>
            <div style="margin-bottom:5px;"><kbd style="background:#f0f0f0;padding:2px 6px;border-radius:3px;">Ctrl</kbd> + <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:3px;">K</kbd> 搜索</div>
            <div style="margin-bottom:5px;"><kbd style="background:#f0f0f0;padding:2px 6px;border-radius:3px;">Ctrl</kbd> + <kbd style="background:#f0f0f0;padding:2px 6px;border-radius:3px;">/</kbd> 切换主题</div>
            <div><kbd style="background:#f0f0f0;padding:2px 6px;border-radius:3px;">Esc</kbd> 关闭弹窗</div>
        </div>
    `;
    document.body.appendChild(shortcutsHint);
    
    // 鼠标悬停在主题按钮上显示快捷键提示
    const themeToggle = document.getElementById('theme-toggle');
    const hint = document.getElementById('shortcuts-hint');
    
    themeToggle?.addEventListener('mouseenter', () => {
        hint.style.display = 'block';
    });
    
    themeToggle?.addEventListener('mouseleave', () => {
        setTimeout(() => {
            if (!hint.matches(':hover')) {
                hint.style.display = 'none';
            }
        }, 500);
    });
    
    hint.addEventListener('mouseleave', () => {
        hint.style.display = 'none';
    });
}

// ==================== 图片压缩 ====================
async function compressImage(file, maxWidth = 1920, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // 创建 canvas
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // 计算缩放比例
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // 绘制图片
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // 转换为 Blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        // 如果压缩后更大，返回原文件
                        if (blob.size >= file.size) {
                            resolve(file);
                        } else {
                            resolve(new File([blob], file.name, { type: file.type }));
                        }
                    } else {
                        reject(new Error('压缩失败'));
                    }
                }, file.type, quality);
            };
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

// 修改图片上传函数，添加压缩
const originalHandleImageUpload = handleImageUpload;
handleImageUpload = async function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 50 * 1024 * 1024) {
            showToast('图片不能超过50MB', 'error');
            return;
        }
        
        // 显示压缩提示
        showToast('正在压缩图片...', 'info');
        
        try {
            // 压缩图片
            const compressedFile = await compressImage(file);
            currentImage = compressedFile;
            currentVideo = null;
            currentVoice = null;
            
            const savedSize = ((file.size - compressedFile.size) / 1024).toFixed(1);
            showToast(`图片已压缩，节省 ${savedSize}KB`, 'success');
        } catch (error) {
            console.error('压缩失败:', error);
            currentImage = file;
            showToast('图片已选择', 'success');
        }
    }
};

// ==================== 评论点赞 ====================
window.toggleCommentLike = async function(postId, commentId) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    try {
        const post = posts.find(p => p.id === postId);
        if (!post || !post.comments) return;
        
        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) return;
        
        // 初始化点赞数据
        if (!comment.likedBy) comment.likedBy = [];
        
        if (comment.likedBy.includes(currentUser.id)) {
            // 取消点赞
            comment.likedBy = comment.likedBy.filter(id => id !== currentUser.id);
            comment.likes = Math.max(0, (comment.likes || 0) - 1);
        } else {
            // 点赞
            comment.likedBy.push(currentUser.id);
            comment.likes = (comment.likes || 0) + 1;
        }
        
        // 更新数据库
        await supabase
            .from('posts')
            .update({ comments: post.comments })
            .eq('id', postId);
        
        // 重新渲染
        renderPosts();
        
    } catch (error) {
        console.error('评论点赞失败:', error);
        showToast('操作失败', 'error');
    }
};

// ==================== 输入字数统计 ====================
function setupCharCounter() {
    const postText = document.getElementById('post-text');
    if (!postText) return;
    
    const maxLength = 1000;
    
    // 创建计数器
    const counter = document.createElement('div');
    counter.id = 'char-counter';
    counter.style.cssText = 'text-align:right;color:#999;font-size:0.85rem;margin-top:5px;';
    counter.innerHTML = `<span id="char-count">0</span> / ${maxLength}`;
    postText.parentNode.insertBefore(counter, postText.nextSibling);
    
    // 监听输入
    postText.addEventListener('input', () => {
        const length = postText.value.length;
        const countSpan = document.getElementById('char-count');
        
        if (countSpan) {
            countSpan.textContent = length;
            
            if (length > maxLength) {
                countSpan.style.color = '#ff6b6b';
                postText.style.borderColor = '#ff6b6b';
            } else if (length > maxLength * 0.9) {
                countSpan.style.color = '#ffa500';
                postText.style.borderColor = '#ffa500';
            } else {
                countSpan.style.color = '#999';
                postText.style.borderColor = '';
            }
        }
    });
}

// 修改 handlePost 添加字数限制
const originalHandlePost2 = handlePost;
handlePost = async function() {
    const postText = document.getElementById('post-text');
    const text = postText?.value.trim() || '';
    
    if (text.length > 1000) {
        showToast('内容超过1000字限制', 'error');
        return;
    }
    
    await originalHandlePost2();
};

// ==================== 收藏功能 ====================
window.toggleFavorite = async function(postId) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    try {
        // 获取用户收藏列表
        const { data: userData } = await supabase
            .from('users')
            .select('favorites')
            .eq('id', currentUser.id)
            .single();
        
        let favorites = userData?.favorites || [];
        
        if (favorites.includes(postId)) {
            // 取消收藏
            favorites = favorites.filter(id => id !== postId);
            showToast('已取消收藏', 'success');
        } else {
            // 收藏
            favorites.push(postId);
            showToast('收藏成功', 'success');
        }
        
        // 更新数据库
        await supabase
            .from('users')
            .update({ favorites })
            .eq('id', currentUser.id);
        
        // 更新本地
        currentUser.favorites = favorites;
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        
        renderPosts();
        
    } catch (error) {
        console.error('收藏失败:', error);
        showToast('操作失败', 'error');
    }
};

// ==================== 双击点赞 ====================
let lastTapTime = 0;
let tapTimeout = null;

function setupDoubleTapLike() {
    document.addEventListener('dblclick', (e) => {
        const postItem = e.target.closest('.post-item');
        if (postItem) {
            const postId = postItem.dataset.id;
            if (postId) {
                // 显示爱心动画
                showHeartAnimation(e.clientX, e.clientY);
                toggleLike(postId);
            }
        }
    });
}

function showHeartAnimation(x, y) {
    const heart = document.createElement('div');
    heart.innerHTML = '❤️';
    heart.style.cssText = `
        position: fixed;
        left: ${x - 25}px;
        top: ${y - 25}px;
        font-size: 50px;
        pointer-events: none;
        animation: heartPop 0.8s ease-out forwards;
        z-index: 10000;
    `;
    document.body.appendChild(heart);
    
    setTimeout(() => heart.remove(), 800);
}

// 添加爱心动画样式
const heartStyle = document.createElement('style');
heartStyle.textContent = `
    @keyframes heartPop {
        0% { transform: scale(0); opacity: 1; }
        50% { transform: scale(1.2); opacity: 1; }
        100% { transform: scale(1) translateY(-50px); opacity: 0; }
    }
`;
document.head.appendChild(heartStyle);

// ==================== 长按保存图片 ====================
let longPressTimer = null;

function setupLongPressSave() {
    document.addEventListener('touchstart', (e) => {
        const img = e.target.closest('.post-item-media img');
        if (img) {
            longPressTimer = setTimeout(() => {
                saveImage(img.src);
            }, 800);
        }
    });
    
    document.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
    });
    
    document.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
    });
    
    // 右键保存
    document.addEventListener('contextmenu', (e) => {
        const img = e.target.closest('.post-item-media img');
        if (img) {
            e.preventDefault();
            saveImage(img.src);
        }
    });
}

window.saveImage = function(src) {
    const a = document.createElement('a');
    a.href = src;
    a.download = `treehole_${Date.now()}.jpg`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('图片已保存', 'success');
};

// ==================== 操作确认 ====================
const originalDeletePost = deletePost;
window.deletePost = async function(postId) {
    // 创建确认对话框
    const confirmed = await showConfirmDialog('确定要删除这条分享吗？', '删除后将无法恢复');
    if (!confirmed) return;
    
    await originalDeletePost(postId);
};

function showConfirmDialog(message, subtext = '') {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.innerHTML = `
            <div class="confirm-dialog-overlay"></div>
            <div class="confirm-dialog-content">
                <div class="confirm-dialog-message">${message}</div>
                ${subtext ? `<div class="confirm-dialog-subtext">${subtext}</div>` : ''}
                <div class="confirm-dialog-buttons">
                    <button class="confirm-btn cancel">取消</button>
                    <button class="confirm-btn confirm">确定</button>
                </div>
            </div>
        `;
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .confirm-dialog {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .confirm-dialog-overlay {
                position: absolute;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
            }
            .confirm-dialog-content {
                position: relative;
                background: var(--bg-secondary);
                padding: 25px;
                border-radius: 12px;
                max-width: 350px;
                text-align: center;
                animation: slideUp 0.3s ease;
            }
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .confirm-dialog-message {
                font-size: 1.1rem;
                font-weight: 600;
                color: var(--text-primary);
                margin-bottom: 10px;
            }
            .confirm-dialog-subtext {
                font-size: 0.9rem;
                color: var(--text-muted);
                margin-bottom: 20px;
            }
            .confirm-dialog-buttons {
                display: flex;
                gap: 10px;
            }
            .confirm-btn {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.3s ease;
            }
            .confirm-btn.cancel {
                background: var(--bg-primary);
                color: var(--text-secondary);
            }
            .confirm-btn.confirm {
                background: #ff6b6b;
                color: white;
            }
            .confirm-btn:hover {
                transform: translateY(-2px);
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(dialog);
        
        // 绑定事件
        dialog.querySelector('.cancel').addEventListener('click', () => {
            dialog.remove();
            resolve(false);
        });
        dialog.querySelector('.confirm').addEventListener('click', () => {
            dialog.remove();
            resolve(true);
        });
        dialog.querySelector('.confirm-dialog-overlay').addEventListener('click', () => {
            dialog.remove();
            resolve(false);
        });
    });
}

// ==================== 匿名发布 ====================
let isAnonymous = false;

function setupAnonymousToggle() {
    const postActions = document.querySelector('.post-actions');
    if (!postActions) return;
    
    const anonBtn = document.createElement('button');
    anonBtn.id = 'anonymous-toggle';
    anonBtn.className = 'upload-btn';
    anonBtn.style.cssText = 'padding:8px 15px;font-size:0.85rem;';
    anonBtn.innerHTML = '<i class="fas fa-user-secret"></i> 匿名';
    anonBtn.onclick = toggleAnonymous;
    
    const emojiBtn = document.getElementById('emoji-btn');
    if (emojiBtn) {
        emojiBtn.after(anonBtn);
    }
}

function toggleAnonymous() {
    isAnonymous = !isAnonymous;
    const btn = document.getElementById('anonymous-toggle');
    if (btn) {
        if (isAnonymous) {
            btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            btn.style.color = 'white';
            showToast('已开启匿名模式', 'info');
        } else {
            btn.style.background = '#f8f9fa';
            btn.style.color = '#666';
            showToast('已关闭匿名模式', 'info');
        }
    }
}

// 修改 handlePost 支持匿名
const originalHandlePost3 = handlePost;
handlePost = async function() {
    const postText = document.getElementById('post-text');
    const text = postText?.value.trim() || '';
    
    if (text.length > 1000) {
        showToast('内容超过1000字限制', 'error');
        return;
    }
    
    // 保存匿名状态
    const wasAnonymous = isAnonymous;
    
    // 如果匿名，临时修改用户信息
    if (wasAnonymous && currentUser) {
        const originalUser = { ...currentUser };
        currentUser.username = '匿名用户';
        currentUser.avatar = 'https://ui-avatars.com/api/?name=Anonymous&background=888888&color=fff';
        
        await originalHandlePost3();
        
        // 恢复用户信息
        currentUser = originalUser;
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
    } else {
        await originalHandlePost3();
    }
};

// ==================== 帖子编辑 ====================
window.editPost = async function(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    // 检查权限
    if (!currentUser || post.user_id !== currentUser.id) {
        showToast('无权限编辑', 'error');
        return;
    }
    
    // 创建编辑对话框
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.style.display = 'block';
    dialog.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>编辑帖子</h3>
                <span class="close-btn" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div class="modal-body">
                <textarea id="edit-post-text" style="width:100%;min-height:150px;padding:15px;border:2px solid #e0e0e0;border-radius:8px;font-size:1rem;resize:vertical;">${post.content || ''}</textarea>
                <div style="display:flex;gap:10px;margin-top:15px;">
                    <button class="upload-btn" onclick="this.closest('.modal').remove()" style="flex:1;">取消</button>
                    <button id="save-edit-btn" class="post-btn" style="flex:1;">保存</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    
    // 绑定保存事件
    document.getElementById('save-edit-btn').addEventListener('click', async () => {
        const newContent = document.getElementById('edit-post-text').value.trim();
        if (!newContent) {
            showToast('内容不能为空', 'error');
            return;
        }
        
        if (containsSensitiveWords(newContent)) {
            showToast('内容包含敏感词', 'error');
            return;
        }
        
        try {
            const filteredContent = filterSensitiveWords(newContent);
            
            await supabase
                .from('posts')
                .update({ content: filteredContent })
                .eq('id', postId);
            
            dialog.remove();
            await loadPosts();
            showToast('编辑成功', 'success');
        } catch (error) {
            console.error('编辑失败:', error);
            showToast('编辑失败', 'error');
        }
    });
};

// ==================== 表情回应评论 ====================
const commentReactions = ['👍', '❤️', '😂', '😮', '😢', '😡'];

window.showCommentReactions = function(postId, commentId) {
    const post = posts.find(p => p.id === postId);
    if (!post || !post.comments) return;
    
    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) return;
    
    // 创建表情选择器
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = commentReactions.map(r => 
        `<span class="reaction-item" onclick="addCommentReaction('${postId}', '${commentId}', '${r}')">${r}</span>`
    ).join('');
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .reaction-picker {
            position: absolute;
            background: var(--bg-secondary);
            border-radius: 20px;
            padding: 8px 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            display: flex;
            gap: 8px;
            z-index: 100;
        }
        .reaction-item {
            font-size: 1.3rem;
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        .reaction-item:hover {
            transform: scale(1.3);
        }
    `;
    document.head.appendChild(style);
    
    // 定位
    const rect = event.target.getBoundingClientRect();
    picker.style.top = `${rect.top - 50}px`;
    picker.style.left = `${rect.left}px`;
    
    document.body.appendChild(picker);
    
    // 点击其他地方关闭
    const closePicker = (e) => {
        if (!picker.contains(e.target)) {
            picker.remove();
            document.removeEventListener('click', closePicker);
        }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 100);
};

window.addCommentReaction = async function(postId, commentId, reaction) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    try {
        const post = posts.find(p => p.id === postId);
        if (!post || !post.comments) return;
        
        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) return;
        
        if (!comment.reactions) comment.reactions = {};
        if (!comment.reactions[reaction]) comment.reactions[reaction] = [];
        
        // 检查是否已回应
        const userIndex = comment.reactions[reaction].indexOf(currentUser.id);
        if (userIndex > -1) {
            comment.reactions[reaction].splice(userIndex, 1);
        } else {
            comment.reactions[reaction].push(currentUser.id);
        }
        
        await supabase
            .from('posts')
            .update({ comments: post.comments })
            .eq('id', postId);
        
        renderPosts();
        
    } catch (error) {
        console.error('回应失败:', error);
    }
};

// ==================== 粉丝关注功能 ====================
// 关注用户
window.followUser = async function(userId) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    if (userId === currentUser.id) {
        showToast('不能关注自己', 'error');
        return;
    }
    
    try {
        // 检查是否已关注
        const { data: existing } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', currentUser.id)
            .eq('following_id', userId)
            .single();
        
        if (existing) {
            // 取消关注
            await supabase
                .from('follows')
                .delete()
                .eq('id', existing.id);
            showToast('已取消关注', 'success');
        } else {
            // 关注
            await supabase
                .from('follows')
                .insert({
                    follower_id: currentUser.id,
                    following_id: userId
                });
            showToast('关注成功', 'success');
        }
        
        // 刷新用户主页
        if (document.getElementById('user-profile-modal')?.style.display === 'block') {
            openUserProfile(userId);
        }
        
    } catch (error) {
        console.error('关注操作失败:', error);
        showToast('操作失败', 'error');
    }
};

// 检查是否已关注
async function isFollowing(userId) {
    if (!currentUser) return false;
    
    try {
        const { data } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', currentUser.id)
            .eq('following_id', userId)
            .single();
        return !!data;
    } catch {
        return false;
    }
}

// 获取用户粉丝数和关注数
async function getFollowStats(userId) {
    try {
        const [followersRes, followingRes] = await Promise.all([
            supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', userId),
            supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', userId)
        ]);
        
        return {
            followers: followersRes.count || 0,
            following: followingRes.count || 0
        };
    } catch (error) {
        console.error('获取关注统计失败:', error);
        return { followers: 0, following: 0 };
    }
}

// 修改用户主页，添加关注功能
const originalOpenUserProfile = window.openUserProfile;
window.openUserProfile = async function(userId) {
    if (!userProfileModal) setupUserProfile();
    
    // 获取用户信息
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (!user) {
        showToast('用户不存在', 'error');
        return;
    }
    
    // 获取关注统计
    const stats = await getFollowStats(userId);
    
    // 检查是否已关注
    const isFollowed = await isFollowing(userId);
    
    // 检查是否是自己
    const isSelf = currentUser?.id === userId;
    
    // 显示用户信息
    document.getElementById('profile-avatar').src = user.avatar;
    document.getElementById('profile-name').textContent = user.username;
    document.getElementById('profile-id').textContent = `ID: ${user.id}`;
    
    // 更新统计信息（添加粉丝和关注）
    document.getElementById('profile-stats').innerHTML = `
        <span><strong id="profile-posts-count">0</strong> 帖子</span>
        <span><strong id="profile-followers-count">${stats.followers}</strong> 粉丝</span>
        <span><strong id="profile-following-count">${stats.following}</strong> 关注</span>
    `;
    
    // 添加关注按钮
    const profileInfo = document.getElementById('profile-info');
    const existingFollowBtn = document.getElementById('follow-btn-container');
    if (existingFollowBtn) existingFollowBtn.remove();
    
    if (!isSelf) {
        const followBtnContainer = document.createElement('div');
        followBtnContainer.id = 'follow-btn-container';
        followBtnContainer.innerHTML = `
            <button onclick="followUser('${userId}')" class="${isFollowed ? 'upload-btn' : 'post-btn'}" style="margin-left:auto;padding:8px 20px;">
                ${isFollowed ? '已关注' : '+ 关注'}
            </button>
        `;
        profileInfo.appendChild(followBtnContainer);
    }
    
    // 获取用户帖子数
    const { count: postsCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);
    
    document.getElementById('profile-posts-count').textContent = postsCount || 0;
    
    // 获取用户获赞数
    const { data: userPosts } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', userId);
    
    let totalLikes = 0;
    if (userPosts && userPosts.length > 0) {
        const postIds = userPosts.map(p => p.id);
        const { data: likes } = await supabase
            .from('likes')
            .select('id')
            .in('post_id', postIds);
        totalLikes = likes?.length || 0;
    }
    
    // 加载用户帖子
    loadProfilePosts(userId);
    
    userProfileModal.style.display = 'block';
};

// 添加粉丝/关注列表查看
window.showFollowersList = async function(userId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>粉丝列表</h3>
                <span class="close-btn" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div class="modal-body">
                <div id="followers-list" style="max-height: 400px; overflow-y: auto;">
                    <p style="text-align:center;color:#999;padding:20px;">加载中...</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    try {
        const { data: follows } = await supabase
            .from('follows')
            .select('follower_id')
            .eq('following_id', userId);
        
        const container = modal.querySelector('#followers-list');
        container.innerHTML = '';
        
        if (!follows || follows.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无粉丝</p>';
            return;
        }
        
        // 获取粉丝信息
        const followerIds = follows.map(f => f.follower_id);
        const { data: users } = await supabase
            .from('users')
            .select('*')
            .in('id', followerIds);
        
        users?.forEach(user => {
            const div = document.createElement('div');
            div.className = 'friend-item';
            div.innerHTML = `
                <img src="${user.avatar}" style="width:40px;height:40px;border-radius:50%;">
                <div class="friend-item-info">
                    <div class="friend-item-name">${user.username}</div>
                </div>
            `;
            div.onclick = () => {
                modal.remove();
                openUserProfile(user.id);
            };
            container.appendChild(div);
        });
        
    } catch (error) {
        console.error('加载粉丝失败:', error);
        modal.querySelector('#followers-list').innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载失败</p>';
    }
};

window.showFollowingList = async function(userId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>关注列表</h3>
                <span class="close-btn" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div class="modal-body">
                <div id="following-list" style="max-height: 400px; overflow-y: auto;">
                    <p style="text-align:center;color:#999;padding:20px;">加载中...</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    try {
        const { data: follows } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', userId);
        
        const container = modal.querySelector('#following-list');
        container.innerHTML = '';
        
        if (!follows || follows.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无关注</p>';
            return;
        }
        
        // 获取关注用户信息
        const followingIds = follows.map(f => f.following_id);
        const { data: users } = await supabase
            .from('users')
            .select('*')
            .in('id', followingIds);
        
        users?.forEach(user => {
            const div = document.createElement('div');
            div.className = 'friend-item';
            div.innerHTML = `
                <img src="${user.avatar}" style="width:40px;height:40px;border-radius:50%;">
                <div class="friend-item-info">
                    <div class="friend-item-name">${user.username}</div>
                </div>
            `;
            div.onclick = () => {
                modal.remove();
                openUserProfile(user.id);
            };
            container.appendChild(div);
        });
        
    } catch (error) {
        console.error('加载关注失败:', error);
        modal.querySelector('#following-list').innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载失败</p>';
    }
};

// ==================== 评论回复功能 ====================
window.showReplyInput = function(postId, commentId, replyToUsername) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    // 创建回复输入框
    const replyInput = document.createElement('div');
    replyInput.className = 'reply-input-container';
    replyInput.style.cssText = 'display:flex;gap:10px;margin-top:10px;padding:10px;background:#f8f9fa;border-radius:8px;';
    replyInput.innerHTML = `
        <input type="text" class="reply-input" placeholder="回复 @${replyToUsername}..." 
               style="flex:1;padding:8px 12px;border:1px solid #e0e0e0;border-radius:20px;font-size:0.85rem;">
        <button class="reply-submit-btn" style="padding:8px 15px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;border:none;border-radius:20px;cursor:pointer;font-size:0.85rem;">
            发送
        </button>
    `;
    
    // 找到对应的评论元素并添加回复框
    const commentItems = document.querySelectorAll(`.comment-item`);
    commentItems.forEach(item => {
        const likeBtn = item.querySelector('button[onclick*="toggleCommentLike"]');
        if (likeBtn && likeBtn.getAttribute('onclick').includes(commentId)) {
            // 检查是否已有回复框
            const existingReply = item.querySelector('.reply-input-container');
            if (existingReply) {
                existingReply.remove();
            } else {
                item.appendChild(replyInput);
                
                // 绑定发送事件
                const input = replyInput.querySelector('.reply-input');
                const submitBtn = replyInput.querySelector('.reply-submit-btn');
                
                submitBtn.onclick = () => replyComment(postId, commentId, input.value);
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') replyComment(postId, commentId, input.value);
                });
                
                input.focus();
            }
        }
    });
};

window.replyComment = async function(postId, commentId, content) {
    if (!content.trim()) {
        showToast('请输入回复内容', 'error');
        return;
    }
    
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    try {
        const { data: post } = await supabase
            .from('posts')
            .select('comments')
            .eq('id', postId)
            .single();
        
        if (!post || !post.comments) {
            showToast('评论不存在', 'error');
            return;
        }
        
        // 找到原评论
        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            showToast('评论不存在', 'error');
            return;
        }
        
        // 初始化 replies 数组
        if (!comment.replies) {
            comment.replies = [];
        }
        
        // 添加回复
        comment.replies.push({
            id: generateId(),
            user_id: currentUser.id,
            username: currentUser.username,
            user_avatar: currentUser.avatar,
            content: content.trim(),
            created_at: new Date().toISOString()
        });
        
        // 保存到数据库
        await supabase
            .from('posts')
            .update({ comments: post.comments })
            .eq('id', postId);
        
        // 刷新帖子
        await loadPosts();
        showToast('回复成功', 'success');
        
    } catch (error) {
        console.error('回复失败:', error);
        showToast('回复失败', 'error');
    }
};

// 修改 createPostElement 以显示回复
const originalCreatePostElement2 = createPostElement;
createPostElement = function(post) {
    const result = originalCreatePostElement2(post);
    
    // 添加回复显示逻辑
    setTimeout(() => {
        if (post.comments) {
            post.comments.forEach(c => {
                if (c.replies && c.replies.length > 0) {
                    const commentItems = document.querySelectorAll(`.comment-item`);
                    commentItems.forEach(item => {
                        const likeBtn = item.querySelector('button[onclick*="toggleCommentLike"]');
                        if (likeBtn && likeBtn.getAttribute('onclick').includes(c.id)) {
                            // 检查是否已显示回复
                            const existingReplies = item.querySelector('.comment-replies');
                            if (!existingReplies) {
                                let repliesHtml = `<div class="comment-replies" style="margin-top:10px;padding-left:20px;border-left:2px solid #e0e0e0;">`;
                                c.replies.forEach(r => {
                                    repliesHtml += `
                                        <div style="margin-bottom:8px;padding:8px;background:#fff;border-radius:8px;">
                                            <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
                                                <img src="${r.user_avatar}" style="width:18px;height:18px;border-radius:50%;">
                                                <span style="font-weight:600;font-size:0.8rem;color:#667eea;">${r.username}</span>
                                                <span style="font-size:0.75rem;color:#999;">回复</span>
                                                <span style="font-weight:600;font-size:0.8rem;color:#667eea;">${c.username}</span>
                                            </div>
                                            <div style="font-size:0.85rem;color:#333;">${escapeHtml(r.content)}</div>
                                        </div>
                                    `;
                                });
                                repliesHtml += '</div>';
                                item.insertAdjacentHTML('beforeend', repliesHtml);
                            }
                        }
                    });
                }
            });
        }
    }, 100);
    
    return result;
};

// ==================== 个人收藏页 ====================
let favoritesModal = null;

function setupFavoritesPage() {
    const main = document.querySelector('main .container');
    if (!main) return;
    
    // 在最新分享区域前添加收藏入口
    const latestSection = document.querySelector('.content-section:nth-child(3)');
    if (!latestSection) return;
    
    const favLink = document.createElement('div');
    favLink.style.cssText = 'text-align:center;margin:20px 0;';
    favLink.innerHTML = `
        <button onclick="openFavoritesPage()" class="upload-btn" style="padding:12px 30px;font-size:1rem;">
            <i class="fas fa-bookmark"></i> 我的收藏
        </button>
    `;
    latestSection.before(favLink);
}

window.openFavoritesPage = async function() {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    if (!favoritesModal) {
        favoritesModal = document.createElement('div');
        favoritesModal.id = 'favorites-modal';
        favoritesModal.className = 'modal';
        favoritesModal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3>⭐ 我的收藏</h3>
                    <span class="close-btn" onclick="closeFavoritesPage()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="favorites-tabs" style="display:flex;gap:10px;margin-bottom:20px;">
                        <button class="fav-tab active" onclick="showFavoritesTab('favorites')">收藏的帖子</button>
                        <button class="fav-tab" onclick="showFavoritesTab('likes')">点赞的帖子</button>
                    </div>
                    <div id="favorites-list" style="max-height: 500px; overflow-y: auto;">
                        <p style="text-align:center;color:#999;padding:40px;">加载中...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(favoritesModal);
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .fav-tab { padding: 8px 20px; background: #f8f9fa; border: 2px solid #e0e0e0; border-radius: 20px; cursor: pointer; transition: all 0.3s ease; }
            .fav-tab:hover { border-color: #667eea; }
            .fav-tab.active { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-color: #667eea; }
        `;
        document.head.appendChild(style);
    }
    
    favoritesModal.style.display = 'block';
    showFavoritesTab('favorites');
};

window.closeFavoritesPage = function() {
    if (favoritesModal) favoritesModal.style.display = 'none';
};

window.showFavoritesTab = async function(tab) {
    document.querySelectorAll('.fav-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    const container = document.getElementById('favorites-list');
    container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">加载中...</p>';
    
    if (!currentUser) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">请先登录</p>';
        return;
    }
    
    try {
        if (tab === 'favorites') {
            // 获取收藏的帖子
            const userFavorites = currentUser.favorites || [];
            if (userFavorites.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">暂无收藏</p>';
                return;
            }
            
            const { data } = await supabase
                .from('posts')
                .select('*')
                .in('id', userFavorites)
                .order('created_at', { ascending: false });
            
            container.innerHTML = '';
            data?.forEach(post => {
                const div = document.createElement('div');
                div.style.cssText = 'padding:15px;border-bottom:1px solid #e0e0e0;cursor:pointer;transition:background 0.3s ease;';
                div.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <img src="${post.user_avatar}" style="width:25px;height:25px;border-radius:50%;">
                        <span style="font-weight:600;color:#667eea;">${post.username}</span>
                    </div>
                    <div style="color:#333;margin-bottom:5px;">${escapeHtml(post.content || '').substring(0, 100)}${post.content?.length > 100 ? '...' : ''}</div>
                    <div style="color:#999;font-size:0.8rem;">${new Date(post.created_at).toLocaleString('zh-CN')}</div>
                `;
                div.onclick = () => {
                    closeFavoritesPage();
                    const postEl = document.querySelector(`[data-id="${post.id}"]`);
                    if (postEl) postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                };
                container.appendChild(div);
            });
            
        } else if (tab === 'likes') {
            // 获取点赞的帖子
            const { data: likes } = await supabase
                .from('likes')
                .select('post_id')
                .eq('user_id', currentUser.id);
            
            if (!likes || likes.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">暂无点赞</p>';
                return;
            }
            
            const postIds = likes.map(l => l.post_id);
            const { data } = await supabase
                .from('posts')
                .select('*')
                .in('id', postIds)
                .order('created_at', { ascending: false });
            
            container.innerHTML = '';
            data?.forEach(post => {
                const div = document.createElement('div');
                div.style.cssText = 'padding:15px;border-bottom:1px solid #e0e0e0;cursor:pointer;transition:background 0.3s ease;';
                div.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <img src="${post.user_avatar}" style="width:25px;height:25px;border-radius:50%;">
                        <span style="font-weight:600;color:#667eea;">${post.username}</span>
                    </div>
                    <div style="color:#333;margin-bottom:5px;">${escapeHtml(post.content || '').substring(0, 100)}${post.content?.length > 100 ? '...' : ''}</div>
                    <div style="color:#999;font-size:0.8rem;">${new Date(post.created_at).toLocaleString('zh-CN')}</div>
                `;
                div.onclick = () => {
                    closeFavoritesPage();
                    const postEl = document.querySelector(`[data-id="${post.id}"]`);
                    if (postEl) postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                };
                container.appendChild(div);
            });
        }
        
    } catch (error) {
        console.error('加载失败:', error);
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">加载失败</p>';
    }
};

// ==================== 增强消息通知 ====================
window.showNotifications = function() {
    if (!currentUser) {
        showToast('请先登录', 'error');
        showAuthModal();
        return;
    }
    
    // 创建通知中心
    const notifModal = document.createElement('div');
    notifModal.className = 'modal';
    notifModal.style.display = 'block';
    notifModal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>🔔 通知中心</h3>
                <span class="close-btn" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div class="modal-body">
                <div id="notification-list" style="max-height: 400px; overflow-y: auto;">
                    <p style="text-align:center;color:#999;padding:40px;">加载中...</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(notifModal);
    
    // 加载通知
    loadNotifications(notifModal.querySelector('#notification-list'));
};

async function loadNotifications(container) {
    try {
        // 获取点赞通知
        const [likesRes, followsRes, commentsRes] = await Promise.all([
            supabase.from('likes').select('post_id,created_at').neq('user_id', currentUser?.id || ''),
            supabase.from('follows').select('follower_id,following_id,created_at').neq('follower_id', currentUser?.id || ''),
            supabase.from('comments').select('post_id,user_id,content,created_at').neq('user_id', currentUser?.id || '')
        ]);
        
        let notifications = [];
        
        // 处理点赞（自己帖子被点赞）
        if (likesRes.data) {
            const myPostIds = posts.filter(p => p.user_id === currentUser?.id).map(p => p.id);
            likesRes.data.filter(l => myPostIds.includes(l.post_id)).forEach(l => {
                notifications.push({ type: 'like', postId: l.post_id, time: l.created_at });
            });
        }
        
        // 处理关注（自己被关注）
        if (followsRes.data) {
            followsRes.data.filter(f => f.following_id === currentUser?.id).forEach(f => {
                notifications.push({ type: 'follow', userId: f.follower_id, time: f.created_at });
            });
        }
        
        // 按时间排序
        notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
        
        container.innerHTML = '';
        
        if (notifications.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">暂无通知</p>';
            return;
        }
        
        // 显示通知（去重显示前20条）
        notifications.slice(0, 20).forEach(n => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:12px;border-bottom:1px solid #e0e0e0;cursor:pointer;transition:background 0.3s ease;';
            
            if (n.type === 'like') {
                div.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:1.2rem;">❤️</span>
                        <span>有人赞了你的帖子</span>
                    </div>
                    <div style="color:#999;font-size:0.8rem;margin-top:5px;">${new Date(n.time).toLocaleString('zh-CN')}</div>
                `;
            } else if (n.type === 'follow') {
                div.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:1.2rem;">👤</span>
                        <span>有人关注了你</span>
                    </div>
                    <div style="color:#999;font-size:0.8rem;margin-top:5px;">${new Date(n.time).toLocaleString('zh-CN')}</div>
                `;
            }
            
            div.onclick = () => {
                notifModal.remove();
                if (n.postId) {
                    const postEl = document.querySelector(`[data-id="${n.postId}"]`);
                    if (postEl) postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            };
            
            container.appendChild(div);
        });
        
    } catch (error) {
        console.error('加载通知失败:', error);
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">加载失败</p>';
    }
}

// ==================== 找回密码功能 ====================
let forgotUserId = null;

window.showForgotPassword = function(e) {
    e.preventDefault();
    document.getElementById('auth-modal').style.display = 'none';
    document.getElementById('forgot-password-modal').style.display = 'block';
    // 重置表单
    document.getElementById('forgot-step1').style.display = 'block';
    document.getElementById('forgot-step2').style.display = 'none';
    document.getElementById('forgot-success').style.display = 'none';
    document.getElementById('forgot-username').value = '';
    document.getElementById('forgot-new-password').value = '';
    document.getElementById('forgot-confirm-password').value = '';
};

window.closeForgotPasswordModal = function() {
    document.getElementById('forgot-password-modal').style.display = 'none';
};

window.forgotPasswordStep1 = async function() {
    const username = document.getElementById('forgot-username').value.trim();
    if (!username) {
        showToast('请输入用户名', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // 查找用户
        const { data: user } = await supabase
            .from('users')
            .select('id, username')
            .eq('username', username)
            .single();
        
        if (!user) {
            showToast('用户名不存在', 'error');
            showLoading(false);
            return;
        }
        
        // 检查本地是否有密码记录
        const storedPassword = localStorage.getItem(`pwd_${user.id}`);
        if (!storedPassword) {
            showToast('该账号未设置过密码（可能是第三方登录）', 'error');
            showLoading(false);
            return;
        }
        
        forgotUserId = user.id;
        document.getElementById('forgot-step1').style.display = 'none';
        document.getElementById('forgot-step2').style.display = 'block';
        showToast('请输入新密码', 'success');
        
    } catch (error) {
        console.error('查找用户失败:', error);
        showToast('查找失败，请重试', 'error');
    } finally {
        showLoading(false);
    }
};

window.resetPassword = async function() {
    const newPassword = document.getElementById('forgot-new-password').value.trim();
    const confirmPassword = document.getElementById('forgot-confirm-password').value.trim();
    
    if (!newPassword || !confirmPassword) {
        showToast('请填写所有字段', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('两次密码不一致', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('密码至少6位', 'error');
        return;
    }
    
    if (!forgotUserId) {
        showToast('请先验证用户名', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // 更新本地密码存储
        localStorage.setItem(`pwd_${forgotUserId}`, newPassword);
        
        document.getElementById('forgot-step2').style.display = 'none';
        document.getElementById('forgot-success').style.display = 'block';
        showToast('密码重置成功！', 'success');
        
    } catch (error) {
        console.error('重置密码失败:', error);
        showToast('重置失败，请重试', 'error');
    } finally {
        showLoading(false);
    }
};

// 登录时也需要检查本地密码
const originalLogin = login;
login = async function() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    
    if (!username || !password) {
        showToast('请输入用户名和密码', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // 查找用户
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (error || !user) {
            showToast('用户名不存在', 'error');
            return;
        }
        
        // 检查本地密码
        const storedPassword = localStorage.getItem(`pwd_${user.id}`);
        
        if (!storedPassword) {
            // 用户可能是第三方登录，没有设置过密码
            // 提示用户
            if (user.username.startsWith('微信用户') || user.username.startsWith('QQ用户')) {
                showToast('该账号为第三方登录账号，无法使用密码登录', 'error');
            } else {
                showToast('该账号未设置过密码，请先注册', 'error');
            }
            showLoading(false);
            return;
        }
        
        if (storedPassword !== password) {
            showToast('密码错误', 'error');
            showLoading(false);
            return;
        }
        
        // 登录成功
        currentUser = user;
        saveUser();
        updateUserInfo();
        hideAuthModal();
        showToast('登录成功', 'success');
        loadPosts();
        
    } catch (error) {
        console.error('登录失败:', error);
        showToast('登录失败，请重试', 'error');
    } finally {
        showLoading(false);
    }
};

// 第三方登录（微信/QQ）检查本地密码是否存在
const originalLoginWithWechat = window.loginWithWechat;
window.loginWithWechat = async function() {
    const username = '微信用户' + Math.floor(Math.random() * 100000);
    showLoading(true);
    
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('请求超时')), 15000)
    );
    
    try {
        const userId = generateId();
        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=07C160&color=fff&size=128`;
        
        const { error } = await Promise.race([
            supabase
                .from('users')
                .insert({ id: userId, username, avatar }),
            timeoutPromise
        ]);
        
        if (error) {
            showToast('登录失败，请重试', 'error');
            showLoading(false);
            return;
        }
        
        currentUser = { id: userId, username, avatar };
        saveUser();
        updateUserInfo();
        hideAuthModal();
        showToast('登录成功', 'success');
    } catch (error) {
        console.error(error);
        showToast('登录失败，请检查网络', 'error');
    } finally {
        showLoading(false);
    }
};

const originalLoginWithQQ = window.loginWithQQ;
window.loginWithQQ = async function() {
    const username = 'QQ用户' + Math.floor(Math.random() * 100000);
    showLoading(true);
    
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('请求超时')), 15000)
    );
    
    try {
        const userId = generateId();
        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=12B7F5&color=fff&size=128`;
        
        const { error } = await Promise.race([
            supabase
                .from('users')
                .insert({ id: userId, username, avatar }),
            timeoutPromise
        ]);
        
        if (error) {
            showToast('登录失败，请重试', 'error');
            showLoading(false);
            return;
        }
        
        currentUser = { id: userId, username, avatar };
        saveUser();
        updateUserInfo();
        hideAuthModal();
        showToast('登录成功', 'success');
    } catch (error) {
        console.error(error);
        showToast('登录失败，请检查网络', 'error');
    } finally {
        showLoading(false);
    }
};
