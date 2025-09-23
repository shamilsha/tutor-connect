import React from 'react';
import '../styles/PDFNavigation.css';

const PDFNavigation = ({ 
  currentPage = 1, 
  totalPages = 1, 
  onPageChange, 
  onZoomIn, 
  onZoomOut, 
  onZoomReset,
  scale = 1,
  isVisible = true 
}) => {
  if (!isVisible || totalPages <= 1) {
    return null;
  }

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handlePageInput = (e) => {
    const page = parseInt(e.target.value);
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  return (
    <div className="pdf-navigation">
      <div className="pdf-nav-controls">
        {/* Page Navigation */}
        <div className="pdf-page-controls">
          <button 
            className="pdf-nav-btn" 
            onClick={handlePrevious}
            disabled={currentPage <= 1}
            title="Previous Page"
          >
            ◀
          </button>
          
          <div className="pdf-page-info">
            <input
              type="number"
              value={currentPage}
              onChange={handlePageInput}
              min="1"
              max={totalPages}
              className="pdf-page-input"
            />
            <span className="pdf-page-separator">/</span>
            <span className="pdf-total-pages">{totalPages}</span>
          </div>
          
          <button 
            className="pdf-nav-btn" 
            onClick={handleNext}
            disabled={currentPage >= totalPages}
            title="Next Page"
          >
            ▶
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="pdf-zoom-controls">
          <button 
            className="pdf-zoom-btn" 
            onClick={onZoomOut}
            title="Zoom Out"
          >
            −
          </button>
          
          <span className="pdf-zoom-level">
            {Math.round(scale * 100)}%
          </span>
          
          <button 
            className="pdf-zoom-btn" 
            onClick={onZoomIn}
            title="Zoom In"
          >
            +
          </button>
          
          <button 
            className="pdf-zoom-reset" 
            onClick={onZoomReset}
            title="Reset Zoom"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default PDFNavigation;
