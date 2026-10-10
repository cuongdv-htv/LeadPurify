import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, Play, Settings, CheckCircle, XCircle, AlertTriangle, Download, Pause, Square, Trash2, ArrowUpCircle, Clock, Eye, Calendar, Key, RefreshCw } from 'lucide-react';
import './index.css';
import CsvEditorModal from './components/CsvEditorModal';

const socket = io('http://localhost:3001');

const JobTimer = ({ job }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        let interval;
        const calculateElapsed = () => {
            let total = job.accumulatedTime || 0;
            if (job.status === 'RUNNING' && job.lastStartedAt) {
                total += (Date.now() - job.lastStartedAt);
            }
            setElapsed(Math.floor(total / 1000));
        };

        calculateElapsed();

        if (job.status === 'RUNNING') {
            interval = setInterval(calculateElapsed, 1000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [job.status, job.accumulatedTime, job.lastStartedAt]);

    const formatTime = (seconds) => {
        if (!seconds || seconds < 0) return '00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        if (h > 0) return `${h}:${m}:${s}`;
        return `${m}:${s}`;
    }

    return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', color: 'var(--neon-cyan)', background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: '12px' }}>
            <Clock size={14} /> {formatTime(elapsed)}
        </span>
    );
};

function App() {
  const [queue, setQueue] = useState([]);
  const [concurrency, setConcurrency] = useState(3);
  const [headless, setHeadless] = useState(true);
  const [activeTab, setActiveTab] = useState('queue');
  const [previewFile, setPreviewFile] = useState(null);
  const [historyPreviewFile, setHistoryPreviewFile] = useState(null);
  const [apifyKeys, setApifyKeys] = useState([]);
  const [apifyInput, setApifyInput] = useState('');
  const [isCheckingKeys, setIsCheckingKeys] = useState(false);

  useEffect(() => {
    socket.on('queue_update', (data) => setQueue(data));
    socket.on('job_log', ({ jobId, log }) => {
      setQueue(prevQueue => prevQueue.map(job => {
        if (job.id === jobId) {
          const newLogs = [...(job.logs || []), log].slice(-50);
          return { ...job, logs: newLogs };
        }
        return job;
      }));
    });
    
    axios.get('http://localhost:3001/api/queue').then(res => setQueue(res.data));
    axios.get('http://localhost:3001/api/apify-keys').then(res => {
        setApifyKeys(res.data);
        setApifyInput(res.data.map(k => k.key).join('\n'));
    });

    return () => {
      socket.off('queue_update');
      socket.off('job_log');
    };
  }, []);

  const uploadFileDirectly = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('concurrency', concurrency);
    formData.append('headless', headless);
    try {
      await axios.post('http://localhost:3001/api/upload', formData);
    } catch(err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (files.length === 1) {
        setPreviewFile(files[0]);
    } else {
        for (let i = 0; i < files.length; i++) {
            await uploadFileDirectly(files[i]);
        }
    }
    e.target.value = ''; 
  };

  const handleConfirmUpload = async (newFile) => {
    setPreviewFile(null);
    await uploadFileDirectly(newFile);
  };

  const jobAction = async (id, action) => {
    await axios.post(`http://localhost:3001/api/queue/${id}/${action}`);
  };

  const handleBatchDownload = (type) => {
    const historyJobs = queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED'].includes(j.status));
    let delay = 0;
    historyJobs.forEach(job => {
      if (job.downloadLinks) {
        if (type === 'alive' && job.stats?.alive > 0 && job.downloadLinks.aliveFile) {
          setTimeout(() => {
            const a = document.createElement('a');
            a.href = job.downloadLinks.aliveFile;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }, delay);
          delay += 300;
        }
        if (type === 'dead' && job.stats?.dead > 0 && job.downloadLinks.deadFile) {
          setTimeout(() => {
            const a = document.createElement('a');
            a.href = job.downloadLinks.deadFile;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }, delay);
          delay += 300;
        }
      }
    });
  };

  const handleClearHistory = async () => {
    if (window.confirm('Bạn có chắc muốn xóa toàn bộ lịch sử tiến trình không?')) {
        await axios.post('http://localhost:3001/api/clear-history');
    }
  };

  const handleCheckActivity = async (jobId) => {
    if (window.confirm('Bạn có chắc muốn chạy kiểm tra bài viết 6 tháng cho file này? Việc này sẽ gọi API Apify và tốn thời gian.')) {
        try {
            await axios.post(`http://localhost:3001/api/queue/${jobId}/check-activity`, { minDelay: 2000, maxDelay: 5000 });
            setActiveTab('queue');
        } catch (e) {
            alert(e.response?.data?.error || 'Có lỗi xảy ra');
        }
    }
  };

  const handlePreviewHistory = async (url, originalFilename) => {
      try {
          const res = await axios.get(url, { responseType: 'blob' });
          const file = new File([res.data], originalFilename, { type: 'text/csv' });
          setHistoryPreviewFile(file);
      } catch (err) {
          console.error("Lỗi khi lấy file lịch sử:", err);
          alert("Không thể tải file để xem trước.");
      }
  };

  const handleConfirmHistoryDownload = (editedFile) => {
      const url = URL.createObjectURL(editedFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = editedFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setHistoryPreviewFile(null);
  };

  const handleSaveApifyKeys = async () => {
      const keysArray = apifyInput.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      const newKeys = keysArray.map(key => {
          const existing = apifyKeys.find(k => k.key === key);
          return existing ? existing : { key, usage: 0, status: 'active' };
      });
      try {
          await axios.post('http://localhost:3001/api/apify-keys', { keys: newKeys });
          setApifyKeys(newKeys);
          alert('Lưu API Keys thành công!');
      } catch (e) {
          alert('Lỗi khi lưu API Keys');
      }
  };

  const handleCheckApifyKeys = async () => {
      setIsCheckingKeys(true);
      try {
          const res = await axios.post('http://localhost:3001/api/apify-keys/check');
          setApifyKeys(res.data);
      } catch (e) {
          alert('Lỗi khi kiểm tra trạng thái API Keys');
      } finally {
          setIsCheckingKeys(false);
      }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px' }}>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
      <header className="text-center mb-4">
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h1 style={{ fontSize: '3rem', margin: '0 0 10px 0' }} className="neon-text-cyan">
            Lead<span className="neon-text-purple">Purify</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            Quản lý Hàng đợi (Queue) Kiểm tra Link Facebook
          </p>
        </motion.div>
      </header>

      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '24px' }}>
        <button className={`btn-outline ${activeTab === 'queue' ? 'neon-text-cyan' : ''}`} style={{ borderColor: activeTab === 'queue' ? 'var(--neon-cyan)' : 'var(--glass-border)', padding: '8px 24px', fontWeight: activeTab === 'queue' ? 'bold' : 'normal' }} onClick={() => setActiveTab('queue')}>
            Đang chạy
        </button>
        <button className={`btn-outline ${activeTab === 'history' ? 'neon-text-purple' : ''}`} style={{ borderColor: activeTab === 'history' ? 'var(--neon-purple)' : 'var(--glass-border)', padding: '8px 24px', fontWeight: activeTab === 'history' ? 'bold' : 'normal' }} onClick={() => setActiveTab('history')}>
            Lịch sử
        </button>
        <button className={`btn-outline ${activeTab === 'api' ? 'neon-text-cyan' : ''}`} style={{ borderColor: activeTab === 'api' ? 'var(--neon-cyan)' : 'var(--glass-border)', padding: '8px 24px', fontWeight: activeTab === 'api' ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setActiveTab('api')}>
            <Key size={16}/> Cấu hình API
        </button>
      </div>

      <div className="flex gap-4 flex-col" style={{ marginTop: '20px' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="glass-panel p-6 flex flex-col items-center justify-center"
              style={{ borderStyle: 'dashed', borderWidth: '2px', cursor: 'pointer', minHeight: '220px' }}
              onClick={() => document.getElementById('multiFileUpload').click()}
            >
              <UploadCloud size={48} color="var(--neon-cyan)" style={{ marginBottom: '16px' }} />
              <h3 style={{ margin: 0, fontSize: '1.2rem', textAlign: 'center' }}>
                Kéo thả nhiều file CSV vào đây
              </h3>
              <input id="multiFileUpload" type="file" accept=".csv" multiple style={{ display: 'none' }} onChange={handleFileUpload} />
            </motion.div>

            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel p-6 flex-col gap-4">
              <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} /> Cấu hình Quét mặc định
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>
                    Luồng (Concurrency): <b>{concurrency}</b>
                  </label>
                  <input type="range" min="1" max="5" value={concurrency} onChange={(e) => setConcurrency(e.target.value)} style={{ width: '100%', accentColor: 'var(--neon-purple)' }}/>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>
                    Giao diện ngầm (Headless):
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className={`btn-outline ${headless ? 'neon-text-cyan' : ''}`} style={{ borderColor: headless ? 'var(--neon-cyan)' : '', padding: '6px 12px' }} onClick={() => setHeadless(true)}>Bật</button>
                    <button className={`btn-outline ${!headless ? 'neon-text-purple' : ''}`} style={{ borderColor: !headless ? 'var(--neon-purple)' : '', padding: '6px 12px' }} onClick={() => setHeadless(false)}>Tắt</button>
                  </div>
                </div>
              </div>
            </motion.div>
        </div>

        <div style={{ marginTop: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }} className={activeTab === 'queue' ? "neon-text-cyan" : "neon-text-purple"}>
                   {activeTab === 'queue' ? 'Hàng đợi tiến trình' : 'Lịch sử tiến trình'} 
                   <span style={{ background: activeTab === 'queue' ? 'var(--neon-purple)' : 'var(--neon-cyan)', color: 'white', padding: '2px 10px', borderRadius: '12px', fontSize: '1rem' }}>
                       {activeTab === 'queue' ? queue.filter(j => ['PENDING', 'RUNNING', 'PAUSED'].includes(j.status)).length : queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED'].includes(j.status)).length}
                   </span>
                </h2>
                {activeTab === 'history' && queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED'].includes(j.status)).length > 0 && (
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => handleBatchDownload('alive')} className="btn-outline" style={{ borderColor: '#10b981', color: '#10b981', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Download size={18} /> Tải Link Sống
                        </button>
                        <button onClick={() => handleBatchDownload('dead')} className="btn-outline" style={{ borderColor: '#f59e0b', color: '#f59e0b', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Download size={18} /> Tải Link Chết
                        </button>
                        <button onClick={handleClearHistory} className="btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Trash2 size={18} /> Xóa lịch sử
                        </button>
                    </div>
                )}
            </div>
            <AnimatePresence>
                {(activeTab === 'queue' ? queue.filter(j => ['PENDING', 'RUNNING', 'PAUSED'].includes(j.status)) : queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED'].includes(j.status)).sort((a, b) => b.createdAt - a.createdAt)).map(job => {
                    const percent = job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
                    return (
                        <motion.div key={job.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="glass-panel p-6" style={{ marginBottom: '16px', position: 'relative', overflow: 'hidden' }}>
                            {job.status === 'RUNNING' && (
                                <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--neon-cyan)', boxShadow: '0 0 10px var(--neon-cyan)' }} />
                            )}
                            
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {job.filename}
                                        <span style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)' }}>
                                            {job.status}
                                        </span>
                                        <JobTimer job={job} />
                                    </h3>
                                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span>Đã quét: {job.completed}/{job.total} (Luồng: {job.concurrency})</span>
                                        {job.createdAt && (
                                            <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                                                • Tạo lúc: {new Date(job.createdAt).toLocaleString('vi-VN')}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {job.status === 'RUNNING' && <button onClick={() => jobAction(job.id, 'pause')} className="btn-outline" style={{ borderColor: '#f59e0b', color: '#f59e0b', padding: '6px 12px' }} title="Tạm dừng"><Pause size={16}/></button>}
                                    {job.status === 'PAUSED' && <button onClick={() => jobAction(job.id, 'resume')} className="btn-outline" style={{ borderColor: '#10b981', color: '#10b981', padding: '6px 12px' }} title="Tiếp tục"><Play size={16}/></button>}
                                    {(job.status === 'RUNNING' || job.status === 'PAUSED') && <button onClick={() => jobAction(job.id, 'cancel')} className="btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444', padding: '6px 12px' }} title="Hủy bỏ"><Square size={16}/></button>}
                                    {job.status === 'PENDING' && <button onClick={() => jobAction(job.id, 'force')} className="btn-outline" style={{ borderColor: 'var(--neon-cyan)', color: 'var(--neon-cyan)', padding: '6px 12px' }} title="Ưu tiên chạy ngay"><ArrowUpCircle size={16}/></button>}
                                    {['PENDING', 'CANCELED', 'COMPLETED', 'ERROR'].includes(job.status) && <button onClick={() => jobAction(job.id, 'remove')} className="btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444', padding: '6px 12px' }} title="Xóa khỏi danh sách"><Trash2 size={16}/></button>}
                                </div>
                            </div>

                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
                                <div style={{ height: '100%', width: `${percent}%`, background: 'linear-gradient(90deg, var(--neon-cyan), var(--neon-purple))', transition: 'width 0.3s ease' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', fontSize: '0.95rem' }}>
                                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={16}/> Sống: {job.stats?.alive || 0}</span>
                                <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}><XCircle size={16}/> Chết: {job.stats?.dead || 0}</span>
                                <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={16}/> Lỗi: {job.stats?.error || 0}</span>
                            </div>

                            {job.downloadLinks && (
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                    {job.downloadLinks.aliveFile && (
                                        <div style={{ display: 'flex' }}>
                                            <button onClick={() => handlePreviewHistory(job.downloadLinks.aliveFile, `Alive_${job.filename}`)} className="btn-outline" style={{ borderColor: '#10b981', color: '#10b981', padding: '6px 12px', borderRight: 'none', borderRadius: '4px 0 0 4px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.9rem' }} title="Xem trước"><Eye size={14}/></button>
                                            <a href={job.downloadLinks.aliveFile} download className="btn-outline" style={{ borderColor: '#10b981', color: '#10b981', padding: '6px 12px', borderRadius: '0 4px 4px 0', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.9rem' }}><Download size={14}/> Link Sống</a>
                                        </div>
                                    )}
                                    {job.downloadLinks.deadFile && (
                                        <div style={{ display: 'flex' }}>
                                            <button onClick={() => handlePreviewHistory(job.downloadLinks.deadFile, `Dead_${job.filename}`)} className="btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444', padding: '6px 12px', borderRight: 'none', borderRadius: '4px 0 0 4px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.9rem' }} title="Xem trước"><Eye size={14}/></button>
                                            <a href={job.downloadLinks.deadFile} download className="btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: '0 4px 4px 0', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.9rem' }}><Download size={14}/> Link Chết</a>
                                        </div>
                                    )}
                                    {job.downloadLinks.checkedFile && (
                                        <div style={{ display: 'flex' }}>
                                            <a href={job.downloadLinks.checkedFile} download className="btn-outline" style={{ borderColor: 'var(--neon-purple)', color: 'var(--neon-purple)', padding: '6px 12px', borderRadius: '4px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.9rem' }}><Download size={14}/> Kết quả 6 tháng</a>
                                        </div>
                                    )}
                                    {job.status === 'COMPLETED' && job.downloadLinks.aliveFile && !job.downloadLinks.checkedFile && job.type !== 'CHECK_ACTIVITY' && (
                                        <button onClick={() => handleCheckActivity(job.id)} className="btn-outline" style={{ borderColor: 'var(--neon-cyan)', color: 'var(--neon-cyan)', padding: '6px 12px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.9rem' }}>
                                            <Calendar size={14} /> Kiểm tra 6 tháng
                                        </button>
                                    )}
                                </div>
                            )}

                            {(job.status === 'RUNNING' || job.status === 'PAUSED' || job.logs?.length > 0) && (
                                <div className="log-container" style={{ maxHeight: '120px', background: 'rgba(0,0,0,0.3)', border: 'none' }}>
                                    {job.logs?.map((log, idx) => {
                                        let color = 'var(--text-main)';
                                        if (log.type === 'error') color = '#ef4444';
                                        if (log.type === 'success') color = '#10b981';
                                        if (log.type === 'warning') color = '#f59e0b';
                                        return (
                                            <div key={idx} style={{ color, display: 'flex', gap: '8px', fontSize: '0.8rem', marginBottom: '4px' }}>
                                                <span style={{ opacity: 0.5 }}>[{log.timestamp?.split('T')[1]?.substring(0,8)}]</span>
                                                <span>{log.message}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
            {activeTab !== 'api' && (activeTab === 'queue' ? queue.filter(j => ['PENDING', 'RUNNING', 'PAUSED'].includes(j.status)) : queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED'].includes(j.status))).length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px', padding: '40px', border: '1px dashed var(--glass-border)', borderRadius: '16px' }}>
                    Chưa có tiến trình nào trong {activeTab === 'queue' ? 'hàng đợi' : 'lịch sử'}.{activeTab === 'queue' ? <><br/>Hãy kéo thả một vài file CSV vào khu vực phía trên!</> : ''}
                </div>
            )}
            
            {activeTab === 'api' && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6">
                    <h2 style={{ fontSize: '1.5rem', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '12px' }} className="neon-text-cyan">
                        <Key size={24} /> Quản lý Apify API Keys
                    </h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
                        Nhập các API Token của Apify (mỗi key một dòng). Hệ thống sẽ tự động xoay vòng khi mỗi key đạt 400 request hoặc bị lỗi giới hạn.
                    </p>
                    
                    <div style={{ display: 'flex', gap: '24px' }}>
                        <div style={{ flex: 1 }}>
                            <textarea 
                                value={apifyInput} 
                                onChange={(e) => setApifyInput(e.target.value)} 
                                placeholder="apify_api_...&#10;apify_api_..."
                                style={{ width: '100%', height: '300px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white', padding: '12px', fontFamily: 'monospace', resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                <button onClick={handleSaveApifyKeys} className="btn-outline" style={{ borderColor: 'var(--neon-cyan)', color: 'var(--neon-cyan)', padding: '10px 24px', fontWeight: 'bold' }}>
                                    Lưu Cấu Hình API
                                </button>
                                <button onClick={handleCheckApifyKeys} disabled={isCheckingKeys} className="btn-outline" style={{ borderColor: '#f59e0b', color: '#f59e0b', padding: '10px 24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', opacity: isCheckingKeys ? 0.6 : 1 }}>
                                    <RefreshCw size={18} className={isCheckingKeys ? "spin" : ""} /> {isCheckingKeys ? "Đang kiểm tra..." : "Kiểm tra toàn bộ Keys"}
                                </button>
                            </div>
                        </div>
                        
                        <div style={{ flex: 1, background: 'rgba(0,0,0,0.1)', borderRadius: '8px', padding: '16px', border: '1px solid var(--glass-border)' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Trạng thái Keys hiện tại ({apifyKeys.length})</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                                {apifyKeys.map((k, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                        <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', opacity: 0.8 }}>
                                            {k.key.substring(0, 15)}...
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Đã dùng: {k.usage || 0}/400</span>
                                            <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '12px', background: k.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: k.status === 'active' ? '#10b981' : '#ef4444' }}>
                                                {k.status.toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {apifyKeys.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Chưa có API Key nào</div>}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
      </div>

      {/* CSV Preview Modal for Upload */}
      {previewFile && (
        <CsvEditorModal 
           file={previewFile} 
           onClose={() => setPreviewFile(null)} 
           onConfirm={handleConfirmUpload} 
           mode="upload"
        />
      )}

      {/* CSV Preview Modal for History Download */}
      {historyPreviewFile && (
        <CsvEditorModal 
           file={historyPreviewFile} 
           onClose={() => setHistoryPreviewFile(null)} 
           onConfirm={handleConfirmHistoryDownload} 
           mode="download"
        />
      )}
    </div>
  );
}

export default App;
