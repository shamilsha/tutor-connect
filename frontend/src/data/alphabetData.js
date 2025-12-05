/**
 * Alphabet Data Files
 * Contains alphabet data for different languages
 */

// Arabic alphabet with isolated, initial, medial, and final forms
export const arabicAlphabet = [
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
].map(char => ({
  ...char,
  displayChar: char.isolated, // Main character to display
  forms: {
    initial: char.initial,
    medial: char.medial,
    final: char.final
  }
}));

// English alphabet (A-Z)
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

// Example: Bengali alphabet (first 10 characters as example)
export const bengaliAlphabet = [
  { letter: 'অ', name: 'O', pronunciation: 'o', originalIndex: 0 },
  { letter: 'আ', name: 'Aa', pronunciation: 'aa', originalIndex: 1 },
  { letter: 'ই', name: 'I', pronunciation: 'i', originalIndex: 2 },
  { letter: 'ঈ', name: 'Ii', pronunciation: 'ii', originalIndex: 3 },
  { letter: 'উ', name: 'U', pronunciation: 'u', originalIndex: 4 },
  { letter: 'ঊ', name: 'Uu', pronunciation: 'uu', originalIndex: 5 },
  { letter: 'ঋ', name: 'Ri', pronunciation: 'ri', originalIndex: 6 },
  { letter: 'এ', name: 'E', pronunciation: 'e', originalIndex: 7 },
  { letter: 'ঐ', name: 'Ai', pronunciation: 'ai', originalIndex: 8 },
  { letter: 'ও', name: 'O', pronunciation: 'o', originalIndex: 9 }
].map(char => ({
  ...char,
  displayChar: char.letter
}));

