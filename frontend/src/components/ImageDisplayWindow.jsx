import React, { useState, useEffect } from 'react';
import '../styles/ImageDisplayWindow.css';

const ImageDisplayWindow = ({ imageUrl, isVisible, size = { width: 1200, height: 800 }, onSizeChange }) => {
    const [imageDimensions, setImageDimensions] = useState(null);
    const [containerSize, setContainerSize] = useState(size);

    useEffect(() => {
        if (imageUrl) {
            const img = new Image();
            img.onload = () => {
                setImageDimensions({
                    width: img.naturalWidth,
                    height: img.naturalHeight
                });
                
                // Calculate container size based on image dimensions
                const newWidth = Math.max(size.width, img.naturalWidth);
                const newHeight = Math.max(size.height, img.naturalHeight);
                const newSize = { width: newWidth, height: newHeight };
                setContainerSize(newSize);
                
                // Notify parent of size change
                if (onSizeChange) {
                    onSizeChange(newSize);
                }
            };
            img.src = imageUrl;
        }
    }, [imageUrl, size.width, size.height]);

    if (!isVisible || !imageUrl) {
        return null;
    }

    return (
        <div 
            className="image-display-window"
            style={{
                width: containerSize.width,
                height: containerSize.height,
                position: 'relative',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                backgroundColor: '#f5f5f5',
                border: '2px solid #32CD32',
                overflow: 'hidden'
            }}
        >
            <img
                src={imageUrl}
                alt="Display Image"
                style={{
                    width: imageDimensions ? imageDimensions.width : 'auto',
                    height: imageDimensions ? imageDimensions.height : 'auto',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    objectPosition: 'top left'
                }}
            />
        </div>
    );
};

export default ImageDisplayWindow;
