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
  FileSpreadsheet,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Activity,
  FileDown,
  CheckCircle2
} from 'lucide-react';
import './index.css';
import CsvEditorModal from './components/CsvEditorModal';
import LiquidAlertModal from './components/LiquidAlertModal';
import LiquidConfirmModal from './components/LiquidConfirmModal';

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

const getFormattedTimestamp = (date = new Date()) => {
  const d = (date instanceof Date && !isNaN(date)) ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${y}${m}${day}_${hh}${mm}${ss}`;
};

const getTimestampedDownloadName = (originalFilename, prefix = '') => {
  const ts = getFormattedTimestamp();
  let base = (originalFilename || 'leads').replace(/\.[^/.]+$/, "");
  base = base.replace(/^(FixAvatar_|Partial_)+/i, '');
  base = base.replace(/(_alive|_dead|_checked)+/gi, '');
  base = base.replace(/_\d{13}/g, '');
  base = base.replace(/_\d{8}_\d{6}/g, '');
  base = base.trim().replace(/^_+|_+$/g, '') || 'leads';
  const p = prefix ? `${prefix}_` : '';
  return `${p}${base}_${ts}.csv`;
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
  const [isDownloadingZip, setIsDownloadingZip] = useState(null); // 'alive' | 'dead' | null
  const [isQueueActionLoading, setIsQueueActionLoading] = useState(false);
  const [apifyConfig, setApifyConfig] = useState({ maxUsagePerKey: 400, minDelay: 2000, maxDelay: 5000 });
  const [jobOptions, setJobOptions] = useState({
    checkAlive: true,
    checkAliveApify: false,
    checkAvatar: true,
    monthsToCheck: 6
  });

  // Hệ thống Liquid Alert Modal (thay thế Toast theo yêu cầu người dùng)
  const [alertModalConfig, setAlertModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    buttonText: 'Đã hiểu'
  });

  const showAlert = (message, type = 'info', title = null) => {
    let defaultTitle = 'Thông báo';
    if (type === 'success') defaultTitle = 'Thành công';
    else if (type === 'error') defaultTitle = 'Đã xảy ra lỗi';
    else if (type === 'warning') defaultTitle = 'Cảnh báo';
    else if (type === 'info') defaultTitle = 'Thông báo';

    setAlertModalConfig({
      isOpen: true,
      title: title || defaultTitle,
      message: String(message || ''),
      type,
      buttonText: 'Đã hiểu'
    });
  };

  const closeAlert = () => {
    setAlertModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  // Toàn bộ thông báo được kích hoạt bằng Modal trung tâm
  const showToast = showAlert;

  // Hệ thống Liquid Confirm Modal
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Xác nhận',
    tone: 'danger',
    isLoading: false,
    onConfirm: () => {}
  });

  const openConfirm = ({ title, message, confirmText = 'Xác nhận', tone = 'danger', onConfirm }) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      confirmText,
      tone,
      isLoading: false,
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isLoading: true }));
        try {
          await onConfirm();
        } finally {
          setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }
      }
    });
  };

  const closeConfirm = () => {
    setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
  };

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

  const handleDownloadTemplate = () => {
    window.open('http://localhost:3001/api/download-template', '_blank');
    showToast('Đang tải tệp CSV mẫu chuẩn...', 'info', 'Tải file mẫu');
  };

  const uploadFileDirectly = async (file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('concurrency', concurrency);
    formData.append('headless', headless);
    formData.append('checkAlive', jobOptions.checkAlive);
    formData.append('checkAliveApify', jobOptions.checkAliveApify);
    formData.append('checkAvatar', jobOptions.checkAvatar);
    formData.append('monthsToCheck', jobOptions.monthsToCheck);
    if (options.facebookColumn) formData.append('facebookColumn', options.facebookColumn);
    if (options.avatarColumn) formData.append('avatarColumn', options.avatarColumn);
    try {
      await axios.post('http://localhost:3001/api/upload', formData);
      showToast(`Đã thêm tệp "${file.name}" vào hàng đợi thành công!`, 'success');
    } catch(err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || 'Lỗi khi tải tệp lên';
      showToast(`Không thể tải tệp "${file.name}": ${errMsg}`, 'error', 'Lỗi tải tệp');
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (files.length === 1) {
      setPreviewFile(files[0]);
    } else {
      showToast(`Đang tải lên ${files.length} tệp vào hàng đợi...`, 'info', 'Tải nhiều tệp');
      for (let i = 0; i < files.length; i++) {
        await uploadFileDirectly(files[i]);
      }
    }
    e.target.value = ''; 
  };

  const handleConfirmUpload = async (newFile, options = {}) => {
    setPreviewFile(null);
    await uploadFileDirectly(newFile, options);
  };

  const jobAction = async (id, action) => {
    if (action === 'remove') {
      openConfirm({
        title: 'Xóa tiến trình',
        message: 'Bạn có chắc muốn xóa tiến trình này và tất cả các tệp kết quả / tệp gốc liên quan khỏi ổ cứng không?',
        confirmText: 'Xóa vĩnh viễn',
        tone: 'danger',
        onConfirm: async () => {
          await axios.post(`http://localhost:3001/api/queue/${id}/remove`);
          showToast('Đã xóa tiến trình và dọn dẹp dữ liệu liên quan', 'success');
        }
      });
      return;
    }
    
    try {
      await axios.post(`http://localhost:3001/api/queue/${id}/${action}`);
      if (action === 'pause') showToast('Đã tạm dừng tiến trình', 'warning');
      else if (action === 'resume') showToast('Đã tiếp tục tiến trình', 'success');
      else if (action === 'cancel') showToast('Đã hủy bỏ tiến trình', 'error');
      else if (action === 'retry') showToast('Đã đưa tiến trình vào hàng đợi để chạy lại', 'info');
      else if (action === 'force') showToast('Đã ưu tiên tiến trình chạy ngay', 'info');
    } catch (e) {
      showToast(e.response?.data?.error || 'Có lỗi xảy ra khi thực hiện thao tác', 'error');
    }
  };

  const handleBatchDownload = async (type) => {
    const historyJobs = queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED', 'INTERRUPTED'].includes(j.status));
    const matchingJobs = historyJobs.filter(job => {
      if (!job.downloadLinks) return false;
      if (type === 'alive') {
        return (job.stats?.alive > 0 || (!job.stats && job.downloadLinks.aliveFile)) && job.downloadLinks.aliveFile;
      } else {
        return (job.stats?.dead > 0 || (!job.stats && job.downloadLinks.deadFile)) && job.downloadLinks.deadFile;
      }
    });

    if (matchingJobs.length === 0) {
      showToast(`Không có tiến trình nào trong lịch sử có ${type === 'alive' ? 'link sống' : 'link chết'} để tải.`, 'warning', 'Chưa có kết quả');
      return;
    }

    try {
      setIsDownloadingZip(type);
      showToast(`Đang nén gói ZIP ${type === 'alive' ? 'Link Sống' : 'Link Chết'}...`, 'info', 'Nén dữ liệu');
      const res = await axios.get(`http://localhost:3001/api/download-batch-zip/${type}`, {
        responseType: 'blob'
      });

      const fallbackTs = getFormattedTimestamp();
      let filename = `LeadPurify_${type === 'alive' ? 'Link_Song' : 'Link_Chet'}_${fallbackTs}.zip`;
      const disposition = res.headers['content-disposition'] || res.headers['Content-Disposition'];
      if (disposition) {
        const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match && utf8Match[1]) {
          filename = decodeURIComponent(utf8Match[1]);
        } else {
          const match = disposition.match(/filename="?([^";]+)"?/i);
          if (match && match[1]) {
            filename = decodeURIComponent(match[1]);
          }
        }
      }

      const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      showToast(`Đã tải xuống thành công: ${filename}`, 'success', 'Tải hoàn tất');
    } catch (err) {
      console.error('Lỗi khi tải file zip:', err);
      let errMsg = 'Có lỗi xảy ra khi nén và tải file ZIP.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.error) errMsg = json.error;
        } catch(e) {}
      } else if (err.response?.data?.error) {
        errMsg = err.response.data.error;
      }
      showToast(errMsg, 'error', 'Lỗi tải ZIP');
    } finally {
      setIsDownloadingZip(null);
    }
  };

  const handleClearHistory = () => {
    openConfirm({
      title: 'Xóa toàn bộ lịch sử',
      message: 'Bạn có chắc muốn xóa toàn bộ lịch sử không?\nThao tác này sẽ xóa sạch các file kết quả và file tải lên liên quan trên ổ cứng để giải phóng dung lượng.',
      confirmText: 'Xóa sạch lịch sử',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const res = await axios.post('http://localhost:3001/api/clear-history');
          const freedMb = ((res.data?.freedBytes || 0) / (1024 * 1024)).toFixed(2);
          const count = res.data?.deletedFilesCount || 0;
          showToast(`Đã xóa sạch lịch sử và dọn dẹp ${count} tệp (giải phóng ${freedMb} MB ổ cứng).`, 'success', 'Đã dọn dẹp');
        } catch (err) {
          showToast('Lỗi khi xóa lịch sử: ' + (err.response?.data?.error || err.message), 'error');
        }
      }
    });
  };

  const handleCleanStorage = () => {
    openConfirm({
      title: 'Dọn dẹp ổ cứng (Tệp mồ côi)',
      message: 'Hệ thống sẽ quét và dọn dẹp toàn bộ các tệp kết quả (outputs) và tệp tải lên (uploads) mồ côi không gắn với bất kỳ tiến trình nào đang hoạt động.\nBạn có muốn tiếp tục?',
      confirmText: 'Dọn dẹp ngay',
      tone: 'warning',
      onConfirm: async () => {
        try {
          const res = await axios.post('http://localhost:3001/api/clean-storage');
          const { deletedCount, freedBytes } = res.data;
          const mb = ((freedBytes || 0) / (1024 * 1024)).toFixed(2);
          showToast(`Đã dọn dẹp thành công ${deletedCount} tệp mồ côi (giải phóng ${mb} MB ổ cứng).`, 'success', 'Dọn dẹp hoàn tất');
        } catch (err) {
          showToast('Lỗi khi dọn dẹp ổ cứng: ' + (err.response?.data?.error || err.message), 'error');
        }
      }
    });
  };

  const handleFixAvatar = async (jobId) => {
    try {
      await axios.post(`http://localhost:3001/api/queue/${jobId}/fix-avatar`);
      showToast('Đã đưa tiến trình vào hàng đợi để sửa ảnh Avatar HD', 'info');
      setActiveTab('queue');
    } catch (e) {
      showToast(e.response?.data?.error || 'Có lỗi xảy ra', 'error');
    }
  };

  const handleBatchFixAvatar = () => {
    const unfixJobs = queue.filter(j => 
      ['COMPLETED', 'ERROR'].includes(j.status) && 
      !j.avatarFixed && !j.checkAvatarApify
    );

    if (unfixJobs.length === 0) {
      showToast('Không có tiến trình nào trong lịch sử chưa sửa ảnh.', 'info', 'Đã sửa toàn bộ');
      return;
    }

    openConfirm({
      title: 'Sửa ảnh Avatar hàng loạt',
      message: `Tìm thấy ${unfixJobs.length} tiến trình chưa sửa ảnh đại diện.\nBạn có muốn đưa tất cả vào hàng đợi để tự động sửa ảnh sang chuẩn HD (không cần API) không?`,
      confirmText: 'Bắt đầu sửa HD',
      tone: 'primary',
      onConfirm: async () => {
        try {
          const res = await axios.post('http://localhost:3001/api/queue/batch-fix-avatar');
          if (res.data.count > 0) {
            showToast(`Đã đưa ${res.data.count} tiến trình vào hàng đợi sửa ảnh HD`, 'success');
            setActiveTab('queue');
          } else {
            showToast('Không có tiến trình hợp lệ nào được thêm vào hàng đợi.', 'warning');
          }
        } catch (e) {
          showToast(e.response?.data?.error || 'Có lỗi xảy ra khi đưa tiến trình vào hàng đợi.', 'error');
        }
      }
    });
  };

  const handlePreviewHistory = async (url, originalFilename) => {
    try {
      const previewUrl = url.includes('?') ? `${url}&preview=true` : `${url}?preview=true`;
      const res = await axios.get(previewUrl, { responseType: 'blob' });
      const file = new File([res.data], originalFilename, { type: 'text/csv' });
      setHistoryPreviewFile(file);
    } catch (err) {
      console.error("Lỗi khi lấy file lịch sử:", err);
      showToast("Không thể tải file để xem trước.", "error", "Lỗi xem trước");
    }
  };

  const handleConfirmHistoryDownload = (editedFile) => {
    let downloadName = editedFile.name;
    if (!/_\d{8}_\d{6}\.csv$/i.test(downloadName)) {
      downloadName = getTimestampedDownloadName(downloadName);
    }
    const url = URL.createObjectURL(editedFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setHistoryPreviewFile(null);
    showToast(`Đã tải xuống: ${downloadName}`, 'success');
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
      showToast('Lưu danh sách API Keys thành công!', 'success');
    } catch (e) {
      showToast('Lỗi khi lưu danh sách API Keys', 'error');
    }
  };

  const handleSaveApifyConfig = async () => {
    try {
      const res = await axios.post('http://localhost:3001/api/config', apifyConfig);
      setApifyConfig(res.data.config);
      showToast('Lưu cấu hình xoay vòng & độ trễ thành công!', 'success');
    } catch (e) {
      showToast('Lỗi khi lưu cấu hình', 'error');
    }
  };

  const handleCheckApifyKeys = async () => {
    setIsCheckingKeys(true);
    showToast('Đang kết nối kiểm tra toàn bộ API Keys...', 'info');
    try {
      const res = await axios.post('http://localhost:3001/api/apify-keys/check');
      setApifyKeys(res.data);
      const activeCount = res.data.filter(k => k.status === 'active').length;
      showToast(`Kiểm tra hoàn tất: ${activeCount}/${res.data.length} Keys đang hoạt động tốt!`, 'success');
    } catch (e) {
      showToast('Lỗi khi kiểm tra trạng thái API Keys', 'error');
    } finally {
      setIsCheckingKeys(false);
    }
  };

  const handleResetApifyUsage = () => {
    openConfirm({
      title: 'Đặt lại lượt dùng API Keys',
      message: 'Bạn có chắc muốn đặt lại lượt dùng về 0 và kích hoạt lại toàn bộ các Keys trong danh sách không?',
      confirmText: 'Đặt lại ngay',
      tone: 'warning',
      onConfirm: async () => {
        try {
          const res = await axios.post('http://localhost:3001/api/apify-keys/reset-usage');
          setApifyKeys(res.data);
          showToast('Đã đặt lại lượt dùng về 0 và kích hoạt lại toàn bộ Keys thành công!', 'success');
        } catch (e) {
          showToast('Lỗi khi đặt lại lượt dùng: ' + e.message, 'error');
        }
      }
    });
  };

  const handleTriggerQueue = async () => {
    try {
      await axios.post('http://localhost:3001/api/queue/trigger');
      showToast('Đã kích hoạt hàng đợi xử lý', 'info');
    } catch(e) {
      console.error(e);
      showToast('Lỗi khi kích hoạt hàng đợi', 'error');
    }
  };

  const handleBatchRetry = () => {
    const failedJobs = queue.filter(j => ['ERROR', 'INTERRUPTED', 'CANCELED'].includes(j.status));
    if (failedJobs.length === 0) {
      showToast('Không có tiến trình lỗi hoặc gián đoạn nào.', 'info');
      return;
    }

    openConfirm({
      title: 'Chạy lại toàn bộ lỗi / gián đoạn',
      message: `Tìm thấy ${failedJobs.length} tiến trình bị lỗi hoặc gián đoạn.\nBạn có muốn đưa tất cả vào hàng đợi để chạy lại từ đầu không?`,
      confirmText: 'Chạy lại từ đầu',
      tone: 'primary',
      onConfirm: async () => {
        try {
          await axios.post('http://localhost:3001/api/queue/batch-retry');
          showToast(`Đã đưa ${failedJobs.length} tiến trình vào hàng đợi chạy lại`, 'success');
          setActiveTab('queue');
        } catch(e) {
          showToast(e.response?.data?.error || 'Có lỗi xảy ra khi chạy lại.', 'error');
        }
      }
    });
  };

  const handleBatchResume = async () => {
    const pausedOrInterrupted = queue.filter(j => j.status === 'INTERRUPTED' || j.status === 'PAUSED');
    if (pausedOrInterrupted.length === 0) {
      showToast('Không có tiến trình nào đang tạm dừng hoặc bị gián đoạn.', 'info');
      return;
    }
    try {
      setIsQueueActionLoading(true);
      await axios.post('http://localhost:3001/api/queue/batch-resume');
      showToast(`Đang tiếp tục ${pausedOrInterrupted.length} tiến trình...`, 'success');
      setActiveTab('queue');
    } catch(e) {
      showToast(e.response?.data?.error || 'Có lỗi xảy ra khi tiếp tục tiến trình.', 'error');
    } finally {
      setIsQueueActionLoading(false);
    }
  };

  const handleBatchPause = async () => {
    try {
      setIsQueueActionLoading(true);
      await axios.post('http://localhost:3001/api/queue/batch-pause');
      showToast('Đã tạm dừng toàn bộ tiến trình đang chạy và chờ', 'warning');
    } catch (e) {
      showToast(e.response?.data?.error || 'Có lỗi xảy ra khi tạm dừng toàn bộ tiến trình.', 'error');
    } finally {
      setIsQueueActionLoading(false);
    }
  };

  const handleBatchStop = () => {
    const runningOrPendingJobs = queue.filter(j => ['RUNNING', 'PAUSED', 'PENDING'].includes(j.status));
    if (runningOrPendingJobs.length === 0) {
      showToast('Không có tiến trình nào đang chạy hoặc chờ trong hàng đợi để dừng.', 'info');
      return;
    }

    openConfirm({
      title: 'Dừng toàn bộ tiến trình',
      message: `Bạn có chắc muốn dừng toàn bộ ${runningOrPendingJobs.length} tiến trình đang chạy và chờ trong hàng đợi không?\nCác tiến trình sẽ được chuyển vào lịch sử và lưu kết quả một phần (nếu có).`,
      confirmText: 'Dừng toàn bộ',
      tone: 'danger',
      onConfirm: async () => {
        try {
          setIsQueueActionLoading(true);
          await axios.post('http://localhost:3001/api/queue/batch-stop');
          showToast('Đã dừng toàn bộ tiến trình và lưu kết quả an toàn', 'warning');
        } catch (e) {
          showToast(e.response?.data?.error || 'Có lỗi xảy ra khi dừng toàn bộ tiến trình.', 'error');
        } finally {
          setIsQueueActionLoading(false);
        }
      }
    });
  };

  const handleBatchClearQueue = () => {
    if (queueItems.length === 0) {
      showToast('Hàng đợi hiện đang trống.', 'info');
      return;
    }

    openConfirm({
      title: 'Xóa toàn bộ hàng đợi',
      message: `Bạn có chắc muốn xóa toàn bộ ${queueItems.length} tiến trình trong hàng đợi không?\nThao tác này sẽ hủy các tiến trình đang chạy/chờ và dọn dẹp các tệp liên quan khỏi ổ cứng.`,
      confirmText: 'Xóa toàn bộ',
      tone: 'danger',
      onConfirm: async () => {
        try {
          setIsQueueActionLoading(true);
          await axios.post('http://localhost:3001/api/queue/batch-clear');
          showToast('Đã xóa toàn bộ tiến trình trong hàng đợi', 'success');
        } catch (e) {
          showToast(e.response?.data?.error || 'Có lỗi xảy ra khi xóa toàn bộ tiến trình.', 'error');
        } finally {
          setIsQueueActionLoading(false);
        }
      }
    });
  };

  const queueItems = queue.filter(j => ['PENDING', 'RUNNING', 'PAUSED', 'INTERRUPTED'].includes(j.status));
  const historyItems = queue.filter(j => ['COMPLETED', 'ERROR', 'CANCELED', 'INTERRUPTED'].includes(j.status)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Thống kê nhanh Mini-Dashboard
  const totalCompletedJobs = historyItems.filter(j => j.status === 'COMPLETED').length;
  const totalAliveCount = historyItems.reduce((acc, j) => acc + (j.stats?.alive || 0), 0);
  const totalDeadCount = historyItems.reduce((acc, j) => acc + (j.stats?.dead || 0), 0);
  const totalProcessedLeads = totalAliveCount + totalDeadCount;
  const aliveRatePercent = totalProcessedLeads > 0 ? Math.round((totalAliveCount / totalProcessedLeads) * 100) : 0;
  const totalAvatarFixedJobs = historyItems.filter(j => j.avatarFixed || j.checkAvatarApify).length;

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
            1. <b>Hàng đợi:</b> Kéo thả tệp CSV chứa danh sách link Facebook (hoặc tải file mẫu) để hệ thống tự động kiểm tra trạng thái hoạt động.<br/>
            2. <b>Lịch sử:</b> Kiểm tra tỷ lệ sống/chết và tải xuống danh sách kết quả đã phân loại (Sống / Chết / Lỗi) kèm ảnh Avatar HD.<br/>
            3. <b>Kiểm tra hoạt động:</b> Từ các tệp "Sống", bạn có thể quét dữ liệu bài đăng gần nhất (Apify API) để kiểm tra mức độ tương tác.
          </p>
        </div>
      </motion.div>

      {/* Mini-Dashboard KPI Bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem'
        }}
      >
        <div className="liquid-card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(0, 102, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Activity size={20} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tổng Lead Đã Quét</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{totalProcessedLeads.toLocaleString()}</div>
          </div>
        </div>

        <div className="liquid-card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle2 size={20} style={{ color: '#34d399' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tỷ Lệ Link Sống</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399' }}>
              {aliveRatePercent}% <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: 'var(--text-muted)' }}>({totalAliveCount}/{totalProcessedLeads})</span>
            </div>
          </div>
        </div>

        <div className="liquid-card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={20} style={{ color: '#38bdf8' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avatar Chuẩn HD</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>
              {totalAvatarFixedJobs} <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: 'var(--text-muted)' }}>tiến trình</span>
            </div>
          </div>
        </div>

        <div className="liquid-card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileSpreadsheet size={20} style={{ color: '#c084fc' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tệp Hoàn Tất</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {totalCompletedJobs} <span style={{ fontSize: '0.8125rem', fontWeight: 400, color: 'var(--text-muted)' }}>/ {historyItems.length}</span>
            </div>
          </div>
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
                Nhấp chuột để chọn tệp CSV (hỗ trợ kéo thả nhiều tệp cùng lúc)
              </p>
              
              <div style={{ marginTop: '0.875rem' }}>
                <button 
                  type="button"
                  className="btn-outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadTemplate();
                  }}
                  style={{ 
                    padding: '0.35rem 0.85rem', 
                    fontSize: '0.8125rem', 
                    borderColor: 'rgba(56, 189, 248, 0.35)', 
                    color: '#38bdf8',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: 'rgba(56, 189, 248, 0.08)'
                  }}
                  title="Tải tệp CSV mẫu chuẩn có sẵn cột tên, sđt, link facebook, avatar..."
                >
                  <FileDown size={14} /> Tải tệp CSV mẫu chuẩn
                </button>
              </div>

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
                  <span>Kiểm tra link sống / chết (Trình duyệt nội bộ, miễn phí)</span>
                </label>

                <label className="liquid-checkbox-label">
                  <input 
                    type="checkbox" 
                    className="liquid-checkbox"
                    checked={jobOptions.checkAliveApify} 
                    onChange={e => setJobOptions({...jobOptions, checkAliveApify: e.target.checked})} 
                  />
                  <span>Kiểm tra tương tác bài viết (Yêu cầu Token Apify)</span>
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
                  <span>Kiểm tra & tự động sửa link Avatar chuẩn HD (Không cần API)</span>
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
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    💡 Khuyên dùng 3 luồng để máy vận hành ổn định và không quá tải RAM
                  </p>
                </div>

                {/* Headless Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.25rem' }}>
                  <div>
                    <span className="liquid-label" style={{ margin: 0 }}>Chế độ ẩn trình duyệt (Chạy ngầm):</span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {headless ? 'Đang ẩn hoàn toàn cửa sổ Chrome' : 'Đang mở cửa sổ Chrome để theo dõi'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className={`btn-outline ${headless ? 'btn-outline-accent' : ''}`} 
                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.8125rem' }} 
                      onClick={() => setHeadless(true)}
                    >
                      Bật (Ẩn)
                    </button>
                    <button 
                      className={`btn-outline ${!headless ? 'btn-outline-warning' : ''}`} 
                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.8125rem' }} 
                      onClick={() => setHeadless(false)}
                    >
                      Tắt (Hiện)
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
                  {queue.some(j => j.status === 'INTERRUPTED' || j.status === 'PAUSED') && (
                    <button 
                      onClick={handleBatchResume} 
                      className="btn-outline btn-outline-success" 
                      disabled={isQueueActionLoading}
                      title="Tiếp tục tất cả các tiến trình đang tạm dừng hoặc bị gián đoạn"
                    >
                      <Play size={15} /> Tiếp tục toàn bộ
                    </button>
                  )}
                  {queue.some(j => j.status === 'PENDING') && !queue.some(j => j.status === 'RUNNING') && !queue.some(j => j.status === 'PAUSED') && (
                    <button 
                      onClick={handleTriggerQueue} 
                      className="btn-outline btn-outline-accent" 
                      disabled={isQueueActionLoading}
                      title="Kích hoạt worker để chạy các tiến trình đang chờ trong hàng đợi"
                    >
                      <Play size={15} /> Kích hoạt hàng đợi
                    </button>
                  )}
                  {queue.some(j => j.status === 'RUNNING' || j.status === 'PENDING') && (
                    <button 
                      onClick={handleBatchPause} 
                      className="btn-outline btn-outline-warning" 
                      disabled={isQueueActionLoading}
                      title="Tạm dừng tất cả các tiến trình đang chạy và đang chờ trong hàng đợi"
                    >
                      <Pause size={15} /> Tạm dừng toàn bộ
                    </button>
                  )}
                  {queue.some(j => ['RUNNING', 'PAUSED', 'PENDING'].includes(j.status)) && (
                    <button 
                      onClick={handleBatchStop} 
                      className="btn-outline btn-outline-danger" 
                      disabled={isQueueActionLoading}
                      title="Dừng tất cả các tiến trình trong hàng đợi và lưu kết quả một phần nếu có"
                    >
                      <Square size={15} /> Dừng toàn bộ
                    </button>
                  )}
                  {queueItems.length > 0 && (
                    <button 
                      onClick={handleBatchClearQueue} 
                      className="btn-outline btn-outline-danger" 
                      disabled={isQueueActionLoading}
                      title="Hủy và xóa toàn bộ các tiến trình khỏi hàng đợi"
                    >
                      <Trash2 size={15} /> Xóa toàn bộ tiến trình
                    </button>
                  )}
                </div>
              )}

              {/* History Actions Toolbar */}
              {activeTab === 'history' && (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {historyItems.length > 0 && (
                    <>
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
                          opacity: queue.filter(j => ['COMPLETED', 'ERROR'].includes(j.status) && !j.avatarFixed && !j.checkAvatarApify).length === 0 ? 0.5 : 1
                        }}
                        title="Đưa các tiến trình trong lịch sử chưa sửa ảnh vào hàng đợi để tự động sửa sang chuẩn HD (không cần API)"
                      >
                        <RefreshCw size={15} /> 
                        Sửa ảnh Avatar hàng loạt ({queue.filter(j => ['COMPLETED', 'ERROR'].includes(j.status) && !j.avatarFixed && !j.checkAvatarApify).length})
                      </button>
                      
                      <button 
                        onClick={() => handleBatchDownload('alive')} 
                        className="btn-outline btn-outline-success"
                        disabled={isDownloadingZip === 'alive'}
                        title="Nén tất cả các file link sống trong lịch sử thành 1 file ZIP và tải xuống"
                      >
                        {isDownloadingZip === 'alive' ? (
                          <>
                            <RefreshCw size={15} className="spin" /> Đang nén ZIP...
                          </>
                        ) : (
                          <>
                            <Download size={15} /> Tải Link Sống (ZIP)
                          </>
                        )}
                      </button>
                      
                      <button 
                        onClick={() => handleBatchDownload('dead')} 
                        className="btn-outline btn-outline-warning"
                        disabled={isDownloadingZip === 'dead'}
                        title="Nén tất cả các file link chết trong lịch sử thành 1 file ZIP và tải xuống"
                      >
                        {isDownloadingZip === 'dead' ? (
                          <>
                            <RefreshCw size={15} className="spin" /> Đang nén ZIP...
                          </>
                        ) : (
                          <>
                            <Download size={15} /> Tải Link Chết (ZIP)
                          </>
                        )}
                      </button>
                      
                      <button onClick={handleClearHistory} className="btn-outline btn-outline-danger" title="Xóa lịch sử và dọn dẹp các tệp kết quả & tải lên liên quan">
                        <Trash2 size={15} /> Xóa lịch sử
                      </button>
                    </>
                  )}

                  <button 
                    onClick={handleCleanStorage} 
                    className="btn-outline" 
                    style={{ borderColor: 'rgba(255, 255, 255, 0.2)', color: 'var(--text-secondary)' }}
                    title="Quét và xóa các tệp mồ côi trong thư mục outputs và uploads không thuộc tiến trình nào"
                  >
                    <Sparkles size={15} /> Dọn dẹp ổ cứng
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

                          {(job.avatarFixed || job.checkAvatarApify) && activeTab === 'history' && (
                            <span className="liquid-badge liquid-badge-success" title="Đã trích xuất & sửa link avatar chuẩn HD">
                              <CheckCircle size={12} /> Đã sửa ảnh HD
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
                              onClick={() => handlePreviewHistory(job.downloadLinks.aliveFile, getTimestampedDownloadName(job.filename, 'Alive'))} 
                              className="btn-outline btn-outline-success" 
                              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none', padding: '0.45rem 0.75rem' }} 
                              title="Xem trước danh sách link sống"
                            >
                              <Eye size={14} />
                            </button>
                            <a 
                              href={job.downloadLinks.aliveFile} 
                              download={getTimestampedDownloadName(job.filename, 'Alive')} 
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
                              onClick={() => handlePreviewHistory(job.downloadLinks.deadFile, getTimestampedDownloadName(job.filename, 'Dead'))} 
                              className="btn-outline btn-outline-danger" 
                              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none', padding: '0.45rem 0.75rem' }} 
                              title="Xem trước danh sách link chết"
                            >
                              <Eye size={14} />
                            </button>
                            <a 
                              href={job.downloadLinks.deadFile} 
                              download={getTimestampedDownloadName(job.filename, 'Dead')} 
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
                            download={getTimestampedDownloadName(job.filename, 'Checked')} 
                            className="btn-outline btn-outline-accent" 
                            style={{ padding: '0.45rem 0.85rem' }}
                          >
                            <Download size={14} /> Tải kết quả hoạt động
                          </a>
                        )}

                        {activeTab === 'history' && !job.avatarFixed && !job.checkAvatarApify && (job.status === 'COMPLETED' || job.status === 'ERROR') && (
                          <button 
                            onClick={() => handleFixAvatar(job.id)} 
                            className="btn-outline btn-outline-accent"
                            style={{ padding: '0.45rem 0.85rem' }}
                            title="Quét và sửa link ảnh avatar chuẩn HD tự động (không cần API)"
                          >
                            <RefreshCw size={14} /> Sửa ảnh Avatar
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
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', marginBottom: '1.5rem' }}>
              Nhập danh sách API Token của Apify (mỗi token trên một dòng riêng). Hệ thống sẽ tự động luân phiên xoay vòng khi token đạt ngưỡng request tối đa hoặc gặp giới hạn định ngạch.
            </p>

            {/* Free Core Feature Explainer Banner */}
            <div style={{ 
              padding: '1rem 1.25rem', 
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)', 
              border: '1px solid rgba(56, 189, 248, 0.25)', 
              borderRadius: 'var(--radius-md)', 
              marginBottom: '1.5rem', 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '0.875rem' 
            }}>
              <CheckCircle size={22} style={{ color: 'var(--status-alive)', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                <strong style={{ color: '#fff' }}>💡 Bạn KHÔNG BẮT BUỘC phải cấu hình Apify Token:</strong>
                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)' }}>
                  Tính năng cốt lõi (<strong>Kiểm tra sống/chết Facebook</strong> và <strong>Tự động lấy ảnh đại diện HD</strong>) chạy <strong style={{ color: 'var(--status-alive)' }}>100% Miễn phí & Cục bộ trên máy tính của bạn</strong> mà không cần tài khoản hay tốn chi phí nào. Apify Token chỉ dùng khi bạn bật tùy chọn nâng cao <em>"Quét bài viết gần nhất"</em>.
                </p>
              </div>
            </div>

            {/* Cảnh báo mềm khi toàn bộ keys hết hạn hoặc không có key hoạt động */}
            {apifyKeys.length > 0 && !apifyKeys.some(k => k.status === 'active') && (
              <div style={{ 
                padding: '0.875rem 1.25rem', 
                background: 'rgba(245, 158, 11, 0.1)', 
                border: '1px solid rgba(245, 158, 11, 0.3)', 
                borderRadius: 'var(--radius-md)', 
                marginBottom: '1.5rem', 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '0.75rem' 
              }}>
                <AlertTriangle size={20} style={{ color: 'var(--status-warning)', flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontSize: '0.875rem', color: '#fde68a' }}>
                  <strong>Lưu ý:</strong> Toàn bộ Apify API Token hiện tại đã hết hạn mức hoặc không hợp lệ. Nếu bạn không dùng tính năng quét bài viết nâng cao của Apify, bạn có thể hoàn toàn yên tâm bỏ qua thông báo này. Để tiếp tục dùng Apify, hãy lấy token mới từ <a href="https://console.apify.com/account/integrations" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>Apify Console</a>.
                </span>
              </div>
            )}

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
                  <button 
                    onClick={handleResetApifyUsage} 
                    className="btn-outline btn-outline-accent"
                    title="Đặt lại lượt dùng về 0 và kích hoạt lại tất cả các Keys"
                  >
                    <RotateCcw size={16} /> Đặt lại lượt dùng (Reset)
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

      {/* Liquid Glass Alert Modal for All Notifications */}
      <LiquidAlertModal 
        isOpen={alertModalConfig.isOpen}
        title={alertModalConfig.title}
        message={alertModalConfig.message}
        type={alertModalConfig.type}
        buttonText={alertModalConfig.buttonText}
        onClose={closeAlert}
      />

      {/* Sleek Liquid Glass Confirmation Dialog */}
      <LiquidConfirmModal {...confirmConfig} onCancel={closeConfirm} />
    </div>
  );
}

export default App;
