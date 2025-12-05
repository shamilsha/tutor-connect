# AlphabetOverlay Component - Reuse Instructions

This document explains how to reuse the generic `AlphabetOverlay` component for different alphabets (English, Bengali, or any other language).

## Overview

The `AlphabetOverlay` component is a generic, reusable component that can display any alphabet with the following features:
- Click-to-speak functionality
- Shuffle/reset alphabet order
- Toggle between click mode and drawing mode
- Peer synchronization for shuffle and mode
- Customizable grid layout and card dimensions

## Steps to Add a New Alphabet (e.g., English)

### Step 1: Create a Wrapper Component

Create a new file: `EnglishAlphabetOverlay.jsx` (or `[Language]AlphabetOverlay.jsx`)

```jsx
import React from 'react';
import AlphabetOverlay from './AlphabetOverlay';
import { englishAlphabet } from '../data/alphabetData';

/**
 * EnglishAlphabetOverlay Component
 * 
 * Wrapper component that uses the generic AlphabetOverlay
 * with English-specific configuration
 */
const EnglishAlphabetOverlay = ({ 
  isVisible, 
  onClose, 
  onShuffleOrderChange, 
  shuffleOrder = null, 
  onModeChange = null 
}) => {
  return (
    <AlphabetOverlay
      isVisible={isVisible}
      onClose={onClose}
      onShuffleOrderChange={onShuffleOrderChange}
      shuffleOrder={shuffleOrder}
      onModeChange={onModeChange}
      alphabetData={englishAlphabet}
      language="en-US"
      gridColumns={7}  // 7 columns for 26 letters (or adjust as needed)
      cardWidth={150}
      cardHeight={120}
      overlayWidth={1200}
      overlayHeight={800}
      showForms={false}  // English doesn't have character forms
      showPronunciation={true}
      instructionsText="Click letters to hear pronunciation, or draw over them"
    />
  );
};

export default EnglishAlphabetOverlay;
```

### Step 2: Add Alphabet Data (if not already in alphabetData.js)

If the alphabet data doesn't exist in `alphabetData.js`, add it:

```javascript
// In frontend/src/data/alphabetData.js
export const englishAlphabet = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
].map((letter, index) => ({
  originalIndex: index,
  displayChar: letter,
  letter: letter,
  name: letter,
  pronunciation: letter.toLowerCase()
}));
```

### Step 3: Add to ContentSelector.jsx

In `ContentSelector.jsx`, add the new alphabet to the subjects array:

```jsx
// In the subjects array
{
  id: 'english',
  name: 'English',
  icon: '🔤',
  chapters: [
    {
      id: 'alphabet',
      name: 'Alphabet',
      topics: [
        { 
          id: 'english-alphabet', 
          name: 'English Alphabet', 
          content: 'Learn and practice the English alphabet.',
          type: 'english-alphabet'
        }
      ]
    }
  ]
}
```

In `handleTopicSelect` function, add:

```jsx
} else if (topic.type === 'english-alphabet') {
  // Handle English alphabet background
  if (onEnglishAlphabetSelect) {
    onEnglishAlphabetSelect();
  }
}
```

Add `onEnglishAlphabetSelect` to the component props:

```jsx
const ContentSelector = ({ 
  onContentSelect, 
  selectedContent, 
  onPdfTopicSelect, 
  onImageTopicSelect, 
  onArabicAlphabetSelect,
  onEnglishAlphabetSelect  // Add this
}) => {
```

### Step 4: Add Handler in DashboardPage.jsx

Add the handler function:

```jsx
const handleEnglishAlphabetSelect = async () => {
  log('INFO', 'DashboardPage', 'English alphabet selected');
  
  // Set selected content
  setSelectedContent({
    id: 'english-alphabet-display',
    name: 'English Alphabet',
    type: 'english-alphabet'
  });
  
  // Set background in whiteboard
  if (whiteboardRef.current && whiteboardRef.current.setEnglishAlphabetBackground) {
    whiteboardRef.current.setEnglishAlphabetBackground(true, true); // true = sendToPeers
  } else {
    log('WARN', 'DashboardPage', 'Whiteboard ref or setEnglishAlphabetBackground not available');
  }
};
```

Pass it to `ContentSelector`:

```jsx
<ContentSelector
  // ... other props
  onEnglishAlphabetSelect={handleEnglishAlphabetSelect}
/>
```

### Step 5: Add to Whiteboard.jsx

#### 5.1 Import the component:

```jsx
import EnglishAlphabetOverlay from './EnglishAlphabetOverlay';
```

#### 5.2 Add state (if needed for shuffle/mode):

```jsx
const [englishAlphabetShuffleOrder, setEnglishAlphabetShuffleOrder] = useState(null);
const [isEnglishAlphabetClickMode, setIsEnglishAlphabetClickMode] = useState(true);
```

#### 5.3 Add the setter function:

```jsx
const setEnglishAlphabetBackground = useCallback((show, sendToPeers = false) => {
  log('INFO', 'Whiteboard', 'Setting English alphabet background', { show });
  if (show) {
    clearAllDrawings();
    setBackgroundType('english-alphabet');
    setBackgroundFile('english-alphabet');
    setBackgroundDimensions({ width: 1200, height: 800 });
    
    if (sendToPeers && webRTCProviderRef.current && selectedPeerRef.current) {
      const englishAlphabetMessage = {
        action: 'background',
        background: {
          file: 'english-alphabet',
          type: 'english-alphabet',
          dimensions: { width: 1200, height: 800 }
        },
        timestamp: Date.now()
      };
      webRTCProviderRef.current.sendWhiteboardMessage(selectedPeerRef.current, englishAlphabetMessage);
    }
  } else {
    setBackgroundFile(null);
    setBackgroundType(null);
  }
}, [webRTCProvider, selectedPeer]);
```

