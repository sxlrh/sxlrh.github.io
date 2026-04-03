// 心灵树洞 - 优化版 script.js (Part 1)
// 修复：并发问题、浏览量循环、用户体验

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, onValue, set, get, push, remove, update } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// ==================== 全局状态 ====================
let posts = [];
let currentUser = null;
let currentImage = null;
let currentVideo = null;
let currentVoice = null;
let mediaRecorder = null;
let audioChunks = [];
let database = null;
let viewedPosts = new Set(); // 记录已浏览的帖子ID

// Firebase配置
const firebaseConfig = {
  apiKey: "AIzaSyAvWzmxHNSHG9wTbjv9dv4Ce-mN_OFBN7g",
  authDomain: "xlsd-f3985.firebaseapp.com",
  databaseURL: "https://xlsd-f3985-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xlsd-f3985",
  storageBucket: "xlsd-f3985.firebasestorage.app",
  messagingSenderId: "728217927193",
  appId: "1:728217927193:web:4a81b4ca32fe38783eb488"
};

// ==================== 初始化 ====================
function initFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        database = getDatabase(app);
        console.log('Firebase初始化成功');
        return true;
    } catch (error) {
        console.error('Firebase初始化失败:', error);
        showToast('数据存储初始化失败', 'error');
        return false;
    }
}

function init() {
    showLoading(true);
    if (!initFirebase()) { showLoading(false); return; }
    loadUser();
    updateUserInfo();
    loadPosts();
    bindEvents();
    bindAuthEvents();
    startRealTimeUpdates();
    setTimeout(() => showRanking('likes'), 500);
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
    if (!username || !password) { showToast('请输入用户名和密码', 'error'); return; }
    
    showLoading(true);
    try {
        const snapshot = await get(ref(database, 'users'));
        const users = snapshot.val() || {};
        const user = Object.values(users).find(u => u.username === username && u.password === password);
        if (user) {
            currentUser = user;
            saveUser();
            updateUserInfo();
            hideAuthModal();
            showToast('登录成功', 'success');
            loadPosts();
        } else {
            showToast('用户名或密码错误', 'error');
        }
    } catch (error) {
        console.error('登录失败:', error);
        showToast('登录失败，请检查网络', 'error');
    } finally { showLoading(false); }
}

async function register() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirmPassword = document.getElementById('register-confirm-password').value.trim();
    
    if (!username || !password || !confirmPassword) { showToast('请填写所有字段', 'error'); return; }
    if (password !== confirmPassword) { showToast('两次密码不一致', 'error'); return; }
    if (password.length < 6) { showToast('密码至少6位', 'error'); return; }
    
    showLoading(true);
    try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);
        const users = snapshot.val() || {};
        
        if (Object.values(users).some(u => u.username === username)) {
            showToast('用户名已存在', 'error');
            showLoading(false);
            return;
        }
        
        const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const newUser = {
            id: uniqueId, username, password,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff`,
            createdAt: new Date().toLocaleString('zh-CN')
        };
        
        users[uniqueId] = newUser;
        await set(usersRef, users);
        currentUser = newUser;
        saveUser();
        updateUserInfo();
        hideAuthModal();
        showToast('注册成功！ID: ' + uniqueId, 'success');
    } catch (error) {
        console.error('注册失败:', error);
        showToast('注册失败，请重试', 'error');
    } finally { showLoading(false); }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('treeholeCurrentUser');
    updateUserInfo();
    showToast('已退出登录', 'success');
}

function saveUser() { if (currentUser) localStorage.setItem('treeholeCurrentUser', JSON.stringify(currentUser)); }
function loadUser() { const d = localStorage.getItem('treeholeCurrentUser'); if (d) currentUser = JSON.parse(d); }

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

// 第三方登录
window.loginWithWechat = async function() {
    let name = '微信用户' + Math.floor(Math.random() * 10000);
    showLoading(true);
    try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);
        const users = snapshot.val() || {};
        while (Object.values(users).some(u => u.username === name)) name = '微信用户' + Math.floor(Math.random() * 10000);
        
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        users[id] = { id, username: name, avatar: `https://ui-avatars.com/api/?name=${name}&background=07C160&color=fff`, createdAt: new Date().toLocaleString('zh-CN') };
        await set(usersRef, users);
        currentUser = users[id];
        saveUser();
        updateUserInfo();
        hideAuthModal();
        showToast('微信登录成功', 'success');
    } catch (e) { console.error(e); showToast('登录失败', 'error'); }
    finally { showLoading(false); }
};

