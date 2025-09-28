import React, { useState, useRef, useEffect, useCallback } from 'react';

const ImageRenderer = ({ 
  imageUrl, 
  onDimensionsChange, // ONLY thing parent needs to know
  containerWidth = 1200,
  containerHeight = 800
}) => {
  // STABLE REFERENCES - No remounts during scrolling
  const imageDimensionsRef = useRef({ width: 0, height: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const [imageError, setImageError] = useState(null);
  const dimensionsNotifiedRef = useRef(false);

  // CENTRALIZED IMAGE DIMENSIONS CALCULATION (like PDF)
  const calculateImageDimensions = useCallback((naturalWidth, naturalHeight) => {
    // Use natural dimensions with scale = 1 (no scaling/fitting)
    const width = naturalWidth;
    const height = naturalHeight;
    
    console.log('🔍 DEBUG: ImageRenderer - Calculating dimensions', {
      naturalWidth,
      naturalHeight,
      calculatedWidth: width,
      calculatedHeight: height,
      scale: 1,
      timestamp: Date.now()
    });

    return { width, height };
  }, []);

  // SET IMAGE SRC ONCE WHEN URL CHANGES
  useEffect(() => {
    if (imageUrl) {
      // Add cache busting only once when URL changes
      const newImageSrc = `${imageUrl}?t=${Date.now()}`;
      setImageSrc(newImageSrc);
      dimensionsNotifiedRef.current = false; // Reset notification flag
    }
  }, [imageUrl]);

  // ONE-TIME CALCULATIONS DURING LOAD ONLY
  const handleImageLoad = useCallback((e) => {
    const img = e.target;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    // Calculate dimensions once during load
    const { width, height } = calculateImageDimensions(naturalWidth, naturalHeight);
    
    // Store in stable ref (no remounts)
    imageDimensionsRef.current = { width, height };
    
    console.log('🔍 DEBUG: ImageRenderer - Image loaded', {
      naturalWidth,
      naturalHeight,
      calculatedWidth: width,
      calculatedHeight: height,
      timestamp: Date.now()
    });

    // CRITICAL: Only notify parent ONCE per image - DIMENSIONS ONLY
    if (onDimensionsChange && !dimensionsNotifiedRef.current) {
      onDimensionsChange({ width, height });
      dimensionsNotifiedRef.current = true;
      console.log('🔍 DEBUG: ImageRenderer - Dimensions sent to parent', { width, height });
    }

    setIsLoaded(true);
  }, [calculateImageDimensions, onDimensionsChange]);

  // STABLE IMAGE ELEMENT - No remounts during scrolling
  const imageStyle = {
    width: imageDimensionsRef.current.width || 'auto',
    height: imageDimensionsRef.current.height || 'auto',
    display: 'block',
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'none', // No scaling/fitting
    visibility: 'visible',
    opacity: 1,
    zIndex: 9999,
    position: 'relative'
  };

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%',
      overflow: 'hidden' // Prevent scrollbars in image container
    }}>
      {imageSrc && (
        <img
          src={imageSrc}
          alt="Background Image"
          style={imageStyle}
          onLoad={handleImageLoad}
          onError={(e) => {
            console.error('🔍 DEBUG: ImageRenderer - Image load error', {
              src: imageSrc,
              error: e,
              timestamp: Date.now()
            });
            setImageError(e);
          }}
        />
      )}
      {imageError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'red',
          fontSize: '14px'
        }}>
          Image load failed
        </div>
      )}
    </div>
  );
};

export default ImageRenderer;