#### 5.4 Expose via useImperativeHandle:

```jsx
useImperativeHandle(ref, () => ({
  // ... other functions
  setEnglishAlphabetBackground: setEnglishAlphabetBackground,
}));
```

#### 5.5 Handle in handleWhiteboardMessage:

```jsx
case 'background':
  if (data.background) {
    // ... existing logic
    } else if (data.background.type === 'english-alphabet') {
      setBackgroundDirectly('english-alphabet', 'english-alphabet', data.background.dimensions);
    }
  }
  break;
```

#### 5.6 Update calculateContainerDimensions (if needed):

```jsx
} else if (backgroundType === 'english-alphabet') {
  finalWidth = backgroundDimensions.width > 0 ? backgroundDimensions.width : 1200;
  finalHeight = backgroundDimensions.height > 0 ? backgroundDimensions.height : 800;
  source = 'english-alphabet-fixed';
}
```

#### 5.7 Render the component:

In the background rendering section:

```jsx
) : backgroundType === 'english-alphabet' ? (
  <div style={{ 
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%', 
    height: '100%',
    zIndex: isEnglishAlphabetClickMode ? 3 : 1,
    pointerEvents: isEnglishAlphabetClickMode ? 'auto' : 'none'
  }}>
    <EnglishAlphabetOverlay
      isVisible={true}
      onClose={() => {
        setBackgroundFile(null);
        setBackgroundType(null);
        setEnglishAlphabetShuffleOrder(null);
        setIsEnglishAlphabetClickMode(true);
      }}
      shuffleOrder={englishAlphabetShuffleOrder}
      onShuffleOrderChange={(shuffleOrder) => {
        setEnglishAlphabetShuffleOrder(shuffleOrder);
        sendWhiteboardMsg('englishAlphabetShuffle', { shuffleOrder });
      }}
      onModeChange={(isClickMode) => {
        setIsEnglishAlphabetClickMode(isClickMode);
      }}
    />
  </div>
```

#### 5.8 Update handleMouseDown (if needed):

Add check for English alphabet click mode (similar to Arabic):

```jsx
if (backgroundType === 'english-alphabet' && isEnglishAlphabetClickMode) {
  if (correctedX >= 0 && correctedX <= 1200 && correctedY >= 0 && correctedY <= 800) {
    return; // Don't allow drawing over alphabet area in click mode
  }
}
```

#### 5.9 Update stageStyle (if needed):

```jsx
const pointerEvents = (backgroundType === 'english-alphabet' && isEnglishAlphabetClickMode) 
  ? 'none' 
  : 'all';
```

## Configuration Options

### AlphabetOverlay Props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `alphabetData` | Array | Required | Array of character objects with `originalIndex`, `displayChar`, etc. |
| `language` | String | 'en-US' | Language code for TTS (e.g., 'en-US', 'ar-SA', 'bn-BD') |
| `gridColumns` | Number | 6 | Number of columns in the grid |
| `cardWidth` | Number | 180 | Width of each card in pixels |
| `cardHeight` | Number | 140 | Height of each card in pixels |
| `overlayWidth` | Number | 1200 | Width of overlay in pixels |
| `overlayHeight` | Number | 800 | Height of overlay in pixels |
| `showForms` | Boolean | false | Whether to show character forms (for Arabic) |
| `showPronunciation` | Boolean | true | Whether to show pronunciation guide |
| `instructionsText` | String | null | Custom instructions text |

### Character Data Structure:

Each character in `alphabetData` should have:

```javascript
{
  originalIndex: 0,        // Required: for shuffle synchronization
  displayChar: 'A',        // Required: main character to display
  letter: 'A',             // Optional: alternative field name
  name: 'A',               // Optional: character name
  pronunciation: 'a',      // Optional: pronunciation guide
  forms: {                 // Optional: for languages with character forms
    initial: 'ا',
    medial: 'ـا',
    final: 'ا'
  }
}
```

## Examples

### Arabic Alphabet (Current Implementation)
- 28 characters
- 6 columns
- Shows forms (initial, medial, final)
- Language: 'ar-SA'

### English Alphabet
- 26 letters
- 7 columns (or 13 for 2 rows)
- No forms
- Language: 'en-US'

### Bengali Alphabet
- Variable characters
- Adjust gridColumns based on count
- No forms
- Language: 'bn-BD'

## Tips

1. **Grid Layout**: Calculate `gridColumns` based on total characters:
   - For 26 letters: 7 columns = ~4 rows, or 13 columns = 2 rows
   - Adjust `cardWidth` and `cardHeight` to fit your layout

2. **Language Code**: Use proper BCP 47 language tags:
   - English: 'en-US' or 'en-GB'
   - Arabic: 'ar-SA' or 'ar-EG'
   - Bengali: 'bn-BD' or 'bn-IN'

3. **Card Sizes**: Smaller cards may be needed for larger alphabets to fit on screen

4. **Peer Synchronization**: The component automatically handles shuffle order and mode synchronization via WebRTC

5. **Touch Handling**: Mobile touch events are automatically handled - no additional code needed

## Testing Checklist

- [ ] Alphabet displays correctly
- [ ] Click-to-speak works
- [ ] Shuffle button works
- [ ] Toggle mode works (click ↔ drawing)
- [ ] Drawing works in drawing mode
- [ ] Scrolling is disabled in drawing mode (mobile)
- [ ] Scrolling works in click mode (mobile)
- [ ] Peer synchronization works (shuffle and mode)
- [ ] Alphabet loads on both peers when selected

