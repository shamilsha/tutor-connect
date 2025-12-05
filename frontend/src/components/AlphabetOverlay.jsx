import React, { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import '../styles/AlphabetOverlay.css';

/**
 * Generic AlphabetOverlay Component
 * 
 * Displays any alphabet with the following features:
 * - Click-to-speak functionality
 * - Shuffle/reset alphabet order
 * - Toggle between click mode and drawing mode
 * - Peer synchronization for shuffle and mode
 * 
 * @param {Object} props
 * @param {boolean} props.isVisible - Whether the overlay is visible
 * @param {Function} props.onClose - Callback when overlay is closed
 * @param {Function} props.onShuffleOrderChange - Callback when shuffle order changes (for peer sync)
 * @param {Array|null} props.shuffleOrder - Current shuffle order from peer (array of indices)
 * @param {Function} props.onModeChange - Callback when mode changes (click/drawing)
 * @param {Function} props.onCharacterClick - Callback when a character is clicked (for peer synchronization)
 * @param {Array} props.alphabetData - Array of character objects with structure:
 *   - originalIndex: number (required, for shuffle sync)
 *   - displayChar: string (required, main character to display)
 *   - name: string (optional, character name)
 *   - pronunciation: string (optional, pronunciation guide)
 *   - forms: Object (optional, e.g., {initial, medial, final} for Arabic)
 * @param {string} props.language - Language code for TTS (e.g., 'ar-SA', 'en-US')
 * @param {number} props.gridColumns - Number of columns in the grid (default: 6)
 * @param {number} props.cardWidth - Width of each card in pixels (default: 180)
 * @param {number} props.cardHeight - Height of each card in pixels (default: 140)
 * @param {number} props.overlayWidth - Width of overlay in pixels (default: 1200)
 * @param {number} props.overlayHeight - Height of overlay in pixels (default: 800)
 * @param {boolean} props.showForms - Whether to show character forms (default: false)
 * @param {boolean} props.showPronunciation - Whether to show pronunciation (default: true)
 * @param {string} props.instructionsText - Custom instructions text (optional)
 * @param {string} props.direction - Text direction: 'ltr' (left-to-right) or 'rtl' (right-to-left) (default: 'ltr')
 */
const AlphabetOverlay = forwardRef(({
  isVisible,
  onClose,
  onShuffleOrderChange,
  shuffleOrder = null,
  onModeChange = null,
  onCharacterClick = null,
  alphabetData = [],
  language = 'en-US',
  gridColumns = 6,
  cardWidth = 180,
  cardHeight = 140,
  overlayWidth = 1200,
  overlayHeight = 800,
  showForms = false,
  showPronunciation = true,
  instructionsText = null,
  direction = 'ltr'
}, ref) => {
  // Initialize with original alphabet data, adding originalIndex if missing
  const originalAlphabet = alphabetData.map((char, index) => ({
    ...char,
    originalIndex: char.originalIndex !== undefined ? char.originalIndex : index
  }));
  
  // Store originalAlphabet in ref so it can be accessed by speakCharacterByIndex
  const originalAlphabetRef = useRef(originalAlphabet);
  useEffect(() => {
    originalAlphabetRef.current = originalAlphabet;
    console.log('[AlphabetOverlay] originalAlphabetRef updated', { 
      length: originalAlphabet.length,
      firstChar: originalAlphabet[0]?.displayChar || originalAlphabet[0]?.letter,
      indices: originalAlphabet.map(c => c.originalIndex).slice(0, 5)
    });
  }, [originalAlphabet]);

  const [displayedAlphabet, setDisplayedAlphabet] = useState([...originalAlphabet]);
  const [isShuffled, setIsShuffled] = useState(false);
  const [buttonContainer, setButtonContainer] = useState(null);
  const [lastAppliedShuffleOrder, setLastAppliedShuffleOrder] = useState(null);
  const [previousShuffleOrder, setPreviousShuffleOrder] = useState(null);
  const [isClickMode, setIsClickMode] = useState(true);
  const shuffleActionHandledRef = useRef(false); // Track if shuffle action was already handled

  // Apply shuffle order from peer when received
  useEffect(() => {
    const shuffleOrderStr = JSON.stringify(shuffleOrder);
    const previousStr = JSON.stringify(previousShuffleOrder);
    
    // Skip if shuffle order hasn't changed
    if (shuffleOrderStr === previousStr) {
      return;
    }
    
    // Skip if this is the same shuffle order we just applied locally
    const lastAppliedStr = JSON.stringify(lastAppliedShuffleOrder);
    if (shuffleOrderStr === lastAppliedStr && shuffleOrder !== null) {
      // This is our own shuffle order coming back from parent - don't reapply
      setPreviousShuffleOrder(shuffleOrder);
      return;
    }
    
    setPreviousShuffleOrder(shuffleOrder);
    
    if (shuffleOrder && Array.isArray(shuffleOrder) && shuffleOrder.length === originalAlphabet.length) {
      const reordered = shuffleOrder.map(index => originalAlphabet[index]);
      setDisplayedAlphabet(reordered);
      setIsShuffled(true);
      setLastAppliedShuffleOrder(shuffleOrder);
    } else if (shuffleOrder === null) {
      // Only reset if we were actually shuffled (check both local state and last applied)
      const wasShuffled = lastAppliedShuffleOrder !== null || isShuffled || previousShuffleOrder !== null;
      if (wasShuffled) {
        setDisplayedAlphabet([...originalAlphabet]);
        setIsShuffled(false);
        setLastAppliedShuffleOrder(null);
      }
    }
  }, [shuffleOrder, previousShuffleOrder, lastAppliedShuffleOrder, isShuffled, originalAlphabet]);

  // Shuffle function using Fisher-Yates algorithm
  const shuffleAlphabet = useCallback(() => {
    const shuffled = [...originalAlphabet];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    const shuffleOrder = shuffled.map(char => char.originalIndex);
    setDisplayedAlphabet(shuffled);
    setIsShuffled(true);
    setLastAppliedShuffleOrder(shuffleOrder);
    
    if (onShuffleOrderChange) {
      onShuffleOrderChange(shuffleOrder);
    }
  }, [originalAlphabet, onShuffleOrderChange]);

  // Reset to original order
  const resetAlphabet = useCallback(() => {
    setDisplayedAlphabet([...originalAlphabet]);
    setIsShuffled(false);
    setLastAppliedShuffleOrder(null);
    
    if (onShuffleOrderChange) {
      onShuffleOrderChange(null);
    }
  }, [originalAlphabet, onShuffleOrderChange]);

  // Toggle between click mode and drawing mode
  const toggleMode = useCallback(() => {
    const newMode = !isClickMode;
    setIsClickMode(newMode);
    if (onModeChange) {
      onModeChange(newMode);
    }
  }, [isClickMode, onModeChange]);

  // Detect mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Speak the character
  const speakCharacter = useCallback((char, fromPeer = false) => {
    if (!char) {
      console.warn('[AlphabetOverlay] speakCharacter called with null/undefined char');
      return;
    }
    
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }
    
    // Notify parent about character click (for peer synchronization)
    // Only send to peer if this is a local click (not from peer)
    if (!fromPeer && onCharacterClick) {
      onCharacterClick(char.originalIndex);
    }
    
    window.speechSynthesis.cancel();
    
    const getVoices = () => {
      return new Promise((resolve) => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          resolve(voices);
        } else {
          const onVoicesChanged = () => {
            const loadedVoices = window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = null;
            resolve(loadedVoices);
          };
          window.speechSynthesis.onvoiceschanged = onVoicesChanged;
          const timeout = isMobile ? 500 : 100;
          setTimeout(() => {
            const fallbackVoices = window.speechSynthesis.getVoices();
            if (fallbackVoices.length > 0) {
              window.speechSynthesis.onvoiceschanged = null;
              resolve(fallbackVoices);
            } else {
              if (isMobile) {
                setTimeout(() => {
                  const retryVoices = window.speechSynthesis.getVoices();
                  resolve(retryVoices);
                }, 300);
              } else {
                resolve([]);
              }
            }
          }, timeout);
        }
      });
    };
    
    getVoices().then((voices) => {
      const textToSpeak = char.displayChar || char.letter || char.isolated || '';
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = language;
      
      if (isMobile) {
        utterance.rate = 0.9;
        utterance.volume = 1;
      } else {
        utterance.rate = 0.8;
        utterance.volume = 1;
      }
      utterance.pitch = 1;
      
      // Try to find voice matching the language
      const langPrefix = language.split('-')[0].toLowerCase();
      const matchingVoice = voices.find(voice => {
        const voiceLang = voice.lang.toLowerCase();
        const voiceName = voice.name.toLowerCase();
        return voiceLang.startsWith(langPrefix) || 
               voiceLang.includes(language.toLowerCase()) ||
               voiceName.includes(langPrefix);
      });
      
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      } else if (voices.length > 0) {
        utterance.voice = voices[0];
      }
      
      utterance.onerror = (event) => {
        console.error('[AlphabetOverlay] Speech error:', event.error);
      };
      
      const speak = () => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch (error) {
          console.error('[AlphabetOverlay] Error calling speak():', error);
        }
      };
      
      if (isIOS) {
        setTimeout(speak, 50);
      } else {
        setTimeout(speak, 0);
      }
    }).catch((error) => {
      console.error('[AlphabetOverlay] Error getting voices:', error);
      try {
        const utterance = new SpeechSynthesisUtterance(char.displayChar || char.letter || char.isolated || '');
        utterance.lang = language;
        utterance.rate = isMobile ? 0.9 : 0.8;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
      } catch (fallbackError) {
        console.error('[AlphabetOverlay] Fallback speech also failed:', fallbackError);
      }
    });
  }, [language, isMobile, isIOS, onCharacterClick]);
  
  // Expose methods to parent via ref (for peer synchronization)
  useImperativeHandle(ref, () => ({
    speakCharacterByIndex: (characterIndex) => {
      console.log('[AlphabetOverlay] speakCharacterByIndex called', { 
        characterIndex, 
        originalAlphabetLength: originalAlphabetRef.current?.length,
        availableIndices: originalAlphabetRef.current?.map(c => c.originalIndex)
      });
      const char = originalAlphabetRef.current?.find(c => c.originalIndex === characterIndex);
      if (char) {
        console.log('[AlphabetOverlay] Character found, calling speakCharacter', { 
          characterIndex, 
          displayChar: char.displayChar || char.letter || char.isolated 
        });
        speakCharacter(char, true); // true = fromPeer (don't send back to peer)
      } else {
        console.warn('[AlphabetOverlay] Character not found for index:', characterIndex, {
          availableIndices: originalAlphabetRef.current?.map(c => c.originalIndex)
        });
      }
    }
  }), [speakCharacter]);

  // Load voices when component mounts
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const loadVoices = () => {
        window.speechSynthesis.getVoices();
      };
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }, []);

  // Find the whiteboard container to render button above Stage
  useEffect(() => {
    if (isVisible) {
      const container = document.querySelector('.whiteboard-container');
      if (container) {
        setButtonContainer(container);
      }
    }
  }, [isVisible]);

  if (!isVisible) return null;

  // Calculate grid template columns
  const gridTemplateColumns = `repeat(${gridColumns}, ${cardWidth}px)`;
  const gap = 15; // Fixed gap between cards

  return (
    <>
      <div 
        className="alphabet-overlay" 
        style={{ 
          position: 'relative', 
          width: `${overlayWidth}px`,
          height: `${overlayHeight}px`,
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
          direction: direction // RTL for Arabic (right to left), LTR for others
        }}
      >
        <div 
          className="alphabet-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: gridTemplateColumns,
            gap: `${gap}px`,
            padding: '20px',
            width: `${overlayWidth}px`,
            boxSizing: 'border-box',
            direction: direction // RTL for Arabic (right to left), LTR for others
          }}
        >
          {displayedAlphabet.map((char, index) => (
            <div
              key={`${char.originalIndex}-${index}`}
              className={`alphabet-letter-card ${isClickMode ? 'clickable' : 'drawing-mode'}`}
              style={{
                width: `${cardWidth}px`,
                height: `${cardHeight}px`,
                margin: 0,
                padding: '20px',
                boxSizing: 'border-box',
                cursor: isClickMode ? 'pointer' : 'default',
                pointerEvents: isClickMode ? 'auto' : 'none',
                zIndex: isClickMode ? 3 : 0
              }}
              onMouseDown={(e) => {
                if (!isClickMode) return;
                e.stopPropagation();
                e.preventDefault();
                speakCharacter(char);
              }}
              onClick={(e) => {
                if (!isClickMode) return;
                e.stopPropagation();
                e.preventDefault();
              }}
              onTouchStart={(e) => {
                if (!isClickMode) return;
                e.stopPropagation();
                e.preventDefault();
                speakCharacter(char);
              }}
              onTouchEnd={(e) => {
                if (!isClickMode) return;
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div 
                className="alphabet-letter-main" 
                style={{ 
                  fontSize: '64px', 
                  marginBottom: '8px',
                  fontWeight: 'bold',
                  fontFamily: 'Arial, Tahoma, "Segoe UI", sans-serif',
                  fontFeatureSettings: '"kern" 1',
                  textRendering: 'optimizeLegibility',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  direction: direction // RTL for Arabic characters
                }}
              >
                {char.displayChar || char.letter || char.isolated || ''}
              </div>
              {char.name && (
                <div className="alphabet-letter-name" style={{ fontSize: '14px', marginBottom: '4px' }}>
                  {char.name}
                </div>
              )}
              {showPronunciation && char.pronunciation && (
                <div className="alphabet-letter-pronunciation" style={{ fontSize: '12px' }}>
                  ({char.pronunciation})
                </div>
              )}
              {showForms && (char.forms || (char.initial || char.medial || char.final)) && (
                <div className="alphabet-letter-forms" style={{ fontSize: '11px', marginTop: '8px', gap: '4px', display: 'flex', flexWrap: 'wrap' }}>
                  {char.forms ? (
                    <>
                      <span>I: {char.forms.initial || char.displayChar}</span>
                      {char.forms.medial && <span>M: {char.forms.medial}</span>}
                      {char.forms.final && <span>F: {char.forms.final}</span>}
                    </>
                  ) : (
                    <>
                      <span>I: {char.isolated || char.displayChar}</span>
                      {char.initial && char.initial !== (char.isolated || char.displayChar) && <span>In: {char.initial}</span>}
                      {char.medial && char.medial !== (char.isolated || char.displayChar) && <span>M: {char.medial}</span>}
                      {char.final && char.final !== (char.isolated || char.displayChar) && <span>F: {char.final}</span>}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        
        {instructionsText && (
          <div className="alphabet-instructions" style={{ bottom: '10px', padding: '10px', fontSize: '14px' }}>
            {instructionsText}
          </div>
        )}
      </div>
      
      {/* Render control buttons via portal above Stage if container found */}
      {buttonContainer && createPortal(
        <div 
          className="alphabet-control-buttons" 
          style={{ 
            position: 'absolute', 
            top: 0, 
            [direction === 'rtl' ? 'right' : 'left']: 0, // Right side for RTL, left side for LTR
            zIndex: 10, 
            display: 'flex', 
            gap: '4px',
            direction: 'ltr' // Buttons always LTR regardless of text direction
          }}
        >
          {/* Shuffle/Reset Button */}
          <button
            className="alphabet-shuffle-btn"
            onClick={(e) => {
              // CRITICAL: Prevent click from firing if we already handled it in onMouseDown
              if (shuffleActionHandledRef.current) {
                e.preventDefault();
                e.stopPropagation();
                shuffleActionHandledRef.current = false; // Reset for next interaction
                return;
              }
              // Fallback: if onMouseDown didn't fire (shouldn't happen), handle it here
              e.preventDefault();
              e.stopPropagation();
              const currentShuffled = isShuffled || (shuffleOrder !== null && shuffleOrder !== undefined);
              if (currentShuffled) {
                resetAlphabet();
              } else {
                shuffleAlphabet();
              }
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Mark that we've handled this action
              shuffleActionHandledRef.current = true;
              // Check current state and toggle
              const currentShuffled = isShuffled || (shuffleOrder !== null && shuffleOrder !== undefined);
              if (currentShuffled) {
                resetAlphabet();
              } else {
                shuffleAlphabet();
              }
            }}
            onMouseUp={(e) => {
              // Reset the flag after a short delay to allow onClick to check it
              setTimeout(() => {
                shuffleActionHandledRef.current = false;
              }, 100);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Mark that we've handled this action
              shuffleActionHandledRef.current = true;
              // Check current state and toggle
              const currentShuffled = isShuffled || (shuffleOrder !== null && shuffleOrder !== undefined);
              if (currentShuffled) {
                resetAlphabet();
              } else {
                shuffleAlphabet();
              }
            }}
            onTouchEnd={(e) => {
              // Prevent click event from firing after touch
              e.preventDefault();
              e.stopPropagation();
              // Reset the flag
              setTimeout(() => {
                shuffleActionHandledRef.current = false;
              }, 100);
            }}
            title={(isShuffled || (shuffleOrder !== null && shuffleOrder !== undefined)) ? "Reset to original order" : "Shuffle alphabet"}
            style={{
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: 0,
              cursor: 'pointer',
              fontSize: '18px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              pointerEvents: 'auto'
            }}
          >
            {(isShuffled || (shuffleOrder !== null && shuffleOrder !== undefined)) ? '↻' : '🔀'}
          </button>
          
          {/* Toggle Mode Button */}
          <button
            className="alphabet-toggle-mode-btn"
            onClick={(e) => {
              // Prevent default click behavior - we handle it in onMouseDown/onTouchStart
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleMode();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleMode();
            }}
            onTouchEnd={(e) => {
              // Prevent click event from firing after touch
              e.preventDefault();
              e.stopPropagation();
            }}
            title={isClickMode ? "Switch to drawing mode" : "Switch to click mode"}
            style={{
              background: isClickMode ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: 0,
              cursor: 'pointer',
              fontSize: '18px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              pointerEvents: 'auto'
            }}
          >
            {isClickMode ? '👆' : '✏️'}
          </button>
        </div>,
        buttonContainer
      )}
    </>
  );
});

AlphabetOverlay.displayName = 'AlphabetOverlay';

export default AlphabetOverlay;

