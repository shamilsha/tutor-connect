import React from 'react';
import AlphabetOverlay from './AlphabetOverlay';
import { arabicAlphabet } from '../data/alphabetData';

/**
 * ArabicAlphabetOverlay Component
 * 
 * Wrapper component that uses the generic AlphabetOverlay
 * with Arabic-specific configuration
 */
const ArabicAlphabetOverlay = ({ isVisible, onClose, onShuffleOrderChange, shuffleOrder = null, onModeChange = null }) => {
  return (
    <AlphabetOverlay
      isVisible={isVisible}
      onClose={onClose}
      onShuffleOrderChange={onShuffleOrderChange}
      shuffleOrder={shuffleOrder}
      onModeChange={onModeChange}
      alphabetData={arabicAlphabet}
      language="ar-SA"
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
};

export default ArabicAlphabetOverlay;