window.loginWithQQ = async function() {
    let name = 'QQ用户' + Math.floor(Math.random() * 10000);
    showLoading(true);
    try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);
        const users = snapshot.val() || {};
        while (Object.values(users).some(u => u.username === name)) name = 'QQ用户' + Math.floor(Math.random() * 10000);
        
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        users[id] = { id, username: name, avatar: `https://ui-avatars.com/api/?name=${name}&background=12B7F5&color=fff`, createdAt: new Date().toLocaleString('zh-CN') };
        await set(usersRef, users);
        currentUser = users[id];
        saveUser();
        updateUserInfo();
        hideAuthModal();
        showToast('QQ登录成功', 'success');
    } catch (e) { console.error(e); showToast('登录失败', 'error'); }
    finally { showLoading(false); }
};

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
        if (file.size > 2 * 1024 * 1024) { showToast('图片不能超过2MB', 'error'); return; }
        const reader = new FileReader();
        reader.onload = e => { document.getElementById('settings-avatar').src = e.target.result; };
        reader.readAsDataURL(file);
    }
}

async function saveSettings() {
    const username = document.getElementById('settings-username').value.trim();
    const avatar = document.getElementById('settings-avatar').src;
    if (!username) { showToast('请输入用户名', 'error'); return; }
    
    showLoading(true);
    try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);
        const users = snapshot.val() || {};
        
        if (Object.values(users).some(u => u.username === username && u.id !== currentUser.id)) {
            showToast('用户名已被占用', 'error');
            showLoading(false);
            return;
        }
        
        currentUser.username = username;
        currentUser.avatar = avatar;
        users[currentUser.id] = currentUser;
        await set(usersRef, users);
        saveUser();
        updateUserInfo();
        document.getElementById('settings-modal').style.display = 'none';
        showToast('设置保存成功', 'success');
        renderPosts();
    } catch (e) { console.error(e); showToast('保存失败', 'error'); }
    finally { showLoading(false); }
}

// ==================== 帖子 ====================
async function loadPosts() {
    try {
        const snapshot = await get(ref(database, 'posts'));
        const data = snapshot.val();
        if (data) {
            posts = Array.isArray(data) ? data : Object.values(data);
            posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } else { posts = []; }
        renderPosts();
    } catch (e) { console.error(e); showToast('加载失败', 'error'); }
    finally { showLoading(false); }
}

function renderPosts() {
    const container = document.getElementById('posts-container');
    container.innerHTML = '';
    if (posts.length === 0) {
        container.innerHTML = '<p class="no-posts" style="text-align:center;padding:40px;color:#666;">还没有分享，快来发布第一条吧！</p>';
        return;
    }
    posts.forEach(p => container.appendChild(createPostElement(p)));
}

