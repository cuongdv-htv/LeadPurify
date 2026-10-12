const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createServer } = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { createZipBuffer } = require('./zipHelper');

function callApify(url, token) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            startUrls: [{ url }],
            resultsLimit: 1
        });
        const req = https.request(`https://api.apify.com/v2/actors/apify~facebook-posts-scraper/run-sync-get-dataset-items?token=${token}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
                } else {
                    reject(new Error(`Apify error: ${res.statusCode} - ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function isApifyTokenError(errMessage) {
    if (!errMessage || typeof errMessage !== 'string') return false;
    return errMessage.includes('401') || 
           errMessage.includes('403') || 
           errMessage.includes('429') || 
           errMessage.includes('user-or-token-not-found') || 
           errMessage.includes('token is not valid') ||
           errMessage.includes('authentication token is not valid') ||
           errMessage.includes('insufficient-permissions') ||
           errMessage.includes('rate-limit-exceeded');
}

function optimizeFacebookAvatarUrl(url) {
    if (!url || typeof url !== 'string') return url;
    try {
        let trimmed = url.trim();
        if (trimmed.includes('fbcdn.net')) {
            const u = new URL(trimmed);
            if (u.searchParams.has('ctp')) {
                u.searchParams.delete('ctp');
                return u.toString();
            }
        }
    } catch(e) {}
    if (url.includes('ctp=')) {
        return url.replace(/([?&])ctp=s\d+x\d+(&|$)/g, (match, p1, p2) => (p2 === '&' ? p1 : '')).replace(/[?&]$/, '');
    }
    return url;
}

function isPlaceholderOrStockImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.trim().toLowerCase();
    return (
        lower.includes('images.unsplash.com') ||
        lower.includes('unsplash.com') ||
        lower.includes('via.placeholder.com') ||
        lower.includes('placeholder.com') ||
        lower.includes('dummyimage.com') ||
        lower.includes('picsum.photos') ||
        lower.includes('freepik.com') ||
        lower.includes('shutterstock.com') ||
        lower.includes('pixabay.com') ||
        lower.includes('pexels.com') ||
        lower.includes('placehold.it') ||
        lower.includes('placekitten.com')
    );
}

function isFacebookCdnUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.trim().toLowerCase();
    if (lower.includes('static.xx.fbcdn.net') || lower.includes('rsrc.php')) {
        return false;
    }
    return lower.includes('fbcdn.net') || lower.includes('fbsbx.com');
}

function getFacebookGraphAvatarUrl(fbLink) {
    if (!fbLink || typeof fbLink !== 'string') return null;

    try {
        let urlString = fbLink.trim();
        if (!urlString.startsWith('http')) {
            urlString = 'https://' + urlString;
        }

        const urlObj = new URL(urlString);
        if (!urlObj.hostname.includes('facebook.com') && !urlObj.hostname.includes('fb.com')) {
            return null;
        }

        // 1. Dạng query parameter id: profile.php?id=123456...
        if (urlObj.pathname.includes('profile.php')) {
            const id = urlObj.searchParams.get('id');
            if (id) {
                return `https://graph.facebook.com/${id}/picture?width=800`;
            }
        }

        const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
        if (pathParts.length === 0) return null;

        let usernameOrId = null;

        // 2. Dạng đường dẫn /p/Ten-Page-100090527019929/ hoặc /p/100090527019929/
        if (pathParts[0] === 'p' && pathParts.length >= 2) {
            const m = pathParts[1].match(/(\d{8,})/);
            if (m) {
                usernameOrId = m[1];
            } else {
                usernameOrId = pathParts[1];
            }
        } else if (pathParts[0] === 'people' && pathParts.length >= 2) {
            // Dạng /people/Ten/100090527019929/
            const m = pathParts[pathParts.length - 1].match(/(\d{8,})/);
            if (m) {
                usernameOrId = m[1];
            } else {
                usernameOrId = pathParts[pathParts.length - 1];
            }
        } else if (!['groups', 'events', 'watch', 'marketplace', 'gaming', 'stories'].includes(pathParts[0].toLowerCase())) {
            // Dạng /username hoặc /username/videos/...
            usernameOrId = pathParts[0];
        }

        if (usernameOrId && !['p', 'people', 'home.php', 'watch', 'stories'].includes(usernameOrId)) {
            return `https://graph.facebook.com/${usernameOrId}/picture?width=800`;
        }

        return null;
    } catch (error) {
        return null;
    }
}

function isActivityCheckKey(key) {
    if (!key) return false;
    return /^active_within/i.test(key) || /^latest_post_date$/i.test(key);
}

function reorderRowColumns(row) {
    if (!row || typeof row !== 'object') return row;
    const keys = Object.keys(row);
    const activeKeys = keys.filter(k => /^active_within/i.test(k));
    const postDateKeys = keys.filter(k => /^latest_post_date$/i.test(k));
    const specialKeys = [...activeKeys, ...postDateKeys];
    
    if (specialKeys.length === 0) return row;
    
    const newRow = {};
    for (const k of keys) {
        if (!specialKeys.includes(k)) {
            newRow[k] = row[k];
        }
    }
    for (const k of specialKeys) {
        newRow[k] = row[k];
    }
    return newRow;
}

function cleanRowForDownload(row) {
    if (!row || typeof row !== 'object') return row;
    const newRow = {};
    for (const k of Object.keys(row)) {
        if (!isActivityCheckKey(k)) {
            let val = row[k];
            if (typeof val === 'string' && val.includes('fbcdn.net') && val.includes('ctp=')) {
                val = optimizeFacebookAvatarUrl(val);
            }
            newRow[k] = val;
        }
    }
    return newRow;
}

