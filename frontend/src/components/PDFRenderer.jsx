import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import '../styles/pdf.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

// Logging system for PDFRenderer
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, VERBOSE: 4 };
const LOG_LEVEL = process.env.REACT_APP_LOG_LEVEL || 'INFO';

const log = (level, component, message, data = null) => {
  if (LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL]) {
    const prefix = `[${component}] ${level}:`;
    if (data) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }
};

const PDFRenderer = ({
  pdfUrl,
  onDimensionsChange,
  onLoadComplete,
  containerWidth = 1200,
  isMobile = false,
  scale = 1
}) => {
  const [pdfPages, setPdfPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [dimensionsReady, setDimensionsReady] = useState(false);
  const [pageDimensions, setPageDimensions] = useState({ pageWidth: 0, pageHeight: 0 });
  const pdfPageDimensionsRef = useRef({ pageWidth: 0, pageHeight: 0 });
  const pageRefs = useRef([]);

  const calculatePageDimensions = useCallback((originalWidth, originalHeight, scale = 1) => {
    // Use configurable scale (default 1) for consistency across all peers
    const pageWidth = originalWidth * scale;
    const pageHeight = originalHeight * scale;
    
    log('INFO', 'PDFRenderer', '📐 PDF dimensions calculated', {
      originalWidth,
      originalHeight,
      scale,
      pageWidth,
      pageHeight
    });
    
    return { pageWidth, pageHeight };
  }, []); // No dependencies needed

  const handlePDFLoadSuccess = useCallback(async ({ numPages }) => {
    log('INFO', 'PDFRenderer', '📄 PDF loaded successfully', { numPages, pdfUrl: pdfUrl.substring(0, 50) + '...' });
    setPdfPages(numPages);

    if (numPages > 0) {
      setIsLoading(true);
      
      // Don't set initial dimensions - wait for actual page dimensions
      // This prevents the large gap issue caused by wrong initial calculations
      log('INFO', 'PDFRenderer', '⏳ Waiting for actual page dimensions from first page...');
    }
    setIsLoading(false);
  }, [pdfUrl]);

  const handlePageLoadSuccess = useCallback(({ pageNumber, originalWidth, originalHeight, scale = 1, width, height }) => {
    log('INFO', 'PDFRenderer', `📄 Page ${pageNumber} loaded`, { 
      originalWidth, 
      originalHeight, 
      scale, 
      width, 
      height 
    });
    
    // Set page dimensions immediately on first page load to prevent double rendering
    if (pageNumber === 1 && pageDimensions.pageWidth === 0) {
      const { pageWidth, pageHeight } = calculatePageDimensions(originalWidth, originalHeight, scale);
      
      // Set page dimensions immediately to prevent fallback values
      setPageDimensions({ pageWidth, pageHeight });
      pdfPageDimensionsRef.current = { pageWidth, pageHeight };
      
      // Mark dimensions as ready for the useEffect to trigger
      setDimensionsReady(true);
      
      log('INFO', 'PDFRenderer', '📐 PDF dimensions set immediately to prevent double rendering', { 
        pageWidth, 
        pageHeight, 
        scale,
        pdfPages,
        note: 'Using actual dimensions with scale instead of fallback values'
      });
    } else if (pageNumber === 1) {
      log('DEBUG', 'PDFRenderer', '📄 Page 1 already processed - skipping dimension update');
    } else {
      log('DEBUG', 'PDFRenderer', `📄 Page ${pageNumber} rendered (no dimension update)`);
    }
  }, [calculatePageDimensions, onDimensionsChange, onLoadComplete, pdfPages, pageDimensions.pageWidth]);

  // Set dimensions only after all pages are loaded to prevent Whiteboard remounts
  useEffect(() => {
    if (pdfPages > 0 && dimensionsReady && pdfPageDimensionsRef.current.pageWidth > 0) {
      // All pages are loaded, now set dimensions
      const { pageWidth, pageHeight } = pdfPageDimensionsRef.current;
      // Calculate total width: page width + wrapper padding (10px left + 10px right)
      const totalWidth = pageWidth + 20; // 10px left + 10px right wrapper padding
      // Calculate total height: pages + gaps + container padding (10px top + 10px bottom)
      const totalHeight = pageHeight * pdfPages + (pdfPages - 1) * 6 + 20; // 6px gap + 20px container padding
      const dimensions = { width: totalWidth, height: totalHeight };
      
      setContainerDimensions(dimensions);
      onDimensionsChange(dimensions);
      onLoadComplete({ numPages: pdfPages, dimensions });
      
      log('INFO', 'PDFRenderer', '🚀 PDF DIMENSIONS SET - Canvas should now match PDF total dimensions with proper centering', { 
        dimensions, 
        pageWidth,
        pageHeight, 
        pdfPages, 
        gaps: (pdfPages - 1) * 6,
        containerPadding: 20,
        wrapperPadding: 20, // 10px left + 10px right wrapper padding
        note: 'Canvas should now be 980px × 10,388px for 19 pages (960px + 20px wrapper padding)'
      });
    }
  }, [pdfPages, dimensionsReady, onDimensionsChange, onLoadComplete]);

  // Add this useEffect for complete cleanup
useEffect(() => {
  return () => {
    // Cleanup function that runs when component unmounts or pdfUrl changes
    log('INFO', 'PDFRenderer', '🧹 Cleaning up PDFRenderer resources');
    
    // Clear all state
    setIsLoading(false);
    setLoadError(null);
    setPdfPages(0);
    setContainerDimensions({ width: 0, height: 0 });
    setPageDimensions({ pageWidth: 0, pageHeight: 0 });
    
    // Clear all refs
    pdfPageDimensionsRef.current = { pageWidth: 0, pageHeight: 0 };
    pageRefs.current = [];
    
    // Clear PDF.js worker if needed
    if (pdfjs && pdfjs.GlobalWorkerOptions) {
      // PDF.js worker cleanup is handled automatically by react-pdf
      log('INFO', 'PDFRenderer', '🧹 PDF.js worker cleanup handled by react-pdf');
    }
    
    log('INFO', 'PDFRenderer', '✅ PDFRenderer cleanup completed');
  };
}, [pdfUrl]);

// Add this useEffect for mount logging
useEffect(() => {
  log('INFO', 'PDFRenderer', '🔄 PDFRenderer component mounted');
  
  return () => {
    log('INFO', 'PDFRenderer', '🔄 PDFRenderer component unmounted');
  };
}, []);

// Add this useEffect for render logging
useEffect(() => {
  log('DEBUG', 'PDFRenderer', '🔄 PDFRenderer component rendered');
});
  //   log('INFO', 'PDFRenderer', '📄 PDF loaded successfully', { numPages, pdfUrl: pdfUrl.substring(0, 50) + '...' });
  //   setPdfPages(numPages);

  //   if (numPages > 0) {
  //     setIsLoading(true);
  //     const pdf = await _pdfInfo.promise;
  //     // Add error handling
  //     if (!pdf) {
  //       log('ERROR', 'PDFRenderer', 'PDF document is undefined');
  //       setIsLoading(false);
  //       return;
  //     }

  //     const firstPage = await pdf.getPage(1);
  //     const { pageWidth, pageHeight } = calculatePageDimensions(firstPage);

  //     pdfPageDimensionsRef.current = { pageWidth, pageHeight };

  //     const totalHeight = (pageHeight * numPages) + (6 * (numPages - 1)); // 6px gap between pages
  //     const finalDimensions = { width: pageWidth, height: totalHeight };

  //     setContainerDimensions(finalDimensions);
  //     onDimensionsChange(finalDimensions);
  //     onLoadComplete({ numPages, dimensions: finalDimensions });
  //     setIsLoading(false);
  //     log('INFO', 'PDFRenderer', '✅ Initial PDF dimensions calculated and reported', finalDimensions);
  //   } else {
  //     setIsLoading(false);
  //     setContainerDimensions({ width: 0, height: 0 });
  //     onDimensionsChange({ width: 0, height: 0 });
  //     onLoadComplete({ numPages: 0, dimensions: { width: 0, height: 0 } });
  //     log('WARN', 'PDFRenderer', 'No pages found in PDF');
  //   }
  // }, [calculatePageDimensions, onDimensionsChange, onLoadComplete, pdfUrl]);

  const handlePDFLoadError = useCallback((error) => {
    log('ERROR', 'PDFRenderer', '❌ Error loading PDF', { error: error.message, pdfUrl: pdfUrl.substring(0, 50) + '...' });
    setLoadError(error);
    setIsLoading(false);
    setPdfPages(0);
    setContainerDimensions({ width: 0, height: 0 });
    onDimensionsChange({ width: 0, height: 0 });
    onLoadComplete({ numPages: 0, dimensions: { width: 0, height: 0 } });
  }, [onDimensionsChange, onLoadComplete, pdfUrl]);

  useEffect(() => {
    if (pdfUrl) {
      setIsLoading(true);
      setLoadError(null);
      setPdfPages(0);
      setContainerDimensions({ width: 0, height: 0 });
      setDimensionsReady(false);
      setPageDimensions({ pageWidth: 0, pageHeight: 0 });
      pdfPageDimensionsRef.current = { pageWidth: 0, pageHeight: 0 };
      pageRefs.current = [];
      log('INFO', 'PDFRenderer', '🔄 Resetting PDFRenderer state for new URL', { pdfUrl: pdfUrl.substring(0, 50) + '...' });
    }
  }, [pdfUrl]);

  return (
    <div
      className="pdf-renderer-container"
      style={{
        width: containerDimensions.width > 0 ? `${containerDimensions.width}px` : '100%',
        height: containerDimensions.height > 0 ? `${containerDimensions.height}px` : 'auto',
        minWidth: `${containerWidth}px`,
        minHeight: '100%',
        position: 'relative',
        zIndex: 1,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start', // Left-align instead of center
        justifyContent: 'flex-start',
        padding: '10px 10px', // 10px gap on left side
        boxSizing: 'border-box', // Include padding in width calculation
      }}
    >
      {isLoading && <div className="pdf-loading-overlay">Loading PDF...</div>}
      {loadError && <div className="pdf-error-overlay">Error loading PDF: {loadError.message}</div>}

      {!isLoading && !loadError && pdfPages === 0 && pdfUrl && (
        <div className="pdf-loading-overlay">Initializing PDF...</div>
      )}

      <Document
        file={pdfUrl}
        onLoadSuccess={handlePDFLoadSuccess}
        onLoadError={handlePDFLoadError}
        loading={<div>Loading PDF document...</div>}
        error={<div>Failed to load PDF document!</div>}
      >
        <div
          className="pdf-pages-wrapper"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start', // Left-align instead of center
            justifyContent: 'flex-start',
            width: '100%',
            height: '100%',
            padding: '0 0', // Remove horizontal padding since we're left-aligning
          }}
        >
          {Array.from({ length: pdfPages }, (_, index) => (
            <div
              key={`pdf-page-${index + 1}`}
              ref={el => pageRefs.current[index] = el}
              className="pdf-page-container"
              style={{
                marginBottom: index < pdfPages - 1 ? '6px' : '0px',
                width: pageDimensions.pageWidth > 0 ? `${pageDimensions.pageWidth}px` : (pdfPageDimensionsRef.current.pageWidth > 0 ? `${pdfPageDimensionsRef.current.pageWidth}px` : 'auto'),
                height: pageDimensions.pageHeight > 0 ? `${pageDimensions.pageHeight}px` : (pdfPageDimensionsRef.current.pageHeight > 0 ? `${pdfPageDimensionsRef.current.pageHeight}px` : 'auto'),
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', // Add subtle shadow for better visual separation
                borderRadius: '4px', // Add slight rounding for modern look
                overflow: 'hidden', // Ensure content doesn't overflow rounded corners
              }}
            >
              <Page
                pageNumber={index + 1}
                scale={scale}
                width={pageDimensions.pageWidth || pdfPageDimensionsRef.current?.pageWidth || 612}
                height={pageDimensions.pageHeight || pdfPageDimensionsRef.current?.pageHeight || 792}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={handlePageLoadSuccess}
                error={<div>Error loading page {index + 1}!</div>}
                loading={<div>Loading page {index + 1}...</div>}
              />
            </div>
          ))}
        </div>
      </Document>
    </div>
  );
};

export default PDFRenderer;
