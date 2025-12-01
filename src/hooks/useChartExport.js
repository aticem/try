// src/hooks/useChartExport.js
// Chart.js + ExcelJS ile export işlemlerini yöneten custom hook

import { useCallback, useState } from "react";
import { Chart, registerables } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import ExcelJS from "exceljs";

// Register Chart.js components
Chart.register(...registerables, ChartDataLabels);

export default function useChartExport() {
  const [isExporting, setIsExporting] = useState(false);

  // Verileri tarihe göre grupla ve aggregate et
  const aggregateData = (dailyLog) => {
    const grouped = {};
    
    dailyLog.forEach(record => {
      const date = record.date;
      if (!grouped[date]) {
        grouped[date] = {
          date,
          installed_length: 0,
          workers: 0,
          subcontractors: new Set()
        };
      }
      grouped[date].installed_length += record.installed_length || 0;
      grouped[date].workers += record.workers || 0;
      if (record.subcontractor) {
        grouped[date].subcontractors.add(record.subcontractor);
      }
    });
    
    // Tarihe göre sırala ve Set'i array'e çevir
    return Object.values(grouped)
      .map(row => ({
        ...row,
        subcontractor: Array.from(row.subcontractors).join(', '),
        // Get first 2 letters of each word, capitalize (e.g., "Baran Zemin" -> "BAZE")
        sub3: Array.from(row.subcontractors).map(s => 
          s.split(' ').map(word => word.slice(0, 2).toUpperCase()).join('')
        ).join('/')
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Chart oluştur ve PNG olarak döndür
  const createChartImage = async (aggregatedData) => {
    // Canvas oluştur
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    
    const labels = aggregatedData.map(row => row.date);
    const installedData = aggregatedData.map(row => row.installed_length);
    const workersData = aggregatedData.map(row => row.workers);
    const subLabels = aggregatedData.map(row => row.sub3);
    
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Installed Length (m)',
            data: installedData,
            backgroundColor: 'rgba(75, 192, 192, 0.8)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Daily Progress Report',
            font: { size: 18 }
          },
          datalabels: {
            display: true,
            color: '#000',
            anchor: 'end',
            align: 'top',
            font: { weight: 'bold', size: 11 },
            formatter: (value, context) => {
              const idx = context.dataIndex;
              const workers = workersData[idx];
              const sub = subLabels[idx];
              return `${sub}-${workers}`;
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Length (m)'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Date'
            }
          }
        }
      },
      plugins: [ChartDataLabels]
    });
    
    // Chart render edilmesini bekle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // PNG'ye çevir
    const imageData = canvas.toDataURL('image/png');
    
    // Cleanup
    chart.destroy();
    document.body.removeChild(canvas);
    
    return imageData;
  };

  // Excel dosyası oluştur ve indir
  const exportToExcel = useCallback(async (dailyLog, projectInfo = {}) => {
    if (dailyLog.length === 0) {
      alert('No data to export!');
      return;
    }
    
    setIsExporting(true);
    
    try {
      // Verileri aggregate et
      const aggregatedData = aggregateData(dailyLog);
      
      // Chart image oluştur
      const chartImage = await createChartImage(aggregatedData);
      
      // Workbook oluştur
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Trench Progress Tracker';
      workbook.created = new Date();
      
      // Sheet 1: Data
      const dataSheet = workbook.addWorksheet('Daily Progress Data');
      
      // Header
      dataSheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Amount of Work (m)', key: 'installed_length', width: 20 },
        { header: 'Workers', key: 'workers', width: 12 },
        { header: 'Subcontractor', key: 'subcontractor', width: 25 }
      ];
      
      // Style header
      dataSheet.getRow(1).font = { bold: true };
      dataSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      
      // Add data
      aggregatedData.forEach(row => {
        dataSheet.addRow({
          date: row.date,
          installed_length: row.installed_length.toFixed(2),
          workers: row.workers,
          subcontractor: row.subcontractor
        });
      });
      
      // Add totals row
      const totalRow = dataSheet.addRow({
        date: 'TOTAL',
        installed_length: aggregatedData.reduce((sum, r) => sum + r.installed_length, 0).toFixed(2),
        workers: aggregatedData.reduce((sum, r) => sum + r.workers, 0),
        subcontractor: ''
      });
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2EFDA' }
      };
      
      // Sheet 2: Chart
      const chartSheet = workbook.addWorksheet('Progress Chart');
      
      // Chart image'ı base64'ten buffer'a çevir
      const base64Data = chartImage.replace(/^data:image\/png;base64,/, '');
      const imageId = workbook.addImage({
        base64: base64Data,
        extension: 'png'
      });
      
      // Chart'ı sheet'e ekle
      chartSheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 800, height: 400 }
      });
      
      // Excel dosyasını indir
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `progress_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setIsExporting(false);
      return true;
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
      setIsExporting(false);
      return false;
    }
  }, []);

  return { exportToExcel, aggregateData, isExporting };
}
