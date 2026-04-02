// 文章管理系统

// 全局变量
let posts = [];
let currentImage = null;
let currentVideo = null;
let currentVoice = null;
let mediaRecorder = null;
let audioChunks = [];
let currentUser = null;

// 初始化
function init() {
    // 从本地存储加载用户信息
    loadUser();
    // 从本地存储加载帖子
    loadPosts();
    // 渲染帖子
    renderPosts();
    // 绑定事件
    bindEvents();
    // 绑定认证相关事件
    bindAuthEvents();
}

// 绑定事件
function bindEvents() {
    // 发布按钮点击事件
    document.getElementById('post-button').addEventListener('click', handlePost);
    
    // 图片上传事件
    document.getElementById('image-upload').addEventListener('change', handleImageUpload);
    
    // 视频上传事件
    document.getElementById('video-upload').addEventListener('change', handleVideoUpload);
    
    // 语音录制按钮点击事件
    document.getElementById('voice-record').addEventListener('click', toggleVoiceRecord);
}

// 绑定认证相关事件
function bindAuthEvents() {
    // 登录/注册按钮点击事件
    document.getElementById('login-btn').addEventListener('click', showAuthModal);
    
    // 关闭模态框按钮点击事件
    const closeButtons = document.querySelectorAll('.close-btn');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            modal.style.display = 'none';
        });
    });
    
    // 点击模态框外部关闭
    window.addEventListener('click', function(event) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // 登录按钮点击事件
    document.getElementById('submit-login').addEventListener('click', login);
    
    // 注册按钮点击事件
    document.getElementById('submit-register').addEventListener('click', register);
    
    // 退出按钮点击事件
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // 设置按钮点击事件
    document.getElementById('settings-btn').addEventListener('click', showSettingsModal);
    
    // 保存设置按钮点击事件
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    
    // 头像上传事件
    document.getElementById('avatar-upload').addEventListener('change', handleAvatarUpload);
}

// 显示认证模态框
function showAuthModal() {
    document.getElementById('auth-modal').style.display = 'block';
}

// 隐藏认证模态框
function hideAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

// 切换登录/注册标签
function switchAuthTab(tab) {
    // 切换标签状态
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    // 切换表单显示
    if (tab === 'login') {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('modal-title').textContent = '登录';
    } else {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
        document.getElementById('modal-title').textContent = '注册';
    }
}

// 登录
function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    
    if (!username || !password) {
        alert('请输入用户名和密码');
        return;
    }
    
    // 从本地存储加载用户数据
    const users = JSON.parse(localStorage.getItem('treeholeUsers')) || [];
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        currentUser = user;
        saveUser();
        updateUserInfo();
        hideAuthModal();
        alert('登录成功');
    } else {
        alert('用户名或密码错误');
    }
}

// 注册
function register() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirmPassword = document.getElementById('register-confirm-password').value.trim();
    
    if (!username || !password || !confirmPassword) {
        alert('请填写所有字段');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('两次输入的密码不一致');
        return;
    }
    
    // 从本地存储加载用户数据
    const users = JSON.parse(localStorage.getItem('treeholeUsers')) || [];
    
    // 检查用户名是否已存在
    if (users.some(u => u.username === username)) {
        alert('用户名已存在');
        return;
    }
    
    // 创建新用户
    const newUser = {
        id: Date.now(),
        username: username,
        password: password,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff`,
        createdAt: new Date().toLocaleString('zh-CN')
    };
    
    users.push(newUser);
    localStorage.setItem('treeholeUsers', JSON.stringify(users));
    
    currentUser = newUser;
    saveUser();
    updateUserInfo();
    hideAuthModal();
    alert('注册成功');
}

// 微信登录
function loginWithWechat() {
    // 模拟微信登录
    const randomUsername = '微信用户' + Math.floor(Math.random() * 10000);
    const newUser = {
        id: Date.now(),
        username: randomUsername,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(randomUsername)}&background=07C160&color=fff`,
        createdAt: new Date().toLocaleString('zh-CN')
    };
    
    currentUser = newUser;
    saveUser();
    updateUserInfo();
    hideAuthModal();
    alert('微信登录成功');
}

