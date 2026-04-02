// 文章管理系统

// Firebase配置
const firebaseConfig = {
    apiKey: "AIzaSyB9f4pD1z4g8z8z8z8z8z8z8z8z8z8z8",
    authDomain: "treehole-website-12345.firebaseapp.com",
    databaseURL: "https://treehole-website-12345-default-rtdb.firebaseio.com",
    projectId: "treehole-website-12345",
    storageBucket: "treehole-website-12345.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef1234567890"
};

// 初始化Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 全局变量
let posts = [];
let currentImage = null;
let currentVideo = null;
let currentVoice = null;
let mediaRecorder = null;
let audioChunks = [];

// 初始化
function init() {
    // 从Firebase加载帖子
    loadPosts();
    // 绑定事件
    bindEvents();
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
        likes: 0
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
    
    let mediaHtml = '';
    if (post.image) {
        mediaHtml = `<div class="post-item-media"><img src="${post.image}" alt="图片"></div>`;
    } else if (post.video) {
        mediaHtml = `<div class="post-item-media"><video controls><source src="${post.video}" type="video/mp4">您的浏览器不支持视频播放</video></div>`;
    } else if (post.voice) {
        mediaHtml = `<div class="post-item-media"><audio controls><source src="${post.voice}" type="audio/wav">您的浏览器不支持音频播放</audio></div>`;
    }
    
    postDiv.innerHTML = `
        <div class="post-item-content">${post.text || ''}</div>
        ${mediaHtml}
        <div class="post-item-meta">
            <span class="post-time">${post.timestamp}</span>
            <div class="post-item-actions">
                <button class="action-btn like-btn" onclick="toggleLike(${post.id})"><i class="fas fa-heart"></i> <span>${post.likes}</span></button>
                <button class="action-btn delete-btn" onclick="deletePost(${post.id})"><i class="fas fa-trash"></i> 删除</button>
            </div>
        </div>
    `;
    
    return postDiv;
}

// 切换点赞
function toggleLike(postId) {
    const post = posts.find(p => p.id === postId);
    if (post) {
        post.likes++;
        savePosts();
        renderPosts();
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

// 保存帖子到Firebase
function savePosts() {
    database.ref('posts').set(posts);
}

// 从Firebase加载帖子
function loadPosts() {
    database.ref('posts').once('value', (snapshot) => {
        posts = snapshot.val() || [];
        renderPosts();
    });
}

// 添加一些示例帖子
function addSamplePosts() {
    const samplePosts = [
        {
            id: 1,
            text: '今天天气真好，心情也跟着变好了！',
            image: null,
            video: null,
            timestamp: new Date().toLocaleString('zh-CN'),
            likes: 5
        },
        {
            id: 2,
            text: '分享一张美丽的风景照片',
            image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=beautiful%20landscape%20with%20mountains%20and%20lake&image_size=landscape_16_9',
            video: null,
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
});