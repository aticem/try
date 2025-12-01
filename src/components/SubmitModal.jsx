// src/components/SubmitModal.jsx
// Günlük çalışma kaydı submit modalı

import React, { useState, useEffect } from "react";

export default function SubmitModal({ isOpen, onClose, onSubmit, completedLength, totalLength, lastMarkedLength }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [subcontractor, setSubcontractor] = useState('');
  const [workers, setWorkers] = useState(1);
  const [notes, setNotes] = useState('');
  const [amountOfWork, setAmountOfWork] = useState('');

  // Modal açıldığında bugünün tarihini ve son işaretlenen uzunluğu ayarla
  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().split('T')[0]);
      // Auto-populate with last marked length from map selection
      setAmountOfWork(lastMarkedLength > 0 ? lastMarkedLength.toFixed(2) : '');
    }
  }, [isOpen, lastMarkedLength]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!date) {
      alert('Please select a date');
      return;
    }
    
    if (!subcontractor.trim()) {
      alert('Please enter subcontractor name');
      return;
    }
    
    if (workers < 1) {
      alert('Workers must be at least 1');
      return;
    }

    const amount = parseFloat(amountOfWork);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount of work');
      return;
    }
    
    const record = {
      date,
      installed_length: amount,
      subcontractor: subcontractor.trim(),
      workers: parseInt(workers),
      notes: notes.trim(),
      total_completed: completedLength
    };
    
    onSubmit(record);
    
    // Form'u sıfırla
    setSubcontractor('');
    setWorkers(1);
    setNotes('');
    setAmountOfWork('');
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const progress = totalLength > 0 ? ((completedLength / totalLength) * 100).toFixed(1) : 0;

  return (
    <div 
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
    >
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        width: '400px',
        maxWidth: '90vw',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
      }}>
        <h2 style={{ 
          margin: '0 0 20px 0', 
          color: '#333',
          borderBottom: '2px solid #00aa00',
          paddingBottom: '10px'
        }}>
          📋 Submit Daily Work
        </h2>
        
        {/* Progress Summary */}
        <div style={{
          backgroundColor: '#e8f5e9',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #a5d6a7'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', color: '#2e7d32' }}>Total Completed</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1b5e20' }}>
              {completedLength.toFixed(2)} m
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', color: '#2e7d32' }}>Progress</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1b5e20' }}>
              {progress}%
            </span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          {/* Date */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#555' }}>
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Amount of Work */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#555' }}>
              Amount of Work (m)
            </label>
            <input
              type="number"
              value={amountOfWork}
              onChange={(e) => setAmountOfWork(e.target.value)}
              placeholder="Enter amount of work in meters"
              step="0.01"
              min="0.01"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          
          {/* Subcontractor */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#555' }}>
              Subcontractor
            </label>
            <input
              type="text"
              value={subcontractor}
              onChange={(e) => setSubcontractor(e.target.value)}
              placeholder="Enter subcontractor name"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          
          {/* Workers */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#555' }}>
              Number of Workers
            </label>
            <input
              type="number"
              value={workers}
              onChange={(e) => setWorkers(e.target.value)}
              min="1"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          
          {/* Notes */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#555' }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows="3"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
          </div>
          
          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                backgroundColor: '#f5f5f5',
                color: '#666',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '10px 24px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#00aa00',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              ✓ Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
