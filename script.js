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
        loadViewedPosts();
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
            loadPosts();
        })
        .subscribe();
    
    subscriptions.push(postsChannel);
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
    document.getElementById('post-button').addEventListener('click', handlePost);
    document.getElementById('image-upload').addEventListener('change', handleImageUpload);
    document.getElementById('video-upload').addEventListener('change', handleVideoUpload);
    document.getElementById('voice-record').addEventListener('click', toggleVoiceRecord);
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
    
    try {
        // 简单密码验证（实际项目应该用 Supabase Auth）
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (error || !data) {
            showToast('用户名不存在', 'error');
            return;
        }
        
        // 验证密码（存在本地）
        const storedPassword = localStorage.getItem(`pwd_${data.id}`);
        if (storedPassword && storedPassword !== password) {
            showToast('密码错误', 'error');
            return;
        }
        
        currentUser = data;
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        updateUserInfo();
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
        
        const { error } = await supabase
            .from('users')
            .insert({
                id: userId,
                username: username,
                avatar: avatar
            });
        
        if (error) {
            if (error.code === '23505') {
                showToast('用户名已存在', 'error');
            } else {
                showToast('注册失败: ' + error.message, 'error');
            }
            return;
        }
        
        // 存储密码到本地（简化方案，实际应该用后端加密）
        localStorage.setItem(`pwd_${userId}`, password);
        
        currentUser = { id: userId, username, avatar };
        localStorage.setItem('treeholeUser', JSON.stringify(currentUser));
        
        updateUserInfo();
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
        
        // 同步更新所有帖子的头像和用户名
        const { data: userPosts } = await supabase
            .from('posts')
            .select('id')
            .eq('user_id', currentUser.id);
        
        if (userPosts && userPosts.length > 0) {
            for (const post of userPosts) {
                await supabase
                    .from('posts')
                    .update({ username: username, user_avatar: avatar })
                    .eq('id', post.id);
            }
        }
        
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
            let favorited = false;
            if (currentUser) {
                const [likeData, favData] = await Promise.all([
                    supabase.from('likes').select('id').eq('post_id', post.id).eq('user_id', currentUser.id).single(),
                    supabase.from('favorites').select('id').eq('post_id', post.id).eq('user_id', currentUser.id).single()
                ]);
                liked = !!likeData.data;
                favorited = !!favData.data;
            }
            
            // 获取收藏数
            const { count: favCount } = await supabase.from('favorites').select('id', { count: 'exact' }).eq('post_id', post.id);
            
            return {
                ...post,
                likes: likesRes.count || 0,
                liked,
                favorited,
                favorites: favCount || 0,
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
            commentsHtml += `<li class="comment-item" onclick="openUserProfile('${c.user_id}')">
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                    <img src="${c.user_avatar}" style="width:20px;height:20px;border-radius:50%;">
                    <span style="font-weight:600;font-size:0.8rem;color:#667eea;">${c.username}</span>
                    <button onclick="event.stopPropagation(); showReplyInput('${post.id}', '${c.id}', '${c.username}')" style="background:none;border:none;color:#999;font-size:0.75rem;cursor:pointer;margin-left:auto;">回复</button>
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
                <button class="action-btn favorite-btn ${post.favorited ? 'favorited' : ''}" data-id="${post.id}" title="收藏">
                    <i class="fas fa-bookmark"></i> ${post.favorites || 0}
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
    div.querySelector('.favorite-btn')?.addEventListener('click', () => toggleFavorite(post.id));
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
    
    const userHtml = `<div class="post-user" onclick="openUserProfile('${post.user_id}')" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer;">
        <img src="${post.user_avatar}" style="width:30px;height:30px;border-radius:50%;">
        <span style="font-weight:600;color:#667eea;">${post.username}</span>
    </div>`;
    
    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
        commentsHtml = `<div class="post-comments"><h4>评论 (${post.comments.length})</h4><ul class="comments-list">`;
        post.comments.slice(-5).forEach(c => {
            commentsHtml += `<li class="comment-item" onclick="openUserProfile('${c.user_id}')">
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                    <img src="${c.user_avatar}" style="width:20px;height:20px;border-radius:50%;">
                    <span style="font-weight:600;font-size:0.8rem;color:#667eea;">${c.username}</span>
                </div>
                <span class="comment-text">${parseContent(c.content)}</span>
                <span class="comment-time">${new Date(c.created_at).toLocaleString('zh-CN')}</span>
            </li>`;
        });
        commentsHtml += '</ul></div>';
    }
    
    // 使用话题解析
    const parsedContent = parseContent(post.content);
    
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
                <button class="action-btn favorite-btn ${post.favorited ? 'favorited' : ''}" data-id="${post.id}" title="收藏">
                    <i class="fas fa-bookmark"></i> ${post.favorites || 0}
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
    div.querySelector('.favorite-btn')?.addEventListener('click', () => toggleFavorite(post.id));
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
        const { data: post } = await supabase
            .from('posts')
            .select('comments')
            .eq('id', postId)
            .single();
        
        if (!post || !post.comments) {
            showToast('评论不存在', 'error');
            return;
        }
        
        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            showToast('评论不存在', 'error');
            return;
        }
        
        if (!comment.replies) comment.replies = [];
        
        comment.replies.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            user_id: currentUser.id,
            username: currentUser.username,
            user_avatar: currentUser.avatar,
            content: content.trim(),
            created_at: new Date().toISOString()
        });
        
        await supabase
            .from('posts')
            .update({ comments: post.comments })
            .eq('id', postId);
        
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
                <button onclick="toggleFollowUser('${userId}')" 
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
window.showProfileTab = function(tab) {
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    if (tab === 'posts') {
        document.getElementById('profile-posts').style.display = 'block';
        document.getElementById('profile-favorites').style.display = 'none';
    } else if (tab === 'favorites') {
        const userId = window._currentProfileUserId;
        if (userId) loadUserFavorites(userId);
    }
};

// 加载用户收藏
async function loadUserFavorites(userId) {
    const container = document.getElementById('profile-favorites');
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载中...</p>';
    
    try {
        const { data: favorites } = await supabase
            .from('favorites')
            .select('post_id, posts(*)')
            .eq('user_id', userId);
        
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
        container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">加载失败</p>';
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

// ==================== 启动 ====================
window.addEventListener('DOMContentLoaded', () => {
    init();
    
    // 延迟设置无限滚动和下拉刷新
    setTimeout(() => {
        setupInfiniteScroll();
        setupPullRefresh();
        hideSkeleton();
    }, 1000);
});