function getFormattedTimestamp(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${y}${m}${day}_${hh}${mm}${ss}`;
}

function cleanBaseFilename(filename) {
    if (!filename) return 'leads';
    let base = path.basename(filename).replace(/\.[^/.]+$/, "");
    // Loại bỏ prefix FixAvatar_ hoặc Partial_
    base = base.replace(/^(FixAvatar_|Partial_)+/i, '');
    // Loại bỏ hậu tố trạng thái lặp lại
    base = base.replace(/(_alive|_dead|_checked)+/gi, '');
    // Loại bỏ timestamp cũ (dạng epoch 13 số hoặc định dạng YYYYMMDD_HHmmss)
    base = base.replace(/_\d{13}/g, '');
    base = base.replace(/_\d{8}_\d{6}/g, '');
    base = base.trim().replace(/^_+|_+$/g, '');
    return base || 'leads';
}

function formatDownloadFilename(filename, fileStats = null) {
    if (!filename) return `leads_${getFormattedTimestamp()}.csv`;
    const ext = path.extname(filename).toLowerCase() || '.csv';
    
    // Nếu là file ZIP, giữ hoặc gắn đuôi timestamp chuẩn
    if (ext === '.zip') {
        if (/_\d{8}_\d{6}\.zip$/i.test(filename)) return filename;
        const baseZip = path.basename(filename, ext).replace(/_\d{8}_\d{6}$/, '');
        const ts = (fileStats && fileStats.mtime) ? getFormattedTimestamp(fileStats.mtime) : getFormattedTimestamp();
        return `${baseZip}_${ts}.zip`;
    }

    const isPartial = /^Partial_/i.test(path.basename(filename));
    const isDead = /_dead/i.test(path.basename(filename));
    const isAlive = /_alive/i.test(path.basename(filename));
    const isChecked = /_checked/i.test(path.basename(filename));

    const cleanBase = cleanBaseFilename(filename);
    const ts = (fileStats && fileStats.mtime) ? getFormattedTimestamp(fileStats.mtime) : getFormattedTimestamp();

    const prefix = isPartial ? 'Partial_' : '';
    let status = '';
    if (isDead) status = '_dead';
    else if (isAlive) status = '_alive';
    else if (isChecked) status = '_checked';

    return `${prefix}${cleanBase}${status}_${ts}${ext}`;
}

function getConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        if (!fs.existsSync(configPath)) return { maxUsagePerKey: 400, minDelay: 2000, maxDelay: 5000, facebookCookie: '' };
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (cfg.facebookCookie === undefined) cfg.facebookCookie = '';
        return cfg;
    } catch(e) { return { maxUsagePerKey: 400, minDelay: 2000, maxDelay: 5000, facebookCookie: '' }; }
}

function getApifyKey() {
    try {
        const config = getConfig();
        const keysPath = path.join(__dirname, 'apify_keys.json');
        if (!fs.existsSync(keysPath)) return null;
        let keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        const activeKey = keys.find(k => k.status === 'active' && k.usage < config.maxUsagePerKey);
        return activeKey ? activeKey.key : null;
    } catch(e) { return null; }
}

function incrementKeyUsage(token) {
    try {
        const keysPath = path.join(__dirname, 'apify_keys.json');
        let keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        const k = keys.find(k => k.key === token);
        if (k) { k.usage = (k.usage || 0) + 1; fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2)); }
    } catch(e) {}
}

function markKeyAsExpired(token) {
    try {
        const keysPath = path.join(__dirname, 'apify_keys.json');
        let keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        const k = keys.find(k => k.key === token);
        if (k) { k.status = 'expired'; fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2)); }
    } catch(e) {}
}

const app = express();
app.use(cors({
  origin: '*',
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());

const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('outputs')) fs.mkdirSync('outputs', { recursive: true });

const QUEUE_FILE = path.join(__dirname, 'queue.json');
const QUEUE_BAK_FILE = path.join(__dirname, 'queue.json.bak');
const CHECKPOINT_DIR = path.join(__dirname, 'outputs');

// --- HỆ THỐNG CHECKPOINT (TIẾN ĐỘ TRUNG GIAN) ---
function getCheckpointPath(jobId) {
    return path.join(CHECKPOINT_DIR, `checkpoint_${jobId}.json`);
}

function loadCheckpoint(jobId) {
    const cpPath = getCheckpointPath(jobId);
    if (fs.existsSync(cpPath)) {
        try {
            return JSON.parse(fs.readFileSync(cpPath, 'utf8'));
        } catch(e) {
            console.error(`[LeadPurify] Lỗi đọc checkpoint của job ${jobId}:`, e.message);
        }
    }
    return null;
}

function saveCheckpoint(jobId, data) {
    const cpPath = getCheckpointPath(jobId);
    try {
        const tmpPath = `${cpPath}.tmp`;
        const str = JSON.stringify(data, null, 2);
        try {
            fs.writeFileSync(tmpPath, str, 'utf8');
            try {
                fs.renameSync(tmpPath, cpPath);
            } catch (renErr) {
                fs.writeFileSync(cpPath, str, 'utf8');
                try { fs.unlinkSync(tmpPath); } catch(uErr) {}
            }
        } catch (wrErr) {
            fs.writeFileSync(cpPath, str, 'utf8');
        }
    } catch(e) {
        console.error(`[LeadPurify] Lỗi lưu checkpoint của job ${jobId}:`, e.message);
    }
}

function removeCheckpoint(jobId) {
    const cpPath = getCheckpointPath(jobId);
    if (fs.existsSync(cpPath)) {
        try { fs.unlinkSync(cpPath); } catch(e) {}
    }
}

// --- QUẢN LÝ TIẾN TRÌNH & TRÌNH DUYỆT (CHỐNG TREO/CRASH) ---
const activeBrowsers = new Set();
let currentRunningJob = null;
let isShuttingDown = false;

// --- LƯU TRỮ HÀNG ĐỢI AN TOÀN (ATOMIC WRITE & BACKUP) ---
let queue = [];

function saveQueue() {
    try {
        const tmpFile = `${QUEUE_FILE}.tmp`;
        const data = JSON.stringify(queue, null, 2);
        if (fs.existsSync(QUEUE_FILE)) {
            try { fs.copyFileSync(QUEUE_FILE, QUEUE_BAK_FILE); } catch(e) {}
        }
        try {
            fs.writeFileSync(tmpFile, data, 'utf8');
            try {
                fs.renameSync(tmpFile, QUEUE_FILE);
            } catch (renameErr) {
                // Trên Windows, renameSync có thể bị EPERM nếu tệp đang bị khóa tạm thời
                fs.writeFileSync(QUEUE_FILE, data, 'utf8');
                try { fs.unlinkSync(tmpFile); } catch(uErr) {}
            }
        } catch (writeErr) {
            fs.writeFileSync(QUEUE_FILE, data, 'utf8');
        }
    } catch(err) {
        console.error('[LeadPurify] Lỗi lưu queue.json:', err.message);
    }
}

// --- KHỞI TẠO VÀ PHỤC HỒI DỮ LIỆU KHI KHỞI ĐỘNG (STARTUP RECOVERY) ---
function initQueue() {
    let raw = null;
    if (fs.existsSync(QUEUE_FILE)) {
        try {
            raw = fs.readFileSync(QUEUE_FILE, 'utf8');
            queue = JSON.parse(raw);
        } catch(e) {
            console.error('[LeadPurify] queue.json bị lỗi/hỏng, thử khôi phục từ queue.json.bak:', e.message);
            if (fs.existsSync(QUEUE_BAK_FILE)) {
                try {
                    raw = fs.readFileSync(QUEUE_BAK_FILE, 'utf8');
                    queue = JSON.parse(raw);
                    console.log('[LeadPurify] Đã khôi phục thành công từ queue.json.bak');
                } catch(bakErr) {
                    console.error('[LeadPurify] Tệp dự phòng cũng bị lỗi:', bakErr.message);
                    queue = [];
                }
            }
        }
    }

    let recoveredCount = 0;
    queue.forEach(job => {
        const cp = loadCheckpoint(job.id);
        if (cp) {
            job.hasCheckpoint = true;
        }

        // Bắt các job đang chạy hoặc tạm dừng bị đứt đoạn do server tắt đột ngột
        if (job.status === 'RUNNING' || job.status === 'PAUSED') {
            job.status = 'INTERRUPTED';
            recoveredCount++;
            if (job.lastStartedAt) {
                job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
                job.lastStartedAt = null;
            }
            if (!job.logs) job.logs = [];
            job.logs.push({ 
                message: 'Tiến trình bị gián đoạn do máy chủ tắt đột ngột. Hệ thống đã bảo toàn tiến độ đã quét. Bạn có thể nhấn "Tiếp tục" hoặc "Chạy lại".', 
                type: 'warning', 
                timestamp: new Date().toISOString() 
            });
        }
    });

    if (recoveredCount > 0) {
        console.log(`[LeadPurify] Đã phát hiện và đánh dấu ${recoveredCount} tiến trình bị gián đoạn (INTERRUPTED)`);
    }

    saveQueue();
}
initQueue();

// --- QUẢN LÝ DỌN DẸP FILE (UPLOADS & OUTPUTS) ---
function getJobFilePaths(job) {
    const filePaths = [];
    if (!job) return filePaths;

    // 1. File input ban đầu (thường nằm ở uploads/ hoặc outputs/)
    if (job.filePath) {
        const p = path.isAbsolute(job.filePath) ? path.normalize(job.filePath) : path.normalize(path.join(__dirname, job.filePath));
        filePaths.push(p);
    }

    // 2. File kết quả từ downloadLinks (aliveFile, deadFile, checkedFile,...)
    if (job.downloadLinks) {
        for (const val of Object.values(job.downloadLinks)) {
            if (typeof val === 'string') {
                const fn = decodeURIComponent(val.split('/').pop().split('?')[0]);
                if (fn) {
                    filePaths.push(path.normalize(path.join(__dirname, 'outputs', fn)));
                }
            }
        }
    }

    // 3. File checkpoint
    filePaths.push(path.normalize(getCheckpointPath(job.id)));
    filePaths.push(path.normalize(`${getCheckpointPath(job.id)}.tmp`));

    return filePaths;
}

function deleteJobFiles(job, remainingJobs = []) {
    if (!job) return;

    // Danh sách file đang được tham chiếu bởi các job còn lại trong hệ thống
    const remainingReferenced = new Set();
    for (const rj of remainingJobs) {
        for (const p of getJobFilePaths(rj)) {
            remainingReferenced.add(p);
        }
    }

    // Xóa các file của job này nếu không có job nào khác đang dùng
    const pathsToDelete = getJobFilePaths(job);
    for (const p of pathsToDelete) {
        if (!remainingReferenced.has(p) && fs.existsSync(p)) {
            try {
                fs.unlinkSync(p);
                console.log(`[LeadPurify] Đã xóa file: ${p}`);
            } catch (e) {
                console.error(`[LeadPurify] Lỗi khi xóa file ${p}:`, e.message);
            }
        }
    }

    // Xóa các file partial hay checkpoint có chứa jobId trong tên tệp ở thư mục outputs
    try {
        const outputsDir = path.join(__dirname, 'outputs');
        if (fs.existsSync(outputsDir)) {
            const files = fs.readdirSync(outputsDir);
            for (const file of files) {
                if (file.includes(job.id)) {
                    const fullPath = path.normalize(path.join(outputsDir, file));
                    if (!remainingReferenced.has(fullPath) && fs.existsSync(fullPath)) {
                        try {
                            fs.unlinkSync(fullPath);
                            console.log(`[LeadPurify] Đã xóa checkpoint/partial file: ${fullPath}`);
                        } catch (e) {}
                    }
                }
            }
        }
    } catch (e) {}
}

function cleanAllOrphanedFiles() {
    const referenced = new Set();
    for (const job of queue) {
        for (const p of getJobFilePaths(job)) {
            referenced.add(p);
        }
    }

    let deletedCount = 0;
    let freedBytes = 0;

    // Dọn dẹp thư mục outputs
    const outputsDir = path.join(__dirname, 'outputs');
    if (fs.existsSync(outputsDir)) {
        try {
            const files = fs.readdirSync(outputsDir);
            for (const file of files) {
                if (file === '.gitkeep') continue;
                const fullPath = path.normalize(path.join(outputsDir, file));
                if (!referenced.has(fullPath) && fs.existsSync(fullPath)) {
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isFile()) {
                            freedBytes += stat.size;
                            fs.unlinkSync(fullPath);
                            deletedCount++;
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }

    // Dọn dẹp thư mục uploads
    const uploadsDir = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadsDir)) {
        try {
            const files = fs.readdirSync(uploadsDir);
            for (const file of files) {
                if (file === '.gitkeep') continue;
                const fullPath = path.normalize(path.join(uploadsDir, file));
                if (!referenced.has(fullPath) && fs.existsSync(fullPath)) {
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isFile()) {
                            freedBytes += stat.size;
                            fs.unlinkSync(fullPath);
                            deletedCount++;
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }

    return { deletedCount, freedBytes };
}

// --- XỬ LÝ ĐÓNG SERVER AN TOÀN (GRACEFUL SHUTDOWN) ---
async function handleShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[LeadPurify] Đang xử lý đóng hệ thống an toàn (${signal})...`);

    // Đánh dấu job đang chạy sang trạng thái INTERRUPTED
    queue.forEach(job => {
        if (job.status === 'RUNNING' || job.status === 'PAUSED') {
            job.status = 'INTERRUPTED';
            if (job.lastStartedAt) {
                job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
                job.lastStartedAt = null;
            }
            if (!job.logs) job.logs = [];
            job.logs.push({ 
                message: `Hệ thống dừng (${signal}): Tiến trình đã được lưu an toàn`, 
                type: 'warning', 
                timestamp: new Date().toISOString() 
            });
            const cp = loadCheckpoint(job.id);
            if (cp) job.hasCheckpoint = true;
        }
    });

    saveQueue();

    // Đóng toàn bộ các tab và browser Puppeteer đang mở để tránh zombie process
    for (const b of activeBrowsers) {
        try {
            await b.close();
        } catch(e) {}
    }
    activeBrowsers.clear();

    console.log('[LeadPurify] Toàn bộ dữ liệu và tiến trình trình duyệt đã được dọn dẹp sạch sẽ.');
    server.close(() => {
        process.exit(0);
    });

    setTimeout(() => {
        process.exit(0);
    }, 2500);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGHUP', () => handleShutdown('SIGHUP'));
process.on('SIGBREAK', () => handleShutdown('SIGBREAK'));
process.on('uncaughtException', (err) => {
    console.error('[LeadPurify] Uncaught Exception:', err);
    handleShutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason) => {
    console.error('[LeadPurify] Unhandled Rejection:', reason);
});

let isWorkerRunning = false;

io.on('connection', (socket) => {
  socket.emit('queue_update', queue);
});



function pushLog(job, message, type = 'info') {
  const log = { message, type, timestamp: new Date().toISOString() };
  if (!job.logs) job.logs = [];
  job.logs.push(log);
  if (job.logs.length > 50) job.logs.shift(); 
  io.emit('job_log', { jobId: job.id, log });
}

