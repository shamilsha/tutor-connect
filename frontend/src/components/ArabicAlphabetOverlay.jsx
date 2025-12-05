import React, { useImperativeHandle, forwardRef } from 'react';
import AlphabetOverlay from './AlphabetOverlay';
import { arabicAlphabet } from '../data/alphabetData';

/**
 * ArabicAlphabetOverlay Component
 * 
 * Wrapper component that uses the generic AlphabetOverlay
 * with Arabic-specific configuration
 */
const ArabicAlphabetOverlay = forwardRef(({ isVisible, onClose, onShuffleOrderChange, shuffleOrder = null, onModeChange = null, onCharacterClick = null }, ref) => {
  const alphabetOverlayRef = React.useRef(null);
  
  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    speakCharacterByIndex: (characterIndex) => {
      console.log('[ArabicAlphabetOverlay] speakCharacterByIndex called', { 
        characterIndex,
        hasAlphabetOverlayRef: !!alphabetOverlayRef.current
      });
      if (alphabetOverlayRef.current) {
        alphabetOverlayRef.current.speakCharacterByIndex(characterIndex);
      } else {
        console.warn('[ArabicAlphabetOverlay] alphabetOverlayRef.current is null');
      }
    }
  }));
  
  return (
    <AlphabetOverlay
      ref={alphabetOverlayRef}
      isVisible={isVisible}
      onClose={onClose}
      onShuffleOrderChange={onShuffleOrderChange}
      shuffleOrder={shuffleOrder}
      onModeChange={onModeChange}
      onCharacterClick={onCharacterClick}
      alphabetData={arabicAlphabet}
      language="ar-SA"
      direction="rtl"
      gridColumns={6}
      cardWidth={180}
      cardHeight={140}
      overlayWidth={1200}
      overlayHeight={800}
      showForms={true}
      showPronunciation={true}
      instructionsText="You can now draw or write over the Arabic alphabet using the drawing tools above"
    />
  );
});

ArabicAlphabetOverlay.displayName = 'ArabicAlphabetOverlay';

export default ArabicAlphabetOverlay;