function createPostElement(post) {
    const div = document.createElement('div');
    div.className = 'post-item';
    div.dataset.id = post.id;
    
    // 浏览量（仅首次）
    if (!viewedPosts.has(post.id)) { viewedPosts.add(post.id); incrementViewCount(post.id); }
    
    let media = '';
    if (post.image) media = `<div class="post-item-media"><img src="${post.image}" alt="图片" onclick="toggleImageZoom(this)" loading="lazy"></div>`;
    else if (post.video) media = `<div class="post-item-media"><video controls preload="metadata"><source src="${post.video}"></video></div>`;
    else if (post.voice) media = `<div class="post-item-media"><audio controls preload="metadata"><source src="${post.voice}"></audio></div>`;
    
    const liked = currentUser && post.likedBy?.includes(currentUser.id);
    let user = post.user ? `<div class="post-user" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><img src="${post.user.avatar}" style="width:30px;height:30px;border-radius:50%;"><span style="font-weight:600;color:#667eea;">${post.user.username}</span></div>` : '';
    
    let comments = '';
    if (post.comments?.length) {
        comments = `<div class="post-comments"><h4>评论 (${post.comments.length})</h4><ul class="comments-list">`;
        post.comments.slice(-5).forEach(c => {
            const cu = c.user ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;"><img src="${c.user.avatar}" style="width:20px;height:20px;border-radius:50%;"><span style="font-weight:600;font-size:0.8rem;color:#667eea;">${c.user.username}</span></div>` : '';
            comments += `<li class="comment-item">${cu}<span class="comment-text">${escapeHtml(c.text)}</span><span class="comment-time">${c.timestamp}</span></li>`;
        });
        comments += '</ul></div>';
    }
    
    div.innerHTML = `
        ${user}
        <div class="post-item-content">${escapeHtml(post.text || '')}</div>
        ${media}
        <div class="post-item-meta">
            <span class="post-time">${post.timestamp} · ${post.views || 0} 浏览</span>
            <div class="post-item-actions">
                <button class="action-btn like-btn ${liked ? 'liked' : ''}" data-id="${post.id}"><i class="fas fa-heart"></i> ${post.likes || 0}</button>
                <button class="action-btn delete-btn" data-id="${post.id}"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        ${comments}
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
        const postRef = ref(database, `posts/${postId}`);
        const snap = await get(postRef);
        if (snap.val()) await update(postRef, { views: (snap.val().views || 0) + 1 });
    } catch (e) { console.error('浏览量更新失败', e); }
}

// ==================== 发布 ====================
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) { showToast('图片不能超过5MB', 'error'); return; }
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) { showToast('只支持JPEG/PNG/GIF/WebP', 'error'); return; }
        const reader = new FileReader();
        reader.onload = e => { currentImage = e.target.result; currentVideo = null; currentVoice = null; showToast('图片已选择', 'success'); };
        reader.readAsDataURL(file);
    }
}

function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 20 * 1024 * 1024) { showToast('视频不能超过20MB', 'error'); return; }
        const reader = new FileReader();
        reader.onload = e => { currentVideo = e.target.result; currentImage = null; currentVoice = null; showToast('视频已选择', 'success'); };
        reader.readAsDataURL(file);
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
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                currentVoice = URL.createObjectURL(blob);
                currentImage = null; currentVideo = null;
                showToast('语音录制完成', 'success');
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorder.start();
            btn.innerHTML = '<i class="fas fa-stop"></i> 停止';
            btn.style.background = '#ff6b6b';
            btn.style.color = 'white';
        }).catch(e => { console.error(e); showToast('无法访问麦克风', 'error'); });
    }
}

async function handlePost() {
    const text = document.getElementById('post-text').value.trim();
    if (!text && !currentImage && !currentVideo && !currentVoice) { showToast('请输入内容', 'error'); return; }
    if (!currentUser) { showToast('请先登录', 'error'); showAuthModal(); return; }
    
    showLoading(true);
    const newPost = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text, image: currentImage, video: currentVideo, voice: currentVoice,
        timestamp: new Date().toLocaleString('zh-CN'),
        likes: 0, likedBy: [], comments: [], views: 0,
        user: { id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar }
    };
    
    try {
        const postsRef = ref(database, 'posts');
        const snap = await get(postsRef);
        let all = snap.val() || [];
        if (!Array.isArray(all)) all = Object.values(all);
        all.unshift(newPost);
        await set(postsRef, all);
        posts = all;
        renderPosts();
        document.getElementById('post-text').value = '';
        currentImage = null; currentVideo = null; currentVoice = null;
        document.getElementById('image-upload').value = '';
        document.getElementById('video-upload').value = '';
        showToast('发布成功', 'success');
    } catch (e) { console.error(e); showToast('发布失败', 'error'); }
    finally { showLoading(false); }
}

// ==================== 互动 ====================
async function toggleLike(postId) {
    if (!currentUser) { showToast('请先登录', 'error'); showAuthModal(); return; }
    try {
        const postsRef = ref(database, 'posts');
        const snap = await get(postsRef);
        let all = snap.val() || [];
        if (!Array.isArray(all)) all = Object.values(all);
        const post = all.find(p => p.id === postId);
        if (!post) return;
        if (!post.likedBy) post.likedBy = [];
        
        if (post.likedBy.includes(currentUser.id)) {
            post.likedBy = post.likedBy.filter(id => id !== currentUser.id);
            post.likes = Math.max(0, (post.likes || 0) - 1);
            showToast('已取消点赞', 'success');
        } else {
            post.likedBy.push(currentUser.id);
            post.likes = (post.likes || 0) + 1;
            showToast('点赞成功', 'success');
        }
        
        await set(postsRef, all);
        posts = all;
        renderPosts();
    } catch (e) { console.error(e); showToast('操作失败', 'error'); }
}

async function deletePost(postId) {
    if (!currentUser) { showToast('请先登录', 'error'); showAuthModal(); return; }
    const post = posts.find(p => p.id === postId);
    if (!post?.user || post.user.id !== currentUser.id) { showToast('无权限删除', 'error'); return; }
    if (!confirm('确定删除？')) return;
    
    showLoading(true);
    try {
        const postsRef = ref(database, 'posts');
        const snap = await get(postsRef);
        let all = snap.val() || [];
        if (!Array.isArray(all)) all = Object.values(all);
        all = all.filter(p => p.id !== postId);
        await set(postsRef, all);
        posts = all;
        renderPosts();
        showToast('删除成功', 'success');
    } catch (e) { console.error(e); showToast('删除失败', 'error'); }
    finally { showLoading(false); }
}

async function addComment(postId) {
    const input = document.querySelector(`.comment-input[data-id="${postId}"]`);
    const text = input?.value.trim();
    if (!text) { showToast('请输入评论', 'error'); return; }
    if (!currentUser) { showToast('请先登录', 'error'); showAuthModal(); return; }
    
    try {
        const postsRef = ref(database, 'posts');
        const snap = await get(postsRef);
        let all = snap.val() || [];
        if (!Array.isArray(all)) all = Object.values(all);
        const post = all.find(p => p.id === postId);
        if (!post) return;
        if (!post.comments) post.comments = [];
        
        post.comments.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            text, timestamp: new Date().toLocaleString('zh-CN'),
            user: { id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar }
        });
        
        await set(postsRef, all);
        posts = all;
        renderPosts();
        input.value = '';
        showToast('评论成功', 'success');
    } catch (e) { console.error(e); showToast('评论失败', 'error'); }
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
    if (!sorted.length) { container.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">还没有分享</p>'; return; }
    
    sorted.slice(0, 10).forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'post-item';
        const rankColor = ['#ffd700', '#c0c0c0', '#cd7f32'][i] || '#667eea';
        const liked = currentUser && p.likedBy?.includes(currentUser.id);
        const user = p.user ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><img src="${p.user.avatar}" style="width:30px;height:30px;border-radius:50%;"><span style="font-weight:600;color:#667eea;">${p.user.username}</span></div>` : '';
        
        div.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:15px;">
                <div style="font-size:1.5rem;font-weight:bold;color:${rankColor};">${i + 1}</div>
                <div style="flex:1;">
                    ${user}
                    <div class="post-item-content">${escapeHtml(p.text || '')}</div>
                    <div class="post-item-meta">
                        <span class="post-time">${p.timestamp} · ${p.views || 0} 浏览</span>
                        <button class="action-btn like-btn ${liked ? 'liked' : ''}" onclick="toggleLike('${p.id}')"><i class="fas fa-heart"></i> ${p.likes || 0}</button>
                    </div>
                </div>
            </div>`;
        container.appendChild(div);
    });
};

// ==================== 实时更新 ====================
function startRealTimeUpdates() {
    onValue(ref(database, 'posts'), snap => {
        const data = snap.val();
        if (data) {
            const newPosts = Array.isArray(data) ? data : Object.values(data);
            newPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            if (JSON.stringify(newPosts) !== JSON.stringify(posts)) {
                posts = newPosts;
                renderPosts();
            }
        }
    });
}

// ==================== 好友系统 ====================
function showFriendsModal() {
    if (currentUser) {
        document.getElementById('friends-modal').style.display = 'block';
        loadFriends();
        loadChatFriends();
    }
}

window.switchFriendsTab = function(tab) {
    document.querySelectorAll('.friends-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.friends-content').forEach(c => c.style.display = 'none');
    document.getElementById(tab).style.display = 'block';
    if (tab === 'list') loadFriends();
    else if (tab === 'chat') loadChatFriends();
};

async function loadFriends() {
    const container = document.getElementById('friends-container');
    container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">加载中...</p>';
    try {
        const [fSnap, uSnap] = await Promise.all([get(ref(database, 'friends')), get(ref(database, 'users'))]);
        const friends = fSnap.val()?.[currentUser.id] || [];
        const users = uSnap.val() || {};
        container.innerHTML = '';
        
        if (!friends.length) { container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">还没有好友</p>'; return; }
        friends.forEach(id => {
            const f = users[id];
            if (f) {
                const div = document.createElement('div');
                div.className = 'friend-item';
                div.innerHTML = `<img src="${f.avatar}"><div class="friend-item-info"><div class="friend-item-name">${f.username}</div></div><div class="friend-item-actions"><button class="upload-btn" onclick="startChat('${f.id}')" style="padding:5px 10px;">聊天</button><button class="upload-btn" onclick="removeFriend('${f.id}')" style="padding:5px 10px;">删除</button></div>`;
                container.appendChild(div);
            }
        });
    } catch (e) { console.error(e); container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">加载失败</p>'; }
}

async function loadChatFriends() {
    const container = document.getElementById('chat-friends-list');
    container.innerHTML = '';
    try {
        const [fSnap, uSnap] = await Promise.all([get(ref(database, 'friends')), get(ref(database, 'users'))]);
        const friends = fSnap.val()?.[currentUser.id] || [];
        const users = uSnap.val() || {};
        if (!friends.length) { container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">还没有好友</p>'; return; }
        
        friends.forEach(id => {
            const f = users[id];
            if (f) {
                const div = document.createElement('div');
                div.className = 'chat-friend-item';
                div.dataset.friendId = f.id;
                div.innerHTML = `<img src="${f.avatar}"><span>${f.username}</span>`;
                div.onclick = function() {
                    document.querySelectorAll('.chat-friend-item').forEach(i => i.classList.remove('active'));
                    this.classList.add('active');
                    startChat(f.id);
                };
                container.appendChild(div);
            }
        });
    } catch (e) { console.error(e); }
}

async function addFriend() {
    const input = document.getElementById('add-friend-username').value.trim();
    if (!input) { showToast('请输入用户名或ID', 'error'); return; }
    
    try {
        const uSnap = await get(ref(database, 'users'));
        const users = uSnap.val() || {};
        const user = Object.values(users).find(u => (u.username === input || u.id === input) && u.id !== currentUser.id);
        if (!user) { showToast('未找到该用户', 'error'); return; }
        
        const fSnap = await get(ref(database, 'friends'));
        const friends = fSnap.val() || {};
        const myFriends = friends[currentUser.id] || [];
        if (myFriends.includes(user.id)) { showToast('已经是好友', 'error'); return; }
        
        myFriends.push(user.id);
        friends[currentUser.id] = myFriends;
        await set(ref(database, 'friends'), friends);
        showToast('添加成功', 'success');
        document.getElementById('add-friend-username').value = '';
        loadFriends();
    } catch (e) { console.error(e); showToast('添加失败', 'error'); }
}

window.removeFriend = async function(id) {
    if (!confirm('确定删除此好友？')) return;
    try {
        const fSnap = await get(ref(database, 'friends'));
        const friends = fSnap.val() || {};
        friends[currentUser.id] = (friends[currentUser.id] || []).filter(i => i !== id);
        await set(ref(database, 'friends'), friends);
        loadFriends();
        loadChatFriends();
        showToast('已删除好友', 'success');
    } catch (e) { console.error(e); showToast('删除失败', 'error'); }
};

window.startChat = function(friendId) {
    get(ref(database, 'users')).then(snap => {
        const users = snap.val() || {};
        const f = users[friendId];
        if (f) {
            document.getElementById('chat-friend-name').textContent = f.username;
            loadChatMessages(friendId);
        }
    });
};

async function loadChatMessages(friendId) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    const key = 'chat_' + [currentUser.id, friendId].sort().join('_');
    try {
        const snap = await get(ref(database, 'chats/' + key));
        const msgs = snap.val() || [];
        msgs.forEach(m => {
            const div = document.createElement('div');
            div.className = 'chat-message' + (m.senderId === currentUser.id ? ' self' : '');
            div.innerHTML = `<div class="chat-message-content">${escapeHtml(m.content)}</div><div class="chat-message-time">${m.timestamp}</div>`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    } catch (e) { console.error(e); }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    const activeFriend = document.querySelector('.chat-friend-item.active');
    if (!activeFriend) { showToast('请选择好友', 'error'); return; }
    
    const friendId = activeFriend.dataset.friendId;
    const key = 'chat_' + [currentUser.id, friendId].sort().join('_');
    
    try {
        const snap = await get(ref(database, 'chats/' + key));
        const msgs = snap.val() || [];
        msgs.push({
            id: Date.now().toString(),
            senderId: currentUser.id,
            content: text,
            timestamp: new Date().toLocaleString('zh-CN')
        });
        await set(ref(database, 'chats/' + key), msgs);
        input.value = '';
        loadChatMessages(friendId);
    } catch (e) { console.error(e); showToast('发送失败', 'error'); }
}

async function searchFriends(keyword) {
    const container = document.getElementById('friends-container');
    container.innerHTML = '';
    if (!keyword) { loadFriends(); return; }
    
    try {
        const [fSnap, uSnap] = await Promise.all([get(ref(database, 'friends')), get(ref(database, 'users'))]);
        const friends = fSnap.val()?.[currentUser.id] || [];
        const users = uSnap.val() || {};
        
        const filtered = friends.filter(id => {
            const f = users[id];
            return f && (f.username.toLowerCase().includes(keyword.toLowerCase()) || f.id.includes(keyword));
        });
        
        if (!filtered.length) { container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">未找到匹配的好友</p>'; return; }
        
        filtered.forEach(id => {
            const f = users[id];
            if (f) {
                const div = document.createElement('div');
                div.className = 'friend-item';
                div.innerHTML = `<img src="${f.avatar}"><div class="friend-item-info"><div class="friend-item-name">${f.username}</div><div style="font-size:0.8rem;color:#999;">ID: ${f.id}</div></div><div class="friend-item-actions"><button class="upload-btn" onclick="startChat('${f.id}')" style="padding:5px 10px;">聊天</button><button class="upload-btn" onclick="removeFriend('${f.id}')" style="padding:5px 10px;">删除</button></div>`;
                container.appendChild(div);
            }
        });
    } catch (e) { console.error(e); }
}

// ==================== 导入导出 ====================
window.exportData = function() {
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
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) { showToast('格式无效', 'error'); return; }
            await set(ref(database, 'posts'), imported);
            posts = imported;
            renderPosts();
            showToast('导入成功', 'success');
        } catch (err) { console.error(err); showToast('导入失败', 'error'); }
    };
    reader.readAsText(file);
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

// ==================== 启动 ====================
window.addEventListener('DOMContentLoaded', init);
