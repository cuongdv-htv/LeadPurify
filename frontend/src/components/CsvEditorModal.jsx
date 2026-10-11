import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, UploadCloud, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import './CsvEditorModal.css';

const CsvEditorModal = ({ file, onClose, onConfirm, mode = "upload" }) => {
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, colIndex }
  const [editValue, setEditValue] = useState('');
  
  const [editingHeader, setEditingHeader] = useState(null); // colIndex
  const [headerEditValue, setHeaderEditValue] = useState('');

  const [selection, setSelection] = useState(null); // { start: { row, col }, end: { row, col } }
  const [isDragging, setIsDragging] = useState(false);

  const [page, setPage] = useState(1);
  const rowsPerPage = 50;

  const modalRef = useRef(null);

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

  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.focus();
    }
  }, []);

  const startEditing = (rowIndex, colIndex, value) => {
    setEditingCell({ rowIndex, colIndex });
    setEditValue(value || '');
  };

  const saveEdit = () => {
    if (editingCell) {
      const { rowIndex, colIndex } = editingCell;
      const colName = headers[colIndex];
      const newData = [...data];
      newData[rowIndex][colName] = editValue;
      setData(newData);
      setEditingCell(null);
    }
  };

  const startEditingHeader = (colIndex, value) => {
    setEditingHeader(colIndex);
    setHeaderEditValue(value || '');
  };

  const saveHeaderEdit = () => {
    if (editingHeader !== null) {
      const oldHeader = headers[editingHeader];
      const newHeader = headerEditValue.trim() || oldHeader;
      
      let finalHeader = newHeader;
      let counter = 1;
      while (headers.includes(finalHeader) && finalHeader !== oldHeader) {
        finalHeader = `${newHeader}_${counter}`;
        counter++;
      }

      const newHeaders = [...headers];
      newHeaders[editingHeader] = finalHeader;
      
      const newData = data.map(row => {
        const newRow = { ...row };
        newRow[finalHeader] = newRow[oldHeader];
        delete newRow[oldHeader];
        return newRow;
      });

      setHeaders(newHeaders);
      setData(newData);
      setEditingHeader(null);
    }
  };

  const handleCellKeyDown = (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingCell(null);
  };
  
  const handleHeaderKeyDown = (e) => {
    if (e.key === 'Enter') saveHeaderEdit();
    if (e.key === 'Escape') setEditingHeader(null);
  };

  const addRow = () => {
    const newRow = {};
    headers.forEach(h => { newRow[h] = ''; });
    setData([...data, newRow]);
    const newTotalPages = Math.ceil((data.length + 1) / rowsPerPage);
    setPage(newTotalPages || 1);
  };

  const addColumn = () => {
    const baseName = "New_Column";
    let newColName = baseName;
    let counter = 1;
    while (headers.includes(newColName)) {
      newColName = `${baseName}_${counter}`;
      counter++;
    }
    setHeaders([...headers, newColName]);
    const newData = data.map(row => ({ ...row, [newColName]: '' }));
    setData(newData);
  };

  const deleteColumn = (colIndex) => {
    const colName = headers[colIndex];
    const newHeaders = headers.filter((_, idx) => idx !== colIndex);
    const newData = data.map(row => {
      const newRow = { ...row };
      delete newRow[colName];
      return newRow;
    });
    setHeaders(newHeaders);
    setData(newData);
    setEditingHeader(null);
  };

  const deleteRow = (globalRowIndex) => {
    const newData = data.filter((_, idx) => idx !== globalRowIndex);
    setData(newData);
    const newTotalPages = Math.ceil(newData.length / rowsPerPage);
    if (page > newTotalPages && newTotalPages > 0) {
      setPage(newTotalPages);
    }
  };

  const handleMouseDown = (rowIndex, colIndex, e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setSelection({ start: { row: rowIndex, col: colIndex }, end: { row: rowIndex, col: colIndex } });
    if (editingCell && (editingCell.rowIndex !== rowIndex || editingCell.colIndex !== colIndex)) {
       saveEdit();
    }
  };

  const handleMouseEnter = (rowIndex, colIndex) => {
    if (isDragging) {
      setSelection(prev => ({ ...prev, end: { row: rowIndex, col: colIndex } }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const getSelectedRange = () => {
    if (!selection) return null;
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    return { minRow, maxRow, minCol, maxCol };
  };

  const isCellSelected = (rowIndex, colIndex) => {
    const range = getSelectedRange();
    if (!range) return false;
    return rowIndex >= range.minRow && rowIndex <= range.maxRow && colIndex >= range.minCol && colIndex <= range.maxCol;
  };

  const handleGlobalKeyDown = (e) => {
    if (editingCell || editingHeader !== null) return;
    const range = getSelectedRange();
    
    if (range && (e.key === 'Delete' || e.key === 'Backspace')) {
      const newData = [...data];
      for (let r = range.minRow; r <= range.maxRow; r++) {
        for (let c = range.minCol; c <= range.maxCol; c++) {
          if (newData[r]) {
            const colName = headers[c];
            newData[r][colName] = '';
          }
        }
      }
      setData(newData);
      e.preventDefault();
    } else if (range && e.ctrlKey && e.key === 'c') {
      let tsv = '';
      for (let r = range.minRow; r <= range.maxRow; r++) {
        let rowData = [];
        for (let c = range.minCol; c <= range.maxCol; c++) {
          if (data[r]) {
            rowData.push(data[r][headers[c]] || '');
          }
        }
        tsv += rowData.join('\t') + '\n';
      }
      navigator.clipboard.writeText(tsv);
      e.preventDefault();
    } else if (range && e.ctrlKey && e.key === 'v') {
      navigator.clipboard.readText().then(text => {
        const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        if (rows[rows.length - 1] === '') rows.pop();
        
        const newData = [...data];
        let rIdx = range.minRow;
        
        rows.forEach(row => {
          if (!newData[rIdx]) {
             const newRow = {};
             headers.forEach(h => { newRow[h] = ''; });
             newData.push(newRow);
          }
          const cells = row.split('\t');
          let cIdx = range.minCol;
          cells.forEach(cellValue => {
            if (cIdx < headers.length) {
              newData[rIdx][headers[cIdx]] = cellValue;
            }
            cIdx++;
          });
          rIdx++;
        });
        setData(newData);
      }).catch(err => console.error("Clipboard read error: ", err));
      e.preventDefault();
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
              Xem trước tệp: <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{file.name}</span>
            </h2>
            <button className="close-btn" onClick={onClose} title="Đóng">
              <X size={20} />
            </button>
          </div>

          <div 
            className="modal-content" 
            ref={modalRef} 
            tabIndex={0} 
            onKeyDown={handleGlobalKeyDown}
            style={{ outline: 'none' }}
          >
            <div className="table-wrapper">
              <table className="csv-table">
                <thead>
                  <tr>
                    <th className="action-col">Hành động</th>
                    <th className="index-col">#</th>
                    {headers.map((col, colIndex) => (
                      <th key={colIndex} className="header-cell relative group" style={{ position: 'relative' }}>
                        {editingHeader === colIndex ? (
                          <input
                            type="text"
                            value={headerEditValue}
                            onChange={(e) => setHeaderEditValue(e.target.value)}
                            onBlur={saveHeaderEdit}
                            onKeyDown={handleHeaderKeyDown}
                            autoFocus
                            className="header-input"
                          />
                        ) : (
                          <div 
                            className="header-content flex items-center justify-between gap-2 cursor-text" 
                            onDoubleClick={() => startEditingHeader(colIndex, col)}
                            title="Click đúp để sửa tiêu đề cột"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
                          >
                            <span>{col}</span>
                            <button 
                              className="delete-btn"
                              onClick={(e) => { e.stopPropagation(); deleteColumn(colIndex); }}
                              title="Xóa cột"
                              style={{ opacity: 0.6 }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </th>
                    ))}
                    <th className="add-col-th" style={{ minWidth: '40px', textAlign: 'center' }}>
                       <button onClick={addColumn} className="btn-icon btn-outline-accent" style={{ padding: '4px', borderRadius: '4px' }} title="Thêm cột mới">
                         <Plus size={16} />
                       </button>
                    </th>
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
                            <Trash2 size={15} />
                          </button>
                        </td>
                        <td className="index-col">{globalIndex + 1}</td>
                        {headers.map((col, colIndex) => {
                          const isEditing =
                            editingCell?.rowIndex === globalIndex &&
                            editingCell?.colIndex === colIndex;
                          const selected = isCellSelected(globalIndex, colIndex);
                          
                          return (
                            <td
                              key={colIndex}
                              onDoubleClick={() =>
                                startEditing(globalIndex, colIndex, row[col])
                              }
                              onMouseDown={(e) => handleMouseDown(globalIndex, colIndex, e)}
                              onMouseEnter={() => handleMouseEnter(globalIndex, colIndex)}
                              className={`
                                ${isEditing ? 'editing-td' : ''} 
                                ${selected && !isEditing ? 'selected-td' : ''}
                              `}
                              style={{ userSelect: 'none' }}
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={saveEdit}
                                  onKeyDown={handleCellKeyDown}
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
                        <td className="empty-cell"></td>
                      </tr>
                    );
                  })}
                  {currentData.length === 0 && (
                    <tr>
                      <td colSpan={headers.length + 3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        Không có dữ liệu trong tệp CSV
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--glass-border-subtle)', background: 'rgba(255, 255, 255, 0.02)', display: 'flex', gap: '0.75rem' }}>
               <button onClick={addRow} className="btn-outline btn-outline-accent" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8125rem' }}>
                 <Plus size={15} /> Thêm dòng mới
               </button>
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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
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
              <button className="btn-outline" onClick={onClose}>
                Hủy bỏ
              </button>
              <button
                className="btn-primary"
                onClick={handleConfirm}
              >
                {mode === "upload" ? <UploadCloud size={17} /> : <Download size={17} />} 
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
