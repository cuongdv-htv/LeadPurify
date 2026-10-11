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
if (!fs.existsSync('outputs')) fs.mkdirSync('outputs');

const QUEUE_FILE = path.join(__dirname, 'queue.json');
let queue = [];
if (fs.existsSync(QUEUE_FILE)) {
    try {
        queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
        queue.forEach(job => {
            if (job.status === 'RUNNING' || job.status === 'PAUSED') {
                job.status = 'ERROR';
                if (!job.logs) job.logs = [];
                job.logs.push({ message: 'Tiến trình bị gián đoạn do server khởi động lại', type: 'error', timestamp: new Date().toISOString() });
            }
        });
    } catch(e) {
        queue = [];
    }
}

let isWorkerRunning = false;

io.on('connection', (socket) => {
  socket.emit('queue_update', queue);
});

function saveQueue() {
    try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
    } catch(err) {
        console.error('Lỗi lưu queue:', err);
    }
}

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
  
  while (true) {
    let job = queue.find(j => j.status === 'RUNNING' || j.status === 'PAUSED');
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
       if (job.status !== 'REMOVED' && job.status !== 'CANCELED') {
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
  
  isWorkerRunning = false;
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
          broadcastQueue();
          
          let aliveRows = [];
          let deadRows = [];
          
          let browser = null;
          if (job.checkAlive || job.checkAvatar) {
              browser = await puppeteer.launch({ 
                headless: job.headless ? 'new' : false,
                protocolTimeout: 600000,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications']
              });
          }

          const chunks = [];
          for (let i = 0; i < rows.length; i += job.concurrency) chunks.push(rows.slice(i, i + job.concurrency));

          const checkState = async () => {
             while (job.status === 'PAUSED') await new Promise(r => setTimeout(r, 1000));
             if (job.status === 'CANCELED' || job.status === 'REMOVED') throw new Error('ABORTED');
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
            }
          } catch (e) {
            if (e.message !== 'ABORTED' && e.message !== 'Hết API Key Apify') throw e;
          } finally {
            if (browser) await browser.close();
            
            if (job.status !== 'REMOVED') {
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
                if (job.status !== 'CANCELED') job.status = 'COMPLETED';
                if (job.lastStartedAt) {
                    job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
                    job.lastStartedAt = null;
                }
                pushLog(job, `🎉 Hoàn thành! Sống: ${job.stats.alive}, Chết: ${job.stats.dead}`, 'success');
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
  }
  if (action === 'resume' && job.status === 'PAUSED') {
      job.status = 'RUNNING';
      job.lastStartedAt = Date.now();
  }
  if (action === 'cancel' && (job.status === 'RUNNING' || job.status === 'PAUSED')) {
      job.status = 'CANCELED';
      if (job.lastStartedAt) {
          job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
          job.lastStartedAt = null;
      }
  }
  if (action === 'remove') {
      job.status = 'REMOVED';
      queue = queue.filter(j => j.id !== id);
  }
  if (action === 'force' && job.status === 'PENDING') {
      const runningJob = queue.find(j => j.status === 'RUNNING');
      if (runningJob) runningJob.status = 'PAUSED';
      queue = queue.filter(j => j.id !== id);
      queue.unshift(job);
  }
  
  broadcastQueue();
  res.json({ success: true });
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

server.listen(3001, () => console.log('Queue backend on 3001'));
