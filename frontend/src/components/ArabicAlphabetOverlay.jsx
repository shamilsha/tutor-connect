import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/ArabicAlphabetOverlay.css';

// Arabic alphabet with isolated, initial, medial, and final forms
// Each character has an originalIndex to track its position for shuffle synchronization
const originalArabicAlphabet = [
  { letter: 'ا', name: 'Alif', isolated: 'ا', initial: 'ا', medial: 'ا', final: 'ا', pronunciation: 'a', originalIndex: 0 },
  { letter: 'ب', name: 'Ba', isolated: 'ب', initial: 'بـ', medial: 'ـبـ', final: 'ـب', pronunciation: 'ba', originalIndex: 1 },
  { letter: 'ت', name: 'Ta', isolated: 'ت', initial: 'تـ', medial: 'ـتـ', final: 'ـت', pronunciation: 'ta', originalIndex: 2 },
  { letter: 'ث', name: 'Tha', isolated: 'ث', initial: 'ثـ', medial: 'ـثـ', final: 'ـث', pronunciation: 'tha', originalIndex: 3 },
  { letter: 'ج', name: 'Jeem', isolated: 'ج', initial: 'جـ', medial: 'ـجـ', final: 'ـج', pronunciation: 'jeem', originalIndex: 4 },
  { letter: 'ح', name: 'Haa', isolated: 'ح', initial: 'حـ', medial: 'ـحـ', final: 'ـح', pronunciation: 'haa', originalIndex: 5 },
  { letter: 'خ', name: 'Khaa', isolated: 'خ', initial: 'خـ', medial: 'ـخـ', final: 'ـخ', pronunciation: 'khaa', originalIndex: 6 },
  { letter: 'د', name: 'Dal', isolated: 'د', initial: 'د', medial: 'د', final: 'د', pronunciation: 'dal', originalIndex: 7 },
  { letter: 'ذ', name: 'Thal', isolated: 'ذ', initial: 'ذ', medial: 'ذ', final: 'ذ', pronunciation: 'thal', originalIndex: 8 },
  { letter: 'ر', name: 'Ra', isolated: 'ر', initial: 'ر', medial: 'ر', final: 'ر', pronunciation: 'ra', originalIndex: 9 },
  { letter: 'ز', name: 'Zay', isolated: 'ز', initial: 'ز', medial: 'ز', final: 'ز', pronunciation: 'zay', originalIndex: 10 },
  { letter: 'س', name: 'Seen', isolated: 'س', initial: 'سـ', medial: 'ـسـ', final: 'ـس', pronunciation: 'seen', originalIndex: 11 },
  { letter: 'ش', name: 'Sheen', isolated: 'ش', initial: 'شـ', medial: 'ـشـ', final: 'ـش', pronunciation: 'sheen', originalIndex: 12 },
  { letter: 'ص', name: 'Sad', isolated: 'ص', initial: 'صـ', medial: 'ـصـ', final: 'ـص', pronunciation: 'sad', originalIndex: 13 },
  { letter: 'ض', name: 'Dad', isolated: 'ض', initial: 'ضـ', medial: 'ـضـ', final: 'ـض', pronunciation: 'dad', originalIndex: 14 },
  { letter: 'ط', name: 'Taa', isolated: 'ط', initial: 'طـ', medial: 'ـطـ', final: 'ـط', pronunciation: 'taa', originalIndex: 15 },
  { letter: 'ظ', name: 'Zaa', isolated: 'ظ', initial: 'ظـ', medial: 'ـظـ', final: 'ـظ', pronunciation: 'zaa', originalIndex: 16 },
  { letter: 'ع', name: 'Ayn', isolated: 'ع', initial: 'عـ', medial: 'ـعـ', final: 'ـع', pronunciation: 'ayn', originalIndex: 17 },
  { letter: 'غ', name: 'Ghayn', isolated: 'غ', initial: 'غـ', medial: 'ـغـ', final: 'ـغ', pronunciation: 'ghayn', originalIndex: 18 },
  { letter: 'ف', name: 'Fa', isolated: 'ف', initial: 'فـ', medial: 'ـفـ', final: 'ـف', pronunciation: 'fa', originalIndex: 19 },
  { letter: 'ق', name: 'Qaf', isolated: 'ق', initial: 'قـ', medial: 'ـقـ', final: 'ـق', pronunciation: 'qaf', originalIndex: 20 },
  { letter: 'ك', name: 'Kaf', isolated: 'ك', initial: 'كـ', medial: 'ـكـ', final: 'ـك', pronunciation: 'kaf', originalIndex: 21 },
  { letter: 'ل', name: 'Lam', isolated: 'ل', initial: 'لـ', medial: 'ـلـ', final: 'ـل', pronunciation: 'lam', originalIndex: 22 },
  { letter: 'م', name: 'Meem', isolated: 'م', initial: 'مـ', medial: 'ـمـ', final: 'ـم', pronunciation: 'meem', originalIndex: 23 },
  { letter: 'ن', name: 'Noon', isolated: 'ن', initial: 'نـ', medial: 'ـنـ', final: 'ـن', pronunciation: 'noon', originalIndex: 24 },
  { letter: 'ه', name: 'Haa', isolated: 'ه', initial: 'هـ', medial: 'ـهـ', final: 'ـه', pronunciation: 'haa', originalIndex: 25 },
  { letter: 'و', name: 'Waw', isolated: 'و', initial: 'و', medial: 'و', final: 'و', pronunciation: 'waw', originalIndex: 26 },
  { letter: 'ي', name: 'Yaa', isolated: 'ي', initial: 'يـ', medial: 'ـيـ', final: 'ـي', pronunciation: 'yaa', originalIndex: 27 }
];

