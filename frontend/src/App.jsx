import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UploadCloud, 
  Play, 
  Settings, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Download, 
  Pause, 
  Square, 
  Trash2, 
  ArrowUpCircle, 
  Clock, 
  Eye, 
  Key, 
  RefreshCw, 
  Info,
  Layers,
  Sliders,
  Sparkles,
  FileSpreadsheet
} from 'lucide-react';
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
  };

  return (
    <span className="liquid-badge" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
      <Clock size={13} style={{ color: 'var(--color-accent)' }} /> {formatTime(elapsed)}
    </span>
  );
};

function App() {
  const [queue, setQueue] = useState([]);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [concurrency, setConcurrency] = useState(3);
  const [headless, setHeadless] = useState(true);
  const [activeTab, setActiveTab] = useState('queue');
  const [previewFile, setPreviewFile] = useState(null);
  const [historyPreviewFile, setHistoryPreviewFile] = useState(null);
  const [apifyKeys, setApifyKeys] = useState([]);
  const [apifyInput, setApifyInput] = useState('');
  const [isCheckingKeys, setIsCheckingKeys] = useState(false);
  const [apifyConfig, setApifyConfig] = useState({ maxUsagePerKey: 400, minDelay: 2000, maxDelay: 5000 });
  const [jobOptions, setJobOptions] = useState({
    checkAlive: true,
    checkAliveApify: false,
    checkAvatar: true,
    checkAvatarApify: false,
    monthsToCheck: 6
  });

  const fetchQueueData = () => {
    axios.get('http://localhost:3001/api/queue').then(res => setQueue(res.data)).catch(console.error);
  };

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      fetchQueueData();
    };
    const onDisconnect = () => {
      setIsConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
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
    
    fetchQueueData();
    axios.get('http://localhost:3001/api/apify-keys').then(res => {
      setApifyKeys(res.data);
      setApifyInput(res.data.map(k => k.key).join('\n'));
    }).catch(console.error);
    axios.get('http://localhost:3001/api/config').then(res => setApifyConfig(res.data)).catch(console.error);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('queue_update');
      socket.off('job_log');
    };
  }, []);

  const uploadFileDirectly = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('concurrency', concurrency);
    formData.append('headless', headless);
    formData.append('checkAlive', jobOptions.checkAlive);
    formData.append('checkAliveApify', jobOptions.checkAliveApify);
    formData.append('checkAvatar', jobOptions.checkAvatar);
    formData.append('checkAvatarApify', jobOptions.checkAvatarApify);
    formData.append('monthsToCheck', jobOptions.monthsToCheck);
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

  const handleFixAvatar = async (jobId) => {
    try {
      await axios.post(`http://localhost:3001/api/queue/${jobId}/fix-avatar`);
      setActiveTab('queue');
    } catch (e) {
      alert(e.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const handleBatchFixAvatar = async () => {
    const unfixJobs = queue.filter(j => 
      ['COMPLETED', 'ERROR'].includes(j.status) && 
      !j.checkAvatarApify
    );

    if (unfixJobs.length === 0) {
      alert('Không có tiến trình nào trong lịch sử chưa chạy sửa ảnh bằng Apify.');
      return;
    }

    if (!window.confirm(`Tìm thấy ${unfixJobs.length} tiến trình chưa chạy sửa ảnh bằng Apify.\nBạn có muốn đưa tất cả vào hàng đợi để xử lý không?`)) {
      return;
    }

    try {
      const res = await axios.post('http://localhost:3001/api/queue/batch-fix-avatar');
      if (res.data.count > 0) {
        setActiveTab('queue');
      } else {
        alert('Không có tiến trình hợp lệ nào được thêm vào hàng đợi (tệp dữ liệu có thể không tồn tại hoặc các tiến trình đã có trong hàng đợi).');
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Có lỗi xảy ra khi đưa tiến trình vào hàng đợi.');
    }
  };

  const handlePreviewHistory = async (url, originalFilename) => {
    try {
      const previewUrl = url.includes('?') ? `${url}&preview=true` : `${url}?preview=true`;
      const res = await axios.get(previewUrl, { responseType: 'blob' });
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

  const handleSaveApifyConfig = async () => {
    try {
      const res = await axios.post('http://localhost:3001/api/config', apifyConfig);
      setApifyConfig(res.data.config);
      alert('Lưu cấu hình thành công!');
    } catch (e) {
      alert('Lỗi khi lưu cấu hình');
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

  const handleTriggerQueue = async () => {
    try {
      await axios.post('http://localhost:3001/api/queue/trigger');
    } catch(e) {
      console.error(e);
    }
  };

  const handleBatchRetry = async () => {
    const failedJobs = queue.filter(j => ['ERROR', 'INTERRUPTED', 'CANCELED'].includes(j.status));
    if (failedJobs.length === 0) {
      alert('Không có tiến trình lỗi hoặc gián đoạn nào.');
      return;
    }
    if (!window.confirm(`Tìm thấy ${failedJobs.length} tiến trình lỗi/gián đoạn.\nBạn có muốn đưa tất cả vào hàng đợi để chạy lại từ đầu không?`)) {
      return;
    }
    try {
      await axios.post('http://localhost:3001/api/queue/batch-retry');
      setActiveTab('queue');
    } catch(e) {
      alert(e.response?.data?.error || 'Có lỗi xảy ra khi chạy lại.');
    }
  };

  const handleBatchResume = async () => {
    const interruptedWithCp = queue.filter(j => (j.status === 'INTERRUPTED' || j.status === 'PAUSED') && j.hasCheckpoint);
    if (interruptedWithCp.length === 0) {
      alert('Không có tiến trình gián đoạn nào có điểm dừng lưu.');
      return;
    }
    try {
      await axios.post('http://localhost:3001/api/queue/batch-resume');
      setActiveTab('queue');
    } catch(e) {
      alert(e.response?.data?.error || 'Có lỗi xảy ra khi tiếp tục tiến trình.');
    }
  };

  const queueItems = queue.filter(j => ['PENDING', 'RUNNING', 'PAUSED', 'INTERRUPTED'].includes(j.status));
  const historyItems = queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED', 'INTERRUPTED'].includes(j.status)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <div className="app-layout" style={{ minHeight: '100dvh' }}>
      {/* Liquid Glass Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <motion.div initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 className="hero-title" style={{ margin: 0 }}>
              Lead<span className="accent-mark">Purify</span>
            </h1>
            <span 
              className="liquid-badge" 
              style={{ 
                background: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.15)', 
                color: isConnected ? '#34d399' : '#fbbf24',
                fontSize: '0.75rem',
                padding: '2px 8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem'
              }}
              title={isConnected ? 'Máy chủ backend đang hoạt động bình thường' : 'Mất kết nối máy chủ, đang tự động thử lại...'}
            >
              <span style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                background: isConnected ? '#10b981' : '#f59e0b',
                boxShadow: isConnected ? '0 0 6px #10b981' : '0 0 6px #f59e0b',
                display: 'inline-block' 
              }} />
              {isConnected ? 'Máy chủ trực tuyến' : 'Đang kết nối lại...'}
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', margin: '0.25rem 0 0 0', letterSpacing: '0.01em' }}>
            Hệ thống xác thực liên kết và làm sạch dữ liệu tự động
          </p>
        </motion.div>

        {/* Floating Navigation Pill */}
        <nav className="liquid-nav">
          <button 
            className={`liquid-nav-btn ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            <Layers size={16} />
            Hàng đợi
            {queueItems.length > 0 && (
              <span className="liquid-badge" style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '1px 6px' }}>
                {queueItems.length}
              </span>
            )}
          </button>
          
          <button 
            className={`liquid-nav-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Clock size={16} />
            Lịch sử
            {historyItems.length > 0 && (
              <span className="liquid-badge" style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '1px 6px' }}>
                {historyItems.length}
              </span>
            )}
          </button>

          <button 
            className={`liquid-nav-btn ${activeTab === 'api' ? 'active' : ''}`}
            onClick={() => setActiveTab('api')}
          >
            <Key size={16} />
            API Keys
          </button>
        </nav>
      </header>

      {/* Liquid Glass Quick Guide Banner */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.48 }}
        className="liquid-guide-banner"
      >
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0, 102, 255, 0.15)', border: '1px solid rgba(0, 102, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Info size={18} style={{ color: '#38bdf8' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 0.375rem 0', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>
            Quy trình làm sạch dữ liệu LeadPurify
          </h4>
          <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
            1. <b>Hàng đợi:</b> Kéo thả tệp CSV chứa danh sách link để hệ thống tự động kiểm tra trạng thái hoạt động.<br/>
            2. <b>Lịch sử:</b> Kiểm tra tỷ lệ sống/chết và tải xuống danh sách kết quả đã phân loại (Sống / Chết / Lỗi).<br/>
            3. <b>Kiểm tra hoạt động:</b> Từ các tệp "Sống", bạn có thể quét dữ liệu bài đăng gần nhất (Apify API) để kiểm tra mức độ tương tác.
          </p>
        </div>
      </motion.div>

      {/* Main Workspace Body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Upload & Scanner Controls */}
        {activeTab !== 'api' && (
          <div className="grid-2col">
            {/* Liquid Upload Zone */}
            <motion.div 
              initial={{ scale: 0.98, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.45 }}
              className="upload-dropzone"
              onClick={() => document.getElementById('multiFileUpload').click()}
            >
              <div className="upload-icon-container">
                <UploadCloud size={28} />
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600, textAlign: 'center' }}>
                Kéo thả các tệp CSV vào đây
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                hoặc nhấp chuột để chọn tệp từ máy tính (hỗ trợ chọn nhiều tệp)
              </p>
              <input 
                id="multiFileUpload" 
                type="file" 
                accept=".csv" 
                multiple 
                style={{ display: 'none' }} 
                onChange={handleFileUpload} 
              />
            </motion.div>

            {/* Scan Configuration Card */}
            <motion.div 
              initial={{ y: 16, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.48 }}
              className="liquid-card"
              style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--glass-border-subtle)', paddingBottom: '0.75rem' }}>
                <Sliders size={18} style={{ color: 'var(--color-accent)' }} />
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Cấu hình quét mặc định</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <label className="liquid-checkbox-label">
                  <input 
                    type="checkbox" 
                    className="liquid-checkbox"
                    checked={jobOptions.checkAlive} 
                    onChange={e => setJobOptions({...jobOptions, checkAlive: e.target.checked})} 
                  />
                  <span>Kiểm tra link sống / chết</span>
                </label>

                <label className="liquid-checkbox-label">
                  <input 
                    type="checkbox" 
                    className="liquid-checkbox"
                    checked={jobOptions.checkAliveApify} 
                    onChange={e => setJobOptions({...jobOptions, checkAliveApify: e.target.checked})} 
                  />
                  <span>Kiểm tra link sống / chết bằng Apify</span>
                </label>

                {jobOptions.checkAliveApify && (
                  <div style={{ paddingLeft: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Số tháng hoạt động:</span>
                    <input 
                      type="number" 
                      min="1" 
                      value={jobOptions.monthsToCheck} 
                      onChange={e => setJobOptions({...jobOptions, monthsToCheck: e.target.value})} 
                      className="liquid-input"
                      style={{ width: '70px', padding: '0.35rem 0.5rem', textAlign: 'center' }} 
                    />
                  </div>
                )}

                <label className="liquid-checkbox-label">
                  <input 
                    type="checkbox" 
                    className="liquid-checkbox"
                    checked={jobOptions.checkAvatar} 
                    onChange={e => setJobOptions({...jobOptions, checkAvatar: e.target.checked})} 
                  />
                  <span>Kiểm tra link ảnh avatar và sửa lỗi</span>
                </label>

                <label className="liquid-checkbox-label">
                  <input 
                    type="checkbox" 
                    className="liquid-checkbox"
                    checked={jobOptions.checkAvatarApify} 
                    onChange={e => setJobOptions({...jobOptions, checkAvatarApify: e.target.checked})} 
                  />
                  <span>Kiểm tra link ảnh avatar và sửa bằng Apify</span>
                </label>

                {/* Concurrency Range */}
                <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span className="liquid-label" style={{ margin: 0 }}>Số luồng xử lý song song:</span>
                    <span className="liquid-badge" style={{ fontFamily: 'var(--font-mono)' }}>{concurrency} luồng</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="5" 
                    value={concurrency} 
                    onChange={(e) => setConcurrency(e.target.value)} 
                    className="liquid-range"
                  />
                </div>

                {/* Headless Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.25rem' }}>
                  <span className="liquid-label" style={{ margin: 0 }}>Chế độ chạy ẩn (Headless):</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className={`btn-outline ${headless ? 'btn-outline-accent' : ''}`} 
                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.8125rem' }} 
                      onClick={() => setHeadless(true)}
                    >
                      Bật
                    </button>
                    <button 
                      className={`btn-outline ${!headless ? 'btn-outline-warning' : ''}`} 
                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.8125rem' }} 
                      onClick={() => setHeadless(false)}
                    >
                      Tắt
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Queue & History List View */}
        {activeTab !== 'api' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h2 style={{ fontSize: '1.375rem', margin: 0, fontWeight: 600 }}>
                  {activeTab === 'queue' ? 'Hàng đợi tiến trình' : 'Lịch sử tiến trình'}
                </h2>
                <span className="liquid-badge" style={{ background: activeTab === 'queue' ? 'rgba(0, 102, 255, 0.15)' : 'rgba(168, 85, 247, 0.15)', color: activeTab === 'queue' ? '#38bdf8' : '#c084fc' }}>
                  {activeTab === 'queue' ? queueItems.length : historyItems.length} tiến trình
                </span>
              </div>

              {/* Queue Actions Toolbar */}
              {activeTab === 'queue' && (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {queue.some(j => (j.status === 'INTERRUPTED' || j.status === 'PAUSED') && j.hasCheckpoint) && (
                    <button 
                      onClick={handleBatchResume} 
                      className="btn-outline btn-outline-success" 
                      title="Tiếp tục tất cả các tiến trình bị gián đoạn từ điểm dừng đã lưu"
                    >
                      <Play size={15} /> Tiếp tục các tiến trình gián đoạn
                    </button>
                  )}
                  {queue.some(j => j.status === 'PENDING') && !queue.some(j => j.status === 'RUNNING') && (
                    <button 
                      onClick={handleTriggerQueue} 
                      className="btn-outline btn-outline-accent" 
                      title="Kích hoạt worker để chạy các tiến trình đang chờ trong hàng đợi"
                    >
                      <Play size={15} /> Kích hoạt hàng đợi
                    </button>
                  )}
                </div>
              )}

              {/* History Actions Toolbar */}
              {activeTab === 'history' && historyItems.length > 0 && (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {queue.filter(j => ['ERROR', 'INTERRUPTED', 'CANCELED'].includes(j.status)).length > 0 && (
                    <button 
                      onClick={handleBatchRetry} 
                      className="btn-outline btn-outline-accent"
                      title="Chạy lại tất cả các tiến trình bị lỗi, hủy hoặc gián đoạn"
                    >
                      <RefreshCw size={15} /> Chạy lại lỗi / gián đoạn ({queue.filter(j => ['ERROR', 'INTERRUPTED', 'CANCELED'].includes(j.status)).length})
                    </button>
                  )}
                  
                  <button 
                    onClick={handleBatchFixAvatar} 
                    className="btn-outline btn-outline-accent" 
                    style={{ 
                      opacity: queue.filter(j => ['COMPLETED', 'ERROR'].includes(j.status) && !j.checkAvatarApify).length === 0 ? 0.5 : 1
                    }}
                    title="Đưa các tiến trình trong lịch sử chưa sửa ảnh bằng Apify vào hàng đợi"
                  >
                    <RefreshCw size={15} /> 
                    Sửa ảnh Apify hàng loạt ({queue.filter(j => ['COMPLETED', 'ERROR'].includes(j.status) && !j.checkAvatarApify).length})
                  </button>
                  
                  <button onClick={() => handleBatchDownload('alive')} className="btn-outline btn-outline-success">
                    <Download size={15} /> Tải Link Sống
                  </button>
                  
                  <button onClick={() => handleBatchDownload('dead')} className="btn-outline btn-outline-warning">
                    <Download size={15} /> Tải Link Chết
                  </button>
                  
                  <button onClick={handleClearHistory} className="btn-outline btn-outline-danger">
                    <Trash2 size={15} /> Xóa lịch sử
                  </button>
                </div>
              )}
            </div>

            {/* Job Items List */}
            <AnimatePresence>
              {(activeTab === 'queue' ? queueItems : historyItems).map(job => {
                const percent = job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
                const isRunning = job.status === 'RUNNING';

                return (
                  <motion.div 
                    key={job.id} 
                    initial={{ opacity: 0, y: 16 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, height: 0, overflow: 'hidden' }} 
                    transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                    className={`liquid-card ${isRunning ? 'liquid-card-highlight' : ''}`}
                    style={{ padding: '1.5rem', marginBottom: '1.25rem', overflow: 'hidden' }}
                  >
                    {/* Top Job Details & Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                      <div style={{ flex: 1, minWidth: '260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
                          <FileSpreadsheet size={18} style={{ color: 'var(--color-accent)' }} />
                          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                            {job.filename}
                          </h3>
                          
                          {/* Status Badge */}
                          <span className={`liquid-badge ${
                            job.status === 'COMPLETED' ? 'liquid-badge-success' :
                            job.status === 'RUNNING' ? 'liquid-badge-accent' :
                            job.status === 'PAUSED' ? 'liquid-badge-warning' :
                            job.status === 'INTERRUPTED' ? 'liquid-badge-warning' :
                            job.status === 'ERROR' || job.status === 'CANCELED' ? 'liquid-badge-danger' : ''
                          }`}>
                            {job.status === 'INTERRUPTED' ? 'Bị gián đoạn' : job.status}
                          </span>

                          {job.hasCheckpoint && (
                            <span className="liquid-badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }} title={`Đã lưu checkpoint an toàn tại dòng ${job.completed}/${job.total}`}>
                              <Sparkles size={12} /> Điểm dừng ({job.completed}/{job.total})
                            </span>
                          )}

                          <JobTimer job={job} />

                          {job.checkAvatarApify && activeTab === 'history' && (
                            <span className="liquid-badge liquid-badge-success" title="Đã trích xuất & sửa link avatar từ Apify">
                              <CheckCircle size={12} /> Đã sửa ảnh Apify
                            </span>
                          )}
                        </div>

                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.84375rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <span>Đã xử lý: <b>{job.completed}</b> / {job.total} (Luồng: {job.concurrency})</span>
                          {job.createdAt && (
                            <span style={{ opacity: 0.75 }}>
                              • Tạo lúc: {new Date(job.createdAt).toLocaleString('vi-VN')}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Tactical Action Buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {job.status === 'RUNNING' && (
                          <button onClick={() => jobAction(job.id, 'pause')} className="btn-outline btn-outline-warning btn-icon" title="Tạm dừng">
                            <Pause size={15} />
                          </button>
                        )}
                        {job.status === 'PAUSED' && (
                          <button onClick={() => jobAction(job.id, 'resume')} className="btn-outline btn-outline-success btn-icon" title="Tiếp tục">
                            <Play size={15} />
                          </button>
                        )}
                        {(job.status === 'RUNNING' || job.status === 'PAUSED') && (
                          <button onClick={() => jobAction(job.id, 'cancel')} className="btn-outline btn-outline-danger btn-icon" title="Hủy bỏ">
                            <Square size={15} />
                          </button>
                        )}
                        {job.status === 'PENDING' && (
                          <button onClick={() => jobAction(job.id, 'force')} className="btn-outline btn-outline-accent btn-icon" title="Ưu tiên chạy ngay">
                            <ArrowUpCircle size={15} />
                          </button>
                        )}
                        {['INTERRUPTED', 'ERROR', 'CANCELED'].includes(job.status) && (job.hasCheckpoint || job.completed > 0) && (
                          <button onClick={() => jobAction(job.id, 'resume')} className="btn-outline btn-outline-success btn-icon" title="Tiếp tục quét từ điểm dừng đã lưu">
                            <Play size={15} />
                          </button>
                        )}
                        {['INTERRUPTED', 'ERROR', 'CANCELED', 'COMPLETED'].includes(job.status) && (
                          <button onClick={() => jobAction(job.id, 'retry')} className="btn-outline btn-outline-accent btn-icon" title="Chạy lại toàn bộ từ đầu">
                            <RefreshCw size={15} />
                          </button>
                        )}
                        {['PENDING', 'CANCELED', 'COMPLETED', 'ERROR', 'INTERRUPTED'].includes(job.status) && (
                          <button onClick={() => jobAction(job.id, 'remove')} className="btn-outline btn-outline-danger btn-icon" title="Xóa khỏi danh sách">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className="liquid-progress-track" style={{ marginBottom: '1rem' }}>
                      <div 
                        className="liquid-progress-fill" 
                        style={{ width: `${percent}%` }} 
                      />
                    </div>

                    {/* Results Counter Pills */}
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
                      <span className="liquid-badge liquid-badge-success">
                        <CheckCircle size={14} /> Sống: {job.stats?.alive || 0}
                      </span>
                      <span className="liquid-badge liquid-badge-danger">
                        <XCircle size={14} /> Chết: {job.stats?.dead || 0}
                      </span>
                      <span className="liquid-badge liquid-badge-warning">
                        <AlertTriangle size={14} /> Lỗi: {job.stats?.error || 0}
                      </span>
                    </div>

                    {/* Download & File Action Triggers */}
                    {job.downloadLinks && (
                      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        {job.downloadLinks.aliveFile && (
                          <div style={{ display: 'flex' }}>
                            <button 
                              onClick={() => handlePreviewHistory(job.downloadLinks.aliveFile, `Alive_${job.filename}`)} 
                              className="btn-outline btn-outline-success" 
                              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none', padding: '0.45rem 0.75rem' }} 
                              title="Xem trước danh sách link sống"
                            >
                              <Eye size={14} />
                            </button>
                            <a 
                              href={job.downloadLinks.aliveFile} 
                              download 
                              className="btn-outline btn-outline-success" 
                              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: '0.45rem 0.85rem' }}
                            >
                              <Download size={14} /> Tải Link Sống
                            </a>
                          </div>
                        )}

                        {job.downloadLinks.deadFile && (
                          <div style={{ display: 'flex' }}>
                            <button 
                              onClick={() => handlePreviewHistory(job.downloadLinks.deadFile, `Dead_${job.filename}`)} 
                              className="btn-outline btn-outline-danger" 
                              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none', padding: '0.45rem 0.75rem' }} 
                              title="Xem trước danh sách link chết"
                            >
                              <Eye size={14} />
                            </button>
                            <a 
                              href={job.downloadLinks.deadFile} 
                              download 
                              className="btn-outline btn-outline-danger" 
                              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: '0.45rem 0.85rem' }}
                            >
                              <Download size={14} /> Tải Link Chết
                            </a>
                          </div>
                        )}

                        {job.downloadLinks.checkedFile && (
                          <a 
                            href={job.downloadLinks.checkedFile} 
                            download 
                            className="btn-outline btn-outline-accent" 
                            style={{ padding: '0.45rem 0.85rem' }}
                          >
                            <Download size={14} /> Tải kết quả hoạt động
                          </a>
                        )}

                        {activeTab === 'history' && !job.checkAvatarApify && (job.status === 'COMPLETED' || job.status === 'ERROR') && (
                          <button 
                            onClick={() => handleFixAvatar(job.id)} 
                            className="btn-outline btn-outline-accent"
                            style={{ padding: '0.45rem 0.85rem' }}
                          >
                            <RefreshCw size={14} /> Sửa ảnh bằng Apify
                          </button>
                        )}
                      </div>
                    )}

                    {/* Console / Terminal Log Stream */}
                    {(job.status === 'RUNNING' || job.status === 'PAUSED' || job.logs?.length > 0) && (
                      <div className="log-container">
                        {job.logs?.map((log, idx) => {
                          let color = 'var(--text-secondary)';
                          if (log.type === 'error') color = 'var(--status-dead)';
                          if (log.type === 'success') color = 'var(--status-alive)';
                          if (log.type === 'warning') color = 'var(--status-warning)';
                          return (
                            <div key={idx} style={{ color, display: 'flex', gap: '0.625rem', marginBottom: '0.25rem' }}>
                              <span style={{ opacity: 0.5, flexShrink: 0 }}>[{log.timestamp?.split('T')[1]?.substring(0,8)}]</span>
                              <span style={{ wordBreak: 'break-all' }}>{log.message}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Empty State */}
            {(activeTab === 'queue' ? queueItems : historyItems).length === 0 && (
              <div className="liquid-empty-state">
                <FileSpreadsheet className="liquid-empty-icon" />
                <h3 style={{ margin: 0, fontSize: '1.125rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Chưa có tiến trình nào trong {activeTab === 'queue' ? 'hàng đợi' : 'lịch sử'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>
                  {activeTab === 'queue' 
                    ? 'Hãy kéo thả tệp CSV vào khu vực bên trên để bắt đầu quét dữ liệu.' 
                    : 'Các tiến trình sau khi hoàn thành sẽ được lưu giữ tại đây.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* API Keys & Configuration Tab */}
        {activeTab === 'api' && (
          <motion.div 
            initial={{ opacity: 0, y: 16 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.48 }}
            className="liquid-card"
            style={{ padding: '2rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <Key size={22} style={{ color: 'var(--color-accent)' }} />
              <h2 style={{ fontSize: '1.375rem', margin: 0, fontWeight: 600 }}>
                Quản lý Apify API Keys
              </h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', marginBottom: '2rem' }}>
              Nhập danh sách API Token của Apify (mỗi token trên một dòng riêng). Hệ thống sẽ tự động luân phiên xoay vòng khi token đạt ngưỡng request tối đa hoặc gặp giới hạn định ngạch.
            </p>

            <div className="grid-2col" style={{ alignItems: 'start' }}>
              {/* Left Column: API Keys Input */}
              <div>
                <label className="liquid-label">Danh sách API Tokens (Apify)</label>
                <textarea 
                  value={apifyInput} 
                  onChange={(e) => setApifyInput(e.target.value)} 
                  placeholder="apify_api_token_1&#10;apify_api_token_2"
                  className="liquid-textarea font-mono"
                  style={{ height: '320px', resize: 'vertical' }}
                />
                
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                  <button onClick={handleSaveApifyKeys} className="btn-primary">
                    Lưu danh sách Keys
                  </button>
                  <button 
                    onClick={handleCheckApifyKeys} 
                    disabled={isCheckingKeys} 
                    className="btn-outline btn-outline-warning"
                  >
                    <RefreshCw size={16} className={isCheckingKeys ? "spin" : ""} /> 
                    {isCheckingKeys ? "Đang kiểm tra..." : "Kiểm tra toàn bộ Keys"}
                  </button>
                </div>
              </div>

              {/* Right Column: Advanced Settings & Key Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Advanced Settings */}
                <div className="liquid-card" style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.02)' }}>
                  <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.0625rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Settings size={17} style={{ color: 'var(--color-accent)' }} /> Cấu hình xoay vòng & độ trễ
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <label className="liquid-label">Số request tối đa mỗi Key (xoay vòng)</label>
                      <input 
                        type="number" 
                        value={apifyConfig.maxUsagePerKey} 
                        onChange={(e) => setApifyConfig({...apifyConfig, maxUsagePerKey: parseInt(e.target.value) || 0})}
                        className="liquid-input" 
                      />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label className="liquid-label">Độ trễ tối thiểu (ms)</label>
                        <input 
                          type="number" 
                          value={apifyConfig.minDelay} 
                          onChange={(e) => setApifyConfig({...apifyConfig, minDelay: parseInt(e.target.value) || 0})}
                          className="liquid-input" 
                        />
                      </div>
                      <div>
                        <label className="liquid-label">Độ trễ tối đa (ms)</label>
                        <input 
                          type="number" 
                          value={apifyConfig.maxDelay} 
                          onChange={(e) => setApifyConfig({...apifyConfig, maxDelay: parseInt(e.target.value) || 0})}
                          className="liquid-input" 
                        />
                      </div>
                    </div>

                    <button onClick={handleSaveApifyConfig} className="btn-outline btn-outline-accent" style={{ marginTop: '0.5rem' }}>
                      Lưu cấu hình nâng cao
                    </button>
                  </div>
                </div>

                {/* Key Status List */}
                <div className="liquid-card" style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 600 }}>
                      Trạng thái Keys hiện tại
                    </h3>
                    <span className="liquid-badge">
                      {apifyKeys.length} keys
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', maxHeight: '220px', overflowY: 'auto' }}>
                    {apifyKeys.map((k, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '0.625rem 0.875rem', 
                          background: 'rgba(255, 255, 255, 0.03)', 
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--glass-border-subtle)'
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', opacity: 0.85 }}>
                          {k.key ? `${k.key.substring(0, 14)}...` : 'Unknown Key'}
                        </span>
                        
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Đã dùng: {k.usage || 0}/{apifyConfig.maxUsagePerKey}
                          </span>
                          <span className={`liquid-badge ${k.status === 'active' ? 'liquid-badge-success' : 'liquid-badge-danger'}`}>
                            {k.status?.toUpperCase() || 'ACTIVE'}
                          </span>
                        </div>
                      </div>
                    ))}

                    {apifyKeys.length === 0 && (
                      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>
                        Chưa có API Key nào được thiết lập
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
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
