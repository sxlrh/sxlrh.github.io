// 文章管理系统

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// 全局变量
let posts = [];
let currentImage = null;
let currentVideo = null;
let currentVoice = null;
let mediaRecorder = null;
let audioChunks = [];
let currentUser = null;
let lastUpdateTime = 0;
let updateInterval = null;
let database = null;
let dbRef = null;

// Firebase配置
const firebaseConfig = {
  apiKey: "AIzaSyAvWzmxHNSHG9wTbjv9dv4Ce-mN_OFBN7g",
  authDomain: "xlsd-f3985.firebaseapp.com",
  databaseURL: "https://xlsd-f3985-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xlsd-f3985",
  storageBucket: "xlsd-f3985.firebasestorage.app",
  messagingSenderId: "728217927193",
  appId: "1:728217927193:web:4a81b4ca32fe38783eb488",
  measurementId: "G-8X11WEXLLJ"
};

// 初始化Firebase
function initFirebase() {
    try {
        // 初始化Firebase应用
        const app = initializeApp(firebaseConfig);
        // 获取数据库引用
        database = getDatabase(app);
        dbRef = ref(database);
        console.log('Firebase初始化成功');
        showToast('数据存储初始化成功，所有用户可以实时共享内容');
    } catch (error) {
        console.error('Firebase初始化失败:', error);
        showToast('Firebase初始化失败，将使用本地存储');
        // 回退到本地存储
        database = {
            ref: function(path) {
                return {
                    once: function(event, callback) {
                        const data = localStorage.getItem('treehole_public_' + path);
                        callback({
                            val: function() {
                                return data ? JSON.parse(data) : null;
                            }
                        });
                    },
                    set: function(data) {
                        localStorage.setItem('treehole_public_' + path, JSON.stringify(data));
                        console.log('数据保存到本地存储成功');
                    },
                    child: function(childPath) {
                        return this;
                    },
                    on: function(event, callback) {
                        // 模拟实时监听
                        setInterval(() => {
                            const data = localStorage.getItem('treehole_public_' + path);
                            callback({
                                val: function() {
                                    return data ? JSON.parse(data) : null;
                                }
                            });
                        }, 5000);
                    }
                };
            }
        };
    }
}

// 显示初始化成功提示

// 初始化
function init() {
    // 初始化Firebase
    initFirebase();
    // 从本地存储加载用户信息
    loadUser();
    // 从Firebase加载帖子
    loadPosts();
    // 渲染帖子
    renderPosts();
    // 绑定事件
    bindEvents();
    // 绑定认证相关事件
    bindAuthEvents();
    // 启动实时数据监听
    startRealTimeUpdates();
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
    
    // 好友按钮点击事件
    document.getElementById('friends-btn').addEventListener('click', showFriendsModal);
    
    // 保存设置按钮点击事件
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    
    // 头像上传事件
    document.getElementById('avatar-upload').addEventListener('change', handleAvatarUpload);
    
    // 添加好友按钮点击事件
    document.getElementById('add-friend-btn').addEventListener('click', addFriend);
    
    // 发送消息按钮点击事件
    document.getElementById('send-message-btn').addEventListener('click', sendMessage);
    
    // 聊天输入框回车事件
    document.getElementById('chat-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // 好友搜索事件
    document.getElementById('friend-search').addEventListener('input', function() {
        searchFriends(this.value);
    });
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
        showToast('请输入用户名和密码');
        return;
    }
    
    // 从Firebase加载用户数据
    const usersRef = ref(database, 'users');
    get(usersRef).then((snapshot) => {
        const users = snapshot.val() || {};
        const user = Object.values(users).find(u => u.username === username && u.password === password);
        
        if (user) {
            currentUser = user;
            saveUser();
            updateUserInfo();
            hideAuthModal();
            showToast('登录成功');
        } else {
            showToast('用户名或密码错误');
        }
    }).catch((error) => {
        console.error('登录失败:', error);
        showToast('登录失败，请检查网络连接');
    });
}

