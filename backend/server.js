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
  if (job.type === 'CHECK_ACTIVITY') {
      return runCheckActivityJob(job);
  }
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

          job.total = rows.length;
          broadcastQueue();
          
          let aliveRows = [];
          let deadRows = [];
          
          const browser = await puppeteer.launch({ 
            headless: job.headless ? 'new' : false,
            protocolTimeout: 600000,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications']
          });

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
                
                let page;
                try {
                  await checkState();
                  page = await browser.newPage();
                  const fullUrl = fbMatch.startsWith('http') ? fbMatch : `https://${fbMatch}`;
                  
                  // Chờ random thời gian trước khi truy cập để mô phỏng người thật
                  const minD = job.minDelay || 2000;
                  const maxD = Math.max(job.maxDelay || 5000, minD); // Đảm bảo max >= min
                  const randomDelay = Math.floor(Math.random() * (maxD - minD + 1)) + minD;
                  
                  pushLog(job, `⏳ Chờ ${(randomDelay/1000).toFixed(1)}s trước khi mở: ${fullUrl}`, 'info');
                  await new Promise(r => setTimeout(r, randomDelay));
                  await checkState();

                  pushLog(job, `⚡ Đang kiểm tra: ${fullUrl}`, 'info');
                  
                  await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  await checkState();
                  await new Promise(r => setTimeout(r, 2000));
                  await checkState();
                  
                  const pageText = await page.evaluate(() => document.body.innerText);
                  const isDead = pageText.includes("isn't available") || 
                                 pageText.includes("không hiển thị") || 
                                 pageText.includes("Không tìm thấy trang") ||
                                 pageText.includes("This content isn't available") ||
                                 pageText.includes("Nội dung này hiện không") ||
                                 pageText.includes("This page isn");
                                 
                  if (isDead) {
                    deadRows.push(row);
                    job.stats.dead++;
                    pushLog(job, `❌ DEAD: ${fullUrl}`, 'error');
                  } else {
                    let imageWorks = false;
                    let currentImgUrl = imgCol ? row[imgCol] : null;
                    
                    const graphApiAvatar = getFacebookAvatarUrl(fullUrl); 
                    if (graphApiAvatar) {
                        if (!imgCol) imgCol = 'Avatar';
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
                            if (!imgCol) imgCol = 'Avatar';
                            row[imgCol] = newAvatar;
                            pushLog(job, `✅ Cập nhật ảnh đại diện thành công`, 'success');
                        }
                    }

                    aliveRows.push(row);
                    job.stats.alive++;
                    pushLog(job, `✅ ALIVE: ${fullUrl}`, 'success');
                  }
                } catch (err) {
                  if (err.message === 'ABORTED') throw err;
                  aliveRows.push(row);
                  job.stats.error++;
                  pushLog(job, `⚠️ LỖI: ${fbMatch} - ${err.message}`, 'warning');
                } finally {
                  if (page && !page.isClosed()) await page.close();
                  job.completed++;
                  broadcastQueue();
                }
              }));
            }
          } catch (e) {
            if (e.message !== 'ABORTED') throw e;
          } finally {
            await browser.close();
            
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

async function runCheckActivityJob(job) {
  pushLog(job, `Khởi tạo tiến trình Check 6 tháng: ${job.filename}`, 'info');
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

          job.total = rows.length;
          broadcastQueue();
          let checkedRows = [];
          
          const checkState = async () => {
             while (job.status === 'PAUSED') await new Promise(r => setTimeout(r, 1000));
             if (job.status === 'CANCELED' || job.status === 'REMOVED') throw new Error('ABORTED');
          };

          try {
            for (const row of rows) {
                await checkState();
                
                let url = row[fbCol];
                let fbMatch = null;
                const match = JSON.stringify(row).match(/(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^\s,"']+/i);
                if (match) fbMatch = match[0];
                else if (url && typeof url === 'string') {
                    const uM = url.match(/(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^\s,"']+/i);
                    if (uM) fbMatch = uM[0];
                }

                if (!fbMatch) {
                   checkedRows.push(row);
                   job.completed++;
                   broadcastQueue();
                   continue;
                }

                const fullUrl = fbMatch.startsWith('http') ? fbMatch : `https://${fbMatch}`;
                
                const minD = job.minDelay || 2000;
                const maxD = Math.max(job.maxDelay || 5000, minD);
                const randomDelay = Math.floor(Math.random() * (maxD - minD + 1)) + minD;
                pushLog(job, `⏳ Chờ ${(randomDelay/1000).toFixed(1)}s trước khi gọi Apify cho: ${fullUrl}`, 'info');
                await new Promise(r => setTimeout(r, randomDelay));
                await checkState();

                let token = getApifyKey();
                if (!token) {
                    pushLog(job, `❌ Đã hết sạch API Key hợp lệ trong apify_keys.json`, 'error');
                    throw new Error('Hết API Key Apify');
                }

                pushLog(job, `⚡ Gọi Apify kiểm tra: ${fullUrl}`, 'info');
                try {
                    const data = await callApify(fullUrl, token);
                    incrementKeyUsage(token);
                    
                    let active = false;
                    let lastPostDate = '';
                    if (data && data.length > 0) {
                        const post = data[0];
                        if (post.time) {
                            lastPostDate = post.time;
                            const postDate = new Date(post.time);
                            const sixMonthsAgo = new Date();
                            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                            if (postDate >= sixMonthsAgo) active = true;
                        }
                    }
                    
                    row['Latest_Post_Date'] = lastPostDate;
                    row['Active_Within_6_Months'] = active ? 'TRUE' : 'FALSE';
                    
                    if (active) {
                        job.stats.alive++;
                        pushLog(job, `✅ Sống (có bài đăng): ${lastPostDate.substring(0,10)}`, 'success');
                    } else {
                        job.stats.dead++;
                        pushLog(job, `❌ Không có bài đăng trong 6 tháng`, 'error');
                    }
                } catch (apiErr) {
                    if (apiErr.message.includes('403') || apiErr.message.includes('429')) {
                        pushLog(job, `⚠️ API Key lỗi/hết hạn, đánh dấu hết hạn...`, 'warning');
                        markKeyAsExpired(token);
                    } else {
                        pushLog(job, `⚠️ LỖI Apify: ${apiErr.message}`, 'error');
                    }
                    job.stats.error++;
                    row['Latest_Post_Date'] = 'LỖI_API';
                    row['Active_Within_6_Months'] = 'UNKNOWN';
                }
                
                checkedRows.push(row);
                job.completed++;
                broadcastQueue();
            }
          } catch (e) {
            if (e.message !== 'ABORTED' && e.message !== 'Hết API Key Apify') throw e;
          } finally {
            if (job.status !== 'REMOVED') {
                const ts = new Date().getTime();
                const baseName = job.filename.replace(/\.[^/.]+$/, "");
                const outFilename = `${baseName}_checked_${ts}.csv`;
                const outPath = path.join(__dirname, 'outputs', outFilename);
                fs.writeFileSync(outPath, Papa.unparse(checkedRows));
                
                job.downloadLinks = job.downloadLinks || {};
                job.downloadLinks.checkedFile = `http://localhost:3001/api/download/${encodeURIComponent(outFilename)}`;
                
                if (job.status !== 'CANCELED') job.status = 'COMPLETED';
                if (job.lastStartedAt) {
                    job.accumulatedTime = (job.accumulatedTime || 0) + (Date.now() - job.lastStartedAt);
                    job.lastStartedAt = null;
                }
                pushLog(job, `🎉 Hoàn thành Check 6 tháng!`, 'success');
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

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const job = {
    id: crypto.randomBytes(8).toString('hex'),
    filename: req.file.originalname,
    status: 'PENDING',
    concurrency: parseInt(req.body.concurrency) || 3,
    headless: req.body.headless === 'true' || req.body.headless === true,
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



app.post('/api/queue/:id/check-activity', (req, res) => {
  const { id } = req.params;
  const historyJob = queue.find(j => j.id === id);
  if (!historyJob || !historyJob.downloadLinks || !historyJob.downloadLinks.aliveFile) {
      return res.status(400).json({ error: 'Job không hợp lệ hoặc chưa có file Alive' });
  }
  
  const filename = historyJob.downloadLinks.aliveFile.split('/').pop();
  const filePath = path.join(__dirname, 'outputs', decodeURIComponent(filename));
  const config = getConfig();
  
  const job = {
    id: crypto.randomBytes(8).toString('hex'),
    type: 'CHECK_ACTIVITY',
    filename: `Check6m_${historyJob.filename}`,
    status: 'PENDING',
    concurrency: 1, // Chạy 1 luồng để xoay vòng API an toàn
    headless: true,
    minDelay: config.minDelay,
    maxDelay: config.maxDelay,
    stats: { alive: 0, dead: 0, error: 0 },
    completed: 0,
    total: 0,
    logs: [],
    filePath: filePath,
    createdAt: Date.now(),
    accumulatedTime: 0,
    lastStartedAt: null
  };
  queue.push(job);
  broadcastQueue();
  processQueue(); 
  res.json({ success: true, jobId: job.id });
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