const ArabicAlphabetOverlay = ({ isVisible, onClose, onShuffleOrderChange, shuffleOrder = null, onModeChange = null }) => {
  const [displayedAlphabet, setDisplayedAlphabet] = useState([...originalArabicAlphabet]);
  const [isShuffled, setIsShuffled] = useState(false);
  const [buttonContainer, setButtonContainer] = useState(null);
  const [lastAppliedShuffleOrder, setLastAppliedShuffleOrder] = useState(null); // Track last applied to prevent loops
  const [previousShuffleOrder, setPreviousShuffleOrder] = useState(null); // Track previous prop value to detect changes
  const [isClickMode, setIsClickMode] = useState(true); // true = click to speak, false = drawing mode

  // Apply shuffle order from peer when received (only if different from what we already have)
  useEffect(() => {
    // Skip if this shuffle order is the same as the previous prop value (prevents unnecessary updates)
    const shuffleOrderStr = JSON.stringify(shuffleOrder);
    const previousStr = JSON.stringify(previousShuffleOrder);
    
    if (shuffleOrderStr === previousStr) {
      console.log('[ArabicAlphabet] Shuffle order prop unchanged, skipping update', { shuffleOrder });
      return;
    }
    
    // Update previous value
    setPreviousShuffleOrder(shuffleOrder);
    
    if (shuffleOrder && Array.isArray(shuffleOrder) && shuffleOrder.length === originalArabicAlphabet.length) {
      console.log('[ArabicAlphabet] Applying shuffle order', { shuffleOrder, lastApplied: lastAppliedShuffleOrder });
      // Reconstruct alphabet based on received indices
      const reordered = shuffleOrder.map(index => originalArabicAlphabet[index]);
      setDisplayedAlphabet(reordered);
      setIsShuffled(true);
      setLastAppliedShuffleOrder(shuffleOrder); // Remember this was applied
    } else if (shuffleOrder === null) {
      // Reset to original order when shuffleOrder becomes null (from peer or local)
      // Check if we were previously shuffled (either by checking lastApplied or current state)
      const wasShuffled = lastAppliedShuffleOrder !== null || isShuffled || previousShuffleOrder !== null;
      if (wasShuffled) {
        console.log('[ArabicAlphabet] Resetting to original order', { 
          lastApplied: lastAppliedShuffleOrder,
          isShuffled,
          previousShuffleOrder,
          wasShuffled
        });
        setDisplayedAlphabet([...originalArabicAlphabet]);
        setIsShuffled(false);
        setLastAppliedShuffleOrder(null);
      }
    }
  }, [shuffleOrder, previousShuffleOrder, lastAppliedShuffleOrder, isShuffled]);

  // Shuffle function using Fisher-Yates algorithm
  const shuffleAlphabet = useCallback(() => {
    console.log('[ArabicAlphabet] Shuffle function called - shuffling alphabet', {
      hasOnShuffleOrderChange: !!onShuffleOrderChange,
      timestamp: Date.now()
    });
    const shuffled = [...originalArabicAlphabet];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Create array of original indices in the new shuffled order FIRST
    // This represents which original character is at each position
    const shuffleOrder = shuffled.map(char => char.originalIndex);
    
    // Update state immediately
    setDisplayedAlphabet(shuffled);
    setIsShuffled(true);
    setLastAppliedShuffleOrder(shuffleOrder); // Remember this shuffle order to prevent useEffect from resetting it
    
    console.log('[ArabicAlphabet] Alphabet shuffled successfully', { 
      count: shuffled.length,
      shuffleOrder,
      shuffleOrderLength: shuffleOrder.length
    });
    
    // Notify parent to send shuffle order to peer
    if (onShuffleOrderChange) {
      console.log('[ArabicAlphabet] Calling onShuffleOrderChange with shuffleOrder', { shuffleOrder });
      onShuffleOrderChange(shuffleOrder);
    } else {
      console.error('[ArabicAlphabet] ERROR: onShuffleOrderChange is not defined!');
    }
  }, [onShuffleOrderChange]);

  // Reset to original order
  const resetAlphabet = useCallback(() => {
    console.log('[ArabicAlphabet] Reset function called - resetting to original order', {
      hasOnShuffleOrderChange: !!onShuffleOrderChange,
      timestamp: Date.now()
    });
    
    // Update state immediately
    setDisplayedAlphabet([...originalArabicAlphabet]);
    setIsShuffled(false);
    setLastAppliedShuffleOrder(null); // Clear shuffle order to prevent useEffect from resetting again
    
    console.log('[ArabicAlphabet] Alphabet reset successfully');
    
    // Notify parent to send reset (null) to peer
    if (onShuffleOrderChange) {
      console.log('[ArabicAlphabet] Calling onShuffleOrderChange with null (reset)');
      onShuffleOrderChange(null);
    } else {
      console.error('[ArabicAlphabet] ERROR: onShuffleOrderChange is not defined!');
    }
  }, [onShuffleOrderChange]);

  // Detect mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Speak the pronunciation of a character
  const speakCharacter = useCallback((char) => {
    console.log('[ArabicAlphabet] speakCharacter called', { 
      char: char.isolated, 
      name: char.name,
      hasSpeechSynthesis: 'speechSynthesis' in window,
      isMobile,
      isIOS
    });
    
    if (!('speechSynthesis' in window)) {
      console.warn('[ArabicAlphabet] Speech synthesis not supported in this browser');
      alert('Speech synthesis is not supported in this browser. Please use a modern browser like Chrome, Safari, or Firefox.');
      return;
    }
    
    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    
    // Get voices (may need to wait for them to load, especially on mobile)
    const getVoices = () => {
      return new Promise((resolve) => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          resolve(voices);
        } else {
          // Wait for voices to load (mobile browsers often need this)
          const onVoicesChanged = () => {
            const loadedVoices = window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = null; // Remove handler
            resolve(loadedVoices);
          };
          window.speechSynthesis.onvoiceschanged = onVoicesChanged;
          // Longer timeout for mobile (especially iOS)
          const timeout = isMobile ? 500 : 100;
          setTimeout(() => {
            const fallbackVoices = window.speechSynthesis.getVoices();
            if (fallbackVoices.length > 0) {
              window.speechSynthesis.onvoiceschanged = null;
              resolve(fallbackVoices);
            } else {
              // On mobile, try one more time after a delay
              if (isMobile) {
                setTimeout(() => {
                  const retryVoices = window.speechSynthesis.getVoices();
                  resolve(retryVoices);
                }, 300);
              } else {
                resolve([]); // Return empty array if still no voices
              }
            }
          }, timeout);
        }
      });
    };
    
    getVoices().then((voices) => {
      console.log('[ArabicAlphabet] Available voices:', voices.length, { isMobile, isIOS });
      
      // Create utterance with Arabic text
      const utterance = new SpeechSynthesisUtterance(char.isolated);
      utterance.lang = 'ar-SA'; // Arabic (Saudi Arabia) for better pronunciation
      
      // Adjust settings for mobile (iOS sometimes needs different settings)
      if (isMobile) {
        utterance.rate = 0.9; // Slightly faster on mobile
        utterance.volume = 1;
      } else {
        utterance.rate = 0.8; // Slightly slower for clarity on desktop
        utterance.volume = 1;
      }
      utterance.pitch = 1;
      
      // Try to find Arabic voice - check multiple patterns
      const arabicVoice = voices.find(voice => {
        const lang = voice.lang.toLowerCase();
        const name = voice.name.toLowerCase();
        return lang.startsWith('ar') || 
               lang.includes('arabic') ||
               name.includes('arabic') ||
               name.includes('ar-') ||
               (lang.includes('sa') && name.includes('arab')); // Saudi Arabic
      });
      
      if (arabicVoice) {
        utterance.voice = arabicVoice;
        console.log('[ArabicAlphabet] ✅ Using Arabic voice:', arabicVoice.name, { 
          lang: arabicVoice.lang,
          isMobile 
        });
      } else {
        console.warn('[ArabicAlphabet] ⚠️ No Arabic voice found in', voices.length, 'available voices', { 
          availableLangs: voices.map(v => v.lang).slice(0, 5), // Show first 5 languages
          isMobile 
        });
        
        // Try to find a voice that might work better for Arabic (e.g., multilingual voices)
        const multilingualVoice = voices.find(voice => {
          const name = voice.name.toLowerCase();
          return name.includes('multilingual') || 
                 name.includes('google') ||
                 name.includes('microsoft');
        });
        
        if (multilingualVoice) {
          utterance.voice = multilingualVoice;
          console.log('[ArabicAlphabet] Using multilingual voice as fallback:', multilingualVoice.name);
        } else if (voices.length > 0) {
          // Use first available voice as last resort
          utterance.voice = voices[0];
          console.log('[ArabicAlphabet] Using first available voice:', voices[0].name, voices[0].lang);
        }
        
        // Log all available voices for debugging
        console.log('[ArabicAlphabet] All available voices:', voices.map(v => ({
          name: v.name,
          lang: v.lang,
          default: v.default
        })));
      }
      
      // Add event listeners for debugging
      utterance.onstart = () => {
        console.log('[ArabicAlphabet] Speech started:', char.isolated, { isMobile });
      };
      utterance.onerror = (event) => {
        console.error('[ArabicAlphabet] Speech error:', event.error, char.isolated, { isMobile, isIOS });
        // On mobile, provide user feedback
        if (isMobile) {
          console.warn('[ArabicAlphabet] Speech failed on mobile - this may be due to browser restrictions');
        }
      };
      utterance.onend = () => {
        console.log('[ArabicAlphabet] Speech ended:', char.isolated, { isMobile });
      };
      
      // iOS Safari sometimes needs a small delay before speaking
      // Also ensure we're in a user interaction context (required by some browsers)
      const speak = () => {
        try {
          window.speechSynthesis.speak(utterance);
          console.log('[ArabicAlphabet] Speech synthesis speak() called', { isMobile, isIOS });
        } catch (error) {
          console.error('[ArabicAlphabet] Error calling speak():', error, { isMobile, isIOS });
        }
      };
      
      if (isIOS) {
        setTimeout(speak, 50);
      } else {
        // For mobile browsers, ensure we're in the same event loop as user interaction
        setTimeout(speak, 0);
      }
    }).catch((error) => {
      console.error('[ArabicAlphabet] Error getting voices:', error, { isMobile, isIOS });
      // Fallback: try to speak anyway with default settings
      try {
        const utterance = new SpeechSynthesisUtterance(char.isolated);
        utterance.lang = 'ar-SA';
        utterance.rate = isMobile ? 0.9 : 0.8;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
        console.log('[ArabicAlphabet] Fallback speech attempt', { isMobile, isIOS });
      } catch (fallbackError) {
        console.error('[ArabicAlphabet] Fallback speech also failed:', fallbackError);
      }
    });
  }, [isMobile, isIOS]);

  // Load voices when component mounts
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // Some browsers need voices to be loaded
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
      // Find the whiteboard container
      const container = document.querySelector('.whiteboard-container');
      if (container) {
        setButtonContainer(container);
      }
    }
  }, [isVisible]);

  if (!isVisible) return null;

  // CRITICAL: Fixed pixel dimensions - must match Stage dimensions exactly (1200x800)
  return (
    <>
    <div className="arabic-alphabet-overlay" style={{ 
      position: 'relative', 
      width: '1200px', // FIXED: Must match Stage width
      height: '800px', // FIXED: Must match Stage height
      margin: 0,
      padding: 0,
      boxSizing: 'border-box',
      zIndex: 1, // Below Stage (Stage is z-index 2)
      pointerEvents: 'none' // Grid itself doesn't capture, but children can
    }}>
      {/* Close button and Shuffle button - needs pointer events */}
      <div className="arabic-overlay-close-button">
        <button
          onClick={onClose}
          className="arabic-close-btn"
        >
          ✕ Close
        </button>
      </div>
      
      {/* Shuffle button will be rendered via portal above Stage */}

      {/* Alphabet Grid - HTML content that can be drawn over */}
      {/* CRITICAL: Fixed grid layout - 6 columns of 180px each, 15px gaps, 20px padding */}
      <div className="arabic-alphabet-grid">
        {displayedAlphabet.map((char, index) => (
          <div
            key={`${char.letter}-${index}`}
            className={`arabic-letter-card ${isClickMode ? 'clickable' : 'drawing-mode'}`}
            style={{
              width: '180px', /* FIXED: Match grid column width */
              height: '140px', /* FIXED: Match card height */
              margin: 0,
              padding: '20px', /* FIXED: Match CSS padding */
              boxSizing: 'border-box',
              cursor: isClickMode ? 'pointer' : 'default', // Show pointer cursor only in click mode
              // CRITICAL: In drawing mode, completely disable pointer events so Stage can capture
              pointerEvents: isClickMode ? 'auto' : 'none', // Only capture clicks in click mode
              zIndex: isClickMode ? 3 : 0 // Higher z-index in click mode to be above Stage, lower in drawing mode
            }}
            onMouseDown={(e) => {
              if (!isClickMode) {
                // In drawing mode, let event pass through to Stage
                return;
              }
              console.log('[ArabicAlphabet] Alphabet card mousedown (desktop)', { 
                char: char.isolated, 
                name: char.name,
                target: e.target.className
              });
              e.stopPropagation(); // Prevent event bubbling to Stage
              e.preventDefault(); // Prevent default behavior
              speakCharacter(char);
            }}
            onClick={(e) => {
              if (!isClickMode) return; // Ignore clicks in drawing mode
              console.log('[ArabicAlphabet] Alphabet card clicked (mouse)', { 
                char: char.isolated, 
                name: char.name,
                target: e.target.className
              });
              e.stopPropagation(); // Prevent event bubbling to Stage
              e.preventDefault(); // Prevent default behavior
              // Don't call speakCharacter here if onMouseDown already handled it
            }}
            onTouchStart={(e) => {
              if (!isClickMode) {
                // In drawing mode, let event pass through to Stage
                return;
              }
              console.log('[ArabicAlphabet] Alphabet card touched (mobile)', { 
                char: char.isolated, 
                name: char.name,
                target: e.target.className,
                touches: e.touches?.length
              });
              e.stopPropagation(); // Prevent event bubbling to Stage
              e.preventDefault(); // Prevent default behavior
              speakCharacter(char);
            }}
            onTouchEnd={(e) => {
              if (!isClickMode) return; // Ignore in drawing mode
              // Prevent click event from firing after touch
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <div 
              className="arabic-letter-main" 
              style={{ 
                fontSize: '64px', 
                marginBottom: '8px',
                fontWeight: 'bold',
                fontFamily: 'Arial, Tahoma, "Segoe UI", sans-serif',
                fontFeatureSettings: '"kern" 1',
                textRendering: 'optimizeLegibility',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale'
              }}
            >
              {char.isolated}
            </div>
            <div className="arabic-letter-name" style={{ fontSize: '14px', marginBottom: '4px' }}>
              {char.name}
            </div>
            <div className="arabic-letter-pronunciation" style={{ fontSize: '12px' }}>
              ({char.pronunciation})
            </div>
            <div className="arabic-letter-forms" style={{ fontSize: '11px', marginTop: '8px', gap: '4px' }}>
              <span>I: {char.isolated}</span>
              {char.initial !== char.isolated && <span>In: {char.initial}</span>}
              {char.medial !== char.isolated && <span>M: {char.medial}</span>}
              {char.final !== char.isolated && <span>F: {char.final}</span>}
            </div>
          </div>
        ))}
      </div>
      
      {/* Instructions text */}
      <div className="arabic-instructions">
        You can now draw or write over the Arabic alphabet using the drawing tools above
      </div>
    </div>
    {/* Render control buttons via portal above Stage if container found */}
    {buttonContainer && createPortal(
      <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 10001, display: 'flex', gap: '4px' }}>
        {/* Toggle Mode Button */}
        <div className="arabic-shuffle-button">
          <button
            type="button"
            className="arabic-shuffle-btn"
            onMouseDown={(e) => {
              const newMode = !isClickMode;
              console.log('[ArabicAlphabet] Toggle mode button mousedown', { 
                currentMode: isClickMode ? 'Click Mode' : 'Drawing Mode',
                newMode: newMode ? 'Click Mode' : 'Drawing Mode',
                timestamp: Date.now() 
              });
              e.preventDefault();
              e.stopPropagation();
              setIsClickMode(newMode);
              console.log('[ArabicAlphabet] Mode changed to:', newMode ? 'Click Mode (alphabet clicks work, drawing disabled)' : 'Drawing Mode (drawing works, alphabet clicks disabled)');
              // Notify parent (Whiteboard) about mode change
              if (onModeChange) {
                onModeChange(newMode);
              }
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              const newMode = !isClickMode;
              console.log('[ArabicAlphabet] Toggle mode button touchstart', { 
                currentMode: isClickMode ? 'Click Mode' : 'Drawing Mode',
                newMode: newMode ? 'Click Mode' : 'Drawing Mode',
                timestamp: Date.now() 
              });
              e.preventDefault();
              e.stopPropagation();
              setIsClickMode(newMode);
              console.log('[ArabicAlphabet] Mode changed to:', newMode ? 'Click Mode (alphabet clicks work, drawing disabled)' : 'Drawing Mode (drawing works, alphabet clicks disabled)');
              // Notify parent (Whiteboard) about mode change
              if (onModeChange) {
                onModeChange(newMode);
              }
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            title={isClickMode ? "Click Mode: Click alphabet to speak. Switch to Drawing Mode to draw." : "Drawing Mode: Draw over alphabet. Switch to Click Mode to hear pronunciation."}
            style={{ 
              backgroundColor: isClickMode ? '#28a745' : '#6c757d',
              fontSize: '14px',
              border: isClickMode ? '2px solid #1e7e34' : '2px solid #5a6268'
            }}
          >
            {isClickMode ? '👆' : '✏️'}
          </button>
        </div>
        
        {/* Shuffle Button */}
        <div className="arabic-shuffle-button">
          <button
            type="button"
            className="arabic-shuffle-btn"
            onMouseDown={(e) => {
              const currentShuffled = isShuffled || (shuffleOrder !== null && shuffleOrder !== undefined);
              console.log('[ArabicAlphabet] Shuffle button mousedown (desktop)', { 
                isShuffled, 
                shuffleOrder, 
                currentShuffled,
                timestamp: Date.now() 
              });
              e.preventDefault();
              e.stopPropagation();
              // Handle mouse event immediately for desktop
              if (currentShuffled) {
                console.log('[ArabicAlphabet] Calling resetAlphabet from onMouseDown');
                resetAlphabet();
              } else {
                console.log('[ArabicAlphabet] Calling shuffleAlphabet from onMouseDown');
                shuffleAlphabet();
              }
            }}
            onClick={(e) => {
              // Prevent default click behavior (we handle it in onMouseDown)
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              const currentShuffled = isShuffled || (shuffleOrder !== null && shuffleOrder !== undefined);
              console.log('[ArabicAlphabet] Shuffle button touchstart (mobile)', { 
                isShuffled, 
                shuffleOrder, 
                currentShuffled,
                timestamp: Date.now() 
              });
              e.preventDefault();
              e.stopPropagation();
              // Handle touch event immediately for mobile
              if (currentShuffled) {
                console.log('[ArabicAlphabet] Calling resetAlphabet from onTouchStart');
                resetAlphabet();
              } else {
                console.log('[ArabicAlphabet] Calling shuffleAlphabet from onTouchStart');
                shuffleAlphabet();
              }
            }}
            onTouchEnd={(e) => {
              // Prevent click event from firing after touch
              e.preventDefault();
              e.stopPropagation();
            }}
            title={(isShuffled || (shuffleOrder !== null && shuffleOrder !== undefined)) ? "Reset to original order" : "Shuffle alphabet randomly"}
          >
            {(isShuffled || (shuffleOrder !== null && shuffleOrder !== undefined)) ? '↻' : '🔀'}
          </button>
        </div>
      </div>,
      buttonContainer
    )}
    </>
  );
};

export default ArabicAlphabetOverlay;