// 注册
function register() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirmPassword = document.getElementById('register-confirm-password').value.trim();
    
    if (!username || !password || !confirmPassword) {
        showToast('请填写所有字段');
        return;
    }
    
    if (password !== confirmPassword) {
        showToast('两次输入的密码不一致');
        return;
    }
    
    // 从Firebase加载用户数据
    const usersRef = ref(database, 'users');
    get(usersRef).then((snapshot) => {
        const users = snapshot.val() || {};
        
        // 检查用户名是否已存在
        if (Object.values(users).some(u => u.username === username)) {
            showToast('用户名已存在');
            return;
        }
        
        // 生成唯一ID
        const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        
        // 创建新用户
        const newUser = {
            id: uniqueId,
            username: username,
            password: password,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff`,
            createdAt: new Date().toLocaleString('zh-CN')
        };
        
        // 保存到Firebase
        users[uniqueId] = newUser;
        set(usersRef, users).then(() => {
            currentUser = newUser;
            saveUser();
            updateUserInfo();
            hideAuthModal();
            showToast('注册成功，您的用户ID是：' + uniqueId);
        }).catch((error) => {
            console.error('注册失败:', error);
            showToast('注册失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('注册失败:', error);
        showToast('注册失败，请检查网络连接');
    });
}

// 微信登录
function loginWithWechat() {
    // 模拟微信登录
    let randomUsername = '微信用户' + Math.floor(Math.random() * 10000);
    
    // 从Firebase加载用户数据
    const usersRef = ref(database, 'users');
    get(usersRef).then((snapshot) => {
        const users = snapshot.val() || {};
        
        // 检查用户名是否已存在
        while (Object.values(users).some(u => u.username === randomUsername)) {
            randomUsername = '微信用户' + Math.floor(Math.random() * 10000);
        }
        
        // 生成唯一ID
        const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        
        const newUser = {
            id: uniqueId,
            username: randomUsername,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(randomUsername)}&background=07C160&color=fff`,
            createdAt: new Date().toLocaleString('zh-CN')
        };
        
        // 保存到Firebase
        users[uniqueId] = newUser;
        set(usersRef, users).then(() => {
            currentUser = newUser;
            saveUser();
            updateUserInfo();
            hideAuthModal();
            showToast('微信登录成功，您的用户ID是：' + uniqueId);
        }).catch((error) => {
            console.error('微信登录失败:', error);
            showToast('微信登录失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('微信登录失败:', error);
        showToast('微信登录失败，请检查网络连接');
    });
}

// QQ登录
function loginWithQQ() {
    // 模拟QQ登录
    let randomUsername = 'QQ用户' + Math.floor(Math.random() * 10000);
    
    // 从Firebase加载用户数据
    const usersRef = ref(database, 'users');
    get(usersRef).then((snapshot) => {
        const users = snapshot.val() || {};
        
        // 检查用户名是否已存在
        while (Object.values(users).some(u => u.username === randomUsername)) {
            randomUsername = 'QQ用户' + Math.floor(Math.random() * 10000);
        }
        
        // 生成唯一ID
        const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        
        const newUser = {
            id: uniqueId,
            username: randomUsername,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(randomUsername)}&background=12B7F5&color=fff`,
            createdAt: new Date().toLocaleString('zh-CN')
        };
        
        // 保存到Firebase
        users[uniqueId] = newUser;
        set(usersRef, users).then(() => {
            currentUser = newUser;
            saveUser();
            updateUserInfo();
            hideAuthModal();
            showToast('QQ登录成功，您的用户ID是：' + uniqueId);
        }).catch((error) => {
            console.error('QQ登录失败:', error);
            showToast('QQ登录失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('QQ登录失败:', error);
        showToast('QQ登录失败，请检查网络连接');
    });
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
        document.getElementById('settings-user-id').value = currentUser.id;
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
    
    // 从Firebase加载用户数据
    const usersRef = ref(database, 'users');
    get(usersRef).then((snapshot) => {
        const users = snapshot.val() || {};
        
        // 更新用户信息
        users[currentUser.id] = currentUser;
        
        // 保存到Firebase
        set(usersRef, users).then(() => {
            // 更新界面显示
            updateUserInfo();
            
            // 隐藏模态框
            document.getElementById('settings-modal').style.display = 'none';
            
            showToast('设置保存成功');
            
            // 重新渲染帖子，更新用户信息
            renderPosts();
            showRanking('likes');
        }).catch((error) => {
            console.error('保存设置失败:', error);
            showToast('保存设置失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('保存设置失败:', error);
        showToast('保存设置失败，请检查网络连接');
    });
}

// 切换图片放大缩小
function toggleImageZoom(img) {
    if (img.classList.contains('zoomed')) {
        img.classList.remove('zoomed');
        img.style.transform = 'scale(1)';
        img.style.cursor = 'zoom-in';
    } else {
        img.classList.add('zoomed');
        img.style.transform = 'scale(2)';
        img.style.cursor = 'zoom-out';
        img.style.zIndex = '100';
        img.style.position = 'relative';
        img.style.transition = 'transform 0.3s ease';
    }
}

// 显示操作反馈
function showToast(message) {
    // 创建toast元素
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    // 添加到页面
    document.body.appendChild(toast);
    
    // 显示toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // 3秒后隐藏toast
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// 启动自动更新
function startAutoUpdate() {
    // 每5秒检查一次更新
    updateInterval = setInterval(() => {
        checkForUpdates();
    }, 5000);
}

// 检查更新
function checkForUpdates() {
    try {
        // 从公共存储加载最新的帖子
        database.ref('posts').once('value', (snapshot) => {
            let updatedPosts = snapshot.val() || [];
            
            // 确保是数组
            if (!Array.isArray(updatedPosts)) {
                updatedPosts = Object.values(updatedPosts);
            }
            
            // 检查是否有新内容
            if (updatedPosts.length !== posts.length) {
                posts = updatedPosts;
                renderPosts();
                showToast('有新内容更新');
                console.log('检测到新内容，当前帖子数:', posts.length);
            } else {
                // 检查是否有内容变化
                const currentPostsString = JSON.stringify(posts);
                const updatedPostsString = JSON.stringify(updatedPosts);
                if (currentPostsString !== updatedPostsString) {
                    posts = updatedPosts;
                    renderPosts();
                    showToast('内容已更新');
                    console.log('检测到内容变化，已更新');
                }
            }
        });
    } catch (error) {
        console.error('检查更新失败:', error);
    }
}

// 启动实时数据监听
function startRealTimeUpdates() {
    try {
        // 监听帖子数据变化
        const postsRef = ref(database, 'posts');
        onValue(postsRef, (snapshot) => {
            let updatedPosts = snapshot.val() || [];
            
            // 确保是数组
            if (!Array.isArray(updatedPosts)) {
                updatedPosts = Object.values(updatedPosts);
            }
            
            // 检查是否有新内容
            if (JSON.stringify(updatedPosts) !== JSON.stringify(posts)) {
                posts = updatedPosts;
                renderPosts();
                showToast('内容已更新');
                console.log('实时更新：检测到内容变化');
            }
        });
        
        // 监听用户数据变化
        const usersRef = ref(database, 'users');
        onValue(usersRef, (snapshot) => {
            const users = snapshot.val() || {};
            // 如果当前用户存在，更新用户信息
            if (currentUser && users[currentUser.id]) {
                currentUser = users[currentUser.id];
                saveUser();
                updateUserInfo();
            }
        });
        
        console.log('实时数据监听已启动');
    } catch (error) {
        console.error('启动实时数据监听失败:', error);
        // 回退到轮询更新
        startAutoUpdate();
    }
}

// 停止自动更新
function stopAutoUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

// 显示好友模态框
function showFriendsModal() {
    if (currentUser) {
        document.getElementById('friends-modal').style.display = 'block';
        loadFriends();
        loadChatFriends();
    }
}

// 切换好友标签
function switchFriendsTab(tab) {
    // 切换标签状态
    const tabs = document.querySelectorAll('.friends-tab');
    tabs.forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    // 切换内容显示
    const contents = document.querySelectorAll('.friends-content');
    contents.forEach(c => c.style.display = 'none');
    document.getElementById(tab).style.display = 'block';
    
    // 加载对应内容
    if (tab === 'list') {
        loadFriends();
    } else if (tab === 'chat') {
        loadChatFriends();
    }
}

// 加载好友列表
function loadFriends() {
    const friendsContainer = document.getElementById('friends-container');
    friendsContainer.innerHTML = '';
    
    // 从Firebase加载好友数据
    const friendsRef = ref(database, 'friends');
    get(friendsRef).then((friendsSnapshot) => {
        const friendsData = friendsSnapshot.val() || {};
        const friends = friendsData[currentUser.id] || [];
        
        if (friends.length === 0) {
            friendsContainer.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">还没有好友，快去添加吧！</p>';
            return;
        }
        
        // 从Firebase加载所有用户数据
        const usersRef = ref(database, 'users');
        get(usersRef).then((usersSnapshot) => {
            const users = usersSnapshot.val() || {};
            
            friends.forEach(friendId => {
                const friend = users[friendId];
                if (friend) {
                    const friendElement = document.createElement('div');
                    friendElement.className = 'friend-item';
                    friendElement.innerHTML = `
                        <img src="${friend.avatar}" alt="${friend.username}">
                        <div class="friend-item-info">
                            <div class="friend-item-name">${friend.username}</div>
                        </div>
                        <div class="friend-item-actions">
                            <button class="upload-btn" onclick="startChat('${friend.id}')" style="padding: 5px 10px;">聊天</button>
                            <button class="upload-btn" onclick="removeFriend('${friend.id}')" style="padding: 5px 10px;">删除</button>
                        </div>
                    `;
                    friendsContainer.appendChild(friendElement);
                }
            });
        }).catch((error) => {
            console.error('加载用户数据失败:', error);
            showToast('加载好友列表失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('加载好友数据失败:', error);
        showToast('加载好友列表失败，请检查网络连接');
    });
}

// 加载聊天好友列表
function loadChatFriends() {
    const chatFriendsList = document.getElementById('chat-friends-list');
    chatFriendsList.innerHTML = '';
    
    // 从Firebase加载好友数据
    const friendsRef = ref(database, 'friends');
    get(friendsRef).then((friendsSnapshot) => {
        const friendsData = friendsSnapshot.val() || {};
        const friends = friendsData[currentUser.id] || [];
        
        if (friends.length === 0) {
            chatFriendsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">还没有好友，快去添加吧！</p>';
            return;
        }
        
        // 从Firebase加载所有用户数据
        const usersRef = ref(database, 'users');
        get(usersRef).then((usersSnapshot) => {
            const users = usersSnapshot.val() || {};
            
            friends.forEach(friendId => {
                const friend = users[friendId];
                if (friend) {
                    const friendElement = document.createElement('div');
                    friendElement.className = 'chat-friend-item';
                    friendElement.dataset.friendId = friend.id;
                    friendElement.innerHTML = `
                        <img src="${friend.avatar}" alt="${friend.username}">
                        <span>${friend.username}</span>
                    `;
                    friendElement.addEventListener('click', function() {
                        // 移除其他好友的active状态
                        document.querySelectorAll('.chat-friend-item').forEach(item => {
                            item.classList.remove('active');
                        });
                        // 添加当前好友的active状态
                        this.classList.add('active');
                        // 开始聊天
                        startChat(friend.id);
                    });
                    chatFriendsList.appendChild(friendElement);
                }
            });
        }).catch((error) => {
            console.error('加载用户数据失败:', error);
            showToast('加载聊天好友列表失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('加载好友数据失败:', error);
        showToast('加载聊天好友列表失败，请检查网络连接');
    });
}

// 添加好友
function addFriend() {
    const input = document.getElementById('add-friend-username').value.trim();
    
    if (!input) {
        alert('请输入好友用户名或用户ID');
        return;
    }
    
    // 从Firebase加载所有用户数据
    const usersRef = ref(database, 'users');
    get(usersRef).then((usersSnapshot) => {
        const users = usersSnapshot.val() || {};
        
        // 查找用户（同时支持用户名和ID）
        const user = Object.values(users).find(u => (u.username === input || u.id === input) && u.id !== currentUser.id);
        
        if (!user) {
            showToast('未找到该用户');
            return;
        }
        
        // 从Firebase加载好友数据
        const friendsRef = ref(database, 'friends');
        get(friendsRef).then((friendsSnapshot) => {
            const friendsData = friendsSnapshot.val() || {};
            const userFriends = friendsData[currentUser.id] || [];
            
            // 检查是否已经是好友
            if (userFriends.includes(user.id)) {
                showToast('已经是好友了');
                return;
            }
            
            // 添加好友
            userFriends.push(user.id);
            friendsData[currentUser.id] = userFriends;
            
            // 保存到Firebase
            set(friendsRef, friendsData).then(() => {
                showToast('添加好友成功');
                document.getElementById('add-friend-username').value = '';
                loadFriends();
            }).catch((error) => {
                console.error('添加好友失败:', error);
                showToast('添加好友失败，请检查网络连接');
            });
        }).catch((error) => {
            console.error('加载好友数据失败:', error);
            showToast('添加好友失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('加载用户数据失败:', error);
        showToast('添加好友失败，请检查网络连接');
    });
}

// 删除好友
function removeFriend(friendId) {
    if (confirm('确定要删除这个好友吗？')) {
        // 从Firebase加载好友数据
        const friendsRef = ref(database, 'friends');
        get(friendsRef).then((friendsSnapshot) => {
            const friendsData = friendsSnapshot.val() || {};
            let userFriends = friendsData[currentUser.id] || [];
            
            // 删除好友
            userFriends = userFriends.filter(id => id !== friendId);
            friendsData[currentUser.id] = userFriends;
            
            // 保存到Firebase
            set(friendsRef, friendsData).then(() => {
                loadFriends();
                loadChatFriends();
                showToast('好友已删除');
            }).catch((error) => {
                console.error('删除好友失败:', error);
                showToast('删除好友失败，请检查网络连接');
            });
        }).catch((error) => {
            console.error('加载好友数据失败:', error);
            showToast('删除好友失败，请检查网络连接');
        });
    }
}

// 获取好友列表
function getFriends() {
    // 从公共存储加载好友数据
    let friends = [];
    database.ref('friends').once('value', (snapshot) => {
        const friendsData = snapshot.val() || {};
        friends = friendsData[currentUser.id] || [];
    });
    return friends;
}

// 开始聊天
function startChat(friendId) {
    // 从Firebase加载所有用户数据
    const usersRef = ref(database, 'users');
    get(usersRef).then((snapshot) => {
        const users = snapshot.val() || {};
        const friend = users[friendId];
        
        if (friend) {
            document.getElementById('chat-friend-name').textContent = friend.username;
            loadChatMessages(friendId);
        }
    }).catch((error) => {
        console.error('加载用户数据失败:', error);
        showToast('加载聊天信息失败，请检查网络连接');
    });
}

// 加载聊天消息
function loadChatMessages(friendId) {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';
    
    // 从Firebase加载聊天记录
    const chatKey = 'chat_' + Math.min(currentUser.id, friendId) + '_' + Math.max(currentUser.id, friendId);
    const chatRef = ref(database, 'chats/' + chatKey);
    get(chatRef).then((snapshot) => {
        const messages = snapshot.val() || [];
        
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message' + (message.senderId === currentUser.id ? ' self' : '');
            messageElement.innerHTML = `
                <div class="chat-message-content">${message.content}</div>
                <div class="chat-message-time">${message.timestamp}</div>
            `;
            chatMessages.appendChild(messageElement);
        });
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }).catch((error) => {
        console.error('加载聊天消息失败:', error);
        showToast('加载聊天消息失败，请检查网络连接');
    });
}

// 搜索好友
function searchFriends(keyword) {
    const friendsContainer = document.getElementById('friends-container');
    friendsContainer.innerHTML = '';
    
    // 从Firebase加载好友数据
    const friendsRef = ref(database, 'friends');
    get(friendsRef).then((friendsSnapshot) => {
        const friendsData = friendsSnapshot.val() || {};
        const friends = friendsData[currentUser.id] || [];
        
        if (friends.length === 0) {
            friendsContainer.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">还没有好友，快去添加吧！</p>';
            return;
        }
        
        // 从Firebase加载所有用户数据
        const usersRef = ref(database, 'users');
        get(usersRef).then((usersSnapshot) => {
            const users = usersSnapshot.val() || {};
            
            // 过滤好友
            const filteredFriends = friends.filter(friendId => {
                const friend = users[friendId];
                return friend && (friend.username.toLowerCase().includes(keyword.toLowerCase()) || friend.id.includes(keyword));
            });
            
            if (filteredFriends.length === 0) {
                friendsContainer.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">未找到匹配的好友</p>';
                return;
            }
            
            filteredFriends.forEach(friendId => {
                const friend = users[friendId];
                if (friend) {
                    const friendElement = document.createElement('div');
                    friendElement.className = 'friend-item';
                    friendElement.innerHTML = `
                        <img src="${friend.avatar}" alt="${friend.username}">
                        <div class="friend-item-info">
                            <div class="friend-item-name">${friend.username}</div>
                            <div style="font-size: 0.8rem; color: #999;">ID: ${friend.id}</div>
                        </div>
                        <div class="friend-item-actions">
                            <button class="upload-btn" onclick="startChat('${friend.id}')" style="padding: 5px 10px;">聊天</button>
                            <button class="upload-btn" onclick="removeFriend('${friend.id}')" style="padding: 5px 10px;">删除</button>
                        </div>
                    `;
                    friendsContainer.appendChild(friendElement);
                }
            });
        }).catch((error) => {
            console.error('加载用户数据失败:', error);
            showToast('搜索好友失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('加载好友数据失败:', error);
        showToast('搜索好友失败，请检查网络连接');
    });
}

// 发送消息
function sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const content = chatInput.value.trim();
    
    if (!content) {
        return;
    }
    
    // 获取当前聊天的好友
    const activeFriend = document.querySelector('.chat-friend-item.active');
    if (!activeFriend) {
        showToast('请选择一个好友开始聊天');
        return;
    }
    
    const friendId = activeFriend.dataset.friendId;
    
    // 创建消息
    const message = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        senderId: currentUser.id,
        content: content,
        timestamp: new Date().toLocaleString('zh-CN')
    };
    
    // 保存消息到Firebase
    const chatKey = 'chat_' + Math.min(currentUser.id, friendId) + '_' + Math.max(currentUser.id, friendId);
    const chatRef = ref(database, 'chats/' + chatKey);
    get(chatRef).then((snapshot) => {
        const messages = snapshot.val() || [];
        messages.push(message);
        set(chatRef, messages).then(() => {
            // 清空输入框
            chatInput.value = '';
            
            // 重新加载消息
            loadChatMessages(friendId);
            
            // 显示发送成功提示
            showToast('消息发送成功');
        }).catch((error) => {
            console.error('发送消息失败:', error);
            showToast('发送消息失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('加载聊天记录失败:', error);
        showToast('发送消息失败，请检查网络连接');
    });
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
        showToast('请输入内容或上传媒体');
        return;
    }
    
    // 确保用户已登录
    if (!currentUser) {
        showToast('请先登录');
        showAuthModal();
        return;
    }
    
    // 创建新帖子
    const newPost = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text: text,
        image: currentImage,
        video: currentVideo,
        voice: currentVoice,
        timestamp: new Date().toLocaleString('zh-CN'),
        likes: 0,
        likedBy: [],
        comments: [],
        views: 0,
        user: {
            id: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar
        }
    };
    
    // 从Firebase加载最新的帖子（确保不会覆盖其他用户的帖子）
    const postsRef = ref(database, 'posts');
    get(postsRef).then((snapshot) => {
        let latestPosts = snapshot.val() || [];
        
        // 确保是数组
        if (!Array.isArray(latestPosts)) {
            latestPosts = Object.values(latestPosts);
        }
        
        // 添加新帖子
        latestPosts.unshift(newPost);
        
        // 保存到Firebase
        set(postsRef, latestPosts).then(() => {
            // 更新本地帖子数组
            posts = latestPosts;
            
            // 渲染帖子
            renderPosts();
            
            // 清空表单
            document.getElementById('post-text').value = '';
            currentImage = null;
            currentVideo = null;
            currentVoice = null;
            document.getElementById('image-upload').value = '';
            document.getElementById('video-upload').value = '';
            
            // 显示发布成功提示
            showToast('发布成功');
            console.log('发布成功，当前帖子数:', posts.length);
        }).catch((error) => {
            console.error('发布帖子失败:', error);
            showToast('发布帖子失败，请检查网络连接');
        });
    }).catch((error) => {
        console.error('加载帖子失败:', error);
        showToast('发布帖子失败，请检查网络连接');
    });
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
        mediaHtml = `<div class="post-item-media"><img src="${post.image}" alt="图片" onclick="toggleImageZoom(this)"></div>`;
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
            // 评论用户信息
        let commentUserHtml = '';
        if (comment.user) {
            commentUserHtml = `<div class="comment-user" style="display: flex; align-items: center; gap: 5px; margin-bottom: 5px;">
                <img src="${comment.user.avatar}" alt="${comment.user.username}" style="width: 20px; height: 20px; border-radius: 50%;">
                <span style="font-weight: 600; font-size: 0.8rem; color: #667eea;">${comment.user.username}</span>
            </div>`;
        }
        
        commentsHtml += `<li class="comment-item">
                ${commentUserHtml}
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
    // 确保用户已登录
    if (!currentUser) {
        showToast('请先登录');
        showAuthModal();
        return;
    }
    
    // 从Firebase加载最新的帖子
    const postsRef = ref(database, 'posts');
    get(postsRef).then((snapshot) => {
        let latestPosts = snapshot.val() || [];
        
        // 确保是数组
        if (!Array.isArray(latestPosts)) {
            latestPosts = Object.values(latestPosts);
        }
        
        const post = latestPosts.find(p => p.id === postId);
        
        if (post) {
            // 检查是否已经点过赞
            if (!post.likedBy) {
                post.likedBy = [];
            }
            
            if (!post.likedBy.includes(currentUser.id)) {
                post.likedBy.push(currentUser.id);
                post.likes++;
                
                // 保存到Firebase
                set(postsRef, latestPosts).then(() => {
                    // 更新本地帖子数组
                    posts = latestPosts;
                    
                    // 渲染帖子
                    renderPosts();
                    
                    // 更新点赞榜
                    const activeTab = document.querySelector('.ranking-tab.active');
                    if (activeTab && activeTab.textContent.includes('点赞')) {
                        showRanking('likes');
                    }
                    
                    // 显示点赞成功提示
                    showToast('点赞成功');
                    console.log('点赞成功，当前点赞数:', post.likes);
                }).catch((error) => {
                    console.error('点赞失败:', error);
                    showToast('点赞失败，请检查网络连接');
                });
            } else {
                showToast('你已经点过赞了');
            }
        }
    }).catch((error) => {
        console.error('加载帖子失败:', error);
        showToast('点赞失败，请检查网络连接');
    });
}

// 删除帖子
function deletePost(postId) {
    // 确保用户已登录
    if (!currentUser) {
        showToast('请先登录');
        showAuthModal();
        return;
    }
    
    // 从Firebase加载最新的帖子
    const postsRef = ref(database, 'posts');
    get(postsRef).then((snapshot) => {
        let latestPosts = snapshot.val() || [];
        
        // 确保是数组
        if (!Array.isArray(latestPosts)) {
            latestPosts = Object.values(latestPosts);
        }
        
        const post = latestPosts.find(p => p.id === postId);
        
        // 检查是否是帖子的作者
        if (!post || !post.user || post.user.id !== currentUser.id) {
            showToast('你没有权限删除这条帖子');
            return;
        }
        
        if (confirm('确定要删除这条分享吗？')) {
            // 从数组中删除帖子
            const updatedPosts = latestPosts.filter(p => p.id !== postId);
            
            // 保存到Firebase
            set(postsRef, updatedPosts).then(() => {
                // 更新本地帖子数组
                posts = updatedPosts;
                
                // 渲染帖子
                renderPosts();
                
                // 显示删除成功提示
                showToast('删除成功');
                console.log('删除成功，剩余帖子数:', posts.length);
            }).catch((error) => {
                console.error('删除帖子失败:', error);
                showToast('删除帖子失败，请检查网络连接');
            });
        }
    }).catch((error) => {
        console.error('加载帖子失败:', error);
        showToast('删除帖子失败，请检查网络连接');
    });
}

// 保存帖子到Firebase
function savePosts() {
    // 直接保存帖子数组
    const postsRef = ref(database, 'posts');
    set(postsRef, posts).then(() => {
        console.log('保存帖子到Firebase成功，当前帖子数:', posts.length);
    }).catch((error) => {
        console.error('保存帖子失败:', error);
    });
}

// 从Firebase加载帖子
function loadPosts() {
    try {
        const postsRef = ref(database, 'posts');
        get(postsRef).then((snapshot) => {
            const storedPosts = snapshot.val();
            if (storedPosts) {
                // 确保posts是数组
                if (Array.isArray(storedPosts)) {
                    posts = storedPosts;
                } else {
                    posts = Object.values(storedPosts);
                }
                console.log('加载到', posts.length, '个帖子');
            } else {
                // 初始化空帖子数组
                posts = [];
                set(postsRef, []);
                console.log('初始化空帖子数组');
            }
            // 渲染帖子
            renderPosts();
        }).catch((error) => {
            console.error('加载帖子失败:', error);
            showToast('加载帖子失败');
        });
    } catch (error) {
        console.error('加载帖子失败:', error);
        showToast('加载帖子失败');
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
        showToast('请输入评论内容');
        return;
    }
    
    // 确保用户已登录
    if (!currentUser) {
        showToast('请先登录');
        showAuthModal();
        return;
    }
    
    // 从Firebase加载最新的帖子
    const postsRef = ref(database, 'posts');
    get(postsRef).then((snapshot) => {
        let latestPosts = snapshot.val() || [];
        
        // 确保是数组
        if (!Array.isArray(latestPosts)) {
            latestPosts = Object.values(latestPosts);
        }
        
        const post = latestPosts.find(p => p.id === postId);
        
        if (post) {
            if (!post.comments) {
                post.comments = [];
            }
            
            const newComment = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                text: commentText,
                timestamp: new Date().toLocaleString('zh-CN'),
                user: {
                    id: currentUser.id,
                    username: currentUser.username,
                    avatar: currentUser.avatar
                }
            };
            
            post.comments.push(newComment);
            
            // 保存到Firebase
            set(postsRef, latestPosts).then(() => {
                // 更新本地帖子数组
                posts = latestPosts;
                
                // 渲染帖子
                renderPosts();
                showRanking('comments'); // 更新评论榜
                
                // 清空评论输入框
                commentInput.value = '';
                
                // 显示评论成功提示
                showToast('评论成功');
                console.log('评论成功，当前评论数:', post.comments.length);
            }).catch((error) => {
                console.error('添加评论失败:', error);
                showToast('添加评论失败，请检查网络连接');
            });
        }
    }).catch((error) => {
        console.error('加载帖子失败:', error);
        showToast('添加评论失败，请检查网络连接');
    });
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
        mediaHtml = `<div class="post-item-media"><img src="${post.image}" alt="图片" onclick="toggleImageZoom(this)"></div>`;
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
            // 评论用户信息
        let commentUserHtml = '';
        if (comment.user) {
            commentUserHtml = `<div class="comment-user" style="display: flex; align-items: center; gap: 5px; margin-bottom: 5px;">
                <img src="${comment.user.avatar}" alt="${comment.user.username}" style="width: 20px; height: 20px; border-radius: 50%;">
                <span style="font-weight: 600; font-size: 0.8rem; color: #667eea;">${comment.user.username}</span>
            </div>`;
        }
        
        commentsHtml += `<li class="comment-item">
                ${commentUserHtml}
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