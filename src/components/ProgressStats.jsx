// src/components/ProgressStats.jsx
// İstatistik barı component'i

import React from "react";

export default function ProgressStats({ 
  totalLength, 
  completedLength, 
  dailyLog,
  onSubmitClick,
  onExportClick,
  onHistoryClick
}) {
  const remainingLength = Math.max(0, totalLength - completedLength);
  const completedPercentage = totalLength > 0 ? (completedLength / totalLength * 100).toFixed(1) : 0;
  
  // Günlük toplam kayıt sayısı
  const todayRecords = dailyLog.filter(record => {
    const today = new Date().toISOString().split('T')[0];
    return record.date === today;
  });
  
  const todaySubmitted = todayRecords.reduce((sum, r) => sum + (r.installed_length || 0), 0);

  return (
    <div style={{
      position: "absolute",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 1000,
      backgroundColor: "white",
      padding: "12px 20px",
      borderRadius: "8px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
      display: "flex",
      gap: "16px",
      alignItems: "center"
    }}>
      {/* Submit Button */}
      <button
        onClick={onSubmitClick}
        title="Submit Daily Work"
        style={{
          padding: "8px 16px",
          border: "none",
          borderRadius: "6px",
          backgroundColor: "#00aa00",
          color: "white",
          cursor: "pointer",
          fontWeight: "bold",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }}
      >
        📋 Submit
      </button>
      
      {/* Export Button */}
      <button
        onClick={onExportClick}
        disabled={dailyLog.length === 0}
        title="Export to Excel"
        style={{
          padding: "8px 16px",
          border: "none",
          borderRadius: "6px",
          backgroundColor: dailyLog.length === 0 ? "#ccc" : "#0066cc",
          color: "white",
          cursor: dailyLog.length === 0 ? "not-allowed" : "pointer",
          fontWeight: "bold",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }}
      >
        📊 Export
      </button>
      
      {/* History Button */}
      <button
        onClick={onHistoryClick}
        disabled={dailyLog.length === 0}
        title="View History"
        style={{
          padding: "8px 16px",
          border: "none",
          borderRadius: "6px",
          backgroundColor: dailyLog.length === 0 ? "#ccc" : "#666",
          color: "white",
          cursor: dailyLog.length === 0 ? "not-allowed" : "pointer",
          fontWeight: "bold",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }}
      >
        📜 History ({dailyLog.length})
      </button>
      
      <div style={{ width: "1px", height: "30px", backgroundColor: "#ddd" }}></div>
      
      {/* Today's Submitted */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>Today Submitted</div>
        <div style={{ fontWeight: "bold", fontSize: "14px", color: "#9c27b0" }}>
          {todaySubmitted.toFixed(1)} m
        </div>
      </div>
      
      <div style={{ width: "1px", height: "30px", backgroundColor: "#ddd" }}></div>
      
      {/* Total Records */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>Total Records</div>
        <div style={{ fontWeight: "bold", fontSize: "14px", color: "#ff5722" }}>
          {dailyLog.length}
        </div>
      </div>
    </div>
  );
}
