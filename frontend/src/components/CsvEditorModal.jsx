import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, UploadCloud, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import './CsvEditorModal.css';

const CsvEditorModal = ({ file, onClose, onConfirm, mode = "upload" }) => {
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 50;

  useEffect(() => {
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setData(results.data);
          if (results.meta.fields) {
            setHeaders(results.meta.fields);
          } else if (results.data.length > 0) {
            setHeaders(Object.keys(results.data[0]));
          }
        },
      });
    }
  }, [file]);

  const totalPages = Math.ceil(data.length / rowsPerPage);
  const currentData = data.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const startEditing = (rowIndex, colName, value) => {
    setEditingCell({ rowIndex: (page - 1) * rowsPerPage + rowIndex, colName });
    setEditValue(value || '');
  };

  const saveEdit = () => {
    if (editingCell) {
      const newData = [...data];
      newData[editingCell.rowIndex][editingCell.colName] = editValue;
      setData(newData);
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingCell(null);
  };

  const deleteRow = (globalRowIndex) => {
    const newData = data.filter((_, idx) => idx !== globalRowIndex);
    setData(newData);
    // Adjust page if necessary
    const newTotalPages = Math.ceil(newData.length / rowsPerPage);
    if (page > newTotalPages && newTotalPages > 0) {
      setPage(newTotalPages);
    }
  };

  const handleConfirm = () => {
    const csvStr = Papa.unparse(data);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const newFile = new File([blob], file.name, { type: 'text/csv' });
    onConfirm(newFile);
  };

  if (!file) return null;

  return (
    <AnimatePresence>
      <div className="modal-overlay">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="modal-container glass-panel"
        >
          <div className="modal-header">
            <h2>
              Preview: <span className="neon-text-cyan">{file.name}</span>
            </h2>
            <button className="close-btn" onClick={onClose}>
              <X size={24} />
            </button>
          </div>

          <div className="modal-content">
            <div className="table-wrapper">
              <table className="csv-table">
                <thead>
                  <tr>
                    <th className="action-col">Hành động</th>
                    <th className="index-col">#</th>
                    {headers.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentData.map((row, localIndex) => {
                    const globalIndex = (page - 1) * rowsPerPage + localIndex;
                    return (
                      <tr key={globalIndex}>
                        <td className="action-col">
                          <button
                            className="delete-btn"
                            onClick={() => deleteRow(globalIndex)}
                            title="Xóa dòng"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                        <td className="index-col">{globalIndex + 1}</td>
                        {headers.map((col) => {
                          const isEditing =
                            editingCell?.rowIndex === globalIndex &&
                            editingCell?.colName === col;
                          return (
                            <td
                              key={col}
                              onDoubleClick={() =>
                                startEditing(localIndex, col, row[col])
                              }
                              className={isEditing ? 'editing-td' : ''}
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={saveEdit}
                                  onKeyDown={handleKeyDown}
                                  autoFocus
                                />
                              ) : (
                                <span className="cell-content">
                                  {row[col] || ''}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {currentData.length === 0 && (
                    <tr>
                      <td colSpan={headers.length + 2} className="text-center p-4">
                        Không có dữ liệu
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="modal-footer">
            <div className="pagination">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="btn-outline"
              >
                <ChevronLeft size={16} /> Trước
              </button>
              <span>
                Trang {page} / {totalPages || 1} ({data.length} dòng)
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="btn-outline"
              >
                Tiếp <ChevronRight size={16} />
              </button>
            </div>
            
            <div className="modal-actions">
              <button className="btn-outline text-muted" onClick={onClose} style={{ borderColor: 'var(--glass-border)' }}>
                Hủy bỏ
              </button>
              <button
                className="btn-primary"
                onClick={handleConfirm}
              >
                {mode === "upload" ? <UploadCloud size={18} /> : <Download size={18} />} 
                {mode === "upload" ? "Xác nhận & Tải lên" : "Lưu & Tải xuống"}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CsvEditorModal;