function broadcastQueue() {
  io.emit('queue_update', queue);
  saveQueue();
}

async function processQueue() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  
  try {
    while (true) {
      let job = queue.find(j => j.status === 'RUNNING');
      if (!job) {
         job = queue.find(j => j.status === 'PENDING');
         if (job) {
            job.status = 'RUNNING';
            job.lastStartedAt = Date.now();
            broadcastQueue();
         }
      }
      
      if (!job) break;
      
      try {
         await runJob(job);
      } catch(e) {
         if (job.status !== 'REMOVED' && job.status !== 'CANCELED' && job.status !== 'INTERRUPTED') {
           job.status = 'ERROR';
           if (job.lastStartedAt) {
               job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
               job.lastStartedAt = null;
           }
           pushLog(job, `Lỗi hệ thống: ${e.message}`, 'error');
         }
      }
      broadcastQueue();
    }
  } catch(err) {
    console.error('[LeadPurify] Lỗi vòng lặp worker processQueue:', err);
  } finally {
    isWorkerRunning = false;
    broadcastQueue();
  }
}

function checkImageUrlValid(url, timeoutMs = 6000) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return Promise.resolve(false);
    }
    return new Promise((resolve) => {
        try {
            const client = url.startsWith('https:') ? https : http;
            const req = client.request(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Range': 'bytes=0-1024'
                },
                timeout: timeoutMs
            }, (res) => {
                const statusCode = res.statusCode;
                const contentType = (res.headers['content-type'] || '').toLowerCase();
                res.destroy();
                if (statusCode >= 200 && statusCode < 400 && (contentType.startsWith('image/') || contentType.includes('octet-stream'))) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.on('error', () => {
                resolve(false);
            });
            req.end();
        } catch(e) {
            resolve(false);
        }
    });
}

function extractAvatarFromHtml(html) {
    if (!html || typeof html !== 'string') return null;

    // 1. Thẻ meta og:image, og:image:url hoặc twitter:image
    const ogMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image)["']/i);
    
    if (ogMatch && ogMatch[1]) {
        let url = ogMatch[1].replace(/&amp;/g, '&').trim();
        if (!url.includes('static.xx.fbcdn.net') && !url.includes('fb_icon_325x325') && (url.includes('fbcdn.net') || url.includes('scontent') || url.startsWith('http'))) {
            return optimizeFacebookAvatarUrl(url);
        }
    }

    // 2. Tìm trong script JSON nhúng của Facebook (Relay store profile_picture)
    const scriptMatches = html.match(/"profile_picture":\s*\{\s*"uri":\s*"([^"]+)"/i) ||
                          html.match(/"profilePic":\s*\{\s*"uri":\s*"([^"]+)"/i);
    if (scriptMatches && scriptMatches[1]) {
        let uri = scriptMatches[1].replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
        if (uri.startsWith('http') && !uri.includes('static.xx.fbcdn.net')) {
            return optimizeFacebookAvatarUrl(uri);
        }
    }

    return null;
}

function fetchFacebookAvatarViaHttp(fbUrl, timeoutMs = 7000, redirectCount = 0) {
    if (!fbUrl || typeof fbUrl !== 'string' || redirectCount > 3) return Promise.resolve(null);
    return new Promise((resolve) => {
        try {
            let targetUrl = fbUrl.trim();
            if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;
            
            const client = targetUrl.startsWith('https:') ? https : http;
            const req = client.request(targetUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                timeout: timeoutMs
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.destroy();
                    const redirectUrl = res.headers.location.startsWith('http') 
                        ? res.headers.location 
                        : new URL(res.headers.location, targetUrl).toString();
                    return resolve(fetchFacebookAvatarViaHttp(redirectUrl, timeoutMs, redirectCount + 1));
                }

                if (res.statusCode !== 200) {
                    res.destroy();
                    return resolve(null);
                }

                let html = '';
                let isDestroyed = false;
                res.on('data', chunk => {
                    html += chunk.toString('utf8');
                    if (html.includes('property="og:image"') || html.includes('property=\'og:image\'') || html.includes('name="twitter:image"')) {
                        if (html.length > 60000 && !isDestroyed) {
                            isDestroyed = true;
                            res.destroy();
                            const avatar = extractAvatarFromHtml(html);
                            resolve(avatar);
                        }
                    }
                });

                res.on('end', () => {
                    if (!isDestroyed) {
                        const avatar = extractAvatarFromHtml(html);
                        resolve(avatar);
                    }
                });

                res.on('error', () => {
                    if (!isDestroyed) resolve(null);
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });
            req.on('error', () => resolve(null));
            req.end();
        } catch(e) {
            resolve(null);
        }
    });
}

async function fetchFacebookAvatarViaPuppeteer(page, fbUrl) {
    if (!page || !fbUrl) return null;
    try {
        await page.goto(fbUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 1200));

        const avatar = await page.evaluate(() => {
            // 1. Thẻ meta
            const meta = document.querySelector('meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"]');
            if (meta && meta.content) {
                const c = meta.content;
                if (!c.includes('static.xx.fbcdn.net') && !c.includes('fb_icon_325x325')) {
                    return c;
                }
            }

            // 2. SVG profile image
            const svgImgs = document.querySelectorAll('svg image, image[preserveAspectRatio]');
            for (const img of svgImgs) {
                const href = img.getAttribute('xlink:href') || img.getAttribute('href');
                if (href && (href.includes('fbcdn.net') || href.includes('scontent')) && !href.includes('rsrc.php')) {
                    return href;
                }
            }

            // 3. Thẻ img avatar
            const imgSelectors = [
                'img[role="img"]',
                'img[data-imgperflogname="profileCoverPhoto"] ~ img',
                'img[alt*="ảnh đại diện" i]',
                'img[alt*="profile picture" i]',
                'img[aria-label*="avatar" i]'
            ];
            for (const sel of imgSelectors) {
                const el = document.querySelector(sel);
                if (el && el.src && (el.src.includes('fbcdn.net') || el.src.includes('scontent')) && !el.src.includes('rsrc.php')) {
                    return el.src;
                }
            }

            // 4. Script JSON Relay store
            const scripts = document.querySelectorAll('script[type="application/json"]');
            for (const s of scripts) {
                const text = s.textContent;
                if (text && text.includes('profile_picture') && text.includes('uri')) {
                    const m = text.match(/"profile_picture":\s*\{\s*"uri":\s*"([^"]+)"/);
                    if (m && m[1]) {
                        return m[1].replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
                    }
                }
            }

            return null;
        });

        if (avatar) {
            return optimizeFacebookAvatarUrl(avatar);
        }
        return null;
    } catch(err) {
        return null;
    }
}

async function extractFacebookAvatar(fbUrl, browser, existingPage = null) {
    if (!fbUrl) return null;

    // Tầng 1: Fast HTTP GET (~300ms, siêu tốc không tốn tài nguyên trình duyệt)
    try {
        const httpAvatar = await fetchFacebookAvatarViaHttp(fbUrl);
        if (httpAvatar) return httpAvatar;
    } catch(e) {}

    // Tầng 2: Fallback Puppeteer nếu Fast HTTP không tìm thấy
    if (existingPage) {
        try {
            const pageAvatar = await fetchFacebookAvatarViaPuppeteer(existingPage, fbUrl);
            if (pageAvatar) return pageAvatar;
        } catch(e) {}
    } else if (browser) {
        let tempPage = null;
        try {
            tempPage = await browser.newPage();
            // Tối ưu tốc độ: chặn tải hình ảnh, font, css thừa
            await tempPage.setRequestInterception(true);
            tempPage.on('request', (req) => {
                const rType = req.resourceType();
                if (['image', 'font', 'stylesheet', 'media'].includes(rType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            const pageAvatar = await fetchFacebookAvatarViaPuppeteer(tempPage, fbUrl);
            if (pageAvatar) return pageAvatar;
        } catch(e) {} finally {
            if (tempPage && !tempPage.isClosed()) {
                await tempPage.close().catch(() => {});
            }
        }
    }

    return null;
}

// --- TRÍCH XUẤT BÀI VIẾT VÀ TƯƠNG TÁC NỘI BỘ (100% MIỄN PHÍ) ---
function parseCookieString(cookieStr) {
    if (!cookieStr || typeof cookieStr !== 'string') return [];
    const cookies = [];
    const trimmed = cookieStr.trim();
    if (!trimmed) return [];

    // Hỗ trợ định dạng JSON array cookie (từ extension J2TEAM / EditThisCookie)
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const arr = JSON.parse(trimmed);
            if (Array.isArray(arr)) {
                return arr.map(c => ({
                    name: c.name,
                    value: c.value,
                    domain: c.domain ? (c.domain.startsWith('.') ? c.domain : `.${c.domain}`) : '.facebook.com',
                    path: c.path || '/'
                })).filter(c => c.name && c.value);
            }
        } catch(e) {}
    }

    // Hỗ trợ định dạng chuỗi 'c_user=...; xs=...'
    const pairs = trimmed.split(';');
    for (const pair of pairs) {
        const p = pair.trim();
        if (!p) continue;
        const eqIdx = p.indexOf('=');
        if (eqIdx > 0) {
            const name = p.substring(0, eqIdx).trim();
            const value = p.substring(eqIdx + 1).trim();
            if (name && value) {
                cookies.push({
                    name,
                    value,
                    domain: '.facebook.com',
                    path: '/'
                });
            }
        }
    }
    return cookies;
}

function parseFacebookDateString(rawStr) {
    if (!rawStr || typeof rawStr !== 'string') return null;
    const str = rawStr.trim();
    if (!str) return null;

    const now = new Date();

    // 1. Thử parse trực tiếp nếu là ISO string hoặc định dạng Date chuẩn
    const directDate = new Date(str);
    if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 2005 && directDate.getFullYear() <= now.getFullYear() + 1) {
        return directDate;
    }

    const lower = str.toLowerCase();

    // 2. "Vừa xong" / "Just now"
    if (lower.includes('vừa xong') || lower.includes('just now')) {
        return now;
    }

    // 3. Phút / Minutes
    const minMatch = lower.match(/(\d+)\s*(?:phút|mins?|m\b)/);
    if (minMatch) {
        return new Date(now.getTime() - parseInt(minMatch[1]) * 60 * 1000);
    }

    // 4. Giờ / Hours
    const hrMatch = lower.match(/(\d+)\s*(?:giờ|hrs?|h\b)/);
    if (hrMatch) {
        return new Date(now.getTime() - parseInt(hrMatch[1]) * 3600 * 1000);
    }

    // 5. Ngày / Days
    const dayMatch = lower.match(/(\d+)\s*(?:ngày|days?|d\b)/);
    if (dayMatch && !lower.includes('tháng')) {
        return new Date(now.getTime() - parseInt(dayMatch[1]) * 86400 * 1000);
    }

    // 6. Tuần / Weeks
    const weekMatch = lower.match(/(\d+)\s*(?:tuần|weeks?|w\b)/);
    if (weekMatch) {
        return new Date(now.getTime() - parseInt(weekMatch[1]) * 7 * 86400 * 1000);
    }

    // 7. Tháng (relative): "X tháng trước"
    const relMonthMatch = lower.match(/(\d+)\s*(?:tháng trước|months? ago)/);
    if (relMonthMatch) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - parseInt(relMonthMatch[1]));
        return d;
    }

    // 8. "Hôm qua" / "Yesterday"
    if (lower.includes('hôm qua') || lower.includes('yesterday')) {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        const timeMatch = lower.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
        }
        return d;
    }

    // 9. Tiếng Việt: "DD tháng MM, YYYY" hoặc "DD tháng MM lúc HH:MM" hoặc "DD tháng MM"
    const vnDateMatch = lower.match(/(\d{1,2})\s+tháng\s+(\d{1,2})(?:[,\s]+(?:năm\s+)?(\d{4}))?/);
    if (vnDateMatch) {
        const day = parseInt(vnDateMatch[1]);
        const month = parseInt(vnDateMatch[2]) - 1;
        const year = vnDateMatch[3] ? parseInt(vnDateMatch[3]) : now.getFullYear();
        const d = new Date(year, month, day);
        const timeMatch = lower.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
        }
        if (!isNaN(d.getTime())) return d;
    }

    // 10. Tiếng Anh: "Month DD, YYYY" hoặc "DD Month YYYY"
    const monthsEn = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    for (const [mName, mIdx] of Object.entries(monthsEn)) {
        if (lower.includes(mName)) {
            const m1 = lower.match(new RegExp(`${mName}\\w*\\s+(\\d{1,2})(?:[\\s,]+(\\d{4}))?`));
            const m2 = lower.match(new RegExp(`(\\d{1,2})\\s+${mName}\\w*(?:[\\s,]+(\\d{4}))?`));
            const match = m1 || m2;
            if (match) {
                const day = parseInt(m1 ? match[1] : match[1]);
                const year = match[2] ? parseInt(match[2]) : now.getFullYear();
                const d = new Date(year, mIdx, day);
                if (!isNaN(d.getTime())) return d;
            }
        }
    }

    return null;
}

