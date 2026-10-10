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
    fs.writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2), (err) => {
        if(err) console.error('Lỗi lưu queue:', err);
    });
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
                    
                    if (currentImgUrl) {
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

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const job = {
    id: crypto.randomBytes(8).toString('hex'),
    filename: req.file.originalname,
    status: 'PENDING',
    concurrency: parseInt(req.body.concurrency) || 3,
    headless: req.body.headless === 'true' || req.body.headless === true,
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

app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'outputs', req.params.filename);
  if (fs.existsSync(filePath)) res.download(filePath);
  else res.status(404).send('Not found');
});

server.listen(3001, () => console.log('Queue backend on 3001'));
