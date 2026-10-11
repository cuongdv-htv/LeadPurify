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

function getConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        if (!fs.existsSync(configPath)) return { maxUsagePerKey: 400, minDelay: 2000, maxDelay: 5000 };
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch(e) { return { maxUsagePerKey: 400, minDelay: 2000, maxDelay: 5000 }; }
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
app.use(cors());
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
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmpPath, cpPath);
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
        fs.writeFileSync(tmpFile, data, 'utf8');
        if (fs.existsSync(QUEUE_FILE)) {
            try { fs.copyFileSync(QUEUE_FILE, QUEUE_BAK_FILE); } catch(e) {}
        }
        fs.renameSync(tmpFile, QUEUE_FILE);
    } catch(err) {
        console.error('[LeadPurify] Lỗi lưu queue.json:', err);
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

function getFacebookAvatarUrl(fbLink) {
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

        if (urlObj.pathname.includes('profile.php')) {
            const id = urlObj.searchParams.get('id');
            if (id) {
                return `https://graph.facebook.com/${id}/picture?width=800`;
            }
        }

        const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
        if (pathParts.length === 0) return null;

        let usernameOrId = null;

        if (pathParts[0] === 'people' && pathParts.length >= 3) {
            usernameOrId = pathParts[2];
        } else if (!['people', 'groups', 'events', 'watch', 'marketplace'].includes(pathParts[0])) {
            usernameOrId = pathParts[0];
        }

        if (usernameOrId) {
            return `https://graph.facebook.com/${usernameOrId}/picture?width=800`;
        }

        return null;
    } catch (error) {
        return null; 
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
          
          let fbCol = Object.keys(rows[0]).find(c => c.toLowerCase().includes('facebook'));
          if (!fbCol) {
            const rowWithFb = rows.find(r => Object.values(r).some(v => v && v.includes('facebook.com')));
            if (rowWithFb) fbCol = Object.keys(rowWithFb).find(k => rowWithFb[k] && rowWithFb[k].includes('facebook.com'));
          }
          if (!fbCol) throw new Error('Không tìm thấy cột chứa link Facebook');

          let imgCol = Object.keys(rows[0]).find(c => c.toLowerCase().includes('image') || c.toLowerCase().includes('avatar') || c.toLowerCase().includes('ảnh') || c.toLowerCase().includes('pic'));
          if (!imgCol && (job.checkAvatar || job.checkAvatarApify)) {
             imgCol = 'Avatar'; // Create column if not exists
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
          if (job.checkAlive || job.checkAvatar) {
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

                // --- 1. APIFY CHECKS ---
                if (job.checkAliveApify || job.checkAvatarApify) {
                    try {
                        let token = getApifyKey();
                        if (!token) throw new Error('Hết API Key Apify');
                        
                        const minD = job.minDelay || 2000;
                        const maxD = Math.max(job.maxDelay || 5000, minD);
                        const randomDelay = Math.floor(Math.random() * (maxD - minD + 1)) + minD;
                        pushLog(job, `⏳ Chờ ${(randomDelay/1000).toFixed(1)}s trước khi gọi Apify: ${fullUrl}`, 'info');
                        await new Promise(r => setTimeout(r, randomDelay));
                        await checkState();

                        pushLog(job, `⚡ Gọi Apify kiểm tra: ${fullUrl}`, 'info');
                        const data = await callApify(fullUrl, token);
                        incrementKeyUsage(token);
                        
                        let apifyData = data && data.length > 0 ? data[0] : null;

                        if (job.checkAliveApify) {
                            if (apifyData && apifyData.time) {
                                row['Latest_Post_Date'] = apifyData.time;
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
                            } else {
                                row['Latest_Post_Date'] = 'NOT_FOUND';
                                row[`Active_Within_${job.monthsToCheck || 6}_Months`] = 'UNKNOWN';
                                isDead = true; 
                            }
                        }

                        if (job.checkAvatarApify && apifyData) {
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
                                row[imgCol] = extractedAvatar;
                                pushLog(job, `🖼️ Cập nhật Avatar (Apify) thành công`, 'success');
                            }
                        }

                    } catch (apiErr) {
                        if (apiErr.message.includes('403') || apiErr.message.includes('429')) {
                            pushLog(job, `⚠️ API Key lỗi/hết hạn, đánh dấu hết hạn...`, 'warning');
                            let token = getApifyKey();
                            if (token) markKeyAsExpired(token);
                        } else {
                            pushLog(job, `⚠️ LỖI Apify: ${apiErr.message}`, 'error');
                        }
                        hasError = true;
                    }
                }

                // --- 2. PUPPETEER CHECKS ---
                let page;
                if (browser && !hasError) {
                    try {
                        await checkState();
                        page = await browser.newPage();
                        
                        const minD = job.minDelay || 2000;
                        const maxD = Math.max(job.maxDelay || 5000, minD);
                        const randomDelay = Math.floor(Math.random() * (maxD - minD + 1)) + minD;
                        
                        pushLog(job, `⏳ Chờ ${(randomDelay/1000).toFixed(1)}s trước khi mở (Puppeteer): ${fullUrl}`, 'info');
                        await new Promise(r => setTimeout(r, randomDelay));
                        await checkState();

                        pushLog(job, `⚡ Đang kiểm tra (Puppeteer): ${fullUrl}`, 'info');
                        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await checkState();
                        await new Promise(r => setTimeout(r, 2000));
                        await checkState();

                        if (job.checkAlive) {
                            const pageText = await page.evaluate(() => document.body.innerText);
                            const pDead = pageText.includes("isn't available") || 
                                           pageText.includes("không hiển thị") || 
                                           pageText.includes("Không tìm thấy trang") ||
                                           pageText.includes("This content isn't available") ||
                                           pageText.includes("Nội dung này hiện không") ||
                                           pageText.includes("This page isn");
                            if (pDead) {
                                isDead = true; 
                            } else {
                                if (!job.checkAliveApify) {
                                    isDead = false;
                                }
                            }
                        }

                        if (job.checkAvatar && !isDead) {
                            let imageWorks = false;
                            let currentImgUrl = row[imgCol];
                            
                            const graphApiAvatar = getFacebookAvatarUrl(fullUrl); 
                            if (graphApiAvatar) {
                                row[imgCol] = graphApiAvatar;
                                imageWorks = true;
                                pushLog(job, `✅ Lưu ảnh đại diện vĩnh viễn bằng Graph API`, 'success');
                            }
                            
                            if (!imageWorks && currentImgUrl) {
                                const imgPage = await browser.newPage();
                                const imgRes = await imgPage.goto(currentImgUrl, { timeout: 15000 }).catch(() => null);
                                if (imgRes && imgRes.status() === 200) {
                                    const ct = imgRes.headers()['content-type'];
                                    if (ct && ct.startsWith('image/')) {
                                        imageWorks = true;
                                    }
                                }
                                await imgPage.close();
                            }
                            
                            if (!imageWorks) {
                                pushLog(job, `Ảnh hỏng hoặc thiếu, đang lấy ảnh đại diện mới...`, 'warning');
                                const newAvatar = await page.evaluate(() => {
                                    const meta = document.querySelector('meta[property="og:image"]');
                                    if (meta && meta.content) return meta.content;
                                    const svgImg = document.querySelector('svg[role="img"] image');
                                    if (svgImg) return svgImg.getAttribute('xlink:href') || svgImg.getAttribute('href');
                                    return null;
                                });
                                
                                if (newAvatar) {
                                    row[imgCol] = newAvatar;
                                    pushLog(job, `✅ Cập nhật ảnh đại diện thành công`, 'success');
                                }
                            }
                        }
                    } catch (err) {
                        if (err.message === 'ABORTED') throw err;
                        hasError = true;
                        pushLog(job, `⚠️ LỖI (Puppeteer): ${fbMatch} - ${err.message}`, 'warning');
                    } finally {
                        if (page && !page.isClosed()) await page.close();
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
                    if (!job.checkAliveApify || row[`Active_Within_${job.monthsToCheck || 6}_Months`] === 'TRUE') {
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
            if (e.message !== 'ABORTED' && e.message !== 'Hết API Key Apify') throw e;
          } finally {
            if (browser) {
                try { await browser.close(); } catch(e) {}
                activeBrowsers.delete(browser);
            }
            currentRunningJob = null;
            
            if (job.status !== 'REMOVED' && job.status !== 'CANCELED' && job.status !== 'INTERRUPTED') {
                const ts = new Date().getTime();
                const baseName = job.filename.replace(/\.[^/.]+$/, "");
                const aliveFilename = `${baseName}_alive_${ts}.csv`;
                const deadFilename = `${baseName}_dead_${ts}.csv`;
                
                const aPath = path.join(__dirname, 'outputs', aliveFilename);
                const dPath = path.join(__dirname, 'outputs', deadFilename);
                fs.writeFileSync(aPath, Papa.unparse(aliveRows));
                fs.writeFileSync(dPath, Papa.unparse(deadRows));
                
                job.downloadLinks = { 
                    aliveFile: `http://localhost:3001/api/download/${encodeURIComponent(aliveFilename)}`, 
                    deadFile: `http://localhost:3001/api/download/${encodeURIComponent(deadFilename)}` 
                };
                job.status = 'COMPLETED';
                removeCheckpoint(job.id);
                job.hasCheckpoint = false;
                job.resumeFromCheckpoint = false;
                if (job.lastStartedAt) {
                    job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
                    job.lastStartedAt = null;
                }
                pushLog(job, `🎉 Hoàn thành! Sống: ${job.stats.alive}, Chết: ${job.stats.dead}`, 'success');
            } else if (job.hasCheckpoint && (aliveRows.length > 0 || deadRows.length > 0)) {
                // Tạo file kết quả tạm thời nếu bị hủy hoặc gián đoạn để người dùng vẫn có thể tải
                const baseName = job.filename.replace(/\.[^/.]+$/, "");
                const partialAlive = `Partial_${baseName}_alive_${job.id}.csv`;
                const partialDead = `Partial_${baseName}_dead_${job.id}.csv`;
                try {
                    fs.writeFileSync(path.join(__dirname, 'outputs', partialAlive), Papa.unparse(aliveRows));
                    fs.writeFileSync(path.join(__dirname, 'outputs', partialDead), Papa.unparse(deadRows));
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

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const job = {
    id: crypto.randomBytes(8).toString('hex'),
    filename: req.file.originalname,
    status: 'PENDING',
    concurrency: parseInt(req.body.concurrency) || 3,
    headless: req.body.headless === 'true' || req.body.headless === true,
    checkAlive: req.body.checkAlive === 'true' || req.body.checkAlive === true,
    checkAliveApify: req.body.checkAliveApify === 'true' || req.body.checkAliveApify === true,
    checkAvatar: req.body.checkAvatar === 'true' || req.body.checkAvatar === true,
    checkAvatarApify: req.body.checkAvatarApify === 'true' || req.body.checkAvatarApify === true,
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
  queue = queue.filter(j => !['COMPLETED', 'ERROR', 'CANCELED', 'REMOVED'].includes(j.status));
  broadcastQueue();
  res.json({ success: true });
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
    concurrency: 1, // Chạy 1 luồng để xoay vòng API an toàn
    headless: true,
    checkAlive: false,
    checkAliveApify: false,
    checkAvatar: false,
    checkAvatarApify: true,
    monthsToCheck: 6,
    minDelay: config.minDelay,
    maxDelay: config.maxDelay,
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
      job.resumeFromCheckpoint = true;
      job.status = 'PENDING';
      if (job.lastStartedAt) job.lastStartedAt = null;
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
      queue = queue.filter(j => j.id !== id);
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

app.post('/api/queue/batch-resume', (req, res) => {
  const targetJobs = queue.filter(j => (j.status === 'INTERRUPTED' || j.status === 'PAUSED') && j.hasCheckpoint);
  targetJobs.forEach(job => {
    job.resumeFromCheckpoint = true;
    job.status = 'PENDING';
    pushLog(job, 'Tiếp tục từ điểm dừng theo lô', 'info');
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
        const newConfig = {
            maxUsagePerKey: parseInt(req.body.maxUsagePerKey) || 400,
            minDelay: parseInt(req.body.minDelay) || 2000,
            maxDelay: parseInt(req.body.maxDelay) || 5000
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
            } else if (k.usage >= 400) {
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

app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'outputs', req.params.filename);
  if (fs.existsSync(filePath)) res.download(filePath);
  else res.status(404).send('Not found');
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