async function extractFacebookLatestPostDate(page, fullUrl) {
    if (!page || !fullUrl) return { postDate: null, reason: 'INVALID_PARAM' };

    try {
        // 1. Kiểm tra trang có bị Facebook báo không tồn tại / chặn nội dung
        const isDeadOrNotAvailable = await page.evaluate(() => {
            const t = document.body ? document.body.innerText : '';
            return t.includes("isn't available") || 
                   t.includes("không hiển thị") || 
                   t.includes("Không tìm thấy trang") ||
                   t.includes("This content isn't available") ||
                   t.includes("Nội dung này hiện không") ||
                   t.includes("This page isn");
        });
        if (isDeadOrNotAvailable) {
            return { postDate: null, reason: 'PAGE_NOT_AVAILABLE' };
        }

        // 2. Tự động đóng/ẩn popup đăng nhập của Facebook nếu có
        await page.evaluate(() => {
            try {
                const closeBtns = document.querySelectorAll('[aria-label="Đóng" i], [aria-label="Close" i], [aria-label*="Đóng" i], [aria-label*="Close" i]');
                closeBtns.forEach(b => { try { b.click(); } catch(e){} });

                const dialogs = document.querySelectorAll('div[role="dialog"]');
                dialogs.forEach(d => {
                    const text = d.innerText || '';
                    if (text.includes('đăng nhập') || text.includes('Log In') || text.includes('Xem thêm trên Facebook') || text.includes('See more on Facebook')) {
                        d.style.display = 'none';
                    }
                });
            } catch(e) {}
        });

        // 3. Cuộn nhẹ xuống để kích hoạt nạp feed bài viết
        await page.evaluate(() => {
            try { window.scrollBy(0, 1000); } catch(e) {}
        });
        await new Promise(r => setTimeout(r, 1500));

        // TẦNG 1: Trích xuất các epoch timestamp từ thẻ script Relay/GraphQL (Chính xác 100%, độc lập ngôn ngữ)
        const relayTimestamps = await page.evaluate(() => {
            const found = [];
            const nowSec = Math.floor(Date.now() / 1000);
            const minSec = 1262304000; // 2010-01-01

            const scripts = document.querySelectorAll('script[type="application/json"]');
            for (const s of scripts) {
                const text = s.textContent;
                if (!text) continue;
                
                const regex = /"(?:creation_time|publish_time|post_timestamp)"\s*:\s*(\d{10})\b/g;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const val = parseInt(match[1]);
                    if (val >= minSec && val <= nowSec + 86400) {
                        found.push(val);
                    }
                }
            }
            return found;
        });

        if (relayTimestamps && relayTimestamps.length > 0) {
            const maxTimestamp = Math.max(...relayTimestamps);
            return {
                postDate: new Date(maxTimestamp * 1000),
                source: 'relay_json'
            };
        }

        // TẦNG 2: Trích xuất từ DOM (<time>, <abbr>, aria-label, text bài viết)
        const domCandidates = await page.evaluate(() => {
            const list = [];
            
            // 1. Thẻ abbr hoặc time
            const timeEls = document.querySelectorAll('abbr[data-utime], abbr[title], time[datetime], time');
            for (const el of timeEls) {
                const utime = el.getAttribute('data-utime');
                if (utime) {
                    const u = parseInt(utime);
                    if (u > 1262304000) list.push({ raw: utime, epoch: u });
                }
                const dt = el.getAttribute('datetime');
                if (dt) list.push({ raw: dt });
                const title = el.getAttribute('title');
                if (title) list.push({ raw: title });
                if (el.innerText) list.push({ raw: el.innerText.trim() });
            }

            // 2. Link bài viết trong Feed có aria-label hoặc text ngày giờ
            const postLinks = document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="/photos/"], a[href*="/videos/"], a[href*="story_fbid="]');
            for (const a of postLinks) {
                const aria = a.getAttribute('aria-label');
                if (aria && aria.length > 2 && aria.length < 50) {
                    list.push({ raw: aria });
                }
                const txt = a.innerText ? a.innerText.trim() : '';
                if (txt && txt.length > 1 && txt.length < 50) {
                    list.push({ raw: txt });
                }
            }

            // 3. Tìm các span chứa thời gian bài viết
            const spans = document.querySelectorAll('span[id*="jsc_c"], span[dir="auto"]');
            for (const sp of spans) {
                const txt = sp.innerText ? sp.innerText.trim() : '';
                if (txt && txt.length > 1 && txt.length < 35) {
                    if (/(\d+\s*(?:phút|giờ|ngày|tháng|năm|m|h|d|w|min|hr)|hôm qua|yesterday|vừa xong|just now)/i.test(txt)) {
                        list.push({ raw: txt });
                    }
                }
            }

            return list;
        });

        // Phân tích các chuỗi ứng viên từ DOM
        if (domCandidates && domCandidates.length > 0) {
            let latestDate = null;
            for (const item of domCandidates) {
                if (item.epoch) {
                    const d = new Date(item.epoch * 1000);
                    if (!latestDate || d > latestDate) latestDate = d;
                } else if (item.raw) {
                    const parsed = parseFacebookDateString(item.raw);
                    if (parsed && (!latestDate || parsed > latestDate)) {
                        latestDate = parsed;
                    }
                }
            }
            if (latestDate) {
                return {
                    postDate: latestDate,
                    source: 'dom_elements'
                };
            }
        }

        // TẦNG 3: Kiểm tra nếu trang yêu cầu đăng nhập và không thấy bài viết
        const isLoginRequired = await page.evaluate(() => {
            const t = document.body ? document.body.innerText : '';
            return t.includes('Đăng nhập để xem') || t.includes('Log In to See') || t.includes('Bạn phải đăng nhập');
        });

        if (isLoginRequired) {
            return { postDate: null, reason: 'LOGIN_REQUIRED' };
        }

        return { postDate: null, reason: 'NO_RECENT_POSTS_FOUND' };
    } catch(err) {
        return { postDate: null, reason: `ERROR: ${err.message}` };
    }
}

