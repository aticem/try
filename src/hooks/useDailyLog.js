// src/hooks/useDailyLog.js
// LocalStorage'da günlük çalışma kayıtlarını yöneten custom hook

import { useState, useEffect } from "react";

export default function useDailyLog() {
  const [dailyLog, setDailyLog] = useState([]);

  // Component mount olduğunda localStorage'dan verileri yükle
  useEffect(() => {
    const stored = localStorage.getItem("dailyLog");
    if (stored) {
      try {
        setDailyLog(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse dailyLog from localStorage:", e);
        setDailyLog([]);
      }
    }
  }, []);

  // Yeni kayıt ekle
  const addRecord = (record) => {
    const newRecord = {
      ...record,
      id: Date.now(), // Benzersiz ID
      timestamp: new Date().toISOString()
    };
    const updated = [...dailyLog, newRecord];
    setDailyLog(updated);
    localStorage.setItem("dailyLog", JSON.stringify(updated));
    return newRecord;
  };

  // Kayıt güncelle
  const updateRecord = (id, updates) => {
    const updated = dailyLog.map(record => 
      record.id === id ? { ...record, ...updates } : record
    );
    setDailyLog(updated);
    localStorage.setItem("dailyLog", JSON.stringify(updated));
  };

  // Kayıt sil
  const deleteRecord = (id) => {
    const updated = dailyLog.filter(record => record.id !== id);
    setDailyLog(updated);
    localStorage.setItem("dailyLog", JSON.stringify(updated));
  };

  // Tüm kayıtları sil
  const resetLog = () => {
    localStorage.removeItem("dailyLog");
    setDailyLog([]);
  };

  // Tarihe göre kayıtları grupla
  const getRecordsByDate = () => {
    const grouped = {};
    dailyLog.forEach(record => {
      const date = record.date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(record);
    });
    return grouped;
  };

  // Toplam istatistikleri hesapla
  const getTotalStats = () => {
    return dailyLog.reduce((acc, record) => ({
      totalInstalled: acc.totalInstalled + (record.installed_length || 0),
      totalWorkers: acc.totalWorkers + (record.workers || 0),
      recordCount: acc.recordCount + 1
    }), { totalInstalled: 0, totalWorkers: 0, recordCount: 0 });
  };

  return { 
    dailyLog, 
    addRecord, 
    updateRecord,
    deleteRecord,
    resetLog,
    getRecordsByDate,
    getTotalStats
  };
}