// QQ登录
function loginWithQQ() {
    // 模拟QQ登录
    const randomUsername = 'QQ用户' + Math.floor(Math.random() * 10000);
    const newUser = {
        id: Date.now(),
        username: randomUsername,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(randomUsername)}&background=12B7F5&color=fff`,
        createdAt: new Date().toLocaleString('zh-CN')
    };
    
    currentUser = newUser;
    saveUser();
    updateUserInfo();
    hideAuthModal();
    alert('QQ登录成功');
}

// 退出登录
function logout() {
    currentUser = null;
    localStorage.removeItem('treeholeCurrentUser');
    updateUserInfo();
    alert('已退出登录');
}

// 保存用户信息到本地存储
function saveUser() {
    if (currentUser) {
        localStorage.setItem('treeholeCurrentUser', JSON.stringify(currentUser));
    }
}

// 从本地存储加载用户信息
function loadUser() {
    const userData = localStorage.getItem('treeholeCurrentUser');
    if (userData) {
        currentUser = JSON.parse(userData);
        updateUserInfo();
    }
}

// 更新用户信息显示
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

// 显示设置模态框
function showSettingsModal() {
    if (currentUser) {
        document.getElementById('settings-avatar').src = currentUser.avatar;
        document.getElementById('settings-username').value = currentUser.username;
        document.getElementById('settings-modal').style.display = 'block';
    }
}

// 处理头像上传
function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('settings-avatar').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// 保存设置
function saveSettings() {
    const username = document.getElementById('settings-username').value.trim();
    const avatar = document.getElementById('settings-avatar').src;
    
    if (!username) {
        alert('请输入用户名');
        return;
    }
    
    // 更新当前用户信息
    currentUser.username = username;
    currentUser.avatar = avatar;
    
    // 更新本地存储中的用户信息
    saveUser();
    
    // 更新用户列表中的信息
    const users = JSON.parse(localStorage.getItem('treeholeUsers')) || [];
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
        users[userIndex] = currentUser;
        localStorage.setItem('treeholeUsers', JSON.stringify(users));
    }
    
    // 更新界面显示
    updateUserInfo();
    
    // 隐藏模态框
    document.getElementById('settings-modal').style.display = 'none';
    
    alert('设置保存成功');
    
    // 重新渲染帖子，更新用户信息
    renderPosts();
    showRanking('likes');
}

// 处理图片上传
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentImage = e.target.result;
            currentVideo = null; // 清除视频
            currentVoice = null; // 清除语音
            alert('图片已选择');
        };
        reader.readAsDataURL(file);
    }
}

// 处理视频上传
function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentVideo = e.target.result;
            currentImage = null; // 清除图片
            currentVoice = null; // 清除语音
            alert('视频已选择');
        };
        reader.readAsDataURL(file);
    }
}

// 切换语音录制状态
function toggleVoiceRecord() {
    const recordButton = document.getElementById('voice-record');
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        // 停止录制
        mediaRecorder.stop();
        recordButton.innerHTML = '<i class="fas fa-microphone"></i> 语音';
        recordButton.style.background = '#f8f9fa';
        recordButton.style.color = '#666';
    } else {
        // 开始录制
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = function(e) {
                    audioChunks.push(e.data);
                };
                
                mediaRecorder.onstop = function() {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(audioBlob);
                    currentVoice = audioUrl;
                    currentImage = null; // 清除图片
                    currentVideo = null; // 清除视频
                    alert('语音录制完成');
                    
                    // 停止媒体流
                    stream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorder.start();
                recordButton.innerHTML = '<i class="fas fa-stop"></i> 停止';
                recordButton.style.background = '#ff6b6b';
                recordButton.style.color = 'white';
            })
            .catch(err => {
                console.error('无法访问麦克风:', err);
                alert('无法访问麦克风，请检查权限设置');
            });
    }
}

// 处理发布
function handlePost() {
    const text = document.getElementById('post-text').value.trim();
    
    if (!text && !currentImage && !currentVideo && !currentVoice) {
        alert('请输入内容或上传媒体');
        return;
    }
    
    // 创建新帖子
    const newPost = {
        id: Date.now(),
        text: text,
        image: currentImage,
        video: currentVideo,
        voice: currentVoice,
        timestamp: new Date().toLocaleString('zh-CN'),
        likes: 0,
        likedBy: [],
        comments: [],
        views: 0,
        user: currentUser ? {
            id: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar
        } : null
    };
    
    // 添加到帖子数组
    posts.unshift(newPost);
    
    // 保存到本地存储
    savePosts();
    
    // 渲染帖子
    renderPosts();
    
    // 清空表单
    document.getElementById('post-text').value = '';
    currentImage = null;
    currentVideo = null;
    currentVoice = null;
    document.getElementById('image-upload').value = '';
    document.getElementById('video-upload').value = '';
}

// 渲染帖子
function renderPosts() {
    const container = document.getElementById('posts-container');
    container.innerHTML = '';
    
    if (posts.length === 0) {
        container.innerHTML = '<p class="no-posts">还没有分享，快来发布第一条吧！</p>';
        return;
    }
    
    posts.forEach(post => {
        const postElement = createPostElement(post);
        container.appendChild(postElement);
    });
}

// 创建帖子元素
function createPostElement(post) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post-item';
    postDiv.dataset.id = post.id;
    
    // 增加浏览次数
    if (!post.views) {
        post.views = 0;
    }
    post.views++;
    savePosts();
    
    let mediaHtml = '';
    if (post.image) {
        mediaHtml = `<div class="post-item-media"><img src="${post.image}" alt="图片"></div>`;
    } else if (post.video) {
        mediaHtml = `<div class="post-item-media"><video controls><source src="${post.video}" type="video/mp4">您的浏览器不支持视频播放</video></div>`;
    } else if (post.voice) {
        mediaHtml = `<div class="post-item-media"><audio controls><source src="${post.voice}" type="audio/wav">您的浏览器不支持音频播放</div>`;
    }
    
    // 检查用户是否已点赞
    let userId = localStorage.getItem('treeholeUserId');
    if (!userId) {
        userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('treeholeUserId', userId);
    }
    
    const isLiked = post.likedBy && post.likedBy.includes(userId);
    const likeButtonClass = isLiked ? 'action-btn like-btn liked' : 'action-btn like-btn';
    
    // 渲染评论
    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
        commentsHtml = `<div class="post-comments">
            <h4>评论 (${post.comments.length})</h4>
            <ul class="comments-list">`;
        post.comments.forEach(comment => {
            commentsHtml += `<li class="comment-item">
                <span class="comment-text">${comment.text}</span>
                <span class="comment-time">${comment.timestamp}</span>
            </li>`;
        });
        commentsHtml += `</ul></div>`;
    }
    
    // 用户信息
    let userHtml = '';
    if (post.user) {
        userHtml = `<div class="post-user" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <img src="${post.user.avatar}" alt="${post.user.username}" class="user-avatar" style="width: 30px; height: 30px;">
            <span class="user-name" style="font-weight: 600; color: #667eea;">${post.user.username}</span>
        </div>`;
    }
    
    postDiv.innerHTML = `
        ${userHtml}
        <div class="post-item-content">${post.text || ''}</div>
        ${mediaHtml}
        <div class="post-item-meta">
            <span class="post-time">${post.timestamp} · ${post.views} 浏览</span>
            <div class="post-item-actions">
                <button class="${likeButtonClass}" onclick="toggleLike(${post.id})"><i class="fas fa-heart"></i> <span>${post.likes}</span></button>
                <button class="action-btn delete-btn" onclick="deletePost(${post.id})"><i class="fas fa-trash"></i> 删除</button>
            </div>
        </div>
        ${commentsHtml}
        <div class="comment-form">
            <input type="text" class="comment-input" placeholder="写下你的评论..." data-post-id="${post.id}">
            <button class="comment-btn" onclick="addComment(${post.id})"><i class="fas fa-paper-plane"></i></button>
        </div>
    `;
    
    return postDiv;
}

// 切换点赞
function toggleLike(postId) {
    const post = posts.find(p => p.id === postId);
    if (post) {
        // 获取用户标识（使用localStorage存储）
        let userId = localStorage.getItem('treeholeUserId');
        if (!userId) {
            userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('treeholeUserId', userId);
        }
        
        // 检查是否已经点过赞
        if (!post.likedBy) {
            post.likedBy = [];
        }
        
        if (!post.likedBy.includes(userId)) {
            post.likedBy.push(userId);
            post.likes++;
            savePosts();
            renderPosts();
            // 更新点赞榜
            const activeTab = document.querySelector('.ranking-tab.active');
            if (activeTab && activeTab.textContent.includes('点赞')) {
                showRanking('likes');
            }
        } else {
            alert('你已经点过赞了');
        }
    }
}

// 删除帖子
function deletePost(postId) {
    if (confirm('确定要删除这条分享吗？')) {
        posts = posts.filter(p => p.id !== postId);
        savePosts();
        renderPosts();
    }
}

// 保存帖子到本地存储
function savePosts() {
    localStorage.setItem('treeholePosts', JSON.stringify(posts));
}

// 从本地存储加载帖子
function loadPosts() {
    const storedPosts = localStorage.getItem('treeholePosts');
    if (storedPosts) {
        posts = JSON.parse(storedPosts);
    }
}

// 导出数据
function exportData() {
    const dataStr = JSON.stringify(posts);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'treehole-data.json';
    link.click();
}

// 导入数据
function importData(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedPosts = JSON.parse(e.target.result);
                if (Array.isArray(importedPosts)) {
                    posts = importedPosts;
                    savePosts();
                    renderPosts();
                    alert('数据导入成功');
                } else {
                    alert('无效的数据格式');
                }
            } catch (error) {
                alert('数据导入失败');
            }
        };
        reader.readAsText(file);
    }
}

// 添加评论
function addComment(postId) {
    const commentInput = document.querySelector(`.comment-input[data-post-id="${postId}"]`);
    const commentText = commentInput.value.trim();
    
    if (!commentText) {
        alert('请输入评论内容');
        return;
    }
    
    const post = posts.find(p => p.id === postId);
    if (post) {
        if (!post.comments) {
            post.comments = [];
        }
        
        const newComment = {
            id: Date.now(),
            text: commentText,
            timestamp: new Date().toLocaleString('zh-CN')
        };
        
        post.comments.push(newComment);
        savePosts();
        renderPosts();
        showRanking('comments'); // 更新评论榜
        
        // 清空评论输入框
        commentInput.value = '';
    }
}

// 显示排行榜
function showRanking(type) {
    // 更新标签状态
    const tabs = document.querySelectorAll('.ranking-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    // 排序帖子
    let sortedPosts = [...posts];
    
    switch (type) {
        case 'likes':
            sortedPosts.sort((a, b) => (b.likes || 0) - (a.likes || 0));
            break;
        case 'views':
            sortedPosts.sort((a, b) => (b.views || 0) - (a.views || 0));
            break;
        case 'comments':
            sortedPosts.sort((a, b) => (b.comments ? b.comments.length : 0) - (a.comments ? a.comments.length : 0));
            break;
    }
    
    // 显示前10个帖子
    const rankingContainer = document.getElementById('ranking-container');
    rankingContainer.innerHTML = '';
    
    if (sortedPosts.length === 0) {
        rankingContainer.innerHTML = '<p class="no-posts">还没有分享，快来发布第一条吧！</p>';
        return;
    }
    
    const topPosts = sortedPosts.slice(0, 10);
    topPosts.forEach((post, index) => {
        const postElement = createRankingPostElement(post, index + 1);
        rankingContainer.appendChild(postElement);
    });
}

// 创建排行榜帖子元素
function createRankingPostElement(post, rank) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post-item';
    postDiv.dataset.id = post.id;
    
    let mediaHtml = '';
    if (post.image) {
        mediaHtml = `<div class="post-item-media"><img src="${post.image}" alt="图片"></div>`;
    } else if (post.video) {
        mediaHtml = `<div class="post-item-media"><video controls><source src="${post.video}" type="video/mp4">您的浏览器不支持视频播放</video></div>`;
    } else if (post.voice) {
        mediaHtml = `<div class="post-item-media"><audio controls><source src="${post.voice}" type="audio/wav">您的浏览器不支持音频播放</div>`;
    }
    
    // 检查用户是否已点赞
    let userId = localStorage.getItem('treeholeUserId');
    if (!userId) {
        userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('treeholeUserId', userId);
    }
    
    const isLiked = post.likedBy && post.likedBy.includes(userId);
    const likeButtonClass = isLiked ? 'action-btn like-btn liked' : 'action-btn like-btn';
    
    // 渲染评论
    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
        commentsHtml = `<div class="post-comments">
            <h4>评论 (${post.comments.length})</h4>
            <ul class="comments-list">`;
        post.comments.forEach(comment => {
            commentsHtml += `<li class="comment-item">
                <span class="comment-text">${comment.text}</span>
                <span class="comment-time">${comment.timestamp}</span>
            </li>`;
        });
        commentsHtml += `</ul></div>`;
    }
    
    // 用户信息
    let userHtml = '';
    if (post.user) {
        userHtml = `<div class="post-user" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <img src="${post.user.avatar}" alt="${post.user.username}" class="user-avatar" style="width: 30px; height: 30px;">
            <span class="user-name" style="font-weight: 600; color: #667eea;">${post.user.username}</span>
        </div>`;
    }
    
    postDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 15px;">
            <div class="rank-number">${rank}</div>
            <div style="flex: 1;">
                ${userHtml}
                <div class="post-item-content">${post.text || ''}</div>
                ${mediaHtml}
                <div class="post-item-meta">
                    <span class="post-time">${post.timestamp} · ${post.views} 浏览</span>
                    <div class="post-item-actions">
                        <button class="${likeButtonClass}" onclick="toggleLike(${post.id})"><i class="fas fa-heart"></i> <span>${post.likes}</span></button>
                        <button class="action-btn delete-btn" onclick="deletePost(${post.id})"><i class="fas fa-trash"></i> 删除</button>
                    </div>
                </div>
                ${commentsHtml}
                <div class="comment-form">
                    <input type="text" class="comment-input" placeholder="写下你的评论..." data-post-id="${post.id}">
                    <button class="comment-btn" onclick="addComment(${post.id})"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        </div>
    `;
    
    return postDiv;
}

// 添加一些示例帖子
function addSamplePosts() {
    const samplePosts = [
        {
            id: 1,
            text: '今天天气真好，心情也跟着变好了！',
            image: null,
            video: null,
            voice: null,
            timestamp: new Date().toLocaleString('zh-CN'),
            likes: 5
        },
        {
            id: 2,
            text: '分享一张美丽的风景照片',
            image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=beautiful%20landscape%20with%20mountains%20and%20lake&image_size=landscape_16_9',
            video: null,
            voice: null,
            timestamp: new Date(Date.now() - 3600000).toLocaleString('zh-CN'),
            likes: 12
        }
    ];
    
    posts = [...samplePosts, ...posts];
    savePosts();
    renderPosts();
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', function() {
    init();
    // 添加示例帖子
    if (posts.length === 0) {
        addSamplePosts();
    }
    // 初始化排行榜
    showRanking('likes');
});