async function runJob(job) {
  pushLog(job, `Khởi tạo tiến trình quét file: ${job.filename}`, 'info');
  if (!fs.existsSync(job.filePath)) {
    throw new Error(`Tệp dữ liệu nguồn không tồn tại: ${job.filePath}`);
  }
  const csvFile = fs.readFileSync(job.filePath, 'utf8');
  
  return new Promise((resolve, reject) => {
    Papa.parse(csvFile, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          if (rows.length === 0) throw new Error('File CSV rỗng');
          
          // 1. Nhận diện cột link Facebook linh hoạt
          let fbCol = job.facebookColumn && rows[0][job.facebookColumn] !== undefined ? job.facebookColumn : null;
          if (!fbCol) {
            fbCol = Object.keys(rows[0]).find(c => {
              const lower = c.toLowerCase().trim();
              return lower.includes('facebook') || lower === 'fb' || lower.startsWith('fb_') || lower.endsWith('_fb') || lower.includes('link_fb') || lower.includes('profile');
            });
          }
          if (!fbCol) {
            const rowWithFb = rows.find(r => Object.values(r).some(v => v && typeof v === 'string' && (v.includes('facebook.com') || v.includes('fb.me') || v.includes('fb.com'))));
            if (rowWithFb) {
              fbCol = Object.keys(rowWithFb).find(k => rowWithFb[k] && typeof rowWithFb[k] === 'string' && (rowWithFb[k].includes('facebook.com') || rowWithFb[k].includes('fb.me') || rowWithFb[k].includes('fb.com')));
            }
          }
          if (!fbCol) {
            fbCol = Object.keys(rows[0]).find(c => {
              const lower = c.toLowerCase().trim();
              return lower === 'link' || lower === 'url' || lower.includes('duong_dan') || lower.includes('lien_ket');
            });
          }
          if (!fbCol) throw new Error('Không tìm thấy cột chứa link Facebook. Vui lòng kiểm tra lại cấu trúc file (cần có cột facebook, fb, profile hoặc link chứa facebook.com)');

          // 2. Nhận diện cột Avatar linh hoạt
          let imgCol = job.avatarColumn && rows[0][job.avatarColumn] !== undefined ? job.avatarColumn : null;
          if (!imgCol) {
            imgCol = Object.keys(rows[0]).find(c => {
              const lower = c.toLowerCase().trim();
              return lower.includes('image') || lower.includes('avatar') || lower.includes('ảnh') || lower.includes('anh') || lower.includes('pic') || lower.includes('photo');
            });
          }
          if (!imgCol && (job.checkAvatar || job.checkAvatarApify)) {
             imgCol = 'Avatar'; // Tạo cột mới nếu chưa có
          }

          job.total = rows.length;
          currentRunningJob = job;
          
          let aliveRows = [];
          let deadRows = [];
          let startIndex = 0;

          // Kiểm tra và khôi phục từ checkpoint nếu có
          const checkpoint = loadCheckpoint(job.id);
          if (job.resumeFromCheckpoint && checkpoint) {
              aliveRows = checkpoint.aliveRows || [];
              deadRows = checkpoint.deadRows || [];
              startIndex = checkpoint.lastCompletedIndex || 0;
              job.completed = startIndex;
              job.stats = checkpoint.stats || { alive: aliveRows.length, dead: deadRows.length, error: 0 };
              pushLog(job, `Khôi phục tiến trình từ điểm dừng: Tiếp tục dòng ${startIndex + 1}/${rows.length}`, 'info');
          } else {
              removeCheckpoint(job.id);
              job.completed = 0;
              job.stats = { alive: 0, dead: 0, error: 0 };
              job.resumeFromCheckpoint = false;
              job.hasCheckpoint = false;
          }
          broadcastQueue();
          
          let browser = null;
          if (job.checkAlive || job.checkAvatar || job.checkActiveLocal) {
              browser = await puppeteer.launch({ 
                headless: job.headless ? 'new' : false,
                protocolTimeout: 600000,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications']
              });
              activeBrowsers.add(browser);
              browser.on('disconnected', () => {
                  activeBrowsers.delete(browser);
              });
          }

          const rowsToProcess = rows.slice(startIndex);
          const chunks = [];
          for (let i = 0; i < rowsToProcess.length; i += job.concurrency) chunks.push(rowsToProcess.slice(i, i + job.concurrency));

          const checkState = async () => {
             while (job.status === 'PAUSED') await new Promise(r => setTimeout(r, 1000));
             if (job.status === 'CANCELED' || job.status === 'REMOVED' || job.status === 'INTERRUPTED') throw new Error('ABORTED');
          };

          try {
            for (const chunk of chunks) {
              await checkState();
              await Promise.all(chunk.map(async (row) => {
                if (job.status === 'CANCELED' || job.status === 'REMOVED') return;
                
                let url = row[fbCol];
                let fbMatch = null;
                const match = JSON.stringify(row).match(/(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^\s,"']+/i);
                if (match) fbMatch = match[0];
                else if (url && typeof url === 'string') {
                    const uM = url.match(/(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^\s,"']+/i);
                    if (uM) fbMatch = uM[0];
                }

                if (!fbMatch) {
                   aliveRows.push(row);
                   job.completed++;
                   broadcastQueue();
                   return;
                }
                
                const fullUrl = fbMatch.startsWith('http') ? fbMatch : `https://${fbMatch}`;
                let isDead = false;
                let hasError = false;

                // --- 1. APIFY CHECKS (CHỈ KHI KIỂM TRA HOẠT ĐỘNG BÀI VIẾT) ---
                if (job.checkAliveApify) {
                    let apifyData = null;
                    let apifySuccess = false;

                    while (!apifySuccess) {
                        await checkState();
                        const currentToken = getApifyKey();
                        if (!currentToken) {
                            pushLog(job, `⚠️ Không còn API Key Apify nào khả dụng (tất cả đều hết hạn hoặc không hợp lệ). Tự động tạm dừng tiến trình... Vui lòng thêm Key mới trong tab "Cài đặt Apify" rồi bấm "Tiếp tục".`, 'error');
                            job.status = 'PAUSED';
                            if (job.lastStartedAt) {
                                job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
                                job.lastStartedAt = null;
                            }
                            saveCheckpoint(job.id, {
                                jobId: job.id,
                                filename: job.filename,
                                lastCompletedIndex: job.completed,
                                stats: job.stats,
                                aliveRows,
                                deadRows,
                                updatedAt: Date.now()
                            });
                            job.hasCheckpoint = true;
                            broadcastQueue();
                            await checkState();
                            continue;
                        }

                        const minD = job.minDelay || 2000;
                        const maxD = Math.max(job.maxDelay || 5000, minD);
                        const randomDelay = Math.floor(Math.random() * (maxD - minD + 1)) + minD;
                        pushLog(job, `⏳ Chờ ${(randomDelay/1000).toFixed(1)}s trước khi gọi Apify: ${fullUrl}`, 'info');
                        await new Promise(r => setTimeout(r, randomDelay));
                        await checkState();

                        pushLog(job, `⚡ Gọi Apify kiểm tra (${currentToken.substring(0, 14)}...): ${fullUrl}`, 'info');
                        try {
                            const data = await callApify(fullUrl, currentToken);
                            incrementKeyUsage(currentToken);
                            apifyData = data && data.length > 0 ? data[0] : null;
                            apifySuccess = true;
                        } catch (apiErr) {
                            if (apiErr.message === 'ABORTED') throw apiErr;
                            if (isApifyTokenError(apiErr.message)) {
                                const errDesc = apiErr.message.includes('401')
                                    ? 'Key không tồn tại hoặc sai token (401)'
                                    : (apiErr.message.includes('429') ? 'Quá giới hạn request (429)' : 'Hết hạn/Hết credit (403)');
                                pushLog(job, `⚠️ Token ${currentToken.substring(0, 14)}... lỗi [${errDesc}], đánh dấu hết hạn và tự động chuyển sang Key tiếp theo...`, 'warning');
                                markKeyAsExpired(currentToken);
                                // Tiếp tục vòng lặp while để lấy token tiếp theo và thử lại link này
                            } else {
                                pushLog(job, `⚠️ LỖI Apify: ${apiErr.message}`, 'error');
                                hasError = true;
                                apifySuccess = true;
                            }
                        }
                    }

                    if (apifySuccess && !hasError) {
                        if (apifyData && apifyData.time) {
                            const postDate = new Date(apifyData.time);
                            const targetDate = new Date();
                            targetDate.setMonth(targetDate.getMonth() - (job.monthsToCheck || 6));
                            if (postDate >= targetDate) {
                                row[`Active_Within_${job.monthsToCheck || 6}_Months`] = 'TRUE';
                                isDead = false;
                            } else {
                                row[`Active_Within_${job.monthsToCheck || 6}_Months`] = 'FALSE';
                                isDead = true; 
                            }
                            row['Latest_Post_Date'] = apifyData.time;
                        } else {
                            row[`Active_Within_${job.monthsToCheck || 6}_Months`] = 'UNKNOWN';
                            row['Latest_Post_Date'] = 'NOT_FOUND';
                            isDead = true; 
                        }

                        // Nếu bật checkAvatar và Apify có avatar sẵn, tận dụng thêm
                        if (job.checkAvatar && apifyData) {
                            let extractedAvatar = null;
                            const post = apifyData;
                            if (post.user && post.user.profilePic) extractedAvatar = post.user.profilePic;
                            else if (post.user && post.user.profile_pic) extractedAvatar = post.user.profile_pic;
                            else if (post.author && post.author.profileUrl) extractedAvatar = post.author.profileUrl;
                            else if (post.author && post.author.profilePicture) extractedAvatar = post.author.profilePicture;
                            else if (post.author && post.author.profile_picture) extractedAvatar = post.author.profile_picture;
                            else if (post.page && post.page.profilePic) extractedAvatar = post.page.profilePic;
                            else if (post.page && post.page.profilePicture) extractedAvatar = post.page.profilePicture;
                            
                            if (extractedAvatar) {
                                row[imgCol] = optimizeFacebookAvatarUrl(extractedAvatar);
                            }
                        }
                    }
                }

                // --- 2. KIỂM TRA TRÌNH DUYỆT NỘI BỘ (PUPPETEER): SỐNG/CHẾT, BÀI VIẾT GẦN NHẤT & AVATAR ---
                let page = null;
                if (browser && !hasError) {
                    try {
                        await checkState();

                        const needsBrowserCheck = job.checkAlive || job.checkActiveLocal || (job.checkAvatar && !isDead);

                        if (needsBrowserCheck) {
                            page = await browser.newPage();

                            // Áp dụng Cookie Facebook cấu hình (nếu có)
                            const config = getConfig();
                            if (config.facebookCookie) {
                                const fbCookies = parseCookieString(config.facebookCookie);
                                if (fbCookies.length > 0) {
                                    try {
                                        await page.setCookie(...fbCookies);
                                    } catch(e) {}
                                }
                            }

                            const minD = job.minDelay || 1500;
                            const maxD = Math.max(job.maxDelay || 3500, minD);
                            const randomDelay = Math.floor(Math.random() * (maxD - minD + 1)) + minD;

                            pushLog(job, `⏳ Chờ ${(randomDelay/1000).toFixed(1)}s trước khi mở (Puppeteer): ${fullUrl}`, 'info');
                            await new Promise(r => setTimeout(r, randomDelay));
                            await checkState();

                            pushLog(job, `🌐 Mở trang qua Puppeteer: ${fullUrl}`, 'info');
                            await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await checkState();
                            await new Promise(r => setTimeout(r, 1200));
                            await checkState();

                            // 2.1. Kiểm tra sống/chết nếu được yêu cầu
                            if (job.checkAlive) {
                                const pageText = await page.evaluate(() => document.body ? document.body.innerText : '');
                                const pDead = pageText.includes("isn't available") || 
                                               pageText.includes("không hiển thị") || 
                                               pageText.includes("Không tìm thấy trang") ||
                                               pageText.includes("This content isn't available") ||
                                               pageText.includes("Nội dung này hiện không") ||
                                               pageText.includes("This page isn");
                                if (pDead) {
                                    isDead = true; 
                                } else {
                                    if (!job.checkAliveApify && !job.checkActiveLocal) {
                                        isDead = false;
                                    }
                                }
                            }

                            // 2.2. Kiểm tra tương tác bài viết nội bộ (Local Post Activity Check)
                            if (job.checkActiveLocal && !isDead) {
                                pushLog(job, `🔍 Kiểm tra bài viết gần nhất (Trình duyệt nội bộ): ${fbMatch}`, 'info');
                                const activityResult = await extractFacebookLatestPostDate(page, fullUrl);

                                if (activityResult && activityResult.postDate) {
                                    const postDate = new Date(activityResult.postDate);
                                    const targetDate = new Date();
                                    targetDate.setMonth(targetDate.getMonth() - (job.monthsToCheck || 6));

                                    const postDateStr = postDate.toISOString().split('T')[0];
                                    row['Latest_Post_Date'] = postDateStr;

                                    if (postDate >= targetDate) {
                                        row[`Active_Within_${job.monthsToCheck || 6}_Months`] = 'TRUE';
                                        isDead = false;
                                        pushLog(job, `📅 Bài viết mới nhất: ${postDateStr} (Còn hoạt động trong ${job.monthsToCheck || 6} tháng): ${fbMatch}`, 'success');
                                    } else {
                                        row[`Active_Within_${job.monthsToCheck || 6}_Months`] = 'FALSE';
                                        isDead = true;
                                        pushLog(job, `⏳ Bài viết mới nhất: ${postDateStr} (Không hoạt động trong ${job.monthsToCheck || 6} tháng): ${fbMatch}`, 'warning');
                                    }
                                } else {
                                    const reason = activityResult ? activityResult.reason : 'NOT_FOUND';
                                    row[`Active_Within_${job.monthsToCheck || 6}_Months`] = 'FALSE';
                                    row['Latest_Post_Date'] = reason;
                                    isDead = true;
                                    if (reason === 'LOGIN_REQUIRED') {
                                        pushLog(job, `⚠️ Yêu cầu đăng nhập để xem bài viết: ${fbMatch} (Gợi ý: Cài đặt Cookie nick phụ trong tab Cài đặt)`, 'warning');
                                    } else {
                                        pushLog(job, `⚠️ Không tìm thấy bài viết gần đây: ${fbMatch}`, 'warning');
                                    }
                                }
                            }

                            // 2.3. Kiểm tra và sửa ảnh avatar (Hoàn toàn tự động, không cần Apify)
                            if (job.checkAvatar && !isDead) {
                                let currentImgUrl = row[imgCol];
                                let isImgValid = false;

                                // Kiểm tra tính hợp lệ của ảnh hiện tại:
                                // 1. Bắt buộc phải là link http/https
                                // 2. KHÔNG phải ảnh placeholder / stock (như images.unsplash.com, placeholder...)
                                // 3. KHÔNG phải link Graph API cũ
                                // 4. Phải thuộc CDN lưu trữ ảnh của Facebook (fbcdn.net, fbsbx.com)
                                // 5. Kiểm tra request thực tế có trả về image/ hay không
                                if (currentImgUrl && typeof currentImgUrl === 'string' && currentImgUrl.startsWith('http')) {
                                    const isPlaceholder = isPlaceholderOrStockImageUrl(currentImgUrl);
                                    const isGraphApi = currentImgUrl.includes('graph.facebook.com');
                                    const isFbCdn = isFacebookCdnUrl(currentImgUrl);

                                    if (!isPlaceholder && !isGraphApi && isFbCdn) {
                                        isImgValid = await checkImageUrlValid(currentImgUrl);
                                    }
                                }

                                if (isImgValid) {
                                    row[imgCol] = optimizeFacebookAvatarUrl(currentImgUrl);
                                    pushLog(job, `✅ Ảnh đại diện Facebook còn hoạt động tốt (HD): ${fbMatch}`, 'info');
                                } else {
                                    const isPlaceholder = isPlaceholderOrStockImageUrl(currentImgUrl);
                                    if (isPlaceholder) {
                                        const shortUrl = currentImgUrl.length > 55 ? `${currentImgUrl.substring(0, 52)}...` : currentImgUrl;
                                        pushLog(job, `🔄 Phát hiện ảnh mẫu placeholder (${shortUrl}), đang thay thế bằng Avatar Facebook: ${fbMatch}`, 'info');
                                    } else {
                                        pushLog(job, `🖼️ Đang trích xuất ảnh đại diện Facebook mới: ${fbMatch}`, 'info');
                                    }

                                    const newAvatar = await extractFacebookAvatar(fullUrl, browser, page);
                                    if (newAvatar) {
                                        row[imgCol] = newAvatar;
                                        pushLog(job, `✅ Cập nhật Avatar HD thành công: ${fbMatch}`, 'success');
                                    } else {
                                        // Phương án dự phòng (fallback): Sử dụng Graph API nếu không thể cào ảnh thật
                                        const fallbackGraph = getFacebookGraphAvatarUrl(fullUrl);
                                        if (fallbackGraph) {
                                            row[imgCol] = fallbackGraph;
                                            pushLog(job, `⚠️ Không thể cào ảnh thật, sử dụng Graph API dự phòng: ${fbMatch}`, 'warning');
                                        } else {
                                            pushLog(job, `⚠️ Không tìm thấy ảnh đại diện mới: ${fbMatch}`, 'warning');
                                        }
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        if (err.message === 'ABORTED') throw err;
                        hasError = true;
                        pushLog(job, `⚠️ LỖI: ${fbMatch} - ${err.message}`, 'warning');
                    } finally {
                        if (page && !page.isClosed()) await page.close().catch(() => {});
                    }
                }

                if (hasError) {
                    aliveRows.push(row); // Keep in output but increment error stats
                    job.stats.error++;
                } else if (isDead) {
                    deadRows.push(row);
                    job.stats.dead++;
                    pushLog(job, `❌ DEAD: ${fullUrl}`, 'error');
                } else {
                    aliveRows.push(row);
                    job.stats.alive++;
                    if ((!job.checkAliveApify && !job.checkActiveLocal) || row[`Active_Within_${job.monthsToCheck || 6}_Months`] === 'TRUE') {
                        pushLog(job, `✅ ALIVE: ${fullUrl}`, 'success');
                    }
                }

                job.completed++;
                broadcastQueue();
              }));

              // Lưu checkpoint sau khi hoàn thành từng chunk
              saveCheckpoint(job.id, {
                  jobId: job.id,
                  filename: job.filename,
                  lastCompletedIndex: job.completed,
                  stats: job.stats,
                  aliveRows,
                  deadRows,
                  updatedAt: Date.now()
              });
              job.hasCheckpoint = true;
            }
          } catch (e) {
            if (e.message !== 'ABORTED' && !e.message.includes('Hết API Key Apify')) throw e;
          } finally {
            if (browser) {
                try { await browser.close(); } catch(e) {}
                activeBrowsers.delete(browser);
            }
            currentRunningJob = null;
            
            if (job.status !== 'REMOVED' && job.status !== 'CANCELED' && job.status !== 'INTERRUPTED' && job.status !== 'PAUSED') {
                const ts = getFormattedTimestamp();
                const baseName = cleanBaseFilename(job.filename);
                const aliveFilename = `${baseName}_alive_${ts}.csv`;
                const deadFilename = `${baseName}_dead_${ts}.csv`;
                
                const aPath = path.join(__dirname, 'outputs', aliveFilename);
                const dPath = path.join(__dirname, 'outputs', deadFilename);
                const reorderedAlive = aliveRows.map(reorderRowColumns);
                const reorderedDead = deadRows.map(reorderRowColumns);
                fs.writeFileSync(aPath, '\uFEFF' + Papa.unparse(reorderedAlive));
                fs.writeFileSync(dPath, '\uFEFF' + Papa.unparse(reorderedDead));
                
                job.downloadLinks = { 
                    aliveFile: `http://localhost:3001/api/download/${encodeURIComponent(aliveFilename)}`, 
                    deadFile: `http://localhost:3001/api/download/${encodeURIComponent(deadFilename)}` 
                };
                job.status = 'COMPLETED';
                if (job.checkAvatar) {
                    job.avatarFixed = true;
                }
                removeCheckpoint(job.id);
                job.hasCheckpoint = false;
                job.resumeFromCheckpoint = false;
                if (job.lastStartedAt) {
                    job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
                    job.lastStartedAt = null;
                }
                pushLog(job, `🎉 Hoàn thành! Sống: ${job.stats.alive}, Chết: ${job.stats.dead}`, 'success');
            } else if (job.status !== 'REMOVED' && job.hasCheckpoint && (aliveRows.length > 0 || deadRows.length > 0)) {
                // Tạo file kết quả tạm thời nếu bị hủy hoặc gián đoạn để người dùng vẫn có thể tải
                const ts = getFormattedTimestamp();
                const baseName = cleanBaseFilename(job.filename);
                const partialAlive = `Partial_${baseName}_alive_${ts}.csv`;
                const partialDead = `Partial_${baseName}_dead_${ts}.csv`;
                try {
                    const reorderedPartialAlive = aliveRows.map(reorderRowColumns);
                    const reorderedPartialDead = deadRows.map(reorderRowColumns);
                    fs.writeFileSync(path.join(__dirname, 'outputs', partialAlive), '\uFEFF' + Papa.unparse(reorderedPartialAlive));
                    fs.writeFileSync(path.join(__dirname, 'outputs', partialDead), '\uFEFF' + Papa.unparse(reorderedPartialDead));
                    job.downloadLinks = {
                        aliveFile: `http://localhost:3001/api/download/${encodeURIComponent(partialAlive)}`,
                        deadFile: `http://localhost:3001/api/download/${encodeURIComponent(partialDead)}`
                    };
                } catch(e) {}
            }
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

app.get('/api/queue', (req, res) => res.json(queue));

// Route tải tệp CSV mẫu chuẩn cho người dùng mới
app.get('/api/download-template', (req, res) => {
  const sampleRows = [
    {
      'Tên khách hàng': 'Nha Khoa Cali Long Khánh',
      'Số điện thoại': '0774977789',
      'Facebook Link': 'https://facebook.com/nhakhoacalilongkhanh',
      'Ảnh Avatar': 'https://graph.facebook.com/nhakhoacalilongkhanh/picture?width=800',
      'Ngành nghề': 'Nha khoa',
      'Ghi chú': 'Cơ sở TP Long Khánh'
    },
    {
      'Tên khách hàng': 'Bảo Dung Spa Mẹ & Bé',
      'Số điện thoại': '0942394878',
      'Facebook Link': 'https://facebook.com/p/Chamsocmevabebienhoa-BaoDungspa-61556883432797',
      'Ảnh Avatar': '',
      'Ngành nghề': 'Dịch vụ Mẹ & Bé',
      'Ghi chú': 'TP Biên Hòa Đồng Nai'
    },
    {
      'Tên khách hàng': 'Garage Ô Tô Được Phát',
      'Số điện thoại': '0967681929',
      'Facebook Link': 'https://facebook.com/GarageDuocPhat',
      'Ảnh Avatar': '',
      'Ngành nghề': 'Sửa chữa ô tô',
      'Ghi chú': 'Đồng sơn & bảo dưỡng'
    }
  ];

  const csvStr = '\uFEFF' + Papa.unparse(sampleRows);
  const filename = 'LeadPurify_Mau_Danh_Sach_Facebook.csv';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(csvStr);
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const job = {
    id: crypto.randomBytes(8).toString('hex'),
    filename: req.file.originalname,
    status: 'PENDING',
    concurrency: parseInt(req.body.concurrency) || 3,
    headless: req.body.headless === 'true' || req.body.headless === true,
    checkAlive: req.body.checkAlive === 'true' || req.body.checkAlive === true,
    checkActiveLocal: req.body.checkActiveLocal === 'true' || req.body.checkActiveLocal === true,
    checkAliveApify: req.body.checkAliveApify === 'true' || req.body.checkAliveApify === true,
    checkAvatar: req.body.checkAvatar === 'true' || req.body.checkAvatar === true || req.body.checkAvatarApify === 'true' || req.body.checkAvatarApify === true,
    checkAvatarApify: false,
    facebookColumn: req.body.facebookColumn ? req.body.facebookColumn.trim() : null,
    avatarColumn: req.body.avatarColumn ? req.body.avatarColumn.trim() : null,
    monthsToCheck: parseInt(req.body.monthsToCheck) || 6,
    minDelay: parseInt(req.body.minDelay) || 2000,
    maxDelay: parseInt(req.body.maxDelay) || 5000,
    stats: { alive: 0, dead: 0, error: 0 },
    completed: 0,
    total: 0,
    logs: [],
    filePath: req.file.path,
    createdAt: Date.now(),
    accumulatedTime: 0,
    lastStartedAt: null
  };
  queue.push(job);
  broadcastQueue();
  processQueue(); 
  res.json({ success: true, jobId: job.id });
});

app.post('/api/clear-history', (req, res) => {
  const historyJobs = queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED', 'REMOVED'].includes(j.status));
  const remainingQueue = queue.filter(j => !['COMPLETED', 'ERROR', 'CANCELED', 'REMOVED'].includes(j.status));

  // 1. Xóa tất cả các file liên quan đến từng tiến trình trong lịch sử
  for (const job of historyJobs) {
    deleteJobFiles(job, remainingQueue);
  }

  // 2. Cập nhật hàng đợi
  queue = remainingQueue;

  // 3. Dọn dẹp cả các file mồ côi còn sót lại trong outputs và uploads
  const orphanResult = cleanAllOrphanedFiles();

  broadcastQueue();
  res.json({ 
    success: true, 
    clearedCount: historyJobs.length,
    deletedFilesCount: orphanResult.deletedCount,
    freedBytes: orphanResult.freedBytes 
  });
});

app.post('/api/clean-storage', (req, res) => {
  try {
    const result = cleanAllOrphanedFiles();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function createFixAvatarJob(historyJob) {
  let targetFilePath = historyJob.filePath;
  if (historyJob.downloadLinks && historyJob.downloadLinks.aliveFile) {
      const filename = historyJob.downloadLinks.aliveFile.split('/').pop();
      const p = path.join(__dirname, 'outputs', decodeURIComponent(filename));
      if (fs.existsSync(p)) {
          targetFilePath = p;
      }
  }

  if (targetFilePath && !fs.existsSync(targetFilePath)) {
      const pAbs = path.join(__dirname, targetFilePath);
      if (fs.existsSync(pAbs)) {
          targetFilePath = pAbs;
      }
  }

  if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      return null;
  }

  const config = getConfig();
  return {
    id: crypto.randomBytes(8).toString('hex'),
    filename: `FixAvatar_${historyJob.filename}`,
    status: 'PENDING',
    concurrency: 3, // Chạy 3 luồng song song nhanh chóng không phụ thuộc Apify
    headless: true,
    checkAlive: false,
    checkAliveApify: false,
    checkAvatar: true,
    checkAvatarApify: false,
    avatarFixed: true,
    monthsToCheck: 6,
    minDelay: 500,
    maxDelay: 1500,
    stats: { alive: 0, dead: 0, error: 0 },
    completed: 0,
    total: 0,
    logs: [],
    filePath: targetFilePath,
    createdAt: Date.now(),
    accumulatedTime: 0,
    lastStartedAt: null
  };
}

app.post('/api/queue/:id/fix-avatar', (req, res) => {
  const { id } = req.params;
  const historyJob = queue.find(j => j.id === id);
  if (!historyJob) {
      return res.status(400).json({ error: 'Không tìm thấy tiến trình' });
  }
  
  const job = createFixAvatarJob(historyJob);
  if (!job) {
      return res.status(400).json({ error: 'Không tìm thấy tệp dữ liệu nguồn của tiến trình' });
  }

  queue.push(job);
  broadcastQueue();
  processQueue(); 
  res.json({ success: true, jobId: job.id });
});

app.post('/api/queue/batch-fix-avatar', (req, res) => {
  const { jobIds } = req.body || {};
  
  let eligibleHistoryJobs;
  if (Array.isArray(jobIds) && jobIds.length > 0) {
    eligibleHistoryJobs = queue.filter(j => jobIds.includes(j.id));
  } else {
    eligibleHistoryJobs = queue.filter(j => 
      ['COMPLETED', 'ERROR'].includes(j.status) && 
      !j.avatarFixed &&
      !j.checkAvatarApify &&
      !queue.some(q => ['PENDING', 'RUNNING'].includes(q.status) && q.filename === `FixAvatar_${j.filename}`)
    );
  }

  const newJobs = [];
  for (const historyJob of eligibleHistoryJobs) {
    const job = createFixAvatarJob(historyJob);
    if (job) {
      queue.push(job);
      newJobs.push(job);
    }
  }

  if (newJobs.length > 0) {
    broadcastQueue();
    processQueue();
  }

  res.json({ success: true, count: newJobs.length });
});

app.post('/api/queue/:id/:action', (req, res) => {
  const { id, action } = req.params;
  const job = queue.find(j => j.id === id);
  if (!job) return res.status(404).json({ error: 'Not found' });

  if (action === 'pause' && job.status === 'RUNNING') {
      job.status = 'PAUSED';
      if (job.lastStartedAt) {
          job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
          job.lastStartedAt = null;
      }
      pushLog(job, 'Tạm dừng tiến trình', 'warning');
  }
  if (action === 'resume' && (job.status === 'PAUSED' || job.status === 'INTERRUPTED' || job.status === 'ERROR')) {
      if (currentRunningJob && currentRunningJob.id === job.id) {
          job.status = 'RUNNING';
          job.lastStartedAt = Date.now();
      } else {
          job.resumeFromCheckpoint = !!job.hasCheckpoint;
          job.status = 'PENDING';
          if (job.lastStartedAt) job.lastStartedAt = null;
      }
      pushLog(job, 'Kích hoạt tiếp tục từ điểm dừng...', 'info');
      processQueue();
  }
  if (action === 'retry' && ['ERROR', 'CANCELED', 'INTERRUPTED', 'COMPLETED', 'PAUSED'].includes(job.status)) {
      removeCheckpoint(job.id);
      job.hasCheckpoint = false;
      job.resumeFromCheckpoint = false;
      job.status = 'PENDING';
      job.completed = 0;
      job.stats = { alive: 0, dead: 0, error: 0 };
      job.accumulatedTime = 0;
      job.lastStartedAt = null;
      job.downloadLinks = null;
      pushLog(job, 'Đưa về hàng đợi để chạy lại từ đầu', 'info');
      processQueue();
  }
  if (action === 'cancel' && (job.status === 'RUNNING' || job.status === 'PAUSED' || job.status === 'PENDING')) {
      job.status = 'CANCELED';
      if (job.lastStartedAt) {
          job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
          job.lastStartedAt = null;
      }
      pushLog(job, 'Đã hủy tiến trình', 'error');
  }
  if (action === 'remove') {
      job.status = 'REMOVED';
      removeCheckpoint(job.id);
      const remainingQueue = queue.filter(j => j.id !== id);
      deleteJobFiles(job, remainingQueue);
      queue = remainingQueue;
  }
  if (action === 'force' && job.status === 'PENDING') {
      const runningJob = queue.find(j => j.status === 'RUNNING');
      if (runningJob) {
          runningJob.status = 'PAUSED';
          if (runningJob.lastStartedAt) {
              runningJob.accumulatedTime = (runningJob.accumulatedTime || 0) + (Date.now() - runningJob.lastStartedAt);
              runningJob.lastStartedAt = null;
          }
      }
      queue = queue.filter(j => j.id !== id);
      queue.unshift(job);
      pushLog(job, 'Đã đưa lên ưu tiên chạy ngay', 'info');
      processQueue();
  }
  
  broadcastQueue();
  res.json({ success: true, job });
});

app.post('/api/queue/batch-retry', (req, res) => {
  const { jobIds } = req.body || {};
  let targetJobs;
  if (Array.isArray(jobIds) && jobIds.length > 0) {
    targetJobs = queue.filter(j => jobIds.includes(j.id));
  } else {
    targetJobs = queue.filter(j => ['ERROR', 'INTERRUPTED', 'CANCELED'].includes(j.status));
  }
  targetJobs.forEach(job => {
    removeCheckpoint(job.id);
    job.hasCheckpoint = false;
    job.resumeFromCheckpoint = false;
    job.status = 'PENDING';
    job.completed = 0;
    job.stats = { alive: 0, dead: 0, error: 0 };
    job.accumulatedTime = 0;
    job.lastStartedAt = null;
    pushLog(job, 'Chạy lại theo lô từ đầu', 'info');
  });
  broadcastQueue();
  if (targetJobs.length > 0) processQueue();
  res.json({ success: true, count: targetJobs.length });
});

app.post('/api/queue/batch-pause', (req, res) => {
  let pausedCount = 0;
  for (const job of queue) {
    if (job.status === 'RUNNING' || job.status === 'PENDING') {
      if (job.status === 'RUNNING' && job.lastStartedAt) {
        job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
        job.lastStartedAt = null;
      }
      job.status = 'PAUSED';
      pushLog(job, 'Tạm dừng toàn bộ tiến trình', 'warning');
      pausedCount++;
    }
  }
  broadcastQueue();
  res.json({ success: true, count: pausedCount });
});

app.post('/api/queue/batch-stop', (req, res) => {
  let stoppedCount = 0;
  for (const job of queue) {
    if (job.status === 'RUNNING' || job.status === 'PAUSED' || job.status === 'PENDING') {
      if (job.lastStartedAt) {
        job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
        job.lastStartedAt = null;
      }
      job.status = 'CANCELED';
      pushLog(job, 'Đã dừng toàn bộ tiến trình', 'error');
      stoppedCount++;
    }
  }
  broadcastQueue();
  res.json({ success: true, count: stoppedCount });
});

app.post('/api/queue/batch-clear', (req, res) => {
  const queueJobs = queue.filter(j => ['PENDING', 'RUNNING', 'PAUSED', 'INTERRUPTED'].includes(j.status));
  const remainingQueue = queue.filter(j => !['PENDING', 'RUNNING', 'PAUSED', 'INTERRUPTED'].includes(j.status));

  for (const job of queueJobs) {
    job.status = 'REMOVED';
    removeCheckpoint(job.id);
    deleteJobFiles(job, remainingQueue);
  }

  queue = remainingQueue;
  const orphanResult = cleanAllOrphanedFiles();
  broadcastQueue();
  res.json({ 
    success: true, 
    count: queueJobs.length,
    freedBytes: orphanResult.freedBytes,
    deletedFilesCount: orphanResult.deletedCount
  });
});

app.post('/api/queue/batch-resume', (req, res) => {
  const targetJobs = queue.filter(j => j.status === 'INTERRUPTED' || j.status === 'PAUSED');
  targetJobs.forEach(job => {
    if (currentRunningJob && currentRunningJob.id === job.id) {
      job.status = 'RUNNING';
      job.lastStartedAt = Date.now();
    } else {
      job.resumeFromCheckpoint = !!job.hasCheckpoint;
      job.status = 'PENDING';
      if (job.lastStartedAt) job.lastStartedAt = null;
    }
    pushLog(job, 'Tiếp tục xử lý tiến trình...', 'info');
  });
  broadcastQueue();
  if (targetJobs.length > 0) processQueue();
  res.json({ success: true, count: targetJobs.length });
});

app.post('/api/queue/trigger', (req, res) => {
  processQueue();
  res.json({ success: true, isWorkerRunning });
});

app.post('/api/shutdown', (req, res) => {
  res.json({ success: true, message: 'Đang tắt máy chủ an toàn...' });
  setTimeout(() => handleShutdown('API_SHUTDOWN'), 200);
});

app.get('/api/config', (req, res) => {
    res.json(getConfig());
});

app.post('/api/config', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const existingConfig = getConfig();
        const newConfig = {
            ...existingConfig,
            maxUsagePerKey: req.body.maxUsagePerKey !== undefined ? (parseInt(req.body.maxUsagePerKey) || 400) : (existingConfig.maxUsagePerKey || 400),
            minDelay: req.body.minDelay !== undefined ? (parseInt(req.body.minDelay) || 2000) : (existingConfig.minDelay || 2000),
            maxDelay: req.body.maxDelay !== undefined ? (parseInt(req.body.maxDelay) || 5000) : (existingConfig.maxDelay || 5000),
            facebookCookie: req.body.facebookCookie !== undefined ? req.body.facebookCookie.trim() : (existingConfig.facebookCookie || '')
        };
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
        res.json({ success: true, config: newConfig });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/apify-keys', (req, res) => {
    try {
        const keysPath = path.join(__dirname, 'apify_keys.json');
        if (!fs.existsSync(keysPath)) return res.json([]);
        const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        res.json(keys);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/apify-keys', (req, res) => {
    try {
        const keysPath = path.join(__dirname, 'apify_keys.json');
        const { keys } = req.body;
        if (!Array.isArray(keys)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/apify-keys/check', async (req, res) => {
    try {
        const config = getConfig();
        const keysPath = path.join(__dirname, 'apify_keys.json');
        if (!fs.existsSync(keysPath)) return res.json([]);
        let keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        
        const checkToken = (token) => {
            return new Promise((resolve) => {
                https.get(`https://api.apify.com/v2/users/me?token=${token}`, (resp) => {
                    let data = '';
                    resp.on('data', chunk => data += chunk);
                    resp.on('end', () => resolve(resp.statusCode === 200));
                }).on("error", () => resolve(false));
            });
        };

        for (let k of keys) {
            const isValid = await checkToken(k.key);
            if (!isValid) {
                k.status = 'expired';
            } else if (k.usage >= config.maxUsagePerKey) {
                k.status = 'expired';
            } else {
                k.status = 'active';
            }
        }
        
        fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
        res.json(keys);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/apify-keys/reset-usage', (req, res) => {
    try {
        const keysPath = path.join(__dirname, 'apify_keys.json');
        if (!fs.existsSync(keysPath)) return res.json([]);
        let keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        keys.forEach(k => {
            k.usage = 0;
            k.status = 'active';
        });
        fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
        res.json(keys);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'outputs', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }

  // Khi xem trước (preview modal), giữ nguyên đầy đủ cột để người dùng kiểm tra
  if (req.query.preview === 'true') {
    return res.download(filePath, filename);
  }

  let downloadFilename = filename;
  try {
    const stat = fs.statSync(filePath);
    downloadFilename = formatDownloadFilename(filename, stat);
  } catch (e) {
    downloadFilename = formatDownloadFilename(filename);
  }

  const safeAsciiFilename = downloadFilename.replace(/[^\x20-\x7E]/g, '_');

  // Khi download về máy: xóa 2 cột kiểm tra hoạt động (Active_Within_* và Latest_Post_Date)
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    if (!fileContent.trim()) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`);
      return res.download(filePath, downloadFilename);
    }

    const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
    if (parsed.data && parsed.data.length > 0) {
      const cleanedData = parsed.data.map(cleanRowForDownload);
      const csvStr = '\uFEFF' + Papa.unparse(cleanedData);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`);
      return res.send(csvStr);
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`);
      return res.download(filePath, downloadFilename);
    }
  } catch (err) {
    console.error('Lỗi khi lọc cột tải xuống:', err);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`);
    return res.download(filePath, downloadFilename);
  }
});

// Route tải nén hàng loạt các tệp link sống / link chết thành 1 file ZIP
app.get(['/api/download-batch-zip/:type', '/api/download-batch-zip'], (req, res) => {
  const type = (req.params.type || req.query.type || '').toLowerCase();
  if (type !== 'alive' && type !== 'dead') {
    return res.status(400).json({ error: 'Loại tệp không hợp lệ. Vui lòng chọn "alive" hoặc "dead".' });
  }

  try {
    const historyJobs = queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED', 'INTERRUPTED'].includes(j.status));
    const entries = [];

    for (const job of historyJobs) {
      if (!job.downloadLinks) continue;

      const linkUrl = type === 'alive' ? job.downloadLinks.aliveFile : job.downloadLinks.deadFile;
      if (!linkUrl) continue;

      // Nếu có thông tin stats và số lượng bằng 0 thì bỏ qua
      if (job.stats && ((type === 'alive' && job.stats.alive === 0) || (type === 'dead' && job.stats.dead === 0))) {
        continue;
      }

      let rawFilename = '';
      try {
        const u = new URL(linkUrl);
        rawFilename = decodeURIComponent(u.pathname.split('/').pop());
      } catch (e) {
        rawFilename = decodeURIComponent(linkUrl.split('/').pop());
      }

      if (!rawFilename) continue;
      const filePath = path.join(__dirname, 'outputs', rawFilename);
      if (!fs.existsSync(filePath)) continue;

      let fileContent = '';
      try {
        const rawContent = fs.readFileSync(filePath, 'utf8');
        if (rawContent.trim()) {
          const parsed = Papa.parse(rawContent, { header: true, skipEmptyLines: true });
          if (parsed.data && parsed.data.length > 0) {
            const cleanedData = parsed.data.map(cleanRowForDownload);
            fileContent = '\uFEFF' + Papa.unparse(cleanedData);
          } else {
            fileContent = rawContent;
          }
        } else {
          fileContent = rawContent;
        }
      } catch (err) {
        fileContent = fs.readFileSync(filePath, 'utf8');
      }

      let zipEntryName = rawFilename;
      try {
        const stat = fs.statSync(filePath);
        zipEntryName = formatDownloadFilename(rawFilename, stat);
      } catch (e) {
        zipEntryName = formatDownloadFilename(rawFilename);
      }

      entries.push({
        name: zipEntryName,
        data: fileContent
      });
    }

    if (entries.length === 0) {
      return res.status(404).json({
        error: `Không tìm thấy tệp CSV ${type === 'alive' ? 'link sống' : 'link chết'} nào trong lịch sử để nén.`
      });
    }

    const tsStr = getFormattedTimestamp();
    const zipFilename = type === 'alive' ? `LeadPurify_Link_Song_${tsStr}.zip` : `LeadPurify_Link_Chet_${tsStr}.zip`;
    const safeZipName = zipFilename.replace(/[^\x20-\x7E]/g, '_');

    const zipBuffer = createZipBuffer(entries);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeZipName}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`);
    res.setHeader('Content-Length', zipBuffer.length);
    return res.send(zipBuffer);
  } catch (error) {
    console.error('Lỗi khi nén tệp zip hàng loạt:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ khi nén file zip: ' + error.message });
  }
});

server.listen(3001, () => {
  console.log('Queue backend on port 3001');
  // Tự động kiểm tra và chạy các tiến trình PENDING khi khởi động lại
  setTimeout(() => {
    const hasPending = queue.some(j => j.status === 'PENDING');
    if (hasPending) {
      console.log('[LeadPurify] Phát hiện tiến trình PENDING trong hàng đợi, tự động kích hoạt xử lý...');
      processQueue();
    }
  }, 1200);
});
